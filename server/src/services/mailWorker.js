import prisma from "../config/prisma.js";
import {
  getMailMode,
  isSmtpConfigured,
  sendEmail,
  getSmtpSummary,
} from "../config/mail.js";

// Sends the emails waiting in the email_outbox table.
//
// Why a queue: an action (approving a claim) must never fail or slow down because
// the mail server is slow, down, or not set up yet. The email is saved first and
// sent a moment later; if sending fails it is retried.
//
// The worker runs inside the server (startMailWorker, called from server.js). To
// run it from a scheduler instead, use `npm run send:emails`. Several copies can
// run at once safely: each takes its own emails.

// ---------------------------------------------------------------------------
// Settings you may want to change
// ---------------------------------------------------------------------------
const CHECK_EVERY_SECONDS = 30; // how often the server looks for waiting emails
const EMAILS_PER_BATCH = 10;
const MAX_EMAILS_PER_RUN = 100; // stops one run from going on forever

const MAX_ATTEMPTS = 5; // an email that keeps failing is given up on after this many tries
// Wait before try 2, 3, 4, 5 (minutes).
const RETRY_AFTER_MINUTES = [1, 5, 30, 120];

// A wrong SMTP login is a setup problem, not the email's fault: try again later
// without using up the email's attempts.
const SETUP_PROBLEM_RETRY_MINUTES = 15;

// A status email older than this is stale ("your claim was received" three days
// late is confusing), so it is dropped instead of sent.
const MAX_EMAIL_AGE_HOURS = 72;

// An email stuck in "sending" this long means the server died mid-send.
const STUCK_SENDING_MINUTES = 10;

// Old records are deleted once an hour.
const KEEP_SENT_EMAILS_DAYS = 30;
const KEEP_FAILED_EMAILS_DAYS = 90;
const KEEP_READ_NOTIFICATIONS_DAYS = 90;
const KEEP_ANY_NOTIFICATION_DAYS = 365;
// ---------------------------------------------------------------------------

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

let timer = null;
let running = false;
let started = false;
let lastPrune = 0;
let warnedNotConfigured = false;

const clipError = (error) => String(error?.message ?? error).replace(/\s+/g, " ").slice(0, 300);

// Takes up to `limit` due emails for this worker and marks them "sending" in the
// same statement. SKIP LOCKED means another worker's emails are simply skipped.
const takeBatch = (limit) => prisma.$queryRaw`
  UPDATE email_outbox
  SET status = 'sending', attempts = attempts + 1, updated_at = now()
  WHERE id IN (
    SELECT id FROM email_outbox
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY next_attempt_at, created_at
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id, to_email AS "toEmail", type, subject, text_body AS "textBody",
            html_body AS "htmlBody", attempts`;

// MAIL_MODE=log: show the email in the console instead of sending it.
const logEmail = (email) => {
  console.log(
    `\n[mail:log] To: ${email.toEmail}\n[mail:log] Subject: ${email.subject}\n${email.textBody}\n`
  );
};

const deliver = async (email) => {
  if (getMailMode() === "log") {
    logEmail(email);
    return;
  }

  await sendEmail({
    to: email.toEmail,
    subject: email.subject,
    text: email.textBody,
    html: email.htmlBody,
  });
};

// A login or access problem on OUR side (wrong password, blocked account).
const isSetupProblem = (error) =>
  error?.code === "EAUTH" || [530, 534, 535].includes(error?.responseCode);

// The mail server says this address or message can never work (e.g. 550 no such
// mailbox). Retrying would only repeat the refusal.
const isPermanentRefusal = (error) =>
  error?.responseCode >= 500 && error?.responseCode < 600 && !isSetupProblem(error);

const recordFailure = async (email, error) => {
  const lastError = clipError(error);

  if (isSetupProblem(error)) {
    console.error(
      "Email login was refused by the mail server. Check SMTP_USER and SMTP_PASSWORD in .env. " +
        `Queued emails will be tried again in ${SETUP_PROBLEM_RETRY_MINUTES} minutes.`
    );

    await prisma.emailOutbox.update({
      where: { id: email.id },
      data: {
        status: "pending",
        attempts: Math.max(email.attempts - 1, 0),
        nextAttemptAt: new Date(Date.now() + SETUP_PROBLEM_RETRY_MINUTES * MINUTE),
        lastError,
      },
    });
    return "deferred";
  }

  if (isPermanentRefusal(error) || email.attempts >= MAX_ATTEMPTS) {
    await prisma.emailOutbox.update({
      where: { id: email.id },
      data: { status: "failed", lastError },
    });
    return "failed";
  }

  const wait = RETRY_AFTER_MINUTES[Math.min(email.attempts - 1, RETRY_AFTER_MINUTES.length - 1)];

  await prisma.emailOutbox.update({
    where: { id: email.id },
    data: {
      status: "pending",
      nextAttemptAt: new Date(Date.now() + wait * MINUTE),
      lastError,
    },
  });
  return "retry";
};

const pruneOldRecords = async () => {
  const ago = (ms) => new Date(Date.now() - ms);

  await prisma.emailOutbox.deleteMany({
    where: { status: { in: ["sent", "expired"] }, createdAt: { lt: ago(KEEP_SENT_EMAILS_DAYS * DAY) } },
  });
  await prisma.emailOutbox.deleteMany({
    where: { status: "failed", createdAt: { lt: ago(KEEP_FAILED_EMAILS_DAYS * DAY) } },
  });
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { readAt: { not: null }, createdAt: { lt: ago(KEEP_READ_NOTIFICATIONS_DAYS * DAY) } },
        { createdAt: { lt: ago(KEEP_ANY_NOTIFICATION_DAYS * DAY) } },
      ],
    },
  });
};

// One pass over the queue. Returns what happened, for the scripts and tests.
export const processOutbox = async () => {
  const result = { sent: 0, retry: 0, failed: 0, deferred: 0, expired: 0, skipped: false };
  const mode = getMailMode();

  if (mode === "off" || (mode === "smtp" && !isSmtpConfigured())) {
    // Emails wait in the queue until email is set up; nothing is lost.
    if (mode === "smtp" && !warnedNotConfigured) {
      warnedNotConfigured = true;
      console.warn(
        "Email is not set up (SMTP_HOST is empty), so emails are waiting in the queue. " +
          "Set the SMTP_* values in .env, or MAIL_MODE=log to print them in this console."
      );
    }
    result.skipped = true;
    return result;
  }

  // Put back emails a crashed worker left half-sent.
  await prisma.emailOutbox.updateMany({
    where: { status: "sending", updatedAt: { lt: new Date(Date.now() - STUCK_SENDING_MINUTES * MINUTE) } },
    data: { status: "pending" },
  });

  const expired = await prisma.emailOutbox.updateMany({
    where: { status: "pending", createdAt: { lt: new Date(Date.now() - MAX_EMAIL_AGE_HOURS * HOUR) } },
    data: { status: "expired", lastError: "Too old to send" },
  });
  result.expired = expired.count;

  let handled = 0;

  while (handled < MAX_EMAILS_PER_RUN) {
    const batch = await takeBatch(EMAILS_PER_BATCH);
    if (batch.length === 0) break;

    for (const email of batch) {
      handled += 1;

      try {
        await deliver(email);

        await prisma.emailOutbox.update({
          where: { id: email.id },
          data: { status: "sent", sentAt: new Date(), lastError: null },
        });
        result.sent += 1;
      } catch (error) {
        result[await recordFailure(email, error)] += 1;
      }
    }
  }

  if (Date.now() - lastPrune > HOUR) {
    lastPrune = Date.now();
    await pruneOldRecords();
  }

  return result;
};

const tick = async () => {
  if (running) return;
  running = true;

  try {
    await processOutbox();
  } catch (error) {
    console.error("Email worker error:", error.message);
  } finally {
    running = false;
  }
};

// Called once from server.js. Starts looking for waiting emails every
// CHECK_EVERY_SECONDS seconds.
export const startMailWorker = () => {
  if (started) return;
  if (process.env.MAIL_WORKER === "off") {
    console.log("Email worker is switched off (MAIL_WORKER=off).");
    return;
  }

  started = true;
  const mode = getMailMode();

  if (mode === "smtp" && isSmtpConfigured()) {
    const smtp = getSmtpSummary();
    console.log(`Email: sending through ${smtp.host}:${smtp.port} as ${smtp.from}`);
  } else if (mode === "log") {
    console.log("Email: log mode, emails are printed here instead of being sent.");
  } else if (mode === "off") {
    console.log("Email: off, emails are queued but not sent.");
  } else {
    console.log("Email: not set up yet, emails wait in the queue (see README, section Email).");
  }

  timer = setInterval(tick, CHECK_EVERY_SECONDS * 1000);
  timer.unref(); // never keeps the server alive by itself
  setTimeout(tick, 2000).unref();
};

export const stopMailWorker = () => {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
};

// "Something was just queued": send soon instead of waiting for the next check.
export const kickMailWorker = () => {
  if (started) setTimeout(tick, 200).unref();
};
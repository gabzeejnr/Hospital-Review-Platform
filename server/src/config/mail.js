import "dotenv/config";
import nodemailer from "nodemailer";

// Email settings, all read from .env so nothing here needs editing when the
// domain and mail account exist. See "Email" in the README for what to put where.
//
//   MAIL_MODE            smtp (default)  send through your SMTP server
//                        log             print emails in the server console instead
//                                        of sending (handy before a domain exists)
//                        off             send nothing; emails stay queued
//   SMTP_HOST            e.g. smtp.yourprovider.com        (required for smtp mode)
//   SMTP_PORT            587 (default) or 465
//   SMTP_SECURE          true for port 465, otherwise leave unset (587 upgrades itself)
//   SMTP_USER            the mailbox login, often the full address
//   SMTP_PASSWORD        its password, or the provider's SMTP key
//   SMTP_REQUIRE_TLS     true (default): refuse to send the login unencrypted
//   MAIL_FROM_ADDRESS    default noreply@hospitalreviewplatform.com
//   MAIL_FROM_NAME       default: APP_NAME
//   MAIL_REPLY_TO        optional: where replies should go (e.g. support@...)
//   SUPPORT_EMAIL        optional: shown in emails as the place to ask for help
//   APP_NAME             default Dreel
//   FRONTEND_URL         the website's address, used to build links in emails

export const getAppName = () => process.env.APP_NAME || "Dreel";

// FRONTEND_URL may hold several comma-separated addresses (it also feeds CORS);
// the first one is the main site.
export const getAppUrl = () =>
  (process.env.FRONTEND_URL || "http://localhost:5173").split(",")[0].trim().replace(/\/+$/, "");

export const getSupportEmail = () => process.env.SUPPORT_EMAIL || null;

export const getMailMode = () => {
  const mode = (process.env.MAIL_MODE || "smtp").trim().toLowerCase();
  return ["smtp", "log", "off"].includes(mode) ? mode : "smtp";
};

export const isSmtpConfigured = () => Boolean(process.env.SMTP_HOST);

const getSender = () => ({
  name: process.env.MAIL_FROM_NAME || getAppName(),
  address: process.env.MAIL_FROM_ADDRESS || "noreply@hospitalreviewplatform.com",
});

export const getSmtpSummary = () => {
  const port = Number(process.env.SMTP_PORT) || 587;

  return {
    host: process.env.SMTP_HOST || "(not set)",
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    user: process.env.SMTP_USER || "(none)",
    passwordSet: Boolean(process.env.SMTP_PASSWORD),
    from: getSender().address,
  };
};

let transport;

const getTransport = () => {
  if (transport) return transport;

  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    // Port 587 starts unencrypted and upgrades. Requiring the upgrade stops the
    // password ever travelling in the clear if the server does not offer it.
    requireTLS: !secure && process.env.SMTP_REQUIRE_TLS !== "false",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return transport;
};

// Checks the host, port and login WITHOUT sending anything. Throws on a problem.
export const verifySmtpConnection = () => getTransport().verify();

// Sends one email through SMTP. Throws if the server refuses or cannot be reached.
export const sendEmail = async ({ to, subject, text, html }) => {
  const info = await getTransport().sendMail({
    from: getSender(),
    to,
    replyTo: process.env.MAIL_REPLY_TO || undefined,
    subject,
    text,
    html,
    // Tells mail programs this is automatic, so they do not auto-reply to it.
    headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
  });

  return info.messageId;
};

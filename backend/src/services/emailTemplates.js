import { getAppName, getAppUrl, getSupportEmail } from "../config/mail.js";

// What each notification says, as an in-app message AND an email. One place to
// change wording.
//
// Every value that came from a person (hospital names, moderators' reasons) is
// escaped before it goes into the HTML, so none of it can inject markup.

// ---------------------------------------------------------------------------
// Settings you may want to change
// ---------------------------------------------------------------------------
// Pages the buttons in emails open, relative to FRONTEND_URL. Change these to
// match your frontend's routes.
const PATHS = {
  claims: "/account/claims",
  myHospitals: "/account/hospitals",
  myReviews: "/account/reviews",
  settings: "/account/notification-settings",
  home: "/",
};

// Which setting in notification_preferences controls each kind of notification.
export const CATEGORY_BY_PREFIX = {
  claim: "claimUpdates",
  verification: "claimUpdates",
  hospital: "claimUpdates",
  review: "reviewUpdates",
  report: "reviewUpdates",
  response: "hospitalResponses",
};

// A few types follow a different setting from their prefix. The two below tell a
// hospital's representative what happened to THEIR response, which belongs with
// their other hospital updates, not with "a hospital replied to my review".
const CATEGORY_BY_TYPE = {
  "response.approved": "claimUpdates",
  "response.rejected": "claimUpdates",
};
// ---------------------------------------------------------------------------

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// A subject must be one line: line breaks in it could be used to inject headers.
const oneLine = (value) => String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();

const clip = (value, max) => {
  const text = oneLine(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
};

// ---------------------------------------------------------------------------
// The messages. `v` holds hospitalName and, where relevant, reason.
// ---------------------------------------------------------------------------
const MESSAGES = {
  "claim.submitted": (v) => ({
    title: "We received your claim",
    paragraphs: [
      `Thank you. We received your claim for ${v.hospitalName}.`,
      "A moderator will review it, and we will let you know the outcome.",
    ],
    cta: { label: "View your claims", path: PATHS.claims },
  }),
  "claim.approved": (v) => ({
    title: `Your claim for ${v.hospitalName} was approved`,
    paragraphs: [
      `You are now a representative of ${v.hospitalName}.`,
      "You can add the hospital's social links and ask for it to be verified.",
    ],
    cta: { label: "Open your hospitals", path: PATHS.myHospitals },
  }),
  "claim.rejected": (v) => ({
    title: `Your claim for ${v.hospitalName} was not approved`,
    paragraphs: [
      `A moderator reviewed your claim for ${v.hospitalName} and could not approve it.`,
      `Reason given: ${v.reason}`,
      "If you think this is a mistake, you can submit a new claim with more details or documents.",
    ],
    cta: { label: "View your claims", path: PATHS.claims },
  }),
  "claim.superseded": (v) => ({
    title: `Your claim for ${v.hospitalName} was closed`,
    paragraphs: [
      `Another claim for ${v.hospitalName} was approved, so yours was closed.`,
      "If you believe the wrong person was approved, please contact support.",
    ],
    cta: { label: "View your claims", path: PATHS.claims },
  }),
  "verification.submitted": (v) => ({
    title: `We received your verification request for ${v.hospitalName}`,
    paragraphs: [
      `Thank you. A moderator will check the details and documents you sent for ${v.hospitalName}.`,
      "We will let you know the outcome.",
    ],
    cta: { label: "Open your hospitals", path: PATHS.myHospitals },
  }),
  "verification.approved": (v) => ({
    title: `${v.hospitalName} is now verified`,
    paragraphs: [
      `Good news: ${v.hospitalName} has been verified.`,
      "The verified badge now shows on its page.",
    ],
    cta: { label: "Open your hospitals", path: PATHS.myHospitals },
  }),
  "verification.rejected": (v) => ({
    title: `Verification for ${v.hospitalName} was not approved`,
    paragraphs: [
      `A moderator reviewed your verification request for ${v.hospitalName} and could not approve it.`,
      `Reason given: ${v.reason}`,
      "You can submit a new request with corrected details or documents.",
    ],
    cta: { label: "Open your hospitals", path: PATHS.myHospitals },
  }),
  "hospital.suspended": (v) => ({
    title: `${v.hospitalName} has been suspended`,
    paragraphs: [
      `An administrator suspended ${v.hospitalName} on ${getAppName()}.`,
      "While it is suspended you cannot edit it or request verification.",
      getSupportEmail()
        ? `If you have questions, contact ${getSupportEmail()}.`
        : "If you have questions, please contact support.",
    ],
    cta: { label: "Open your hospitals", path: PATHS.myHospitals },
  }),
  "hospital.restored": (v) => ({
    title: `${v.hospitalName} has been restored`,
    paragraphs: [
      `${v.hospitalName} is active on ${getAppName()} again.`,
      "You can edit it and use its tools as before.",
    ],
    cta: { label: "Open your hospitals", path: PATHS.myHospitals },
  }),
  "review.published": (v) => ({
    title: `Your review of ${v.hospitalName} is now published`,
    paragraphs: [
      `Thank you for sharing your experience. Your review of ${v.hospitalName} has been approved and is now visible to others.`,
    ],
    cta: { label: "View your reviews", path: PATHS.myReviews },
  }),
  "review.rejected": (v) => ({
    title: `Your review of ${v.hospitalName} was not published`,
    paragraphs: [
      `A moderator reviewed your review of ${v.hospitalName} and could not publish it.`,
      `Reason given: ${v.reason}`,
      "You can edit your review, and it will be checked again.",
    ],
    cta: { label: "View your reviews", path: PATHS.myReviews },
  }),
};

const EXTRA_MESSAGES = {
  "response.received": (v) => ({
    title: `${v.hospitalName} responded to your review`,
    paragraphs: [
      `A representative of ${v.hospitalName} replied to your review.`,
      "You can read the reply on the hospital's page.",
    ],
    cta: { label: "View your reviews", path: PATHS.myReviews },
  }),
  "response.approved": (v) => ({
    title: `Your response for ${v.hospitalName} is now published`,
    paragraphs: [`Your reply to a review of ${v.hospitalName} has been approved and is now visible to everyone.`],
    cta: { label: "Open your hospitals", path: PATHS.myHospitals },
  }),
  "response.rejected": (v) => ({
    title: `Your response for ${v.hospitalName} was not published`,
    paragraphs: [
      `A moderator reviewed your reply to a review of ${v.hospitalName} and could not publish it.`,
      `Reason given: ${v.reason}`,
      "You can edit the response, and it will be checked again.",
    ],
    cta: { label: "Open your hospitals", path: PATHS.myHospitals },
  }),
  "report.upheld": (v) => ({
    title: "We removed the review you reported",
    paragraphs: [
      `Thank you for your report about a review of ${v.hospitalName}. A moderator checked it and the review has been removed.`,
    ],
    cta: { label: `Visit ${getAppName()}`, path: PATHS.home },
  }),
  "report.dismissed": (v) => ({
    title: "We reviewed your report",
    paragraphs: [
      `A moderator reviewed your report about a review of ${v.hospitalName} and decided that it follows the community guidelines, so it stays published.`,
      "Thank you for helping keep the platform trustworthy.",
    ],
    cta: { label: `Visit ${getAppName()}`, path: PATHS.home },
  }),
};
// Notices about a person's own account. Always sent (see notification.service.js).
const ACCOUNT_MESSAGES = {
  "account.role_changed": (v) => ({
    title: `Your role is now ${v.roleLabel}`,
    paragraphs: [
      `An administrator changed your role on ${getAppName()} from ${v.previousRoleLabel} to ${v.roleLabel}.`,
      `Reason given: ${v.reason}`,
      "If you did not expect this, please contact support.",
    ],
    cta: { label: `Visit ${getAppName()}`, path: PATHS.home },
  }),
  "account.suspended": (v) => ({
    title: "Your account has been suspended",
    paragraphs: [
      `An administrator suspended your ${getAppName()} account, so you cannot sign in or use it for now.`,
      `Reason given: ${v.reason}`,
      getSupportEmail()
        ? `If you think this is a mistake, contact ${getSupportEmail()}.`
        : "If you think this is a mistake, please contact support.",
    ],
    cta: { label: `Visit ${getAppName()}`, path: PATHS.home },
  }),
  "account.reactivated": () => ({
    title: "Your account has been reactivated",
    paragraphs: [
      `An administrator reactivated your ${getAppName()} account.`,
      "You can sign in again.",
    ],
    cta: { label: "Sign in", path: PATHS.home },
  }),
};
Object.assign(MESSAGES, EXTRA_MESSAGES, ACCOUNT_MESSAGES);

export const NOTIFICATION_TYPES = Object.keys(MESSAGES);

export const categoryFor = (type) =>
  CATEGORY_BY_TYPE[type] ?? CATEGORY_BY_PREFIX[type.split(".")[0]] ?? null;

// ---------------------------------------------------------------------------
// Building the email
// ---------------------------------------------------------------------------
const renderHtml = ({ appName, title, paragraphs, ctaUrl, ctaLabel, settingsUrl }) => `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:28px;">
        <tr><td style="font-size:14px;color:#52606d;padding-bottom:16px;">${escapeHtml(appName)}</td></tr>
        <tr><td style="font-size:20px;font-weight:bold;line-height:1.3;padding-bottom:16px;">${escapeHtml(title)}</td></tr>
        ${paragraphs
          .map((p) => `<tr><td style="font-size:15px;line-height:1.6;padding-bottom:12px;">${escapeHtml(p)}</td></tr>`)
          .join("\n        ")}
        <tr><td style="padding:12px 0 20px;"><a href="${escapeHtml(ctaUrl)}" style="background:#0b7285;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:15px;display:inline-block;">${escapeHtml(ctaLabel)}</a></td></tr>
        <tr><td style="font-size:12px;color:#7b8794;line-height:1.5;border-top:1px solid #e4e7eb;padding-top:14px;">
          You are receiving this because of your notification settings on ${escapeHtml(appName)}.
          <a href="${escapeHtml(settingsUrl)}" style="color:#7b8794;">Change what you receive</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// Returns everything needed for the in-app notification and the email, or null
// for an unknown type.
export const buildMessage = (type, values = {}) => {
  const make = MESSAGES[type];
  if (!make) return null;

  const v = {
    hospitalName: clip(values.hospitalName ?? "this hospital", 150),
    reason: clip(values.reason ?? "No reason was given.", 500),
    roleLabel: clip(values.roleLabel ?? "", 50),
    previousRoleLabel: clip(values.previousRoleLabel ?? "", 50),
  };

  const { title, paragraphs, cta } = make(v);
  const appName = getAppName();
  const url = (path) => `${getAppUrl()}${path}`;
  const ctaUrl = url(cta.path);
  const settingsUrl = url(PATHS.settings);

  return {
    // In-app notification
    title: clip(title, 150),
    body: clip(paragraphs.join(" "), 1000),
    // Email
    email: {
      subject: clip(`${title}`, 200),
      text: [
        title,
        "",
        ...paragraphs.flatMap((p) => [p, ""]),
        `${cta.label}: ${ctaUrl}`,
        "",
        `You are receiving this because of your notification settings on ${appName}.`,
        `Change what you receive: ${settingsUrl}`,
      ].join("\n"),
      html: renderHtml({ appName, title, paragraphs, ctaUrl, ctaLabel: cta.label, settingsUrl }),
    },
  };
};
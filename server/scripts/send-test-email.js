import "dotenv/config";
import {
  getMailMode,
  isSmtpConfigured,
  getSmtpSummary,
  verifySmtpConnection,
  sendEmail,
  getAppName,
} from "../src/config/mail.js";

// Checks your email settings and sends one test message:
//
//     npm run test:email -- you@example.com
//
// Run it after filling in the SMTP_* values in .env. It never prints the password.

const to = process.argv[2];

if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error("Give the address to send the test to:  npm run test:email -- you@example.com");
  process.exit(1);
}

const mode = getMailMode();

if (mode !== "smtp") {
  console.error(`MAIL_MODE is "${mode}", so nothing is sent through SMTP. Remove it (or set it to smtp) to test your server.`);
  process.exit(1);
}

if (!isSmtpConfigured()) {
  console.error("SMTP_HOST is empty. Fill in the SMTP_* values in .env first (see .env.example).");
  process.exit(1);
}

const smtp = getSmtpSummary();
console.log(`Server:   ${smtp.host}:${smtp.port} (${smtp.secure ? "encrypted from the start" : "upgrades to encrypted"})`);
console.log(`Login:    ${smtp.user}  (password ${smtp.passwordSet ? "is set" : "is NOT set"})`);
console.log(`Sending from: ${smtp.from}\n`);

const explain = (error) => {
  if (error.code === "EAUTH" || [530, 534, 535].includes(error.responseCode)) {
    return "The server refused the login. Check SMTP_USER and SMTP_PASSWORD (many providers need an app password or SMTP key, not your normal password).";
  }
  if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ESOCKET", "ECONNECTION"].includes(error.code)) {
    return "Could not reach the server. Check SMTP_HOST and SMTP_PORT, and that your network or host allows outgoing mail on that port.";
  }
  if (error.responseCode >= 500) {
    return "The server accepted the login but refused the message. The From address (MAIL_FROM_ADDRESS) usually has to belong to a domain you have verified with your provider.";
  }
  return null;
};

try {
  await verifySmtpConnection();
  console.log("Connection and login: OK");

  await sendEmail({
    to,
    subject: `${getAppName()} test email`,
    text: `This is a test email from ${getAppName()}. If you can read it, your email settings work.`,
    html: `<p>This is a test email from <strong>${getAppName()}</strong>. If you can read it, your email settings work.</p>`,
  });

  console.log(`Test email sent to ${to}. Check the inbox (and the spam folder).`);
} catch (error) {
  console.error(`\nFailed: ${error.message}`);
  const hint = explain(error);
  if (hint) console.error(hint);
  process.exitCode = 1;
}
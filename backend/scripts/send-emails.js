import prisma from "../src/config/prisma.js";
import { processOutbox } from "../src/services/mailWorker.js";

// Sends the emails waiting in the queue once, then exits:
//
//     npm run send:emails
//
// The server already does this by itself every 30 seconds. Use this script if
// your host puts the server to sleep, by running it every few minutes from a
// scheduler (cron job, scheduled GitHub Action, and so on).

try {
  const result = await processOutbox();

  if (result.skipped) {
    console.log("Nothing sent: email is off or not set up (see the warning above, or README section Email).");
  } else {
    console.log(
      `Sent: ${result.sent}. Will retry: ${result.retry}. Waiting for login fix: ${result.deferred}. ` +
        `Failed for good: ${result.failed}. Too old, dropped: ${result.expired}.`
    );
  }
} catch (error) {
  console.error("Sending emails failed:", error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
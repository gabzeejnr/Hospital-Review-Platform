import prisma from "../src/config/prisma.js";
import { removeObjects } from "../src/services/documentStorage.service.js";
import { UNCONFIRMED_UPLOAD_HOURS } from "../src/utils/documents.js";

// Retention job for uploaded proof documents. Run it once a day:
//
//     npm run purge:documents
//
// (a cron job on your host, a scheduled GitHub Action, or by hand). It:
//   1. starts the clock on uploads nobody confirmed within UNCONFIRMED_UPLOAD_HOURS,
//   2. deletes every file whose delete_after time has passed from private storage,
//   3. keeps the database row, marked "purged", as a record that it existed.
// It is safe to run twice, or to stop halfway: it only marks a row purged after
// the file is really gone.

const BATCH = 100;

const run = async () => {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - UNCONFIRMED_UPLOAD_HOURS * 60 * 60 * 1000);

  const stale = await prisma.hospitalDocument.updateMany({
    where: { status: "awaiting_upload", createdAt: { lt: staleBefore }, deleteAfter: null },
    data: { deleteAfter: now },
  });

  let purged = 0;

  for (;;) {
    const due = await prisma.hospitalDocument.findMany({
      where: { status: { not: "purged" }, deleteAfter: { lte: now } },
      select: { id: true, storagePath: true },
      orderBy: { deleteAfter: "asc" },
      take: BATCH,
    });

    if (due.length === 0) break;

    await removeObjects(due.map((document) => document.storagePath));

    await prisma.hospitalDocument.updateMany({
      where: { id: { in: due.map((document) => document.id) } },
      data: { status: "purged", purgedAt: new Date() },
    });

    purged += due.length;
  }

  console.log(`Unconfirmed uploads expired: ${stale.count}. Documents purged: ${purged}.`);
};

try {
  await run();
} catch (error) {
  console.error("Document purge failed:", error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
import prisma from "../src/config/prisma.js";
import { recordModerationAction } from "../src/services/moderationHistory.service.js";
import { recordSecurityEvent } from "../src/services/audit.service.js";
import { notify } from "../src/services/notification.service.js";
import { ROLE_LABELS } from "../src/utils/roles.js";

// Makes the FIRST administrator, without writing SQL:
//
//     npm run make:admin -- you@example.com
//
// The person must already have signed up and confirmed their email. After that,
// administrators manage roles through the API (PATCH /api/admin/users/:id/role),
// so this script refuses to run once an active administrator exists, unless you
// add --force (for example if every administrator account was lost).

const email = process.argv[2];
const force = process.argv.includes("--force");

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

try {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("Give the email address of the account:  npm run make:admin -- you@example.com");
  } else {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, role: true, isActive: true, emailVerifiedAt: true },
    });

    const admins = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });

    if (!user) {
      fail(`No account with the email ${email}. They must sign up on the site first.`);
    } else if (!user.emailVerifiedAt) {
      fail(`${user.email} has not confirmed their email address yet. Ask them to, then run this again.`);
    } else if (!user.isActive) {
      fail(`${user.email} is suspended. Reactivate the account first.`);
    } else if (user.role === "ADMIN") {
      console.log(`${user.email} is already an administrator. Nothing to do.`);
    } else if (admins > 0 && !force) {
      fail(
        `There ${admins === 1 ? "is already 1 active administrator" : `are already ${admins} active administrators`}. ` +
          "Ask one of them to change roles through the API instead. " +
          "Add --force only if you really need to override this."
      );
    } else {
      const previous = user.role;

      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" }, select: { id: true } });

        await recordModerationAction(
          tx,
          { id: null, displayName: "Command line", role: "SCRIPT" },
          {
            action: "user.role_change",
            targetType: "user",
            targetId: user.id,
            note: `${previous} to ADMIN: set from the command line (make:admin)`,
          }
        );
      });

      await recordSecurityEvent(null, "ACCOUNT_ROLE_CHANGED", {
        targetUserId: user.id,
        from: previous,
        to: "ADMIN",
        via: "make:admin script",
      });

      await notify(
        user.id,
        "account.role_changed",
        {
          roleLabel: ROLE_LABELS.ADMIN,
          previousRoleLabel: ROLE_LABELS[previous] ?? previous,
          reason: "Set up by the server operator.",
        },
        {}
      );

      console.log(`${user.email} is now an administrator. They can use the admin API on their next request.`);
    }
  }
} catch (error) {
  console.error("Could not make an administrator:", error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
import prisma from "../config/prisma.js";
import { buildMessage, categoryFor } from "./emailTemplates.js";
import { kickMailWorker } from "./mailWorker.js";

// Creates the in-app notification and the queued email for something that
// happened to a person. Called from controllers AFTER the action has succeeded.
//
// It never throws: a notification problem must not undo a moderator's decision.
// (The cost: if the server crashed in the instant between the decision and this
// call, that one notification would be lost.)
//
// What the person receives follows their settings (notification_preferences):
//   * the category switch (claimUpdates, reviewUpdates, hospitalResponses) turns
//     that kind of notification off completely;
//   * inAppNotifications decides whether it appears in the app;
//   * emailNotifications decides whether an email is queued.

// Notices about a person's own account (a role change, a suspension, a
// reactivation) are always sent, in the app and by email, whatever their
// settings, and even to an account that is suspended: they need to know.
const MANDATORY_PREFIXES = ["account"];

// People with no settings row get the same defaults the table uses.
const DEFAULT_SETTINGS = {
  emailNotifications: true,
  inAppNotifications: true,
  claimUpdates: true,
  reviewUpdates: true,
  hospitalResponses: true,
};

export const notify = async (userId, type, values = {}, data = {}) => {
  try {
    if (!userId) return;

    const message = buildMessage(type, values);
    if (!message) throw new Error(`Unknown notification type: ${type}`);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isActive: true,
        notificationSettings: true,
      },
    });

    const mandatory = MANDATORY_PREFIXES.includes(type.split(".")[0]);

    if (!user || (!user.isActive && !mandatory)) return;

    const settings = mandatory
      ? DEFAULT_SETTINGS
      : { ...DEFAULT_SETTINGS, ...(user.notificationSettings ?? {}) };
    const category = categoryFor(type);

    if (category && settings[category] === false) return;

    const writes = [];

    if (settings.inAppNotifications) {
      writes.push(
        prisma.notification.create({
          data: { userId, type, title: message.title, body: message.body, data },
          select: { id: true },
        })
      );
    }

    if (settings.emailNotifications && user.email) {
      writes.push(
        prisma.emailOutbox.create({
          data: {
            userId,
            toEmail: user.email,
            type,
            subject: message.email.subject,
            textBody: message.email.text,
            htmlBody: message.email.html,
          },
          select: { id: true },
        })
      );
    }

    if (writes.length === 0) return;

    // Both or neither.
    await prisma.$transaction(writes);

    if (settings.emailNotifications) kickMailWorker();
  } catch (error) {
    console.error(`Could not create notification (${type}):`, error.message);
  }
};

// The same notification for several people (for example a hospital's representatives).
export const notifyMany = async (userIds, type, values = {}, data = {}) => {
  await Promise.all([...new Set(userIds)].map((userId) => notify(userId, type, values, data)));
};
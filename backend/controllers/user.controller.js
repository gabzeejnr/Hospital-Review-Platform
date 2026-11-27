import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";
import { recordSecurityEvent } from "../src/services/audit.service.js";

// Every handler here works on the signed-in user only (req.user, set by the
// authenticate middleware). There is no user ID in any URL, so one user can
// never read or change another user's data through these routes.
// Request bodies are already validated and cleaned by validate()
// (see src/validation/user.schemas.js), so only allowed fields reach here.

const profileSelect = {
  id: true,
  email: true,
  displayName: true,
  username: true,
  avatarUrl: true,
  phoneNumber: true,
  emailVerifiedAt: true,
  role: true,
  language: true,
  timezone: true,
  theme: true,
  createdAt: true,
  updatedAt: true,
};

const notificationSelect = {
  emailNotifications: true,
  pushNotifications: true,
  inAppNotifications: true,
  reviewUpdates: true,
  hospitalResponses: true,
  claimUpdates: true,
  promotionalEmails: true,
  securityAlerts: true,
  updatedAt: true,
};

// GET /api/users/me
export const getProfile = async (req, res) => {
  const profile = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: profileSelect,
  });

  if (!profile) {
    throw new ApiError(404, "Profile not found", { code: "NOT_FOUND" });
  }

  return res.status(200).json({ success: true, profile });
};

// PATCH /api/users/me
export const updateProfile = async (req, res) => {
  const data = req.body;

  let profile;

  try {
    profile = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: profileSelect,
    });
  } catch (error) {
    // The only unique column this update can touch is the username.
    if (error?.code === "P2002") {
      throw new ApiError(409, "That username is already taken", {
        code: "USERNAME_TAKEN",
      });
    }

    throw error;
  }

  // Field names only: never the values (phone numbers etc.).
  void recordSecurityEvent(req.user.id, "PROFILE_UPDATED", {
    fields: Object.keys(data),
  });

  return res.status(200).json({
    success: true,
    message: "Profile updated",
    profile,
  });
};

// GET /api/users/me/notification-preferences
// The row is created with defaults the first time it is needed.
export const getNotificationPreferences = async (req, res) => {
  const preferences = await prisma.notificationPreference.upsert({
    where: { userId: req.user.id },
    create: { userId: req.user.id },
    update: {},
    select: notificationSelect,
  });

  return res.status(200).json({ success: true, preferences });
};

// PATCH /api/users/me/notification-preferences
export const updateNotificationPreferences = async (req, res) => {
  const data = req.body;

  const preferences = await prisma.notificationPreference.upsert({
    where: { userId: req.user.id },
    create: { userId: req.user.id, ...data },
    update: data,
    select: notificationSelect,
  });

  void recordSecurityEvent(req.user.id, "NOTIFICATION_PREFERENCES_UPDATED", {
    fields: Object.keys(data),
  });

  return res.status(200).json({
    success: true,
    message: "Notification preferences updated",
    preferences,
  });
};
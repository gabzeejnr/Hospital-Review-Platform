import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";

// A signed-in person's in-app notifications. Always their own: there is no id of
// a user in any URL, and somebody else's notification looks like one that does
// not exist.

const select = {
  id: true,
  type: true,
  title: true,
  body: true,
  data: true,
  readAt: true,
  createdAt: true,
};

const present = (notification) => ({
  id: notification.id,
  type: notification.type,
  title: notification.title,
  body: notification.body,
  data: notification.data,
  read: notification.readAt !== null,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
});

const unreadCountFor = (userId) =>
  prisma.notification.count({ where: { userId, readAt: null } });

const notFound = () =>
  new ApiError(404, "Notification not found", { code: "NOTIFICATION_NOT_FOUND" });

// GET /api/notifications?unread=true&page=1&limit=20
export const listNotifications = async (req, res) => {
  const { page, limit, unread } = req.validatedQuery;
  const where = { userId: req.user.id, ...(unread === "true" && { readAt: null }) };

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      select,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
    unreadCountFor(req.user.id),
  ]);

  return res.status(200).json({
    success: true,
    notifications: notifications.map(present),
    unreadCount,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};

// GET /api/notifications/unread-count   (cheap: for the badge)
export const getUnreadCount = async (req, res) => {
  return res.status(200).json({ success: true, unreadCount: await unreadCountFor(req.user.id) });
};

// POST /api/notifications/:id/read   (reading twice is fine)
export const markNotificationRead = async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  if (result.count === 0) {
    const exists = await prisma.notification.count({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (exists === 0) throw notFound();
  }

  return res.status(200).json({
    success: true,
    unreadCount: await unreadCountFor(req.user.id),
  });
};

// POST /api/notifications/read-all
export const markAllNotificationsRead = async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return res.status(200).json({ success: true, marked: result.count, unreadCount: 0 });
};

// DELETE /api/notifications/:id
export const deleteNotification = async (req, res) => {
  const result = await prisma.notification.deleteMany({
    where: { id: req.params.id, userId: req.user.id },
  });

  if (result.count === 0) throw notFound();

  return res.status(200).json({
    success: true,
    message: "Notification deleted",
    unreadCount: await unreadCountFor(req.user.id),
  });
};
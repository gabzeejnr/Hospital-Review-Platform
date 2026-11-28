import express from "express";
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "../../controllers/notification.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";
import { notificationParams, notificationsQuery } from "../validation/notification.schemas.js";
import { emptyBody } from "../validation/claim.schemas.js";

// Mounted at /api/notifications (see server.js). Everything needs a signed-in user.
const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Your notifications, newest first
 *     description: Includes the number still unread. Use ?unread=true to list only unread ones.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unread
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A page of notifications
 */
router.get("/", validate({ query: notificationsQuery }), listNotifications);

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: How many notifications you have not read (for the badge)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The unread count
 */
router.get("/unread-count", getUnreadCount);

/**
 * @swagger
 * /api/notifications/read-all:
 *   post:
 *     summary: Mark all your notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Number marked
 */
router.post("/read-all", validate({ body: emptyBody }), markAllNotificationsRead);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   post:
 *     summary: Mark one notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Marked as read
 *       404:
 *         description: Notification not found
 */
router.post(
  "/:id/read",
  validate({ params: notificationParams, body: emptyBody }),
  markNotificationRead
);

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Delete one notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Notification not found
 */
router.delete("/:id", validate({ params: notificationParams }), deleteNotification);

export default router;
import express from "express";
import {
  listReviewQueue,
  approveReview,
  rejectReview,
} from "../../controllers/moderation.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { moderationLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import {
  reviewParams,
  moderationQueueQuery,
  approveReviewBody,
  rejectReviewBody,
} from "../validation/review.schemas.js";

const router = express.Router();

// Moderators and admins only. Roles are checked against the database on every
// request, so removing someone's role takes effect immediately.
router.use(authenticate, authorize("MODERATOR", "ADMIN"), moderationLimiter);

/**
 * @swagger
 * tags:
 *   name: Moderation
 *   description: Review moderation (moderators and admins only)
 */

/**
 * @swagger
 * /api/moderation/reviews:
 *   get:
 *     summary: Review queue, oldest first
 *     tags: [Moderation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending_moderation, published, rejected, removed], default: pending_moderation }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *     responses:
 *       200:
 *         description: Reviews retrieved
 *       403:
 *         description: Not a moderator
 */
router.get("/reviews", validate({ query: moderationQueueQuery }), listReviewQueue);

/**
 * @swagger
 * /api/moderation/reviews/{id}/approve:
 *   post:
 *     summary: Publish a review
 *     tags: [Moderation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Review published
 *       403:
 *         description: Not a moderator, or it is your own review
 *       404:
 *         description: Review not found
 *       409:
 *         description: Already moderated
 */
router.post(
  "/reviews/:id/approve",
  validate({ params: reviewParams, body: approveReviewBody }),
  approveReview
);

/**
 * @swagger
 * /api/moderation/reviews/{id}/reject:
 *   post:
 *     summary: Reject a pending review, or take down a published one
 *     tags: [Moderation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 500
 *                 description: Shown to the author so they can fix the review
 *     responses:
 *       200:
 *         description: Review rejected
 *       400:
 *         description: A reason is required
 *       403:
 *         description: Not a moderator, or it is your own review
 *       404:
 *         description: Review not found
 *       409:
 *         description: Already moderated
 */
router.post(
  "/reviews/:id/reject",
  validate({ params: reviewParams, body: rejectReviewBody }),
  rejectReview
);

export default router;
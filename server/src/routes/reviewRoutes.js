import express from "express";
import { updateReview, deleteReview } from "../../controllers/review.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { sensitiveLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { reviewParams, updateReviewBody } from "../validation/review.schemas.js";

// Edit or delete your own review. Reading reviews and writing a new one are
// under /api/hospitals/:id/reviews (see hospitalRoutes.js).

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Hospital reviews and ratings
 */

/**
 * @swagger
 * /api/reviews/{id}:
 *   patch:
 *     summary: Edit your own review
 *     description: >
 *       Send only the fields to change. Changing the title, comment, ratings or
 *       department sends the review back to moderation.
 *     tags: [Reviews]
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
 *             properties:
 *               title: { type: string }
 *               comment: { type: string }
 *               overallRating: { type: integer, minimum: 1, maximum: 5 }
 *               ratings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     category: { type: string }
 *                     rating: { type: integer, minimum: 1, maximum: 5 }
 *               visitedOn: { type: string, format: date, nullable: true }
 *               department: { type: string, nullable: true }
 *               isAnonymous: { type: boolean }
 *     responses:
 *       200:
 *         description: Review updated
 *       400:
 *         description: Validation failed
 *       403:
 *         description: Review was removed
 *       404:
 *         description: Review not found (or not yours)
 */
router.patch(
  "/:id",
  sensitiveLimiter,
  validate({ params: reviewParams, body: updateReviewBody }),
  updateReview
);

/**
 * @swagger
 * /api/reviews/{id}:
 *   delete:
 *     summary: Delete your own review
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Review deleted
 *       404:
 *         description: Review not found (or not yours)
 */
router.delete(
  "/:id",
  sensitiveLimiter,
  validate({ params: reviewParams }),
  deleteReview
);

export default router;
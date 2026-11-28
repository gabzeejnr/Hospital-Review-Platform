import express from "express";
import { createReport } from "../../controllers/report.controller.js";
import {
  saveResponse,
  deleteResponse,
  listHospitalResponses,
} from "../../controllers/response.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { reportCreateLimiter, sensitiveLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { hospitalParams } from "../validation/hospital.schemas.js";
import {
  reviewParams,
  createReportBody,
  responseBody,
  repResponsesQuery,
} from "../validation/report.schemas.js";

// Mounted at /api (see server.js). Every route needs a signed-in user, so
// authenticate is applied route by route: unknown URLs must still answer 404.
const router = express.Router();

/**
 * @swagger
 * /api/reviews/{id}/reports:
 *   post:
 *     summary: Report a published review that breaks the rules
 *     description: A report never hides a review by itself; a moderator decides. You cannot report your own review, and you can report a review once. 10 reports per day.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *                 enum: [spam, abusive_language, fake_review, conflict_of_interest, privacy_violation, irrelevant, other]
 *               details:
 *                 type: string
 *     responses:
 *       201:
 *         description: Report received
 *       409:
 *         description: You have already reported this review
 */
router.post(
  "/reviews/:id/reports",
  authenticate,
  reportCreateLimiter,
  validate({ params: reviewParams, body: createReportBody }),
  createReport
);

/**
 * @swagger
 * /api/reviews/{id}/response:
 *   put:
 *     summary: Write or replace your hospital's public response to a review (representatives only)
 *     description: One response per review, only to a published review, no links. A moderator approves it before it appears (unless that check is switched off); editing sends it back to moderation.
 *     tags: [Responses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body:
 *                 type: string
 *     responses:
 *       201:
 *         description: Response created
 *       200:
 *         description: Response updated
 *       403:
 *         description: Not a representative of this hospital
 *   delete:
 *     summary: Delete your hospital's response to a review (representatives only)
 *     tags: [Responses]
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
 *         description: Response deleted
 */
router.put(
  "/reviews/:id/response",
  authenticate,
  sensitiveLimiter,
  validate({ params: reviewParams, body: responseBody }),
  saveResponse
);

router.delete(
  "/reviews/:id/response",
  authenticate,
  sensitiveLimiter,
  validate({ params: reviewParams }),
  deleteResponse
);

/**
 * @swagger
 * /api/hospitals/{id}/responses:
 *   get:
 *     summary: Your hospital's published reviews with your response status (representatives only)
 *     description: Use ?unanswered=true to see only reviews that still need an answer.
 *     tags: [Responses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: unanswered
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *     responses:
 *       200:
 *         description: A page of reviews
 *       403:
 *         description: Not a representative of this hospital
 */
router.get(
  "/hospitals/:id/responses",
  authenticate,
  validate({ params: hospitalParams, query: repResponsesQuery }),
  listHospitalResponses
);

export default router;
import express from "express";
import {
  listReviewQueue,
  approveReview,
  rejectReview,
} from "../../controllers/moderation.controller.js";
import {
  listClaims,
  approveClaim,
  rejectClaim,
  listVerifications,
  approveVerification,
  rejectVerification,
  suspendHospital,
  unsuspendHospital,
} from "../../controllers/claimModeration.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { moderationLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import {
  reviewParams,
  moderationQueueQuery,
  approveReviewBody,
  rejectReviewBody,
} from "../validation/review.schemas.js";
import { hospitalParams } from "../validation/hospital.schemas.js";
import { getDocumentViewUrl } from "../../controllers/document.controller.js";
import { documentParams } from "../validation/document.schemas.js";
import {
  listReports,
  investigateReports,
  escalateReports,
  dismissReports,
  upholdReports,
} from "../../controllers/reportModeration.controller.js";
import {
  listResponseQueue,
  approveResponse,
  rejectResponse,
} from "../../controllers/responseModeration.controller.js";
import { listModerationHistory } from "../../controllers/moderationHistory.controller.js";
import {
  reviewParams as reportedReviewParams,
  responseParams,
  reportQueueQuery,
  responseQueueQuery,
  historyQuery,
  investigateBody,
  escalateBody,
  dismissBody,
  upholdBody,
} from "../validation/report.schemas.js";
import {
  claimParams,
  verificationParams,
  claimQueueQuery,
  verificationQueueQuery,
  rejectBody,
  suspendBody,
  emptyBody,
} from "../validation/claim.schemas.js";

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

// ---------------------------------------------------------------------------
// Hospital claims, verification and suspension (task 6c)
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/moderation/claims:
 *   get:
 *     summary: Hospital claims waiting for review (moderators and admins)
 *     description: Oldest first. Includes the claimant's email address so they can be contacted. Filter with ?status=pending|approved|rejected|withdrawn.
 *     tags: [Moderation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A page of claims
 */
router.get("/claims", validate({ query: claimQueueQuery }), listClaims);

/**
 * @swagger
 * /api/moderation/claims/{id}/approve:
 *   post:
 *     summary: Approve a claim (the claimant becomes the hospital's representative)
 *     tags: [Moderation]
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
 *         description: Claim approved
 *       409:
 *         description: Already reviewed, or the hospital's status no longer allows it
 */
router.post(
  "/claims/:id/approve",
  validate({ params: claimParams, body: emptyBody }),
  approveClaim
);

/**
 * @swagger
 * /api/moderation/claims/{id}/reject:
 *   post:
 *     summary: Reject a claim (a reason is required and is shown to the claimant)
 *     tags: [Moderation]
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
 *     responses:
 *       200:
 *         description: Claim rejected
 */
router.post(
  "/claims/:id/reject",
  validate({ params: claimParams, body: rejectBody }),
  rejectClaim
);

/**
 * @swagger
 * /api/moderation/verifications:
 *   get:
 *     summary: Verification requests waiting for review (moderators and admins)
 *     tags: [Moderation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A page of verification requests
 */
router.get("/verifications", validate({ query: verificationQueueQuery }), listVerifications);

/**
 * @swagger
 * /api/moderation/verifications/{id}/approve:
 *   post:
 *     summary: Approve a verification request (the hospital becomes verified)
 *     tags: [Moderation]
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
 *         description: Hospital verified
 */
router.post(
  "/verifications/:id/approve",
  validate({ params: verificationParams, body: emptyBody }),
  approveVerification
);

/**
 * @swagger
 * /api/moderation/verifications/{id}/reject:
 *   post:
 *     summary: Reject a verification request (the hospital goes back to claimed)
 *     tags: [Moderation]
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
 *     responses:
 *       200:
 *         description: Verification rejected
 */
router.post(
  "/verifications/:id/reject",
  validate({ params: verificationParams, body: rejectBody }),
  rejectVerification
);

/**
 * @swagger
 * /api/moderation/documents/{id}/url:
 *   get:
 *     summary: A 5-minute link to open an uploaded proof document (moderators and admins)
 *     description: Every link handed out is written to the audit log first. If the log cannot be written, no link is given.
 *     tags: [Moderation]
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
 *         description: A temporary link to the file
 *       404:
 *         description: Document not found
 */
router.get("/documents/:id/url", validate({ params: documentParams }), getDocumentViewUrl);

/**
 * @swagger
 * /api/moderation/hospitals/{id}/suspend:
 *   post:
 *     summary: Suspend a hospital (admins only)
 *     tags: [Moderation]
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
 *     responses:
 *       200:
 *         description: Hospital suspended
 *       403:
 *         description: Admins only
 */
router.post(
  "/hospitals/:id/suspend",
  authorize("ADMIN"),
  validate({ params: hospitalParams, body: suspendBody }),
  suspendHospital
);

/**
 * @swagger
 * /api/moderation/hospitals/{id}/unsuspend:
 *   post:
 *     summary: Restore a suspended hospital (admins only)
 *     description: The status is worked out again from the hospital's claims, representatives and verification history.
 *     tags: [Moderation]
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
 *         description: Hospital restored
 *       403:
 *         description: Admins only
 */
router.post(
  "/hospitals/:id/unsuspend",
  authorize("ADMIN"),
  validate({ params: hospitalParams, body: emptyBody }),
  unsuspendHospital
);

// ---------------------------------------------------------------------------
// Reports on reviews, hospital responses and the moderation history (task 6d)
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/moderation/reports:
 *   get:
 *     summary: Reported reviews, one entry per review (moderators and admins)
 *     description: Escalated cases first, then oldest first. ?status=open (default), investigating, upheld or dismissed. ?escalated=true shows only cases passed to an administrator. Reporters are shown by display name, never email.
 *     tags: [Moderation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A page of reported reviews with their reports
 */
router.get("/reports", validate({ query: reportQueueQuery }), listReports);

/**
 * @swagger
 * /api/moderation/reviews/{id}/reports/investigate:
 *   post:
 *     summary: Mark a review's open reports as under investigation
 *     description: The review stays published and keeps counting toward the hospital's rating.
 *     tags: [Moderation]
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
 *         description: Marked
 *       409:
 *         description: No open reports
 */
router.post(
  "/reviews/:id/reports/investigate",
  validate({ params: reportedReviewParams, body: investigateBody }),
  investigateReports
);

/**
 * @swagger
 * /api/moderation/reviews/{id}/reports/escalate:
 *   post:
 *     summary: Pass a review's reports to an administrator (a note saying why is required)
 *     description: Once escalated, only an administrator can dismiss or uphold the reports.
 *     tags: [Moderation]
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
 *             required: [note]
 *             properties:
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Escalated
 */
router.post(
  "/reviews/:id/reports/escalate",
  validate({ params: reportedReviewParams, body: escalateBody }),
  escalateReports
);

/**
 * @swagger
 * /api/moderation/reviews/{id}/reports/dismiss:
 *   post:
 *     summary: Dismiss a review's reports (the review stays published; reporters are told)
 *     tags: [Moderation]
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
 *         description: Dismissed
 *       403:
 *         description: Escalated to an administrator
 */
router.post(
  "/reviews/:id/reports/dismiss",
  validate({ params: reportedReviewParams, body: dismissBody }),
  dismissReports
);

/**
 * @swagger
 * /api/moderation/reviews/{id}/reports/uphold:
 *   post:
 *     summary: Uphold a review's reports (the review is taken down; its author and the reporters are told)
 *     tags: [Moderation]
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
 *     responses:
 *       200:
 *         description: Upheld
 *       403:
 *         description: Escalated to an administrator
 */
router.post(
  "/reviews/:id/reports/uphold",
  validate({ params: reportedReviewParams, body: upholdBody }),
  upholdReports
);

/**
 * @swagger
 * /api/moderation/responses:
 *   get:
 *     summary: Hospital responses waiting for a moderator (moderators and admins)
 *     description: Oldest first. ?status=pending_moderation (default), published or rejected.
 *     tags: [Moderation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A page of responses, each with the review it answers
 */
router.get("/responses", validate({ query: responseQueueQuery }), listResponseQueue);

/**
 * @swagger
 * /api/moderation/responses/{id}/approve:
 *   post:
 *     summary: Approve a hospital response (it becomes visible; the representative and the reviewer are told)
 *     tags: [Moderation]
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
 *         description: Response published
 */
router.post(
  "/responses/:id/approve",
  validate({ params: responseParams, body: emptyBody }),
  approveResponse
);

/**
 * @swagger
 * /api/moderation/responses/{id}/reject:
 *   post:
 *     summary: Reject a hospital response (a reason is required and is shown to the representative)
 *     tags: [Moderation]
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
 *     responses:
 *       200:
 *         description: Response rejected
 */
router.post(
  "/responses/:id/reject",
  validate({ params: responseParams, body: rejectBody }),
  rejectResponse
);

/**
 * @swagger
 * /api/moderation/history:
 *   get:
 *     summary: The moderation history log (moderators and admins)
 *     description: Every action a moderator or admin has taken, newest first. Filter with targetType (review, response, claim, verification, hospital), targetId, actorId and action (for example review.reject). The log cannot be edited or deleted.
 *     tags: [Moderation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A page of history entries
 */
router.get("/history", validate({ query: historyQuery }), listModerationHistory);

export default router;
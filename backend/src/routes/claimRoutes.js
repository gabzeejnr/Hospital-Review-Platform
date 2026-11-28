import express from "express";
import {
  createClaim,
  withdrawClaim,
  createVerification,
  updateSocialMedia,
  getHospitalVerifications,
} from "../../controllers/claim.controller.js";
import {
  requestClaimDocumentUpload,
  requestVerificationDocumentUpload,
  confirmDocument,
  deleteDocument,
} from "../../controllers/document.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { claimCreateLimiter, sensitiveLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { hospitalParams } from "../validation/hospital.schemas.js";
import { createDocumentBody, documentParams } from "../validation/document.schemas.js";
import {
  claimParams,
  verificationParams,
  createClaimBody,
  createVerificationBody,
  updateSocialMediaBody,
  emptyBody,
} from "../validation/claim.schemas.js";

// Mounted at /api (see server.js). Every route needs a signed-in user, so
// authenticate is applied route by route: unknown URLs must still answer 404.
const router = express.Router();

/**
 * @swagger
 * /api/hospitals/{id}/claims:
 *   post:
 *     summary: Claim a hospital ("I work here")
 *     description: Needs a confirmed email address. The hospital becomes claim_pending until a moderator decides. Up to 3 claims can wait at once, and 5 can be submitted per day.
 *     tags: [Claims]
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
 *             required: [jobTitle]
 *             properties:
 *               jobTitle:
 *                 type: string
 *               officialEmail:
 *                 type: string
 *               officialPhone:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Claim submitted
 *       409:
 *         description: Already claimed, suspended, or you already have a claim waiting
 */
router.post(
  "/hospitals/:id/claims",
  authenticate,
  claimCreateLimiter,
  validate({ params: hospitalParams, body: createClaimBody }),
  createClaim
);

/**
 * @swagger
 * /api/claims/{id}/withdraw:
 *   post:
 *     summary: Withdraw your own claim that is still waiting for review
 *     tags: [Claims]
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
 *         description: Claim withdrawn
 *       404:
 *         description: Claim not found
 *       409:
 *         description: The claim has already been reviewed
 */
router.post(
  "/claims/:id/withdraw",
  authenticate,
  sensitiveLimiter,
  validate({ params: claimParams, body: emptyBody }),
  withdrawClaim
);

/**
 * @swagger
 * /api/hospitals/{id}/verification:
 *   post:
 *     summary: Ask for the verified badge (representatives only)
 *     description: The hospital must be claimed. It becomes verification_pending until a moderator decides.
 *     tags: [Claims]
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
 *             required: [registrationBody, registrationNumber]
 *             properties:
 *               registrationBody:
 *                 type: string
 *                 enum: [cac, mdcn, state_ministry, other]
 *               registrationNumber:
 *                 type: string
 *               officialEmail:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Request submitted
 *       403:
 *         description: Not a representative of this hospital
 *       409:
 *         description: The hospital is not in a state that allows this
 */
router.post(
  "/hospitals/:id/verification",
  authenticate,
  sensitiveLimiter,
  validate({ params: hospitalParams, body: createVerificationBody }),
  createVerification
);

/**
 * @swagger
 * /api/hospitals/{id}/social-media:
 *   patch:
 *     summary: Add, change or remove the hospital's social links (representatives only)
 *     description: Send only the links you want to change. A value of null removes that link. Only profile pages on facebook, instagram, x, linkedin, youtube and tiktok are accepted. Shown publicly while the hospital is claimed or verified.
 *     tags: [Claims]
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
 *             properties:
 *               facebook:
 *                 type: string
 *                 nullable: true
 *               instagram:
 *                 type: string
 *                 nullable: true
 *               x:
 *                 type: string
 *                 nullable: true
 *               linkedin:
 *                 type: string
 *                 nullable: true
 *               youtube:
 *                 type: string
 *                 nullable: true
 *               tiktok:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Links updated
 *       403:
 *         description: Not a representative of this hospital
 */
router.patch(
  "/hospitals/:id/social-media",
  authenticate,
  sensitiveLimiter,
  validate({ params: hospitalParams, body: updateSocialMediaBody }),
  updateSocialMedia
);

/**
 * @swagger
 * /api/hospitals/{id}/verification:
 *   get:
 *     summary: Your hospital's verification requests, with decision notes and attached documents (representatives only)
 *     tags: [Claims]
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
 *         description: Up to the 5 most recent requests
 *       403:
 *         description: Not a representative of this hospital
 */
router.get(
  "/hospitals/:id/verification",
  authenticate,
  validate({ params: hospitalParams }),
  getHospitalVerifications
);

/**
 * @swagger
 * /api/claims/{id}/documents:
 *   post:
 *     summary: Ask for a link to upload a proof document for your claim
 *     description: |
 *       Step 1 of 3. Returns a one-use upload link for exactly one file (PDF, JPEG or PNG, up to 5 MB, at most 5 per claim).
 *       Step 2: the browser uploads the file straight to Supabase Storage with `supabase.storage.from(bucket).uploadToSignedUrl(path, token, file)`.
 *       Step 3: call POST /api/documents/{id}/confirm so the server can check the file.
 *     tags: [Documents]
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
 *             required: [documentType, fileName, mimeType, sizeBytes]
 *             properties:
 *               documentType:
 *                 type: string
 *                 enum: [registration_certificate, operating_licence, letter_of_authority, staff_id, other]
 *               fileName:
 *                 type: string
 *               mimeType:
 *                 type: string
 *                 enum: [application/pdf, image/jpeg, image/png]
 *               sizeBytes:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Document recorded; use the returned upload link
 *       409:
 *         description: The claim is no longer waiting for review, or too many documents
 *       503:
 *         description: Document uploads are not set up on the server
 */
router.post(
  "/claims/:id/documents",
  authenticate,
  sensitiveLimiter,
  validate({ params: claimParams, body: createDocumentBody }),
  requestClaimDocumentUpload
);

/**
 * @swagger
 * /api/verifications/{id}/documents:
 *   post:
 *     summary: Ask for a link to upload a proof document for your verification request
 *     description: Same three steps as claim documents. A request needs at least one uploaded document before a moderator can approve it.
 *     tags: [Documents]
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
 *             required: [documentType, fileName, mimeType, sizeBytes]
 *             properties:
 *               documentType:
 *                 type: string
 *               fileName:
 *                 type: string
 *               mimeType:
 *                 type: string
 *               sizeBytes:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Document recorded; use the returned upload link
 */
router.post(
  "/verifications/:id/documents",
  authenticate,
  sensitiveLimiter,
  validate({ params: verificationParams, body: createDocumentBody }),
  requestVerificationDocumentUpload
);

/**
 * @swagger
 * /api/documents/{id}/confirm:
 *   post:
 *     summary: Tell the server the file has been uploaded, so it can check it
 *     description: The server looks at the real file. A file that is empty, too large, or not a genuine PDF, JPEG or PNG of the declared type is deleted and refused (422).
 *     tags: [Documents]
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
 *         description: Document accepted
 *       409:
 *         description: The file has not arrived yet
 *       422:
 *         description: The file was refused and deleted
 */
router.post(
  "/documents/:id/confirm",
  authenticate,
  sensitiveLimiter,
  validate({ params: documentParams, body: emptyBody }),
  confirmDocument
);

/**
 * @swagger
 * /api/documents/{id}:
 *   delete:
 *     summary: Delete one of your documents while the submission is waiting for review
 *     tags: [Documents]
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
 *         description: Document deleted
 *       409:
 *         description: The submission has already been decided
 */
router.delete(
  "/documents/:id",
  authenticate,
  sensitiveLimiter,
  validate({ params: documentParams }),
  deleteDocument
);

export default router;
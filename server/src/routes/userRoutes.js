import express from "express";
import {
  getProfile,
  updateProfile,
  getNotificationPreferences,
  updateNotificationPreferences,
} from "../../controllers/user.controller.js";
import { getMyReviews } from "../../controllers/review.controller.js";
import { getMyClaims, getMyHospitals } from "../../controllers/claim.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { sensitiveLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import {
  updateProfileBody,
  updateNotificationPreferencesBody,
} from "../validation/user.schemas.js";
import { myReviewsQuery } from "../validation/review.schemas.js";
import { myClaimsQuery } from "../validation/claim.schemas.js";

const router = express.Router();

// Every route here needs a signed-in user.
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: The signed-in user's profile and preferences
 */

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get the signed-in user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get("/me", getProfile);

/**
 * @swagger
 * /api/users/me:
 *   patch:
 *     summary: Update the signed-in user's profile
 *     description: >
 *       Send only the fields to change. Send null to clear displayName,
 *       username, phoneNumber or avatarUrl. Email and role cannot be changed here.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *                 maxLength: 100
 *                 nullable: true
 *               username:
 *                 type: string
 *                 description: 3-30 characters, starts with a letter, letters/numbers/underscores
 *                 example: ada_l
 *                 nullable: true
 *               phoneNumber:
 *                 type: string
 *                 description: Nigerian local or international format
 *                 example: "08031234567"
 *                 nullable: true
 *               avatarUrl:
 *                 type: string
 *                 description: Must be a public file in this project's Supabase Storage
 *                 nullable: true
 *               language:
 *                 type: string
 *                 enum: [en, yo, ig, ha, pcm]
 *               timezone:
 *                 type: string
 *                 description: IANA timezone name
 *                 example: Africa/Lagos
 *               theme:
 *                 type: string
 *                 enum: [light, dark, system]
 *     responses:
 *       200:
 *         description: Profile updated
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Authentication required
 *       409:
 *         description: Username already taken
 *       429:
 *         description: Too many requests
 */
router.patch(
  "/me",
  sensitiveLimiter,
  validate({ body: updateProfileBody }),
  updateProfile
);

/**
 * @swagger
 * /api/users/me/notification-preferences:
 *   get:
 *     summary: Get the signed-in user's notification preferences
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences retrieved (created with defaults on first use)
 *       401:
 *         description: Authentication required
 */
router.get("/me/notification-preferences", getNotificationPreferences);

/**
 * @swagger
 * /api/users/me/reviews:
 *   get:
 *     summary: The signed-in user's own reviews, in any status
 *     description: Includes the moderation note for rejected reviews.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending_moderation, published, rejected, removed] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *     responses:
 *       200:
 *         description: Reviews retrieved
 *       401:
 *         description: Authentication required
 */
router.get("/me/reviews", validate({ query: myReviewsQuery }), getMyReviews);

/**
 * @swagger
 * /api/users/me/notification-preferences:
 *   patch:
 *     summary: Update notification preferences
 *     description: Send only the settings to change. Security alerts cannot be turned off.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailNotifications:
 *                 type: boolean
 *               pushNotifications:
 *                 type: boolean
 *               inAppNotifications:
 *                 type: boolean
 *               reviewUpdates:
 *                 type: boolean
 *               hospitalResponses:
 *                 type: boolean
 *               claimUpdates:
 *                 type: boolean
 *               promotionalEmails:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Preferences updated
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Authentication required
 *       429:
 *         description: Too many requests
 */
router.patch(
  "/me/notification-preferences",
  sensitiveLimiter,
  validate({ body: updateNotificationPreferencesBody }),
  updateNotificationPreferences
);

/**
 * @swagger
 * /api/users/me/claims:
 *   get:
 *     summary: Your hospital claims and their status
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A page of your claims
 */
router.get("/me/claims", validate({ query: myClaimsQuery }), getMyClaims);

/**
 * @swagger
 * /api/users/me/hospitals:
 *   get:
 *     summary: The hospitals you represent
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Your hospitals, with their real status
 */
router.get("/me/hospitals", getMyHospitals);

export default router;
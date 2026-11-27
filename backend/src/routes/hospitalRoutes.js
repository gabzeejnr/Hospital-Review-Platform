import express from "express";
import {
  listHospitals,
  getHospital,
  getHospitalFilters,
} from "../../controllers/hospital.controller.js";
import {
  listHospitalReviews,
  getRatingSummary,
  createReview,
} from "../../controllers/review.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { searchLimiter, reviewCreateLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { listHospitalsQuery, hospitalParams } from "../validation/hospital.schemas.js";
import { listReviewsQuery, createReviewBody } from "../validation/review.schemas.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Hospitals
 *   description: Public hospital directory
 */

/**
 * @swagger
 * /api/hospitals/filters:
 *   get:
 *     summary: Choices for the search filters (hospital types and ownership values)
 *     tags: [Hospitals]
 *     responses:
 *       200:
 *         description: Filters retrieved successfully
 */
// Must stay above "/:id", otherwise "filters" would be read as a hospital ID.
router.get("/filters", getHospitalFilters);

/**
 * @swagger
 * /api/hospitals:
 *   get:
 *     summary: Search hospitals, optionally near a location
 *     description: >
 *       Every word of q must match the hospital's name, city, LGA or state.
 *       Send lat and lng (together) to find hospitals near a point; results are
 *       then sorted by distance and include distanceKm.
 *     tags: [Hospitals]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string, minLength: 2, maxLength: 100 }
 *       - in: query
 *         name: stateId
 *         schema: { type: integer }
 *       - in: query
 *         name: lgaId
 *         schema: { type: integer }
 *       - in: query
 *         name: typeId
 *         schema: { type: integer }
 *       - in: query
 *         name: ownership
 *         schema: { type: string }
 *       - in: query
 *         name: lat
 *         schema: { type: number }
 *       - in: query
 *         name: lng
 *         schema: { type: number }
 *       - in: query
 *         name: radiusKm
 *         description: 1-100, default 25 (only with lat and lng)
 *         schema: { type: integer }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [name, newest, rating, distance] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 20 }
 *     responses:
 *       200:
 *         description: Hospitals retrieved successfully
 *       400:
 *         description: Invalid search parameters
 *       429:
 *         description: Too many searches
 */
router.get("/", searchLimiter, validate({ query: listHospitalsQuery }), listHospitals);

/**
 * @swagger
 * /api/hospitals/{id}:
 *   get:
 *     summary: Get one hospital
 *     tags: [Hospitals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Hospital retrieved successfully
 *       400:
 *         description: Invalid hospital ID
 *       404:
 *         description: Hospital not found
 */
router.get("/:id", validate({ params: hospitalParams }), getHospital);

/**
 * @swagger
 * /api/hospitals/{id}/reviews:
 *   get:
 *     summary: Published reviews of a hospital
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [newest, oldest, highest, lowest], default: newest }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *     responses:
 *       200:
 *         description: Reviews retrieved
 *       404:
 *         description: Hospital not found
 */
router.get(
  "/:id/reviews",
  validate({ params: hospitalParams, query: listReviewsQuery }),
  listHospitalReviews
);

/**
 * @swagger
 * /api/hospitals/{id}/rating-summary:
 *   get:
 *     summary: Average rating, star distribution and category averages
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Summary retrieved
 *       404:
 *         description: Hospital not found
 */
router.get(
  "/:id/rating-summary",
  validate({ params: hospitalParams }),
  getRatingSummary
);

/**
 * @swagger
 * /api/hospitals/{id}/reviews:
 *   post:
 *     summary: Write a review (one per hospital per user)
 *     description: >
 *       Needs a signed-in user with a confirmed email. The review is held for
 *       moderation before it appears publicly. Limited to 5 new reviews per day.
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
 *             required: [title, comment, overallRating]
 *             properties:
 *               title: { type: string, minLength: 3, maxLength: 150 }
 *               comment: { type: string, minLength: 20, maxLength: 5000 }
 *               overallRating: { type: integer, minimum: 1, maximum: 5 }
 *               ratings:
 *                 type: array
 *                 description: Optional ratings per category
 *                 items:
 *                   type: object
 *                   properties:
 *                     category:
 *                       type: string
 *                       enum: [staff_professionalism, waiting_time, cleanliness, communication, service_experience, facility_quality, billing_transparency, accessibility]
 *                     rating: { type: integer, minimum: 1, maximum: 5 }
 *               visitedOn: { type: string, format: date, example: "2026-11-14" }
 *               department: { type: string, maxLength: 100 }
 *               isAnonymous: { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: Review created
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Email not confirmed
 *       404:
 *         description: Hospital not found
 *       409:
 *         description: You already reviewed this hospital
 *       429:
 *         description: Daily review limit reached
 */
router.post(
  "/:id/reviews",
  authenticate,
  reviewCreateLimiter,
  validate({ params: hospitalParams, body: createReviewBody }),
  createReview
);

export default router;
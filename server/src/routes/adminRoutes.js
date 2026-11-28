import express from "express";
import {
  listUsers,
  getUser,
  changeRole,
  suspendUser,
  reactivateUser,
} from "../../controllers/admin.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { moderationLimiter, sensitiveLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import {
  userParams,
  usersQuery,
  changeRoleBody,
  suspendUserBody,
} from "../validation/admin.schemas.js";
import { emptyBody } from "../validation/claim.schemas.js";

// Mounted at /api/admin (see server.js). ADMIN accounts only: moderators cannot
// use any of it, which keeps their access to account details limited.
const router = express.Router();

router.use(authenticate, authorize("ADMIN"), moderationLimiter);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Find accounts (admins only)
 *     description: Search by part of the email, display name or username (?q=), and filter with ?role=MODERATOR and ?status=active|suspended. To see all moderators, use ?role=MODERATOR. Phone numbers, saved locations and notification settings are never shown.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [USER, HOSPITAL_REP, MODERATOR, SUPPORT, ADMIN]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, suspended]
 *     responses:
 *       200:
 *         description: A page of accounts
 *       403:
 *         description: Admins only
 */
router.get("/users", validate({ query: usersQuery }), listUsers);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   get:
 *     summary: One account, with activity counts and its recent role and status history (admins only)
 *     tags: [Admin]
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
 *         description: The account
 *       404:
 *         description: User not found
 */
router.get("/users/:id", validate({ params: userParams }), getUser);

/**
 * @swagger
 * /api/admin/users/{id}/role:
 *   patch:
 *     summary: Change someone's role (admins only)
 *     description: |
 *       Roles you can give are USER, MODERATOR and ADMIN. A reason is required; it is recorded in the moderation history and told to the person. It takes effect on their next request.
 *       You cannot change your own role. MODERATOR and ADMIN need an active account with a confirmed email. The last active administrator can never be demoted.
 *     tags: [Admin]
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
 *             required: [role, reason]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [USER, MODERATOR, ADMIN]
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Role changed
 *       403:
 *         description: Not an admin, or you tried to change your own role
 *       409:
 *         description: Same role, or the account is not eligible
 */
router.patch(
  "/users/:id/role",
  sensitiveLimiter,
  validate({ params: userParams, body: changeRoleBody }),
  changeRole
);

/**
 * @swagger
 * /api/admin/users/{id}/suspend:
 *   post:
 *     summary: Suspend an account (admins only)
 *     description: The person is locked out from their next request and is told the reason you give. Their reviews and other content stay as they are. You cannot suspend yourself.
 *     tags: [Admin]
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
 *         description: Account suspended
 *       409:
 *         description: Already suspended
 */
router.post(
  "/users/:id/suspend",
  sensitiveLimiter,
  validate({ params: userParams, body: suspendUserBody }),
  suspendUser
);

/**
 * @swagger
 * /api/admin/users/{id}/reactivate:
 *   post:
 *     summary: Reactivate a suspended account (admins only)
 *     tags: [Admin]
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
 *         description: Account reactivated
 *       409:
 *         description: The account is not suspended
 */
router.post(
  "/users/:id/reactivate",
  sensitiveLimiter,
  validate({ params: userParams, body: emptyBody }),
  reactivateUser
);

export default router;
import express from "express";
import {
  register,
  login,
  logout,
  getMe,
  forgotPassword,
  resendConfirmation,
} from "../../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  registerLimiter,
  loginLimiter,
  forgotPasswordLimiter,
  resendConfirmationLimiter,
} from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import {
  registerBody,
  loginBody,
  forgotPasswordBody,
  resendConfirmationBody,
  logoutBody,
} from "../validation/auth.schemas.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User registration, login and account management
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 72
 *                 description: At least one letter and one number
 *                 example: SecurePassword123
 *               displayName:
 *                 type: string
 *                 example: John Doe
 *     responses:
 *       201:
 *         description: Account created successfully
 *       400:
 *         description: Invalid registration details
 *       500:
 *         description: Registration failed
 */
router.post("/register", registerLimiter, validate({ body: registerBody }), register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Sign in to an account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: SecurePassword123
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account deactivated
 */
router.post("/login", loginLimiter, validate({ body: loginBody }), login);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Password reset instructions requested
 *       400:
 *         description: Email is required
 */
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validate({ body: forgotPasswordBody }),
  forgotPassword
);

/**
 * @swagger
 * /api/auth/resend-confirmation:
 *   post:
 *     summary: Resend the account confirmation email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Confirmation email requested (same response whether or not the account exists)
 *       400:
 *         description: Email is required
 *       429:
 *         description: Too many requests
 */
router.post(
  "/resend-confirmation",
  resendConfirmationLimiter,
  validate({ body: resendConfirmationBody }),
  resendConfirmation
);

// Protected routes will be connected to authentication middleware next.

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Sign out of the current session
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Signed out successfully
 *       401:
 *         description: Invalid session
 */
router.post("/logout", authenticate, validate({ body: logoutBody }), logout);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get the currently authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get("/me", authenticate, getMe);

export default router;
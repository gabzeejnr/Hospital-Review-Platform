import { rateLimit, ipKeyGenerator } from "express-rate-limit";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// All limits live here so they are easy to tune.
const LIMITS = {
  api:                 { windowMs: 15 * MINUTE, limit: 300 }, // per IP, all /api routes
  register:            { windowMs: HOUR,        limit: 10 },  // per IP
  loginIp:             { windowMs: 15 * MINUTE, limit: 30 },  // failed attempts per IP
  loginAccount:        { windowMs: 15 * MINUTE, limit: 5 },   // failed attempts per IP + email
  emailActionIp:       { windowMs: HOUR,        limit: 10 },  // per IP (forgot password, resend)
  emailActionAddress:  { windowMs: HOUR,        limit: 3 },   // per target email address
  sensitive:           { windowMs: 15 * MINUTE, limit: 30 },  // per signed-in user
  search:              { windowMs: MINUTE,      limit: 60 },  // per IP, hospital search
  reviewCreate:        { windowMs: 24 * HOUR,   limit: 5 },   // new reviews per signed-in user per day
  moderation:          { windowMs: 15 * MINUTE, limit: 300 }, // per moderator
};

// IPv6-safe client key (groups an IPv6 address by its /56 subnet).
const ipKey = (req) => ipKeyGenerator(req.ip ?? "");

const emailFrom = (req) => {
  const email = req.body?.email;
  return typeof email === "string" ? email.trim().toLowerCase().slice(0, 254) : "";
};

const tooManyRequests = (message) => (req, res) => {
  const resetTime = req.rateLimit?.resetTime;
  const retryAfterSeconds = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : undefined;

  res.status(429).json({
    success: false,
    message,
    code: "RATE_LIMITED",
    requestId: req.id,
    retryAfterSeconds,
  });
};

const createLimiter = ({
  windowMs,
  limit,
  message,
  keyGenerator,
  skipSuccessfulRequests = false,
}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7", // sends RateLimit headers and Retry-After
    legacyHeaders: false,
    skipSuccessfulRequests,
    skip: () => process.env.NODE_ENV === "test",
    ...(keyGenerator && { keyGenerator }),
    handler: tooManyRequests(message),
  });

// General limiter for every /api route.
export const apiLimiter = createLimiter({
  ...LIMITS.api,
  message: "Too many requests. Please slow down and try again shortly.",
});

export const registerLimiter = createLimiter({
  ...LIMITS.register,
  message: "Too many registration attempts. Please try again later.",
});

// Only failed logins count, so normal users are never throttled.
export const loginLimiter = [
  createLimiter({
    ...LIMITS.loginIp,
    skipSuccessfulRequests: true,
    message: "Too many failed login attempts. Please try again later.",
  }),
  createLimiter({
    ...LIMITS.loginAccount,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${ipKey(req)}|${emailFrom(req)}`,
    message: "Too many failed login attempts for this account. Please try again later.",
  }),
];

// Keyed by the target address so nobody can flood one mailbox.
const emailActionLimiter = (message) => [
  createLimiter({ ...LIMITS.emailActionIp, message }),
  createLimiter({
    ...LIMITS.emailActionAddress,
    keyGenerator: (req) => emailFrom(req) || ipKey(req),
    message,
  }),
];

export const forgotPasswordLimiter = emailActionLimiter(
  "Too many password reset requests. Please try again later."
);

export const resendConfirmationLimiter = emailActionLimiter(
  "Too many confirmation email requests. Please try again later."
);

// For sensitive authenticated operations (profile changes, claims, reviews,
// account deletion). Must be placed AFTER the authenticate middleware.
export const sensitiveLimiter = createLimiter({
  ...LIMITS.sensitive,
  keyGenerator: (req) => req.user?.id ?? ipKey(req),
  message: "Too many attempts. Please wait a few minutes and try again.",
});

// Hospital search: the most expensive public endpoint.
export const searchLimiter = createLimiter({
  ...LIMITS.search,
  message: "Too many searches. Please wait a moment and try again.",
});

// New reviews: 5 per user per day. Must come after the authenticate middleware.
export const reviewCreateLimiter = createLimiter({
  ...LIMITS.reviewCreate,
  keyGenerator: (req) => req.user?.id ?? ipKey(req),
  message: "You have reached the daily limit for new reviews. Please try again tomorrow.",
});

// Generous, because moderators work through long queues. Must come after authenticate.
export const moderationLimiter = createLimiter({
  ...LIMITS.moderation,
  keyGenerator: (req) => req.user?.id ?? ipKey(req),
  message: "Too many moderation actions. Please wait a moment and try again.",
});
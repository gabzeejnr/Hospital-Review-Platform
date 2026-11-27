import cors from "cors";
import { ApiError } from "../utils/ApiError.js";

// Which websites (origins) may call this API from a browser.
//
//   CORS_ORIGINS=https://app.example.com,https://www.example.com
//
// Falls back to FRONTEND_URL, then (outside production only) to the usual local
// dev servers. In production with nothing configured, no website is allowed.
// Requests with no Origin header (curl, mobile apps, server-to-server) are not
// affected by CORS and are always let through.

const isProduction = process.env.NODE_ENV === "production";

const toOrigin = (value) => {
  try {
    return new URL(value.trim()).origin; // drops any path and trailing slash
  } catch {
    return null;
  }
};

const parseOrigins = (value) =>
  (value ?? "")
    .split(",")
    .map(toOrigin)
    .filter(Boolean);

const DEV_DEFAULTS = ["http://localhost:5000", "http://localhost:5173"];

const configured = parseOrigins(process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL);

export const allowedOrigins =
  configured.length > 0 ? configured : isProduction ? [] : DEV_DEFAULTS;

if (isProduction && allowedOrigins.length === 0) {
  console.warn(
    "CORS: no origins configured (set CORS_ORIGINS). Browsers will be blocked from calling this API."
  );
}

export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    return callback(
      new ApiError(403, "Origin not allowed", { code: "CORS_ERROR" })
    );
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  // Lets the frontend's JavaScript read these response headers.
  exposedHeaders: ["X-Request-Id", "Retry-After", "RateLimit", "RateLimit-Policy"],
  // Authentication uses Bearer tokens, not cookies, so no credentials needed.
  credentials: false,
  maxAge: 600,
});
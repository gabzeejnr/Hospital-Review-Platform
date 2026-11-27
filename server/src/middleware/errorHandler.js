import { STATUS_CODES } from "node:http";
import { ApiError, ValidationError, codeForStatus } from "../utils/ApiError.js";
import { formatZodIssues } from "../utils/formatZodIssues.js";

// Every error response has the same shape:
//   { success: false, message, code, requestId, errors? }
// Only messages written in this file or in an ApiError are ever sent to the
// client. Raw error messages, stacks and database details stay in the server
// log (and, outside production, in a "debug" field).

const isProduction = () => process.env.NODE_ENV === "production";

const unavailable = (message = "The service is temporarily unavailable. Please try again in a moment.") =>
  new ApiError(503, message, {
    code: "SERVICE_UNAVAILABLE",
    headers: { "Retry-After": "5" },
  });

// ---------------------------------------------------------------------------
// Body parser (express.json) errors
// ---------------------------------------------------------------------------
const BODY_PARSER_ERRORS = {
  "entity.parse.failed": [400, "Malformed JSON in request body", "INVALID_JSON"],
  "entity.too.large": [413, "Request body is too large", "PAYLOAD_TOO_LARGE"],
  "encoding.unsupported": [415, "Unsupported content encoding", "UNSUPPORTED_MEDIA_TYPE"],
  "charset.unsupported": [415, "Unsupported character set", "UNSUPPORTED_MEDIA_TYPE"],
  "request.aborted": [400, "The request was aborted", "BAD_REQUEST"],
  "request.size.invalid": [400, "Request size did not match its Content-Length", "BAD_REQUEST"],
  "parameters.too.many": [413, "Too many parameters", "PAYLOAD_TOO_LARGE"],
};

const fromBodyParser = (err) => {
  const match = BODY_PARSER_ERRORS[err?.type];
  return match ? new ApiError(match[0], match[1], { code: match[2] }) : null;
};

// ---------------------------------------------------------------------------
// Zod (if a schema's .parse() is called directly and throws)
// ---------------------------------------------------------------------------
const fromZod = (err) =>
  err?.name === "ZodError" && Array.isArray(err.issues)
    ? new ValidationError(formatZodIssues(err.issues))
    : null;

// ---------------------------------------------------------------------------
// Prisma (matched by name, so no import path to the generated client is needed)
// ---------------------------------------------------------------------------
// Errors where the connection to the database could not be used.
const PRISMA_CONNECTION_CODES = new Set([
  "P1001", // can't reach database server
  "P1002", // database server timed out
  "P1008", // operation timed out
  "P1011", // TLS connection error
  "P1017", // server closed the connection
  "P2024", // timed out waiting for a connection from the pool
]);

const fromPrisma = (err) => {
  if (typeof err?.name !== "string" || !err.name.startsWith("PrismaClient")) return null;

  if (err.name === "PrismaClientInitializationError") return unavailable();

  if (err.name === "PrismaClientKnownRequestError") {
    if (PRISMA_CONNECTION_CODES.has(err.code)) return unavailable();

    switch (err.code) {
      case "P2002": // unique constraint (the field is deliberately not revealed)
        return new ApiError(409, "A record with these details already exists", { code: "CONFLICT" });
      case "P2025": // record not found
        return new ApiError(404, "The requested resource was not found", { code: "NOT_FOUND" });
      case "P2003": // foreign key constraint
      case "P2014": // relation violation
        return new ApiError(409, "This action conflicts with related data", { code: "CONFLICT" });
      case "P2034": // write conflict / deadlock
        return new ApiError(409, "The request conflicted with another update. Please try again.", { code: "CONFLICT" });
      case "P2000": // value too long for the column
        return new ApiError(400, "One of the submitted values is too long", { code: "BAD_REQUEST" });
      case "P2011": // null constraint
      case "P2012": // missing required value
        return new ApiError(400, "A required value is missing", { code: "BAD_REQUEST" });
      default:
        return null; // unknown Prisma code: handled as an internal error
    }
  }

  // PrismaClientValidationError, UnknownRequestError, RustPanicError: these
  // are bugs or outages, not client mistakes.
  return null;
};

// ---------------------------------------------------------------------------
// Supabase Auth
// ---------------------------------------------------------------------------
const fromSupabaseAuth = (err) => {
  if (err?.__isAuthError !== true) return null;

  const status = Number(err.status) || 0;

  // Network failure or Supabase outage
  if (err.name === "AuthRetryableFetchError" || status >= 500 || status === 0) {
    return unavailable("The authentication service is temporarily unavailable. Please try again in a moment.");
  }

  switch (err.code) {
    case "invalid_credentials":
      return new ApiError(401, "Invalid email or password", { code: "UNAUTHORIZED" });
    case "email_not_confirmed":
      return new ApiError(403, "Please confirm your email address before signing in", { code: "EMAIL_NOT_CONFIRMED" });
    case "user_already_exists":
    case "email_exists":
      // Same wording as any other signup failure, so accounts can't be enumerated.
      return new ApiError(400, "Unable to create your account. Check your details or try signing in.", { code: "BAD_REQUEST" });
    case "weak_password":
      return new ApiError(400, "Password does not meet the requirements", { code: "WEAK_PASSWORD" });
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
    case "over_sms_send_rate_limit":
      return new ApiError(429, "Too many requests. Please try again later.", { code: "RATE_LIMITED" });
    case "bad_jwt":
    case "session_expired":
    case "session_not_found":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
      return new ApiError(401, "Your session has expired. Please sign in again.", { code: "UNAUTHORIZED" });
    case "user_banned":
      return new ApiError(403, "This account is not allowed to sign in", { code: "FORBIDDEN" });
    default:
      break;
  }

  if (status === 429) {
    return new ApiError(429, "Too many requests. Please try again later.", { code: "RATE_LIMITED" });
  }
  if (status === 401) {
    return new ApiError(401, "Authentication required", { code: "UNAUTHORIZED" });
  }
  if (status === 403) {
    return new ApiError(403, "You do not have permission to do that", { code: "FORBIDDEN" });
  }

  return new ApiError(400, "The authentication request could not be completed", { code: "BAD_REQUEST" });
};

// ---------------------------------------------------------------------------
// Any other error that already carries a 4xx status (http-errors, etc.)
// ---------------------------------------------------------------------------
const fromHttpError = (err) => {
  const status = err?.status ?? err?.statusCode;

  if (Number.isInteger(status) && status >= 400 && status < 500) {
    // Use the standard reason phrase, not err.message, which can leak details.
    return new ApiError(status, STATUS_CODES[status] ?? "Bad request", { code: codeForStatus(status) });
  }

  return null;
};

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
const normalizeError = (err) => {
  if (err instanceof ApiError) return err;

  return (
    fromBodyParser(err) ??
    fromZod(err) ??
    fromPrisma(err) ??
    fromSupabaseAuth(err) ??
    fromHttpError(err) ??
    new ApiError(500, "An unexpected error occurred. Please try again later.", {
      code: "INTERNAL_ERROR",
    })
  );
};

// 404 for routes that don't exist
export const notFoundHandler = (req, res, next) => {
  next(new ApiError(404, "Route not found", { code: "NOT_FOUND" }));
};

// Must be registered last, after all routes.
export const errorHandler = (err, req, res, next) => {
  // If the response has already started, let Express close the connection.
  if (res.headersSent) return next(err);

  const apiError = normalizeError(err);
  const { status } = apiError;
  const path = req.originalUrl.split("?")[0]; // never log query strings

  if (status >= 500) {
    console.error(`[${req.id}] ${req.method} ${path} -> ${status} ${apiError.code}`, err);
  } else {
    console.warn(`[${req.id}] ${req.method} ${path} -> ${status} ${apiError.code}`);
  }

  if (apiError.headers) res.set(apiError.headers);

  const body = {
    success: false,
    message: apiError.message,
    code: apiError.code,
    requestId: req.id,
  };

  if (apiError.errors) body.errors = apiError.errors;

  // Outside production, show what really went wrong for server errors.
  if (!isProduction() && status >= 500) {
    body.debug = {
      name: err?.name,
      code: err?.code,
      message: err?.message,
      stack: err?.stack,
    };
  }

  return res.status(status).json(body);
};
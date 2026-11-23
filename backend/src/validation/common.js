import { z } from "zod";

// Friendly messages for missing / wrong-type values.
export const typed = (label, type = "a string") => ({
  error: (issue) =>
    issue.input === undefined ? `${label} is required` : `${label} must be ${type}`,
});

// Request bodies must be a JSON object, and unknown fields are rejected.
export const bodyObject = (shape) =>
  z.strictObject(shape, { error: "Request body must be a JSON object" });

// ---------------------------------------------------------------------------
// Email: trimmed, lower-cased, valid format, max 254 characters.
// ---------------------------------------------------------------------------
export const emailSchema = z
  .string(typed("Email"))
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email must not exceed 254 characters")
  .pipe(z.email("Enter a valid email address"));

// ---------------------------------------------------------------------------
// Passwords
// Never trim a password. Supabase (bcrypt) only uses the first 72 BYTES, so
// longer passwords are rejected instead of being silently truncated.
// ---------------------------------------------------------------------------

// For choosing a NEW password (register, reset, change).
export const newPasswordSchema = z
  .string(typed("Password"))
  .min(8, "Password must be at least 8 characters")
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must not exceed 72 characters"
  )
  .refine((value) => /\p{L}/u.test(value), "Password must include at least one letter")
  .refine((value) => /\d/.test(value), "Password must include at least one number");

// For SIGNING IN: only check presence and size. Do not apply the strength
// rules here, or you reveal the policy and lock out older passwords.
export const loginPasswordSchema = z
  .string(typed("Password"))
  .min(1, "Password is required")
  .max(1024, "Password is too long");

// ---------------------------------------------------------------------------
// Display name: strips control / invisible / bidi-override characters,
// collapses whitespace, rejects < and >, max 100 characters.
// An empty result is treated as "not provided".
// ---------------------------------------------------------------------------
const INVISIBLE_CHARS = /[\p{Cc}\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/gu;

export const displayNameSchema = z
  .string(typed("Display name"))
  .transform((value) => value.replace(INVISIBLE_CHARS, "").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .max(100, "Display name must not exceed 100 characters")
      .refine((value) => !/[<>]/.test(value), "Display name contains invalid characters")
  )
  .transform((value) => (value === "" ? undefined : value));

// For profile updates: a blank name (or null) clears it, instead of being ignored.
export const displayNameUpdateSchema = displayNameSchema
  .nullable()
  .transform((value) => value ?? null);

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------
const MAX_INT4 = 2147483647; // largest value of a Postgres integer / serial column

// UUID in a route param, body or query (e.g. hospital, review, user IDs).
export const uuidSchema = (label = "ID") => z.uuid(`${label} must be a valid UUID`);

// Numeric ID that arrives as a STRING (route params and query strings),
// e.g. /states/:id. Rejects "0", "-1", "1e3", "12abc" and huge numbers.
export const intIdParamSchema = (label = "ID") =>
  z
    .string(typed(label))
    .regex(/^[1-9]\d{0,9}$/, `${label} must be a positive integer`)
    .transform(Number)
    .refine((value) => value <= MAX_INT4, `${label} is out of range`);

// Numeric ID that arrives as a JSON NUMBER in a request body.
export const intIdBodySchema = (label = "ID") =>
  z
    .number(typed(label, "a number"))
    .int(`${label} must be a positive integer`)
    .positive(`${label} must be a positive integer`)
    .max(MAX_INT4, `${label} is out of range`);

// ---------------------------------------------------------------------------
// Query-string helpers
// ---------------------------------------------------------------------------
export const queryIntSchema = (label, { min = 1, max = 1000, fallback } = {}) =>
  z
    .string(typed(label))
    .regex(/^\d{1,9}$/, `${label} must be a whole number`)
    .transform(Number)
    .refine((n) => n >= min && n <= max, `${label} must be between ${min} and ${max}`)
    .optional()
    .transform((value) => value ?? fallback);

export const paginationQuery = z.strictObject({
  page: queryIntSchema("Page", { min: 1, max: 100000, fallback: 1 }),
  limit: queryIntSchema("Limit", { min: 1, max: 100, fallback: 20 }),
});
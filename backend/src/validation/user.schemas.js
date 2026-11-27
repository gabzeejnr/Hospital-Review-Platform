import { z } from "zod";
import { bodyObject, displayNameUpdateSchema, typed } from "./common.js";
import { normalizePhone } from "../utils/phone.js";

// ---------------------------------------------------------------------------
// Settings you may want to change
// ---------------------------------------------------------------------------

// Languages the app accepts. Keep this in step with what the frontend supports.
// en = English, yo = Yoruba, ig = Igbo, ha = Hausa, pcm = Nigerian Pidgin
export const SUPPORTED_LANGUAGES = ["en", "yo", "ig", "ha", "pcm"];

export const THEMES = ["LIGHT", "DARK", "SYSTEM"];

// Handles nobody should be able to claim.
const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "support", "moderator", "mod", "staff",
  "system", "official", "dreel", "api", "help", "security", "settings", "me",
  "null", "undefined", "hospital", "hospitals", "review", "reviews", "team",
]);

// ---------------------------------------------------------------------------
// Field rules
// ---------------------------------------------------------------------------

// 3-30 characters, starts with a letter, then letters, numbers or underscores.
// Stored lower-case so uniqueness is not case-sensitive.
export const usernameSchema = z
  .string(typed("Username"))
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9_]{2,29}$/,
    "Username must be 3-30 characters, start with a letter, and use only letters, numbers and underscores"
  )
  .refine((value) => !RESERVED_USERNAMES.has(value), "That username is not available");

// Stored as international format (E.164), e.g. +2348031234567.
// Nigerian local numbers (08031234567) and 234... numbers are converted
// (see src/utils/phone.js).
export const phoneSchema = z
  .string(typed("Phone number"))
  .max(30, "Phone number is too long")
  .transform(normalizePhone)
  .pipe(
    z
      .string()
      .regex(
        /^\+[1-9]\d{6,14}$/,
        "Enter a valid phone number, for example 08031234567 or +2348031234567"
      )
  );

// Avatars must be images in this project's own Supabase Storage. Arbitrary
// external URLs would let a user make every visitor's browser contact a server
// they control. (Uploading avatars to storage is not built yet.)
export const avatarUrlSchema = z
  .string(typed("Avatar URL"))
  .trim()
  .max(2048, "Avatar URL is too long")
  .refine((value) => {
    try {
      const url = new URL(value);
      const base = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL) : null;

      return (
        base !== null &&
        url.protocol === "https:" &&
        url.origin === base.origin &&
        url.pathname.startsWith("/storage/v1/object/public/") &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Avatar must be an image uploaded to this app's storage");

export const languageSchema = z
  .string(typed("Language"))
  .trim()
  .toLowerCase()
  .pipe(
    z.enum(SUPPORTED_LANGUAGES, {
      error: `Language must be one of: ${SUPPORTED_LANGUAGES.join(", ")}`,
    })
  );

// IANA names only (Africa/Lagos, UTC). JavaScript would also accept offsets
// like "+01:00" and abbreviations like "EST", which we don't want to store.
const canonicalTimezone = (value) => {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions()
      .timeZone;
  } catch {
    return null;
  }
};

export const timezoneSchema = z
  .string(typed("Timezone"))
  .trim()
  .max(64, "Timezone is too long")
  .regex(
    /^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2})$/i,
    "Timezone must be an IANA name such as Africa/Lagos"
  )
  .refine((value) => canonicalTimezone(value) !== null, "Unknown timezone")
  .transform((value) => canonicalTimezone(value));

// Accepts light / dark / system in any letter case.
export const themeSchema = z
  .string(typed("Theme"))
  .trim()
  .toUpperCase()
  .pipe(z.enum(THEMES, { error: "Theme must be light, dark or system" }));

// ---------------------------------------------------------------------------
// Request bodies. Only fields that are sent are changed; null clears a
// clearable field (display name, username, phone number, avatar).
// Email and role are deliberately not here: they have their own flows.
// ---------------------------------------------------------------------------
const atLeastOneField = (value) => Object.keys(value).length > 0;

export const updateProfileBody = bodyObject({
  displayName: displayNameUpdateSchema.optional(),
  username: usernameSchema.nullable().optional(),
  phoneNumber: phoneSchema.nullable().optional(),
  avatarUrl: avatarUrlSchema.nullable().optional(),
  language: languageSchema.optional(),
  timezone: timezoneSchema.optional(),
  theme: themeSchema.optional(),
}).refine(atLeastOneField, "Provide at least one field to update");

const flag = (label) =>
  z.boolean({
    error: (issue) =>
      issue.input === undefined
        ? `${label} is required`
        : `${label} must be true or false`,
  });

// Security alerts can't be switched off by the user, so they are not listed.
export const updateNotificationPreferencesBody = bodyObject({
  emailNotifications: flag("emailNotifications").optional(),
  pushNotifications: flag("pushNotifications").optional(),
  inAppNotifications: flag("inAppNotifications").optional(),
  reviewUpdates: flag("reviewUpdates").optional(),
  hospitalResponses: flag("hospitalResponses").optional(),
  claimUpdates: flag("claimUpdates").optional(),
  promotionalEmails: flag("promotionalEmails").optional(),
}).refine(atLeastOneField, "Provide at least one setting to update");
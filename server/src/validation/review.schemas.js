import { z } from "zod";
import { bodyObject, typed, uuidSchema, queryIntSchema } from "./common.js";

// ---------------------------------------------------------------------------
// Settings you may want to change
// ---------------------------------------------------------------------------
export const RATING_CATEGORIES = [
  "staff_professionalism",
  "waiting_time",
  "cleanliness",
  "communication",
  "service_experience",
  "facility_quality",
  "billing_transparency",
  "accessibility",
];

export const REVIEW_STATUSES = ["pending_moderation", "published", "rejected", "removed"];

const TITLE = { min: 3, max: 150 };
const COMMENT = { min: 20, max: 5000 };
const MAX_VISIT_AGE_YEARS = 10;

// ---------------------------------------------------------------------------
// Text cleaning
// ---------------------------------------------------------------------------
const INVISIBLE = /[\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/gu;

// One line: control and invisible characters removed, spaces collapsed.
export const oneLine = (value) =>
  value.replace(/[\p{Cc}]/gu, " ").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();

// Several lines: keeps line breaks, but no more than one blank line in a row.
export const multiLine = (value) =>
  value
    .replace(/\r\n?/g, "\n")
    .replace(/[^\P{Cc}\n]/gu, "")
    .replace(INVISIBLE, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const NO_LINKS = /\b(?:https?:\/\/|www\.)\S+/i;

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
const titleSchema = z
  .string(typed("Title"))
  .transform(oneLine)
  .pipe(
    z
      .string()
      .min(TITLE.min, `Title must be at least ${TITLE.min} characters`)
      .max(TITLE.max, `Title must not exceed ${TITLE.max} characters`)
  );

// Plain text. Links are refused (a favourite of spammers); the frontend must
// show the text as text, never as HTML.
const commentSchema = z
  .string(typed("Review"))
  .transform(multiLine)
  .pipe(
    z
      .string()
      .min(COMMENT.min, `Review must be at least ${COMMENT.min} characters`)
      .max(COMMENT.max, `Review must not exceed ${COMMENT.max} characters`)
      .refine((value) => !NO_LINKS.test(value), "Links are not allowed in reviews")
  );

const ratingSchema = (label) =>
  z
    .number({
      error: (issue) =>
        issue.input === undefined ? `${label} is required` : `${label} must be a number from 1 to 5`,
    })
    .int(`${label} must be a whole number from 1 to 5`)
    .min(1, `${label} must be from 1 to 5`)
    .max(5, `${label} must be from 1 to 5`);

const categoryRatingsSchema = z
  .array(
    z.strictObject({
      category: z.enum(RATING_CATEGORIES, {
        error: `Category must be one of: ${RATING_CATEGORIES.join(", ")}`,
      }),
      rating: ratingSchema("Rating"),
    }),
    { error: "Ratings must be a list" }
  )
  .max(RATING_CATEGORIES.length, "Too many ratings")
  .refine(
    (list) => new Set(list.map((item) => item.category)).size === list.length,
    "Each category can only be rated once"
  );

const departmentSchema = z
  .string(typed("Department"))
  .transform(oneLine)
  .pipe(
    z
      .string()
      .min(2, "Department must be at least 2 characters")
      .max(100, "Department must not exceed 100 characters")
      .refine((value) => !/[<>]/.test(value), "Department contains invalid characters")
  );

// "2026-11-14": a real calendar day, not in the future, not too long ago.
const visitedOnSchema = z
  .string(typed("Visit date"))
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Visit date must look like 2026-11-14")
  // JavaScript quietly turns 2026-02-31 into 3 March, so check the day really exists.
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Visit date is not a valid date")
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((date) => {
    // One day of slack so a user just ahead of UTC is not rejected.
    const latest = Date.now() + 24 * 60 * 60 * 1000;
    return date.getTime() <= latest;
  }, "Visit date cannot be in the future")
  .refine((date) => {
    const earliest = new Date();
    earliest.setUTCFullYear(earliest.getUTCFullYear() - MAX_VISIT_AGE_YEARS);
    return date.getTime() >= earliest.getTime();
  }, `Visit date cannot be more than ${MAX_VISIT_AGE_YEARS} years ago`);

const isAnonymousSchema = z.boolean({ error: "isAnonymous must be true or false" });

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------
const atLeastOneField = (value) => Object.keys(value).length > 0;

export const createReviewBody = bodyObject({
  title: titleSchema,
  comment: commentSchema,
  overallRating: ratingSchema("Overall rating"),
  ratings: categoryRatingsSchema.optional(),
  visitedOn: visitedOnSchema.optional(),
  department: departmentSchema.optional(),
  isAnonymous: isAnonymousSchema.optional(),
});

// Only the fields sent are changed; null clears visitedOn or department, and a
// new `ratings` list replaces all category ratings.
export const updateReviewBody = bodyObject({
  title: titleSchema.optional(),
  comment: commentSchema.optional(),
  overallRating: ratingSchema("Overall rating").optional(),
  ratings: categoryRatingsSchema.optional(),
  visitedOn: visitedOnSchema.nullable().optional(),
  department: departmentSchema.nullable().optional(),
  isAnonymous: isAnonymousSchema.optional(),
}).refine(atLeastOneField, "Provide at least one field to update");

const reasonSchema = z
  .string(typed("Reason"))
  .transform(oneLine)
  .pipe(
    z
      .string()
      .min(5, "Reason must be at least 5 characters")
      .max(500, "Reason must not exceed 500 characters")
  );

export const rejectReviewBody = bodyObject({ reason: reasonSchema });

// Approving needs no body, but an empty JSON object is accepted.
export const approveReviewBody = bodyObject({});

// ---------------------------------------------------------------------------
// Params and queries
// ---------------------------------------------------------------------------
export const reviewParams = z.strictObject({ id: uuidSchema("Review ID") });

export const listReviewsQuery = z.strictObject({
  sort: z
    .enum(["newest", "oldest", "highest", "lowest"], {
      error: "Sort must be newest, oldest, highest or lowest",
    })
    .optional(),
  page: queryIntSchema("Page", { min: 1, max: 100000, fallback: 1 }),
  limit: queryIntSchema("Limit", { min: 1, max: 50, fallback: 10 }),
});

export const myReviewsQuery = z.strictObject({
  status: z
    .enum(REVIEW_STATUSES, { error: `Status must be one of: ${REVIEW_STATUSES.join(", ")}` })
    .optional(),
  page: queryIntSchema("Page", { min: 1, max: 100000, fallback: 1 }),
  limit: queryIntSchema("Limit", { min: 1, max: 50, fallback: 10 }),
});

export const moderationQueueQuery = z.strictObject({
  status: z
    .enum(REVIEW_STATUSES, { error: `Status must be one of: ${REVIEW_STATUSES.join(", ")}` })
    .optional(),
  page: queryIntSchema("Page", { min: 1, max: 100000, fallback: 1 }),
  limit: queryIntSchema("Limit", { min: 1, max: 50, fallback: 20 }),
});
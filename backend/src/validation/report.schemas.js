import { z } from "zod";
import { bodyObject, typed, uuidSchema, queryIntSchema } from "./common.js";
import { multiLine, NO_LINKS, reviewParams } from "./review.schemas.js";
import { TARGET_TYPES } from "../services/moderationHistory.service.js";

// Rules for review reports, hospital responses, the moderation queues and the
// moderation history (task 6d).

// ---------------------------------------------------------------------------
// Settings you may want to change
// ---------------------------------------------------------------------------
export const REPORT_REASONS = [
  "spam",
  "abusive_language",
  "fake_review",
  "conflict_of_interest",
  "privacy_violation",
  "irrelevant",
  "other",
];
export const REPORT_STATUSES = ["open", "investigating", "upheld", "dismissed"];
export const RESPONSE_STATUSES = ["pending_moderation", "published", "rejected"];

const RESPONSE_MIN = 10;
const RESPONSE_MAX = 1500;
// ---------------------------------------------------------------------------

export { reviewParams };

const text = (label, { min = 0, max }) =>
  z
    .string(typed(label))
    .transform(multiLine)
    .pipe(
      z
        .string()
        .min(min, `${label} must be at least ${min} characters`)
        .max(max, `${label} must not exceed ${max} characters`)
        .refine((value) => !NO_LINKS.test(value), `${label} must not contain links`)
    );

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
export const createReportBody = bodyObject({
  reason: z
    .string(typed("Reason"))
    .trim()
    .toLowerCase()
    .pipe(z.enum(REPORT_REASONS, { error: `Reason must be one of: ${REPORT_REASONS.join(", ")}` })),
  details: text("Details", { max: 1000 })
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
});

// A hospital's reply. Links are refused for the same reason as in reviews: a
// moderator opens these, and a link is the easiest way to mislead one.
export const responseBody = bodyObject({
  body: text("Response", { min: RESPONSE_MIN, max: RESPONSE_MAX }),
});

export const repResponsesQuery = z.strictObject({
  // ?unanswered=true: only reviews with no response yet
  unanswered: z.enum(["true", "false"], { error: "unanswered must be true or false" }).optional(),
  page: queryIntSchema("Page", { min: 1, max: 100000, fallback: 1 }),
  limit: queryIntSchema("Limit", { min: 1, max: 50, fallback: 10 }),
});

// ---------------------------------------------------------------------------
// Moderators
// ---------------------------------------------------------------------------
const note = (required) => {
  const field = text("Note", { min: required ? 3 : 0, max: 500 });
  return required ? field : field.transform((value) => (value === "" ? undefined : value)).optional();
};

export const investigateBody = bodyObject({ note: note(false) });
export const dismissBody = bodyObject({ note: note(false) });
// Passing a case to an administrator needs a reason, so the admin knows why.
export const escalateBody = bodyObject({ note: note(true) });
// Upholding takes the review down; the reason is shown to its author.
export const upholdBody = bodyObject({ reason: text("Reason", { min: 3, max: 500 }) });

export const responseParams = z.strictObject({ id: uuidSchema("Response ID") });

const pagination = (defaultLimit, maxLimit) => ({
  page: queryIntSchema("Page", { min: 1, max: 100000, fallback: 1 }),
  limit: queryIntSchema("Limit", { min: 1, max: maxLimit, fallback: defaultLimit }),
});

export const reportQueueQuery = z.strictObject({
  status: z
    .enum(REPORT_STATUSES, { error: `Status must be one of: ${REPORT_STATUSES.join(", ")}` })
    .optional(),
  // ?escalated=true: only cases passed to an administrator
  escalated: z.enum(["true", "false"], { error: "escalated must be true or false" }).optional(),
  ...pagination(10, 50),
});

export const responseQueueQuery = z.strictObject({
  status: z
    .enum(RESPONSE_STATUSES, { error: `Status must be one of: ${RESPONSE_STATUSES.join(", ")}` })
    .optional(),
  ...pagination(10, 50),
});

export const historyQuery = z.strictObject({
  targetType: z
    .enum(TARGET_TYPES, { error: `targetType must be one of: ${TARGET_TYPES.join(", ")}` })
    .optional(),
  targetId: uuidSchema("targetId").optional(),
  actorId: uuidSchema("actorId").optional(),
  action: z
    .string(typed("action"))
    .trim()
    .toLowerCase()
    .regex(/^[a-z_]+\.[a-z_]+$/, "action looks like review.approve")
    .max(50)
    .optional(),
  ...pagination(25, 100),
});
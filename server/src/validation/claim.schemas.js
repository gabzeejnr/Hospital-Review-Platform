import { z } from "zod";
import { bodyObject, typed, uuidSchema, emailSchema, queryIntSchema } from "./common.js";
import { phoneSchema } from "./user.schemas.js";
import { oneLine, multiLine, NO_LINKS } from "./review.schemas.js";
import { SOCIAL_PLATFORMS, SOCIAL_LABELS, cleanSocialUrl } from "../utils/socialLinks.js";

// ---------------------------------------------------------------------------
// Settings you may want to change
// ---------------------------------------------------------------------------
export const CLAIM_STATUSES = ["pending", "approved", "rejected", "withdrawn"];
export const VERIFICATION_STATUSES = ["pending", "approved", "rejected"];

// What kind of registration a hospital quotes when asking to be verified.
//   cac = Corporate Affairs Commission, mdcn = Medical and Dental Council of Nigeria
export const REGISTRATION_BODIES = ["cac", "mdcn", "state_ministry", "other"];

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
const plainLine = (label, min, max) =>
  z
    .string(typed(label))
    .transform(oneLine)
    .pipe(
      z
        .string()
        .min(min, `${label} must be at least ${min} characters`)
        .max(max, `${label} must not exceed ${max} characters`)
        .refine((value) => !/[<>]/.test(value), `${label} must not contain < or >`)
    );

// Plain text. Links are refused: moderators open these messages, and a link is
// the easiest way to try to trick them.
const messageSchema = z
  .string(typed("Message"))
  .transform(multiLine)
  .pipe(
    z
      .string()
      .max(1000, "Message must not exceed 1000 characters")
      .refine((value) => !NO_LINKS.test(value), "Links are not allowed in this message")
  )
  .transform((value) => (value === "" ? undefined : value));

const reasonSchema = z
  .string(typed("Reason"))
  .transform(multiLine)
  .pipe(
    z
      .string()
      .min(3, "Reason must be at least 3 characters")
      .max(500, "Reason must not exceed 500 characters")
  );

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------
export const createClaimBody = bodyObject({
  jobTitle: plainLine("Job title", 2, 100),
  officialEmail: emailSchema.optional(),
  officialPhone: phoneSchema.optional(),
  message: messageSchema.optional(),
});

export const createVerificationBody = bodyObject({
  registrationBody: z
    .string(typed("Registration body"))
    .trim()
    .toLowerCase()
    .pipe(
      z.enum(REGISTRATION_BODIES, {
        error: `Registration body must be one of: ${REGISTRATION_BODIES.join(", ")}`,
      })
    ),
  registrationNumber: plainLine("Registration number", 3, 50).refine(
    (value) => /^[A-Za-z0-9][A-Za-z0-9 ./-]*$/.test(value),
    "Registration number may only contain letters, numbers, spaces, dots, slashes and dashes"
  ),
  officialEmail: emailSchema.optional(),
  message: messageSchema.optional(),
});

// Each link is a web address (cleaned and checked by src/utils/socialLinks.js)
// or null, which removes that link.
const socialLinkField = (platform) =>
  z
    .string(typed(`${SOCIAL_LABELS[platform]} link`))
    .nullable()
    .transform((value, ctx) => {
      if (value === null) return null;

      const cleaned = cleanSocialUrl(platform, value);
      if (cleaned === null) {
        ctx.addIssue({
          code: "custom",
          message: `Enter a link to a ${SOCIAL_LABELS[platform]} page, for example ${
            platform === "facebook" ? "https://facebook.com/yourhospital" : `https://${platform === "x" ? "x.com" : `${platform}.com`}/yourhospital`
          }`,
        });
        return z.NEVER;
      }

      return cleaned;
    })
    .optional();

export const updateSocialMediaBody = bodyObject(
  Object.fromEntries(SOCIAL_PLATFORMS.map((platform) => [platform, socialLinkField(platform)]))
).refine((body) => Object.keys(body).length > 0, {
  message: "Provide at least one link to add, change or remove",
});

export const rejectBody = bodyObject({ reason: reasonSchema });
export const suspendBody = bodyObject({ reason: reasonSchema });
export const emptyBody = bodyObject({});

// ---------------------------------------------------------------------------
// Params and queries
// ---------------------------------------------------------------------------
export const claimParams = z.strictObject({ id: uuidSchema("Claim ID") });
export const verificationParams = z.strictObject({ id: uuidSchema("Verification request ID") });

const pagination = {
  page: queryIntSchema("Page", { min: 1, max: 100000, fallback: 1 }),
  limit: queryIntSchema("Limit", { min: 1, max: 50, fallback: 10 }),
};

const statusFilter = (values) =>
  z
    .enum(values, { error: `Status must be one of: ${values.join(", ")}` })
    .optional();

export const myClaimsQuery = z.strictObject({ status: statusFilter(CLAIM_STATUSES), ...pagination });
export const claimQueueQuery = z.strictObject({ status: statusFilter(CLAIM_STATUSES), ...pagination });
export const verificationQueueQuery = z.strictObject({
  status: statusFilter(VERIFICATION_STATUSES),
  ...pagination,
});
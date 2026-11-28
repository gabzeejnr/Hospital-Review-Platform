import { z } from "zod";
import { bodyObject, typed, uuidSchema, queryIntSchema } from "./common.js";
import { multiLine, NO_LINKS } from "./review.schemas.js";
import { ASSIGNABLE_ROLES } from "../utils/roles.js";

// Rules for account management (task 7).

const ALL_ROLES = ["USER", "HOSPITAL_REP", "MODERATOR", "SUPPORT", "ADMIN"];

// The person sees this reason in their notification, so it must be plain text
// without links (a link is the easiest way to phish somebody).
const reason = (label) =>
  z
    .string(typed(label))
    .transform(multiLine)
    .pipe(
      z
        .string()
        .min(3, `${label} must be at least 3 characters`)
        .max(500, `${label} must not exceed 500 characters`)
        .refine((value) => !NO_LINKS.test(value), `${label} must not contain links`)
    );

export const userParams = z.strictObject({ id: uuidSchema("User ID") });

export const changeRoleBody = bodyObject({
  role: z
    .string(typed("Role"))
    .trim()
    .toUpperCase()
    .pipe(z.enum(ASSIGNABLE_ROLES, { error: `Role must be one of: ${ASSIGNABLE_ROLES.join(", ")}` })),
  reason: reason("Reason"),
});

export const suspendUserBody = bodyObject({ reason: reason("Reason") });

export const usersQuery = z.strictObject({
  // Matches part of the email, display name or username.
  q: z
    .string(typed("q"))
    .trim()
    .min(1, "q must not be empty")
    .max(100, "q must not exceed 100 characters")
    .optional(),
  role: z
    .string(typed("role"))
    .trim()
    .toUpperCase()
    .pipe(z.enum(ALL_ROLES, { error: `role must be one of: ${ALL_ROLES.join(", ")}` }))
    .optional(),
  status: z.enum(["active", "suspended"], { error: "status must be active or suspended" }).optional(),
  page: queryIntSchema("Page", { min: 1, max: 100000, fallback: 1 }),
  limit: queryIntSchema("Limit", { min: 1, max: 50, fallback: 20 }),
});
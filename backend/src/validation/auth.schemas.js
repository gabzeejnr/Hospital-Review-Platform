import { z } from "zod";
import {
  bodyObject,
  emailSchema,
  newPasswordSchema,
  loginPasswordSchema,
  displayNameSchema,
} from "./common.js";

// bodyObject = strict object: any field not listed here is rejected (blocks mass-assignment,
// e.g. someone sending { "role": "ADMIN" } to the register endpoint).

export const registerBody = bodyObject({
  email: emailSchema,
  password: newPasswordSchema,
  displayName: displayNameSchema.nullish(),
});

export const loginBody = bodyObject({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const forgotPasswordBody = bodyObject({
  email: emailSchema,
});

export const resendConfirmationBody = bodyObject({
  email: emailSchema,
});

export const logoutBody = bodyObject({
  refreshToken: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Refresh token is required"
          : "Refresh token must be a string",
    })
    .min(1, "Refresh token is required")
    .max(2048, "Refresh token is too long"),
});
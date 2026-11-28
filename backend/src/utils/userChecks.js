import { ApiError } from "./ApiError.js";

// Reporting, claiming and reviewing all need a confirmed email address, so a
// throwaway account cannot be created and used straight away.
export const requireConfirmedEmail = (user, action) => {
  if (!user.emailVerifiedAt) {
    throw new ApiError(403, `Please confirm your email address before ${action}`, {
      code: "EMAIL_NOT_VERIFIED",
    });
  }
};
import supabase from "../config/supabase.js";
import prisma from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";

// Supabase unreachable or rate limiting: the token itself may be fine, so let
// the central error handler answer with 503 / 429 instead of a false 401.
const isOutageOrRateLimit = (error) =>
  error?.name === "AuthRetryableFetchError" ||
  error?.status === 0 ||
  error?.status >= 500 ||
  error?.status === 429;

// Access tokens are JWTs: three base64url segments. Anything else is rejected
// here, without a network call to Supabase.
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_TOKEN_LENGTH = 4096;

/**
 * Authenticate requests using a Supabase access token.
 * Errors are thrown and handled by the central error handler (Express 5).
 */
export const authenticate = async (req, res, next) => {
  const authorization = req.headers.authorization;

  // Require the Bearer authentication scheme.
  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new ApiError(
      401,
      "Authentication required. Please provide an access token.",
      { code: "UNAUTHORIZED" }
    );
  }

  const accessToken = authorization.slice(7).trim();

  if (!accessToken) {
    throw new ApiError(401, "Access token is missing.", {
      code: "UNAUTHORIZED",
    });
  }

  if (accessToken.length > MAX_TOKEN_LENGTH || !JWT_SHAPE.test(accessToken)) {
    throw new ApiError(401, "Invalid or expired access token.", {
      code: "UNAUTHORIZED",
    });
  }

  // Verify the token with Supabase Auth.
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError && isOutageOrRateLimit(authError)) throw authError;

  if (authError || !authUser) {
    throw new ApiError(401, "Invalid or expired access token.", {
      code: "UNAUTHORIZED",
    });
  }

  // Retrieve the corresponding application user.
  const user = await prisma.user.findUnique({
    where: {
      id: authUser.id,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      username: true,
      avatarUrl: true,
      emailVerifiedAt: true,
      role: true,
      isActive: true,
      language: true,
      timezone: true,
      theme: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new ApiError(401, "User profile not found.", {
      code: "UNAUTHORIZED",
    });
  }

  if (!user.isActive) {
    throw new ApiError(403, "Your account has been deactivated.", {
      code: "ACCOUNT_DEACTIVATED",
    });
  }

  // Make authenticated user information available to controllers.
  req.user = user;
  req.accessToken = accessToken;

  next();
};

/**
 * Authorize users based on their application roles.
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        new ApiError(401, "Authentication required.", { code: "UNAUTHORIZED" })
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ApiError(403, "You do not have permission to perform this action.", {
          code: "FORBIDDEN",
        })
      );
    }

    next();
  };
};
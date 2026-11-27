import prisma from "../src/config/prisma.js";
import { createSupabaseAuthClient } from "../src/config/supabase.js";
import { ApiError } from "../src/utils/ApiError.js";
import {
  recordLogin,
  recordSecurityEvent,
  hashEmail,
} from "../src/services/audit.service.js";

// Error handling: these handlers don't wrap everything in try/catch. Express 5
// passes thrown / rejected errors to the central error handler
// (src/middleware/errorHandler.js), which maps Prisma, Supabase and unexpected
// errors to safe, consistent JSON responses.
// Request bodies are already validated and normalized by the validate()
// middleware (see src/validation/auth.schemas.js).
// Audit logging is fire-and-forget (`void ...`): it never delays or fails a
// request. See src/services/audit.service.js.

const GENERIC_SIGNUP_ERROR =
  "Unable to create your account. Check your details or try signing in.";

// Used for BOTH new and already-registered emails, so the response can't be
// used to find out who has an account.
const REGISTER_PENDING_MESSAGE =
  "Account created. Please check your email to verify your account. " +
  "If you already have an account, sign in or reset your password instead.";

// Supabase being unreachable, or rate limiting us: let the central handler
// answer with 503 / 429 instead of pretending the credentials were wrong.
const isOutageOrRateLimit = (error) =>
  error?.name === "AuthRetryableFetchError" ||
  error?.status === 0 ||
  error?.status >= 500 ||
  error?.status === 429;

const getPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  username: user.username,
  avatarUrl: user.avatarUrl,
  emailVerifiedAt: user.emailVerifiedAt,
  role: user.role,
  isActive: user.isActive,
  language: user.language,
  timezone: user.timezone,
  theme: user.theme,
  createdAt: user.createdAt,
});

// REGISTER
export const register = async (req, res) => {
  const { email, password, displayName } = req.body;

  const supabase = createSupabaseAuthClient();

  // Supabase creates the Auth account.
  // The PostgreSQL trigger creates the corresponding public.users record.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName ?? null,
      },
    },
  });

  if (error || !data.user) {
    console.error("Registration error:", error?.message);

    // Rate limited by Supabase, or Supabase unreachable.
    if (error && isOutageOrRateLimit(error)) throw error;

    throw new ApiError(400, GENERIC_SIGNUP_ERROR);
  }

  const authUser = data.user;

  // Built from the signup result: no database read, so a database hiccup can't
  // make a successful signup look like a failure.
  const publicUser = {
    id: authUser.id,
    email: authUser.email,
    displayName: displayName ?? null,
  };

  // Email already registered: Supabase returns a user with no identities.
  // Respond exactly as for a new signup so the endpoint can't be used to find
  // out which emails have accounts.
  if (
    Array.isArray(authUser.identities) &&
    authUser.identities.length === 0
  ) {
    void recordSecurityEvent(null, "REGISTRATION_DUPLICATE_EMAIL", {
      emailHash: hashEmail(email),
    });

    return res.status(201).json({
      success: true,
      message: REGISTER_PENDING_MESSAGE,
      requiresEmailConfirmation: true,
      user: publicUser,
      session: null,
    });
  }

  void recordSecurityEvent(authUser.id, "ACCOUNT_REGISTERED");

  const requiresEmailConfirmation = !data.session;

  return res.status(201).json({
    success: true,
    message: requiresEmailConfirmation
      ? REGISTER_PENDING_MESSAGE
      : "Account created successfully.",
    requiresEmailConfirmation,
    user: publicUser,
    session: data.session
      ? {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      }
      : null,
  });
};

// LOGIN
export const login = async (req, res) => {
  const { email, password } = req.body;

  const supabase = createSupabaseAuthClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user || !data.session) {
    // Supabase down or rate limiting: not a credentials problem.
    if (error && isOutageOrRateLimit(error)) throw error;

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    }).catch(() => null);

    const unconfirmed = error?.code === "email_not_confirmed";
    const reason = unconfirmed ? "Email not confirmed" : "Invalid credentials";

    void recordLogin(existingUser?.id ?? null, false, reason);
    void recordSecurityEvent(existingUser?.id ?? null, "LOGIN_FAILED", {
      reason,
      emailHash: hashEmail(email),
    });

    // Supabase only reports an unconfirmed email after the password was
    // correct, so telling the user is safe and lets them request a new link.
    if (unconfirmed) throw error;

    throw new ApiError(401, "Invalid email or password", {
      code: "UNAUTHORIZED",
    });
  }

  const authUser = data.user;

  const existingUser = await prisma.user.findUnique({
    where: {
      id: authUser.id,
    },
  });

  if (!existingUser) {
    console.error(
      "Login profile missing for Supabase user:",
      authUser.id
    );

    throw new ApiError(
      500,
      "Unable to load your account. Please contact support.",
      { code: "INTERNAL_ERROR" }
    );
  }

  // Update existing profile information.
  const user = await prisma.user.update({
    where: {
      id: authUser.id,
    },
    data: {
      email: authUser.email,
      emailVerifiedAt: authUser.email_confirmed_at
        ? new Date(authUser.email_confirmed_at)
        : null,
      lastLoginAt: new Date(),
    },
  });

  if (!user.isActive) {
    void recordLogin(user.id, false, "Account deactivated");
    void recordSecurityEvent(user.id, "LOGIN_BLOCKED_DEACTIVATED");

    await supabase.auth.signOut({
      scope: "local",
    });

    throw new ApiError(403, "This account has been deactivated", {
      code: "ACCOUNT_DEACTIVATED",
    });
  }

  void recordLogin(user.id, true);
  void recordSecurityEvent(user.id, "LOGIN_SUCCESSFUL");

  return res.status(200).json({
    success: true,
    message: "Login successful",
    user: getPublicUser(user),
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    },
  });
};

// LOGOUT
export const logout = async (req, res) => {
  const { refreshToken } = req.body;

  const supabase = createSupabaseAuthClient();

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: req.accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) {
    if (isOutageOrRateLimit(sessionError)) throw sessionError;

    throw new ApiError(401, "Invalid session", { code: "UNAUTHORIZED" });
  }

  const { error } = await supabase.auth.signOut({
    scope: "local",
  });

  if (error) {
    console.error("Logout error:", error.message);

    if (isOutageOrRateLimit(error)) throw error;

    throw new ApiError(400, "Unable to sign out");
  }

  void recordSecurityEvent(req.user.id, "LOGOUT");

  return res.status(200).json({
    success: true,
    message: "Signed out successfully. Please clear your local session.",
  });
};

// CURRENT USER
export const getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: getPublicUser(req.user),
  });
};

// FORGOT PASSWORD
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  const redirectTo = process.env.PASSWORD_RESET_REDIRECT_URL;

  if (!redirectTo) {
    console.error("PASSWORD_RESET_REDIRECT_URL is not configured");

    throw new ApiError(500, "Password recovery is temporarily unavailable", {
      code: "INTERNAL_ERROR",
    });
  }

  const supabase = createSupabaseAuthClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    console.error("Password reset request error:", error.message);
  }

  void recordSecurityEvent(null, "PASSWORD_RESET_REQUESTED", {
    emailHash: hashEmail(email),
  });

  // Same response whether or not the account exists.
  return res.status(200).json({
    success: true,
    message:
      "If an account exists with that email, password reset instructions will be sent.",
  });
};

// RESEND CONFIRMATION EMAIL
export const resendConfirmation = async (req, res) => {
  const { email } = req.body;

  const supabase = createSupabaseAuthClient();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    ...(process.env.FRONTEND_URL && {
      options: { emailRedirectTo: process.env.FRONTEND_URL },
    }),
  });

  if (error) {
    console.error("Resend confirmation error:", error.message);
  }

  void recordSecurityEvent(null, "CONFIRMATION_EMAIL_REQUESTED", {
    emailHash: hashEmail(email),
  });

  // Same response whether or not the account exists or is already confirmed.
  return res.status(200).json({
    success: true,
    message:
      "If an unconfirmed account exists with that email, a new confirmation email will be sent.",
  });
};
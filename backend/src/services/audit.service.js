import { createHash } from "node:crypto";
import prisma from "../config/prisma.js";
import { getRequestContext } from "../utils/requestContext.js";

// Audit logging. Every function here swallows its own errors: a logging failure
// must never break a user's request. Call them WITHOUT await (e.g.
// `void recordSecurityEvent(...)`) so a slow or failing database can't delay
// the response either.

// Short one-way hash of an email, so repeated attacks on the same address can
// be spotted in the logs without storing the address itself.
export const hashEmail = (email) =>
  createHash("sha256")
    .update(String(email).trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);

// Writes a SecurityEvent. The request ID, client IP and user agent of the
// current request are added to `metadata` automatically.
export const recordSecurityEvent = async (userId, eventType, metadata = {}) => {
  try {
    await prisma.securityEvent.create({
      data: {
        userId: userId ?? null,
        eventType,
        metadata: { ...getRequestContext(), ...metadata },
      },
    });
  } catch (error) {
    console.error("Could not record security event:", error.message);
  }
};

export const recordLogin = async (userId, successful, failureReason = null) => {
  try {
    await prisma.loginActivity.create({
      data: {
        userId: userId ?? null,
        successful,
        failureReason,
      },
    });
  } catch (error) {
    console.error("Could not record login activity:", error.message);
  }
};
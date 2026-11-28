import prisma from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";

// Who may act for a hospital, and what state its claim/verification is in.
// (hospitals.verification_status has seven values; see README section 5.)

// A hospital in one of these states can still be claimed.
export const OPEN_FOR_CLAIMS = ["unclaimed", "claim_pending", "rejected"];

// A hospital in one of these states has a representative.
export const HAS_REPRESENTATIVE = ["claimed", "verification_pending", "verified"];

export const getActiveStaff = (hospitalId, userId, client = prisma) =>
  client.hospitalStaff.findFirst({
    where: { hospitalId, userId, isActive: true },
    select: { id: true, jobTitle: true },
  });

// Throws unless the user is an approved, active representative of the hospital.
export const requireRepresentative = async (hospitalId, userId) => {
  const staff = await getActiveStaff(hospitalId, userId);

  if (!staff) {
    throw new ApiError(403, "Only a representative of this hospital can do this", {
      code: "NOT_HOSPITAL_REPRESENTATIVE",
    });
  }

  return staff;
};

// People who work for a hospital, or have applied to, must not review it:
// their opinion is not independent. They respond to reviews instead (task 6d).
export const assertNoConflictOfInterest = async (hospitalId, userId) => {
  const [staff, claim] = await Promise.all([
    getActiveStaff(hospitalId, userId),
    prisma.hospitalClaim.findFirst({
      where: { hospitalId, userId, status: "pending" },
      select: { id: true },
    }),
  ]);

  if (staff || claim) {
    throw new ApiError(
      403,
      "Representatives of a hospital, and people who have applied to represent it, cannot review it",
      { code: "CONFLICT_OF_INTEREST" }
    );
  }
};

// Every transaction that changes a hospital's claims or status must call this
// FIRST. It locks the hospital's row, so two moderators (or a moderator and a
// claimant) working on the same hospital queue up instead of each locking part
// of it and then waiting for the other, which PostgreSQL ends with a deadlock
// error. Always lock the hospital before any claim or verification row.
export const lockHospital = (tx, hospitalId) =>
  tx.$queryRaw`SELECT id FROM hospitals WHERE id = ${hospitalId}::uuid FOR UPDATE`;

// Works out what a hospital's status should be from its claims, staff and
// verification history. Used to restore a hospital after a suspension. Pass the
// transaction client so the answer is consistent with the surrounding changes.
export const deriveStatus = async (tx, hospitalId) => {
  const staff = await tx.hospitalStaff.count({ where: { hospitalId, isActive: true } });

  if (staff > 0) {
    const approved = await tx.hospitalVerificationRequest.count({
      where: { hospitalId, status: "approved" },
    });
    if (approved > 0) return "verified";

    const pending = await tx.hospitalVerificationRequest.count({
      where: { hospitalId, status: "pending" },
    });
    return pending > 0 ? "verification_pending" : "claimed";
  }

  const pendingClaims = await tx.hospitalClaim.count({ where: { hospitalId, status: "pending" } });
  return pendingClaims > 0 ? "claim_pending" : "unclaimed";
};
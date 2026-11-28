import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";
import { recordSecurityEvent } from "../src/services/audit.service.js";
import { OPEN_FOR_CLAIMS, deriveStatus, lockHospital } from "../src/services/hospitalAccess.js";
import { uploadedDocuments, presentDocument, scheduleDocumentDeletion } from "../src/utils/documents.js";
import { notify, notifyMany } from "../src/services/notification.service.js";
import { recordModerationAction } from "../src/services/moderationHistory.service.js";

// Claim and verification review for MODERATOR and ADMIN accounts, and hospital
// suspension for ADMIN accounts only (enforced in src/routes/moderationRoutes.js).
// The status changes this causes are described in claim.controller.js.

// ---------------------------------------------------------------------------
// Settings you may want to change
// ---------------------------------------------------------------------------
// A verification request cannot be approved without at least one uploaded
// document. Set to false to let moderators approve on written details alone.
const REQUIRE_DOCUMENT_FOR_VERIFICATION = true;
// ---------------------------------------------------------------------------

const hospitalRef = {
  select: {
    id: true,
    hospital_name: true,
    city: true,
    verification_status: true,
    states: { select: { id: true, name: true } },
  },
};

// Moderators need a way to contact the person to check their story, so (unlike
// reviews) claim and verification queues do include the email address.
const personRef = { select: { id: true, displayName: true, email: true } };

const presentHospital = (hospital) => ({
  id: hospital.id,
  hospitalName: hospital.hospital_name,
  location: { state: hospital.states, city: hospital.city },
  status: hospital.verification_status,
});

const presentPerson = (person) =>
  person ? { id: person.id, displayName: person.displayName, email: person.email } : null;

const reviewFields = (row) => ({
  status: row.status,
  reviewNote: row.reviewNote,
  reviewedAt: row.reviewedAt,
  reviewedBy: presentPerson(row.reviewer),
  createdAt: row.createdAt,
});

const claimSelect = {
  id: true,
  jobTitle: true,
  officialEmail: true,
  officialPhone: true,
  message: true,
  status: true,
  reviewNote: true,
  reviewedAt: true,
  createdAt: true,
  hospital: hospitalRef,
  claimant: personRef,
  reviewer: personRef,
  documents: uploadedDocuments,
};

const presentClaim = (claim) => ({
  id: claim.id,
  hospital: presentHospital(claim.hospital),
  claimant: presentPerson(claim.claimant),
  jobTitle: claim.jobTitle,
  officialEmail: claim.officialEmail,
  officialPhone: claim.officialPhone,
  message: claim.message,
  documents: claim.documents.map(presentDocument),
  ...reviewFields(claim),
});

const verificationSelect = {
  id: true,
  registrationBody: true,
  registrationNumber: true,
  officialEmail: true,
  message: true,
  status: true,
  reviewNote: true,
  reviewedAt: true,
  createdAt: true,
  hospital: hospitalRef,
  requester: personRef,
  reviewer: personRef,
  documents: uploadedDocuments,
};

const presentVerification = (request) => ({
  id: request.id,
  hospital: presentHospital(request.hospital),
  requestedBy: presentPerson(request.requester),
  registrationBody: request.registrationBody,
  registrationNumber: request.registrationNumber,
  officialEmail: request.officialEmail,
  message: request.message,
  documents: request.documents.map(presentDocument),
  ...reviewFields(request),
});

const page = (page, limit, total) => ({ page, limit, total, totalPages: Math.ceil(total / limit) });

const alreadyReviewed = (what) =>
  new ApiError(409, `This ${what} has already been reviewed`, { code: "ALREADY_REVIEWED" });

const statusConflict = () =>
  new ApiError(409, "The hospital's status no longer allows this. Check it and try again.", {
    code: "HOSPITAL_STATUS_CONFLICT",
  });

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

// GET /api/moderation/claims?status=pending   (oldest first, so nothing waits forever)
export const listClaims = async (req, res) => {
  const { page: pageNumber, limit, status = "pending" } = req.validatedQuery;
  const where = { status };

  const [claims, total] = await Promise.all([
    prisma.hospitalClaim.findMany({
      where,
      select: claimSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (pageNumber - 1) * limit,
      take: limit,
    }),
    prisma.hospitalClaim.count({ where }),
  ]);

  return res.status(200).json({
    success: true,
    claims: claims.map(presentClaim),
    pagination: page(pageNumber, limit, total),
  });
};

const loadClaim = async (req) => {
  const claim = await prisma.hospitalClaim.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      userId: true,
      hospitalId: true,
      jobTitle: true,
      hospital: { select: { hospital_name: true } },
    },
  });

  if (!claim) throw new ApiError(404, "Claim not found", { code: "CLAIM_NOT_FOUND" });

  // Nobody reviews their own claim.
  if (claim.userId === req.user.id) {
    throw new ApiError(403, "You cannot review your own claim", {
      code: "CANNOT_REVIEW_OWN_CLAIM",
    });
  }

  return claim;
};

const loadReviewedClaim = async (id) =>
  presentClaim(await prisma.hospitalClaim.findUnique({ where: { id }, select: claimSelect }));

// POST /api/moderation/claims/:id/approve
// The claimant becomes a representative and the hospital becomes "claimed". Any
// other claims waiting for the same hospital are closed.
export const approveClaim = async (req, res) => {
  const claim = await loadClaim(req);
  const now = new Date();
  let supersededUserIds = [];

  await prisma.$transaction(async (tx) => {
    await lockHospital(tx, claim.hospitalId);

    // One atomic step: if two moderators act at once, exactly one succeeds.
    const result = await tx.hospitalClaim.updateMany({
      where: { id: claim.id, status: "pending" },
      data: { status: "approved", reviewedById: req.user.id, reviewedAt: now, reviewNote: null },
    });
    if (result.count === 0) throw alreadyReviewed("claim");

    const moved = await tx.hospitals.updateMany({
      where: { id: claim.hospitalId, verification_status: { in: OPEN_FOR_CLAIMS } },
      data: { verification_status: "claimed", updated_at: now },
    });
    if (moved.count === 0) throw statusConflict();

    await tx.hospitalStaff.upsert({
      where: { hospitalId_userId: { hospitalId: claim.hospitalId, userId: claim.userId } },
      create: {
        hospitalId: claim.hospitalId,
        userId: claim.userId,
        jobTitle: claim.jobTitle,
        claimId: claim.id,
      },
      update: { isActive: true, jobTitle: claim.jobTitle, claimId: claim.id },
    });

    const rivals = await tx.hospitalClaim.findMany({
      where: { hospitalId: claim.hospitalId, status: "pending", id: { not: claim.id } },
      select: { id: true, userId: true },
    });
    supersededUserIds = rivals.map((rival) => rival.userId);

    await scheduleDocumentDeletion(tx, { claimId: { in: [claim.id, ...rivals.map((r) => r.id)] } });

    await tx.hospitalClaim.updateMany({
      where: { hospitalId: claim.hospitalId, status: "pending", id: { not: claim.id } },
      data: {
        status: "rejected",
        reviewedById: req.user.id,
        reviewedAt: now,
        reviewNote: "Another claim for this hospital was approved",
      },
    });

    await recordModerationAction(tx, req.user, {
      action: "claim.approve",
      targetType: "claim",
      targetId: claim.id,
      hospitalId: claim.hospitalId,
    });
  });

  void recordSecurityEvent(req.user.id, "HOSPITAL_CLAIM_APPROVED", {
    claimId: claim.id,
    hospitalId: claim.hospitalId,
    claimantId: claim.userId,
  });

  const hospitalName = claim.hospital.hospital_name;
  void notify(claim.userId, "claim.approved", { hospitalName }, { claimId: claim.id, hospitalId: claim.hospitalId });
  void notifyMany(supersededUserIds, "claim.superseded", { hospitalName }, { hospitalId: claim.hospitalId });

  return res.status(200).json({
    success: true,
    message: "Claim approved",
    claim: await loadReviewedClaim(claim.id),
  });
};

// POST /api/moderation/claims/:id/reject   { "reason": "..." }
export const rejectClaim = async (req, res) => {
  const claim = await loadClaim(req);

  await prisma.$transaction(async (tx) => {
    await lockHospital(tx, claim.hospitalId);

    const result = await tx.hospitalClaim.updateMany({
      where: { id: claim.id, status: "pending" },
      data: {
        status: "rejected",
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        reviewNote: req.body.reason,
      },
    });
    if (result.count === 0) throw alreadyReviewed("claim");

    await scheduleDocumentDeletion(tx, { claimId: claim.id });

    // Last open claim gone: the hospital is "rejected" (and can be claimed again).
    const stillPending = await tx.hospitalClaim.count({
      where: { hospitalId: claim.hospitalId, status: "pending" },
    });

    if (stillPending === 0) {
      await tx.hospitals.updateMany({
        where: { id: claim.hospitalId, verification_status: "claim_pending" },
        data: { verification_status: "rejected", updated_at: new Date() },
      });
    }

    await recordModerationAction(tx, req.user, {
      action: "claim.reject",
      targetType: "claim",
      targetId: claim.id,
      hospitalId: claim.hospitalId,
      note: req.body.reason,
    });
  });

  void recordSecurityEvent(req.user.id, "HOSPITAL_CLAIM_REJECTED", {
    claimId: claim.id,
    hospitalId: claim.hospitalId,
    claimantId: claim.userId,
  });

  void notify(
    claim.userId,
    "claim.rejected",
    { hospitalName: claim.hospital.hospital_name, reason: req.body.reason },
    { claimId: claim.id, hospitalId: claim.hospitalId }
  );

  return res.status(200).json({
    success: true,
    message: "Claim rejected",
    claim: await loadReviewedClaim(claim.id),
  });
};

// ---------------------------------------------------------------------------
// Verification requests
// ---------------------------------------------------------------------------

// GET /api/moderation/verifications?status=pending
export const listVerifications = async (req, res) => {
  const { page: pageNumber, limit, status = "pending" } = req.validatedQuery;
  const where = { status };

  const [requests, total] = await Promise.all([
    prisma.hospitalVerificationRequest.findMany({
      where,
      select: verificationSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (pageNumber - 1) * limit,
      take: limit,
    }),
    prisma.hospitalVerificationRequest.count({ where }),
  ]);

  return res.status(200).json({
    success: true,
    verifications: requests.map(presentVerification),
    pagination: page(pageNumber, limit, total),
  });
};

const loadVerification = async (req) => {
  const request = await prisma.hospitalVerificationRequest.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      requestedById: true,
      hospitalId: true,
      hospital: { select: { hospital_name: true } },
    },
  });

  if (!request) {
    throw new ApiError(404, "Verification request not found", { code: "VERIFICATION_NOT_FOUND" });
  }

  if (request.requestedById && request.requestedById === req.user.id) {
    throw new ApiError(403, "You cannot review your own verification request", {
      code: "CANNOT_REVIEW_OWN_REQUEST",
    });
  }

  return request;
};

const loadReviewedVerification = async (id) =>
  presentVerification(
    await prisma.hospitalVerificationRequest.findUnique({ where: { id }, select: verificationSelect })
  );

// POST /api/moderation/verifications/:id/approve
export const approveVerification = async (req, res) => {
  const request = await loadVerification(req);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await lockHospital(tx, request.hospitalId);

    const result = await tx.hospitalVerificationRequest.updateMany({
      where: { id: request.id, status: "pending" },
      data: { status: "approved", reviewedById: req.user.id, reviewedAt: now, reviewNote: null },
    });
    if (result.count === 0) throw alreadyReviewed("verification request");

    const documents = await tx.hospitalDocument.count({
      where: { verificationRequestId: request.id, status: "uploaded" },
    });

    if (REQUIRE_DOCUMENT_FOR_VERIFICATION && documents === 0) {
      throw new ApiError(409, "This request has no uploaded documents. Ask the representative to add them.", {
        code: "DOCUMENTS_REQUIRED",
      });
    }

    await scheduleDocumentDeletion(tx, { verificationRequestId: request.id });

    const moved = await tx.hospitals.updateMany({
      where: { id: request.hospitalId, verification_status: "verification_pending" },
      data: { verification_status: "verified", updated_at: now },
    });
    if (moved.count === 0) throw statusConflict();

    await recordModerationAction(tx, req.user, {
      action: "verification.approve",
      targetType: "verification",
      targetId: request.id,
      hospitalId: request.hospitalId,
    });
  });

  void recordSecurityEvent(req.user.id, "HOSPITAL_VERIFICATION_APPROVED", {
    requestId: request.id,
    hospitalId: request.hospitalId,
  });

  void notify(
    request.requestedById,
    "verification.approved",
    { hospitalName: request.hospital.hospital_name },
    { verificationId: request.id, hospitalId: request.hospitalId }
  );

  return res.status(200).json({
    success: true,
    message: "Hospital verified",
    verification: await loadReviewedVerification(request.id),
  });
};

// POST /api/moderation/verifications/:id/reject   { "reason": "..." }
// The hospital goes back to "claimed": its representative can submit new details.
export const rejectVerification = async (req, res) => {
  const request = await loadVerification(req);

  await prisma.$transaction(async (tx) => {
    await lockHospital(tx, request.hospitalId);

    const result = await tx.hospitalVerificationRequest.updateMany({
      where: { id: request.id, status: "pending" },
      data: {
        status: "rejected",
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        reviewNote: req.body.reason,
      },
    });
    if (result.count === 0) throw alreadyReviewed("verification request");

    await scheduleDocumentDeletion(tx, { verificationRequestId: request.id });

    await tx.hospitals.updateMany({
      where: { id: request.hospitalId, verification_status: "verification_pending" },
      data: { verification_status: "claimed", updated_at: new Date() },
    });

    await recordModerationAction(tx, req.user, {
      action: "verification.reject",
      targetType: "verification",
      targetId: request.id,
      hospitalId: request.hospitalId,
      note: req.body.reason,
    });
  });

  void recordSecurityEvent(req.user.id, "HOSPITAL_VERIFICATION_REJECTED", {
    requestId: request.id,
    hospitalId: request.hospitalId,
  });

  void notify(
    request.requestedById,
    "verification.rejected",
    { hospitalName: request.hospital.hospital_name, reason: req.body.reason },
    { verificationId: request.id, hospitalId: request.hospitalId }
  );

  return res.status(200).json({
    success: true,
    message: "Verification rejected",
    verification: await loadReviewedVerification(request.id),
  });
};

// ---------------------------------------------------------------------------
// Suspension (ADMIN only)
// ---------------------------------------------------------------------------

// Tells everyone who represents the hospital. (The admin's reason is internal and
// is not included.)
const notifyRepresentatives = async (hospitalId, type) => {
  const [hospital, staff] = await Promise.all([
    prisma.hospitals.findUnique({ where: { id: hospitalId }, select: { hospital_name: true } }),
    prisma.hospitalStaff.findMany({ where: { hospitalId, isActive: true }, select: { userId: true } }),
  ]);

  if (hospital) {
    void notifyMany(staff.map((row) => row.userId), type, { hospitalName: hospital.hospital_name }, { hospitalId });
  }
};

// POST /api/moderation/hospitals/:id/suspend   { "reason": "..." }
export const suspendHospital = async (req, res) => {
  const hospital = await prisma.hospitals.findUnique({
    where: { id: req.params.id },
    select: { verification_status: true },
  });

  if (!hospital) throw new ApiError(404, "Hospital not found", { code: "HOSPITAL_NOT_FOUND" });

  await prisma.$transaction(async (tx) => {
    const result = await tx.hospitals.updateMany({
      where: { id: req.params.id, verification_status: { not: "suspended" } },
      data: { verification_status: "suspended", updated_at: new Date() },
    });

    if (result.count === 0) {
      throw new ApiError(409, "This hospital is already suspended", {
        code: "HOSPITAL_ALREADY_SUSPENDED",
      });
    }

    await recordModerationAction(tx, req.user, {
      action: "hospital.suspend",
      targetType: "hospital",
      targetId: req.params.id,
      hospitalId: req.params.id,
      note: req.body.reason,
    });
  });

  void recordSecurityEvent(req.user.id, "HOSPITAL_SUSPENDED", {
    hospitalId: req.params.id,
    previousStatus: hospital.verification_status,
    reason: req.body.reason,
  });

  void notifyRepresentatives(req.params.id, "hospital.suspended");

  return res.status(200).json({ success: true, message: "Hospital suspended" });
};

// POST /api/moderation/hospitals/:id/unsuspend
// The status is worked out again from the hospital's claims, staff and
// verification history, so a verified hospital comes back verified.
export const unsuspendHospital = async (req, res) => {
  const hospitalId = req.params.id;

  const status = await prisma.$transaction(async (tx) => {
    await lockHospital(tx, hospitalId);

    const exists = await tx.hospitals.findUnique({
      where: { id: hospitalId },
      select: { verification_status: true },
    });

    if (!exists) throw new ApiError(404, "Hospital not found", { code: "HOSPITAL_NOT_FOUND" });

    const restored = await deriveStatus(tx, hospitalId);

    const result = await tx.hospitals.updateMany({
      where: { id: hospitalId, verification_status: "suspended" },
      data: { verification_status: restored, updated_at: new Date() },
    });

    if (result.count === 0) {
      throw new ApiError(409, "This hospital is not suspended", { code: "HOSPITAL_NOT_SUSPENDED" });
    }

    await recordModerationAction(tx, req.user, {
      action: "hospital.restore",
      targetType: "hospital",
      targetId: hospitalId,
      hospitalId,
      note: `Restored as ${restored}`,
    });

    return restored;
  });

  void recordSecurityEvent(req.user.id, "HOSPITAL_RESTORED", { hospitalId, status });
  void notifyRepresentatives(hospitalId, "hospital.restored");

  return res.status(200).json({ success: true, message: "Hospital restored", status });
};
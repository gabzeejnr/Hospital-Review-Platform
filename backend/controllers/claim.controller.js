import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";
import { recordSecurityEvent } from "../src/services/audit.service.js";
import { notify } from "../src/services/notification.service.js";
import {
  OPEN_FOR_CLAIMS,
  HAS_REPRESENTATIVE,
  requireRepresentative,
  lockHospital,
} from "../src/services/hospitalAccess.js";
import { cleanSocialMedia } from "../src/utils/socialLinks.js";
import { liveDocuments, presentDocument, scheduleDocumentDeletion } from "../src/utils/documents.js";

// Hospital claims, verification requests and social links, for signed-in users.
// Moderators review claims and requests in claimModeration.controller.js.
//
// A hospital's status (hospitals.verification_status) moves like this:
//   unclaimed -> claim_pending       somebody submits a claim
//   claim_pending -> claimed         a moderator approves a claim
//   claim_pending -> rejected        the last open claim is rejected (can be claimed again)
//   claimed -> verification_pending  a representative asks for verification
//   verification_pending -> verified a moderator approves it (or back to claimed if rejected)
//   any -> suspended                 an admin suspends the hospital (and can restore it)

// ---------------------------------------------------------------------------
// Settings you may want to change
// ---------------------------------------------------------------------------
// How many claims one person may have waiting at the same time.
const MAX_OPEN_CLAIMS_PER_USER = 3;

// ---------------------------------------------------------------------------

const requireConfirmedEmail = (user, action) => {
  if (!user.emailVerifiedAt) {
    throw new ApiError(403, `Please confirm your email address before ${action}`, {
      code: "EMAIL_NOT_VERIFIED",
    });
  }
};

const hospitalRef = { select: { id: true, hospital_name: true } };

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
  documents: liveDocuments,
};

const presentClaim = (claim) => ({
  id: claim.id,
  hospital: { id: claim.hospital.id, hospitalName: claim.hospital.hospital_name },
  jobTitle: claim.jobTitle,
  officialEmail: claim.officialEmail,
  officialPhone: claim.officialPhone,
  message: claim.message,
  status: claim.status,
  // Shown so a person whose claim was rejected knows why.
  reviewNote: claim.reviewNote,
  reviewedAt: claim.reviewedAt,
  createdAt: claim.createdAt,
  documents: (claim.documents ?? []).map(presentDocument),
});

const notFound = () => new ApiError(404, "Hospital not found", { code: "HOSPITAL_NOT_FOUND" });

// POST /api/hospitals/:id/claims
export const createClaim = async (req, res) => {
  const hospitalId = req.params.id;
  requireConfirmedEmail(req.user, "claiming a hospital");

  const hospital = await prisma.hospitals.findUnique({
    where: { id: hospitalId },
    select: { verification_status: true },
  });
  if (!hospital) throw notFound();

  if (hospital.verification_status === "suspended") {
    throw new ApiError(409, "This hospital cannot be claimed right now", {
      code: "HOSPITAL_SUSPENDED",
    });
  }

  if (!OPEN_FOR_CLAIMS.includes(hospital.verification_status)) {
    throw new ApiError(409, "This hospital has already been claimed", {
      code: "HOSPITAL_ALREADY_CLAIMED",
    });
  }

  const open = await prisma.hospitalClaim.count({
    where: { userId: req.user.id, status: "pending" },
  });
  if (open >= MAX_OPEN_CLAIMS_PER_USER) {
    throw new ApiError(
      409,
      `You can have at most ${MAX_OPEN_CLAIMS_PER_USER} claims waiting for review. Wait for a decision or withdraw one.`,
      { code: "TOO_MANY_OPEN_CLAIMS" }
    );
  }

  let claim;

  try {
    claim = await prisma.$transaction(async (tx) => {
      await lockHospital(tx, hospitalId);

      const created = await tx.hospitalClaim.create({
        data: { ...req.body, hospitalId, userId: req.user.id },
        select: claimSelect,
      });

      // Guards against the hospital being claimed by somebody else a moment ago.
      const moved = await tx.hospitals.updateMany({
        where: { id: hospitalId, verification_status: { in: OPEN_FOR_CLAIMS } },
        data: { verification_status: "claim_pending", updated_at: new Date() },
      });

      if (moved.count === 0) {
        throw new ApiError(409, "This hospital has already been claimed", {
          code: "HOSPITAL_ALREADY_CLAIMED",
        });
      }

      return created;
    });
  } catch (error) {
    // The only unique rule on claims: one pending claim per person per hospital.
    if (error?.code === "P2002") {
      throw new ApiError(409, "You already have a claim waiting for review for this hospital", {
        code: "CLAIM_ALREADY_PENDING",
      });
    }

    throw error;
  }

  void recordSecurityEvent(req.user.id, "HOSPITAL_CLAIM_SUBMITTED", {
    claimId: claim.id,
    hospitalId,
  });

  void notify(
    req.user.id,
    "claim.submitted",
    { hospitalName: claim.hospital.hospital_name },
    { claimId: claim.id, hospitalId }
  );

  return res.status(201).json({
    success: true,
    message: "Your claim has been submitted. A moderator will review it.",
    claim: presentClaim(claim),
  });
};

// POST /api/claims/:id/withdraw
export const withdrawClaim = async (req, res) => {
  const claim = await prisma.hospitalClaim.findUnique({
    where: { id: req.params.id },
    select: { id: true, userId: true, hospitalId: true },
  });

  // Somebody else's claim looks exactly like one that does not exist.
  if (!claim || claim.userId !== req.user.id) {
    throw new ApiError(404, "Claim not found", { code: "CLAIM_NOT_FOUND" });
  }

  await prisma.$transaction(async (tx) => {
    await lockHospital(tx, claim.hospitalId);

    const result = await tx.hospitalClaim.updateMany({
      where: { id: claim.id, status: "pending" },
      data: { status: "withdrawn" },
    });

    if (result.count === 0) {
      throw new ApiError(409, "Only a claim that is waiting for review can be withdrawn", {
        code: "CLAIM_NOT_PENDING",
      });
    }

    await scheduleDocumentDeletion(tx, { claimId: claim.id });

    // Nobody else is waiting: the hospital goes back to unclaimed.
    const stillPending = await tx.hospitalClaim.count({
      where: { hospitalId: claim.hospitalId, status: "pending" },
    });

    if (stillPending === 0) {
      await tx.hospitals.updateMany({
        where: { id: claim.hospitalId, verification_status: "claim_pending" },
        data: { verification_status: "unclaimed", updated_at: new Date() },
      });
    }
  });

  void recordSecurityEvent(req.user.id, "HOSPITAL_CLAIM_WITHDRAWN", {
    claimId: claim.id,
    hospitalId: claim.hospitalId,
  });

  return res.status(200).json({ success: true, message: "Claim withdrawn" });
};

// GET /api/users/me/claims
export const getMyClaims = async (req, res) => {
  const { page, limit, status } = req.validatedQuery;
  const where = { userId: req.user.id, ...(status && { status }) };

  const [claims, total] = await Promise.all([
    prisma.hospitalClaim.findMany({
      where,
      select: claimSelect,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.hospitalClaim.count({ where }),
  ]);

  return res.status(200).json({
    success: true,
    claims: claims.map(presentClaim),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};

// GET /api/users/me/hospitals: the hospitals this person represents. Unlike the
// public pages, this shows the real status (including suspended) because it is
// the representative's own hospital.
export const getMyHospitals = async (req, res) => {
  const staff = await prisma.hospitalStaff.findMany({
    where: { userId: req.user.id, isActive: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      jobTitle: true,
      createdAt: true,
      hospital: {
        select: {
          id: true,
          hospital_name: true,
          city: true,
          verification_status: true,
          social_media: true,
          states: { select: { id: true, name: true } },
        },
      },
    },
  });

  return res.status(200).json({
    success: true,
    hospitals: staff.map((row) => ({
      id: row.hospital.id,
      hospitalName: row.hospital.hospital_name,
      location: { state: row.hospital.states, city: row.hospital.city },
      status: row.hospital.verification_status,
      socialMedia: cleanSocialMedia(row.hospital.social_media),
      jobTitle: row.jobTitle,
      representativeSince: row.createdAt,
    })),
  });
};

// POST /api/hospitals/:id/verification
export const createVerification = async (req, res) => {
  const hospitalId = req.params.id;

  const hospital = await prisma.hospitals.findUnique({
    where: { id: hospitalId },
    select: { verification_status: true, hospital_name: true },
  });
  if (!hospital) throw notFound();

  await requireRepresentative(hospitalId, req.user.id);

  const refusals = {
    suspended: ["HOSPITAL_SUSPENDED", "This hospital is suspended"],
    verification_pending: [
      "VERIFICATION_ALREADY_PENDING",
      "A verification request for this hospital is already waiting for review",
    ],
    verified: ["ALREADY_VERIFIED", "This hospital is already verified"],
  };

  if (hospital.verification_status !== "claimed") {
    const [code, message] = refusals[hospital.verification_status] ?? [
      "HOSPITAL_NOT_CLAIMED",
      "Only a claimed hospital can be verified",
    ];
    throw new ApiError(409, message, { code });
  }

  let request;

  try {
    request = await prisma.$transaction(async (tx) => {
      await lockHospital(tx, hospitalId);

      const created = await tx.hospitalVerificationRequest.create({
        data: { ...req.body, hospitalId, requestedById: req.user.id },
        select: {
          id: true,
          registrationBody: true,
          registrationNumber: true,
          status: true,
          createdAt: true,
        },
      });

      const moved = await tx.hospitals.updateMany({
        where: { id: hospitalId, verification_status: "claimed" },
        data: { verification_status: "verification_pending", updated_at: new Date() },
      });

      if (moved.count === 0) {
        throw new ApiError(409, "This hospital's status changed. Please check it and try again.", {
          code: "HOSPITAL_STATUS_CONFLICT",
        });
      }

      return created;
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new ApiError(
        409,
        "A verification request for this hospital is already waiting for review",
        { code: "VERIFICATION_ALREADY_PENDING" }
      );
    }

    throw error;
  }

  void recordSecurityEvent(req.user.id, "HOSPITAL_VERIFICATION_REQUESTED", {
    requestId: request.id,
    hospitalId,
  });

  void notify(
    req.user.id,
    "verification.submitted",
    { hospitalName: hospital.hospital_name },
    { verificationId: request.id, hospitalId }
  );

  return res.status(201).json({
    success: true,
    message: "Your verification request has been submitted. A moderator will review it.",
    verification: request,
  });
};

// PATCH /api/hospitals/:id/social-media
// Each link is added, changed, or (with null) removed. Shown publicly only while
// the hospital is claimed or verified.
export const updateSocialMedia = async (req, res) => {
  const hospitalId = req.params.id;

  const hospital = await prisma.hospitals.findUnique({
    where: { id: hospitalId },
    select: { verification_status: true, social_media: true },
  });
  if (!hospital) throw notFound();

  await requireRepresentative(hospitalId, req.user.id);

  if (!HAS_REPRESENTATIVE.includes(hospital.verification_status)) {
    throw new ApiError(409, "This hospital's profile cannot be edited right now", {
      code: "HOSPITAL_NOT_ACTIVE",
    });
  }

  const socialMedia = cleanSocialMedia(hospital.social_media);

  for (const [platform, link] of Object.entries(req.body)) {
    if (link === null) delete socialMedia[platform];
    else socialMedia[platform] = link;
  }

  await prisma.hospitals.update({
    where: { id: hospitalId },
    data: { social_media: socialMedia, updated_at: new Date() },
    select: { id: true },
  });

  void recordSecurityEvent(req.user.id, "HOSPITAL_SOCIAL_MEDIA_UPDATED", {
    hospitalId,
    platforms: Object.keys(req.body),
  });

  return res.status(200).json({
    success: true,
    message: "Social links updated",
    socialMedia,
  });
};

// GET /api/hospitals/:id/verification   (representatives)
// Their verification requests, newest first, with the decision note and the
// documents attached, so the page can resume after a reload.
export const getHospitalVerifications = async (req, res) => {
  const hospitalId = req.params.id;

  const exists = await prisma.hospitals.findUnique({ where: { id: hospitalId }, select: { id: true } });
  if (!exists) throw notFound();

  await requireRepresentative(hospitalId, req.user.id);

  const requests = await prisma.hospitalVerificationRequest.findMany({
    where: { hospitalId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 5,
    select: {
      id: true,
      registrationBody: true,
      registrationNumber: true,
      status: true,
      reviewNote: true,
      reviewedAt: true,
      createdAt: true,
      documents: liveDocuments,
    },
  });

  return res.status(200).json({
    success: true,
    verifications: requests.map((request) => ({
      id: request.id,
      registrationBody: request.registrationBody,
      registrationNumber: request.registrationNumber,
      status: request.status,
      reviewNote: request.reviewNote,
      reviewedAt: request.reviewedAt,
      createdAt: request.createdAt,
      documents: request.documents.map(presentDocument),
    })),
  });
};
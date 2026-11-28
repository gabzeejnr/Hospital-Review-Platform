import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";
import { recordSecurityEvent } from "../src/services/audit.service.js";
import { recordModerationAction } from "../src/services/moderationHistory.service.js";
import { notify } from "../src/services/notification.service.js";

// Checking hospital responses before they appear, for MODERATOR and ADMIN
// accounts (enforced in src/routes/moderationRoutes.js). The responses themselves
// are written in response.controller.js.

const select = {
  id: true,
  body: true,
  status: true,
  moderationNote: true,
  moderatedAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  hospital: { select: { id: true, hospital_name: true } },
  author: { select: { id: true, displayName: true } },
  moderator: { select: { id: true, displayName: true } },
  // The review being answered, so a moderator can judge the reply in context.
  review: {
    select: {
      id: true,
      title: true,
      comment: true,
      overallRating: true,
      status: true,
      isAnonymous: true,
      author: { select: { id: true, displayName: true } },
    },
  },
};

const person = (user) => (user ? { id: user.id, displayName: user.displayName } : null);

const present = (response) => ({
  id: response.id,
  hospital: { id: response.hospital.id, name: response.hospital.hospital_name },
  writtenBy: person(response.author),
  body: response.body,
  status: response.status,
  moderationNote: response.moderationNote,
  moderatedAt: response.moderatedAt,
  moderatedBy: person(response.moderator),
  publishedAt: response.publishedAt,
  createdAt: response.createdAt,
  updatedAt: response.updatedAt,
  review: {
    id: response.review.id,
    title: response.review.title,
    comment: response.review.comment,
    overallRating: response.review.overallRating,
    status: response.review.status,
    author: person(response.review.author),
  },
});

const alreadyDecided = () =>
  new ApiError(409, "This response has already been moderated", { code: "RESPONSE_ALREADY_MODERATED" });

// GET /api/moderation/responses?status=pending_moderation   (oldest first)
export const listResponseQueue = async (req, res) => {
  const { page, limit, status = "pending_moderation" } = req.validatedQuery;
  const where = { status };

  const [responses, total] = await Promise.all([
    prisma.reviewResponse.findMany({
      where,
      select,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.reviewResponse.count({ where }),
  ]);

  return res.status(200).json({
    success: true,
    responses: responses.map(present),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};

const load = async (req) => {
  const response = await prisma.reviewResponse.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      reviewId: true,
      hospitalId: true,
      authorId: true,
      review: { select: { userId: true, status: true } },
      hospital: { select: { hospital_name: true } },
    },
  });

  if (!response) throw new ApiError(404, "Response not found", { code: "RESPONSE_NOT_FOUND" });

  // Nobody approves their own writing, and nobody moderates replies to their own review.
  if (response.authorId === req.user.id || response.review.userId === req.user.id) {
    throw new ApiError(403, "You cannot moderate this response", { code: "CANNOT_MODERATE_OWN_RESPONSE" });
  }

  return response;
};

const reload = async (id) =>
  present(await prisma.reviewResponse.findUnique({ where: { id }, select }));

// POST /api/moderation/responses/:id/approve
export const approveResponse = async (req, res) => {
  const response = await load(req);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // A reply to a review that is no longer published must not appear.
    if (response.review.status !== "published") {
      throw new ApiError(409, "The review this answers is not published", { code: "REVIEW_NOT_PUBLISHED" });
    }

    const result = await tx.reviewResponse.updateMany({
      where: { id: response.id, status: { in: ["pending_moderation", "rejected"] } },
      data: {
        status: "published",
        publishedAt: now,
        moderatedById: req.user.id,
        moderatedAt: now,
        moderationNote: null,
      },
    });
    if (result.count === 0) throw alreadyDecided();

    await recordModerationAction(tx, req.user, {
      action: "response.approve",
      targetType: "response",
      targetId: response.id,
      hospitalId: response.hospitalId,
    });
  });

  void recordSecurityEvent(req.user.id, "REVIEW_RESPONSE_APPROVED", {
    responseId: response.id,
    reviewId: response.reviewId,
    hospitalId: response.hospitalId,
  });

  const values = { hospitalName: response.hospital.hospital_name };
  const data = { reviewId: response.reviewId, hospitalId: response.hospitalId };

  void notify(response.authorId, "response.approved", values, data);
  void notify(response.review.userId, "response.received", values, data);

  return res.status(200).json({
    success: true,
    message: "Response published",
    response: await reload(response.id),
  });
};

// POST /api/moderation/responses/:id/reject   { "reason": "..." }
// Works on waiting responses and on published ones (which are then taken down).
export const rejectResponse = async (req, res) => {
  const response = await load(req);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const result = await tx.reviewResponse.updateMany({
      where: { id: response.id, status: { in: ["pending_moderation", "published"] } },
      data: {
        status: "rejected",
        publishedAt: null,
        moderatedById: req.user.id,
        moderatedAt: now,
        moderationNote: req.body.reason,
      },
    });
    if (result.count === 0) throw alreadyDecided();

    await recordModerationAction(tx, req.user, {
      action: "response.reject",
      targetType: "response",
      targetId: response.id,
      hospitalId: response.hospitalId,
      note: req.body.reason,
    });
  });

  void recordSecurityEvent(req.user.id, "REVIEW_RESPONSE_REJECTED", {
    responseId: response.id,
    reviewId: response.reviewId,
    hospitalId: response.hospitalId,
  });

  void notify(
    response.authorId,
    "response.rejected",
    { hospitalName: response.hospital.hospital_name, reason: req.body.reason },
    { reviewId: response.reviewId, hospitalId: response.hospitalId }
  );

  return res.status(200).json({
    success: true,
    message: "Response rejected",
    response: await reload(response.id),
  });
};
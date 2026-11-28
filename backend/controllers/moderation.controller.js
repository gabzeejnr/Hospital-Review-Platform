import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";
import { recordSecurityEvent } from "../src/services/audit.service.js";
import { notify } from "../src/services/notification.service.js";
import { recordModerationAction } from "../src/services/moderationHistory.service.js";

// Review moderation for MODERATOR and ADMIN accounts (enforced in
// src/routes/moderationRoutes.js). Reports from users, hospital responses and a
// moderation history log come later (task 6d).

const day = (date) => (date ? date.toISOString().slice(0, 10) : null);

export const queueSelect = {
  id: true,
  title: true,
  comment: true,
  overallRating: true,
  visitedOn: true,
  department: true,
  isAnonymous: true,
  status: true,
  moderationNote: true,
  moderatedAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  ratings: { select: { category: true, rating: true } },
  hospital: { select: { id: true, hospital_name: true } },
  // Moderators see who wrote a review, even an anonymous one, so abuse can be
  // dealt with. Never the email address.
  author: { select: { id: true, displayName: true } },
  moderator: { select: { id: true, displayName: true } },
};

export const presentForModeration = (review) => ({
  id: review.id,
  hospital: { id: review.hospital.id, name: review.hospital.hospital_name },
  author: review.author
    ? { id: review.author.id, displayName: review.author.displayName }
    : null,
  title: review.title,
  comment: review.comment,
  overallRating: review.overallRating,
  ratings: review.ratings.map(({ category, rating }) => ({ category, rating })),
  visitedOn: day(review.visitedOn),
  department: review.department,
  isAnonymous: review.isAnonymous,
  status: review.status,
  moderationNote: review.moderationNote,
  moderatedAt: review.moderatedAt,
  moderatedBy: review.moderator
    ? { id: review.moderator.id, displayName: review.moderator.displayName }
    : null,
  publishedAt: review.publishedAt,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
});

// GET /api/moderation/reviews?status=pending_moderation
// Oldest first, so nothing waits forever.
export const listReviewQueue = async (req, res) => {
  const { page, limit, status = "pending_moderation" } = req.validatedQuery;

  const where = { status };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      select: queueSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.review.count({ where }),
  ]);

  return res.status(200).json({
    success: true,
    reviews: reviews.map(presentForModeration),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};

const loadForModeration = async (req) => {
  const review = await prisma.review.findUnique({
    where: { id: req.params.id },
    select: { id: true, userId: true, hospitalId: true, hospital: { select: { hospital_name: true } } },
  });

  if (!review) {
    throw new ApiError(404, "Review not found", { code: "REVIEW_NOT_FOUND" });
  }

  // Nobody moderates their own writing.
  if (review.userId && review.userId === req.user.id) {
    throw new ApiError(403, "You cannot moderate your own review", {
      code: "CANNOT_MODERATE_OWN_REVIEW",
    });
  }

  return review;
};

const alreadyModerated = () =>
  new ApiError(409, "This review has already been moderated", {
    code: "REVIEW_ALREADY_MODERATED",
  });

const loadModerated = async (id) =>
  presentForModeration(
    await prisma.review.findUnique({ where: { id }, select: queueSelect })
  );

// POST /api/moderation/reviews/:id/approve
export const approveReview = async (req, res) => {
  const review = await loadForModeration(req);
  const now = new Date();

  // One atomic step, with its history record: if two moderators act at once,
  // exactly one succeeds, and there is never a decision without a record.
  await prisma.$transaction(async (tx) => {
    const result = await tx.review.updateMany({
      where: { id: review.id, status: { in: ["pending_moderation", "rejected"] } },
      data: {
        status: "published",
        publishedAt: now,
        moderatedById: req.user.id,
        moderatedAt: now,
        moderationNote: null,
      },
    });

    if (result.count === 0) throw alreadyModerated();

    await recordModerationAction(tx, req.user, {
      action: "review.approve",
      targetType: "review",
      targetId: review.id,
      hospitalId: review.hospitalId,
    });
  });

  void recordSecurityEvent(req.user.id, "REVIEW_APPROVED", {
    reviewId: review.id,
    hospitalId: review.hospitalId,
  });

  // The author is told in private, even if the review is shown as anonymous.
  void notify(
    review.userId,
    "review.published",
    { hospitalName: review.hospital.hospital_name },
    { reviewId: review.id, hospitalId: review.hospitalId }
  );

  return res.status(200).json({
    success: true,
    message: "Review published",
    review: await loadModerated(review.id),
  });
};

// POST /api/moderation/reviews/:id/reject   { "reason": "..." }
// Works on pending reviews and on published ones (which are then taken down).
export const rejectReview = async (req, res) => {
  const review = await loadForModeration(req);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const result = await tx.review.updateMany({
      where: { id: review.id, status: { in: ["pending_moderation", "published"] } },
      data: {
        status: "rejected",
        publishedAt: null,
        moderatedById: req.user.id,
        moderatedAt: now,
        moderationNote: req.body.reason,
      },
    });

    if (result.count === 0) throw alreadyModerated();

    await recordModerationAction(tx, req.user, {
      action: "review.reject",
      targetType: "review",
      targetId: review.id,
      hospitalId: review.hospitalId,
      note: req.body.reason,
    });
  });

  void recordSecurityEvent(req.user.id, "REVIEW_REJECTED", {
    reviewId: review.id,
    hospitalId: review.hospitalId,
  });

  void notify(
    review.userId,
    "review.rejected",
    { hospitalName: review.hospital.hospital_name, reason: req.body.reason },
    { reviewId: review.id, hospitalId: review.hospitalId }
  );

  return res.status(200).json({
    success: true,
    message: "Review rejected",
    review: await loadModerated(review.id),
  });
};
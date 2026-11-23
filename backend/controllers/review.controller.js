import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";
import { recordSecurityEvent } from "../src/services/audit.service.js";
import { RATING_CATEGORIES } from "../src/validation/review.schemas.js";

// Reviews of hospitals. Request bodies and queries are already validated and
// cleaned by validate() (see src/validation/review.schemas.js).
//
// Rules in short:
//  - one review per user per hospital (a database constraint);
//  - new reviews wait for a moderator unless REVIEWS_REQUIRE_MODERATION=false;
//  - editing the wording, ratings or department sends a review back to moderation;
//  - a hospital's average rating counts published reviews only (kept up to date
//    by database triggers, see prisma/migrations/20261122_add_reviews).

const requiresModeration = () => process.env.REVIEWS_REQUIRE_MODERATION !== "false";

// Editing any of these means the text people see has changed.
const CONTENT_FIELDS = ["title", "comment", "overallRating", "ratings", "department"];

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------
const categoryOrder = new Map(RATING_CATEGORIES.map((category, index) => [category, index]));

const presentRatings = (ratings) =>
  [...ratings]
    .sort((a, b) => categoryOrder.get(a.category) - categoryOrder.get(b.category))
    .map(({ category, rating }) => ({ category, rating }));

const day = (date) => (date ? date.toISOString().slice(0, 10) : null);

const publicSelect = {
  id: true,
  title: true,
  comment: true,
  overallRating: true,
  visitedOn: true,
  department: true,
  isAnonymous: true,
  publishedAt: true,
  ratings: { select: { category: true, rating: true } },
  author: { select: { displayName: true, avatarUrl: true } },
};

// Anonymous reviews (and reviews whose author deleted their account) never
// reveal who wrote them.
const presentAuthor = (review) => {
  const hidden = review.isAnonymous || !review.author;

  return {
    name: hidden ? "Anonymous" : review.author.displayName ?? "Anonymous",
    avatarUrl: hidden ? null : review.author.avatarUrl ?? null,
  };
};

const presentPublicReview = (review) => ({
  id: review.id,
  title: review.title,
  comment: review.comment,
  overallRating: review.overallRating,
  ratings: presentRatings(review.ratings),
  visitedOn: day(review.visitedOn),
  department: review.department,
  author: presentAuthor(review),
  publishedAt: review.publishedAt,
});

const ownSelect = {
  id: true,
  title: true,
  comment: true,
  overallRating: true,
  visitedOn: true,
  department: true,
  isAnonymous: true,
  status: true,
  moderationNote: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  ratings: { select: { category: true, rating: true } },
  hospital: { select: { id: true, hospital_name: true } },
};

const presentOwnReview = (review) => ({
  id: review.id,
  hospital: { id: review.hospital.id, name: review.hospital.hospital_name },
  title: review.title,
  comment: review.comment,
  overallRating: review.overallRating,
  ratings: presentRatings(review.ratings),
  visitedOn: day(review.visitedOn),
  department: review.department,
  isAnonymous: review.isAnonymous,
  status: review.status,
  // Why a review was rejected, so the author can fix it.
  moderationNote: review.status === "rejected" ? review.moderationNote : null,
  publishedAt: review.publishedAt,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
});

const assertHospitalExists = async (hospitalId) => {
  const hospital = await prisma.hospitals.findUnique({
    where: { id: hospitalId },
    select: { id: true },
  });

  if (!hospital) {
    throw new ApiError(404, "Hospital not found", { code: "HOSPITAL_NOT_FOUND" });
  }
};

const paginate = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------
const publicOrderBy = {
  newest: [{ publishedAt: "desc" }, { id: "asc" }],
  oldest: [{ publishedAt: "asc" }, { id: "asc" }],
  highest: [{ overallRating: "desc" }, { publishedAt: "desc" }, { id: "asc" }],
  lowest: [{ overallRating: "asc" }, { publishedAt: "desc" }, { id: "asc" }],
};

// GET /api/hospitals/:id/reviews
export const listHospitalReviews = async (req, res) => {
  const hospitalId = req.params.id;
  const { page, limit, sort = "newest" } = req.validatedQuery;

  await assertHospitalExists(hospitalId);

  const where = { hospitalId, status: "published" };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      select: publicSelect,
      orderBy: publicOrderBy[sort],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.review.count({ where }),
  ]);

  res.set("Cache-Control", "public, max-age=30");

  return res.status(200).json({
    success: true,
    reviews: reviews.map(presentPublicReview),
    pagination: paginate(page, limit, total),
  });
};

// GET /api/hospitals/:id/rating-summary
export const getRatingSummary = async (req, res) => {
  const hospitalId = req.params.id;

  await assertHospitalExists(hospitalId);

  const [stats, distribution, categories] = await Promise.all([
    prisma.hospitalRatingStats.findUnique({ where: { hospitalId } }),
    prisma.review.groupBy({
      by: ["overallRating"],
      where: { hospitalId, status: "published" },
      _count: { _all: true },
    }),
    prisma.reviewRating.groupBy({
      by: ["category"],
      where: { review: { hospitalId, status: "published" } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  const reviewCount = stats?.reviewCount ?? 0;

  const countsByStars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of distribution) countsByStars[row.overallRating] = row._count._all;

  const byCategory = new Map(categories.map((row) => [row.category, row]));

  res.set("Cache-Control", "public, max-age=30");

  return res.status(200).json({
    success: true,
    summary: {
      averageRating: reviewCount > 0 ? Number(stats.averageRating) : null,
      reviewCount,
      distribution: countsByStars,
      // Only categories somebody has rated, in a fixed order.
      categories: RATING_CATEGORIES.filter((category) => byCategory.has(category)).map(
        (category) => ({
          category,
          average: Math.round(Number(byCategory.get(category)._avg.rating) * 100) / 100,
          count: byCategory.get(category)._count._all,
        })
      ),
    },
  });
};

// ---------------------------------------------------------------------------
// Signed-in authors
// ---------------------------------------------------------------------------

// POST /api/hospitals/:id/reviews
export const createReview = async (req, res) => {
  const hospitalId = req.params.id;

  // Accounts must have confirmed their email before they can review.
  if (!req.user.emailVerifiedAt) {
    throw new ApiError(
      403,
      "Please confirm your email address before writing a review",
      { code: "EMAIL_NOT_VERIFIED" }
    );
  }

  await assertHospitalExists(hospitalId);

  const { ratings, ...fields } = req.body;
  const moderated = requiresModeration();

  let review;

  try {
    review = await prisma.review.create({
      data: {
        ...fields,
        hospitalId,
        userId: req.user.id,
        status: moderated ? "pending_moderation" : "published",
        publishedAt: moderated ? null : new Date(),
        ...(ratings?.length > 0 && { ratings: { create: ratings } }),
      },
      select: ownSelect,
    });
  } catch (error) {
    // The only unique rule on this table is one review per user per hospital.
    if (error?.code === "P2002") {
      throw new ApiError(
        409,
        "You have already reviewed this hospital. You can edit your review instead.",
        { code: "REVIEW_ALREADY_EXISTS" }
      );
    }

    throw error;
  }

  void recordSecurityEvent(req.user.id, "REVIEW_CREATED", {
    reviewId: review.id,
    hospitalId,
  });

  return res.status(201).json({
    success: true,
    message: moderated
      ? "Thank you! Your review will appear once it has been checked."
      : "Thank you! Your review is now published.",
    review: presentOwnReview(review),
  });
};

// PATCH /api/reviews/:id
export const updateReview = async (req, res) => {
  const existing = await prisma.review.findUnique({
    where: { id: req.params.id },
    select: { id: true, userId: true, status: true, publishedAt: true },
  });

  // Somebody else's review looks exactly like one that does not exist.
  if (!existing || existing.userId !== req.user.id) {
    throw new ApiError(404, "Review not found", { code: "REVIEW_NOT_FOUND" });
  }

  if (existing.status === "removed") {
    throw new ApiError(403, "This review was removed and can no longer be edited", {
      code: "REVIEW_REMOVED",
    });
  }

  const { ratings, ...fields } = req.body;
  const data = { ...fields };

  // A new list replaces all category ratings.
  if (ratings !== undefined) {
    data.ratings = { deleteMany: {}, ...(ratings.length > 0 && { create: ratings }) };
  }

  const contentChanged = CONTENT_FIELDS.some((field) => field in req.body);
  const moderated = requiresModeration();
  const sentBackToModeration = contentChanged && moderated;

  if (contentChanged) {
    data.status = moderated ? "pending_moderation" : "published";
    data.publishedAt = moderated ? null : existing.publishedAt ?? new Date();
    data.moderatedById = null;
    data.moderatedAt = null;
    data.moderationNote = null;
  }

  let review;

  try {
    review = await prisma.review.update({
      // The status condition makes sure a review removed a moment ago stays removed.
      where: { id: existing.id, userId: req.user.id, status: { not: "removed" } },
      data,
      select: ownSelect,
    });
  } catch (error) {
    if (error?.code === "P2025") {
      throw new ApiError(404, "Review not found", { code: "REVIEW_NOT_FOUND" });
    }

    throw error;
  }

  void recordSecurityEvent(req.user.id, "REVIEW_UPDATED", {
    reviewId: review.id,
    fields: Object.keys(req.body),
    sentBackToModeration,
  });

  return res.status(200).json({
    success: true,
    message: sentBackToModeration
      ? "Review updated. It will appear again once it has been checked."
      : "Review updated.",
    review: presentOwnReview(review),
  });
};

// DELETE /api/reviews/:id
export const deleteReview = async (req, res) => {
  const result = await prisma.review.deleteMany({
    where: { id: req.params.id, userId: req.user.id },
  });

  if (result.count === 0) {
    throw new ApiError(404, "Review not found", { code: "REVIEW_NOT_FOUND" });
  }

  void recordSecurityEvent(req.user.id, "REVIEW_DELETED", { reviewId: req.params.id });

  return res.status(200).json({ success: true, message: "Review deleted" });
};

// GET /api/users/me/reviews
export const getMyReviews = async (req, res) => {
  const { page, limit, status } = req.validatedQuery;

  const where = { userId: req.user.id, ...(status && { status }) };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      select: ownSelect,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.review.count({ where }),
  ]);

  return res.status(200).json({
    success: true,
    reviews: reviews.map(presentOwnReview),
    pagination: paginate(page, limit, total),
  });
};
import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";
import { recordSecurityEvent } from "../src/services/audit.service.js";
import { notify } from "../src/services/notification.service.js";
import { HAS_REPRESENTATIVE, requireRepresentative } from "../src/services/hospitalAccess.js";
import { publicSelect, presentPublicReview } from "./review.controller.js";

// A hospital's public reply to a review (task 6d), written by the hospital's
// representatives (people with an approved claim).
//
// Rules:
//   * one response per review, only to a PUBLISHED review;
//   * only while the hospital has a representative and is not suspended;
//   * a representative cannot answer a review they wrote themselves;
//   * links are refused, and by default a moderator approves every response
//     before it appears (RESPONSES_REQUIRE_MODERATION=false switches that off).
//     Editing a response sends it back to moderation.
// A response never changes a review or its rating, and there is no way for a
// representative to delete or hide a review.

const requiresModeration = () => process.env.RESPONSES_REQUIRE_MODERATION !== "false";

const responseSelect = {
  id: true,
  body: true,
  status: true,
  moderationNote: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
};

// What the representative sees of their own response, including a rejection note.
const presentOwnResponse = (response) =>
  response
    ? {
        id: response.id,
        body: response.body,
        status: response.status,
        moderationNote: response.status === "rejected" ? response.moderationNote : null,
        publishedAt: response.publishedAt,
        createdAt: response.createdAt,
        updatedAt: response.updatedAt,
      }
    : null;

const reviewNotFound = () => new ApiError(404, "Review not found", { code: "REVIEW_NOT_FOUND" });

// Loads a published review and checks the caller may answer for its hospital.
const loadAnswerableReview = async (reviewId, userId) => {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      userId: true,
      hospitalId: true,
      status: true,
      hospital: { select: { hospital_name: true, verification_status: true } },
    },
  });

  if (!review || review.status !== "published") throw reviewNotFound();

  await requireRepresentative(review.hospitalId, userId);

  if (review.userId && review.userId === userId) {
    throw new ApiError(403, "You cannot respond to your own review", {
      code: "CANNOT_RESPOND_TO_OWN_REVIEW",
    });
  }

  if (!HAS_REPRESENTATIVE.includes(review.hospital.verification_status)) {
    throw new ApiError(409, "This hospital cannot respond to reviews right now", {
      code: "HOSPITAL_NOT_ACTIVE",
    });
  }

  return review;
};

// PUT /api/reviews/:id/response   { "body": "..." }
// Creates the response, or replaces the existing one.
export const saveResponse = async (req, res) => {
  const review = await loadAnswerableReview(req.params.id, req.user.id);
  const moderated = requiresModeration();
  const now = new Date();

  const existing = await prisma.reviewResponse.findUnique({
    where: { reviewId: review.id },
    select: { id: true, body: true, status: true },
  });

  // Saving the same text again changes nothing.
  if (existing && existing.body === req.body.body && existing.status !== "rejected") {
    const current = await prisma.reviewResponse.findUnique({ where: { id: existing.id }, select: responseSelect });
    return res.status(200).json({ success: true, response: presentOwnResponse(current) });
  }

  const data = {
    body: req.body.body,
    authorId: req.user.id,
    status: moderated ? "pending_moderation" : "published",
    publishedAt: moderated ? null : now,
    moderatedById: null,
    moderatedAt: null,
    moderationNote: null,
  };

  let saved;

  try {
    saved = existing
      ? await prisma.reviewResponse.update({ where: { id: existing.id }, data, select: responseSelect })
      : await prisma.reviewResponse.create({
          data: { ...data, reviewId: review.id, hospitalId: review.hospitalId },
          select: responseSelect,
        });
  } catch (error) {
    // Two representatives answering at the same moment: one response per review.
    if (error?.code === "P2002") {
      throw new ApiError(409, "This review already has a response. Try again to edit it.", {
        code: "RESPONSE_ALREADY_EXISTS",
      });
    }
    throw error;
  }

  void recordSecurityEvent(req.user.id, existing ? "REVIEW_RESPONSE_UPDATED" : "REVIEW_RESPONSE_CREATED", {
    reviewId: review.id,
    responseId: saved.id,
    hospitalId: review.hospitalId,
  });

  // With moderation off the response is public at once, so the reviewer hears now.
  // Only when it first appears: editing a visible response does not notify again.
  if (!moderated && existing?.status !== "published") {
    void notify(
      review.userId,
      "response.received",
      { hospitalName: review.hospital.hospital_name },
      { reviewId: review.id, hospitalId: review.hospitalId }
    );
  }

  return res.status(existing ? 200 : 201).json({
    success: true,
    message: moderated
      ? "Your response was saved. A moderator will check it before it appears."
      : "Your response is now published.",
    response: presentOwnResponse(saved),
  });
};

// DELETE /api/reviews/:id/response
export const deleteResponse = async (req, res) => {
  const review = await prisma.review.findUnique({
    where: { id: req.params.id },
    select: { id: true, hospitalId: true },
  });

  if (!review) throw reviewNotFound();

  await requireRepresentative(review.hospitalId, req.user.id);

  const result = await prisma.reviewResponse.deleteMany({ where: { reviewId: review.id } });

  if (result.count === 0) {
    throw new ApiError(404, "This review has no response", { code: "RESPONSE_NOT_FOUND" });
  }

  void recordSecurityEvent(req.user.id, "REVIEW_RESPONSE_DELETED", {
    reviewId: review.id,
    hospitalId: review.hospitalId,
  });

  return res.status(200).json({ success: true, message: "Response deleted" });
};

// GET /api/hospitals/:id/responses?unanswered=true
// The hospital's published reviews, each with the hospital's own response (in
// any state), so representatives can see what still needs an answer.
export const listHospitalResponses = async (req, res) => {
  const hospitalId = req.params.id;
  const { page, limit, unanswered } = req.validatedQuery;

  const exists = await prisma.hospitals.findUnique({ where: { id: hospitalId }, select: { id: true } });
  if (!exists) throw new ApiError(404, "Hospital not found", { code: "HOSPITAL_NOT_FOUND" });

  await requireRepresentative(hospitalId, req.user.id);

  const where = {
    hospitalId,
    status: "published",
    ...(unanswered === "true" && { response: { is: null } }),
  };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      select: { ...publicSelect, response: { select: responseSelect } },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.review.count({ where }),
  ]);

  return res.status(200).json({
    success: true,
    reviews: reviews.map((review) => ({
      ...presentPublicReview({ ...review, response: null }),
      response: presentOwnResponse(review.response),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};
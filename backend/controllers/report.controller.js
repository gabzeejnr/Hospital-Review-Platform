import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";
import { recordSecurityEvent } from "../src/services/audit.service.js";
import { getActiveStaff } from "../src/services/hospitalAccess.js";
import { requireConfirmedEmail } from "../src/utils/userChecks.js";

// Reporting a review (task 6d). Anyone signed in with a confirmed email can
// report a published review; a hospital's representatives can too.
//
// Policy: a report NEVER hides a review by itself, however many arrive. Only a
// moderator's decision does (controllers/reportModeration.controller.js).
// Otherwise a hospital, or a group of friends, could remove honest criticism
// just by reporting it. While a case is open the review stays published and
// keeps counting toward the hospital's rating.

// POST /api/reviews/:id/reports   { "reason": "spam", "details": "..." }
export const createReport = async (req, res) => {
  requireConfirmedEmail(req.user, "reporting a review");

  const review = await prisma.review.findUnique({
    where: { id: req.params.id },
    select: { id: true, userId: true, hospitalId: true, status: true },
  });

  // Only published reviews can be reported: that is all anyone else can see.
  if (!review || review.status !== "published") {
    throw new ApiError(404, "Review not found", { code: "REVIEW_NOT_FOUND" });
  }

  if (review.userId === req.user.id) {
    throw new ApiError(403, "You cannot report your own review", {
      code: "CANNOT_REPORT_OWN_REVIEW",
    });
  }

  // Moderators weigh a report from the reviewed hospital's own staff differently.
  const staff = await getActiveStaff(review.hospitalId, req.user.id);

  try {
    await prisma.reviewReport.create({
      data: {
        reviewId: review.id,
        reporterId: req.user.id,
        reason: req.body.reason,
        details: req.body.details,
        reporterIsRepresentative: Boolean(staff),
      },
      select: { id: true },
    });
  } catch (error) {
    // The only unique rule on reports: one report per person per review.
    if (error?.code === "P2002") {
      throw new ApiError(409, "You have already reported this review", { code: "ALREADY_REPORTED" });
    }

    throw error;
  }

  void recordSecurityEvent(req.user.id, "REVIEW_REPORTED", {
    reviewId: review.id,
    hospitalId: review.hospitalId,
    reason: req.body.reason,
  });

  return res.status(201).json({
    success: true,
    message: "Thank you. A moderator will look at your report. The review stays visible until then.",
  });
};
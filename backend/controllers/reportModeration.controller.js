import { Prisma } from "@prisma/client";
import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";
import { recordSecurityEvent } from "../src/services/audit.service.js";
import { recordModerationAction } from "../src/services/moderationHistory.service.js";
import { notify, notifyMany } from "../src/services/notification.service.js";
import { queueSelect, presentForModeration } from "./moderation.controller.js";

// Working through reports on reviews, for MODERATOR and ADMIN accounts (enforced in
// src/routes/moderationRoutes.js). The unit of work is the REVIEW: however many
// people reported it, a moderator decides once.
//
//   open -> investigating     "I am looking into it" (the review stays published)
//   open/investigating -> escalated    passed to an administrator
//   open/investigating -> dismissed    the review stays; reporters are told
//   open/investigating -> upheld       the review is taken down; its author and the
//                                      reporters are told
//
// Policy for reviews under investigation: they stay published and keep counting
// toward the hospital's rating until a moderator decides. Reports alone never hide
// a review (see report.controller.js). An escalated case can only be decided by
// an ADMIN.

const OPEN = ["open", "investigating"];

const ADMIN_ONLY = new ApiError(
  403,
  "This case was passed to an administrator, so only an administrator can decide it",
  { code: "ESCALATED_TO_ADMIN" }
);

const reportSelect = {
  id: true,
  reason: true,
  details: true,
  reporterIsRepresentative: true,
  status: true,
  escalatedAt: true,
  handledAt: true,
  resolutionNote: true,
  createdAt: true,
  // Moderators see who reported, never their email address.
  reporter: { select: { id: true, displayName: true } },
  handler: { select: { id: true, displayName: true } },
};

const presentReport = (report) => ({
  id: report.id,
  reason: report.reason,
  details: report.details,
  reporter: report.reporter
    ? { id: report.reporter.id, displayName: report.reporter.displayName }
    : null,
  reporterIsRepresentative: report.reporterIsRepresentative,
  status: report.status,
  escalated: report.escalatedAt !== null,
  escalatedAt: report.escalatedAt,
  handledBy: report.handler
    ? { id: report.handler.id, displayName: report.handler.displayName }
    : null,
  handledAt: report.handledAt,
  resolutionNote: report.resolutionNote,
  createdAt: report.createdAt,
});

// GET /api/moderation/reports?status=open&escalated=true
// One entry per reported review. Escalated cases first, then oldest first.
export const listReports = async (req, res) => {
  const { page, limit, status = "open", escalated } = req.validatedQuery;

  const escalatedFilter = escalated === "true" ? Prisma.sql`AND escalated_at IS NOT NULL` : Prisma.empty;

  const [groups, [{ total }]] = await Promise.all([
    prisma.$queryRaw`
      SELECT review_id AS "reviewId", COUNT(*)::int AS "reportCount",
             BOOL_OR(escalated_at IS NOT NULL) AS "escalated"
      FROM review_reports
      WHERE status = ${status} ${escalatedFilter}
      GROUP BY review_id
      ORDER BY BOOL_OR(escalated_at IS NOT NULL) DESC, MIN(created_at) ASC, review_id ASC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    prisma.$queryRaw`
      SELECT COUNT(DISTINCT review_id)::int AS total
      FROM review_reports WHERE status = ${status} ${escalatedFilter}`,
  ]);

  const reviews = groups.length
    ? await prisma.review.findMany({
        where: { id: { in: groups.map((group) => group.reviewId) } },
        select: {
          ...queueSelect,
          reports: { where: { status }, select: reportSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        },
      })
    : [];

  const byId = new Map(reviews.map((review) => [review.id, review]));

  const items = groups
    .map((group) => {
      const review = byId.get(group.reviewId);
      if (!review) return null;

      const reasons = {};
      for (const report of review.reports) reasons[report.reason] = (reasons[report.reason] ?? 0) + 1;

      return {
        review: presentForModeration(review),
        reportCount: group.reportCount,
        escalated: group.escalated,
        reasons,
        reports: review.reports.map(presentReport),
      };
    })
    .filter(Boolean);

  return res.status(200).json({
    success: true,
    reports: items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------
const loadReportedReview = async (req) => {
  const review = await prisma.review.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      userId: true,
      hospitalId: true,
      hospital: { select: { hospital_name: true } },
    },
  });

  if (!review) throw new ApiError(404, "Review not found", { code: "REVIEW_NOT_FOUND" });

  // Nobody decides on reports about their own writing.
  if (review.userId && review.userId === req.user.id) {
    throw new ApiError(403, "You cannot moderate your own review", {
      code: "CANNOT_MODERATE_OWN_REVIEW",
    });
  }

  return review;
};

// Locks the review so two moderators working on the same case queue up.
const lockReview = (tx, reviewId) =>
  tx.$queryRaw`SELECT id FROM reviews WHERE id = ${reviewId}::uuid FOR UPDATE`;

const noOpenReports = () =>
  new ApiError(409, "This review has no open reports", { code: "NO_OPEN_REPORTS" });

// Runs a decision on all of a review's open reports in one transaction. `apply`
// receives the transaction client and the open reports.
const decide = async (req, review, { adminOnly, apply }) => {
  return prisma.$transaction(async (tx) => {
    await lockReview(tx, review.id);

    const open = await tx.reviewReport.findMany({
      where: { reviewId: review.id, status: { in: OPEN } },
      select: { id: true, reporterId: true, escalatedAt: true },
    });

    if (open.length === 0) throw noOpenReports();

    if (adminOnly && req.user.role !== "ADMIN" && open.some((report) => report.escalatedAt)) {
      throw ADMIN_ONLY;
    }

    return apply(tx, open);
  });
};

// POST /api/moderation/reviews/:id/reports/investigate   { "note": "..." }
export const investigateReports = async (req, res) => {
  const review = await loadReportedReview(req);

  const marked = await prisma.$transaction(async (tx) => {
    await lockReview(tx, review.id);

    const result = await tx.reviewReport.updateMany({
      where: { reviewId: review.id, status: "open" },
      data: { status: "investigating", handledById: req.user.id },
    });
    if (result.count === 0) throw noOpenReports();

    await recordModerationAction(tx, req.user, {
      action: "report.investigate",
      targetType: "review",
      targetId: review.id,
      hospitalId: review.hospitalId,
      note: req.body.note,
    });

    return result.count;
  });

  return res.status(200).json({
    success: true,
    message: "Marked as under investigation. The review stays published.",
    reports: marked,
  });
};

// POST /api/moderation/reviews/:id/reports/escalate   { "note": "why" }
export const escalateReports = async (req, res) => {
  const review = await loadReportedReview(req);

  const marked = await prisma.$transaction(async (tx) => {
    await lockReview(tx, review.id);

    const result = await tx.reviewReport.updateMany({
      where: { reviewId: review.id, status: { in: OPEN }, escalatedAt: null },
      data: { escalatedAt: new Date() },
    });
    if (result.count === 0) throw noOpenReports();

    await recordModerationAction(tx, req.user, {
      action: "report.escalate",
      targetType: "review",
      targetId: review.id,
      hospitalId: review.hospitalId,
      note: req.body.note,
    });

    return result.count;
  });

  void recordSecurityEvent(req.user.id, "REVIEW_REPORT_ESCALATED", {
    reviewId: review.id,
    hospitalId: review.hospitalId,
  });

  return res.status(200).json({
    success: true,
    message: "Passed to an administrator",
    reports: marked,
  });
};

// POST /api/moderation/reviews/:id/reports/dismiss   { "note": "..." }
// The review stays published; the people who reported it are told.
export const dismissReports = async (req, res) => {
  const review = await loadReportedReview(req);
  const now = new Date();

  const reporterIds = await decide(req, review, {
    adminOnly: true,
    apply: async (tx, open) => {
      await tx.reviewReport.updateMany({
        where: { id: { in: open.map((report) => report.id) } },
        data: {
          status: "dismissed",
          handledById: req.user.id,
          handledAt: now,
          resolutionNote: req.body.note ?? null,
        },
      });

      await recordModerationAction(tx, req.user, {
        action: "report.dismiss",
        targetType: "review",
        targetId: review.id,
        hospitalId: review.hospitalId,
        note: req.body.note,
      });

      return open.map((report) => report.reporterId).filter(Boolean);
    },
  });

  void recordSecurityEvent(req.user.id, "REVIEW_REPORTS_DISMISSED", {
    reviewId: review.id,
    hospitalId: review.hospitalId,
  });

  void notifyMany(
    reporterIds,
    "report.dismissed",
    { hospitalName: review.hospital.hospital_name },
    { reviewId: review.id, hospitalId: review.hospitalId }
  );

  return res.status(200).json({
    success: true,
    message: "Reports dismissed. The review stays published.",
  });
};

// POST /api/moderation/reviews/:id/reports/uphold   { "reason": "..." }
// The review is taken down (the reason is shown to its author), and the author
// and the reporters are told.
export const upholdReports = async (req, res) => {
  const review = await loadReportedReview(req);
  const now = new Date();

  const { reporterIds, takenDown } = await decide(req, review, {
    adminOnly: true,
    apply: async (tx, open) => {
      await tx.reviewReport.updateMany({
        where: { id: { in: open.map((report) => report.id) } },
        data: {
          status: "upheld",
          handledById: req.user.id,
          handledAt: now,
          resolutionNote: req.body.reason,
        },
      });

      // The same takedown the review queue performs on a published review.
      const taken = await tx.review.updateMany({
        where: { id: review.id, status: "published" },
        data: {
          status: "rejected",
          publishedAt: null,
          moderatedById: req.user.id,
          moderatedAt: now,
          moderationNote: req.body.reason,
        },
      });

      await recordModerationAction(tx, req.user, {
        action: "report.uphold",
        targetType: "review",
        targetId: review.id,
        hospitalId: review.hospitalId,
        note: req.body.reason,
      });

      if (taken.count === 1) {
        await recordModerationAction(tx, req.user, {
          action: "review.reject",
          targetType: "review",
          targetId: review.id,
          hospitalId: review.hospitalId,
          note: req.body.reason,
        });
      }

      return {
        reporterIds: open.map((report) => report.reporterId).filter(Boolean),
        takenDown: taken.count === 1,
      };
    },
  });

  void recordSecurityEvent(req.user.id, "REVIEW_REPORTS_UPHELD", {
    reviewId: review.id,
    hospitalId: review.hospitalId,
    takenDown,
  });

  const values = { hospitalName: review.hospital.hospital_name };
  const data = { reviewId: review.id, hospitalId: review.hospitalId };

  void notifyMany(reporterIds, "report.upheld", values, data);
  if (takenDown) void notify(review.userId, "review.rejected", { ...values, reason: req.body.reason }, data);

  return res.status(200).json({
    success: true,
    message: takenDown ? "Reports upheld. The review has been taken down." : "Reports upheld.",
    reviewTakenDown: takenDown,
  });
};
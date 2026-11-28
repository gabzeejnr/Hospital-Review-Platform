import prisma from "../src/config/prisma.js";

// The moderation history log, for MODERATOR and ADMIN accounts (enforced in
// src/routes/moderationRoutes.js). Read-only: the table cannot be changed, even
// by the code (a database trigger refuses it).

const select = {
  id: true,
  actorId: true,
  actorName: true,
  actorRole: true,
  action: true,
  targetType: true,
  targetId: true,
  hospitalId: true,
  note: true,
  createdAt: true,
};

const present = (row) => ({
  id: row.id,
  action: row.action,
  target: { type: row.targetType, id: row.targetId },
  hospitalId: row.hospitalId,
  note: row.note,
  actor: { id: row.actorId, name: row.actorName, role: row.actorRole },
  createdAt: row.createdAt,
});

// GET /api/moderation/history?targetType=review&targetId=...&actorId=...&action=review.reject
// Newest first. Everything about one review (or claim, response, ...) is one
// request: pass its type and id.
export const listModerationHistory = async (req, res) => {
  const { page, limit, targetType, targetId, actorId, action } = req.validatedQuery;

  const where = {
    ...(targetType && { targetType }),
    ...(targetId && { targetId }),
    ...(actorId && { actorId }),
    ...(action && { action }),
  };

  const [rows, total] = await Promise.all([
    prisma.moderationAction.findMany({
      where,
      select,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.moderationAction.count({ where }),
  ]);

  return res.status(200).json({
    success: true,
    history: rows.map(present),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};
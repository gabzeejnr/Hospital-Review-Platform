import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";
import { recordSecurityEvent } from "../src/services/audit.service.js";
import { recordModerationAction } from "../src/services/moderationHistory.service.js";
import { notify } from "../src/services/notification.service.js";
import { setSignInBlocked } from "../src/services/authAdmin.service.js";
import { escapeLike } from "../src/services/hospitalSearch.js";
import { STAFF_ROLES, ROLE_LABELS } from "../src/utils/roles.js";

// Account management for ADMIN accounts only (enforced in src/routes/adminRoutes.js):
// find people, change their role, suspend and reactivate their account.
//
// What an admin sees of a person is what is needed to manage the account: email,
// name, role, status and activity counts. Never phone numbers, saved locations or
// notification settings.
//
// Safeguards:
//   * nobody can change or suspend their OWN account (so an admin cannot lock
//     themselves out or quietly keep a role they should lose);
//   * MODERATOR and ADMIN go only to active accounts with a confirmed email;
//   * every change needs a reason, is written to the moderation history inside
//     the same transaction (no change without a record), and is told to the person;
//   * the last active administrator cannot be removed: see "Last administrator".
//
// Last administrator. Each change first locks every active admin row, then checks
// that the person making the change is STILL an active admin. Two admins demoting
// each other at the same instant therefore queue up, and the second one is told
// 403 NOT_AN_ADMIN. Because the actor is always an admin who is not the target,
// at least one admin always remains. A database trigger (see
// prisma/migrations/20261126_add_account_management) enforces the same rule for
// anything that bypasses this code.

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  username: true,
  role: true,
  isActive: true,
  emailVerifiedAt: true,
  createdAt: true,
  lastLoginAt: true,
  suspendedAt: true,
  suspensionReason: true,
};

const presentUser = (user) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  username: user.username,
  role: user.role,
  status: user.isActive ? "active" : "suspended",
  emailVerified: user.emailVerifiedAt !== null,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
  suspension: user.isActive
    ? null
    : { suspendedAt: user.suspendedAt, reason: user.suspensionReason },
});

const userNotFound = () => new ApiError(404, "User not found", { code: "USER_NOT_FOUND" });

// GET /api/admin/users?q=ada&role=MODERATOR&status=suspended
export const listUsers = async (req, res) => {
  const { page, limit, q, role, status } = req.validatedQuery;

  const needle = q ? escapeLike(q) : null;

  const where = {
    ...(role && { role }),
    ...(status && { isActive: status === "active" }),
    ...(needle && {
      OR: [
        { email: { contains: needle, mode: "insensitive" } },
        { displayName: { contains: needle, mode: "insensitive" } },
        { username: { contains: needle, mode: "insensitive" } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return res.status(200).json({
    success: true,
    users: users.map(presentUser),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};

// GET /api/admin/users/:id
export const getUser = async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
  if (!user) throw userNotFound();

  const [reviews, claims, staff, history] = await Promise.all([
    prisma.review.groupBy({ by: ["status"], where: { userId: user.id }, _count: { _all: true } }),
    prisma.hospitalClaim.groupBy({ by: ["status"], where: { userId: user.id }, _count: { _all: true } }),
    prisma.hospitalStaff.findMany({
      where: { userId: user.id, isActive: true },
      select: { jobTitle: true, hospital: { select: { id: true, hospital_name: true } } },
    }),
    prisma.moderationAction.findMany({
      where: { targetType: "user", targetId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 10,
      select: { action: true, actorName: true, actorRole: true, note: true, createdAt: true },
    }),
  ]);

  const counts = (rows) => Object.fromEntries(rows.map((row) => [row.status, row._count._all]));

  return res.status(200).json({
    success: true,
    user: {
      ...presentUser(user),
      reviews: counts(reviews),
      claims: counts(claims),
      represents: staff.map((row) => ({
        hospitalId: row.hospital.id,
        hospitalName: row.hospital.hospital_name,
        jobTitle: row.jobTitle,
      })),
      history: history.map((entry) => ({
        action: entry.action,
        by: { name: entry.actorName, role: entry.actorRole },
        note: entry.note,
        at: entry.createdAt,
      })),
    },
  });
};

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

// Locks every active administrator, in a fixed order, and confirms the person
// acting is still one of them. Call FIRST inside the transaction.
const lockAdmins = async (tx, actorId) => {
  const admins = await tx.$queryRaw`
    SELECT id FROM users WHERE role = 'ADMIN' AND is_active = true ORDER BY id FOR UPDATE`;

  if (!admins.some((admin) => admin.id === actorId)) {
    throw new ApiError(403, "Only an active administrator can do this", { code: "NOT_AN_ADMIN" });
  }

  return admins;
};

// Locks and returns the person being changed.
const lockTarget = async (tx, id) => {
  const [target] = await tx.$queryRaw`
    SELECT id, role::text AS role, is_active AS "isActive", email_verified_at AS "emailVerifiedAt"
    FROM users WHERE id = ${id}::uuid FOR UPDATE`;

  if (!target) throw userNotFound();
  return target;
};

// PATCH /api/admin/users/:id/role   { "role": "MODERATOR", "reason": "..." }
export const changeRole = async (req, res) => {
  const targetId = req.params.id;
  const { role: newRole, reason } = req.body;

  if (targetId === req.user.id) {
    throw new ApiError(403, "You cannot change your own role. Ask another administrator.", {
      code: "CANNOT_CHANGE_OWN_ROLE",
    });
  }

  const previousRole = await prisma.$transaction(async (tx) => {
    const admins = await lockAdmins(tx, req.user.id);
    const target = await lockTarget(tx, targetId);

    if (target.role === newRole) {
      throw new ApiError(409, `This person is already a ${ROLE_LABELS[newRole]}`, {
        code: "ROLE_UNCHANGED",
      });
    }

    if (STAFF_ROLES.includes(newRole) && (!target.isActive || !target.emailVerifiedAt)) {
      throw new ApiError(
        409,
        "Only an active account with a confirmed email address can become a moderator or administrator",
        { code: "ACCOUNT_NOT_ELIGIBLE" }
      );
    }

    // Always true while the checks above hold (the person acting is an admin and
    // is not the target), kept as an explicit statement of the rule.
    if (
      target.role === "ADMIN" &&
      target.isActive &&
      admins.filter((admin) => admin.id !== targetId).length === 0
    ) {
      throw new ApiError(409, "The last administrator cannot be demoted", { code: "LAST_ADMIN" });
    }

    await tx.user.update({ where: { id: targetId }, data: { role: newRole }, select: { id: true } });

    await recordModerationAction(tx, req.user, {
      action: "user.role_change",
      targetType: "user",
      targetId,
      note: `${target.role} to ${newRole}: ${reason}`,
    });

    return target.role;
  });

  void recordSecurityEvent(req.user.id, "ACCOUNT_ROLE_CHANGED", {
    targetUserId: targetId,
    from: previousRole,
    to: newRole,
  });

  void notify(
    targetId,
    "account.role_changed",
    {
      roleLabel: ROLE_LABELS[newRole],
      previousRoleLabel: ROLE_LABELS[previousRole] ?? previousRole,
      reason,
    },
    {}
  );

  const user = await prisma.user.findUnique({ where: { id: targetId }, select: userSelect });

  return res.status(200).json({
    success: true,
    message: `Role changed from ${ROLE_LABELS[previousRole] ?? previousRole} to ${ROLE_LABELS[newRole]}. It takes effect on their next request.`,
    user: presentUser(user),
  });
};

// POST /api/admin/users/:id/suspend   { "reason": "..." }
// The person is locked out on their very next request; the reason is told to them.
// Their reviews and other content are left as they are: moderators handle those.
export const suspendUser = async (req, res) => {
  const targetId = req.params.id;

  if (targetId === req.user.id) {
    throw new ApiError(403, "You cannot suspend your own account", { code: "CANNOT_SUSPEND_SELF" });
  }

  await prisma.$transaction(async (tx) => {
    await lockAdmins(tx, req.user.id);
    const target = await lockTarget(tx, targetId);

    if (!target.isActive) {
      throw new ApiError(409, "This account is already suspended", { code: "ALREADY_SUSPENDED" });
    }

    await tx.user.update({
      where: { id: targetId },
      data: { isActive: false, suspendedAt: new Date(), suspensionReason: req.body.reason },
      select: { id: true },
    });

    await recordModerationAction(tx, req.user, {
      action: "user.suspend",
      targetType: "user",
      targetId,
      note: req.body.reason,
    });
  });

  const signInBlocked = await setSignInBlocked(targetId, true);

  void recordSecurityEvent(req.user.id, "ACCOUNT_SUSPENDED", { targetUserId: targetId });
  void notify(targetId, "account.suspended", { reason: req.body.reason }, {});

  return res.status(200).json({
    success: true,
    message: "Account suspended. They are locked out from their next request.",
    signInBlocked,
  });
};

// POST /api/admin/users/:id/reactivate
export const reactivateUser = async (req, res) => {
  const targetId = req.params.id;

  await prisma.$transaction(async (tx) => {
    await lockAdmins(tx, req.user.id);
    const target = await lockTarget(tx, targetId);

    if (target.isActive) {
      throw new ApiError(409, "This account is not suspended", { code: "NOT_SUSPENDED" });
    }

    await tx.user.update({
      where: { id: targetId },
      data: { isActive: true, suspendedAt: null, suspensionReason: null },
      select: { id: true },
    });

    await recordModerationAction(tx, req.user, {
      action: "user.reactivate",
      targetType: "user",
      targetId,
    });
  });

  const signInUnblocked = await setSignInBlocked(targetId, false);

  void recordSecurityEvent(req.user.id, "ACCOUNT_REACTIVATED", { targetUserId: targetId });
  void notify(targetId, "account.reactivated", {}, {});

  return res.status(200).json({
    success: true,
    message: "Account reactivated. They can sign in again.",
    signInUnblocked,
  });
};
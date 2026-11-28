// Account roles (task 7).
//
// The database knows five: USER, HOSPITAL_REP, MODERATOR, SUPPORT and ADMIN.
// Only three can be given to a person here:
//   USER       an ordinary member
//   MODERATOR  can use the moderation tools (reviews, reports, claims, responses)
//   ADMIN      everything a moderator can do, plus suspending hospitals and
//              managing accounts and roles
//
// HOSPITAL_REP and SUPPORT are never assigned: a hospital representative's
// authority belongs to ONE hospital (an approved claim, see hospital_staff), not
// to a global role, and SUPPORT has no permissions defined yet. A person who
// already holds one of them can still be set back to USER.
export const ASSIGNABLE_ROLES = ["USER", "MODERATOR", "ADMIN"];

// Roles that give access to other people's content and so need a confirmed email
// and an active account.
export const STAFF_ROLES = ["MODERATOR", "ADMIN"];

export const ROLE_LABELS = {
  USER: "Member",
  HOSPITAL_REP: "Hospital representative",
  MODERATOR: "Moderator",
  SUPPORT: "Support officer",
  ADMIN: "Administrator",
};
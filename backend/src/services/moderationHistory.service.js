// The moderation history log: one row for every action a moderator or admin
// takes (see the moderation_actions table, which cannot be edited or deleted).
//
// Call it INSIDE the same transaction as the action, with the transaction's
// client, so the two commit together: there is never a decision without a
// record, and a failure to write the record cancels the decision.
//
//   await recordModerationAction(tx, req.user, {
//     action: "claim.reject", targetType: "claim", targetId: claim.id,
//     hospitalId: claim.hospitalId, note: req.body.reason,
//   });

export const TARGET_TYPES = ["review", "response", "claim", "verification", "hospital", "user"];

export const recordModerationAction = (client, actor, entry) =>
  client.moderationAction.create({
    data: {
      actorId: actor.id,
      // Copied in, so the history still reads correctly if the account is later renamed or deleted.
      actorName: actor.displayName ? actor.displayName.slice(0, 100) : null,
      actorRole: actor.role,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      hospitalId: entry.hospitalId ?? null,
      note: entry.note ? String(entry.note).slice(0, 500) : null,
    },
    select: { id: true },
  });
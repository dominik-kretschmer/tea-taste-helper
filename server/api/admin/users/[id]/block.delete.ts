// Entsperren, sofort wirksam (05 AK-6.4)
export default defineEventHandler(async (event) => {
  const actor = requireRole(event, 'moderator')
  const target = await loadModerationTarget(event)
  // Nicht assertCanBlock: Ein Gesperrter kann inzwischen Admin sein (Beförderung, ADMIN_EMAIL) und muss entsperrbar bleiben
  if (target.role !== 'user' && actor.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Only admins can unblock moderators and admins')
  }

  const user = await usePrisma().user.update({
    where: { id: target.id },
    data: { blockedAt: null, blockedUntil: null, blockReason: null, blockedById: null },
  })
  await audit(event, { event: 'USER_UNBLOCKED', actorId: actor.id, targetId: target.id })
  return { user: toModerationUser(user, actor) }
})

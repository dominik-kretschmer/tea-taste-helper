// Entsperren, sofort wirksam (05 AK-6.4)
export default defineEventHandler(async (event) => {
  const actor = requireRole(event, 'moderator')
  const id = getUserIdParam(event)

  const prisma = usePrisma()
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found')
  assertCanBlock(actor, target)

  const user = await prisma.user.update({
    where: { id },
    data: { blockedAt: null, blockedUntil: null, blockReason: null, blockedById: null },
  })
  await audit(event, { event: 'USER_UNBLOCKED', actorId: actor.id, targetId: id })
  return { user: toModerationUser(user, actor) }
})

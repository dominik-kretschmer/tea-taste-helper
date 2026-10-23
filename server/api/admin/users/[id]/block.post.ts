import { blockSchema } from '#shared/schemas/moderation'

// Sperren bzw. bestehende Sperre ersetzen (05 AK-6.1, AK-6.5, AK-6.8)
export default defineEventHandler(async (event) => {
  const actor = requireRole(event, 'moderator')
  const id = getUserIdParam(event)
  const { duration, reason } = await readValidatedBody(event, blockSchema.parse)

  const prisma = usePrisma()
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found')
  assertCanBlock(actor, target)

  const until = blockedUntil(duration)
  const user = await prisma.user.update({
    where: { id },
    data: { blockedAt: new Date(), blockedUntil: until, blockReason: reason, blockedById: actor.id },
  })
  await destroyUserSessions(id)

  await audit(event, {
    event: 'USER_BLOCKED',
    actorId: actor.id,
    targetId: id,
    details: { duration, until: until?.toISOString() ?? null, reason },
  })
  return { user: toModerationUser(user, actor) }
})

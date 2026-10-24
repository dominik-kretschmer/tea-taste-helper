import { blockSchema } from '#shared/schemas/moderation'

// Sperren bzw. bestehende Sperre ersetzen (05 AK-6.1, AK-6.5, AK-6.8)
export default defineEventHandler(async (event) => {
  const actor = requireRole(event, 'moderator')
  const target = await loadModerationTarget(event)
  const { duration, reason } = await readValidatedBody(event, blockSchema.parse)

  const prisma = usePrisma()
  assertCanBlock(actor, target)

  const until = blockedUntil(duration)
  const user = await prisma.user.update({
    where: { id: target.id },
    data: { blockedAt: new Date(), blockedUntil: until, blockReason: reason, blockedById: actor.id },
  })
  await destroyUserSessions(target.id)

  await audit(event, {
    event: 'USER_BLOCKED',
    actorId: actor.id,
    targetId: target.id,
    details: { duration, until: until?.toISOString() ?? null, reason },
  })
  return { user: toModerationUser(user, actor) }
})

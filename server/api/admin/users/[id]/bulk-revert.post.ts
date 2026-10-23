import { bulkRevertSchema } from '#shared/schemas/moderation'

// Alle Änderungen eines Nutzers seit `since` zurücksetzen (05 AK-7.2–7.6)
export default defineEventHandler(async (event): Promise<BulkRevertResult> => {
  const actor = requireRole(event, 'moderator')
  const id = getUserIdParam(event)
  const { since, locale } = await readValidatedBody(event, bulkRevertSchema.parse)

  const prisma = usePrisma()
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found')
  assertCanBlock(actor, target)

  const result = await runBulkRevert(prisma, { userId: id, actorId: actor.id, since, locale })
  // Ein Eintrag für alles; die einzelnen Versionen tragen bulkRevertOfId (AK-8.1)
  await audit(event, {
    event: 'BULK_REVERT',
    actorId: actor.id,
    targetId: id,
    details: { since: since.toISOString(), reverted: result.revert.length, hidden: result.hide.length, skipped: result.skip.length },
  })
  return result
})

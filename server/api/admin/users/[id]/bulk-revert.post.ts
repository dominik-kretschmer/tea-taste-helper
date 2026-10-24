import { bulkRevertSchema } from '#shared/schemas/moderation'

// Alle Änderungen eines Nutzers seit `since` zurücksetzen (05 AK-7.2–7.6)
export default defineEventHandler(async (event): Promise<BulkRevertResult> => {
  const actor = requireRole(event, 'moderator')
  const target = await loadModerationTarget(event)
  const { since, locale } = await readValidatedBody(event, bulkRevertSchema.parse)

  const prisma = usePrisma()
  assertCanBlock(actor, target)

  const result = await runBulkRevert(prisma, { userId: target.id, actorId: actor.id, since, locale })
  // Ein Eintrag für alles; die einzelnen Versionen tragen bulkRevertOfId (AK-8.1)
  await audit(event, {
    event: 'BULK_REVERT',
    actorId: actor.id,
    targetId: target.id,
    details: { since: since.toISOString(), reverted: result.revert.length, hidden: result.hide.length, skipped: result.skip.length },
  })
  return result
})

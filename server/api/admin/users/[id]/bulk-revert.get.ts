import { bulkRevertSchema } from '#shared/schemas/moderation'

// Vorschau der Massen-Zurücksetzung (05 AK-7.1)
export default defineEventHandler(async (event): Promise<BulkRevertPlan> => {
  const actor = requireRole(event, 'moderator')
  const target = await loadModerationTarget(event)
  const { since, locale } = await getValidatedQuery(event, bulkRevertSchema.parse)

  const prisma = usePrisma()
  assertCanBlock(actor, target)
  return planBulkRevert(prisma, target.id, since, locale)
})

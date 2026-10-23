import { bulkRevertSchema } from '#shared/schemas/moderation'

// Vorschau der Massen-Zurücksetzung (05 AK-7.1)
export default defineEventHandler(async (event): Promise<BulkRevertPlan> => {
  const actor = requireRole(event, 'moderator')
  const id = getUserIdParam(event)
  const { since, locale } = await getValidatedQuery(event, bulkRevertSchema.parse)

  const prisma = usePrisma()
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found')
  assertCanBlock(actor, target)
  return planBulkRevert(prisma, id, since, locale)
})

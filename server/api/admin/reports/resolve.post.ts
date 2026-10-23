import { resolveReportsSchema } from '#shared/schemas/moderation'

// Alle offenen Meldungen eines Eintrags als erledigt oder abgelehnt abschließen (05 AK-3.3)
export default defineEventHandler(async (event) => {
  const user = requireRole(event, 'moderator')
  const input = await readValidatedBody(event, resolveReportsSchema.parse)

  const closed = await closeReports(usePrisma(), { ...input, actorId: user.id })
  if (!closed) throw new AppError(404, 'NOT_FOUND', 'No open reports for this entry')

  await audit(event, {
    event: 'REPORT_RESOLVED',
    actorId: user.id,
    details: { entityType: input.entityType, entityId: input.entityId, status: input.status, count: closed },
  })
  return { closed }
})

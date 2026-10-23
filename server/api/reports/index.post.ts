import { reportSchema } from '#shared/schemas/moderation'

// Eintrag melden (05 AK-2.1–2.6)
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const input = await readValidatedBody(event, reportSchema.parse)
  const prisma = usePrisma()

  if (!(await isReportable(prisma, input.entityType, input.entityId))) {
    throw new AppError(404, 'NOT_FOUND', 'Entry not found')
  }
  if (input.duplicateOfId && (input.duplicateOfId === input.entityId || !(await isReportable(prisma, input.entityType, input.duplicateOfId)))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid input', { duplicateOfId: ['invalid'] })
  }
  assertReportRateLimit(event, user)

  const report = await prisma.report.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      reporterId: user.id,
      reason: input.reason,
      comment: input.comment,
      duplicateOfId: input.duplicateOfId,
    },
  }).catch((error: unknown) => {
    // Report_open_key: höchstens eine offene Meldung je Nutzer und Eintrag (AK-2.4)
    if ((error as { code?: string }).code === 'P2002') {
      throw new AppError(409, 'ALREADY_REPORTED', 'You already reported this entry')
    }
    throw error
  })

  // Ohne Kommentar: Er gehört in die Moderationsliste, nicht ins Audit-Log
  await audit(event, {
    event: 'REPORT_CREATED',
    actorId: user.id,
    details: { reportId: report.id, entityType: report.entityType, entityId: report.entityId, reason: report.reason },
  })
  setResponseStatus(event, 201)
  return { id: report.id }
})

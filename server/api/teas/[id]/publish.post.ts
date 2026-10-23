import { publishTeaSchema } from '#shared/schemas/tea'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getTeaIdParam(event)
  assertCatalogRateLimit(event, user)
  const input = await readValidatedBody(event, publishTeaSchema.parse)

  const tea = await usePrisma().$transaction(async (tx) => {
    // Nur der Ersteller veröffentlicht; für andere ist der Tee hier nicht vorhanden (AK-4.4)
    const current = await loadCurrentTea(tx, id, user)
    if (!current || current.tea.ownerId !== user.id) throw teaNotFound()
    if (current.version.visibility === 'public') {
      throw new AppError(400, 'ALREADY_PUBLIC', 'The tea is already public')
    }

    const deactivated = await tx.$executeRaw`
      UPDATE "TeaVersion" SET "isCurrent" = false
      WHERE "teaId" = ${id}::uuid AND "isCurrent" AND version = ${input.version}`
    if (deactivated === 0) {
      throw new AppError(409, 'EDIT_CONFLICT', 'The tea was changed in the meantime', {
        currentVersion: current.version.version,
      })
    }

    // Ab jetzt gilt die Duplikatregel für alle Sprachen (AK-4.2)
    const snapshot: TeaSnapshot = { ...toTeaSnapshot(current.tea, current.version), visibility: 'public' }
    await assertTeaNamesAvailable(tx, snapshot, { teaId: id })
    const version = await writeTeaVersion(tx, { teaId: id, version: input.version + 1, snapshot, authorId: user.id, note: input.note })
    return toTeaDetail(tx, current.tea, version, user)
  })

  await audit(event, { event: 'TEA_PUBLISHED', actorId: user.id, details: { teaId: id, version: tea.version, private: false } })
  return { tea }
})

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

    const before = toTeaSnapshot(current.tea, current.version)
    // Ab jetzt gilt die Duplikatregel für alle Sprachen (AK-4.2)
    const saved = await saveTeaVersion(tx, {
      teaId: id,
      expectedVersion: input.version,
      before,
      after: { ...before, visibility: 'public' },
      authorId: user.id,
      note: input.note,
    })
    // Kann nicht eintreten: Die Sichtbarkeit ändert sich immer (ALREADY_PUBLIC ist oben geprüft)
    if (!saved.changed) throw new AppError(400, 'ALREADY_PUBLIC', 'The tea is already public')
    return toTeaDetail(tx, current.tea, saved.version, user)
  })

  await audit(event, { event: 'TEA_PUBLISHED', actorId: user.id, details: { teaId: id, version: tea.version, private: false } })
  return { tea }
})

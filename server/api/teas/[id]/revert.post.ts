import { revertSchema } from '#shared/schemas/catalog'

// Zurücksetzen auf eine ältere Version (05 AK-1.1–1.5); private Tees nur durch den Ersteller (AK-1.2)
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getTeaIdParam(event)
  assertCatalogRateLimit(event, user)
  const input = await readValidatedBody(event, revertSchema.parse)

  const result = await usePrisma().$transaction(async (tx) => {
    const current = await loadCurrentTea(tx, id, user)
    if (!current) throw teaNotFound()
    const target = await loadTeaVersion(tx, id, input.to)
    if (!target || target.version === current.version.version) {
      throw new AppError(400, 'INVALID_REVERT_TARGET', 'Choose an older version to revert to')
    }

    const { tea } = current
    const before = toTeaSnapshot(tea, current.version)
    const saved = await saveTeaVersion(tx, {
      teaId: id,
      expectedVersion: input.version,
      before,
      after: await revertedTeaSnapshot(tx, tea, before, target),
      authorId: user.id,
      note: input.note,
      revertedTo: input.to,
    })
    const version = saved.changed ? saved.version : current.version
    return { tea: await toTeaDetail(tx, tea, version, user), changed: saved.changed }
  })

  if (result.changed) {
    await audit(event, {
      event: 'TEA_REVERTED',
      actorId: user.id,
      details: { teaId: id, version: result.tea.version, revertedTo: input.to, private: result.tea.visibility === 'private' },
    })
  }
  return result
})

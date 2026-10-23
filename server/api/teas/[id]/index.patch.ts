import { updateTeaSchema } from '#shared/schemas/tea'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getTeaIdParam(event)
  assertCatalogRateLimit(event, user)
  const input = await readValidatedBody(event, updateTeaSchema.parse)

  const result = await usePrisma().$transaction(async (tx) => {
    // Öffentliche Tees darf jeder bearbeiten, private nur der Ersteller – für andere existieren sie nicht (AK-3.2)
    const current = await loadCurrentTea(tx, id, user)
    if (!current) throw teaNotFound()
    const { tea } = current
    const before = toTeaSnapshot(tea, current.version)

    const kind = input.kind ?? before.kind
    const after: TeaSnapshot = {
      ...before,
      kind,
      brand: kind === 'bought' ? (input.brand === undefined ? before.brand : input.brand) : null,
      caffeine: input.caffeine ?? before.caffeine,
      brewTempC: input.brewTempC === undefined ? before.brewTempC : input.brewTempC,
      brewSeconds: input.brewSeconds === undefined ? before.brewSeconds : input.brewSeconds,
      translations: { ...before.translations, ...input.translations },
      ingredients: input.ingredients ?? before.ingredients,
    }

    const saved = await saveTeaVersion(tx, {
      teaId: id,
      expectedVersion: input.version,
      before,
      after,
      authorId: user.id,
      note: input.note,
    })
    if (!saved.changed) {
      return { tea: await toTeaDetail(tx, tea, current.version, user), changed: false, locales: [] }
    }
    return { tea: await toTeaDetail(tx, tea, saved.version, user), changed: true, locales: saved.locales }
  })

  if (result.changed) {
    await audit(event, {
      event: 'TEA_UPDATED',
      actorId: user.id,
      details: { teaId: id, version: result.tea.version, locales: result.locales, private: result.tea.visibility === 'private' },
    })
  }
  return { tea: result.tea, changed: result.changed }
})

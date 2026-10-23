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

    const changes = diffTeaSnapshots(before, after)
    if (!changes.length) {
      return { tea: await toTeaDetail(tx, tea, current.version, user), changed: false, locales: [] }
    }
    if (input.ingredients) await assertIngredientsExist(tx, input.ingredients)

    // Optimistisches Sperren: nur die Version deaktivieren, die der Client geladen hat
    const deactivated = await tx.$executeRaw`
      UPDATE "TeaVersion" SET "isCurrent" = false
      WHERE "teaId" = ${id}::uuid AND "isCurrent" AND version = ${input.version}`
    if (deactivated === 0) {
      throw new AppError(409, 'EDIT_CONFLICT', 'The tea was changed in the meantime', {
        currentVersion: current.version.version,
      })
    }

    await assertTeaNamesAvailable(tx, after, { teaId: id, before })
    const version = await writeTeaVersion(tx, { teaId: id, version: input.version + 1, snapshot: after, authorId: user.id, note: input.note })
    const locales = [...new Set(changes.flatMap(change => ('locale' in change && change.locale ? [change.locale] : [])))]
    return { tea: await toTeaDetail(tx, tea, version, user), changed: true, locales }
  }).catch((error: unknown) => {
    // Gleichzeitige Speicherung, die das UPDATE oben nicht erkannt hat (Unique-Index greift)
    if ((error as { code?: string }).code === 'P2002') {
      throw new AppError(409, 'EDIT_CONFLICT', 'The tea was changed in the meantime')
    }
    throw error
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

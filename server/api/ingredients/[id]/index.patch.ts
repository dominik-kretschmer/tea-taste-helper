import { updateIngredientSchema } from '#shared/schemas/ingredient'

const TEN_MINUTES = 10 * 60 * 1000

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getIngredientIdParam(event)
  assertRateLimit(event, consume(`catalog:user:${user.id}`, 30, TEN_MINUTES))
  const input = await readValidatedBody(event, updateIngredientSchema.parse)

  const result = await usePrisma().$transaction(async (tx) => {
    const current = await loadCurrent(tx, id)
    if (!current) throw notFound()
    const { ingredient } = current
    const before = toSnapshot(ingredient.sourceLocale, current.version)

    const after: IngredientSnapshot = {
      ...before,
      caffeine: input.caffeine ?? before.caffeine,
      brewTempC: input.brewTempC === undefined ? before.brewTempC : input.brewTempC,
      brewSeconds: input.brewSeconds === undefined ? before.brewSeconds : input.brewSeconds,
      translations: { ...before.translations, ...input.translations },
    }

    const changes = diffSnapshots(before, after)
    if (!changes.length) {
      return { ingredient: toDetail(id, ingredient.sourceLocale, current.version), changed: false, locales: [] }
    }

    // Optimistisches Sperren: nur die Version deaktivieren, die der Client geladen hat (AK-3.2)
    const deactivated = await tx.$executeRaw`
      UPDATE "IngredientVersion" SET "isCurrent" = false
      WHERE "ingredientId" = ${id}::uuid AND "isCurrent" AND version = ${input.version}`
    if (deactivated === 0) {
      const latest = await loadCurrent(tx, id)
      throw new AppError(409, 'EDIT_CONFLICT', 'The ingredient was changed in the meantime', {
        currentVersion: latest?.version.version ?? current.version.version,
      })
    }

    // Duplikatregel nur für geänderte Namen (AK-3.4, AK-4.2), Reihenfolge fest wegen der Sperren
    for (const locale of CONTENT_LOCALES) {
      const name = after.translations[locale]?.name
      if (!name) continue
      const key = normalizeName(name)
      const previous = before.translations[locale]?.name
      if (previous === undefined || normalizeName(previous) !== key) await assertNameAvailable(tx, locale, key, id)
    }

    const version = await writeVersion(tx, {
      ingredientId: id,
      version: input.version + 1,
      snapshot: after,
      authorId: user.id,
      note: input.note,
    })
    const locales = [...new Set(changes.flatMap(change => change.locale ? [change.locale] : []))]
    return { ingredient: toDetail(id, ingredient.sourceLocale, version), changed: true, locales }
  }).catch((error: unknown) => {
    // Gleichzeitige Speicherung, die das UPDATE oben nicht erkannt hat (Unique-Index greift)
    if ((error as { code?: string }).code === 'P2002') {
      throw new AppError(409, 'EDIT_CONFLICT', 'The ingredient was changed in the meantime')
    }
    throw error
  })

  if (result.changed) {
    await audit(event, {
      event: 'INGREDIENT_UPDATED',
      actorId: user.id,
      details: { ingredientId: id, version: result.ingredient.version, locales: result.locales },
    })
  }
  return { ingredient: result.ingredient, changed: result.changed }
})

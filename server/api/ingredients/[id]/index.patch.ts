import { updateIngredientSchema } from '#shared/schemas/ingredient'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getIngredientIdParam(event)
  assertCatalogRateLimit(event, user)
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

    const saved = await saveIngredientVersion(tx, {
      ingredientId: id,
      expectedVersion: input.version,
      before,
      after,
      authorId: user.id,
      note: input.note,
    })
    if (!saved.changed) {
      return { ingredient: toDetail(id, ingredient.sourceLocale, current.version), changed: false, locales: [] }
    }
    return { ingredient: toDetail(id, ingredient.sourceLocale, saved.version), changed: true, locales: saved.locales }
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

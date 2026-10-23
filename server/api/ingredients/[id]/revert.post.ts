import { revertSchema } from '#shared/schemas/catalog'

// Zurücksetzen auf eine ältere Version: deren Inhalt wird als neue Version gespeichert (05 AK-1.1–1.3)
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getIngredientIdParam(event)
  assertCatalogRateLimit(event, user)
  const input = await readValidatedBody(event, revertSchema.parse)

  const result = await usePrisma().$transaction(async (tx) => {
    const current = await loadCurrent(tx, id)
    if (!current) throw notFound()
    const target = await loadVersion(tx, id, input.to)
    if (!target || target.version === current.version.version) {
      throw new AppError(400, 'INVALID_REVERT_TARGET', 'Choose an older version to revert to')
    }

    const { ingredient } = current
    const saved = await saveIngredientVersion(tx, {
      ingredientId: id,
      expectedVersion: input.version,
      before: toSnapshot(ingredient.sourceLocale, current.version),
      after: toSnapshot(ingredient.sourceLocale, target),
      authorId: user.id,
      note: input.note,
      revertedTo: input.to,
    })
    const version = saved.changed ? saved.version : current.version
    return { ingredient: toDetail(id, ingredient.sourceLocale, version), changed: saved.changed }
  })

  if (result.changed) {
    await audit(event, {
      event: 'INGREDIENT_REVERTED',
      actorId: user.id,
      details: { ingredientId: id, version: result.ingredient.version, revertedTo: input.to },
    })
  }
  return result
})

import { createIngredientSchema } from '#shared/schemas/ingredient'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  assertCatalogRateLimit(event, user)
  const input = await readValidatedBody(event, createIngredientSchema.parse)

  const ingredient = await usePrisma().$transaction(async (tx) => {
    await assertNameAvailable(tx, input.locale, normalizeName(input.name))
    const created = await tx.ingredient.create({ data: { sourceLocale: input.locale } })
    const version = await writeVersion(tx, {
      ingredientId: created.id,
      version: 1,
      authorId: user.id,
      note: input.note,
      snapshot: {
        sourceLocale: input.locale,
        caffeine: input.caffeine,
        brewTempC: input.brewTempC,
        brewSeconds: input.brewSeconds,
        translations: { [input.locale]: { name: input.name, description: input.description } },
      },
    })
    return toDetail(created.id, created.sourceLocale, version)
  })

  await audit(event, { event: 'INGREDIENT_CREATED', actorId: user.id, details: { ingredientId: ingredient.id, version: 1 } })
  setResponseStatus(event, 201)
  return { ingredient }
})

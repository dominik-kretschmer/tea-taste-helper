import { createTeaSchema } from '#shared/schemas/tea'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  assertCatalogRateLimit(event, user)
  const input = await readValidatedBody(event, createTeaSchema.parse)

  const tea = await usePrisma().$transaction(async (tx) => {
    await assertIngredientsExist(tx, input.ingredients)
    const snapshot: TeaSnapshot = {
      sourceLocale: input.locale,
      visibility: input.visibility,
      kind: input.kind,
      brand: input.brand,
      caffeine: input.caffeine,
      brewTempC: input.brewTempC,
      brewSeconds: input.brewSeconds,
      translations: { [input.locale]: { name: input.name, description: input.description } },
      ingredients: input.ingredients,
    }
    await assertTeaNamesAvailable(tx, snapshot)
    const created = await tx.tea.create({ data: { sourceLocale: input.locale, ownerId: user.id } })
    const version = await writeTeaVersion(tx, { teaId: created.id, version: 1, snapshot, authorId: user.id, note: input.note })
    return toTeaDetail(tx, created, version, user)
  })

  await audit(event, {
    event: 'TEA_CREATED',
    actorId: user.id,
    details: { teaId: tea.id, version: 1, private: tea.visibility === 'private' },
  })
  setResponseStatus(event, 201)
  return { tea }
})

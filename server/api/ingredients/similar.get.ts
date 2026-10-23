import { similarQuerySchema } from '#shared/schemas/ingredient'

export default defineEventHandler(async (event) => {
  const { name, locale } = await getValidatedQuery(event, similarQuerySchema.parse)
  return { items: await findSimilar(usePrisma(), name, locale) }
})

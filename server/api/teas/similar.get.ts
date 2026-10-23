import { similarTeaQuerySchema } from '#shared/schemas/tea'

export default defineEventHandler(async (event) => {
  const { name, locale } = await getValidatedQuery(event, similarTeaQuerySchema.parse)
  return { items: await findSimilarTeas(usePrisma(), name, locale) }
})

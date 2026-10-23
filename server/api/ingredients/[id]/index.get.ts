import { detailQuerySchema } from '#shared/schemas/catalog'

export default defineEventHandler(async (event) => {
  const id = getIngredientIdParam(event)
  // ?merged=1: Historie einer zusammengeführten Zutat (05 AK-4.2), sonst 404 mit `mergedInto`
  const { merged } = await getValidatedQuery(event, detailQuerySchema.parse)
  return { ingredient: await loadDetail(usePrisma(), id, event.context.user, { allowMerged: merged }) }
})

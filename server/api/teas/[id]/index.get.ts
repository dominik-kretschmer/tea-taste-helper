import { detailQuerySchema } from '#shared/schemas/catalog'

export default defineEventHandler(async (event) => {
  const id = getTeaIdParam(event)
  // ?merged=1: Historie eines zusammengeführten Tees (05 AK-4.2), sonst 404 mit `mergedInto`
  const { merged } = await getValidatedQuery(event, detailQuerySchema.parse)
  return { tea: await loadTeaDetail(usePrisma(), id, event.context.user, { allowMerged: merged }) }
})

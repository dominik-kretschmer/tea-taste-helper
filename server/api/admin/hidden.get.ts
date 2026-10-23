import { hiddenListQuerySchema } from '#shared/schemas/moderation'

export default defineEventHandler(async (event): Promise<Page<HiddenEntry>> => {
  requireRole(event, 'moderator')
  const query = await getValidatedQuery(event, hiddenListQuerySchema.parse)
  return listHiddenEntries(usePrisma(), query)
})

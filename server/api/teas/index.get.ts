import { teaListQuerySchema } from '#shared/schemas/tea'

export default defineEventHandler(async (event): Promise<Page<TeaListItem>> => {
  const query = await getValidatedQuery(event, teaListQuerySchema.parse)
  // „Meine Tees“ nur angemeldet (AK-7.1); ohne `mine` immer nur öffentliche Tees (AK-1.1)
  const viewer = query.mine ? requireUser(event) : event.context.user
  return listTeas(usePrisma(), query, viewer)
})

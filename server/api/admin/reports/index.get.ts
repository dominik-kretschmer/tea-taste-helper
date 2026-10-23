import { reportListQuerySchema } from '#shared/schemas/moderation'

export default defineEventHandler(async (event): Promise<Page<ReportGroup>> => {
  requireRole(event, 'moderator')
  const query = await getValidatedQuery(event, reportListQuerySchema.parse)
  return listReportGroups(usePrisma(), query)
})

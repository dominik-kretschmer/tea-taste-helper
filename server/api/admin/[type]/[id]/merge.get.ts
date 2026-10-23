import { mergePreviewQuerySchema } from '#shared/schemas/moderation'

export default defineEventHandler(async (event): Promise<MergePreview> => {
  const user = requireRole(event, 'moderator')
  const { entityType, id } = getEntryParams(event)
  const { target } = await getValidatedQuery(event, mergePreviewQuerySchema.parse)
  return previewMerge(usePrisma(), entityType, id, target, user)
})

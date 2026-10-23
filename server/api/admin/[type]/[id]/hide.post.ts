import { hideSchema } from '#shared/schemas/moderation'

// Eintrag weich löschen (05 AK-5.1, AK-5.2)
export default defineEventHandler(async (event) => {
  const user = requireRole(event, 'moderator')
  const { entityType, id } = getEntryParams(event)
  const { reason } = await readValidatedBody(event, hideSchema.parse)

  await usePrisma().$transaction(tx => hideEntry(tx, { entityType, id, actorId: user.id, reason }))

  await audit(event, {
    event: entityType === 'ingredient' ? 'INGREDIENT_HIDDEN' : 'TEA_HIDDEN',
    actorId: user.id,
    details: { [entityType === 'ingredient' ? 'ingredientId' : 'teaId']: id, reason },
  })
  setResponseStatus(event, 204)
  return null
})

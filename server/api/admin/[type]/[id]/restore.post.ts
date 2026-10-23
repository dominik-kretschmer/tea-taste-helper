// Ausgeblendeten Eintrag wiederherstellen (05 AK-5.5)
export default defineEventHandler(async (event) => {
  const user = requireRole(event, 'moderator')
  const { entityType, id } = getEntryParams(event)

  await usePrisma().$transaction(tx => restoreEntry(tx, { entityType, id, actorId: user.id }))

  await audit(event, {
    event: entityType === 'ingredient' ? 'INGREDIENT_RESTORED' : 'TEA_RESTORED',
    actorId: user.id,
    details: { [entityType === 'ingredient' ? 'ingredientId' : 'teaId']: id },
  })
  setResponseStatus(event, 204)
  return null
})

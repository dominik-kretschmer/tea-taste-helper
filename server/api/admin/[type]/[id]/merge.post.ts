import { mergeSchema } from '#shared/schemas/moderation'

// Duplikat zusammenführen; endgültig (05 AK-4.1–4.7)
export default defineEventHandler(async (event) => {
  const user = requireRole(event, 'moderator')
  const { entityType, id } = getEntryParams(event)
  const { targetId } = await readValidatedBody(event, mergeSchema.parse)
  const prisma = usePrisma()

  if (entityType === 'tea') {
    await prisma.$transaction(tx => mergeTeas(tx, { sourceId: id, targetId, actorId: user.id }))
    await audit(event, { event: 'TEA_MERGED', actorId: user.id, details: { sourceId: id, targetId } })
    return { targetId, teasChanged: 0 }
  }

  // Viele Tees umzustellen dauert; das Standard-Timeout von Prisma (5 s) reicht dafür nicht immer
  const result = await prisma.$transaction(tx => mergeIngredients(tx, { sourceId: id, targetId, actorId: user.id }), { timeout: 60_000 })
  // Ein Eintrag für alle umgestellten Tees statt TEA_UPDATED je Tee (AK-8.1)
  await audit(event, { event: 'INGREDIENT_MERGED', actorId: user.id, details: { sourceId: id, targetId, ...result } })
  return { targetId, teasChanged: result.teasChanged }
})

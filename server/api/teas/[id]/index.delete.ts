export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getTeaIdParam(event)
  assertCatalogRateLimit(event, user)

  await usePrisma().$transaction(async (tx) => {
    // Nur der Ersteller, nur private Tees (AK-3.5, AK-3.6); Versionen fallen per Kaskade mit weg
    const current = await loadCurrentTea(tx, id, user)
    if (!current || current.tea.ownerId !== user.id) throw teaNotFound()
    if (current.version.visibility === 'public') {
      throw new AppError(409, 'TEA_PUBLIC', 'Public teas cannot be deleted')
    }
    await tx.tea.delete({ where: { id } })
  })

  await audit(event, { event: 'TEA_DELETED', actorId: user.id, details: { teaId: id, private: true } })
  setResponseStatus(event, 204)
  return null
})

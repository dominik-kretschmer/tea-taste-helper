import { compareQuerySchema } from '#shared/schemas/tea'

export default defineEventHandler(async (event) => {
  const id = getTeaIdParam(event)
  const query = await getValidatedQuery(event, compareQuerySchema.parse)

  const prisma = usePrisma()
  const current = await loadReadableTea(prisma, id, event.context.user, { allowMerged: true })
  const [from, to] = await Promise.all([loadTeaVersion(prisma, id, query.from), loadTeaVersion(prisma, id, query.to)])
  if (!from || !to) throw new AppError(404, 'NOT_FOUND', 'Version not found')

  const side = (version: LoadedTeaVersion) => ({ ...toRevisionEntry(version), snapshot: toTeaSnapshot(current.tea, version) })
  const result = { from: side(from), to: side(to) }

  // Namen aller Zutaten beider Stände, damit auch entfernte Zutaten lesbar sind
  const ids = [...new Set([...result.from.snapshot.ingredients, ...result.to.snapshot.ingredients].map(item => item.ingredientId))]
  const [views, merged] = await Promise.all([
    loadIngredientViews(prisma, ids),
    // Zusammengeführte Zutaten verlinken auf ihr Ziel (05 AK-4.4)
    prisma.ingredient.findMany({ where: { id: { in: ids }, mergedIntoId: { not: null } }, select: { id: true, mergedIntoId: true } }),
  ])
  const mergedInto = new Map(merged.map(row => [row.id, row.mergedIntoId]))
  const ingredients = Object.fromEntries([...views].map(([key, view]) => [key, {
    sourceLocale: view.sourceLocale,
    translations: view.translations,
    ...(mergedInto.has(key) ? { mergedInto: mergedInto.get(key) } : {}),
  }]))

  return { ...result, changes: diffTeaSnapshots(result.from.snapshot, result.to.snapshot), ingredients }
})

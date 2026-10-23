import { compareQuerySchema } from '#shared/schemas/tea'

export default defineEventHandler(async (event) => {
  const id = getTeaIdParam(event)
  const query = await getValidatedQuery(event, compareQuerySchema.parse)

  const prisma = usePrisma()
  const current = await loadCurrentTea(prisma, id, event.context.user)
  if (!current) throw teaNotFound()
  const [from, to] = await Promise.all([loadTeaVersion(prisma, id, query.from), loadTeaVersion(prisma, id, query.to)])
  if (!from || !to) throw new AppError(404, 'NOT_FOUND', 'Version not found')

  const side = (version: LoadedTeaVersion) => ({ ...toRevisionEntry(version), snapshot: toTeaSnapshot(current.tea, version) })
  const result = { from: side(from), to: side(to) }

  // Namen aller Zutaten beider Stände, damit auch entfernte Zutaten lesbar sind
  const ids = [...new Set([...result.from.snapshot.ingredients, ...result.to.snapshot.ingredients].map(item => item.ingredientId))]
  const views = await loadIngredientViews(prisma, ids)
  const ingredients = Object.fromEntries([...views].map(([key, view]) => [key, { sourceLocale: view.sourceLocale, translations: view.translations }]))

  return { ...result, changes: diffTeaSnapshots(result.from.snapshot, result.to.snapshot), ingredients }
})

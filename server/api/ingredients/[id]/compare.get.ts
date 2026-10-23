import { compareQuerySchema } from '#shared/schemas/ingredient'

export default defineEventHandler(async (event) => {
  const id = getIngredientIdParam(event)
  const query = await getValidatedQuery(event, compareQuerySchema.parse)

  const prisma = usePrisma()
  const { ingredient } = await loadReadableIngredient(prisma, id, event.context.user)
  const [from, to] = await Promise.all([loadVersion(prisma, id, query.from), loadVersion(prisma, id, query.to)])
  if (!from || !to) throw new AppError(404, 'NOT_FOUND', 'Version not found')

  const side = (version: LoadedVersion) => ({ ...toRevisionEntry(version), snapshot: toSnapshot(ingredient.sourceLocale, version) })
  const result = { from: side(from), to: side(to) }
  return { ...result, changes: diffSnapshots(result.from.snapshot, result.to.snapshot) }
})

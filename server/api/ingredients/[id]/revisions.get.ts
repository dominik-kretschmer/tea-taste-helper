import { revisionsQuerySchema } from '#shared/schemas/ingredient'

const PAGE_SIZE = 50

export default defineEventHandler(async (event): Promise<RevisionPage> => {
  const id = getIngredientIdParam(event)
  const { page } = await getValidatedQuery(event, revisionsQuerySchema.parse)

  const prisma = usePrisma()
  // Zusammengeführte Zutaten bleiben lesbar, ausgeblendete nur für Moderatoren (05 AK-4.2, AK-5.4)
  await loadReadableIngredient(prisma, id, event.context.user)
  const [rows, total] = await prisma.$transaction([
    prisma.ingredientVersion.findMany({
      where: { ingredientId: id },
      include: { author: { select: { displayName: true } }, ...marksInclude },
      orderBy: { version: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.ingredientVersion.count({ where: { ingredientId: id } }),
  ])
  if (!total) throw notFound()

  const events = await loadCatalogEvents(prisma, 'ingredient', id, event.context.user)
  return { items: rows.map(toRevisionEntry), total, page, pageSize: PAGE_SIZE, events }
})

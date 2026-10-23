import { revisionsQuerySchema } from '#shared/schemas/ingredient'

const PAGE_SIZE = 50

export default defineEventHandler(async (event): Promise<Page<RevisionEntry>> => {
  const id = getIngredientIdParam(event)
  const { page } = await getValidatedQuery(event, revisionsQuerySchema.parse)

  const prisma = usePrisma()
  const [rows, total] = await prisma.$transaction([
    prisma.ingredientVersion.findMany({
      where: { ingredientId: id },
      include: { author: { select: { displayName: true } } },
      orderBy: { version: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.ingredientVersion.count({ where: { ingredientId: id } }),
  ])
  if (!total) throw notFound()

  return { items: rows.map(toRevisionEntry), total, page, pageSize: PAGE_SIZE }
})

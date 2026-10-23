import { revisionsQuerySchema } from '#shared/schemas/tea'

const PAGE_SIZE = 50

export default defineEventHandler(async (event): Promise<Page<RevisionEntry>> => {
  const id = getTeaIdParam(event)
  const { page } = await getValidatedQuery(event, revisionsQuerySchema.parse)

  const prisma = usePrisma()
  // Historie privater Tees nur für den Ersteller (AK-6.2)
  if (!(await loadCurrentTea(prisma, id, event.context.user))) throw teaNotFound()

  const [rows, total] = await prisma.$transaction([
    prisma.teaVersion.findMany({
      where: { teaId: id },
      include: { author: { select: { displayName: true } } },
      orderBy: { version: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.teaVersion.count({ where: { teaId: id } }),
  ])
  return { items: rows.map(toRevisionEntry), total, page, pageSize: PAGE_SIZE }
})

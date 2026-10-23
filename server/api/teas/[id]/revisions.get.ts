import { revisionsQuerySchema } from '#shared/schemas/tea'

const PAGE_SIZE = 50

export default defineEventHandler(async (event): Promise<RevisionPage> => {
  const id = getTeaIdParam(event)
  const { page } = await getValidatedQuery(event, revisionsQuerySchema.parse)

  const prisma = usePrisma()
  // Historie privater Tees nur für den Ersteller (AK-6.2); zusammengeführte lesbar, ausgeblendete nur für Moderatoren (05)
  await loadReadableTea(prisma, id, event.context.user, { allowMerged: true })

  const [rows, total] = await prisma.$transaction([
    prisma.teaVersion.findMany({
      where: { teaId: id },
      include: { author: { select: { displayName: true } }, ...teaMarksInclude() },
      orderBy: { version: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.teaVersion.count({ where: { teaId: id } }),
  ])
  const events = await loadCatalogEvents(prisma, 'tea', id, event.context.user)
  return { items: rows.map(toRevisionEntry), total, page, pageSize: PAGE_SIZE, events }
})

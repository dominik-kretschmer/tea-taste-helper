import { auditQuerySchema } from '#shared/schemas/auth'
import type { Prisma } from '../../generated/prisma/client'

const PAGE_SIZE = 50
const person = { select: { id: true, displayName: true } } as const

export default defineEventHandler(async (event): Promise<Page<AuditEntry>> => {
  requireRole(event, 'admin')
  const { event: type, userId, page } = await getValidatedQuery(event, auditQuerySchema.parse)

  const where: Prisma.AuditLogWhereInput = {
    ...(type ? { event: type } : {}),
    ...(userId ? { OR: [{ actorId: userId }, { targetId: userId }] } : {}),
  }

  const prisma = usePrisma()
  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include: { actor: person, target: person },
      orderBy: { id: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ])

  const items = rows.map(row => ({
    id: row.id.toString(),
    createdAt: row.createdAt.toISOString(),
    event: row.event,
    actor: row.actor,
    target: row.target,
    ip: row.ip,
    requestId: row.requestId,
    details: row.details as Record<string, unknown> | null,
  }))
  return { items, total, page, pageSize: PAGE_SIZE }
})

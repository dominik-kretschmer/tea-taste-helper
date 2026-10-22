import { adminUsersQuerySchema } from '#shared/schemas/auth'
import type { Prisma } from '../../../generated/prisma/client'

const PAGE_SIZE = 25

export default defineEventHandler(async (event): Promise<Page<AdminUser>> => {
  requireRole(event, 'admin')
  const { q, page } = await getValidatedQuery(event, adminUsersQuerySchema.parse)

  const where: Prisma.UserWhereInput = q
    ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { displayName: { contains: q, mode: 'insensitive' } }] }
    : {}

  const prisma = usePrisma()
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.user.count({ where }),
  ])

  return { items: users.map(toAdminUser), total, page, pageSize: PAGE_SIZE }
})

import { moderationUsersQuerySchema } from '#shared/schemas/moderation'
import type { Prisma } from '../../../generated/prisma/client'

// Nutzersuche für Moderatoren: nur nach Anzeigename, ohne E-Mail (außer für Admins) (05 AK-6.6)
export default defineEventHandler(async (event): Promise<Page<ModerationUser>> => {
  const viewer = requireRole(event, 'moderator')
  const { q, blocked, page } = await getValidatedQuery(event, moderationUsersQuerySchema.parse)

  const now = new Date()
  const where: Prisma.UserWhereInput = {
    ...(q ? { displayName: { contains: q, mode: 'insensitive' } } : {}),
    // aktuell gesperrt: blockedAt gesetzt und unbefristet bzw. noch nicht abgelaufen
    ...(blocked ? { blockedAt: { not: null }, OR: [{ blockedUntil: null }, { blockedUntil: { gt: now } }] } : {}),
  }

  const prisma = usePrisma()
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({ where, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], skip: (page - 1) * MODERATION_PAGE_SIZE, take: MODERATION_PAGE_SIZE }),
    prisma.user.count({ where }),
  ])
  const changes = await countRecentChanges(prisma, users.map(user => user.id))
  return { items: users.map(user => toModerationUser(user, viewer, changes.get(user.id) ?? 0)), total, page, pageSize: MODERATION_PAGE_SIZE }
})

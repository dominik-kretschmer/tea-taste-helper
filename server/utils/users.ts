import type { H3Event } from 'h3'
import { z } from 'zod'
import type { User } from '../generated/prisma/client'

export function toAdminUser(user: User): AdminUser {
  return {
    ...toPublicUser(user),
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  }
}

/** Nutzer-ID aus dem Routenparameter `id`; ungültige IDs gelten als nicht gefunden. */
export function getUserIdParam(event: H3Event): string {
  const parsed = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) throw new AppError(404, 'NOT_FOUND', 'User not found')
  return parsed.data
}

/**
 * Wer wen sperren darf (05 AK-6.5): Moderatoren nur Nutzer, Admins zusätzlich Moderatoren;
 * Admins sind nicht sperrbar, niemand sperrt sich selbst.
 */
export function assertCanBlock(actor: PublicUser, target: Pick<User, 'id' | 'role'>): void {
  if (target.id === actor.id) throw new AppError(403, 'FORBIDDEN', 'You cannot block yourself')
  if (target.role === 'admin') throw new AppError(403, 'FORBIDDEN', 'Admins cannot be blocked')
  if (target.role === 'moderator' && actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Only admins can block moderators')
}

/** Nutzer für die Moderationsliste; die E-Mail nur für Admins (05 AK-6.6). */
export function toModerationUser(user: User, viewer: PublicUser, changes30d = 0): ModerationUser {
  return {
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    ...(viewer.role === 'admin' ? { email: user.email } : {}),
    blocked: isBlocked(user),
    blockedAt: user.blockedAt?.toISOString() ?? null,
    blockedUntil: user.blockedUntil?.toISOString() ?? null,
    blockReason: user.blockReason,
    changes30d,
  }
}

/** Katalogänderungen (Zutatenversionen und öffentliche Teeversionen) der letzten 30 Tage je Nutzer. */
export async function countRecentChanges(db: Db, userIds: string[]): Promise<Map<string, number>> {
  if (!userIds.length) return new Map()
  const rows = await db.$queryRaw<{ authorId: string, count: number }[]>`
    SELECT "authorId", count(*)::int AS count FROM (
      SELECT "authorId" FROM "IngredientVersion" WHERE "authorId" = ANY(${userIds}::uuid[]) AND "createdAt" >= now() - interval '30 days'
      UNION ALL
      SELECT "authorId" FROM "TeaVersion" WHERE "authorId" = ANY(${userIds}::uuid[]) AND visibility = 'public' AND "createdAt" >= now() - interval '30 days'
    ) changes GROUP BY "authorId"`
  return new Map(rows.map(row => [row.authorId, row.count]))
}

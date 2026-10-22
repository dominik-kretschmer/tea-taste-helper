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

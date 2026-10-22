import type { H3Event } from 'h3'

/** Angemeldeter Nutzer oder 401 UNAUTHENTICATED (AK-7.1). */
export function requireUser(event: H3Event): PublicUser {
  const user = event.context.user
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required')
  return user
}

/** Nutzer mit mindestens dieser Rolle, sonst 401 bzw. 403 FORBIDDEN (AK-7.1, AK-7.2). */
export function requireRole(event: H3Event, role: Role): PublicUser {
  const user = requireUser(event)
  if (!hasRole(user, role)) throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions')
  return user
}

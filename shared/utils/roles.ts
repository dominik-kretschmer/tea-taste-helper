import type { AuditEventType, Role } from '../types/auth'

export const ROLES = ['user', 'moderator', 'admin'] as const satisfies readonly Role[]

/** Rollen sind hierarchisch: admin ⊇ moderator ⊇ user (AK-7.2). */
// `satisfies` statt Typannotation: Mit `ROLE_RANK: Record<Role, number> = …` übersieht der
// Auto-Import-Scanner (unimport) das folgende `hasRole`.
export const ROLE_RANK = { user: 0, moderator: 1, admin: 2 } satisfies Record<Role, number>

export function hasRole(user: { role: Role } | null | undefined, required: Role): boolean {
  return !!user && ROLE_RANK[user.role] >= ROLE_RANK[required]
}

export const AUDIT_EVENTS = [
  'USER_REGISTERED',
  'LOGIN_SUCCEEDED',
  'LOGIN_FAILED',
  'LOGOUT',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_BY_ADMIN',
  'ROLE_CHANGED',
  'ADMIN_BOOTSTRAPPED',
  'INGREDIENT_CREATED',
  'INGREDIENT_UPDATED',
  'TEA_CREATED',
  'TEA_UPDATED',
  'TEA_PUBLISHED',
  'TEA_DELETED',
  'INGREDIENT_REVERTED',
  'TEA_REVERTED',
  'REPORT_CREATED',
  'REPORT_RESOLVED',
  'INGREDIENT_MERGED',
  'TEA_MERGED',
  'INGREDIENT_HIDDEN',
  'INGREDIENT_RESTORED',
  'TEA_HIDDEN',
  'TEA_RESTORED',
  'USER_BLOCKED',
  'USER_UNBLOCKED',
  'BULK_REVERT',
] as const satisfies readonly AuditEventType[]

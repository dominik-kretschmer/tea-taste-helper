export type Role = 'user' | 'moderator' | 'admin'

export type AuditEventType =
  | 'USER_REGISTERED'
  | 'LOGIN_SUCCEEDED'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_BY_ADMIN'
  | 'ROLE_CHANGED'
  | 'ADMIN_BOOTSTRAPPED'
  | 'INGREDIENT_CREATED'
  | 'INGREDIENT_UPDATED'
  | 'TEA_CREATED'
  | 'TEA_UPDATED'
  | 'TEA_PUBLISHED'
  | 'TEA_DELETED'
  | 'INGREDIENT_REVERTED'
  | 'TEA_REVERTED'
  | 'REPORT_CREATED'
  | 'REPORT_RESOLVED'
  | 'INGREDIENT_MERGED'
  | 'TEA_MERGED'
  | 'INGREDIENT_HIDDEN'
  | 'INGREDIENT_RESTORED'
  | 'TEA_HIDDEN'
  | 'TEA_RESTORED'
  | 'USER_BLOCKED'
  | 'USER_UNBLOCKED'
  | 'BULK_REVERT'

/** Nutzer, wie ihn der Nutzer selbst und Admins sehen (enthält die E-Mail – nicht für öffentliche Ansichten). */
export interface PublicUser {
  id: string
  email: string
  displayName: string
  role: Role
  mustChangePassword: boolean
}

export interface AdminUser extends PublicUser {
  createdAt: string
  lastLoginAt: string | null
}

export interface AuditEntry {
  id: string
  createdAt: string
  event: AuditEventType
  actor: { id: string, displayName: string } | null
  target: { id: string, displayName: string } | null
  ip: string | null
  requestId: string | null
  details: Record<string, unknown> | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

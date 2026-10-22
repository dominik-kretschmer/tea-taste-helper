// Gemeinsame Eingabe-Schemas für Client (Formulare) und Server (API). Import: #shared/schemas/auth
import { z } from 'zod'
import { AUDIT_EVENTS, ROLES } from '../utils/roles'

export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128
export const DISPLAY_NAME_MIN = 2
export const DISPLAY_NAME_MAX = 40

// Erst normalisieren, dann prüfen – sonst scheitert die Formatprüfung an Leerzeichen.
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))

/** Nur die Länge zählt, keine Kompositionsregeln (NIST SP 800-63B, AK-1.4). */
export const newPasswordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX)

/** Beim Anmelden nicht die aktuellen Regeln erzwingen – nur Missbrauch (riesige Eingaben) verhindern. */
const existingPasswordSchema = z.string().min(1).max(PASSWORD_MAX)

export const displayNameSchema = z.string().trim().min(DISPLAY_NAME_MIN).max(DISPLAY_NAME_MAX)

export const registerSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: newPasswordSchema,
  remember: z.boolean().default(false),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: existingPasswordSchema,
  remember: z.boolean().default(false),
})

export const changePasswordSchema = z.object({
  currentPassword: existingPasswordSchema,
  newPassword: newPasswordSchema,
})

export const changeRoleSchema = z.object({
  role: z.enum(ROLES),
})

const pageSchema = z.coerce.number().int().min(1).max(10_000).default(1)

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: pageSchema,
})

export const auditQuerySchema = z.object({
  event: z.enum(AUDIT_EVENTS).optional(),
  userId: z.uuid().optional(),
  page: pageSchema,
})

export type RegisterInput = z.input<typeof registerSchema>
export type LoginInput = z.input<typeof loginSchema>
export type ChangePasswordInput = z.input<typeof changePasswordSchema>

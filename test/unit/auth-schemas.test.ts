import { describe, expect, it } from 'vitest'
import { AuditEvent, Role } from '../../server/generated/prisma/enums'
import { auditQuerySchema, changePasswordSchema, loginSchema, registerSchema } from '../../shared/schemas/auth'
import { AUDIT_EVENTS, hasRole, ROLES } from '../../shared/utils/roles'

const base = { email: 'a@b.de', displayName: 'Anna', password: 'x'.repeat(10) }

describe('registerSchema', () => {
  it.each([[9, false], [10, true], [128, true], [129, false]])('Passwort mit %i Zeichen → gültig: %s', (length, ok) => {
    expect(registerSchema.safeParse({ ...base, password: 'x'.repeat(length) }).success).toBe(ok)
  })

  it('verlangt keine Sonderzeichen oder Ziffern', () => {
    expect(registerSchema.safeParse({ ...base, password: 'nurkleinbuchstaben' }).success).toBe(true)
  })

  it.each([[1, false], [2, true], [40, true], [41, false]])('Anzeigename mit %i Zeichen → gültig: %s', (length, ok) => {
    expect(registerSchema.safeParse({ ...base, displayName: 'n'.repeat(length) }).success).toBe(ok)
  })

  it('trimmt den Anzeigenamen vor der Längenprüfung', () => {
    expect(registerSchema.parse({ ...base, displayName: '  Anna  ' }).displayName).toBe('Anna')
    expect(registerSchema.safeParse({ ...base, displayName: '  a  ' }).success).toBe(false)
  })

  it('normalisiert die E-Mail (trim, kleingeschrieben)', () => {
    expect(registerSchema.parse({ ...base, email: '  Anna@Example.ORG ' }).email).toBe('anna@example.org')
    expect(registerSchema.safeParse({ ...base, email: 'kein-mail' }).success).toBe(false)
  })

  it('setzt remember standardmäßig auf false', () => {
    expect(registerSchema.parse(base).remember).toBe(false)
  })
})

describe('loginSchema / changePasswordSchema', () => {
  it('erzwingt beim Login nicht die Mindestlänge (bestehende Passwörter)', () => {
    expect(loginSchema.safeParse({ email: 'a@b.de', password: 'kurz' }).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'a@b.de', password: '' }).success).toBe(false)
  })

  it('prüft beim Wechsel nur das neue Passwort auf die Regeln', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'alt', newPassword: 'x'.repeat(10) }).success).toBe(true)
    expect(changePasswordSchema.safeParse({ currentPassword: 'alt', newPassword: 'x'.repeat(9) }).success).toBe(false)
  })
})

describe('Rollen und Audit-Ereignisse', () => {
  it('stimmen mit den Prisma-Enums überein', () => {
    expect([...ROLES].sort()).toEqual(Object.values(Role).sort())
    expect([...AUDIT_EVENTS].sort()).toEqual(Object.values(AuditEvent).sort())
  })

  it('sind hierarchisch (AK-7.2)', () => {
    expect(hasRole({ role: 'admin' }, 'moderator')).toBe(true)
    expect(hasRole({ role: 'moderator' }, 'user')).toBe(true)
    expect(hasRole({ role: 'moderator' }, 'admin')).toBe(false)
    expect(hasRole({ role: 'user' }, 'moderator')).toBe(false)
    expect(hasRole(null, 'user')).toBe(false)
  })

  it('auditQuerySchema lehnt unbekannte Ereignisse ab und setzt page', () => {
    expect(auditQuerySchema.parse({}).page).toBe(1)
    expect(auditQuerySchema.parse({ page: '3' }).page).toBe(3)
    expect(auditQuerySchema.safeParse({ event: 'HACKED' }).success).toBe(false)
  })
})

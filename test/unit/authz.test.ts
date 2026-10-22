import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { requireRole, requireUser } from '../../server/utils/authz'
import { AppError } from '../../server/utils/errors'
import { hasRole } from '../../shared/utils/roles'

// authz.ts nutzt Auto-Imports (AppError, hasRole); im Unit-Test als Globals bereitstellen.
Object.assign(globalThis, { AppError, hasRole })

const event = (role?: Role) =>
  ({ context: { user: role ? { id: '1', email: 'a@b.de', displayName: 'A', role, mustChangePassword: false } : null } }) as unknown as H3Event

const failure = (fn: () => unknown) => {
  try {
    fn()
  }
  catch (error) {
    return error instanceof AppError ? { status: error.status, code: error.code } : error
  }
  return 'kein Fehler'
}

describe('requireUser', () => {
  it('liefert den Nutzer oder 401 UNAUTHENTICATED', () => {
    expect(requireUser(event('user')).role).toBe('user')
    expect(failure(() => requireUser(event()))).toEqual({ status: 401, code: 'UNAUTHENTICATED' })
  })
})

describe('requireRole', () => {
  it.each([
    ['admin', 'admin', 'ok'],
    ['admin', 'moderator', 'ok'],
    ['moderator', 'moderator', 'ok'],
    ['moderator', 'admin', 403],
    ['user', 'moderator', 403],
    ['user', 'admin', 403],
  ] as const)('%s für Rolle %s → %s', (has, needs, expected) => {
    const result = failure(() => requireRole(event(has), needs))
    expect(expected === 'ok' ? result : (result as { status: number }).status).toBe(expected === 'ok' ? 'kein Fehler' : expected)
  })

  it('Gast → 401 statt 403', () => {
    expect(failure(() => requireRole(event(), 'admin'))).toEqual({ status: 401, code: 'UNAUTHENTICATED' })
  })
})

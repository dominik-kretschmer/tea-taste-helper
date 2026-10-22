import { afterEach, describe, expect, it, vi } from 'vitest'
import { audit, sanitizeDetails } from '../../server/utils/audit'

describe('sanitizeDetails', () => {
  it('entfernt sensible Schlüssel, auch verschachtelt und in Arrays', () => {
    const details = sanitizeDetails({
      email: 'a@b.de',
      from: 'user',
      password: 'x',
      newPassword: 'x',
      temporaryPassword: 'x',
      passwordHash: 'x',
      sessionId: 'x',
      csrfToken: 'x',
      nested: { token: 'x', keep: 1, list: [{ secret: 'x', ok: true }] },
    })
    expect(details).toEqual({ email: 'a@b.de', from: 'user', nested: { keep: 1, list: [{ ok: true }] } })
    expect(JSON.stringify(details)).not.toContain('"x"')
  })
})

describe('audit', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('schreibt den bereinigten Eintrag', async () => {
    const create = vi.fn().mockResolvedValue({})
    vi.stubGlobal('usePrisma', () => ({ auditLog: { create } }))

    await audit(null, { event: 'ROLE_CHANGED', actorId: 'a', targetId: 't', details: { from: 'user', to: 'admin', token: 'x' } })

    expect(create).toHaveBeenCalledWith({
      data: { event: 'ROLE_CHANGED', actorId: 'a', targetId: 't', ip: null, requestId: null, details: { from: 'user', to: 'admin' } },
    })
  })

  it('wirft nicht, wenn das Schreiben scheitert, sondern loggt', async () => {
    const error = vi.fn()
    vi.stubGlobal('usePrisma', () => ({ auditLog: { create: vi.fn().mockRejectedValue(new Error('DB weg')) } }))
    vi.stubGlobal('useLogger', () => ({ error }))

    await expect(audit(null, { event: 'LOGOUT' })).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ auditEvent: 'LOGOUT' }), 'audit log write failed')
  })
})

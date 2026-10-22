import { describe, expect, it } from 'vitest'
import { generateTemporaryPassword, hashPassword, verifyDummy, verifyPassword } from '../../server/utils/password'

describe('hashPassword / verifyPassword', () => {
  it('speichert Argon2id mit den OWASP-Parametern, nie das Passwort selbst', async () => {
    const hash = await hashPassword('richtig-geheim')
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(hash).not.toContain('richtig-geheim')
  })

  it('erkennt richtiges und falsches Passwort', async () => {
    const hash = await hashPassword('richtig-geheim')
    expect(await verifyPassword(hash, 'richtig-geheim')).toBe(true)
    expect(await verifyPassword(hash, 'falsch-geheim')).toBe(false)
  })

  it('erzeugt für dasselbe Passwort verschiedene Hashes (Salt)', async () => {
    expect(await hashPassword('gleich')).not.toBe(await hashPassword('gleich'))
  })

  it('wertet einen kaputten Hash als falsch statt zu werfen', async () => {
    expect(await verifyPassword('kein-hash', 'egal')).toBe(false)
  })
})

describe('verifyDummy', () => {
  it('ist immer false und braucht ähnlich lange wie eine echte Prüfung', async () => {
    const hash = await hashPassword('richtig-geheim')
    await verifyDummy('aufwärmen')

    const time = async (fn: () => Promise<unknown>) => {
      const start = performance.now()
      for (let i = 0; i < 5; i++) await fn()
      return performance.now() - start
    }
    const real = await time(() => verifyPassword(hash, 'falsch'))
    const dummy = await time(() => verifyDummy('falsch'))

    expect(await verifyDummy('x')).toBe(false)
    expect(dummy / real).toBeGreaterThan(0.5)
    expect(dummy / real).toBeLessThan(1.5)
  })
})

describe('generateTemporaryPassword', () => {
  it('ist mindestens 16 Zeichen lang, ohne verwechselbare Zeichen und zufällig', () => {
    const passwords = Array.from({ length: 50 }, generateTemporaryPassword)
    for (const password of passwords) {
      expect(password.length).toBeGreaterThanOrEqual(16)
      expect(password).not.toMatch(/[0O1lI]/)
    }
    expect(new Set(passwords).size).toBe(passwords.length)
  })
})

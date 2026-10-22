import { setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { createClient, loginAs, PASSWORD, randomIp, registerUser, rootDir, testServerEnv, uniqueEmail } from './helpers'

describe('Sicherheit', async () => {
  await setup({ rootDir, server: true, env: testServerEnv })

  describe('CSRF (AK-9.1)', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s ohne Token → 403 CSRF_INVALID, nichts ausgeführt', async (method) => {
      const client = await createClient()
      client.csrfToken = ''
      const response = await client.request(method, '/api/auth/register', { email: uniqueEmail(), displayName: 'X', password: PASSWORD })
      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('CSRF_INVALID')
    })

    it('lehnt ein falsches Token ab', async () => {
      const client = await createClient()
      client.csrfToken = 'AAAAAAAAAAAAAAAAAAAAAA==:falsch'
      const response = await client.post('/api/auth/login', { email: uniqueEmail(), password: PASSWORD })
      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('CSRF_INVALID')
    })

    it('lehnt das Token eines anderen Browsers ab (an dessen Cookie gebunden)', async () => {
      const a = await createClient()
      const b = await createClient()
      b.csrfToken = a.csrfToken
      expect((await b.post('/api/auth/login', { email: uniqueEmail(), password: PASSWORD })).status).toBe(403)
    })
  })

  describe('Security-Header (AK-10.1)', () => {
    it('setzt CSP mit Nonce und die übrigen Header', async () => {
      const client = await createClient()
      const { headers } = await client.request('GET', '/', undefined, { accept: 'text/html' })
      const csp = headers.get('content-security-policy') ?? ''
      expect(csp).toMatch(/script-src [^;]*'nonce-[^']+'/)
      expect(csp).not.toContain('unsafe-eval')
      expect(csp).toContain("frame-ancestors 'none'")
      expect(headers.get('x-content-type-options')).toBe('nosniff')
      expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
      expect(headers.get('x-frame-options')).toBe('DENY')
    })
  })

  describe('Rate-Limiting', () => {
    it('sperrt nach 5 Fehlversuchen pro E-Mail, auch mit richtigem Passwort (AK-8.1)', async () => {
      const { email } = await registerUser()
      for (let i = 0; i < 5; i++) {
        expect((await loginAs(email, 'falsch-falsch')).response.status).toBe(401)
      }
      const blocked = (await loginAs(email, PASSWORD)).response
      expect(blocked.status).toBe(429)
      expect(blocked.body.error.code).toBe('RATE_LIMITED')
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    })

    it('setzt den Zähler nach erfolgreichem Login zurück (AK-8.3)', async () => {
      const { email } = await registerUser()
      for (let i = 0; i < 4; i++) await loginAs(email, 'falsch-falsch')
      expect((await loginAs(email)).response.status).toBe(200)
      for (let i = 0; i < 5; i++) {
        expect((await loginAs(email, 'falsch-falsch')).response.status).toBe(401)
      }
    })

    it('sperrt nach 10 Login-Versuchen pro IP (AK-8.1)', async () => {
      const ip = randomIp()
      const statuses = []
      for (let i = 0; i < 11; i++) {
        const client = await createClient({ ip })
        statuses.push((await client.post('/api/auth/login', { email: uniqueEmail(), password: 'falsch-falsch' })).status)
      }
      expect(statuses.slice(0, 10).every(status => status === 401)).toBe(true)
      expect(statuses[10]).toBe(429)
    })

    it('sperrt nach 5 Registrierungen pro IP und Stunde (AK-8.2)', async () => {
      const ip = randomIp()
      const statuses = []
      for (let i = 0; i < 6; i++) {
        const client = await createClient({ ip })
        statuses.push((await client.post('/api/auth/register', { email: uniqueEmail(), displayName: 'Viel', password: PASSWORD })).status)
      }
      expect(statuses).toEqual([201, 201, 201, 201, 201, 429])
    })
  })
})

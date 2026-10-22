import { createHash } from 'node:crypto'
import { setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { createClient, db, findCookie, loginAs, PASSWORD, registerUser, rootDir, SESSION_COOKIE, testServerEnv, uniqueEmail } from './helpers'

describe('Auth-API', async () => {
  await setup({ rootDir, server: true, env: testServerEnv })

  describe('Registrierung', () => {
    it('legt ein Konto mit Rolle user an und meldet sofort an (AK-1.1)', async () => {
      const { client, user } = await registerUser({ displayName: '  Anna  ' })
      expect(user).toMatchObject({ role: 'user', displayName: 'Anna', mustChangePassword: false })
      expect((await client.get('/api/auth/me')).body.user).toEqual(user)
    })

    it('speichert die E-Mail kleingeschrieben und nur einen Argon2id-Hash (AK-1.4)', async () => {
      const email = uniqueEmail('Gross')
      await registerUser({ email: email.toUpperCase() })
      const [row] = await db('SELECT email, "passwordHash" FROM "User" WHERE email = $1', [email.toLowerCase()])
      expect(row.passwordHash).toMatch(/^\$argon2id\$/)
      expect(row.passwordHash).not.toContain(PASSWORD)
    })

    it('lehnt eine vergebene E-Mail allgemein ab, ohne Session (AK-1.2)', async () => {
      const { email } = await registerUser()
      const client = await createClient()
      const response = await client.post('/api/auth/register', { email: email.toUpperCase(), displayName: 'Zweiter', password: PASSWORD })
      expect(response.status).toBe(409)
      expect(response.body.error.code).toBe('REGISTRATION_FAILED')
      expect(findCookie(response.setCookies, SESSION_COOKIE)).toBeUndefined()
    })

    it('meldet ungültige Felder als VALIDATION_ERROR (AK-1.5)', async () => {
      const client = await createClient()
      const response = await client.post('/api/auth/register', { email: 'kein-mail', displayName: 'A', password: 'kurz' })
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
      expect(Object.keys(response.body.error.details).sort()).toEqual(['displayName', 'email', 'password'])
    })
  })

  describe('Anmeldung und Session', () => {
    it('setzt ein Sitzungscookie mit HttpOnly, Secure, SameSite=Lax, Path=/ (AK-2.1, AK-2.3)', async () => {
      const { email } = await registerUser()
      const { response } = await loginAs(email)
      expect(response.status).toBe(200)
      const cookie = findCookie(response.setCookies, SESSION_COOKIE)!
      expect(cookie).toMatch(/HttpOnly/i)
      expect(cookie).toMatch(/; Secure/i)
      expect(cookie).toMatch(/SameSite=Lax/i)
      expect(cookie).toMatch(/Path=\//)
      expect(cookie).not.toMatch(/Max-Age|Expires/i)
    })

    it('setzt mit „Angemeldet bleiben“ Max-Age von 30 Tagen (AK-2.4)', async () => {
      const { email } = await registerUser()
      const { response } = await loginAs(email, PASSWORD, true)
      expect(findCookie(response.setCookies, SESSION_COOKIE)).toMatch(/Max-Age=2592000/)
    })

    it('antwortet bei falschem Passwort und unbekannter E-Mail identisch (AK-2.2)', async () => {
      const { email } = await registerUser()
      const wrong = (await loginAs(email, 'falsch-falsch')).response
      const unknown = (await loginAs(uniqueEmail('gibtsnicht'), 'falsch-falsch')).response
      expect(wrong.status).toBe(401)
      expect(unknown.status).toBe(401)
      expect({ ...wrong.body.error, requestId: 0 }).toEqual({ ...unknown.body.error, requestId: 0 })
      expect(findCookie(wrong.setCookies, SESSION_COOKIE)).toBeUndefined()
    })

    it('speichert nur den SHA-256-Hash des Tokens und vergibt je Login eine neue ID (AK-2.6)', async () => {
      const { email, user } = await registerUser()
      const first = (await loginAs(email)).client.cookies.get(SESSION_COOKIE)!
      const second = (await loginAs(email)).client.cookies.get(SESSION_COOKIE)!
      expect(first).not.toBe(second)
      expect(Buffer.from(first, 'base64url')).toHaveLength(32)
      const ids = (await db('SELECT id FROM "Session" WHERE "userId" = $1', [user.id])).map(r => r.id)
      expect(ids).toContain(createHash('sha256').update(first).digest('hex'))
      expect(ids).not.toContain(first)
    })

    it('Logout macht das Cookie wertlos, auch eine Kopie davon (AK-2.5)', async () => {
      const { client } = await registerUser()
      const copy = await createClient()
      copy.cookies.set(SESSION_COOKIE, client.cookies.get(SESSION_COOKIE)!)
      expect((await copy.get('/api/auth/me')).body.user).not.toBeNull()

      expect((await client.post('/api/auth/logout')).status).toBe(204)
      expect((await client.get('/api/auth/me')).body.user).toBeNull()
      expect((await copy.get('/api/auth/me')).body.user).toBeNull()
    })

    it('beendet abgelaufene Sessions (AK-2.3)', async () => {
      const { client, user } = await registerUser()
      await db('UPDATE "Session" SET "expiresAt" = now() - interval \'1 second\' WHERE "userId" = $1', [user.id])
      expect((await client.get('/api/auth/me')).body.user).toBeNull()
      expect(await db('SELECT 1 FROM "Session" WHERE "userId" = $1', [user.id])).toHaveLength(0)
    })

    it('verlängert die Session gleitend (AK-2.3, AK-2.4)', async () => {
      const { client, user } = await registerUser()
      await db('UPDATE "Session" SET "lastSeenAt" = now() - interval \'2 minutes\', "expiresAt" = now() + interval \'1 hour\' WHERE "userId" = $1', [user.id])
      await client.get('/api/auth/me')
      const [{ hours }] = await db('SELECT extract(epoch FROM "expiresAt" - now()) / 3600 AS hours FROM "Session" WHERE "userId" = $1', [user.id])
      expect(Number(hours)).toBeGreaterThan(11.9)
    })

    it('beendet Sessions gesperrter Nutzer und lehnt deren Login ab (AK-2.7)', async () => {
      const { client, email, user } = await registerUser()
      await db('UPDATE "User" SET "blockedAt" = now() WHERE id = $1', [user.id])
      expect((await client.get('/api/auth/me')).body.user).toBeNull()
      const { response } = await loginAs(email)
      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('ACCOUNT_BLOCKED')
    })
  })

  describe('Passwort ändern', () => {
    it('ändert das Passwort und beendet nur die anderen Sessions (AK-3.1)', async () => {
      const { client, email } = await registerUser()
      const other = (await loginAs(email)).client

      const response = await client.post('/api/auth/password', { currentPassword: PASSWORD, newPassword: 'ganz-neues-passwort' })
      expect(response.status).toBe(204)
      expect((await client.get('/api/auth/me')).body.user).not.toBeNull()
      expect((await other.get('/api/auth/me')).body.user).toBeNull()
      expect((await loginAs(email, 'ganz-neues-passwort')).response.status).toBe(200)
      expect((await loginAs(email, PASSWORD)).response.status).toBe(401)
    })

    it('lässt bei falschem aktuellem Passwort alles unverändert (AK-3.2)', async () => {
      const { client, email } = await registerUser()
      const response = await client.post('/api/auth/password', { currentPassword: 'falsch-falsch', newPassword: 'ganz-neues-passwort' })
      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS')
      expect((await loginAs(email, PASSWORD)).response.status).toBe(200)
    })

    it('verlangt eine Anmeldung', async () => {
      const client = await createClient()
      const response = await client.post('/api/auth/password', { currentPassword: 'x', newPassword: 'ganz-neues-passwort' })
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('UNAUTHENTICATED')
    })
  })

  describe('Audit', () => {
    it('protokolliert Registrierung, Login, Fehlversuch, Passwortwechsel und Logout ohne Geheimnisse (AK-11.1, AK-11.2)', async () => {
      const { client, email, user } = await registerUser()
      await loginAs(email, 'falsch-falsch')
      await loginAs(email)
      await client.post('/api/auth/password', { currentPassword: PASSWORD, newPassword: 'ganz-neues-passwort' })
      await client.post('/api/auth/logout')

      const rows = await db('SELECT event, ip, "requestId", details FROM "AuditLog" WHERE "targetId" = $1 ORDER BY id', [user.id])
      expect(rows.map(r => r.event)).toEqual(['USER_REGISTERED', 'LOGIN_FAILED', 'LOGIN_SUCCEEDED', 'PASSWORD_CHANGED', 'LOGOUT'])
      expect(rows.every(r => r.ip && r.requestId)).toBe(true)
      const serialized = JSON.stringify(rows)
      expect(serialized).not.toContain(PASSWORD)
      expect(serialized).not.toContain('ganz-neues-passwort')
      expect(serialized).not.toContain(client.cookies.get(SESSION_COOKIE) ?? '---')
    })
  })
})

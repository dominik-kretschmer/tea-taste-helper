import { randomUUID } from 'node:crypto'
import { setup } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, db, loginAs, PASSWORD, registerUser, rootDir, testServerEnv, type TestClient, uniqueEmail } from './helpers'

const ADMIN_EMAIL = 'admin@test.local'

describe('Admin-API', async () => {
  await setup({ rootDir, server: true, env: { ...testServerEnv, ADMIN_EMAIL } })

  let admin: TestClient
  let adminId: string

  beforeAll(async () => {
    const registered = await registerUser({ email: ADMIN_EMAIL, displayName: 'Chefin' })
    admin = registered.client
    adminId = registered.user.id
  })

  const createUserWithRole = async (role: Role) => {
    const registered = await registerUser()
    if (role !== 'user') {
      expect((await admin.patch(`/api/admin/users/${registered.user.id}/role`, { role })).status).toBe(200)
    }
    return registered
  }

  describe('Rechteprüfung jeder Admin-Route (AK-5.4, AK-7.1, AK-7.3)', () => {
    const someId = randomUUID()
    const routes: [string, string, unknown?][] = [
      ['GET', '/api/admin/users'],
      ['PATCH', `/api/admin/users/${someId}/role`, { role: 'user' }],
      ['POST', `/api/admin/users/${someId}/password-reset`, {}],
      ['GET', '/api/admin/audit'],
    ]

    it.each(routes)('%s %s: Gast 401, Nutzer 403, Moderator 403', async (method, path, body) => {
      const guest = await createClient()
      const user = (await createUserWithRole('user')).client
      const moderator = (await createUserWithRole('moderator')).client

      const guestResponse = await guest.request(method, path, body)
      expect(guestResponse.status).toBe(401)
      expect(guestResponse.body.error.code).toBe('UNAUTHENTICATED')
      for (const client of [user, moderator]) {
        const response = await client.request(method, path, body)
        expect(response.status).toBe(403)
        expect(response.body.error.code).toBe('FORBIDDEN')
      }
    })

    it.each(routes)('%s %s: Admin wird durchgelassen', async (method, path, body) => {
      const response = await admin.request(method, path, body)
      // Unbekannte ID → 404 nach bestandener Rechteprüfung
      expect([200, 404]).toContain(response.status)
    })
  })

  describe('Nutzerliste (AK-5.1)', () => {
    it('liefert Nutzer mit allen Feldern, durchsuchbar nach Name und E-Mail', async () => {
      const marker = `such${randomUUID().slice(0, 6)}`
      const { user } = await registerUser({ displayName: `Anna ${marker}` })
      await registerUser({ email: uniqueEmail(marker) })

      const byName = await admin.get(`/api/admin/users?q=${marker.toUpperCase()}`)
      expect(byName.status).toBe(200)
      expect(byName.body.total).toBe(2)
      const entry = byName.body.items.find((item: AdminUser) => item.id === user.id)
      expect(Object.keys(entry).sort()).toEqual(['createdAt', 'displayName', 'email', 'id', 'lastLoginAt', 'mustChangePassword', 'role'])
      expect(JSON.stringify(byName.body)).not.toMatch(/passwordHash|argon2/)
    })

    it('teilt in Seiten zu 25 Einträgen', async () => {
      const marker = `seite${randomUUID().slice(0, 6)}`
      await db(
        `INSERT INTO "User" (id, email, "displayName", "passwordHash")
         SELECT gen_random_uuid(), $1 || i || '@test.local', 'Seite', 'x' FROM generate_series(1, 30) AS i`,
        [marker],
      )
      const first = await admin.get(`/api/admin/users?q=${marker}`)
      const second = await admin.get(`/api/admin/users?q=${marker}&page=2`)
      expect(first.body).toMatchObject({ total: 30, page: 1, pageSize: 25 })
      expect(first.body.items).toHaveLength(25)
      expect(second.body.items).toHaveLength(5)
    })
  })

  describe('Rollen ändern (AK-5.2, AK-5.3)', () => {
    it('wirkt ab der nächsten Anfrage des Nutzers und wird auditiert', async () => {
      const { client, user } = await createUserWithRole('user')
      const response = await admin.patch(`/api/admin/users/${user.id}/role`, { role: 'moderator' })
      expect(response.status).toBe(200)
      expect(response.body.user.role).toBe('moderator')
      expect((await client.get('/api/auth/me')).body.user.role).toBe('moderator')

      const [entry] = await db('SELECT "actorId", details FROM "AuditLog" WHERE "targetId" = $1 AND event = \'ROLE_CHANGED\'', [user.id])
      expect(entry).toEqual({ actorId: adminId, details: { from: 'user', to: 'moderator' } })
    })

    it('verbietet das Ändern der eigenen Rolle', async () => {
      const response = await admin.patch(`/api/admin/users/${adminId}/role`, { role: 'user' })
      expect(response.status).toBe(409)
      expect(response.body.error.code).toBe('SELF_ROLE_CHANGE')
    })

    it('lässt einen Admin einen anderen Admin herabstufen', async () => {
      const { user } = await createUserWithRole('admin')
      expect((await admin.patch(`/api/admin/users/${user.id}/role`, { role: 'user' })).body.user.role).toBe('user')
    })

    it('lehnt unbekannte Rollen und IDs ab', async () => {
      const { user } = await registerUser()
      expect((await admin.patch(`/api/admin/users/${user.id}/role`, { role: 'superuser' })).status).toBe(400)
      expect((await admin.patch(`/api/admin/users/${randomUUID()}/role`, { role: 'user' })).status).toBe(404)
      expect((await admin.patch('/api/admin/users/keine-uuid/role', { role: 'user' })).status).toBe(404)
    })
  })

  describe('Passwort-Reset durch Admin (AK-6.1–6.3)', () => {
    it('erzeugt ein Einmal-Passwort, beendet alle Sessions und erzwingt den Wechsel', async () => {
      const { client, email, user } = await registerUser()
      const response = await admin.post(`/api/admin/users/${user.id}/password-reset`)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      const temporary: string = response.body.temporaryPassword
      expect(temporary.length).toBeGreaterThanOrEqual(16)

      // Alle Sessions beendet, altes Passwort ungültig
      expect((await client.get('/api/auth/me')).body.user).toBeNull()
      expect((await loginAs(email, PASSWORD)).response.status).toBe(401)

      // Mit Einmal-Passwort angemeldet: nur Passwortwechsel, me, logout und health erlaubt
      const { client: temp, response: login } = await loginAs(email, temporary)
      expect(login.body.user.mustChangePassword).toBe(true)
      const blocked = await temp.get('/api/admin/users')
      expect(blocked.status).toBe(403)
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED')
      expect((await temp.get('/api/auth/me')).status).toBe(200)
      expect((await temp.get('/api/health')).status).not.toBe(403)

      expect((await temp.post('/api/auth/password', { currentPassword: temporary, newPassword: 'mein-neues-passwort' })).status).toBe(204)
      expect((await temp.get('/api/auth/me')).body.user.mustChangePassword).toBe(false)
      expect((await temp.get('/api/admin/users')).body.error.code).toBe('FORBIDDEN')

      // Das Einmal-Passwort steht nirgends im Audit-Log
      const audit = await db('SELECT event, details FROM "AuditLog" WHERE "targetId" = $1', [user.id])
      expect(audit.map(row => row.event)).toContain('PASSWORD_RESET_BY_ADMIN')
      expect(JSON.stringify(audit)).not.toContain(temporary)
    })
  })

  describe('Audit-Log (AK-11.1, AK-11.3)', () => {
    it('liefert Einträge neueste zuerst mit Namen von Akteur und Ziel', async () => {
      const { user } = await createUserWithRole('moderator')
      const response = await admin.get(`/api/admin/audit?userId=${user.id}`)
      expect(response.status).toBe(200)
      const events = response.body.items.map((item: AuditEntry) => item.event)
      expect(events).toEqual(['ROLE_CHANGED', 'USER_REGISTERED'])
      expect(response.body.items[0]).toMatchObject({
        actor: { id: adminId, displayName: 'Chefin' },
        target: { id: user.id, displayName: 'Testnutzer' },
        details: { from: 'user', to: 'moderator' },
      })
      expect(response.body.items[0].ip).toBeTruthy()
      expect(response.body.items[0].requestId).toBeTruthy()
    })

    it('filtert nach Ereignistyp und teilt in Seiten zu 50', async () => {
      const response = await admin.get('/api/admin/audit?event=ROLE_CHANGED')
      expect(response.body.pageSize).toBe(50)
      expect(response.body.items.every((item: AuditEntry) => item.event === 'ROLE_CHANGED')).toBe(true)
      expect((await admin.get('/api/admin/audit?event=HACKED')).status).toBe(400)
    })

    it('bietet keine Route zum Ändern oder Löschen', async () => {
      for (const method of ['PATCH', 'DELETE', 'PUT']) {
        expect((await admin.request(method, '/api/admin/audit', {})).status).toBe(404)
      }
    })
  })
})

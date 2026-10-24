import { setup } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'
import { PASSWORD, createClient, db, loginAs, registerUser, rootDir, setRole, testServerEnv, type TestClient } from './helpers'

const ADMIN_EMAIL = 'sperr-admin@test.local'

describe('Sperren', async () => {
  await setup({ rootDir, server: true, env: { ...testServerEnv, ADMIN_EMAIL } })

  let mod: TestClient
  let modId: string
  let admin: TestClient
  let adminId: string

  beforeAll(async () => {
    const [m, a] = await Promise.all([registerUser({ displayName: 'Moni' }), registerUser({ email: ADMIN_EMAIL, displayName: 'Chefin' })])
    mod = m.client
    modId = m.user.id
    await setRole(modId, 'moderator')
    admin = a.client
    adminId = a.user.id
  })

  const block = (client: TestClient, userId: string, duration = '7d', reason = 'Vandalismus') =>
    client.post(`/api/admin/users/${userId}/block`, { duration, reason })
  const unblock = (client: TestClient, userId: string) => client.request('DELETE', `/api/admin/users/${userId}/block`)

  it('beendet alle Sessions und lehnt die Anmeldung ab – mit Frist, ohne Grund (AK-6.1, AK-6.2)', async () => {
    const { client, email, user } = await registerUser({ displayName: 'Störer' })
    const second = (await loginAs(email)).client
    expect((await client.get('/api/auth/me')).body.user).toBeTruthy()

    const response = await block(mod, user.id, '7d')
    expect(response.status, response.text).toBe(200)
    expect(response.body.user).toMatchObject({ id: user.id, blocked: true, blockReason: 'Vandalismus' })
    expect(response.body.user).not.toHaveProperty('email')
    const until = new Date(response.body.user.blockedUntil).getTime()
    expect(Math.abs(until - (Date.now() + 7 * 24 * 3600_000))).toBeLessThan(60_000)

    for (const session of [client, second]) expect((await session.get('/api/auth/me')).body.user).toBeNull()
    const [{ count }] = await db(`SELECT count(*)::int AS count FROM "Session" WHERE "userId" = $1`, [user.id])
    expect(count).toBe(0)

    const login = await loginAs(email)
    expect(login.response.status).toBe(403)
    expect(login.response.body.error).toMatchObject({ code: 'ACCOUNT_BLOCKED', details: { until: response.body.user.blockedUntil } })
    expect(login.response.text).not.toContain('Vandalismus')

    // Falsches Passwort verrät die Sperre nicht
    const wrong = await loginAs(email, 'falsches-passwort-1')
    expect(wrong.response.status).toBe(401)
    expect(wrong.response.body.error.code).toBe('INVALID_CREDENTIALS')

    const [entry] = await db(`SELECT "actorId", details FROM "AuditLog" WHERE event = 'USER_BLOCKED' AND "targetId" = $1`, [user.id])
    expect(entry).toMatchObject({ actorId: modId, details: { duration: '7d', until: response.body.user.blockedUntil, reason: 'Vandalismus' } })
  })

  it('sperrt unbefristet (AK-6.1, AK-6.2)', async () => {
    const { email, user } = await registerUser()
    expect((await block(mod, user.id, 'permanent')).body.user).toMatchObject({ blocked: true, blockedUntil: null })
    const login = await loginAs(email)
    expect(login.response.status).toBe(403)
    expect(login.response.body.error.details).toEqual({ until: null })
  })

  it('lässt befristete Sperren ablaufen (AK-6.3)', async () => {
    const { email, user } = await registerUser()
    await block(mod, user.id, '24h')
    await db(`UPDATE "User" SET "blockedUntil" = now() - interval '1 minute' WHERE id = $1`, [user.id])
    const login = await loginAs(email)
    expect(login.response.status, login.response.text).toBe(200)
    expect((await login.client.get('/api/auth/me')).body.user.id).toBe(user.id)
  })

  it('entsperrt sofort und ersetzt Fristen beim erneuten Sperren (AK-6.4, AK-6.8)', async () => {
    const { email, user } = await registerUser()
    await block(mod, user.id, '30d')
    const shorter = await block(mod, user.id, '24h', 'verkürzt')
    expect(shorter.body.user.blockReason).toBe('verkürzt')
    expect(new Date(shorter.body.user.blockedUntil).getTime()).toBeLessThan(Date.now() + 25 * 3600_000)

    const response = await unblock(mod, user.id)
    expect(response.status, response.text).toBe(200)
    expect(response.body.user).toMatchObject({ blocked: false, blockedAt: null, blockedUntil: null, blockReason: null })
    expect((await loginAs(email, PASSWORD)).response.status).toBe(200)
    expect((await db(`SELECT 1 FROM "AuditLog" WHERE event = 'USER_UNBLOCKED' AND "targetId" = $1`, [user.id]))).toHaveLength(1)
  })

  it('setzt die Rollenregeln durch (AK-6.5)', async () => {
    const [{ user: otherMod }, { client: plain, user: plainUser }] = await Promise.all([registerUser(), registerUser()])
    await setRole(otherMod.id, 'moderator')

    expect((await block(mod, otherMod.id)).status).toBe(403)
    expect((await block(mod, adminId)).status).toBe(403)
    expect((await block(mod, modId)).status).toBe(403)
    expect((await block(admin, adminId)).status).toBe(403)
    expect((await unblock(mod, otherMod.id)).status).toBe(403)

    expect((await block(admin, otherMod.id)).status).toBe(200)
    expect((await block(plain, plainUser.id)).status).toBe(403)
    expect((await block(mod, '00000000-0000-7000-8000-000000000000')).status).toBe(404)
    expect((await block(mod, plainUser.id, '1y')).status).toBe(400)
    expect((await block(mod, plainUser.id, '7d', ' ')).status).toBe(400)
  })

  it('entsperrt einen inzwischen beförderten Admin (Chore 13 AK-1.1, AK-1.2, AK-1.4, AK-2.2)', async () => {
    const { email, user } = await registerUser()
    await setRole(user.id, 'moderator')
    expect((await block(admin, user.id)).status).toBe(200)
    expect((await unblock(admin, user.id)).status).toBe(200)
    expect((await block(admin, user.id)).status).toBe(200)

    const promoted = await admin.patch(`/api/admin/users/${user.id}/role`, { role: 'admin' })
    expect(promoted.status, promoted.text).toBe(200)
    expect((await unblock(mod, user.id)).status).toBe(403)

    const response = await unblock(admin, user.id)
    expect(response.status, response.text).toBe(200)
    expect(response.body.user.blocked).toBe(false)
    const [row] = await db(`SELECT "blockedAt", "blockedUntil", "blockReason", "blockedById" FROM "User" WHERE id = $1`, [user.id])
    expect(row).toEqual({ blockedAt: null, blockedUntil: null, blockReason: null, blockedById: null })
    expect((await loginAs(email)).response.status).toBe(200)
    expect((await db(`SELECT 1 FROM "AuditLog" WHERE event = 'USER_UNBLOCKED' AND "targetId" = $1`, [user.id]))).toHaveLength(2)

    // Unbekannte UUID: 404 vor der Body-Prüfung
    expect((await block(mod, '00000000-0000-7000-8000-000000000000', '1y')).status).toBe(404)
  })

  it('lässt Beiträge gesperrter Nutzer sichtbar (AK-6.7)', async () => {
    const { client, user } = await registerUser()
    const created = await client.post('/api/ingredients', { locale: 'de', name: `Gesperrt ${user.id.slice(0, 8)}` })
    await block(mod, user.id)
    expect((await (await createClient()).get(`/api/ingredients/${created.body.ingredient.id}`)).status).toBe(200)
  })

  it('listet Nutzer für Moderatoren ohne E-Mail, für Admins mit (AK-6.6)', async () => {
    const tag = `Liste${Date.now().toString(36)}`
    const [{ client: active, user: activeUser }, { user: blockedUser }] = await Promise.all([
      registerUser({ displayName: `${tag} aktiv` }),
      registerUser({ displayName: `${tag} gesperrt` }),
    ])
    await active.post('/api/ingredients', { locale: 'de', name: `${tag} Zutat` })
    await block(mod, blockedUser.id)

    const forMod = await mod.get(`/api/admin/moderation/users?q=${tag}`)
    expect(forMod.status, forMod.text).toBe(200)
    expect(forMod.body.total).toBe(2)
    expect(JSON.stringify(forMod.body)).not.toContain('@')
    const byId = new Map((forMod.body.items as ModerationUser[]).map(item => [item.id, item]))
    expect(byId.get(activeUser.id)).toMatchObject({ blocked: false, changes30d: 1, role: 'user' })
    expect(byId.get(blockedUser.id)).toMatchObject({ blocked: true, blockReason: 'Vandalismus' })

    const onlyBlocked = await mod.get(`/api/admin/moderation/users?q=${tag}&blocked=1`)
    expect(onlyBlocked.body.items.map((item: ModerationUser) => item.id)).toEqual([blockedUser.id])

    const forAdmin = await admin.get(`/api/admin/moderation/users?q=${tag}`)
    expect(forAdmin.body.items.every((item: ModerationUser) => item.email?.endsWith('@test.local'))).toBe(true)

    // Suche nur über den Anzeigenamen, nicht über die E-Mail
    expect((await mod.get('/api/admin/moderation/users?q=test.local')).body.total).toBe(0)
  })

  it('schützt die Routen (AK-0.2)', async () => {
    const guest = await createClient()
    const { client: plain, user } = await registerUser()
    for (const [method, path, body] of [
      ['GET', '/api/admin/moderation/users', undefined],
      ['POST', `/api/admin/users/${user.id}/block`, { duration: '7d', reason: 'x' }],
      ['DELETE', `/api/admin/users/${user.id}/block`, undefined],
    ] as const) {
      expect((await guest.request(method, path, body)).status, path).toBe(401)
      expect((await plain.request(method, path, body)).status, path).toBe(403)
    }
  })
})

import { randomUUID } from 'node:crypto'
import { setup } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, db, registerUser, rootDir, testServerEnv, type TestClient } from './helpers'

const ADMIN_EMAIL = 'tee-admin@test.local'
const marker = () => randomUUID().slice(0, 8)

/** Legt eine Zutat direkt in der DB an (schont das Rate-Limit der Testnutzer). */
async function ingredient(name: string, options: { caffeine?: 'yes' | 'no' | 'unknown', locale?: string, en?: string } = {}) {
  const [{ id }] = await db<{ id: string }>(
    `WITH i AS (INSERT INTO "Ingredient" (id, "sourceLocale") VALUES (gen_random_uuid(), $1::text) RETURNING id),
          v AS (INSERT INTO "IngredientVersion" (id, "ingredientId", version, "isCurrent", caffeine)
                SELECT gen_random_uuid(), id, 1, true, $3::"Caffeine" FROM i RETURNING id, "ingredientId")
     INSERT INTO "IngredientVersionTranslation" ("versionId", locale, name, "nameKey")
     SELECT id, $1::text, $2::text, lower($2::text) FROM v RETURNING (SELECT "ingredientId" FROM v) AS id`,
    [options.locale ?? 'de', name, options.caffeine ?? 'unknown'],
  )
  if (options.en) {
    await db(
      `INSERT INTO "IngredientVersionTranslation" ("versionId", locale, name, "nameKey")
       SELECT id, 'en', $2::text, lower($2::text) FROM "IngredientVersion" WHERE "ingredientId" = $1 AND "isCurrent"`,
      [id, options.en],
    )
  }
  return id
}

describe('Tee-API', async () => {
  await setup({ rootDir, server: true, env: { ...testServerEnv, ADMIN_EMAIL } })

  let anna: TestClient
  let annaId: string
  let ben: TestClient
  let admin: TestClient
  let greenTea: string
  let mint: string
  let lemongrass: string

  beforeAll(async () => {
    const [a, b, c] = await Promise.all([
      registerUser({ displayName: 'Anna' }),
      registerUser({ displayName: 'Ben' }),
      registerUser({ email: ADMIN_EMAIL, displayName: 'Chefin' }),
    ])
    anna = a.client
    annaId = a.user.id
    ben = b.client
    admin = c.client
    greenTea = await ingredient(`Grüntee ${marker()}`, { caffeine: 'yes', en: `Green tea ${marker()}` })
    mint = await ingredient(`Pfefferminze ${marker()}`, { caffeine: 'no' })
    lemongrass = await ingredient(`Zitronengras ${marker()}`)
  })

  /** Legt einen Tee als `client` an und liefert ihn. */
  const createAs = async (client: TestClient, body: Record<string, unknown>) => {
    const response = await client.post('/api/teas', { locale: 'de', kind: 'blended', ingredients: [{ ingredientId: mint }], ...body })
    expect(response.status, response.text).toBe(201)
    return response.body.tea as TeaDetail
  }

  // Wechselnde Autoren, damit die vielen Testtees nicht das Limit von 30 Änderungen auslösen
  let pool: { client: TestClient, uses: number } | undefined
  const create = async (body: Record<string, unknown>) => {
    if (!pool || pool.uses >= 25) pool = { client: (await registerUser()).client, uses: 0 }
    pool.uses++
    return createAs(pool.client, body)
  }

  describe('Anlegen (AK-2.1, AK-2.5, AK-2.6)', () => {
    it('Gast → 401', async () => {
      const guest = await createClient()
      const response = await guest.post('/api/teas', { locale: 'de', name: `Gast ${marker()}`, kind: 'blended', ingredients: [{ ingredientId: mint }] })
      expect(response.status).toBe(401)
    })

    it('legt privat (Standard) Version 1 mit Ersteller an und schreibt das Audit', async () => {
      const name = `Morgentee ${marker()}`
      const tea = await createAs(anna, {
        name,
        description: 'Frisch\nund grün',
        caffeine: 'unknown',
        brewTempC: 80,
        ingredients: [{ ingredientId: greenTea, percent: 70 }, { ingredientId: mint, percent: 20 }, { ingredientId: lemongrass }],
        note: 'erste Fassung',
      })
      expect(tea).toMatchObject({
        visibility: 'private',
        kind: 'blended',
        brand: null,
        version: 1,
        isOwner: true,
        owner: { displayName: 'Anna' },
        updatedBy: { displayName: 'Anna' },
        translations: { de: { name, description: 'Frisch\nund grün' } },
        ingredientsCaffeinated: true,
      })
      expect(tea.ingredients.map(item => [item.ingredientId, item.percent])).toEqual([[greenTea, 70], [mint, 20], [lemongrass, null]])
      expect(tea.ingredients[0]!.translations.en?.name).toMatch(/^Green tea/)
      expect(JSON.stringify(tea)).not.toContain('@')

      const [row] = await db(`SELECT "ownerId" FROM "Tea" WHERE id = $1`, [tea.id])
      expect(row.ownerId).toBe(annaId)
      const [entry] = await db(`SELECT "actorId", details FROM "AuditLog" WHERE event = 'TEA_CREATED' AND details->>'teaId' = $1`, [tea.id])
      expect(entry).toEqual({ actorId: annaId, details: { teaId: tea.id, version: 1, private: true } })
    })

    it('legt öffentlich an und behält die Marke nur bei „gekauft“', async () => {
      const bought = await create({ name: `Earl Grey ${marker()}`, visibility: 'public', kind: 'bought', brand: 'Teekanne' })
      expect(bought).toMatchObject({ visibility: 'public', kind: 'bought', brand: 'Teekanne' })
      const blended = await create({ name: `Mischung ${marker()}`, kind: 'blended', brand: 'Teekanne' })
      expect(blended.brand).toBeNull()
    })

    it('lehnt unbekannte Zutaten, doppelte Zutaten und zu hohe Anteile ab', async () => {
      const unknown = await anna.post('/api/teas', { locale: 'de', name: `X ${marker()}`, kind: 'blended', ingredients: [{ ingredientId: mint }, { ingredientId: randomUUID() }] })
      expect(unknown.status).toBe(400)
      expect(unknown.body.error).toMatchObject({ code: 'INGREDIENT_NOT_FOUND', details: { index: 1 } })

      const duplicate = await anna.post('/api/teas', { locale: 'de', name: `X ${marker()}`, kind: 'blended', ingredients: [{ ingredientId: mint }, { ingredientId: mint }] })
      expect(duplicate.status).toBe(400)
      expect(duplicate.body.error.details.ingredients).toBeDefined()

      const sum = await anna.post('/api/teas', { locale: 'de', name: `X ${marker()}`, kind: 'blended', ingredients: [{ ingredientId: mint, percent: 60 }, { ingredientId: greenTea, percent: 41 }] })
      expect(sum.status).toBe(400)

      const none = await anna.post('/api/teas', { locale: 'de', name: `X ${marker()}`, kind: 'blended', ingredients: [] })
      expect(none.status).toBe(400)
    })

    it('speichert Namen, die beim Normalisieren länger werden (00-chore/04)', async () => {
      const tea = await create({ name: 'İ'.repeat(80) })
      expect(tea.translations.de?.name).toBe('İ'.repeat(80))
    })

    it('gibt Nutzerinhalte unverändert als Text zurück (AK-10.2)', async () => {
      const tea = await create({ name: `<script>alert(1)</script> ${marker()}`, kind: 'bought', brand: '<b>Marke</b>' })
      const response = await anna.get(`/api/teas/${tea.id}`)
      expect(response.status).toBe(404) // privat und nicht Annas Tee
      const own = await createAs(anna, { name: `<b>fett</b> ${marker()}`, kind: 'bought', brand: '<i>Marke</i>' })
      expect((await anna.get(`/api/teas/${own.id}`)).body.tea).toMatchObject({ brand: '<i>Marke</i>', translations: { de: { name: expect.stringMatching(/^<b>fett<\/b>/) } } })
    })
  })

  describe('Duplikate (AK-2.4)', () => {
    it('lehnt gleichen Namen mit gleicher Marke bei öffentlichen Tees ab und nennt den bestehenden', async () => {
      const m = marker()
      const existing = await create({ name: `Earl Grey ${m}`, visibility: 'public', kind: 'bought', brand: 'Teekanne' })
      const response = await ben.post('/api/teas', {
        locale: 'de', name: `  EARL   grey ${m.toUpperCase()} `, visibility: 'public', kind: 'bought', brand: 'teekanne', ingredients: [{ ingredientId: greenTea }],
      })
      expect(response.status).toBe(409)
      expect(response.body.error).toMatchObject({ code: 'DUPLICATE_NAME', details: { teaId: existing.id, locale: 'de' } })
    })

    it('erlaubt gleichen Namen mit anderer oder ohne Marke und bei privaten Tees', async () => {
      const name = `Earl Grey ${marker()}`
      await create({ name, visibility: 'public', kind: 'bought', brand: 'Teekanne' })
      await create({ name, visibility: 'public', kind: 'bought', brand: 'Meßmer' })
      await create({ name, visibility: 'public', kind: 'blended' })
      await create({ name, kind: 'bought', brand: 'Teekanne' })
    })

    it('lässt von 5 gleichzeitigen öffentlichen Anlagen genau eine durch', async () => {
      const { client } = await registerUser()
      const name = `Gleichzeitig ${marker()}`
      const responses = await Promise.all(Array.from({ length: 5 }, () =>
        client.post('/api/teas', { locale: 'de', name, visibility: 'public', kind: 'blended', ingredients: [{ ingredientId: mint }] })))
      expect(responses.map(r => r.status).sort()).toEqual([201, 409, 409, 409, 409])
    })
  })

  describe('Detail und Sichtbarkeit (AK-1.5–1.7)', () => {
    it('zeigt den Koffein-Hinweis nur, wenn eine Zutat koffeinhaltig ist', async () => {
      const withCaffeine = await create({ name: `Grün ${marker()}`, visibility: 'public', ingredients: [{ ingredientId: greenTea }] })
      const without = await create({ name: `Minze ${marker()}`, visibility: 'public', ingredients: [{ ingredientId: mint }] })
      expect(withCaffeine.ingredientsCaffeinated).toBe(true)
      expect(without.ingredientsCaffeinated).toBe(false)
    })

    it('öffentliche Tees sieht jeder, fremde private niemand – auch kein Admin', async () => {
      const guest = await createClient()
      const open = await createAs(anna, { name: `Offen ${marker()}`, visibility: 'public' })
      const secret = await createAs(anna, { name: `Geheim ${marker()}` })

      const publicView = await guest.get(`/api/teas/${open.id}`)
      expect(publicView.status).toBe(200)
      expect(publicView.body.tea.isOwner).toBe(false)

      for (const client of [guest, ben, admin]) {
        const response = await client.get(`/api/teas/${secret.id}`)
        expect(response.status).toBe(404)
        expect(response.body.error.code).toBe('NOT_FOUND')
      }
      expect((await anna.get(`/api/teas/${secret.id}`)).status).toBe(200)
    })

    it('antwortet mit 404 für unbekannte und ungültige IDs', async () => {
      for (const id of [randomUUID(), 'keine-uuid']) {
        expect((await anna.get(`/api/teas/${id}`)).status).toBe(404)
      }
    })
  })

  describe('Ähnliche Tees (AK-2.3)', () => {
    it('findet Tippfehler, aber nur öffentliche Tees', async () => {
      const m = marker()
      const open = await create({ name: `Pfefferminztee ${m}`, visibility: 'public' })
      const secret = await create({ name: `Pfefferminztee geheim ${m}` })
      const response = await anna.get(`/api/teas/similar?locale=de&name=${encodeURIComponent(`Pfeferminztee ${m}`)}`)
      expect(response.status).toBe(200)
      const ids = response.body.items.map((item: { id: string }) => item.id)
      expect(ids).toContain(open.id)
      expect(ids).not.toContain(secret.id)
      expect(ids.length).toBeLessThanOrEqual(5)
    })
  })
})

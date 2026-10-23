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

  describe('Liste, Suche, Filter (AK-1.1–AK-1.4, AK-7.1)', () => {
    const list = (client: TestClient, query: string) => client.get<Page<TeaListItem>>(`/api/teas?${query}`)

    it('zeigt nur öffentliche Tees – auch dem Ersteller –, sortiert mit Umlauten', async () => {
      const m = marker()
      for (const name of ['Zimt', 'Birne', 'Äpfel', 'apfel']) await create({ name: `${name} ${m}`, visibility: 'public' })
      const secret = await createAs(anna, { name: `Abend ${m}` })
      const response = await list(anna, `locale=de&q=${m}`)
      expect(response.status).toBe(200)
      expect(response.body.items.map(item => item.name)).toEqual(['apfel', 'Äpfel', 'Birne', 'Zimt'].map(name => `${name} ${m}`))
      expect(response.body.items.map(item => item.id)).not.toContain(secret.id)
      expect(response.body).toMatchObject({ total: 4, page: 1, pageSize: 24 })
      expect(response.body.items[0]).toEqual({
        id: expect.any(String), name: `apfel ${m}`, translated: true, brand: null, kind: 'blended', caffeine: 'unknown', visibility: 'public',
      })
    })

    it('teilt in Seiten zu 24', async () => {
      const m = marker()
      const { client } = await registerUser()
      for (let i = 0; i < 26; i++) {
        // direkt per SQL wäre schneller, prüft aber nicht den Weg über die API; 26 < 30 (Rate-Limit)
        await createAs(client, { name: `Seite ${m} ${String(i).padStart(2, '0')}`, visibility: 'public' })
      }
      const first = await list(anna, `locale=de&q=${m}`)
      const second = await list(anna, `locale=de&q=${m}&page=2`)
      expect(first.body.items).toHaveLength(24)
      expect(second.body.items).toHaveLength(2)
      expect(second.body.total).toBe(26)
    })

    it('sucht über Namen aller Sprachen und über die Marke', async () => {
      const m = marker()
      const tea = await create({ name: `Morgentau ${m}`, visibility: 'public', kind: 'bought', brand: `Teehaus ${m}` })
      await db(
        `INSERT INTO "TeaVersionTranslation" ("versionId", locale, name, "nameKey")
         SELECT id, 'en', $2::text, lower($2::text) FROM "TeaVersion" WHERE "teaId" = $1 AND "isCurrent"`,
        [tea.id, `Morning dew ${m}`],
      )
      for (const q of [`MORNING DEW ${m}`, `teehaus ${m}`]) {
        const response = await list(ben, `locale=de&q=${encodeURIComponent(q)}`)
        expect(response.body.items.map(item => item.id)).toEqual([tea.id])
      }
      const english = await list(ben, `locale=en&q=${m}`)
      expect(english.body.items[0]).toMatchObject({ name: `Morning dew ${m}`, translated: true, brand: `Teehaus ${m}` })
    })

    it('zeigt den Originalnamen mit Fallback-Flag, wenn die Übersetzung fehlt', async () => {
      const m = marker()
      await create({ name: `Abendruhe ${m}`, visibility: 'public' })
      const response = await list(ben, `locale=en&q=${m}`)
      expect(response.body.items[0]).toMatchObject({ name: `Abendruhe ${m}`, translated: false })
    })

    it('filtert nach Zutat, ohne fremde private Tees', async () => {
      const rooibos = await ingredient(`Rooibos ${marker()}`)
      const open = await create({ name: `Rot ${marker()}`, visibility: 'public', ingredients: [{ ingredientId: mint }, { ingredientId: rooibos }] })
      await create({ name: `Rot geheim ${marker()}`, ingredients: [{ ingredientId: rooibos }] })
      await create({ name: `Ohne ${marker()}`, visibility: 'public' })
      const response = await list(ben, `locale=de&ingredient=${rooibos}`)
      expect(response.body.items.map(item => item.id)).toEqual([open.id])
    })

    it('findet keine Namen und Zutaten alter Versionen', async () => {
      const m = marker()
      const old = await ingredient(`Altzutat ${m}`)
      const tea = await create({ name: `Altname ${m}`, visibility: 'public', ingredients: [{ ingredientId: old }] })
      await db(
        `WITH prev AS (UPDATE "TeaVersion" SET "isCurrent" = false WHERE "teaId" = $1 RETURNING "teaId", kind, visibility),
              v AS (INSERT INTO "TeaVersion" (id, "teaId", version, "isCurrent", kind, visibility)
                    SELECT gen_random_uuid(), "teaId", 2, true, kind, visibility FROM prev RETURNING id),
              x AS (INSERT INTO "TeaVersionTranslation" ("versionId", locale, name, "nameKey") SELECT id, 'de', $2::text, lower($2::text) FROM v)
         INSERT INTO "TeaVersionIngredient" ("versionId", position, "ingredientId") SELECT id, 0, $3::uuid FROM v`,
        [tea.id, `Neuname ${m}`, mint],
      )
      expect((await list(ben, `locale=de&q=${encodeURIComponent(`Altname ${m}`)}`)).body.total).toBe(0)
      expect((await list(ben, `locale=de&ingredient=${old}`)).body.total).toBe(0)
      expect((await list(ben, `locale=de&q=${encodeURIComponent(`Neuname ${m}`)}`)).body.items.map(item => item.id)).toEqual([tea.id])
    })

    it('„Meine“ zeigt eigene private und öffentliche Tees, Gäste bekommen 401', async () => {
      const { client } = await registerUser()
      const m = marker()
      const mine = [
        await createAs(client, { name: `Eigen privat ${m}` }),
        await createAs(client, { name: `Eigen öffentlich ${m}`, visibility: 'public' }),
      ]
      await create({ name: `Fremd ${m}`, visibility: 'public' })
      const response = await list(client, `locale=de&mine=1&q=${m}`)
      expect(response.body.items.map(item => [item.id, item.visibility]).sort()).toEqual(mine.map(tea => [tea.id, tea.visibility]).sort())
      expect((await list(await createClient(), 'locale=de&mine=1')).status).toBe(401)
    })

    it('verlangt eine gültige Sprache und Zutat-ID', async () => {
      expect((await list(ben, 'locale=fr')).status).toBe(400)
      expect((await list(ben, 'locale=de&ingredient=abc')).status).toBe(400)
    })
  })

  describe('Bearbeiten und Übersetzen (AK-3, AK-5)', () => {
    const patch = (client: TestClient, id: string, body: Record<string, unknown>) => client.patch(`/api/teas/${id}`, body)

    it('Dritte bearbeiten öffentliche Tees: neue Version, Ersteller bleibt, Audit', async () => {
      const tea = await createAs(anna, { name: `Kräuter ${marker()}`, visibility: 'public', ingredients: [{ ingredientId: mint, percent: 50 }] })
      const response = await patch(ben, tea.id, {
        version: 1,
        ingredients: [{ ingredientId: lemongrass, percent: 30 }, { ingredientId: mint, percent: 60 }],
        brewTempC: 95,
        note: 'Zitronengras ergänzt',
      })
      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        changed: true,
        tea: { version: 2, owner: { displayName: 'Anna' }, updatedBy: { displayName: 'Ben' }, isOwner: false, brewTempC: 95 },
      })
      expect(response.body.tea.ingredients.map((item: TeaIngredientView) => [item.ingredientId, item.percent])).toEqual([[lemongrass, 30], [mint, 60]])

      const versions = await db(`SELECT version, "isCurrent", note FROM "TeaVersion" WHERE "teaId" = $1 ORDER BY version`, [tea.id])
      expect(versions).toEqual([
        { version: 1, isCurrent: false, note: null },
        { version: 2, isCurrent: true, note: 'Zitronengras ergänzt' },
      ])
      const [{ ownerId }] = await db(`SELECT "ownerId" FROM "Tea" WHERE id = $1`, [tea.id])
      expect(ownerId).toBe(annaId)
      const [entry] = await db(`SELECT details FROM "AuditLog" WHERE event = 'TEA_UPDATED' AND details->>'teaId' = $1`, [tea.id])
      expect(entry.details).toEqual({ teaId: tea.id, version: 2, locales: [], private: false })
    })

    it('fremde private Tees → 404, eigene private lassen sich bearbeiten', async () => {
      const tea = await createAs(anna, { name: `Privat ${marker()}` })
      expect((await patch(ben, tea.id, { version: 1, brewTempC: 80 })).status).toBe(404)
      expect((await patch(admin, tea.id, { version: 1, brewTempC: 80 })).status).toBe(404)
      const own = await patch(anna, tea.id, { version: 1, brewTempC: 80 })
      expect(own.status).toBe(200)
      expect(own.body.tea.version).toBe(2)
    })

    it('legt ohne Änderung keine Version an', async () => {
      const name = `Gleich ${marker()}`
      const tea = await create({ name, visibility: 'public', kind: 'bought', brand: 'Marke' })
      const response = await patch(ben, tea.id, { version: 1, kind: 'bought', brand: ' Marke ', translations: { de: { name: ` ${name} ` } }, ingredients: [{ ingredientId: mint }] })
      expect(response.body).toMatchObject({ changed: false, tea: { version: 1 } })
    })

    it('lehnt eine veraltete Version mit EDIT_CONFLICT ab', async () => {
      const tea = await create({ name: `Konflikt ${marker()}`, visibility: 'public' })
      expect((await patch(anna, tea.id, { version: 1, caffeine: 'no' })).status).toBe(200)
      const response = await patch(ben, tea.id, { version: 1, caffeine: 'yes' })
      expect(response.status).toBe(409)
      expect(response.body.error).toMatchObject({ code: 'EDIT_CONFLICT', details: { currentVersion: 2 } })
    })

    it('lässt von gleichzeitigen Speicherungen derselben Version nur eine durch', async () => {
      const tea = await create({ name: `Gleichzeitig bearbeiten ${marker()}`, visibility: 'public' })
      const responses = await Promise.all([60, 70, 80].map(brewTempC => patch(ben, tea.id, { version: 1, brewTempC })))
      expect(responses.map(r => r.status).sort()).toEqual([200, 409, 409])
    })

    it('prüft Duplikate beim Umbenennen und beim Ändern der Marke', async () => {
      const m = marker()
      const taken = await create({ name: `Assam ${m}`, visibility: 'public', kind: 'bought', brand: 'Teekanne' })
      const other = await create({ name: `Assam ${m}`, visibility: 'public', kind: 'bought', brand: 'Meßmer' })
      const brand = await patch(ben, other.id, { version: 1, brand: 'TEEKANNE' })
      expect(brand.status).toBe(409)
      expect(brand.body.error.details).toEqual({ teaId: taken.id, locale: 'de' })

      const third = await create({ name: `Darjeeling ${m}`, visibility: 'public', kind: 'bought', brand: 'Teekanne' })
      const rename = await patch(ben, third.id, { version: 1, translations: { de: { name: `assam ${m}` } } })
      expect(rename.status).toBe(409)

      const ownSpelling = await patch(ben, taken.id, { version: 1, translations: { de: { name: `ASSAM ${m}` } } })
      expect(ownSpelling.status).toBe(200)
    })

    it('lehnt Sichtbarkeit im Bearbeiten ab (AK-4.3)', async () => {
      const tea = await create({ name: `Einbahn ${marker()}`, visibility: 'public' })
      const response = await patch(ben, tea.id, { version: 1, visibility: 'private' })
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('lehnt unbekannte Zutaten in der neuen Liste ab', async () => {
      const tea = await create({ name: `Zutaten ${marker()}`, visibility: 'public' })
      const response = await patch(ben, tea.id, { version: 1, ingredients: [{ ingredientId: randomUUID() }] })
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('INGREDIENT_NOT_FOUND')
    })

    it('fügt eine Übersetzung hinzu', async () => {
      const m = marker()
      const tea = await create({ name: `Waldbeere ${m}`, visibility: 'public' })
      const response = await patch(ben, tea.id, { version: 1, translations: { en: { name: `Forest berry ${m}`, description: 'Fruity' } } })
      expect(response.status).toBe(200)
      expect(response.body.tea.translations).toEqual({
        de: { name: `Waldbeere ${m}`, description: null },
        en: { name: `Forest berry ${m}`, description: 'Fruity' },
      })
      const list = await ben.get(`/api/teas?locale=en&q=${m}`)
      expect(list.body.items[0]).toMatchObject({ name: `Forest berry ${m}`, translated: true })
      const [entry] = await db(`SELECT details FROM "AuditLog" WHERE event = 'TEA_UPDATED' AND details->>'teaId' = $1`, [tea.id])
      expect(entry.details.locales).toEqual(['en'])
    })

    it('hält genau eine aktuelle Version je Tee', async () => {
      const tea = await create({ name: `Viele Versionen ${marker()}`, visibility: 'public' })
      for (let version = 1; version <= 3; version++) {
        expect((await patch(ben, tea.id, { version, brewTempC: 70 + version })).status).toBe(200)
      }
      expect(await db(`SELECT "teaId" FROM "TeaVersion" WHERE "isCurrent" GROUP BY "teaId" HAVING count(*) <> 1`)).toEqual([])
      await expect(db(`INSERT INTO "TeaVersion" (id, "teaId", version, "isCurrent", kind) VALUES (gen_random_uuid(), $1, 9, true, 'blended')`, [tea.id]))
        .rejects.toThrow(/TeaVersion_current_key/)
    })

    it('teilt das Rate-Limit mit Zutaten: 31. Änderung → 429 (AK-3.4)', async () => {
      const { client } = await registerUser()
      for (let i = 0; i < 15; i++) {
        expect((await client.post('/api/ingredients', { locale: 'de', name: `Limitzutat ${marker()}` })).status).toBe(201)
      }
      for (let i = 0; i < 15; i++) await createAs(client, { name: `Limittee ${marker()}` })
      const blocked = await client.post('/api/teas', { locale: 'de', name: `Zu viel ${marker()}`, kind: 'blended', ingredients: [{ ingredientId: mint }] })
      expect(blocked.status).toBe(429)
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    })
  })

  describe('Veröffentlichen und Löschen (AK-3.5, AK-3.6, AK-4)', () => {
    const publish = (client: TestClient, id: string, body: Record<string, unknown>) => client.post(`/api/teas/${id}/publish`, body)

    it('veröffentlicht einen privaten Tee als neue Version und nimmt ihn in den Katalog auf', async () => {
      const m = marker()
      const tea = await createAs(anna, { name: `Bald öffentlich ${m}` })
      const response = await publish(anna, tea.id, { version: 1 })
      expect(response.status).toBe(200)
      expect(response.body.tea).toMatchObject({ visibility: 'public', version: 2 })
      expect((await ben.get(`/api/teas?locale=de&q=${m}`)).body.items.map((item: TeaListItem) => item.id)).toEqual([tea.id])
      expect((await ben.get(`/api/teas/${tea.id}`)).status).toBe(200)
      const [entry] = await db(`SELECT "actorId", details FROM "AuditLog" WHERE event = 'TEA_PUBLISHED' AND details->>'teaId' = $1`, [tea.id])
      expect(entry).toEqual({ actorId: annaId, details: { teaId: tea.id, version: 2, private: false } })

      const again = await publish(anna, tea.id, { version: 2 })
      expect(again.status).toBe(400)
      expect(again.body.error.code).toBe('ALREADY_PUBLIC')
    })

    it('nur der Ersteller veröffentlicht; Konflikt bei veralteter Version', async () => {
      const tea = await createAs(anna, { name: `Nur Anna ${marker()}` })
      expect((await publish(ben, tea.id, { version: 1 })).status).toBe(404)
      expect((await publish(admin, tea.id, { version: 1 })).status).toBe(404)
      expect((await anna.patch(`/api/teas/${tea.id}`, { version: 1, brewTempC: 75 })).status).toBe(200)
      const stale = await publish(anna, tea.id, { version: 1 })
      expect(stale.status).toBe(409)
      expect(stale.body.error).toMatchObject({ code: 'EDIT_CONFLICT', details: { currentVersion: 2 } })
    })

    it('prüft beim Veröffentlichen die Duplikatregel', async () => {
      const name = `Doppelt ${marker()}`
      const existing = await create({ name, visibility: 'public' })
      const tea = await createAs(anna, { name })
      const response = await publish(anna, tea.id, { version: 1 })
      expect(response.status).toBe(409)
      expect(response.body.error.details).toEqual({ teaId: existing.id, locale: 'de' })
      expect((await anna.get(`/api/teas/${tea.id}`)).body.tea).toMatchObject({ visibility: 'private', version: 1 })
    })

    it('löscht eigene private Tees samt Versionen, aber keine öffentlichen oder fremden', async () => {
      const tea = await createAs(anna, { name: `Weg damit ${marker()}` })
      await anna.patch(`/api/teas/${tea.id}`, { version: 1, brewTempC: 80 })
      expect((await ben.request('DELETE', `/api/teas/${tea.id}`)).status).toBe(404)
      expect((await admin.request('DELETE', `/api/teas/${tea.id}`)).status).toBe(404)

      const deleted = await anna.request('DELETE', `/api/teas/${tea.id}`)
      expect(deleted.status).toBe(204)
      expect((await anna.get(`/api/teas/${tea.id}`)).status).toBe(404)
      expect(await db(`SELECT 1 FROM "TeaVersion" WHERE "teaId" = $1`, [tea.id])).toEqual([])
      const [entry] = await db(`SELECT details FROM "AuditLog" WHERE event = 'TEA_DELETED' AND details->>'teaId' = $1`, [tea.id])
      expect(entry.details).toEqual({ teaId: tea.id, private: true })

      const open = await createAs(anna, { name: `Bleibt ${marker()}`, visibility: 'public' })
      const blocked = await anna.request('DELETE', `/api/teas/${open.id}`)
      expect(blocked.status).toBe(409)
      expect(blocked.body.error.code).toBe('TEA_PUBLIC')
    })

    it('Gäste → 401', async () => {
      const guest = await createClient()
      const tea = await create({ name: `Gastschutz ${marker()}`, visibility: 'public' })
      expect((await publish(guest, tea.id, { version: 1 })).status).toBe(401)
      expect((await guest.request('DELETE', `/api/teas/${tea.id}`)).status).toBe(401)
    })
  })

  describe('Historie und Vergleich (AK-6)', () => {
    it('listet Versionen neueste zuerst und vergleicht inkl. Zutaten, Marke und Sichtbarkeit', async () => {
      const tea = await createAs(anna, { name: `Verlauf ${marker()}`, ingredients: [{ ingredientId: greenTea, percent: 60 }, { ingredientId: mint }] })
      await anna.patch(`/api/teas/${tea.id}`, {
        version: 1,
        kind: 'bought',
        brand: 'Teehaus',
        ingredients: [{ ingredientId: mint, percent: 20 }, { ingredientId: greenTea, percent: 70 }, { ingredientId: lemongrass }],
        note: 'umgebaut',
      })
      await anna.post(`/api/teas/${tea.id}/publish`, { version: 2 })
      await ben.patch(`/api/teas/${tea.id}`, { version: 3, ingredients: [{ ingredientId: mint, percent: 20 }, { ingredientId: greenTea, percent: 70 }] })

      const guest = await createClient()
      const revisions = await guest.get(`/api/teas/${tea.id}/revisions`)
      expect(revisions.status).toBe(200)
      expect(revisions.body.items.map(({ createdAt, ...rest }: RevisionEntry) => rest)).toEqual([
        { version: 4, isCurrent: true, author: { displayName: 'Ben' }, note: null },
        { version: 3, isCurrent: false, author: { displayName: 'Anna' }, note: null },
        { version: 2, isCurrent: false, author: { displayName: 'Anna' }, note: 'umgebaut' },
        { version: 1, isCurrent: false, author: { displayName: 'Anna' }, note: null },
      ])

      const compare = await guest.get(`/api/teas/${tea.id}/compare?from=1&to=4`)
      expect(compare.status).toBe(200)
      expect(compare.body.changes).toEqual([
        { field: 'kind', from: 'blended', to: 'bought' },
        { field: 'brand', from: null, to: 'Teehaus' },
        { field: 'visibility', from: 'private', to: 'public' },
        { field: 'ingredient', ingredientId: mint, from: { position: 1, percent: null }, to: { position: 0, percent: 20 } },
        { field: 'ingredient', ingredientId: greenTea, from: { position: 0, percent: 60 }, to: { position: 1, percent: 70 } },
      ])
      const removed = await guest.get(`/api/teas/${tea.id}/compare?from=3&to=4`)
      expect(removed.body.changes).toEqual([
        { field: 'ingredient', ingredientId: lemongrass, from: { position: 2, percent: null }, to: null },
      ])
      expect(Object.keys(removed.body.ingredients).sort()).toEqual([greenTea, lemongrass, mint].sort())
      expect(removed.body.ingredients[lemongrass].translations.de.name).toMatch(/^Zitronengras/)
    })

    it('Historie und Vergleich privater Tees nur für den Ersteller', async () => {
      const tea = await createAs(anna, { name: `Private Historie ${marker()}` })
      for (const client of [ben, admin, await createClient()]) {
        expect((await client.get(`/api/teas/${tea.id}/revisions`)).status).toBe(404)
        expect((await client.get(`/api/teas/${tea.id}/compare?from=1&to=1`)).status).toBe(404)
      }
      expect((await anna.get(`/api/teas/${tea.id}/revisions`)).status).toBe(200)
    })

    it('404 für unbekannte Versionen, 400 für ungültige, keine Änderungsrouten', async () => {
      const tea = await create({ name: `Unveränderlich ${marker()}`, visibility: 'public' })
      expect((await ben.get(`/api/teas/${tea.id}/compare?from=1&to=9`)).status).toBe(404)
      expect((await ben.get(`/api/teas/${tea.id}/compare?from=a&to=1`)).status).toBe(400)
      for (const method of ['PATCH', 'PUT', 'DELETE']) {
        expect((await ben.request(method, `/api/teas/${tea.id}/revisions`, {})).status).toBe(404)
      }
      expect((await ben.request('PUT', `/api/teas/${tea.id}`, {})).status).toBe(404)
    })
  })

  describe('Sichtbarkeits-Matrix (AK-1.7, AK-3.2, AK-4.4, AK-6.2)', () => {
    it('ein privater Tee existiert für Gast, Nutzer, Moderator und Admin auf keiner Route', async () => {
      const m = marker()
      const secretIngredient = await ingredient(`Matrixzutat ${m}`)
      // eigene Erstellerin, damit Annas Rate-Limit aus den übrigen Tests nicht greift
      const { client: owner } = await registerUser({ displayName: 'Clara' })
      const secret = await createAs(owner, { name: `Matrix ${m}`, ingredients: [{ ingredientId: secretIngredient }] })

      const moderator = await registerUser({ displayName: 'Moritz' })
      expect((await admin.patch(`/api/admin/users/${moderator.user.id}/role`, { role: 'moderator' })).status).toBe(200)
      const others: [string, TestClient][] = [['Gast', await createClient()], ['Nutzer', ben], ['Moderator', moderator.client], ['Admin', admin]]

      const routes: [string, string, unknown?][] = [
        ['GET', `/api/teas/${secret.id}`],
        ['PATCH', `/api/teas/${secret.id}`, { version: 1, brewTempC: 80 }],
        ['POST', `/api/teas/${secret.id}/publish`, { version: 1 }],
        ['DELETE', `/api/teas/${secret.id}`],
        ['GET', `/api/teas/${secret.id}/revisions`],
        ['GET', `/api/teas/${secret.id}/compare?from=1&to=1`],
      ]
      const lists = [
        `/api/teas?locale=de&q=${m}`,
        `/api/teas?locale=de&ingredient=${secretIngredient}`,
        `/api/teas/similar?locale=de&name=${encodeURIComponent(`Matrix ${m}`)}`,
      ]

      for (const [who, client] of others) {
        const loggedIn = who !== 'Gast'
        for (const [method, path, body] of routes) {
          const response = await client.request(method, path, body)
          // Schreibrouten verlangen zuerst eine Anmeldung; angemeldet ist der Tee „nicht vorhanden“
          const expected = method !== 'GET' && !loggedIn ? 401 : 404
          expect(response.status, `${who}: ${method} ${path}`).toBe(expected)
        }
        for (const path of lists) {
          const response = await client.get(path)
          expect(response.status, `${who}: ${path}`).toBe(200)
          expect(response.body.items.map((item: { id: string }) => item.id), `${who}: ${path}`).not.toContain(secret.id)
        }
        if (loggedIn) {
          const mine = await client.get(`/api/teas?locale=de&mine=1&q=${m}`)
          expect(mine.body.items, `${who}: mine`).toEqual([])
        }
      }

      // Für die Erstellerin selbst funktioniert alles
      expect((await owner.get(`/api/teas/${secret.id}`)).status).toBe(200)
      expect((await owner.get(`/api/teas/${secret.id}/revisions`)).status).toBe(200)
      expect((await owner.get(`/api/teas?locale=de&mine=1&q=${m}`)).body.items.map((item: TeaListItem) => item.id)).toEqual([secret.id])
      expect((await owner.patch(`/api/teas/${secret.id}`, { version: 1, brewTempC: 80 })).status).toBe(200)
      expect((await owner.request('DELETE', `/api/teas/${secret.id}`)).status).toBe(204)
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

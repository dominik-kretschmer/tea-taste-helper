import { randomUUID } from 'node:crypto'
import { setup } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, db, registerUser, rootDir, testServerEnv, type TestClient } from './helpers'

const marker = () => randomUUID().slice(0, 8)

describe('Zutaten-API', async () => {
  await setup({ rootDir, server: true, env: testServerEnv })

  let anna: TestClient
  let annaId: string
  let ben: TestClient
  let benId: string

  beforeAll(async () => {
    const [a, b] = await Promise.all([registerUser({ displayName: 'Anna' }), registerUser({ displayName: 'Ben' })])
    anna = a.client
    annaId = a.user.id
    ben = b.client
    benId = b.user.id
  })

  /** Legt eine Zutat als `client` an und liefert sie. */
  const createAs = async (client: TestClient, body: Record<string, unknown>) => {
    const response = await client.post('/api/ingredients', { locale: 'de', ...body })
    expect(response.status, response.text).toBe(201)
    return response.body.ingredient as IngredientDetail
  }

  // Wechselnde Autoren, damit die vielen Testzutaten nicht das Limit von 30 Änderungen auslösen
  let pool: { client: TestClient, uses: number } | undefined
  const create = async (body: Record<string, unknown>) => {
    if (!pool || pool.uses >= 25) pool = { client: (await registerUser()).client, uses: 0 }
    pool.uses++
    return createAs(pool.client, body)
  }

  describe('Rechte (AK-2.4)', () => {
    it('Gast: POST 401, GET öffentlich', async () => {
      const guest = await createClient()
      const response = await guest.post('/api/ingredients', { locale: 'de', name: `Gast ${marker()}` })
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('UNAUTHENTICATED')

      const ingredient = await create({ name: `Öffentlich ${marker()}` })
      expect((await guest.get(`/api/ingredients/${ingredient.id}`)).status).toBe(200)
      expect((await guest.get('/api/ingredients?locale=de')).status).toBe(200)
    })
  })

  describe('Anlegen (AK-2.1)', () => {
    it('legt Version 1 mit Autor an und schreibt das Audit', async () => {
      const name = `Pfefferminze ${marker()}`
      const ingredient = await createAs(anna, { name, description: 'Frisch\nund kühl', caffeine: 'no', brewTempC: 95, note: 'erste Fassung' })

      expect(ingredient).toMatchObject({
        sourceLocale: 'de',
        caffeine: 'no',
        brewTempC: 95,
        brewSeconds: null,
        version: 1,
        updatedBy: { displayName: 'Anna' },
        translations: { de: { name, description: 'Frisch\nund kühl' } },
      })
      expect(JSON.stringify(ingredient)).not.toContain('@')

      const versions = await db(`SELECT version, "isCurrent", "authorId", note FROM "IngredientVersion" WHERE "ingredientId" = $1`, [ingredient.id])
      expect(versions).toEqual([{ version: 1, isCurrent: true, authorId: annaId, note: 'erste Fassung' }])

      const [entry] = await db(`SELECT "actorId", details FROM "AuditLog" WHERE event = 'INGREDIENT_CREATED' AND details->>'ingredientId' = $1`, [ingredient.id])
      expect(entry).toEqual({ actorId: annaId, details: { ingredientId: ingredient.id, version: 1 } })
    })

    it('liefert Feldfehler bei ungültigen Angaben (AK-7.1)', async () => {
      const response = await anna.post('/api/ingredients', { locale: 'de', name: 'x', brewTempC: 120 })
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
      expect(Object.keys(response.body.error.details).sort()).toEqual(['brewTempC', 'name'])
    })

    it('gibt Nutzerinhalte unverändert als Text zurück (AK-7.2)', async () => {
      const name = `<script>alert(1)</script> ${marker()}`
      const ingredient = await create({ name, description: '<b>fett</b>' })
      const response = await anna.get(`/api/ingredients/${ingredient.id}`)
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(response.body.ingredient.translations.de).toEqual({ name, description: '<b>fett</b>' })
    })
  })

  describe('Duplikate (AK-2.3)', () => {
    it('lehnt denselben Namen in anderer Schreibweise ab und nennt die bestehende Zutat', async () => {
      const m = marker()
      const existing = await create({ name: `Grüner Tee ${m}` })
      const response = await anna.post('/api/ingredients', { locale: 'de', name: `  GRÜNER   tee ${m.toUpperCase()} ` })
      expect(response.status).toBe(409)
      expect(response.body.error).toMatchObject({ code: 'DUPLICATE_NAME', details: { ingredientId: existing.id, locale: 'de' } })
    })

    it('erlaubt denselben Namen in einer anderen Sprache', async () => {
      const name = `Rooibos ${marker()}`
      await create({ name })
      await create({ name, locale: 'en' })
    })

    it('lässt von 5 gleichzeitigen Anfragen mit demselben Namen genau eine durch', async () => {
      const { client } = await registerUser()
      const name = `Gleichzeitig ${marker()}`
      const responses = await Promise.all(Array.from({ length: 5 }, () => client.post('/api/ingredients', { locale: 'de', name })))
      const statuses = responses.map(r => r.status).sort()
      expect(statuses).toEqual([201, 409, 409, 409, 409])
      const [{ count }] = await db(`SELECT count(*)::int AS count FROM "IngredientVersionTranslation" WHERE name = $1`, [name])
      expect(count).toBe(1)
    })
  })

  describe('Detail (AK-1.4, AK-1.5)', () => {
    it('antwortet mit 404 für unbekannte und ungültige IDs', async () => {
      for (const id of [randomUUID(), 'keine-uuid']) {
        const response = await anna.get(`/api/ingredients/${id}`)
        expect(response.status).toBe(404)
        expect(response.body.error.code).toBe('NOT_FOUND')
      }
    })
  })

  describe('Liste und Suche (AK-1.1–AK-1.3)', () => {
    const list = (query: string) => anna.get<Page<IngredientListItem>>(`/api/ingredients?${query}`)

    it('sortiert alphabetisch mit Umlauten', async () => {
      const m = marker()
      for (const name of ['Zimt', 'Birne', 'Äpfel', 'apfel']) await create({ name: `${name} ${m}` })
      const response = await list(`locale=de&q=${m}`)
      expect(response.status).toBe(200)
      expect(response.body.items.map(item => item.name)).toEqual(['apfel', 'Äpfel', 'Birne', 'Zimt'].map(name => `${name} ${m}`))
      expect(response.body).toMatchObject({ total: 4, page: 1, pageSize: 24 })
    })

    it('teilt in Seiten zu 24 Einträgen', async () => {
      const m = marker()
      await db(
        `WITH i AS (
           INSERT INTO "Ingredient" (id, "sourceLocale") SELECT gen_random_uuid(), 'de' FROM generate_series(1, 30) RETURNING id
         ), v AS (
           INSERT INTO "IngredientVersion" (id, "ingredientId", version, "isCurrent") SELECT gen_random_uuid(), id, 1, true FROM i RETURNING id
         )
         INSERT INTO "IngredientVersionTranslation" ("versionId", locale, name, "nameKey")
         SELECT id, 'de', 'Seite ' || $1 || ' ' || row_number() OVER (), 'seite' FROM v`,
        [m],
      )
      const first = await list(`locale=de&q=${m}`)
      const second = await list(`locale=de&q=${m}&page=2`)
      expect(first.body.items).toHaveLength(24)
      expect(second.body.items).toHaveLength(6)
      expect(second.body.total).toBe(30)
      expect(new Set([...first.body.items, ...second.body.items].map(item => item.id)).size).toBe(30)
    })

    it('sucht über alle Sprachen und zeigt den Namen der aktuellen Sprache, sonst den Originalnamen', async () => {
      const m = marker()
      const mint = await create({ name: `Pfefferminze ${m}`, caffeine: 'no' })
      await db(
        `INSERT INTO "IngredientVersionTranslation" ("versionId", locale, name, "nameKey")
         SELECT id, 'en', $2::text, lower($2::text) FROM "IngredientVersion" WHERE "ingredientId" = $1 AND "isCurrent"`,
        [mint.id, `Peppermint ${m}`],
      )
      const matcha = await create({ name: `Matcha ${m}`, locale: 'en' })

      const de = await list(`locale=de&q=${encodeURIComponent(`PEPPERMINT ${m}`)}`)
      expect(de.body.items).toEqual([{ id: mint.id, name: `Pfefferminze ${m}`, translated: true, caffeine: 'no' }])

      const en = await list(`locale=en&q=${m}`)
      expect(en.body.items).toEqual([
        { id: matcha.id, name: `Matcha ${m}`, translated: true, caffeine: 'unknown' },
        { id: mint.id, name: `Peppermint ${m}`, translated: true, caffeine: 'no' },
      ])

      const fallback = await list(`locale=de&q=${encodeURIComponent(`Matcha ${m}`)}`)
      expect(fallback.body.items).toEqual([{ id: matcha.id, name: `Matcha ${m}`, translated: false, caffeine: 'unknown' }])
    })

    it('sucht % und _ wörtlich', async () => {
      const m = marker()
      const percent = await create({ name: `Tee 100% ${m}` })
      await create({ name: `Tee 1000 ${m}` })
      const response = await list(`locale=de&q=${encodeURIComponent(`100% ${m}`)}`)
      expect(response.body.items.map(item => item.id)).toEqual([percent.id])
      expect((await list(`locale=de&q=${encodeURIComponent(`_ ${m}`)}`)).body.total).toBe(0)
    })

    it('findet keine Namen alter Versionen', async () => {
      const m = marker()
      const ingredient = await create({ name: `Altname ${m}` })
      await db(
        `WITH old AS (
           UPDATE "IngredientVersion" SET "isCurrent" = false WHERE "ingredientId" = $1 RETURNING "ingredientId"
         ), v AS (
           INSERT INTO "IngredientVersion" (id, "ingredientId", version, "isCurrent") SELECT gen_random_uuid(), "ingredientId", 2, true FROM old RETURNING id
         )
         INSERT INTO "IngredientVersionTranslation" ("versionId", locale, name, "nameKey") SELECT id, 'de', $2::text, lower($2::text) FROM v`,
        [ingredient.id, `Neuname ${m}`],
      )
      expect((await list(`locale=de&q=${encodeURIComponent(`Altname ${m}`)}`)).body.total).toBe(0)
      expect((await list(`locale=de&q=${encodeURIComponent(`Neuname ${m}`)}`)).body.items.map(item => item.id)).toEqual([ingredient.id])
    })

    it('verlangt eine gültige Sprache', async () => {
      expect((await list('locale=fr')).status).toBe(400)
      expect((await list('')).status).toBe(400)
    })
  })

  describe('Bearbeiten und Übersetzen (AK-3, AK-4)', () => {
    const patch = (client: TestClient, id: string, body: Record<string, unknown>) => client.patch(`/api/ingredients/${id}`, body)

    it('legt Version 2 mit Autor und Notiz an, kopiert unveränderte Übersetzungen und schreibt das Audit', async () => {
      const name = `Kamille ${marker()}`
      const ingredient = await createAs(anna, { name, description: 'Blüten', brewTempC: 95 })

      const response = await patch(ben, ingredient.id, { version: 1, brewSeconds: 300, note: 'Ziehzeit ergänzt' })
      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        changed: true,
        ingredient: { version: 2, brewTempC: 95, brewSeconds: 300, updatedBy: { displayName: 'Ben' }, translations: { de: { name, description: 'Blüten' } } },
      })

      const versions = await db(
        `SELECT v.version, v."isCurrent", v."authorId", v.note, t.name, t.description
         FROM "IngredientVersion" v JOIN "IngredientVersionTranslation" t ON t."versionId" = v.id
         WHERE v."ingredientId" = $1 ORDER BY v.version`,
        [ingredient.id],
      )
      expect(versions).toEqual([
        { version: 1, isCurrent: false, authorId: annaId, note: null, name, description: 'Blüten' },
        { version: 2, isCurrent: true, authorId: benId, note: 'Ziehzeit ergänzt', name, description: 'Blüten' },
      ])

      const [entry] = await db(`SELECT "actorId", details FROM "AuditLog" WHERE event = 'INGREDIENT_UPDATED' AND details->>'ingredientId' = $1`, [ingredient.id])
      expect(entry).toEqual({ actorId: benId, details: { ingredientId: ingredient.id, version: 2, locales: [] } })
    })

    it('legt ohne Änderung keine Version an (AK-3.3)', async () => {
      const name = `Salbei ${marker()}`
      const ingredient = await create({ name, caffeine: 'no' })
      const response = await patch(ben, ingredient.id, { version: 1, caffeine: 'no', translations: { de: { name: ` ${name} `, description: '' } } })
      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({ changed: false, ingredient: { version: 1 } })
      const [{ count }] = await db(`SELECT count(*)::int AS count FROM "IngredientVersion" WHERE "ingredientId" = $1`, [ingredient.id])
      expect(count).toBe(1)
      expect(await db(`SELECT 1 FROM "AuditLog" WHERE event = 'INGREDIENT_UPDATED' AND details->>'ingredientId' = $1`, [ingredient.id])).toEqual([])
    })

    it('lehnt eine veraltete Version mit EDIT_CONFLICT ab (AK-3.2)', async () => {
      const ingredient = await create({ name: `Melisse ${marker()}` })
      expect((await patch(anna, ingredient.id, { version: 1, caffeine: 'no' })).status).toBe(200)
      const response = await patch(ben, ingredient.id, { version: 1, caffeine: 'yes' })
      expect(response.status).toBe(409)
      expect(response.body.error).toMatchObject({ code: 'EDIT_CONFLICT', details: { currentVersion: 2 } })
    })

    it('lässt von gleichzeitigen Speicherungen derselben Version nur eine durch', async () => {
      const ingredient = await create({ name: `Thymian ${marker()}` })
      const responses = await Promise.all([40, 50, 60].map(brewTempC => patch(ben, ingredient.id, { version: 1, brewTempC })))
      expect(responses.map(r => r.status).sort()).toEqual([200, 409, 409])
    })

    it('prüft Duplikate beim Umbenennen, erlaubt aber die eigene Schreibweise (AK-3.4)', async () => {
      const m = marker()
      const taken = await create({ name: `Hibiskus ${m}` })
      const ingredient = await create({ name: `hagebutte ${m}` })

      const duplicate = await patch(ben, ingredient.id, { version: 1, translations: { de: { name: `HIBISKUS ${m}` } } })
      expect(duplicate.status).toBe(409)
      expect(duplicate.body.error).toMatchObject({ code: 'DUPLICATE_NAME', details: { ingredientId: taken.id, locale: 'de' } })

      const ownSpelling = await patch(ben, ingredient.id, { version: 1, translations: { de: { name: `Hagebutte ${m}` } } })
      expect(ownSpelling.status).toBe(200)
      expect(ownSpelling.body.ingredient.translations.de.name).toBe(`Hagebutte ${m}`)

      // Die Version wurde beim Duplikat nicht verbraucht
      expect(ownSpelling.body.ingredient.version).toBe(2)
    })

    it('fügt eine Übersetzung hinzu, die sofort in der Liste erscheint (AK-4.1)', async () => {
      const m = marker()
      const ingredient = await create({ name: `Brennnessel ${m}`, description: 'Kraut' })
      const response = await patch(ben, ingredient.id, { version: 1, translations: { en: { name: `Nettle ${m}`, description: 'Herb' } } })
      expect(response.status).toBe(200)
      expect(response.body.ingredient.translations).toEqual({
        de: { name: `Brennnessel ${m}`, description: 'Kraut' },
        en: { name: `Nettle ${m}`, description: 'Herb' },
      })

      const list = await anna.get(`/api/ingredients?locale=en&q=${m}`)
      expect(list.body.items).toEqual([{ id: ingredient.id, name: `Nettle ${m}`, translated: true, caffeine: 'unknown' }])

      const [entry] = await db(`SELECT details FROM "AuditLog" WHERE event = 'INGREDIENT_UPDATED' AND details->>'ingredientId' = $1`, [ingredient.id])
      expect(entry.details.locales).toEqual(['en'])
    })

    it('prüft Duplikate auch in der neuen Sprache (AK-4.2)', async () => {
      const m = marker()
      const taken = await create({ name: `Lemongrass ${m}`, locale: 'en' })
      const ingredient = await create({ name: `Zitronengras ${m}` })
      const response = await patch(ben, ingredient.id, { version: 1, translations: { en: { name: `lemongrass ${m}` } } })
      expect(response.status).toBe(409)
      expect(response.body.error.details).toEqual({ ingredientId: taken.id, locale: 'en' })
    })

    it('hält nach mehreren Änderungen genau eine aktuelle Version je Zutat', async () => {
      const ingredient = await create({ name: `Fenchel ${marker()}` })
      for (let version = 1; version <= 3; version++) {
        expect((await patch(ben, ingredient.id, { version, brewTempC: 90 + version })).status).toBe(200)
      }
      const rows = await db(`SELECT "ingredientId" FROM "IngredientVersion" WHERE "isCurrent" GROUP BY "ingredientId" HAVING count(*) <> 1`)
      expect(rows).toEqual([])
      const [{ version }] = await db(`SELECT version FROM "IngredientVersion" WHERE "ingredientId" = $1 AND "isCurrent"`, [ingredient.id])
      expect(version).toBe(4)
    })

    it('verweigert eine zweite aktuelle Version auf DB-Ebene', async () => {
      const ingredient = await create({ name: `Index ${marker()}` })
      await expect(db(
        `INSERT INTO "IngredientVersion" (id, "ingredientId", version, "isCurrent") VALUES (gen_random_uuid(), $1, 2, true)`,
        [ingredient.id],
      )).rejects.toThrow(/IngredientVersion_current_key/)
    })

    it('antwortet 401 für Gäste, 404 für unbekannte Zutaten und 400 ohne Version', async () => {
      const ingredient = await create({ name: `Rechte ${marker()}` })
      const guest = await createClient()
      expect((await patch(guest, ingredient.id, { version: 1, caffeine: 'no' })).status).toBe(401)
      expect((await patch(ben, randomUUID(), { version: 1, caffeine: 'no' })).status).toBe(404)
      expect((await patch(ben, ingredient.id, { caffeine: 'no' })).status).toBe(400)
    })

    it('begrenzt auf 30 Änderungen in 10 Minuten (AK-3.5)', async () => {
      const { client } = await registerUser()
      const ingredient = await createAs(client, { name: `Limit ${marker()}` })
      for (let version = 1; version < 30; version++) {
        expect((await patch(client, ingredient.id, { version, brewTempC: 40 + version })).status).toBe(200)
      }
      const blocked = await patch(client, ingredient.id, { version: 30, brewTempC: 99 })
      expect(blocked.status).toBe(429)
      expect(blocked.body.error.code).toBe('RATE_LIMITED')
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
      expect((await client.post('/api/ingredients', { locale: 'de', name: `Limit ${marker()}` })).status).toBe(429)
    })
  })

  describe('Historie und Vergleich (AK-5)', () => {
    it('listet alle Versionen neueste zuerst und vergleicht zwei davon', async () => {
      const m = marker()
      const ingredient = await createAs(anna, { name: `Pfefferminze ${m}`, caffeine: 'no', brewTempC: 95 })
      await ben.patch(`/api/ingredients/${ingredient.id}`, { version: 1, brewSeconds: 300, note: 'Ziehzeit ergänzt' })
      await anna.patch(`/api/ingredients/${ingredient.id}`, { version: 2, translations: { en: { name: `Peppermint ${m}` } }, note: 'Englisch ergänzt' })

      const guest = await createClient()
      const revisions = await guest.get(`/api/ingredients/${ingredient.id}/revisions`)
      expect(revisions.status).toBe(200)
      expect(revisions.body).toMatchObject({ total: 3, page: 1, pageSize: 50 })
      expect(revisions.body.items.map(({ createdAt, ...rest }: RevisionEntry) => rest)).toEqual([
        { version: 3, isCurrent: true, author: { displayName: 'Anna' }, note: 'Englisch ergänzt' },
        { version: 2, isCurrent: false, author: { displayName: 'Ben' }, note: 'Ziehzeit ergänzt' },
        { version: 1, isCurrent: false, author: { displayName: 'Anna' }, note: null },
      ])
      expect(JSON.stringify(revisions.body)).not.toContain('@')

      const compare = await guest.get(`/api/ingredients/${ingredient.id}/compare?from=1&to=3`)
      expect(compare.status).toBe(200)
      expect(compare.body.changes).toEqual([
        { field: 'brewSeconds', from: null, to: 300 },
        { field: 'name', locale: 'en', from: null, to: `Peppermint ${m}` },
      ])
      expect(compare.body.from).toMatchObject({ version: 1, snapshot: { brewSeconds: null, translations: { de: { name: `Pfefferminze ${m}` } } } })
      expect(compare.body.to).toMatchObject({ version: 3, isCurrent: true, snapshot: { brewSeconds: 300 } })
    })

    it('antwortet 404 für unbekannte Zutaten und Versionen, 400 für ungültige Nummern', async () => {
      const ingredient = await create({ name: `Vergleich ${marker()}` })
      expect((await anna.get(`/api/ingredients/${randomUUID()}/revisions`)).status).toBe(404)
      expect((await anna.get(`/api/ingredients/${randomUUID()}/compare?from=1&to=1`)).status).toBe(404)
      expect((await anna.get(`/api/ingredients/${ingredient.id}/compare?from=1&to=9`)).status).toBe(404)
      expect((await anna.get(`/api/ingredients/${ingredient.id}/compare?from=a&to=1`)).status).toBe(400)
      expect((await anna.get(`/api/ingredients/${ingredient.id}/compare`)).status).toBe(400)
    })

    it('bietet keine Routen zum Ändern oder Löschen von Versionen und Zutaten (AK-3.6, AK-5.3)', async () => {
      const ingredient = await create({ name: `Unveränderlich ${marker()}` })
      const attempts: [string, string][] = [
        ['PATCH', `/api/ingredients/${ingredient.id}/revisions`],
        ['DELETE', `/api/ingredients/${ingredient.id}/revisions`],
        ['PUT', `/api/ingredients/${ingredient.id}/revisions`],
        ['DELETE', `/api/ingredients/${ingredient.id}`],
        ['PUT', `/api/ingredients/${ingredient.id}`],
      ]
      for (const [method, path] of attempts) {
        const response = await anna.request(method, path, {})
        expect(response.status, `${method} ${path}`).toBe(404)
      }
      const [{ count }] = await db(`SELECT count(*)::int AS count FROM "IngredientVersion" WHERE "ingredientId" = $1`, [ingredient.id])
      expect(count).toBe(1)
      expect((await anna.get(`/api/ingredients/${ingredient.id}`)).status).toBe(200)
    })
  })

  describe('Ähnliche Namen (AK-2.2)', () => {
    it('findet Tippfehler und Teilwörter, höchstens 5', async () => {
      const m = marker()
      const peppermint = await create({ name: `Pfefferminze ${m}` })

      const typo = await anna.get(`/api/ingredients/similar?locale=de&name=${encodeURIComponent(`Pfeferminze ${m}`)}`)
      expect(typo.status).toBe(200)
      expect(typo.body.items).toContainEqual({ id: peppermint.id, name: `Pfefferminze ${m}` })
      expect(typo.body.items.length).toBeLessThanOrEqual(5)

      const part = await anna.get(`/api/ingredients/similar?locale=de&name=${m}`)
      expect(part.body.items.map((item: { id: string }) => item.id)).toEqual([peppermint.id])
    })

    it('verlangt mindestens 2 Zeichen', async () => {
      expect((await anna.get('/api/ingredients/similar?locale=de&name=x')).status).toBe(400)
    })
  })
})

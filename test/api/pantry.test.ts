import { randomUUID } from 'node:crypto'
import { setup } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, db, insertIngredient, registerUser, rootDir, setRole, testServerEnv, type TestClient } from './helpers'

const marker = () => randomUUID().slice(0, 8)

describe('Vorrat', async () => {
  await setup({ rootDir, server: true, env: testServerEnv })

  let anna: TestClient
  let annaId: string
  let ben: TestClient
  let guest: TestClient
  let base: string
  let mod: TestClient

  beforeAll(async () => {
    const [a, b, m] = await Promise.all([registerUser({ displayName: 'Anna' }), registerUser({ displayName: 'Ben' }), registerUser({ displayName: 'Moni' })])
    anna = a.client
    annaId = a.user.id
    ben = b.client
    mod = m.client
    await setRole(m.user.id, 'moderator')
    guest = await createClient()
    base = await insertIngredient(`Grundtee ${marker()}`)
  })

  const createTea = async (client: TestClient, body: Record<string, unknown>) => {
    const response = await client.post('/api/teas', { locale: 'de', kind: 'blended', visibility: 'public', ingredients: [{ ingredientId: base }], ...body })
    expect(response.status, response.text).toBe(201)
    return response.body.tea as TeaDetail
  }
  const add = (client: TestClient, entityType: 'ingredient' | 'tea', entityId: string, grams?: number | null) =>
    client.post('/api/pantry', { entityType, entityId, ...(grams === undefined ? {} : { grams }) })
  const list = async (client: TestClient, query: string) => {
    const response = await client.get(`/api/pantry?${query}`)
    expect(response.status, response.text).toBe(200)
    return response.body as PantryPage
  }
  const remove = (client: TestClient, id: string) => client.request('DELETE', `/api/pantry/${id}`)

  describe('Zugang (AK-0.1, AK-0.2)', () => {
    it('antwortet Gästen auf jeder Route mit 401', async () => {
      const id = randomUUID()
      const responses = await Promise.all([
        guest.get('/api/pantry?type=ingredient&locale=de'),
        guest.get(`/api/pantry/lookup?type=ingredient&entityId=${id}`),
        add(guest, 'ingredient', id),
        guest.patch(`/api/pantry/${id}`, { grams: 1 }),
        remove(guest, id),
      ])
      expect(responses.map(response => response.status)).toEqual([401, 401, 401, 401, 401])
    })

    it('zeigt und ändert keine fremden Einträge', async () => {
      const ingredient = await insertIngredient(`Zimt ${marker()}`)
      const { body } = await add(anna, 'ingredient', ingredient, 10)

      expect((await ben.patch(`/api/pantry/${body.entry.id}`, { grams: 1 })).status).toBe(404)
      expect((await remove(ben, body.entry.id)).status).toBe(404)
      expect((await ben.get(`/api/pantry/lookup?type=ingredient&entityId=${ingredient}`)).body.entry).toBeNull()
      expect((await list(ben, 'type=ingredient&locale=de')).items.map(item => item.id)).not.toContain(body.entry.id)
      expect((await anna.get(`/api/pantry/lookup?type=ingredient&entityId=${ingredient}`)).body.entry).toMatchObject({ grams: 10 })
    })
  })

  describe('Liste (AK-1.1–1.5)', () => {
    it('sortiert normal → aufgebraucht → ausgeblendet, zählt je Art, sucht über alle Sprachen', async () => {
      const { client } = await registerUser()
      const tag = marker()
      const [apfel, birne, chili, dill] = await Promise.all(['Apfel', 'Birne', 'Chili', 'Dill'].map(name => insertIngredient(`${name} ${tag}`)))
      await db(
        `INSERT INTO "IngredientVersionTranslation" ("versionId", locale, name, "nameKey")
         SELECT id, 'en', $2::text, lower($2::text) FROM "IngredientVersion" WHERE "ingredientId" = $1 AND "isCurrent"`,
        [birne, `Pear ${tag}`],
      )
      for (const [id, grams] of [[dill, null], [chili, 0], [birne, 5], [apfel, 20]] as const) {
        expect((await add(client, 'ingredient', id, grams)).status).toBe(201)
      }
      await db(`UPDATE "Ingredient" SET "hiddenAt" = now() WHERE id = $1`, [apfel])
      const tea = await createTea(client, { name: `Teemischung ${tag}`, visibility: 'private' })
      expect((await add(client, 'tea', tea.id)).status).toBe(201)

      const de = await list(client, 'type=ingredient&locale=de')
      expect(de.counts).toEqual({ ingredient: 4, tea: 1 })
      expect(de.items.map(item => [item.name, item.grams, item.empty, item.hidden])).toEqual([
        [`Birne ${tag}`, 5, false, false],
        [`Dill ${tag}`, null, false, false],
        [`Chili ${tag}`, 0, true, false],
        [`Apfel ${tag}`, 20, false, true],
      ])
      // Englisch mit Fallback auf die Originalsprache
      const en = await list(client, 'type=ingredient&locale=en')
      expect(en.items.map(item => item.name)).toEqual([`Dill ${tag}`, `Pear ${tag}`, `Chili ${tag}`, `Apfel ${tag}`])
      // Suche nach dem englischen Namen auch in der deutschen Ansicht; Zähler bleiben ungefiltert
      const search = await list(client, `type=ingredient&locale=de&q=pear`)
      expect(search.items.map(item => item.entityId)).toEqual([birne])
      expect(search.total).toBe(1)
      expect(search.counts.ingredient).toBe(4)

      const teas = await list(client, 'type=tea&locale=de')
      expect(teas.items).toEqual([{ id: expect.any(String), entityType: 'tea', entityId: tea.id, name: `Teemischung ${tag}`, brand: null, grams: null, empty: false, hidden: false }])
    })

    it('teilt in Seiten zu 24 Einträgen', async () => {
      const { client, user } = await registerUser()
      await db(
        `WITH i AS (INSERT INTO "Ingredient" (id, "sourceLocale") SELECT gen_random_uuid(), 'de' FROM generate_series(1, 25) RETURNING id),
              v AS (INSERT INTO "IngredientVersion" (id, "ingredientId", version, "isCurrent")
                    SELECT gen_random_uuid(), id, 1, true FROM i RETURNING id),
              x AS (INSERT INTO "IngredientVersionTranslation" ("versionId", locale, name, "nameKey")
                    SELECT id, 'de', 'Seite ' || id, 'seite ' || id FROM v)
         INSERT INTO "PantryItem" (id, "userId", "ingredientId", "updatedAt") SELECT gen_random_uuid(), $1, id, now() FROM i`,
        [user.id],
      )
      const second = await list(client, 'type=ingredient&locale=de&page=2')
      expect(second).toMatchObject({ total: 25, page: 2, pageSize: 24 })
      expect(second.items).toHaveLength(1)
    })

    it('verlangt eine gültige Art', async () => {
      expect((await anna.get('/api/pantry?type=user&locale=de')).status).toBe(400)
    })
  })

  describe('Hinzufügen (AK-2.1, AK-2.3–2.6)', () => {
    it('legt einen Eintrag an und lehnt einen zweiten ab', async () => {
      const id = await insertIngredient(`Kardamom ${marker()}`)
      const first = await add(anna, 'ingredient', id, 30)
      expect(first.status).toBe(201)
      expect(first.body.entry).toEqual({ id: expect.any(String), entityType: 'ingredient', entityId: id, grams: 30 })

      const second = await add(anna, 'ingredient', id, 5)
      expect(second.status).toBe(409)
      expect(second.body.error).toMatchObject({ code: 'ALREADY_IN_PANTRY', details: { entryId: first.body.entry.id, grams: 30 } })
    })

    it('nimmt eigene private Tees, aber keine fremden, ausgeblendeten oder zusammengeführten Einträge', async () => {
      const own = await createTea(anna, { name: `Eigener ${marker()}`, visibility: 'private' })
      expect((await add(anna, 'tea', own.id)).status).toBe(201)

      const foreign = await createTea(ben, { name: `Bens ${marker()}`, visibility: 'private' })
      expect((await add(anna, 'tea', foreign.id)).status).toBe(404)
      expect((await add(anna, 'tea', randomUUID())).status).toBe(404)

      const hidden = await insertIngredient(`Versteckt ${marker()}`)
      await db(`UPDATE "Ingredient" SET "hiddenAt" = now() WHERE id = $1`, [hidden])
      expect((await add(anna, 'ingredient', hidden)).status).toBe(404)

      const [source, target] = await Promise.all([insertIngredient(`Quelle ${marker()}`), insertIngredient(`Ziel ${marker()}`)])
      await db(`UPDATE "Ingredient" SET "mergedIntoId" = $2, "mergedAt" = now() WHERE id = $1`, [source, target])
      const merged = await add(anna, 'ingredient', source)
      expect(merged.status).toBe(404)
      expect(merged.body.error.details).toEqual({ mergedInto: target })
    })

    it('prüft die Menge (AK-2.5)', async () => {
      const id = await insertIngredient(`Nelke ${marker()}`)
      for (const grams of [-1, 100_001, 2.5, '5']) {
        expect((await add(anna, 'ingredient', id, grams as number)).status, String(grams)).toBe(400)
      }
    })

    it('begrenzt den Vorrat auf 1000 Einträge', async () => {
      const { client, user } = await registerUser()
      await db(
        `WITH i AS (INSERT INTO "Ingredient" (id, "sourceLocale") SELECT gen_random_uuid(), 'de' FROM generate_series(1, 999) RETURNING id)
         INSERT INTO "PantryItem" (id, "userId", "ingredientId", "updatedAt") SELECT gen_random_uuid(), $1, id, now() FROM i`,
        [user.id],
      )
      expect((await add(client, 'ingredient', await insertIngredient(`Nr. 1000 ${marker()}`))).status).toBe(201)
      const full = await add(client, 'ingredient', await insertIngredient(`Nr. 1001 ${marker()}`))
      expect(full.status).toBe(400)
      expect(full.body.error.code).toBe('PANTRY_FULL')
    })
  })

  describe('Ändern und Entfernen (AK-3.1, AK-3.3, AK-4.1, AK-4.2)', () => {
    it('ändert die Menge, auch auf leer und 0', async () => {
      const { body } = await add(anna, 'ingredient', await insertIngredient(`Anis ${marker()}`))
      for (const grams of [50, 0, null]) {
        const response = await anna.patch(`/api/pantry/${body.entry.id}`, { grams })
        expect(response.status).toBe(200)
        expect(response.body.entry.grams).toBe(grams)
      }
    })

    it('lässt ausgeblendete Einträge nur entfernen', async () => {
      const id = await insertIngredient(`Fenchel ${marker()}`)
      const { body } = await add(anna, 'ingredient', id, 10)
      await db(`UPDATE "Ingredient" SET "hiddenAt" = now() WHERE id = $1`, [id])
      const response = await anna.patch(`/api/pantry/${body.entry.id}`, { grams: 5 })
      expect(response.status).toBe(409)
      expect(response.body.error.code).toBe('ENTRY_UNAVAILABLE')
      expect((await remove(anna, body.entry.id)).status).toBe(204)
    })

    it('entfernt und stellt per erneutem Hinzufügen wieder her', async () => {
      const id = await insertIngredient(`Koriander ${marker()}`)
      const { body } = await add(anna, 'ingredient', id, 42)
      expect((await remove(anna, body.entry.id)).status).toBe(204)
      expect((await remove(anna, body.entry.id)).status).toBe(404)
      expect((await anna.get(`/api/pantry/lookup?type=ingredient&entityId=${id}`)).body.entry).toBeNull()

      const undo = await add(anna, 'ingredient', id, 42)
      expect(undo.status).toBe(201)
      expect(undo.body.entry.grams).toBe(42)
    })

    it('entfernt einen gelöschten privaten Tee aus dem Vorrat', async () => {
      const tea = await createTea(anna, { name: `Weg ${marker()}`, visibility: 'private' })
      await add(anna, 'tea', tea.id, 3)
      expect((await anna.request('DELETE', `/api/teas/${tea.id}`)).status).toBe(204)
      expect(await db(`SELECT 1 FROM "PantryItem" WHERE "teaId" = $1`, [tea.id])).toEqual([])
    })

    it('schreibt kein Audit-Log', async () => {
      const id = await insertIngredient(`Muskat ${marker()}`)
      const { body } = await add(anna, 'ingredient', id, 1)
      await anna.patch(`/api/pantry/${body.entry.id}`, { grams: 2 })
      await remove(anna, body.entry.id)
      expect(await db(`SELECT event FROM "AuditLog" WHERE "actorId" = $1 AND details::text LIKE $2`, [annaId, `%${id}%`])).toEqual([])
    })
  })

  describe('Teesuche mit eigenen privaten Tees (AK-2.1)', () => {
    it('liefert mit withOwn öffentliche und eigene private Tees, Gästen nur öffentliche', async () => {
      const tag = marker()
      const pub = await createTea(ben, { name: `Suchtee ${tag} öffentlich` })
      const own = await createTea(anna, { name: `Suchtee ${tag} privat`, visibility: 'private' })
      const ids = async (client: TestClient) =>
        (await client.get(`/api/teas?locale=de&withOwn=1&q=${encodeURIComponent(`Suchtee ${tag}`)}`)).body.items.map((item: { id: string }) => item.id)

      expect(await ids(anna)).toEqual(expect.arrayContaining([pub.id, own.id]))
      expect(await ids(ben)).toEqual([pub.id])
      expect(await ids(guest)).toEqual([pub.id])
    })
  })

  describe('Moderation (AK-5.1–5.3)', () => {
    const grams = async (userId: string, column: 'ingredientId' | 'teaId', id: string) =>
      (await db<{ grams: number | null }>(`SELECT grams FROM "PantryItem" WHERE "userId" = $1 AND "${column}" = $2`, [userId, id])).map(row => row.grams)
    const merge = (type: 'ingredients' | 'teas', source: string, target: string) =>
      mod.post(`/api/admin/${type}/${source}/merge`, { targetId: target })

    it.each([
      [30, 20, 50],
      [null, 20, 20],
      [20, null, 20],
      [null, null, null],
      [90_000, 20_000, 100_000],
      [0, 5, 5],
    ])('Zutaten: Quelle %s g + Ziel %s g → %s g', async (sourceGrams, targetGrams, expected) => {
      const { client, user } = await registerUser()
      const [source, target] = await Promise.all([insertIngredient(`Quelle ${marker()}`), insertIngredient(`Ziel ${marker()}`)])
      expect((await add(client, 'ingredient', source, sourceGrams)).status).toBe(201)
      expect((await add(client, 'ingredient', target, targetGrams)).status).toBe(201)

      expect((await merge('ingredients', source, target)).status).toBe(200)
      expect(await grams(user.id, 'ingredientId', source)).toEqual([])
      expect(await grams(user.id, 'ingredientId', target)).toEqual([expected])
    })

    it('hängt Einträge um und lässt Vorräte anderer getrennt', async () => {
      const [b1, b2] = await Promise.all([registerUser(), registerUser()])
      const [source, target] = await Promise.all([insertIngredient(`Quelle ${marker()}`), insertIngredient(`Ziel ${marker()}`)])
      await add(b1.client, 'ingredient', source, 7)
      await add(b2.client, 'ingredient', target, 9)

      expect((await merge('ingredients', source, target)).status).toBe(200)
      expect(await grams(b1.user.id, 'ingredientId', target)).toEqual([7])
      expect(await grams(b2.user.id, 'ingredientId', target)).toEqual([9])
      const [entry] = await db(`SELECT details FROM "AuditLog" WHERE event = 'INGREDIENT_MERGED' AND details->>'sourceId' = $1`, [source])
      expect(entry.details).toEqual({ sourceId: source, targetId: target, teasChanged: 0, privateTeasChanged: 0 })
    })

    it('Tees: Mengen werden addiert', async () => {
      const { client, user } = await registerUser()
      const [source, target] = await Promise.all([
        createTea(anna, { name: `Quelltee ${marker()}` }),
        createTea(anna, { name: `Zieltee ${marker()}` }),
      ])
      await add(client, 'tea', source.id, 40)
      await add(client, 'tea', target.id, 60)

      expect((await merge('teas', source.id, target.id)).status).toBe(200)
      expect(await grams(user.id, 'teaId', target.id)).toEqual([100])
      expect(await grams(user.id, 'teaId', source.id)).toEqual([])
    })

    it('Ausblenden: Eintrag bleibt markiert, nach dem Wiederherstellen wieder normal', async () => {
      const { client } = await registerUser()
      const id = await insertIngredient(`Nur im Vorrat ${marker()}`)
      await add(client, 'ingredient', id, 12)

      // Vorratseinträge verhindern das Ausblenden nicht (AK-5.3)
      expect((await mod.post(`/api/admin/ingredients/${id}/hide`, { reason: 'Spam' })).status).toBe(204)
      const hidden = await list(client, 'type=ingredient&locale=de')
      expect(hidden.items).toEqual([expect.objectContaining({ entityId: id, grams: 12, hidden: true })])

      expect((await mod.post(`/api/admin/ingredients/${id}/restore`)).status).toBe(204)
      const restored = await list(client, 'type=ingredient&locale=de')
      expect(restored.items).toEqual([expect.objectContaining({ entityId: id, grams: 12, hidden: false })])
    })
  })
})

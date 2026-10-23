import { randomUUID } from 'node:crypto'
import { setup } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, db, registerUser, rootDir, testServerEnv, type TestClient } from './helpers'

const marker = () => randomUUID().slice(0, 8)

describe('Zutaten-API', async () => {
  await setup({ rootDir, server: true, env: testServerEnv })

  let anna: TestClient
  let annaId: string

  beforeAll(async () => {
    const registered = await registerUser({ displayName: 'Anna' })
    anna = registered.client
    annaId = registered.user.id
  })

  /** Legt eine Zutat an und liefert sie; jeder Aufruf mit eigenem Nutzer schont dessen Rate-Limit. */
  const create = async (client: TestClient, body: Record<string, unknown>) => {
    const response = await client.post('/api/ingredients', { locale: 'de', ...body })
    expect(response.status, response.text).toBe(201)
    return response.body.ingredient as IngredientDetail
  }

  describe('Rechte (AK-2.4)', () => {
    it('Gast: POST 401, GET öffentlich', async () => {
      const guest = await createClient()
      const response = await guest.post('/api/ingredients', { locale: 'de', name: `Gast ${marker()}` })
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('UNAUTHENTICATED')

      const ingredient = await create(anna, { name: `Öffentlich ${marker()}` })
      expect((await guest.get(`/api/ingredients/${ingredient.id}`)).status).toBe(200)
    })
  })

  describe('Anlegen (AK-2.1)', () => {
    it('legt Version 1 mit Autor an und schreibt das Audit', async () => {
      const name = `Pfefferminze ${marker()}`
      const ingredient = await create(anna, { name, description: 'Frisch\nund kühl', caffeine: 'no', brewTempC: 95, note: 'erste Fassung' })

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
      const ingredient = await create(anna, { name, description: '<b>fett</b>' })
      const response = await anna.get(`/api/ingredients/${ingredient.id}`)
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(response.body.ingredient.translations.de).toEqual({ name, description: '<b>fett</b>' })
    })
  })

  describe('Duplikate (AK-2.3)', () => {
    it('lehnt denselben Namen in anderer Schreibweise ab und nennt die bestehende Zutat', async () => {
      const m = marker()
      const existing = await create(anna, { name: `Grüner Tee ${m}` })
      const response = await anna.post('/api/ingredients', { locale: 'de', name: `  GRÜNER   tee ${m.toUpperCase()} ` })
      expect(response.status).toBe(409)
      expect(response.body.error).toMatchObject({ code: 'DUPLICATE_NAME', details: { ingredientId: existing.id, locale: 'de' } })
    })

    it('erlaubt denselben Namen in einer anderen Sprache', async () => {
      const name = `Rooibos ${marker()}`
      await create(anna, { name })
      await create(anna, { name, locale: 'en' })
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

  describe('Ähnliche Namen (AK-2.2)', () => {
    it('findet Tippfehler und Teilwörter, höchstens 5', async () => {
      const m = marker()
      const peppermint = await create(anna, { name: `Pfefferminze ${m}` })

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

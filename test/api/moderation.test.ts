import { randomUUID } from 'node:crypto'
import { setup } from '@nuxt/test-utils/e2e'
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, db, insertIngredient, registerUser, rootDir, setRole, testServerEnv, type TestClient } from './helpers'

const marker = () => randomUUID().slice(0, 8)

describe('Moderation', async () => {
  await setup({ rootDir, server: true, env: testServerEnv })

  let anna: TestClient
  let guest: TestClient
  let mod: TestClient
  let modId: string

  beforeAll(async () => {
    const [a, m] = await Promise.all([registerUser({ displayName: 'Anna' }), registerUser({ displayName: 'Moni' })])
    anna = a.client
    mod = m.client
    modId = m.user.id
    await setRole(modId, 'moderator')
    guest = await createClient()
  })

  const createTea = async (client: TestClient, body: Record<string, unknown>) => {
    const response = await client.post('/api/teas', { locale: 'de', kind: 'blended', visibility: 'public', ...body })
    expect(response.status, response.text).toBe(201)
    return response.body.tea as TeaDetail
  }
  const hide = (table: 'Ingredient' | 'Tea', id: string) =>
    db(`UPDATE "${table}" SET "hiddenAt" = now(), "hiddenById" = $2, "hiddenReason" = 'Spam' WHERE id = $1`, [id, modId])
  const mergeInto = (table: 'Ingredient' | 'Tea', id: string, target: string) =>
    db(`UPDATE "${table}" SET "mergedIntoId" = $2, "mergedAt" = now() WHERE id = $1`, [id, target])

  describe('Zustand „aktiv“ in bestehenden Abfragen (Aufgabe 5)', () => {
    it('blendet eine Zutat überall aus, außer für Moderatoren', async () => {
      const name = `Hibiskus ${marker()}`
      const id = await insertIngredient(name)
      await hide('Ingredient', id)

      for (const client of [guest, anna]) {
        for (const path of [`/api/ingredients/${id}`, `/api/ingredients/${id}/revisions`, `/api/ingredients/${id}/compare?from=1&to=1`]) {
          expect((await client.get(path)).status, path).toBe(404)
        }
      }
      expect((await anna.patch(`/api/ingredients/${id}`, { version: 1, caffeine: 'no' })).status).toBe(404)

      const seen = await mod.get(`/api/ingredients/${id}`)
      expect(seen.status).toBe(200)
      expect(seen.body.ingredient.moderation).toMatchObject({ hiddenBy: { displayName: 'Moni' }, hiddenReason: 'Spam' })
      expect((await mod.get(`/api/ingredients/${id}/revisions`)).status).toBe(200)
      // Bearbeiten bleibt auch Moderatoren verwehrt, bis die Zutat wiederhergestellt ist
      expect((await mod.patch(`/api/ingredients/${id}`, { version: 1, caffeine: 'no' })).status).toBe(404)

      const list = await guest.get(`/api/ingredients?locale=de&q=${encodeURIComponent(name)}`)
      expect(list.body.total).toBe(0)
      const similar = await guest.get(`/api/ingredients/similar?locale=de&name=${encodeURIComponent(name)}`)
      expect(similar.body.items.map((item: { id: string }) => item.id)).not.toContain(id)
    })

    it('gibt den Namen einer ausgeblendeten Zutat frei', async () => {
      const name = `Lavendel ${marker()}`
      await hide('Ingredient', await insertIngredient(name))
      const response = await anna.post('/api/ingredients', { locale: 'de', name })
      expect(response.status, response.text).toBe(201)
    })

    it('lehnt ausgeblendete Zutaten im Tee ab', async () => {
      const id = await insertIngredient(`Malve ${marker()}`)
      await hide('Ingredient', id)
      const response = await anna.post('/api/teas', { locale: 'de', name: `Malventee ${marker()}`, kind: 'blended', ingredients: [{ ingredientId: id }] })
      expect(response.status).toBe(400)
      expect(response.body.error).toMatchObject({ code: 'INGREDIENT_NOT_FOUND', details: { index: 0 } })
    })

    it('leitet zusammengeführte Zutaten per 404 auf das Ziel und lässt die Historie lesbar', async () => {
      const source = await insertIngredient(`Pfeferminze ${marker()}`)
      const target = await insertIngredient(`Pfefferminze ${marker()}`)
      await mergeInto('Ingredient', source, target)

      const detail = await guest.get(`/api/ingredients/${source}`)
      expect(detail.status).toBe(404)
      expect(detail.body.error.details).toEqual({ mergedInto: target })
      const history = await guest.get(`/api/ingredients/${source}?merged=1`)
      expect(history.status).toBe(200)
      expect(history.body.ingredient.mergedInto).toBe(target)
      expect((await guest.get(`/api/ingredients/${source}/revisions`)).status).toBe(200)
      expect((await guest.get(`/api/ingredients/${source}/compare?from=1&to=1`)).status).toBe(200)
      expect((await anna.patch(`/api/ingredients/${source}`, { version: 1, caffeine: 'no' })).status).toBe(404)
      expect((await guest.get(`/api/ingredients/${target}?merged=1`)).body.ingredient.mergedInto).toBeUndefined()
    })

    it('blendet Tees aus Liste, Suche, Ähnlichkeit, „Meine“ und „Enthalten in“ aus', async () => {
      const ingredientId = await insertIngredient(`Rooibos ${marker()}`)
      const name = `Rotbusch ${marker()}`
      const tea = await createTea(anna, { name, ingredients: [{ ingredientId }] })
      await hide('Tea', tea.id)

      expect((await guest.get(`/api/teas/${tea.id}`)).status).toBe(404)
      expect((await anna.get(`/api/teas/${tea.id}`)).status).toBe(404)
      expect((await anna.get(`/api/teas/${tea.id}/revisions`)).status).toBe(404)
      const seen = await mod.get(`/api/teas/${tea.id}`)
      expect(seen.status).toBe(200)
      expect(seen.body.tea.moderation.hiddenReason).toBe('Spam')
      expect((await anna.patch(`/api/teas/${tea.id}`, { version: 1, caffeine: 'no' })).status).toBe(404)

      for (const path of [
        `/api/teas?locale=de&q=${encodeURIComponent(name)}`,
        `/api/teas?locale=de&ingredient=${ingredientId}`,
        `/api/teas?locale=de&mine=1&q=${encodeURIComponent(name)}`,
      ]) {
        expect((await anna.get(path)).body.total, path).toBe(0)
      }
      const similar = await guest.get(`/api/teas/similar?locale=de&name=${encodeURIComponent(name)}`)
      expect(similar.body.items.map((item: { id: string }) => item.id)).not.toContain(tea.id)

      // Der Name ist wieder frei
      await createTea(anna, { name, ingredients: [{ ingredientId }] })
    })

    it('behandelt zusammengeführte Tees wie Zutaten', async () => {
      const ingredientId = await insertIngredient(`Kamille ${marker()}`)
      const source = await createTea(anna, { name: `Kamillentee ${marker()}`, ingredients: [{ ingredientId }] })
      const target = await createTea(anna, { name: `Kamille pur ${marker()}`, ingredients: [{ ingredientId }] })
      await mergeInto('Tea', source.id, target.id)

      const detail = await guest.get(`/api/teas/${source.id}`)
      expect(detail.status).toBe(404)
      expect(detail.body.error.details).toEqual({ mergedInto: target.id })
      expect((await guest.get(`/api/teas/${source.id}?merged=1`)).body.tea.mergedInto).toBe(target.id)
      expect((await guest.get(`/api/teas/${source.id}/revisions`)).status).toBe(200)
      expect((await anna.patch(`/api/teas/${source.id}`, { version: 1, caffeine: 'no' })).status).toBe(404)
    })

    it('verrät private Tees auch mit ?merged=1 nicht', async () => {
      const ingredientId = await insertIngredient(`Salbei ${marker()}`)
      const tea = await createTea(anna, { name: `Salbeitee ${marker()}`, visibility: 'private', ingredients: [{ ingredientId }] })
      expect((await mod.get(`/api/teas/${tea.id}?merged=1`)).status).toBe(404)
      expect((await anna.get(`/api/teas/${tea.id}?merged=1`)).status).toBe(200)
    })
  })
})

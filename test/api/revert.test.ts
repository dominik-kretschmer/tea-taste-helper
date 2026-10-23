import { randomUUID } from 'node:crypto'
import { setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { createClient, db, insertIngredient, registerUser, rootDir, testServerEnv, type TestClient } from './helpers'

const marker = () => randomUUID().slice(0, 8)

describe('Zurücksetzen', async () => {
  await setup({ rootDir, server: true, env: testServerEnv })

  /** Jeder Test mit eigenen Nutzern, damit das gemeinsame Rate-Limit (30/10 min) nicht greift. */
  const user = async (displayName = 'Anna') => (await registerUser({ displayName })).client

  const createIngredient = async (client: TestClient, name: string) => {
    const response = await client.post('/api/ingredients', { locale: 'de', name, caffeine: 'unknown' })
    expect(response.status, response.text).toBe(201)
    return response.body.ingredient as IngredientDetail
  }
  const createTea = async (client: TestClient, body: Record<string, unknown>) => {
    const response = await client.post('/api/teas', { locale: 'de', kind: 'blended', visibility: 'public', ...body })
    expect(response.status, response.text).toBe(201)
    return response.body.tea as TeaDetail
  }
  const ok = <T>(response: { status: number, text: string, body: T }) => {
    expect(response.status, response.text).toBe(200)
    return response.body
  }

  describe('Zutaten', () => {
    it('speichert den Inhalt der Zielversion als neue Version (AK-1.1)', async () => {
      const anna = await user('Anna')
      const ben = await user('Ben')
      const name = `Ingwer ${marker()}`
      const created = await createIngredient(anna, name)
      ok(await ben.patch(`/api/ingredients/${created.id}`, {
        version: 1, caffeine: 'yes', brewTempC: 80, translations: { de: { name: `${name} (falsch)`, description: 'Unsinn' }, en: { name: `Ginger ${marker()}` } },
      }))

      const body = ok(await anna.post(`/api/ingredients/${created.id}/revert`, { version: 2, to: 1, note: 'Vandalismus' })) as { ingredient: IngredientDetail, changed: boolean }
      expect(body.changed).toBe(true)
      expect(body.ingredient).toMatchObject({ version: 3, caffeine: 'unknown', brewTempC: null, translations: { de: { name, description: null } } })
      expect(body.ingredient.translations.en).toBeUndefined()

      const revisions = ok(await anna.get(`/api/ingredients/${created.id}/revisions`)) as Page<RevisionEntry>
      expect(revisions.items[0]).toMatchObject({ version: 3, revertedTo: 1, note: 'Vandalismus', author: { displayName: 'Anna' }, bulkRevertOf: null, mergedIngredient: null })
      expect(revisions.items[1]).toMatchObject({ version: 2, revertedTo: null })

      const [entry] = await db(`SELECT "actorId", details FROM "AuditLog" WHERE event = 'INGREDIENT_REVERTED' AND details->>'ingredientId' = $1`, [created.id])
      expect(entry.details).toEqual({ ingredientId: created.id, version: 3, revertedTo: 1 })
    })

    it('erkennt Konflikte, unveränderte Stände und ungültige Ziele (AK-1.3)', async () => {
      const anna = await user()
      const created = await createIngredient(anna, `Zimt ${marker()}`)
      ok(await anna.patch(`/api/ingredients/${created.id}`, { version: 1, caffeine: 'no' }))
      ok(await anna.patch(`/api/ingredients/${created.id}`, { version: 2, caffeine: 'yes' }))

      const stale = await anna.post(`/api/ingredients/${created.id}/revert`, { version: 2, to: 1 })
      expect(stale.status).toBe(409)
      expect(stale.body.error).toMatchObject({ code: 'EDIT_CONFLICT', details: { currentVersion: 3 } })

      for (const to of [3, 99]) {
        const invalid = await anna.post(`/api/ingredients/${created.id}/revert`, { version: 3, to })
        expect(invalid.status, String(to)).toBe(400)
        expect(invalid.body.error.code).toBe('INVALID_REVERT_TARGET')
      }

      // Version 3 und 1 unterscheiden sich, Version 3 und eine Kopie davon nicht
      ok(await anna.post(`/api/ingredients/${created.id}/revert`, { version: 3, to: 1 }))
      const same = ok(await anna.post(`/api/ingredients/${created.id}/revert`, { version: 4, to: 1 })) as { changed: boolean, ingredient: IngredientDetail }
      expect(same).toMatchObject({ changed: false, ingredient: { version: 4 } })
    })

    it('wendet die Duplikatregel an (AK-1.3)', async () => {
      const anna = await user()
      const name = `Kurkuma ${marker()}`
      const created = await createIngredient(anna, name)
      ok(await anna.patch(`/api/ingredients/${created.id}`, { version: 1, translations: { de: { name: `${name} neu` } } }))
      // Der alte Name ist inzwischen von einer anderen Zutat belegt
      await insertIngredient(name.toLowerCase())
      const response = await anna.post(`/api/ingredients/${created.id}/revert`, { version: 2, to: 1 })
      expect(response.status).toBe(409)
      expect(response.body.error.code).toBe('DUPLICATE_NAME')
    })

    it('verlangt eine Anmeldung (AK-1.6)', async () => {
      const id = await insertIngredient(`Anis ${marker()}`)
      const guest = await createClient()
      expect((await guest.post(`/api/ingredients/${id}/revert`, { version: 1, to: 1 })).status).toBe(401)
    })

    it('zählt zum gemeinsamen Rate-Limit (AK-1.3)', async () => {
      const anna = await user()
      const created = await createIngredient(anna, `Fenchel ${marker()}`) // 1
      let version = 1
      for (let i = 0; i < 28; i++) { // 2–29
        ok(await anna.patch(`/api/ingredients/${created.id}`, { version, brewTempC: 60 + (i % 2) }))
        version++
      }
      ok(await anna.post(`/api/ingredients/${created.id}/revert`, { version, to: 1 })) // 30
      const limited = await anna.post(`/api/ingredients/${created.id}/revert`, { version: version + 1, to: 2 })
      expect(limited.status).toBe(429)
    })
  })

  describe('Tees', () => {
    it('setzt Zutaten mit Reihenfolge und Anteilen zurück (AK-1.1)', async () => {
      const anna = await user()
      const [green, mint, lemon] = await Promise.all([1, 2, 3].map(n => insertIngredient(`Zutat ${n} ${marker()}`)))
      const tea = await createTea(anna, { name: `Morgen ${marker()}`, ingredients: [{ ingredientId: green, percent: 70 }, { ingredientId: mint, percent: 20 }] })
      ok(await anna.patch(`/api/teas/${tea.id}`, { version: 1, ingredients: [{ ingredientId: lemon }, { ingredientId: green, percent: 10 }] }))

      const body = ok(await anna.post(`/api/teas/${tea.id}/revert`, { version: 2, to: 1 })) as { tea: TeaDetail }
      expect(body.tea.version).toBe(3)
      expect(body.tea.ingredients.map(item => [item.ingredientId, item.percent])).toEqual([[green, 70], [mint, 20]])
      const [entry] = await db(`SELECT details FROM "AuditLog" WHERE event = 'TEA_REVERTED' AND details->>'teaId' = $1`, [tea.id])
      expect(entry.details).toEqual({ teaId: tea.id, version: 3, revertedTo: 1, private: false })
    })

    it('lässt öffentliche Tees öffentlich, auch wenn die Zielversion privat war (AK-1.4)', async () => {
      const anna = await user()
      const ingredientId = await insertIngredient(`Melisse ${marker()}`)
      const tea = await createTea(anna, { name: `Abend ${marker()}`, visibility: 'private', ingredients: [{ ingredientId }] })
      ok(await anna.post(`/api/teas/${tea.id}/publish`, { version: 1 }))
      ok(await anna.patch(`/api/teas/${tea.id}`, { version: 2, caffeine: 'no' }))

      const body = ok(await anna.post(`/api/teas/${tea.id}/revert`, { version: 3, to: 1 })) as { tea: TeaDetail }
      expect(body.tea).toMatchObject({ version: 4, visibility: 'public', caffeine: 'unknown' })
    })

    it('lässt private Tees nur den Ersteller zurücksetzen (AK-1.2)', async () => {
      const anna = await user()
      const ben = await user('Ben')
      const ingredientId = await insertIngredient(`Thymian ${marker()}`)
      const tea = await createTea(anna, { name: `Privat ${marker()}`, visibility: 'private', ingredients: [{ ingredientId }] })
      ok(await anna.patch(`/api/teas/${tea.id}`, { version: 1, caffeine: 'yes' }))

      expect((await ben.post(`/api/teas/${tea.id}/revert`, { version: 2, to: 1 })).status).toBe(404)
      expect((await (await createClient()).post(`/api/teas/${tea.id}/revert`, { version: 2, to: 1 })).status).toBe(401)
      ok(await anna.post(`/api/teas/${tea.id}/revert`, { version: 2, to: 1 }))
    })

    it('ersetzt inzwischen zusammengeführte Zutaten durch ihr Ziel (AK-1.5)', async () => {
      const anna = await user()
      const [source, target, other] = await Promise.all([1, 2, 3].map(n => insertIngredient(`Minze ${n} ${marker()}`)))
      const tea = await createTea(anna, { name: `Minztee ${marker()}`, ingredients: [{ ingredientId: source, percent: 30 }, { ingredientId: other }, { ingredientId: target, percent: 20 }] })
      ok(await anna.patch(`/api/teas/${tea.id}`, { version: 1, ingredients: [{ ingredientId: other }] }))
      await db(`UPDATE "Ingredient" SET "mergedIntoId" = $2, "mergedAt" = now() WHERE id = $1`, [source, target])

      const body = ok(await anna.post(`/api/teas/${tea.id}/revert`, { version: 2, to: 1 })) as { tea: TeaDetail }
      expect(body.tea.ingredients.map(item => [item.ingredientId, item.percent])).toEqual([[other, null], [target, 50]])
    })

    it('lehnt Zielversionen mit ausgeblendeter Zutat ab (AK-1.5)', async () => {
      const anna = await user()
      const [hidden, other] = await Promise.all([1, 2].map(n => insertIngredient(`Malve ${n} ${marker()}`)))
      const tea = await createTea(anna, { name: `Malventee ${marker()}`, ingredients: [{ ingredientId: hidden }] })
      ok(await anna.patch(`/api/teas/${tea.id}`, { version: 1, ingredients: [{ ingredientId: other }] }))
      await db(`UPDATE "Ingredient" SET "hiddenAt" = now(), "hiddenReason" = 'Spam' WHERE id = $1`, [hidden])

      const response = await anna.post(`/api/teas/${tea.id}/revert`, { version: 2, to: 1 })
      expect(response.status).toBe(409)
      expect(response.body.error).toMatchObject({ code: 'INGREDIENT_UNAVAILABLE', details: { ingredientId: hidden } })
    })

    it('erkennt Konflikte (AK-1.3)', async () => {
      const anna = await user()
      const ingredientId = await insertIngredient(`Hagebutte ${marker()}`)
      const tea = await createTea(anna, { name: `Hagebuttentee ${marker()}`, ingredients: [{ ingredientId }] })
      ok(await anna.patch(`/api/teas/${tea.id}`, { version: 1, caffeine: 'no' }))
      ok(await anna.patch(`/api/teas/${tea.id}`, { version: 2, caffeine: 'yes' }))
      const stale = await anna.post(`/api/teas/${tea.id}/revert`, { version: 2, to: 1 })
      expect(stale.status).toBe(409)
      expect(stale.body.error).toMatchObject({ code: 'EDIT_CONFLICT', details: { currentVersion: 3 } })
    })
  })
})

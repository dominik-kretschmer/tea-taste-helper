import { randomUUID } from 'node:crypto'
import { setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { createClient, db, insertIngredient, registerUser, rootDir, setRole, testServerEnv, type TestClient } from './helpers'

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

  describe('Massen-Zurücksetzen (AK-7)', () => {
    const plan = (client: TestClient, userId: string, since: Date) =>
      client.get(`/api/admin/users/${userId}/bulk-revert?since=${encodeURIComponent(since.toISOString())}&locale=de`)
    const run = (client: TestClient, userId: string, since: Date) =>
      client.post(`/api/admin/users/${userId}/bulk-revert`, { since: since.toISOString(), locale: 'de' })
    const ids = (items: { entityId: string }[]) => items.map(item => item.entityId).sort()

    it('setzt zurück, blendet Neues aus und überspringt Fremdänderungen – Vorschau gleich Ergebnis (AK-7.1–7.6)', async () => {
      const { client: anna } = await registerUser({ displayName: 'Anna' })
      const { client: vandal, user: vandalUser } = await registerUser({ displayName: 'Vandale' })
      const { client: mod, user: modUser } = await registerUser({ displayName: 'Moni' })
      await setRole(modUser.id, 'moderator')
      const m = marker()

      // Annas Einträge, die der Vandale ändert
      const x = await createIngredient(anna, `Ingwer ${m}`)
      ok(await vandal.patch(`/api/ingredients/${x.id}`, { version: 1, caffeine: 'yes' }))
      // Version 2 liegt vor dem Zeitraum und bleibt
      await db(`UPDATE "IngredientVersion" SET "createdAt" = now() - interval '10 days' WHERE "ingredientId" = $1 AND version = 2`, [x.id])
      const since = new Date(Date.now() - 60_000)
      ok(await vandal.patch(`/api/ingredients/${x.id}`, { version: 2, translations: { de: { name: `Ingwer ${m} kaputt` } } }))
      ok(await vandal.patch(`/api/ingredients/${x.id}`, { version: 3, brewTempC: 40 }))

      const base = await insertIngredient(`Basis ${m}`)
      const tea = await createTea(anna, { name: `Annas Tee ${m}`, ingredients: [{ ingredientId: base }] })
      ok(await vandal.patch(`/api/teas/${tea.id}`, { version: 1, caffeine: 'yes' }))

      // Danach von Anna weiter bearbeitet → überspringen
      const y = await createIngredient(anna, `Zimt ${m}`)
      ok(await vandal.patch(`/api/ingredients/${y.id}`, { version: 1, caffeine: 'yes' }))
      ok(await anna.patch(`/api/ingredients/${y.id}`, { version: 2, caffeine: 'no' }))

      // Neu angelegt: Tee und seine Zutat werden ausgeblendet
      const n = await createIngredient(vandal, `Neukraut ${m}`)
      const newTea = await createTea(vandal, { name: `Spamtee ${m}`, ingredients: [{ ingredientId: n.id }] })
      // Neu, aber in Annas Tee bzw. im privaten Tee des Vandalen verwendet → überspringen
      const z = await createIngredient(vandal, `Fremdgenutzt ${m}`)
      await createTea(anna, { name: `Annas zweiter ${m}`, ingredients: [{ ingredientId: z.id }] })
      const w = await createIngredient(vandal, `Privatgenutzt ${m}`)
      const privateTea = await createTea(vandal, { name: `Privat ${m}`, visibility: 'private', ingredients: [{ ingredientId: w.id }] })

      const preview = await plan(mod, vandalUser.id, since)
      expect(preview.status, preview.text).toBe(200)
      const expected = {
        revert: [x.id, tea.id].sort(),
        hide: [n.id, newTea.id].sort(),
        skip: [y.id, z.id, w.id].sort(),
      }
      expect({ revert: ids(preview.body.revert), hide: ids(preview.body.hide), skip: ids(preview.body.skip) }).toEqual(expected)
      expect(preview.body.revert.find((item: { entityId: string }) => item.entityId === x.id)).toMatchObject({ toVersion: 2, name: `Ingwer ${m} kaputt` })
      expect(Object.fromEntries(preview.body.skip.map((item: { entityId: string, reason: string }) => [item.entityId, item.reason])))
        .toEqual({ [y.id]: 'changed_by_others', [z.id]: 'in_use', [w.id]: 'in_use' })
      // Die Vorschau ändert nichts
      expect((await anna.get(`/api/ingredients/${x.id}`)).body.ingredient.version).toBe(4)

      const result = await run(mod, vandalUser.id, since)
      expect(result.status, result.text).toBe(200)
      expect({ revert: ids(result.body.revert), hide: ids(result.body.hide), skip: ids(result.body.skip) }).toEqual(expected)

      const restored = (await anna.get(`/api/ingredients/${x.id}`)).body.ingredient as IngredientDetail
      expect(restored).toMatchObject({ version: 5, caffeine: 'yes', brewTempC: null, translations: { de: { name: `Ingwer ${m}` } } })
      const [latest] = ((await anna.get(`/api/ingredients/${x.id}/revisions`)).body as RevisionPage).items
      expect(latest).toMatchObject({ author: { displayName: 'Moni' }, revertedTo: 2, bulkRevertOf: { displayName: 'Vandale' }, note: null })
      expect((await anna.get(`/api/teas/${tea.id}`)).body.tea).toMatchObject({ version: 3, caffeine: 'unknown' })

      for (const path of [`/api/ingredients/${n.id}`, `/api/teas/${newTea.id}`]) expect((await anna.get(path)).status, path).toBe(404)
      const [hiddenRow] = await db(`SELECT "hiddenReason" FROM "Tea" WHERE id = $1`, [newTea.id])
      expect(hiddenRow!.hiddenReason).toBe('bulk_revert')
      expect((await anna.get(`/api/ingredients/${y.id}`)).body.ingredient.version).toBe(3)
      expect((await vandal.get(`/api/teas/${privateTea.id}`)).body.tea.version).toBe(1)

      const audits = await db(`SELECT event, "targetId", details FROM "AuditLog" WHERE "actorId" = $1 AND event <> 'USER_REGISTERED'`, [modUser.id])
      expect(audits).toEqual([{ event: 'BULK_REVERT', targetId: vandalUser.id, details: { since: since.toISOString(), reverted: 2, hidden: 2, skipped: 3 } }])
    })

    it('gilt ohne Rate-Limit und nur im Zeitraum (AK-7.5, AK-7.6)', async () => {
      const { user: vandalUser } = await registerUser({ displayName: 'Vielschreiber' })
      const { client: mod, user: modUser } = await registerUser({ displayName: 'Moni' })
      await setRole(modUser.id, 'moderator')
      const created = await Promise.all(Array.from({ length: 32 }, (_, i) => insertIngredient(`Massen ${i} ${marker()}`)))
      await db(`UPDATE "IngredientVersion" SET "authorId" = $2 WHERE "ingredientId" = ANY($1)`, [created, vandalUser.id])
      // Eine Zutat liegt vor dem Zeitraum
      await db(`UPDATE "IngredientVersion" SET "createdAt" = now() - interval '3 days' WHERE "ingredientId" = $1`, [created[0]])

      const result = await run(mod, vandalUser.id, new Date(Date.now() - 24 * 3600_000))
      expect(result.status, result.text).toBe(200)
      expect(result.body.hide).toHaveLength(31)
      expect(ids(result.body.hide)).not.toContain(created[0])
    })

    it('prüft Rechte und Eingaben (AK-0.2)', async () => {
      const guest = await createClient()
      const { client: plain, user: plainUser } = await registerUser()
      const { client: mod, user: modUser } = await registerUser()
      const { user: otherMod } = await registerUser()
      await Promise.all([setRole(modUser.id, 'moderator'), setRole(otherMod.id, 'moderator')])
      const since = new Date(Date.now() - 3600_000)

      for (const client of [guest, plain]) {
        const expected = client === guest ? 401 : 403
        expect((await plan(client, plainUser.id, since)).status).toBe(expected)
        expect((await run(client, plainUser.id, since)).status).toBe(expected)
      }
      // Wie beim Sperren: Moderatoren nicht über andere Moderatoren
      expect((await run(mod, otherMod.id, since)).status).toBe(403)
      expect((await run(mod, '00000000-0000-7000-8000-000000000000', since)).status).toBe(404)
      expect((await run(mod, plainUser.id, new Date(Date.now() + 3600_000))).status).toBe(400)
      expect((await plan(mod, plainUser.id, since)).body).toEqual({ revert: [], hide: [], skip: [] })
    })
  })
})

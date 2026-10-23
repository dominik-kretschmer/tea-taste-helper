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

  describe('Melden und Meldungen (Aufgabe 7)', () => {
    const report = (client: TestClient, body: Record<string, unknown>) =>
      client.post('/api/reports', { entityType: 'ingredient', reason: 'spam', ...body })
    const groupsFor = async (client: TestClient, query: string, entityId: string) => {
      const response = await client.get(`/api/admin/reports?${query}`)
      expect(response.status, response.text).toBe(200)
      return (response.body as Page<ReportGroup>).items.filter(group => group.entityId === entityId)
    }

    it('nimmt Meldungen an und verhindert eine zweite offene Meldung (AK-2.1, AK-2.3, AK-2.4)', async () => {
      const { client } = await registerUser({ displayName: 'Melder' })
      const id = await insertIngredient(`Spamkraut ${marker()}`)
      const first = await report(client, { entityId: id, reason: 'other', comment: 'Werbung im Namen' })
      expect(first.status, first.text).toBe(201)
      expect((await guest.get(`/api/ingredients/${id}`)).status).toBe(200)

      const second = await report(client, { entityId: id, reason: 'spam' })
      expect(second.status).toBe(409)
      expect(second.body.error.code).toBe('ALREADY_REPORTED')

      // Nach dem Abschließen darf derselbe Nutzer erneut melden
      expect((await mod.post('/api/admin/reports/resolve', { entityType: 'ingredient', entityId: id, status: 'rejected' })).status).toBe(200)
      expect((await report(client, { entityId: id, reason: 'spam' })).status).toBe(201)

      const [entry] = await db(`SELECT "actorId", details FROM "AuditLog" WHERE event = 'REPORT_CREATED' AND details->>'reportId' = $1`, [first.body.id])
      expect(entry.details).toEqual({ reportId: first.body.id, entityType: 'ingredient', entityId: id, reason: 'other' })
    })

    it('prüft Gründe, Kommentar und Original (AK-2.1, AK-2.2)', async () => {
      const id = await insertIngredient(`Prüfkraut ${marker()}`)
      const original = await insertIngredient(`Prüfkraut Original ${marker()}`)
      const ingredientId = await insertIngredient(`Teezutat ${marker()}`)
      const tea = await createTea(anna, { name: `Prüftee ${marker()}`, ingredients: [{ ingredientId }] })

      const missingComment = await report(anna, { entityId: id, reason: 'other' })
      expect(missingComment.status).toBe(400)
      expect(missingComment.body.error.details).toHaveProperty('comment')
      expect((await report(anna, { entityId: id, reason: 'duplicate' })).status).toBe(400)
      expect((await report(anna, { entityId: id, reason: 'duplicate', duplicateOfId: id })).status).toBe(400)
      // Original muss dieselbe Art haben
      expect((await report(anna, { entityId: id, reason: 'duplicate', duplicateOfId: tea.id })).status).toBe(400)
      expect((await report(anna, { entityId: id, reason: 'duplicate', duplicateOfId: original })).status).toBe(201)
    })

    it('lässt private, ausgeblendete und zusammengeführte Einträge nicht melden (AK-2.6)', async () => {
      const ingredientId = await insertIngredient(`Geheimkraut ${marker()}`)
      const privateTea = await createTea(anna, { name: `Geheim ${marker()}`, visibility: 'private', ingredients: [{ ingredientId }] })
      const hidden = await insertIngredient(`Versteckt ${marker()}`)
      await hide('Ingredient', hidden)
      const merged = await insertIngredient(`Doppelt ${marker()}`)
      await mergeInto('Ingredient', merged, ingredientId)

      expect((await report(anna, { entityType: 'tea', entityId: privateTea.id })).status).toBe(404)
      expect((await report(anna, { entityId: hidden })).status).toBe(404)
      expect((await report(anna, { entityId: merged })).status).toBe(404)
      expect((await report(anna, { entityId: randomUUID() })).status).toBe(404)
      expect((await report(guest, { entityId: ingredientId })).status).toBe(401)
    })

    it('begrenzt auf 10 Meldungen pro Stunde (AK-2.5)', async () => {
      const { client } = await registerUser()
      const ids = await Promise.all(Array.from({ length: 11 }, (_, n) => insertIngredient(`Massenkraut ${n} ${marker()}`)))
      for (const id of ids.slice(0, 10)) expect((await report(client, { entityId: id })).status).toBe(201)
      const limited = await report(client, { entityId: ids[10] })
      expect(limited.status).toBe(429)
      expect(limited.headers.get('retry-after')).toBeTruthy()
    })

    it('gruppiert offene Meldungen je Eintrag mit Melder, Original und letztem Autor (AK-3.1)', async () => {
      const [r1, r2] = await Promise.all([registerUser({ displayName: 'Rita' }), registerUser({ displayName: 'Rolf' })])
      const name = `Gruppenkraut ${marker()}`
      const created = await anna.post('/api/ingredients', { locale: 'de', name })
      const id = created.body.ingredient.id as string
      const original = await insertIngredient(`Gruppenkraut Original ${marker()}`)
      await report(r1.client, { entityId: id, reason: 'wrong_info', comment: 'Koffein stimmt nicht' })
      await report(r2.client, { entityId: id, reason: 'duplicate', duplicateOfId: original })

      const [group] = await groupsFor(mod, 'status=open&type=ingredient&locale=de', id)
      expect(group).toMatchObject({ entityType: 'ingredient', name, state: 'active', count: 2, lastAuthor: { displayName: 'Anna' } })
      expect(group!.reports.map(item => [item.reason, item.reporter?.displayName, item.comment])).toEqual([
        ['wrong_info', 'Rita', 'Koffein stimmt nicht'],
        ['duplicate', 'Rolf', null],
      ])
      expect(group!.reports[1]!.duplicateOf).toEqual({ id: original, name: expect.stringContaining('Original') })
      expect(JSON.stringify(group)).not.toContain('@')

      // Filter: Grund und Art
      expect((await groupsFor(mod, 'status=open&reason=duplicate', id))[0]!.reports).toHaveLength(1)
      expect(await groupsFor(mod, 'status=open&reason=spam', id)).toEqual([])
      expect(await groupsFor(mod, 'status=open&type=tea', id)).toEqual([])
    })

    it('sortiert offene Gruppen nach der ältesten Meldung (AK-3.1)', async () => {
      const [older, newer] = [await insertIngredient(`Alt ${marker()}`), await insertIngredient(`Neu ${marker()}`)]
      await report(anna, { entityId: newer })
      await report(anna, { entityId: older })
      await db(`UPDATE "Report" SET "createdAt" = now() - interval '400 days' WHERE "entityId" = $1`, [older])
      const items = (await mod.get('/api/admin/reports?status=open')).body.items as ReportGroup[]
      const ids = items.map(group => group.entityId)
      expect(ids.indexOf(older)).toBeGreaterThanOrEqual(0)
      expect(ids.indexOf(older)).toBeLessThan(ids.includes(newer) ? ids.indexOf(newer) : Infinity)
      expect(items[0]!.entityId).toBe(older)
    })

    it('schließt Meldungen ab und zählt für das Badge Einträge, nicht Meldungen (AK-3.3, AK-3.5)', async () => {
      const [r1, r2] = await Promise.all([registerUser(), registerUser()])
      const id = await insertIngredient(`Badgekraut ${marker()}`)
      const before = (await mod.get('/api/admin/reports/count')).body.open as number
      await report(r1.client, { entityId: id })
      await report(r2.client, { entityId: id })
      expect((await mod.get('/api/admin/reports/count')).body.open).toBe(before + 1)

      const resolved = await mod.post('/api/admin/reports/resolve', { entityType: 'ingredient', entityId: id, status: 'resolved', note: 'Name korrigiert' })
      expect(resolved.status, resolved.text).toBe(200)
      expect(resolved.body.closed).toBe(2)
      expect((await mod.get('/api/admin/reports/count')).body.open).toBe(before)
      expect(await groupsFor(mod, 'status=open', id)).toEqual([])

      const [closed] = await groupsFor(mod, 'status=closed', id)
      expect(closed!.reports.every(item => item.status === 'resolved' && item.resolvedBy?.displayName === 'Moni' && item.resolutionNote === 'Name korrigiert')).toBe(true)

      const again = await mod.post('/api/admin/reports/resolve', { entityType: 'ingredient', entityId: id, status: 'resolved' })
      expect(again.status).toBe(404)
      const [entry] = await db(`SELECT details FROM "AuditLog" WHERE event = 'REPORT_RESOLVED' AND details->>'entityId' = $1`, [id])
      expect(entry.details).toEqual({ entityType: 'ingredient', entityId: id, status: 'resolved', count: 2 })
    })

    it('meldet öffentliche Tees (AK-2.1)', async () => {
      const ingredientId = await insertIngredient(`Teekraut ${marker()}`)
      const tea = await createTea(anna, { name: `Meldetee ${marker()}`, ingredients: [{ ingredientId }] })
      const { client } = await registerUser()
      expect((await report(client, { entityType: 'tea', entityId: tea.id })).status).toBe(201)
      const [group] = await groupsFor(mod, 'status=open&type=tea', tea.id)
      expect(group).toMatchObject({ entityType: 'tea', count: 1, lastAuthor: { displayName: 'Anna' } })
    })

    it('schützt die Moderationsrouten (AK-0.2)', async () => {
      for (const [method, path] of [['GET', '/api/admin/reports'], ['GET', '/api/admin/reports/count'], ['POST', '/api/admin/reports/resolve']] as const) {
        expect((await guest.request(method, path, method === 'POST' ? {} : undefined)).status, path).toBe(401)
        expect((await anna.request(method, path, method === 'POST' ? {} : undefined)).status, path).toBe(403)
      }
    })
  })

  describe('Ausblenden und Wiederherstellen (Aufgabe 8)', () => {
    const hideVia = (client: TestClient, type: 'ingredients' | 'teas', id: string, reason = 'Spam-Eintrag') =>
      client.post(`/api/admin/${type}/${id}/hide`, { reason })
    const restoreVia = (client: TestClient, type: 'ingredients' | 'teas', id: string) => client.post(`/api/admin/${type}/${id}/restore`)

    it('blendet eine Zutat aus, schließt Meldungen und hält das Ereignis fest (AK-5.1, AK-3.4, AK-5.6)', async () => {
      const id = await insertIngredient(`Werbekraut ${marker()}`)
      expect((await anna.post('/api/reports', { entityType: 'ingredient', entityId: id, reason: 'spam' })).status).toBe(201)

      expect((await hideVia(mod, 'ingredients', id, '  ')).status).toBe(400)
      const hidden = await hideVia(mod, 'ingredients', id)
      expect(hidden.status, hidden.text).toBe(204)
      expect((await guest.get(`/api/ingredients/${id}`)).status).toBe(404)
      expect((await hideVia(mod, 'ingredients', id)).status).toBe(404)

      const [reportRow] = await db(`SELECT status, "resolvedById" FROM "Report" WHERE "entityId" = $1`, [id])
      expect(reportRow).toEqual({ status: 'resolved', resolvedById: modId })

      const forMod = (await mod.get(`/api/ingredients/${id}/revisions`)).body as RevisionPage
      expect(forMod.events).toEqual([expect.objectContaining({ kind: 'hidden', actor: { displayName: 'Moni' }, reason: 'Spam-Eintrag' })])

      const [entry] = await db(`SELECT details FROM "AuditLog" WHERE event = 'INGREDIENT_HIDDEN' AND details->>'ingredientId' = $1`, [id])
      expect(entry.details).toEqual({ ingredientId: id, reason: 'Spam-Eintrag' })
    })

    it('lehnt das Ausblenden verwendeter Zutaten ab (AK-5.2)', async () => {
      const id = await insertIngredient(`Gebraucht ${marker()}`)
      await createTea(anna, { name: `Öffentlich ${marker()}`, ingredients: [{ ingredientId: id }] })
      await createTea(anna, { name: `Privat ${marker()}`, visibility: 'private', ingredients: [{ ingredientId: id }] })
      const response = await hideVia(mod, 'ingredients', id)
      expect(response.status).toBe(409)
      expect(response.body.error).toMatchObject({ code: 'INGREDIENT_IN_USE', details: { teas: 2 } })
    })

    it('blendet öffentliche Tees aus, private nicht (AK-5.1)', async () => {
      const ingredientId = await insertIngredient(`Tee-Zutat ${marker()}`)
      const publicTea = await createTea(anna, { name: `Ausblendtee ${marker()}`, ingredients: [{ ingredientId }] })
      const privateTea = await createTea(anna, { name: `Privattee ${marker()}`, visibility: 'private', ingredients: [{ ingredientId }] })
      expect((await hideVia(mod, 'teas', privateTea.id)).status).toBe(404)
      expect((await hideVia(mod, 'teas', publicTea.id)).status).toBe(204)
      expect((await anna.get(`/api/teas/${publicTea.id}`)).status).toBe(404)
      expect((await hideVia(mod, 'unknown' as 'teas', publicTea.id)).status).toBe(404)
      // Das Löschen eigener privater Tees bleibt endgültig und unberührt (AK-5.7)
      expect((await anna.request('DELETE', `/api/teas/${privateTea.id}`)).status).toBe(204)
    })

    it('listet Ausgeblendetes zuletzt ausgeblendet zuerst (AK-5.4)', async () => {
      const first = await insertIngredient(`Erstes ${marker()}`)
      const second = await insertIngredient(`Zweites ${marker()}`)
      await hideVia(mod, 'ingredients', first, 'Grund eins')
      await hideVia(mod, 'ingredients', second, 'Grund zwei')
      const response = await mod.get('/api/admin/hidden?type=ingredient&locale=de')
      expect(response.status).toBe(200)
      const items = (response.body as Page<HiddenEntry>).items
      const ids = items.map(item => item.entityId)
      expect(ids.indexOf(second)).toBeLessThan(ids.indexOf(first))
      expect(items.find(item => item.entityId === second)).toMatchObject({ entityType: 'ingredient', hiddenReason: 'Grund zwei', hiddenBy: { displayName: 'Moni' }, name: expect.stringContaining('Zweites') })
      expect(((await mod.get('/api/admin/hidden?type=tea')).body as Page<HiddenEntry>).items.every(item => item.entityType === 'tea')).toBe(true)
    })

    it('stellt unverändert wieder her und prüft Duplikate (AK-5.5, AK-5.6)', async () => {
      const name = `Wiederkraut ${marker()}`
      const id = await insertIngredient(name)
      await hideVia(mod, 'ingredients', id)
      expect((await restoreVia(mod, 'ingredients', id)).status).toBe(204)
      const detail = await guest.get(`/api/ingredients/${id}`)
      expect(detail.status).toBe(200)
      expect(detail.body.ingredient).toMatchObject({ version: 1, translations: { de: { name } } })
      expect((await restoreVia(mod, 'ingredients', id)).status).toBe(404)

      const forGuest = (await guest.get(`/api/ingredients/${id}/revisions`)).body as RevisionPage
      expect(forGuest.events.map(event => event.kind)).toEqual(['hidden', 'restored'])
      expect(forGuest.events[0]).not.toHaveProperty('reason')

      // Während der Ausblendung wurde der Name neu vergeben
      await hideVia(mod, 'ingredients', id)
      const other = await anna.post('/api/ingredients', { locale: 'de', name })
      expect(other.status).toBe(201)
      const duplicate = await restoreVia(mod, 'ingredients', id)
      expect(duplicate.status).toBe(409)
      expect(duplicate.body.error).toMatchObject({ code: 'DUPLICATE_NAME', details: { ingredientId: other.body.ingredient.id } })
    })

    it('stellt Tees wieder her (AK-5.5)', async () => {
      const ingredientId = await insertIngredient(`Wiederteezutat ${marker()}`)
      const tea = await createTea(anna, { name: `Wiedertee ${marker()}`, ingredients: [{ ingredientId }] })
      await hideVia(mod, 'teas', tea.id)
      expect((await restoreVia(mod, 'teas', tea.id)).status).toBe(204)
      expect((await guest.get(`/api/teas/${tea.id}`)).status).toBe(200)
      const [entry] = await db(`SELECT event FROM "AuditLog" WHERE event = 'TEA_RESTORED' AND details->>'teaId' = $1`, [tea.id])
      expect(entry).toBeTruthy()
    })

    it('zählt ausgeblendete Tees nicht, stellt sie aber nur mit aktiven Zutaten wieder her (AK-5.2, AK-5.5)', async () => {
      const id = await insertIngredient(`Nur im Spam ${marker()}`)
      const tea = await createTea(anna, { name: `Spamtee ${marker()}`, ingredients: [{ ingredientId: id }] })
      expect((await hideVia(mod, 'teas', tea.id)).status).toBe(204)
      expect((await hideVia(mod, 'ingredients', id)).status).toBe(204)
      const restore = await restoreVia(mod, 'teas', tea.id)
      expect(restore.status).toBe(409)
      expect(restore.body.error).toMatchObject({ code: 'INGREDIENT_UNAVAILABLE', details: { ingredientId: id } })
      expect((await restoreVia(mod, 'ingredients', id)).status).toBe(204)
      expect((await restoreVia(mod, 'teas', tea.id)).status).toBe(204)
    })

    it('lässt Ausblenden und Tee-Speichern derselben Zutat nicht beide gelingen (AK-5.2)', async () => {
      for (let round = 0; round < 3; round++) {
        const { client } = await registerUser()
        const id = await insertIngredient(`Wettlauf ${round} ${marker()}`)
        const [hideResult, teaResult] = await Promise.all([
          hideVia(mod, 'ingredients', id),
          client.post('/api/teas', { locale: 'de', kind: 'blended', name: `Wettlauftee ${marker()}`, ingredients: [{ ingredientId: id }] }),
        ])
        const outcomes = [hideResult.status, teaResult.status].sort()
        expect([[204, 400], [201, 409]]).toContainEqual(outcomes)
      }
    })

    it('schützt die Routen (AK-0.2)', async () => {
      const id = await insertIngredient(`Schutzkraut ${marker()}`)
      for (const [method, path] of [
        ['POST', `/api/admin/ingredients/${id}/hide`],
        ['POST', `/api/admin/ingredients/${id}/restore`],
        ['GET', '/api/admin/hidden'],
      ] as const) {
        const body = method === 'POST' ? { reason: 'x' } : undefined
        expect((await guest.request(method, path, body)).status, path).toBe(401)
        expect((await anna.request(method, path, body)).status, path).toBe(403)
      }
    })
  })

  describe('Zusammenführen (Aufgabe 9)', () => {
    const mergeVia = (client: TestClient, type: 'ingredients' | 'teas', source: string, targetId: string) =>
      client.post(`/api/admin/${type}/${source}/merge`, { targetId })
    const ingredientsOf = async (teaId: string, client: TestClient = anna) =>
      ((await client.get(`/api/teas/${teaId}`)).body.tea as TeaDetail).ingredients.map(item => [item.ingredientId, item.percent])

    it('zeigt eine Vorschau mit betroffenen Tees und fehlenden Übersetzungen (AK-4.1, AK-4.5)', async () => {
      const { client: ben } = await registerUser({ displayName: 'Ben' })
      const source = await insertIngredient(`Vorschau ${marker()}`)
      const target = await insertIngredient(`Vorschau Ziel ${marker()}`)
      await db(`INSERT INTO "IngredientVersionTranslation" ("versionId", locale, name, "nameKey")
                SELECT id, 'en', 'Preview', 'preview' FROM "IngredientVersion" WHERE "ingredientId" = $1 AND "isCurrent"`, [source])
      await createTea(ben, { name: `Vorschautee ${marker()}`, ingredients: [{ ingredientId: source }] })
      await createTea(ben, { name: `Vorschau privat ${marker()}`, visibility: 'private', ingredients: [{ ingredientId: source }] })

      const preview = await mod.get(`/api/admin/ingredients/${source}/merge?target=${target}`)
      expect(preview.status, preview.text).toBe(200)
      expect(preview.body).toMatchObject({ source: { id: source }, target: { id: target }, teas: { public: 1, private: 1 }, missingTranslations: ['en'] })
      expect(JSON.stringify(preview.body)).not.toContain('Vorschau privat')

      expect((await mod.get(`/api/admin/ingredients/${source}/merge?target=${source}`)).status).toBe(400)
      expect((await mod.get(`/api/admin/ingredients/${source}/merge?target=${randomUUID()}`)).status).toBe(400)
      expect((await mod.get(`/api/admin/ingredients/${randomUUID()}/merge?target=${target}`)).status).toBe(404)
    })

    it('stellt alle Tees auf das Ziel um und leitet die Quelle weiter (AK-4.2–4.4)', async () => {
      const { client: ben } = await registerUser({ displayName: 'Ben' })
      const name = `Pfeferminze ${marker()}`
      const source = await insertIngredient(name)
      const target = await insertIngredient(`Pfefferminze ${marker()}`)
      const other = await insertIngredient(`Zitrone ${marker()}`)
      const onlySource = await createTea(ben, { name: `Nur Quelle ${marker()}`, ingredients: [{ ingredientId: other, percent: 50 }, { ingredientId: source, percent: 30 }] })
      const both = await createTea(ben, { name: `Beide ${marker()}`, ingredients: [{ ingredientId: source, percent: 20 }, { ingredientId: other }, { ingredientId: target, percent: 30 }] })
      const privateTea = await createTea(ben, { name: `Privat ${marker()}`, visibility: 'private', ingredients: [{ ingredientId: source }] })
      expect((await anna.post('/api/reports', { entityType: 'ingredient', entityId: source, reason: 'duplicate', duplicateOfId: target })).status).toBe(201)

      const response = await mergeVia(mod, 'ingredients', source, target)
      expect(response.status, response.text).toBe(200)
      expect(response.body).toEqual({ targetId: target, teasChanged: 3 })

      expect(await ingredientsOf(onlySource.id)).toEqual([[other, 50], [target, 30]])
      expect(await ingredientsOf(both.id)).toEqual([[other, null], [target, 50]])
      expect(await ingredientsOf(privateTea.id, ben)).toEqual([[target, null]])

      // Neue Version vom Moderator, gekennzeichnet; die alte bleibt unverändert
      const revisions = (await guest.get(`/api/teas/${onlySource.id}/revisions`)).body as RevisionPage
      expect(revisions.items[0]).toMatchObject({ version: 2, author: { displayName: 'Moni' }, note: null, mergedIngredient: { id: source, mergedInto: target } })
      const compare = await guest.get(`/api/teas/${onlySource.id}/compare?from=1&to=2`)
      expect(compare.body.from.snapshot.ingredients).toEqual([{ ingredientId: other, percent: 50 }, { ingredientId: source, percent: 30 }])
      expect(compare.body.ingredients[source]).toMatchObject({ mergedInto: target })

      // Quelle: 404 mit Ziel, nicht mehr in Liste/Suche/Ähnlichkeit, Historie lesbar
      const detail = await guest.get(`/api/ingredients/${source}`)
      expect(detail.status).toBe(404)
      expect(detail.body.error.details).toEqual({ mergedInto: target })
      expect((await guest.get(`/api/ingredients?locale=de&q=${encodeURIComponent(name)}`)).body.total).toBe(0)
      expect((await guest.get(`/api/ingredients/similar?locale=de&name=${encodeURIComponent(name)}`)).body.items.map((item: { id: string }) => item.id)).not.toContain(source)
      const history = (await guest.get(`/api/ingredients/${source}/revisions`)).body as RevisionPage
      expect(history.events).toEqual([expect.objectContaining({ kind: 'merged', mergedInto: target })])

      const [reportRow] = await db(`SELECT status FROM "Report" WHERE "entityId" = $1`, [source])
      expect(reportRow!.status).toBe('resolved')
      const [entry] = await db(`SELECT details FROM "AuditLog" WHERE event = 'INGREDIENT_MERGED' AND details->>'sourceId' = $1`, [source])
      expect(entry.details).toEqual({ sourceId: source, targetId: target, teasChanged: 3, privateTeasChanged: 1 })
      const [{ count }] = await db(`SELECT count(*)::int AS count FROM "AuditLog" WHERE event = 'TEA_UPDATED' AND details->>'teaId' = ANY($1)`, [[onlySource.id, both.id, privateTea.id]])
      expect(count).toBe(0)
    })

    it('biegt frühere Quellen auf das neue Ziel um (AK-4.2)', async () => {
      const [a, b, c] = await Promise.all(['A', 'B', 'C'].map(n => insertIngredient(`Kette ${n} ${marker()}`)))
      expect((await mergeVia(mod, 'ingredients', a, b)).status).toBe(200)
      expect((await mergeVia(mod, 'ingredients', b, c)).status).toBe(200)
      expect((await guest.get(`/api/ingredients/${a}`)).body.error.details).toEqual({ mergedInto: c })
    })

    it('lehnt ungültige Paare ab (AK-4.1, AK-4.6)', async () => {
      const [a, b, hidden] = await Promise.all([1, 2, 3].map(n => insertIngredient(`Paar ${n} ${marker()}`)))
      await hide('Ingredient', hidden)
      expect((await mergeVia(mod, 'ingredients', a, a)).status).toBe(400)
      expect((await mergeVia(mod, 'ingredients', a, hidden)).status).toBe(400)
      expect((await mergeVia(mod, 'ingredients', hidden, a)).status).toBe(400)
      expect((await mergeVia(mod, 'ingredients', a, b)).status).toBe(200)
      // Endgültig: eine zusammengeführte Quelle lässt sich nicht erneut zusammenführen
      expect((await mergeVia(mod, 'ingredients', a, b)).status).toBe(400)
      expect((await mergeVia(mod, 'ingredients', b, a)).status).toBe(400)
    })

    it('verliert keine gleichzeitige Tee-Änderung (AK-4.7)', async () => {
      for (let round = 0; round < 3; round++) {
        const { client: ben } = await registerUser({ displayName: 'Ben' })
        const [source, target] = await Promise.all([1, 2].map(n => insertIngredient(`Parallel ${round} ${n} ${marker()}`)))
        const tea = await createTea(ben, { name: `Paralleltee ${round} ${marker()}`, ingredients: [{ ingredientId: source }] })
        const [merged, edited] = await Promise.all([
          mergeVia(mod, 'ingredients', source, target),
          ben.patch(`/api/teas/${tea.id}`, { version: 1, caffeine: 'yes' }),
        ])
        expect(merged.status, merged.text).toBe(200)
        expect([200, 409]).toContain(edited.status)
        const detail = (await ben.get(`/api/teas/${tea.id}`)).body.tea as TeaDetail
        // Die Zusammenführung greift immer; die Änderung bleibt erhalten oder wurde sichtbar abgelehnt
        expect(detail.ingredients.map(item => item.ingredientId)).toEqual([target])
        expect(detail.caffeine).toBe(edited.status === 200 ? 'yes' : 'unknown')
      }
    })

    it('führt öffentliche Tees zusammen (AK-4.2)', async () => {
      const ingredientId = await insertIngredient(`Teepaar ${marker()}`)
      const source = await createTea(anna, { name: `Earl Grey ${marker()}`, ingredients: [{ ingredientId }] })
      const target = await createTea(anna, { name: `Earl Gray ${marker()}`, ingredients: [{ ingredientId }] })
      const privateTea = await createTea(anna, { name: `Earl privat ${marker()}`, visibility: 'private', ingredients: [{ ingredientId }] })
      expect((await mergeVia(mod, 'teas', privateTea.id, target.id)).status).toBe(404)
      expect((await mergeVia(mod, 'teas', source.id, privateTea.id)).status).toBe(400)

      const response = await mergeVia(mod, 'teas', source.id, target.id)
      expect(response.status, response.text).toBe(200)
      expect((await guest.get(`/api/teas/${source.id}`)).body.error.details).toEqual({ mergedInto: target.id })
      expect((await guest.get(`/api/teas?locale=de&ingredient=${ingredientId}`)).body.items.map((item: { id: string }) => item.id)).toEqual([target.id])
      const [entry] = await db(`SELECT details FROM "AuditLog" WHERE event = 'TEA_MERGED' AND details->>'sourceId' = $1`, [source.id])
      expect(entry.details).toEqual({ sourceId: source.id, targetId: target.id })
    })

    it('schützt die Routen (AK-0.2)', async () => {
      const [a, b] = await Promise.all([1, 2].map(n => insertIngredient(`Schutz ${n} ${marker()}`)))
      for (const [method, path] of [['GET', `/api/admin/ingredients/${a}/merge?target=${b}`], ['POST', `/api/admin/ingredients/${a}/merge`]] as const) {
        const body = method === 'POST' ? { targetId: b } : undefined
        expect((await guest.request(method, path, body)).status, path).toBe(401)
        expect((await anna.request(method, path, body)).status, path).toBe(403)
      }
    })
  })
})

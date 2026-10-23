import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { publishTeaSchema, teaListQuerySchema, createTeaSchema, updateTeaSchema } from '../../shared/schemas/tea'
import type { TeaSnapshot } from '../../shared/types/tea'
import { diffTeaSnapshots, remainingPercent } from '../../shared/utils/tea'

const ids = Array.from({ length: 21 }, () => randomUUID())
const refs = (count: number, percent: number | null = null) => ids.slice(0, count).map(ingredientId => ({ ingredientId, percent }))
const base = { locale: 'de', name: 'Morgentee', kind: 'blended', ingredients: refs(1) } as const

describe('createTeaSchema', () => {
  it('setzt Standardwerte: privat, ohne Anteil', () => {
    expect(createTeaSchema.parse(base)).toMatchObject({
      visibility: 'private', brand: null, caffeine: 'unknown', brewTempC: null, brewSeconds: null, note: null,
      ingredients: [{ ingredientId: ids[0], percent: null }],
    })
  })

  it.each([[0, false], [1, true], [20, true], [21, false]])('%i Zutaten → gültig: %s', (count, ok) => {
    expect(createTeaSchema.safeParse({ ...base, ingredients: refs(count) }).success).toBe(ok)
  })

  it.each([[0, false], [1, true], [100, true], [101, false], [12.5, false]])('Anteil %d → gültig: %s', (percent, ok) => {
    expect(createTeaSchema.safeParse({ ...base, ingredients: [{ ingredientId: ids[0], percent }] }).success).toBe(ok)
  })

  it.each([[[60, 40], true], [[60, 41], false], [[70, null], true]])('Anteile %j → gültig: %s', (percents, ok) => {
    const ingredients = percents.map((percent, index) => ({ ingredientId: ids[index], percent }))
    expect(createTeaSchema.safeParse({ ...base, ingredients }).success).toBe(ok)
  })

  it('meldet Listenfehler am Zutatenfeld mit Schlüssel', () => {
    const duplicate = createTeaSchema.safeParse({ ...base, ingredients: [refs(1)[0], refs(1)[0]] })
    expect(duplicate.error?.issues).toEqual([expect.objectContaining({ path: ['ingredients'], message: 'duplicateIngredient' })])
    const sum = createTeaSchema.safeParse({ ...base, ingredients: refs(2, 60) })
    expect(sum.error?.issues).toEqual([expect.objectContaining({ path: ['ingredients'], message: 'percentSum' })])
  })

  it('behält die Marke nur bei gekauften Tees', () => {
    expect(createTeaSchema.parse({ ...base, kind: 'bought', brand: ' Teekanne ' }).brand).toBe('Teekanne')
    expect(createTeaSchema.parse({ ...base, kind: 'blended', brand: 'Teekanne' }).brand).toBeNull()
  })

  it.each([[80, true], [81, false]])('Marke mit %i Zeichen → gültig: %s', (length, ok) => {
    expect(createTeaSchema.safeParse({ ...base, kind: 'bought', brand: 'x'.repeat(length) }).success).toBe(ok)
  })

  it('verlangt eine bekannte Art', () => {
    expect(createTeaSchema.safeParse({ ...base, kind: undefined }).success).toBe(false)
    expect(createTeaSchema.safeParse({ ...base, kind: 'gift' }).success).toBe(false)
  })
})

describe('updateTeaSchema', () => {
  it('lehnt Sichtbarkeit und andere unbekannte Felder ab (AK-4.3)', () => {
    expect(updateTeaSchema.safeParse({ version: 2, visibility: 'private' }).success).toBe(false)
    expect(updateTeaSchema.safeParse({ version: 2, ownerId: randomUUID() }).success).toBe(false)
  })

  it('erlaubt Teil-Änderungen und eine neue Zutatenliste', () => {
    expect(updateTeaSchema.parse({ version: 2, ingredients: refs(2, 50) })).toEqual({ version: 2, ingredients: refs(2, 50), note: null })
  })

  it('prüft die Zutatenliste wie beim Anlegen', () => {
    expect(updateTeaSchema.safeParse({ version: 2, ingredients: [] }).success).toBe(false)
  })
})

describe('weitere Schemas', () => {
  it('Veröffentlichen verlangt die Version', () => {
    expect(publishTeaSchema.safeParse({}).success).toBe(false)
    expect(publishTeaSchema.parse({ version: 3 })).toEqual({ version: 3, note: null })
  })

  it('Liste: mine als Text, Zutat als UUID', () => {
    expect(teaListQuerySchema.parse({ locale: 'de', mine: '1' })).toMatchObject({ mine: true, page: 1 })
    expect(teaListQuerySchema.safeParse({ locale: 'de', ingredient: 'abc' }).success).toBe(false)
  })
})

const snapshot = (overrides: Partial<TeaSnapshot> = {}): TeaSnapshot => ({
  sourceLocale: 'de',
  visibility: 'private',
  kind: 'blended',
  brand: null,
  caffeine: 'unknown',
  brewTempC: null,
  brewSeconds: null,
  translations: { de: { name: 'Morgentee', description: null } },
  ingredients: [{ ingredientId: ids[0]!, percent: 60 }, { ingredientId: ids[1]!, percent: null }],
  ...overrides,
})

describe('diffTeaSnapshots', () => {
  it('liefert keine Änderung für gleiche Stände', () => {
    expect(diffTeaSnapshots(snapshot(), snapshot())).toEqual([])
  })

  it('erkennt Art, Marke und Sichtbarkeit', () => {
    expect(diffTeaSnapshots(snapshot(), snapshot({ kind: 'bought', brand: 'Teekanne', visibility: 'public' }))).toEqual([
      { field: 'kind', from: 'blended', to: 'bought' },
      { field: 'brand', from: null, to: 'Teekanne' },
      { field: 'visibility', from: 'private', to: 'public' },
    ])
  })

  it('erkennt hinzugefügte, entfernte, verschobene Zutaten und geänderte Anteile', () => {
    const after = snapshot({ ingredients: [{ ingredientId: ids[1]!, percent: 30 }, { ingredientId: ids[2]!, percent: null }] })
    expect(diffTeaSnapshots(snapshot(), after)).toEqual([
      { field: 'ingredient', ingredientId: ids[1], from: { position: 1, percent: null }, to: { position: 0, percent: 30 } },
      { field: 'ingredient', ingredientId: ids[2], from: null, to: { position: 1, percent: null } },
      { field: 'ingredient', ingredientId: ids[0], from: { position: 0, percent: 60 }, to: null },
    ])
  })

  it('erkennt Text- und Grundfeldänderungen wie bei Zutaten', () => {
    const after = snapshot({ caffeine: 'yes', translations: { de: { name: 'Morgentee', description: null }, en: { name: 'Morning tea', description: null } } })
    expect(diffTeaSnapshots(snapshot(), after)).toEqual([
      { field: 'caffeine', from: 'unknown', to: 'yes' },
      { field: 'name', locale: 'en', from: null, to: 'Morning tea' },
    ])
  })
})

describe('remainingPercent', () => {
  it.each([[[60, null], 40], [[50, 50], 0], [[null, null], 100]])('%j → %i', (percents, rest) => {
    expect(remainingPercent(percents.map(percent => ({ percent })))).toBe(rest)
  })
})

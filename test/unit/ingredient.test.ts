import { describe, expect, it } from 'vitest'
import { Caffeine } from '../../server/generated/prisma/enums'
import { compareQuerySchema, createIngredientSchema, ingredientListQuerySchema, updateIngredientSchema } from '../../shared/schemas/ingredient'
import type { IngredientSnapshot } from '../../shared/types/ingredient'
import { formatDuration, parseDuration } from '../../app/utils/format'
import { escapeLike } from '../../server/utils/catalog'
import { CAFFEINE_VALUES, normalizeName, pickTranslation } from '../../shared/utils/catalog'
import { diffSnapshots } from '../../shared/utils/ingredient'

const base = { locale: 'de', name: 'Pfefferminze' } as const

describe('normalizeName', () => {
  it.each([
    [' Grüner  Tee ', 'grüner tee'],
    ['GRÜNER TEE', 'grüner tee'],
    ['Grüner\tTee\n', 'grüner tee'],
    ['ÄPFEL', 'äpfel'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeName(input)).toBe(expected)
  })

  it('behandelt NFC und NFD gleich', () => {
    const nfd = 'Grüner Tee'
    expect(nfd).not.toBe('Grüner Tee')
    expect(normalizeName(nfd)).toBe(normalizeName('Grüner Tee'))
  })
})

const snapshot = (overrides: Partial<IngredientSnapshot> = {}): IngredientSnapshot => ({
  sourceLocale: 'de',
  caffeine: 'no',
  brewTempC: 95,
  brewSeconds: null,
  translations: { de: { name: 'Pfefferminze', description: null } },
  ...overrides,
})

describe('diffSnapshots', () => {
  it('liefert keine Änderung für gleiche Stände', () => {
    expect(diffSnapshots(snapshot(), snapshot())).toEqual([])
  })

  it('erkennt geänderte Grundfelder', () => {
    expect(diffSnapshots(snapshot(), snapshot({ brewSeconds: 300, caffeine: 'unknown' }))).toEqual([
      { field: 'caffeine', from: 'no', to: 'unknown' },
      { field: 'brewSeconds', from: null, to: 300 },
    ])
  })

  it('zeigt eine neue Sprache mit from: null (AK-5.2)', () => {
    const after = snapshot({ translations: { de: { name: 'Pfefferminze', description: null }, en: { name: 'Peppermint', description: 'Fresh' } } })
    expect(diffSnapshots(snapshot(), after)).toEqual([
      { field: 'name', locale: 'en', from: null, to: 'Peppermint' },
      { field: 'description', locale: 'en', from: null, to: 'Fresh' },
    ])
  })

  it('erkennt geänderte Übersetzungen', () => {
    const after = snapshot({ translations: { de: { name: 'Minze', description: 'Frisch' } } })
    expect(diffSnapshots(snapshot(), after)).toEqual([
      { field: 'name', locale: 'de', from: 'Pfefferminze', to: 'Minze' },
      { field: 'description', locale: 'de', from: null, to: 'Frisch' },
    ])
  })
})

describe('pickTranslation (AK-1.3)', () => {
  it('nimmt die gewünschte Sprache, wenn vorhanden', () => {
    const s = snapshot({ translations: { de: { name: 'Minze', description: null }, en: { name: 'Mint', description: null } } })
    expect(pickTranslation(s, 'en')).toEqual({ text: { name: 'Mint', description: null }, locale: 'en', translated: true })
  })

  it('weicht auf die Originalsprache aus', () => {
    expect(pickTranslation(snapshot(), 'en')).toEqual({ text: { name: 'Pfefferminze', description: null }, locale: 'de', translated: false })
  })
})

describe('createIngredientSchema', () => {
  it('setzt Standardwerte', () => {
    expect(createIngredientSchema.parse(base)).toEqual({
      locale: 'de', name: 'Pfefferminze', description: null, caffeine: 'unknown', brewTempC: null, brewSeconds: null, note: null,
    })
  })

  it.each([[1, false], [2, true], [80, true], [81, false]])('Name mit %i Zeichen → gültig: %s', (length, ok) => {
    expect(createIngredientSchema.safeParse({ ...base, name: 'x'.repeat(length) }).success).toBe(ok)
  })

  it('zählt den Namen nach dem Trimmen', () => {
    expect(createIngredientSchema.safeParse({ ...base, name: '  x  ' }).success).toBe(false)
    expect(createIngredientSchema.parse({ ...base, name: '  Minze ' }).name).toBe('Minze')
  })

  it.each([[2000, true], [2001, false]])('Beschreibung mit %i Zeichen → gültig: %s', (length, ok) => {
    expect(createIngredientSchema.safeParse({ ...base, description: 'x'.repeat(length) }).success).toBe(ok)
  })

  it('macht leere Beschreibung und Notiz zu null', () => {
    const parsed = createIngredientSchema.parse({ ...base, description: '   ', note: '' })
    expect(parsed.description).toBeNull()
    expect(parsed.note).toBeNull()
  })

  it.each([[39, false], [40, true], [100, true], [101, false], [85.5, false]])('Temperatur %d → gültig: %s', (value, ok) => {
    expect(createIngredientSchema.safeParse({ ...base, brewTempC: value }).success).toBe(ok)
  })

  it.each([[9, false], [10, true], [1800, true], [1801, false]])('Ziehzeit %i s → gültig: %s', (value, ok) => {
    expect(createIngredientSchema.safeParse({ ...base, brewSeconds: value }).success).toBe(ok)
  })

  it.each([[200, true], [201, false]])('Notiz mit %i Zeichen → gültig: %s', (length, ok) => {
    expect(createIngredientSchema.safeParse({ ...base, note: 'x'.repeat(length) }).success).toBe(ok)
  })

  it('lehnt unbekannte Sprache und Koffeinwerte ab', () => {
    expect(createIngredientSchema.safeParse({ ...base, locale: 'fr' }).success).toBe(false)
    expect(createIngredientSchema.safeParse({ ...base, caffeine: 'maybe' }).success).toBe(false)
  })
})

describe('updateIngredientSchema', () => {
  it('verlangt die Versionsnummer', () => {
    expect(updateIngredientSchema.safeParse({ caffeine: 'no' }).success).toBe(false)
    expect(updateIngredientSchema.safeParse({ version: 0 }).success).toBe(false)
  })

  it('lässt fehlende Felder weg und akzeptiert Teil-Übersetzungen', () => {
    expect(updateIngredientSchema.parse({ version: 2, translations: { en: { name: 'Mint' } } })).toEqual({
      version: 2, translations: { en: { name: 'Mint', description: null } }, note: null,
    })
  })

  it('kennt kein Entfernen von Übersetzungen (AK-4.3)', () => {
    expect(updateIngredientSchema.safeParse({ version: 1, translations: { de: null } }).success).toBe(false)
    expect(updateIngredientSchema.safeParse({ version: 1, translations: { fr: { name: 'Menthe' } } }).success).toBe(false)
  })

  it('erlaubt das Zurücksetzen von Temperatur und Ziehzeit auf null', () => {
    expect(updateIngredientSchema.parse({ version: 1, brewTempC: null, brewSeconds: null })).toMatchObject({ brewTempC: null, brewSeconds: null })
  })
})

describe('Abfrage-Schemas', () => {
  it('Liste: Seite als Zahl, Sprache Pflicht', () => {
    expect(ingredientListQuerySchema.parse({ page: '2', locale: 'en' })).toEqual({ page: 2, locale: 'en' })
    expect(ingredientListQuerySchema.safeParse({}).success).toBe(false)
  })

  it('Vergleich: zwei Versionsnummern', () => {
    expect(compareQuerySchema.parse({ from: '1', to: '3' })).toEqual({ from: 1, to: 3 })
    expect(compareQuerySchema.safeParse({ from: 'a', to: '3' }).success).toBe(false)
  })
})

it('Koffeinwerte stimmen mit dem Prisma-Enum überein', () => {
  expect([...CAFFEINE_VALUES].sort()).toEqual(Object.values(Caffeine).sort())
})

describe('escapeLike', () => {
  it.each([
    ['100%', '100\\%'],
    ['a_b', 'a\\_b'],
    ['c:\\tee', 'c:\\\\tee'],
    ['Grüner Tee', 'Grüner Tee'],
  ])('%j → %j', (input, expected) => {
    expect(escapeLike(input)).toBe(expected)
  })
})

describe('Ziehzeit als Min:Sek', () => {
  it.each([[210, '3:30'], [10, '0:10'], [1800, '30:00'], [null, '']])('formatDuration(%j) → %j', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text)
  })

  it.each([['3:30', 210], ['5', 300], [' 0:10 ', 10], ['', null], ['3:75', Number.NaN], ['abc', Number.NaN]])('parseDuration(%j) → %j', (text, seconds) => {
    expect(parseDuration(text)).toBe(seconds)
  })
})

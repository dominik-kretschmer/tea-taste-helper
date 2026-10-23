import type { ContentLocale, IngredientSnapshot, IngredientText, SnapshotChange } from '../types/ingredient'

export const CONTENT_LOCALES = ['de', 'en'] as const satisfies readonly ContentLocale[]

export const CAFFEINE_VALUES = ['yes', 'no', 'unknown'] as const

export const INGREDIENT_NAME_MIN = 2
export const INGREDIENT_NAME_MAX = 80
export const INGREDIENT_DESCRIPTION_MAX = 2000
export const INGREDIENT_NOTE_MAX = 200
export const BREW_TEMP_MIN = 40
export const BREW_TEMP_MAX = 100
export const BREW_SECONDS_MIN = 10
export const BREW_SECONDS_MAX = 1800

/**
 * Schlüssel für die Duplikatregel (AK-2.3): Unicode-NFC, Rand-Leerraum weg, innerer Leerraum
 * zusammengefasst, sprachneutral kleingeschrieben. „ Grüner  Tee “ und „grüner tee“ sind gleich.
 */
export function normalizeName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('und')
}

export interface PickedTranslation {
  text: IngredientText
  locale: ContentLocale
  /** false, wenn auf die Originalsprache ausgewichen wurde */
  translated: boolean
}

/** Übersetzung der gewünschten Sprache, sonst die der Originalsprache (AK-1.3). */
export function pickTranslation(snapshot: Pick<IngredientSnapshot, 'sourceLocale' | 'translations'>, locale: ContentLocale): PickedTranslation {
  const own = snapshot.translations[locale]
  if (own) return { text: own, locale, translated: true }
  // Die Originalsprache hat immer eine Übersetzung (AK-4.3)
  return { text: snapshot.translations[snapshot.sourceLocale]!, locale: snapshot.sourceLocale, translated: false }
}

const FACT_FIELDS = ['caffeine', 'brewTempC', 'brewSeconds'] as const
const TEXT_FIELDS = ['name', 'description'] as const

/** Geänderte Felder zwischen zwei Ständen; neu hinzugekommene Sprachen erscheinen mit `from: null` (AK-5.2). */
export function diffSnapshots(a: IngredientSnapshot, b: IngredientSnapshot): SnapshotChange[] {
  const changes: SnapshotChange[] = []
  for (const field of FACT_FIELDS) {
    if (a[field] !== b[field]) changes.push({ field, from: a[field], to: b[field] })
  }
  for (const locale of CONTENT_LOCALES) {
    const from = a.translations[locale]
    const to = b.translations[locale]
    for (const field of TEXT_FIELDS) {
      const before = from?.[field] ?? null
      const after = to?.[field] ?? null
      if (before !== after) changes.push({ field, locale, from: before, to: after })
    }
  }
  return changes
}

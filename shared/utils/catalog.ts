// Gemeinsame Regeln für Katalog-Einträge (Zutaten, Tees).
import type { CatalogFacts, CatalogText, CatalogTranslations, ContentLocale, SnapshotChange } from '../types/catalog'

export const CONTENT_LOCALES = ['de', 'en'] as const satisfies readonly ContentLocale[]

export const CAFFEINE_VALUES = ['yes', 'no', 'unknown'] as const

export const CATALOG_NAME_MIN = 2
export const CATALOG_NAME_MAX = 80
export const CATALOG_DESCRIPTION_MAX = 2000
export const CATALOG_NOTE_MAX = 200
export const BREW_TEMP_MIN = 40
export const BREW_TEMP_MAX = 100
export const BREW_SECONDS_MIN = 10
export const BREW_SECONDS_MAX = 1800

/**
 * Schlüssel für die Duplikatregel: Unicode-NFC, Rand-Leerraum weg, innerer Leerraum
 * zusammengefasst, sprachneutral kleingeschrieben. „ Grüner  Tee “ und „grüner tee“ sind gleich.
 * Kann bis zu 3× so viele Zeichen haben wie der Name (z.B. „İ“ → „i̇“).
 */
export function normalizeName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('und')
}

export interface PickedTranslation {
  text: CatalogText
  locale: ContentLocale
  /** false, wenn auf die Originalsprache ausgewichen wurde */
  translated: boolean
}

/** Übersetzung der gewünschten Sprache, sonst die der Originalsprache. */
export function pickTranslation(entry: { sourceLocale: ContentLocale, translations: CatalogTranslations }, locale: ContentLocale): PickedTranslation {
  const own = entry.translations[locale]
  if (own) return { text: own, locale, translated: true }
  // Die Originalsprache hat immer eine Übersetzung
  return { text: entry.translations[entry.sourceLocale]!, locale: entry.sourceLocale, translated: false }
}

const FACT_FIELDS = ['caffeine', 'brewTempC', 'brewSeconds'] as const
const TEXT_FIELDS = ['name', 'description'] as const

/** Geänderte Grundfelder (Koffein, Temperatur, Ziehzeit). */
export function diffFacts(a: CatalogFacts, b: CatalogFacts): SnapshotChange[] {
  return FACT_FIELDS.flatMap(field => (a[field] === b[field] ? [] : [{ field, from: a[field], to: b[field] }]))
}

/** Geänderte Texte je Sprache; neu hinzugekommene Sprachen erscheinen mit `from: null`. */
export function diffTranslations(a: CatalogTranslations, b: CatalogTranslations): SnapshotChange[] {
  const changes: SnapshotChange[] = []
  for (const locale of CONTENT_LOCALES) {
    for (const field of TEXT_FIELDS) {
      const before = a[locale]?.[field] ?? null
      const after = b[locale]?.[field] ?? null
      if (before !== after) changes.push({ field, locale, from: before, to: after })
    }
  }
  return changes
}

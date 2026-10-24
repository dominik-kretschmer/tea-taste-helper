// Typen des Vorrats (06).
import type { Page } from './auth'
import type { CatalogTypeValue } from './moderation'

export interface PantryEntry {
  id: string
  entityType: CatalogTypeValue
  entityId: string
  /** aktuelle Sprache, sonst Originalsprache */
  name: string
  /** nur Tees */
  brand: string | null
  /** null = ohne Menge, 0 = aufgebraucht */
  grams: number | null
  empty: boolean
  /** Zutat bzw. Tee ausgeblendet (AK-1.3) */
  hidden: boolean
}

export interface PantryPage extends Page<PantryEntry> {
  /** Anzahl je Tab, ohne Suchfilter (AK-1.1) */
  counts: Record<CatalogTypeValue, number>
}

/** Kurzform ohne Namen: Antwort von Lookup, Hinzufügen und Ändern (Detailseiten, Rückgängig) */
export type PantryRef = Pick<PantryEntry, 'id' | 'entityType' | 'entityId' | 'grams'>

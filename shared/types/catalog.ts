// Gemeinsame Typen für Katalog-Einträge (Zutaten, Tees).

/** Sprachen, in denen Inhalte gepflegt werden. */
export type ContentLocale = 'de' | 'en'

export type CaffeineValue = 'yes' | 'no' | 'unknown'

/** Name und Beschreibung in einer Sprache. */
export interface CatalogText {
  name: string
  description: string | null
}

export type CatalogTranslations = Partial<Record<ContentLocale, CatalogText>>

/** Grundfelder, die Zutaten und Tees gemeinsam haben. */
export interface CatalogFacts {
  caffeine: CaffeineValue
  brewTempC: number | null
  brewSeconds: number | null
}

/** Öffentliche Angabe zu einem Autor – nie die E-Mail. `null` = gelöschtes Konto. */
export interface AuthorRef {
  displayName: string
}

export interface RevisionEntry {
  version: number
  isCurrent: boolean
  createdAt: string
  author: AuthorRef | null
  note: string | null
  /** Inhalt entspricht dieser früheren Version (05 AK-1.1) */
  revertedTo: number | null
  /** Massen-Zurücksetzung der Änderungen dieses Nutzers (05 AK-7.2) */
  bulkRevertOf: AuthorRef | null
  /** nur Tees: Version entstand durch Zusammenführen dieser Zutat (05 AK-4.3) */
  mergedIngredient: { id: string, mergedInto: string | null } | null
}

export type SnapshotField = 'name' | 'description' | 'caffeine' | 'brewTempC' | 'brewSeconds'

export interface SnapshotChange {
  field: SnapshotField
  /** nur bei `name` und `description` */
  locale?: ContentLocale
  from: unknown
  to: unknown
}

/** Nur für Moderatoren an Detail-Antworten ausgeblendeter Einträge (05 AK-5.4) */
export interface ModerationState {
  hiddenAt: string
  hiddenBy: AuthorRef | null
  hiddenReason: string
}

/** Zusatzangaben an Detail-Antworten (05): Ziel einer Zusammenführung bzw. Ausblendung für Moderatoren */
export interface EntryModerationInfo {
  /** nur mit `?merged=1` (Historie der Quelle, AK-4.2) */
  mergedInto?: string
  moderation?: ModerationState
}

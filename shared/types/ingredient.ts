/** Sprachen, in denen Inhalte (Zutaten) gepflegt werden. */
export type ContentLocale = 'de' | 'en'

export type CaffeineValue = 'yes' | 'no' | 'unknown'

export interface IngredientText {
  name: string
  description: string | null
}

/** Inhalt einer Version samt Übersetzungen – wird aus den Zeilen gebildet, nicht als JSON gespeichert. */
export interface IngredientSnapshot {
  sourceLocale: ContentLocale
  caffeine: CaffeineValue
  brewTempC: number | null
  brewSeconds: number | null
  translations: Partial<Record<ContentLocale, IngredientText>>
}

/** Öffentliche Angabe zu einem Autor – nie die E-Mail (AK-1.4). `null` = gelöschtes Konto. */
export interface AuthorRef {
  displayName: string
}

export interface IngredientDetail extends IngredientSnapshot {
  id: string
  version: number
  updatedAt: string
  updatedBy: AuthorRef | null
}

export interface IngredientListItem {
  id: string
  name: string
  /** false, wenn der Name aus der Originalsprache stammt (AK-1.3) */
  translated: boolean
  caffeine: CaffeineValue
}

export interface RevisionEntry {
  version: number
  isCurrent: boolean
  createdAt: string
  author: AuthorRef | null
  note: string | null
}

export type SnapshotField = 'name' | 'description' | 'caffeine' | 'brewTempC' | 'brewSeconds'

export interface SnapshotChange {
  field: SnapshotField
  /** nur bei `name` und `description` */
  locale?: ContentLocale
  from: unknown
  to: unknown
}

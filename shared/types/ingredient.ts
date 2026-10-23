import type { AuthorRef, CaffeineValue, CatalogFacts, CatalogText, CatalogTranslations, ContentLocale } from './catalog'

export type IngredientText = CatalogText

/** Inhalt einer Version samt Übersetzungen – wird aus den Zeilen gebildet, nicht als JSON gespeichert. */
export interface IngredientSnapshot extends CatalogFacts {
  sourceLocale: ContentLocale
  translations: CatalogTranslations
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

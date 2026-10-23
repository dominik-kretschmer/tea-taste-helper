import type { AuthorRef, CaffeineValue, CatalogFacts, CatalogTranslations, ContentLocale, EntryModerationInfo, SnapshotChange } from './catalog'

export type TeaKindValue = 'bought' | 'blended'
export type VisibilityValue = 'private' | 'public'

/** Zutat eines Tees in einer Version; `percent` null = ohne Angabe. */
export interface TeaIngredientRef {
  ingredientId: string
  percent: number | null
}

/** Inhalt einer Version samt Übersetzungen und Zutatenliste (in Reihenfolge). */
export interface TeaSnapshot extends CatalogFacts {
  sourceLocale: ContentLocale
  visibility: VisibilityValue
  kind: TeaKindValue
  brand: string | null
  translations: CatalogTranslations
  ingredients: TeaIngredientRef[]
}

/** Zutat zur Anzeige im Tee: Namen in allen Sprachen, damit der Client mit Fallback wählen kann. */
export interface TeaIngredientView extends TeaIngredientRef {
  sourceLocale: ContentLocale
  translations: CatalogTranslations
  caffeine: CaffeineValue
}

export interface TeaDetail extends Omit<TeaSnapshot, 'ingredients'>, EntryModerationInfo {
  id: string
  version: number
  updatedAt: string
  updatedBy: AuthorRef | null
  owner: AuthorRef | null
  isOwner: boolean
  ingredients: TeaIngredientView[]
  /** mindestens eine Zutat ist koffeinhaltig (AK-1.6) */
  ingredientsCaffeinated: boolean
}

export interface TeaListItem {
  id: string
  name: string
  /** false, wenn der Name aus der Originalsprache stammt */
  translated: boolean
  brand: string | null
  kind: TeaKindValue
  caffeine: CaffeineValue
  visibility: VisibilityValue
}

export interface TeaIngredientPlacement {
  position: number
  percent: number | null
}

export type TeaChange =
  | SnapshotChange
  | { field: 'kind' | 'brand' | 'visibility', from: unknown, to: unknown }
  /** `from` null = hinzugefügt, `to` null = entfernt */
  | { field: 'ingredient', ingredientId: string, from: TeaIngredientPlacement | null, to: TeaIngredientPlacement | null }

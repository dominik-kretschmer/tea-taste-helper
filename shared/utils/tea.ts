import type { TeaChange, TeaIngredientRef, TeaSnapshot } from '../types/tea'
import { diffFacts, diffTranslations } from './catalog'

export const TEA_KINDS = ['bought', 'blended'] as const
export const VISIBILITIES = ['private', 'public'] as const
export const TEA_INGREDIENTS_MIN = 1
export const TEA_INGREDIENTS_MAX = 20
export const TEA_BRAND_MAX = 80

/** Nicht angegebener Rest in Prozent (AK-0.3); nur berechnet, nie gespeichert. */
export function remainingPercent(ingredients: Pick<TeaIngredientRef, 'percent'>[]): number {
  return 100 - ingredients.reduce((sum, item) => sum + (item.percent ?? 0), 0)
}

const TEA_FIELDS = ['kind', 'brand', 'visibility'] as const

/**
 * Geänderte Felder zwischen zwei Ständen: Grundfelder, Texte je Sprache und Zutaten
 * (hinzugefügt, entfernt, verschoben oder Anteil geändert).
 */
export function diffTeaSnapshots(a: TeaSnapshot, b: TeaSnapshot): TeaChange[] {
  const changes: TeaChange[] = [...diffFacts(a, b)]
  for (const field of TEA_FIELDS) {
    if (a[field] !== b[field]) changes.push({ field, from: a[field], to: b[field] })
  }
  changes.push(...diffTranslations(a.translations, b.translations))

  const placement = (list: TeaIngredientRef[]) =>
    new Map(list.map((item, position) => [item.ingredientId, { position, percent: item.percent }]))
  const before = placement(a.ingredients)
  const after = placement(b.ingredients)
  for (const [ingredientId, to] of after) {
    const from = before.get(ingredientId) ?? null
    if (!from || from.position !== to.position || from.percent !== to.percent) {
      changes.push({ field: 'ingredient', ingredientId, from, to })
    }
  }
  for (const [ingredientId, from] of before) {
    if (!after.has(ingredientId)) changes.push({ field: 'ingredient', ingredientId, from, to: null })
  }
  return changes
}

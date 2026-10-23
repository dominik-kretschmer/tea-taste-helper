import type { IngredientSnapshot } from '../types/ingredient'
import type { SnapshotChange } from '../types/catalog'
import { diffFacts, diffTranslations } from './catalog'

/** Geänderte Felder zwischen zwei Ständen; neu hinzugekommene Sprachen erscheinen mit `from: null` (AK-5.2). */
export function diffSnapshots(a: IngredientSnapshot, b: IngredientSnapshot): SnapshotChange[] {
  return [...diffFacts(a, b), ...diffTranslations(a.translations, b.translations)]
}

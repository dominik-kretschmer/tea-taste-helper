import type { MaybeRefOrGetter } from 'vue'

/** Name und Beschreibung in der aktuellen App-Sprache, sonst in der Originalsprache (AK-1.3). */
export function useIngredientText(ingredient: MaybeRefOrGetter<IngredientSnapshot | null | undefined>) {
  const { locale } = useI18n()
  return computed(() => {
    const value = toValue(ingredient)
    return value ? pickTranslation(value, locale.value as ContentLocale) : null
  })
}

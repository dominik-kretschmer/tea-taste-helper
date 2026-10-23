import type { MaybeRefOrGetter } from 'vue'

type Translatable = { sourceLocale: ContentLocale, translations: CatalogTranslations }

/** Name und Beschreibung in der aktuellen App-Sprache, sonst in der Originalsprache (Zutaten, Tees). */
export function useCatalogText(entry: MaybeRefOrGetter<Translatable | null | undefined>) {
  const { locale } = useI18n()
  return computed(() => {
    const value = toValue(entry)
    return value ? pickTranslation(value, locale.value as ContentLocale) : null
  })
}

export const useIngredientText = useCatalogText

/** Menge eines Vorratseintrags als Text: „ohne Menge“, „aufgebraucht“ oder „1.250 g“ (06 AK-1.1, AK-1.2). */
export function usePantryAmount() {
  const { t, locale } = useI18n()
  return (grams: number | null) => {
    if (grams === null) return t('pantry.amount.none')
    if (grams === 0) return t('pantry.amount.empty')
    return t('pantry.amount.grams', { grams: new Intl.NumberFormat(locale.value).format(grams) })
  }
}

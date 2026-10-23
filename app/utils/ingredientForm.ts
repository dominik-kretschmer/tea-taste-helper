import type { CreateIngredientInput, UpdateIngredientInput } from '#shared/schemas/ingredient'

/** Formularzustand für IngredientForm; Zahlen als Text, Ziehzeit als „m:ss“. */
export interface IngredientFormState {
  /** Anlegen: gewählte Sprache; Bearbeiten: aktiver Tab */
  locale: ContentLocale
  translations: Record<ContentLocale, { name: string, description: string }>
  caffeine: CaffeineValue
  brewTempC: string
  brewTime: string
  note: string
}

/** Leere Texte für alle Inhaltssprachen (auch für Tees). */
export const emptyFormTranslations = () =>
  Object.fromEntries(CONTENT_LOCALES.map(code => [code, { name: '', description: '' }])) as IngredientFormState['translations']

export function emptyFormState(locale: ContentLocale): IngredientFormState {
  return { locale, translations: emptyFormTranslations(), caffeine: 'unknown', brewTempC: '', brewTime: '', note: '' }
}

export function formStateFromDetail(detail: IngredientDetail, tab: ContentLocale): IngredientFormState {
  const translations = emptyFormTranslations()
  for (const code of CONTENT_LOCALES) {
    const text = detail.translations[code]
    if (text) translations[code] = { name: text.name, description: text.description ?? '' }
  }
  return {
    locale: tab,
    translations,
    caffeine: detail.caffeine,
    brewTempC: detail.brewTempC == null ? '' : String(detail.brewTempC),
    brewTime: formatDuration(detail.brewSeconds),
    note: '',
  }
}

/** Leer → null; sonst Zahl (unlesbar → NaN, das meldet das Schema). */
const toNumber = (value: string) => (value.trim() === '' ? null : Number(value))

/** Koffein, Temperatur und Ziehzeit aus dem Formular (auch für Tees). */
export function formFacts(state: Pick<IngredientFormState, 'caffeine' | 'brewTempC' | 'brewTime'>) {
  return { caffeine: state.caffeine, brewTempC: toNumber(String(state.brewTempC ?? '')), brewSeconds: parseDuration(state.brewTime) }
}

export function toCreateInput(state: IngredientFormState): CreateIngredientInput {
  const text = state.translations[state.locale]
  return { locale: state.locale, ...text, ...formFacts(state), note: state.note }
}

/** Nur Sprachen mit Namen oder vorhandener Übersetzung; ein geleerter Name fällt so in der Prüfung auf. */
export function toUpdateInput(state: IngredientFormState, version: number, existing: ContentLocale[]): UpdateIngredientInput {
  const translations = Object.fromEntries(
    CONTENT_LOCALES
      .filter(code => existing.includes(code) || state.translations[code].name.trim() || state.translations[code].description.trim())
      .map(code => [code, state.translations[code]]),
  )
  return { version, ...formFacts(state), translations, note: state.note }
}

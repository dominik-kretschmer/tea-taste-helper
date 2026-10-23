import type { CreateTeaInput, UpdateTeaInput } from '#shared/schemas/tea'

/** Eine Zutatenzeile im Formular; `name` nur zur Anzeige, `percent` als Text. */
export interface TeaFormIngredient {
  ingredientId: string
  name: string
  percent: string
}

/** Formularzustand für TeaForm; Zahlen als Text, Ziehzeit als „m:ss“. */
export interface TeaFormState {
  /** Anlegen: gewählte Sprache; Bearbeiten: aktiver Tab */
  locale: ContentLocale
  translations: Record<ContentLocale, { name: string, description: string }>
  kind: TeaKindValue
  brand: string
  visibility: VisibilityValue
  ingredients: TeaFormIngredient[]
  caffeine: CaffeineValue
  brewTempC: string
  brewTime: string
  note: string
}

export function emptyTeaFormState(locale: ContentLocale): TeaFormState {
  return {
    locale,
    translations: emptyFormTranslations(),
    kind: 'blended',
    brand: '',
    visibility: 'private',
    ingredients: [],
    caffeine: 'unknown',
    brewTempC: '',
    brewTime: '',
    note: '',
  }
}

export function teaFormFromDetail(detail: TeaDetail, tab: ContentLocale, appLocale: ContentLocale): TeaFormState {
  const translations = emptyFormTranslations()
  for (const code of CONTENT_LOCALES) {
    const text = detail.translations[code]
    if (text) translations[code] = { name: text.name, description: text.description ?? '' }
  }
  return {
    locale: tab,
    translations,
    kind: detail.kind,
    brand: detail.brand ?? '',
    visibility: detail.visibility,
    ingredients: detail.ingredients.map(item => ({
      ingredientId: item.ingredientId,
      name: pickTranslation(item, appLocale).text.name,
      percent: item.percent === null ? '' : String(item.percent),
    })),
    caffeine: detail.caffeine,
    brewTempC: detail.brewTempC == null ? '' : String(detail.brewTempC),
    brewTime: formatDuration(detail.brewSeconds),
    note: '',
  }
}

/** Leer → null; sonst Zahl (unlesbar → NaN, das meldet das Schema). */
const percentOf = (value: string) => (String(value ?? '').trim() === '' ? null : Number(value))

const ingredientRefs = (state: TeaFormState) =>
  state.ingredients.map(item => ({ ingredientId: item.ingredientId, percent: percentOf(item.percent) }))

export function toCreateTeaInput(state: TeaFormState): CreateTeaInput {
  return {
    locale: state.locale,
    ...state.translations[state.locale],
    visibility: state.visibility,
    kind: state.kind,
    brand: state.brand,
    ...formFacts(state),
    ingredients: ingredientRefs(state),
    note: state.note,
  }
}

/** Nur Sprachen mit Text oder vorhandener Übersetzung; ein geleerter Name fällt so in der Prüfung auf. */
export function toUpdateTeaInput(state: TeaFormState, version: number, existing: ContentLocale[]): UpdateTeaInput {
  const translations = Object.fromEntries(
    CONTENT_LOCALES
      .filter(code => existing.includes(code) || state.translations[code].name.trim() || state.translations[code].description.trim())
      .map(code => [code, state.translations[code]]),
  )
  return {
    version,
    kind: state.kind,
    brand: state.brand,
    ...formFacts(state),
    translations,
    ingredients: ingredientRefs(state),
    note: state.note,
  }
}

// --- Entwurf für den Weg „Zutat fehlt“ (AK-2.2): nur in diesem Tab, bis er wieder eingelesen ist ---

export interface TeaDraft {
  form: TeaFormState
  /** beim Bearbeiten: die geladene Version (optimistisches Sperren) */
  version?: number
}

const draftKey = (teaId?: string) => `tea-draft:${teaId ?? 'new'}`

export function saveTeaDraft(draft: TeaDraft, teaId?: string): void {
  try {
    sessionStorage.setItem(draftKey(teaId), JSON.stringify(draft))
  }
  catch {
    // Ohne Speicher geht der Entwurf verloren; das Formular funktioniert trotzdem
  }
}

/** Liest den Entwurf und löscht ihn dabei. */
export function takeTeaDraft(teaId?: string): TeaDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(teaId))
    sessionStorage.removeItem(draftKey(teaId))
    return raw ? JSON.parse(raw) as TeaDraft : null
  }
  catch {
    return null
  }
}

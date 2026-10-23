// Hell/Dunkel: Wahl des Nutzers und Systemthema, aufgelöst zu einem Vuetify-Thema (00-chore/06).

export type ThemeName = 'light' | 'dark'
export type ThemePreference = ThemeName | 'system'

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const satisfies readonly ThemePreference[]
/** Wahl des Nutzers */
export const THEME_COOKIE = 'theme'
/** Zuletzt im Browser gemessenes Systemthema (für Browser ohne Client-Hint) */
export const SYSTEM_THEME_COOKIE = 'theme-system'
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** 'light' | 'dark' → derselbe Wert; alles andere → undefined */
export function toThemeName(value: unknown): ThemeName | undefined {
  return value === 'light' || value === 'dark' ? value : undefined
}

/** Unbekannte Werte (z.B. ein manipuliertes Cookie) gelten als „system“. */
export function toPreference(value: unknown): ThemePreference {
  return toThemeName(value) ?? 'system'
}

/** Header `Sec-CH-Prefers-Color-Scheme` ist ein sf-string: `"dark"` mit Anführungszeichen. */
export function parseColorSchemeHint(header: string | undefined): ThemeName | undefined {
  const match = header?.trim().match(/^"(light|dark)"$/)
  return match ? (match[1] as ThemeName) : undefined
}

export function resolveTheme(preference: ThemePreference, system: ThemeName | undefined): ThemeName {
  return preference === 'system' ? (system ?? 'light') : preference
}

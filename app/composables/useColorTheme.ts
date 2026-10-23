/**
 * Hell/Dunkel (00-chore/06): Die Wahl steht im Cookie `theme`, das Systemthema bestimmt der Server
 * beim Rendern (Client-Hint bzw. Cookie `theme-system`) und gibt es per Payload an den Browser.
 * So starten Server und Browser mit demselben Thema – keine Hydration-Abweichung.
 */
export function useColorTheme() {
  const cookieOptions = { maxAge: THEME_COOKIE_MAX_AGE, sameSite: 'lax', path: '/' } as const
  const preferenceCookie = useCookie<string | null>(THEME_COOKIE, cookieOptions)
  const systemCookie = useCookie<string | null>(SYSTEM_THEME_COOKIE, cookieOptions)

  const system = useState<ThemeName | undefined>('theme:system', () =>
    import.meta.server
      ? parseColorSchemeHint(useRequestHeader('sec-ch-prefers-color-scheme') ?? undefined) ?? toThemeName(systemCookie.value)
      : undefined)

  // Gemeinsamer Zustand statt nur Cookie-Ref: Umschalter und Plugin rufen das Composable getrennt auf
  const preference = useState<ThemePreference>('theme:preference', () => toPreference(preferenceCookie.value))
  const resolved = computed(() => resolveTheme(preference.value, system.value))

  function setPreference(value: ThemePreference) {
    preference.value = value
    preferenceCookie.value = value
  }

  /** Im Browser gemessenes Systemthema übernehmen und für den nächsten Aufruf merken */
  function setSystem(value: ThemeName) {
    system.value = value
    systemCookie.value = value
  }

  return { preference, resolved, setPreference, setSystem }
}

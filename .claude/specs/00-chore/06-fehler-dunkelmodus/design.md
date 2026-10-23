# Design: 06 – Dunkelmodus: Hydration-Fehler, App bleibt hell

> Phase 2 zu [requirements.md](requirements.md). Status: **freigegeben (2026-10-23)**

## Überblick

Ursache: Vuetify löst `defaultTheme: 'system'` per `matchMedia` auf. Auf dem Server gibt es das nicht → hell. Im Browser beginnt die Hydration mit „dunkel“ → Klassen passen nicht zusammen. Vue behält das Server-HTML, daher bleibt die App hell.

Lösung (Variante c): **Der Server entscheidet das Thema**, und der Browser übernimmt genau diese Entscheidung für die Hydration. Erst nach dem Mounten korrigiert der Browser, falls der Server falsch geraten hat. Ein Umschalter in der App-Bar speichert die Wahl im Cookie.

```
Wahl (Cookie `theme`)   light | dark | system (Standard)
                              │
          ┌───────────────────┴───────────────────┐
     light / dark                               system
          │                                       │
          │                  Systemthema bekannt? │
          │      1. Header  Sec-CH-Prefers-Color-Scheme  (Chromium, per Accept-CH/Critical-CH)
          │      2. Cookie  theme-system  (vom Browser zuletzt gemessen)
          │      3. sonst   light
          ▼                                       ▼
   Server rendert v-theme--<aufgelöst>  ──► useState('theme:resolved') im Payload
                                                  │
   Browser: createVuetify({ defaultTheme: <aus Payload> })  → Hydration ohne Abweichung
   nach dem Mounten: matchMedia lesen, Cookie theme-system schreiben,
                     bei „system“ und Abweichung theme.change(...)   (AK-1.6: auch bei späteren Änderungen)
```

Ein kurzes helles Aufblitzen gibt es nur beim allerersten Besuch in Browsern ohne Client-Hint (Firefox, Safari) mit dunklem System; ab dem zweiten Aufruf steht das Cookie `theme-system`. Das ist laut Entscheidung so in Ordnung.

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `app/utils/theme.ts` | neu | Typen, Cookie-Namen, `resolveTheme()`, `parseColorSchemeHint()` (rein, unit-testbar) |
| `app/composables/useColorTheme.ts` | neu | Wahl (Cookie), aufgelöstes Thema (`useState`), `setPreference()` |
| `app/plugins/vuetify.ts` | geändert | `defaultTheme` aus `useColorTheme()` statt `'system'`; nach dem Mounten `matchMedia` beobachten |
| `app/components/ThemeSwitcher.vue` | neu | Menü hell/dunkel/System in der App-Bar, wie `LanguageSwitcher` |
| `app/layouts/default.vue` | geändert | `<ThemeSwitcher />` vor `<LanguageSwitcher />` |
| `nuxt.config.ts` | geändert | Header `Accept-CH`, `Critical-CH`, `Vary` für Seiten (nicht `/api`) |
| `i18n/locales/de.json`, `en.json` | geändert | Texte `theme.*` |
| `test/unit/theme.test.ts` | neu | `resolveTheme`, `parseColorSchemeHint` |

## Datenmodell

```ts
// app/utils/theme.ts
export type ThemeName = 'light' | 'dark'
export type ThemePreference = ThemeName | 'system'

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const satisfies readonly ThemePreference[]
export const THEME_COOKIE = 'theme'              // Wahl des Nutzers
export const SYSTEM_THEME_COOKIE = 'theme-system' // zuletzt im Browser gemessenes Systemthema
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Unbekannte Werte (manipuliertes Cookie) gelten als „system“. */
export function toPreference(value: unknown): ThemePreference

/** 'light' | 'dark' → derselbe Wert; alles andere → undefined */
export function toThemeName(value: unknown): ThemeName | undefined

/** `"dark"` (sf-string mit Anführungszeichen) → 'dark'; alles andere → undefined */
export function parseColorSchemeHint(header: string | undefined): ThemeName | undefined

export function resolveTheme(preference: ThemePreference, system: ThemeName | undefined): ThemeName {
  return preference === 'system' ? (system ?? 'light') : preference
}
```

```ts
// app/composables/useColorTheme.ts
export function useColorTheme() {
  const cookieOptions = { maxAge: THEME_COOKIE_MAX_AGE, sameSite: 'lax', path: '/' } as const
  const preferenceCookie = useCookie<string | null>(THEME_COOKIE, cookieOptions)
  const systemCookie = useCookie<string | null>(SYSTEM_THEME_COOKIE, cookieOptions)

  const preference = computed(() => toPreference(preferenceCookie.value))
  /** Beim Server-Rendern bestimmt und per Payload an den Browser übergeben */
  const system = useState<ThemeName | undefined>('theme:system', () =>
    import.meta.server
      ? parseColorSchemeHint(useRequestHeader('sec-ch-prefers-color-scheme')) ?? toThemeName(systemCookie.value)
      : undefined)
  const resolved = computed(() => resolveTheme(preference.value, system.value))

  function setPreference(value: ThemePreference) { preferenceCookie.value = value }
  function setSystem(value: ThemeName) { system.value = value; systemCookie.value = value }

  return { preference, resolved, setPreference, setSystem }
}
```

Beide Cookies sind rein funktional (keine Kennung, kein Tracking), nicht `HttpOnly` (der Browser schreibt sie), `SameSite=Lax`, ein Jahr gültig.

## Vuetify-Plugin

```ts
const theme = useColorTheme()
const vuetify = createVuetify({
  ssr: true,
  // Server und Browser starten mit demselben Thema (aus dem Payload) – keine Hydration-Abweichung (AK-1.1)
  theme: { defaultTheme: theme.resolved.value },
  // ...
})

// Wahl oder Systemthema ändern sich → Vuetify folgt ohne Neuladen (AK-1.4, AK-1.6)
watch(theme.resolved, name => vuetify.theme.change(name))

if (import.meta.client) {
  onNuxtReady(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const measure = () => theme.setSystem(media.matches ? 'dark' : 'light')
    measure()                                  // korrigiert ggf. die Vermutung des Servers
    media.addEventListener('change', measure)  // AK-1.6
  })
}
```

`onNuxtReady` läuft erst nach der vollständigen Hydration; eine Korrektur dort ist ein normales Re-Rendern, keine Abweichung. *Geändert in der Umsetzung (2026-10-23):* Ursprünglich stand hier `app:mounted`. Das ist zu früh, weil Suspense-Inhalte danach noch hydrieren, und erzeugte beim ersten Besuch mit dunklem System Hydration-Warnungen.

## Client-Hint-Header

```ts
// nuxt.config.ts
routeRules: {
  '/**': {
    headers: {
      // Chromium schickt das Systemthema mit; Critical-CH wiederholt den allerersten Request einmal mit dem Hint
      'Accept-CH': 'Sec-CH-Prefers-Color-Scheme',
      'Critical-CH': 'Sec-CH-Prefers-Color-Scheme',
      'Vary': 'Sec-CH-Prefers-Color-Scheme',
    },
  },
},
```

Die Header gehen auch an `/api`-Antworten; dort sind sie wirkungslos (der Browser fordert den Hint nur für Navigationen an), eine Ausnahme lohnt nicht. Bei der Umsetzung prüfen, dass `nuxt-security` (setzt eigene Header über `routeRules`) die drei Werte nicht verdrängt und dass ein vorhandenes `Vary` ergänzt statt ersetzt wird; sonst setzt ein kleines Nitro-Plugin die Header für HTML-Antworten. Die Permissions-Policy von `nuxt-security` betrifft Client-Hints der eigenen Seite nicht.

## UI

`ThemeSwitcher.vue` folgt `LanguageSwitcher.vue`:

- Icon-Button `mdiThemeLightDark` mit `aria-label`/`title` = `t('theme.label')`.
- `v-menu` mit `v-list density="compact" :selected="[preference]"`, drei Einträge mit Icons `mdiWeatherSunny`, `mdiWeatherNight`, `mdiThemeLightDark`; Klick → `setPreference(...)`.
- Per Tastatur bedienbar über die Vuetify-Menüs (wie der Sprachumschalter, AK-1.7).
- Bei 360 px stehen in der App-Bar dann: Menü-Icon, Titel, Thema, Sprache, Konto. Der Titel kürzt sich per `v-app-bar-title` mit Ellipse; Prüfung auf horizontales Scrollen in der Abnahme.

Texte:

| Schlüssel | de | en |
|---|---|---|
| `theme.label` | Darstellung | Appearance |
| `theme.light` | Hell | Light |
| `theme.dark` | Dunkel | Dark |
| `theme.system` | Wie System | System |

## Prüfung (AK-1.3)

Wie im Befund per Playwright (ad hoc, nicht eingecheckt): alle Seiten, Gast und angemeldet, jeweils `colorScheme: 'light'` und `'dark'`, Konsole auf „Hydration“ filtern → 0 Meldungen. Zusätzlich je Durchgang: `.v-application` hat `v-theme--dark` bzw. `--light`, Hintergrundfarbe passend (AK-1.2). Für AK-1.5 mit Chromium: erster Aufruf mit dunklem System → schon das Server-HTML enthält `v-theme--dark` (per `curl` mit Header `Sec-CH-Prefers-Color-Scheme: "dark"` und ohne Header mit Cookie `theme=dark`).

## Entscheidungen

- **Server entscheidet, Browser übernimmt per Payload** – einzige Art, mit SSR ohne Abweichung zu hydrieren. – Verworfen: Thema nur im Browser setzen (`<ClientOnly>` oder Klassen per Skript vor der Hydration; Letzteres bräuchte ein Inline-Skript mit Nonce und kämpft gegen Vuetifys Klassen).
- **Client-Hint + Cookie `theme-system`** – Chromium liefert das Systemthema schon beim ersten Aufruf; andere Browser ab dem zweiten. – Verworfen: nur Cookie (jeder erste Besuch blitzt auf).
- **Zwei Cookies statt einem** – die Wahl („system“) und die Messung („dark“) sind verschiedene Dinge; würde „system“ beim Messen überschrieben, ginge die Wahl verloren.
- **Wahl nur im Cookie, nicht am Konto** – gilt laut AK-1.4 auch für Gäste; kein Schema-Umbau nötig. Folge: pro Browser, nicht pro Nutzer.
- **Umschalter in der App-Bar statt im Kontomenü** – Gäste haben auf schmalen Bildschirmen kein vollwertiges Menü; der Umschalter steht neben dem Sprachumschalter, der genauso funktioniert.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-1.1 | `defaultTheme` aus `useState('theme:system')` + Cookie, gleich auf Server und Browser; Playwright-Prüfung |
| AK-1.2 | ein Vuetify-Thema für die ganze App (`v-app`), Wechsel per `theme.change`; Playwright-Prüfung der Klasse und Farbe |
| AK-1.3 | Playwright-Durchlauf wie im Befund |
| AK-1.4 | `ThemeSwitcher.vue`, `setPreference` → Cookie, `watch(resolved)` → `theme.change` |
| AK-1.5 | Cookie `theme` bzw. `Sec-CH-Prefers-Color-Scheme` (`Accept-CH`/`Critical-CH`) beim Server-Rendern; `curl`-Prüfung |
| AK-1.6 | `matchMedia`-Listener in `onNuxtReady` → `setSystem` |
| AK-1.7 | `theme.*` in beiden Sprachdateien (bestehender i18n-Test prüft Gleichheit), `aria-label`, Vuetify-Menü; 360-px-Prüfung |

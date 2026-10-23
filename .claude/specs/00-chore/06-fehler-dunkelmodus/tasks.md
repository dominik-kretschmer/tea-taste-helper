# Aufgaben: 06 – Dunkelmodus: Hydration-Fehler, App bleibt hell

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-23)**

Reihenfolge:
- reine Logik → Composable und Plugin → Header → Umschalter → Abnahme.
- Commits `fix(00-chore/06): …` bzw. `feat(00-chore/06): …`, nur mit ausdrücklich genannten Pfaden. `i18n/locales/*.json` und `nuxt.config.ts` ändert auch die Session für 04-Tees: nur eigene Abschnitte stagen (`git add -p`) oder abstimmen.
- Browserprüfungen per Playwright (ad hoc, nicht eingecheckt).

- [x] 1. Theme-Logik
  - Dateien: `app/utils/theme.ts` (neu), `test/unit/theme.test.ts` (neu)
  - Erfüllt: Grundlage für AK-1.1, AK-1.4, AK-1.5
  - Prüfung: Unit-Tests: `toPreference` (gültige Werte, Müll → `system`), `toThemeName`, `parseColorSchemeHint('"dark"')` → `dark`, ohne Anführungszeichen bzw. leer → `undefined`, `resolveTheme` für alle Kombinationen.
  - Ergebnis: 24 Unit-Tests in `test/unit/theme.test.ts` grün.

- [x] 2. Server bestimmt das Thema, Browser übernimmt es
  - Dateien: `app/composables/useColorTheme.ts` (neu), `app/plugins/vuetify.ts`
  - Erfüllt: AK-1.1, AK-1.2, AK-1.6
  - Prüfung: Playwright mit `colorScheme: 'dark'`: erster Aufruf ohne Cookie → nach dem Mounten `v-theme--dark`, Cookie `theme-system=dark` gesetzt, **keine** Hydration-Warnung. Zweiter Aufruf → schon das Server-HTML (`curl` mit dem Cookie) enthält `v-theme--dark`. `page.emulateMedia({ colorScheme: 'light' })` auf offener Seite → wechselt ohne Neuladen.
  - Ergebnis: Abweichung vom Design: Die Messung per `matchMedia` läuft in `onNuxtReady` statt `app:mounted`. Mit `app:mounted` gab es beim ersten Besuch mit dunklem System noch Hydration-Warnungen, weil Suspense-Inhalte danach hydrieren. Die Wahl liegt zusätzlich in `useState('theme:preference')`, damit Umschalter und Plugin denselben Zustand sehen.

- [x] 3. Client-Hint-Header
  - Dateien: `nuxt.config.ts` (`routeRules`)
  - Erfüllt: AK-1.5
  - Prüfung: `curl -I localhost:3000/` → `Accept-CH`, `Critical-CH`, `Vary` mit `Sec-CH-Prefers-Color-Scheme`, die übrigen Security-Header aus `nuxt-security` unverändert (`security.test.ts` grün). `curl` mit Header `Sec-CH-Prefers-Color-Scheme: "dark"` ohne Cookie → HTML mit `v-theme--dark`. Verdrängt `nuxt-security` die Header, stattdessen ein Nitro-Plugin (siehe Design).
  - Ergebnis: `curl -I` zeigt `Accept-CH`, `Critical-CH`, `Vary` mit `Sec-CH-Prefers-Color-Scheme`; CSP, `X-Frame-Options` usw. unverändert. Server-HTML: Header `"dark"` → dunkel; Cookie `theme=dark` → dunkel; `theme-system=dark` → dunkel; `theme=light` + Header dunkel → hell; ungültiges `theme` + `theme-system=dark` → dunkel.

- [x] 4. Umschalter in der App-Bar
  - Dateien: `app/components/ThemeSwitcher.vue` (neu), `app/layouts/default.vue`, `i18n/locales/de.json`, `i18n/locales/en.json`
  - Erfüllt: AK-1.4, AK-1.7
  - Prüfung: „Dunkel“ wählen → sofort dunkel, nach dem Neuladen weiter dunkel (auch als Gast), ohne Aufblitzen. „Wie System“ folgt wieder `matchMedia`. Bedienung per Tab/Enter/Pfeiltasten, `aria-label` vorhanden. i18n-Test grün. 360 px: `scrollWidth <= 360`.
  - Ergebnis: Siehe Abnahme. Texte `theme.*` in beiden Sprachdateien, i18n-Test grün.

- [x] 5. Abnahme
  - Erfüllt: alle
  - Prüfung: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` grün. Playwright-Durchlauf wie im Befund: alle Seiten, Gast und angemeldet, hell und dunkel → 0 Hydration-Warnungen (AK-1.3), Klasse und Hintergrund passend (AK-1.2). Dasselbe gegen den Production-Build. AKs einzeln vermerken; Testdaten aus der Dev-DB löschen.
  - Ergebnis (2026-10-23): `lint`, `typecheck`, `npm test` grün (siehe 07, gemeinsamer Lauf). Playwright in Dev **und** im Production-Build, je 17/17: Gast (11 Seiten) und angemeldet (13 Seiten, inkl. Bearbeiten/Historie von Zutat und Tee, Passwort) in hell und dunkel → 0 Hydration-Warnungen (AK-1.1, AK-1.3), `.v-application` durchgehend im passenden Thema, Hintergrund hell (>200) bzw. dunkel (<80) (AK-1.2). Umschalter „Dunkel“ wirkt sofort und gilt nach Neuladen schon im Server-HTML (AK-1.4, AK-1.5). Tastatur: Enter öffnet, Pfeiltasten und Enter wählen „Wie System“. „Wie System“ folgt `emulateMedia` hin und zurück ohne Neuladen (AK-1.6). 360 px ohne horizontales Scrollen, Umschalter sichtbar (AK-1.7). **Einschränkung:** Headless-Chromium schickt den Client-Hint beim allerersten Besuch nicht mit, das erste Server-HTML ist dort hell; den Hint-Weg belegt nur `curl` (Aufgabe 3). Ab dem zweiten Aufruf greift das Cookie `theme-system`. Testdaten `pw-chore06`/`pwc06` gelöscht.

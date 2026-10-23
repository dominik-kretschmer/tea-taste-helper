# Aufgaben: 07 – Eigene Fehlerseite und sichtbare Ladefehler

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-23)**

Reihenfolge:
- Fehlerseite → Ladefehler-Komponente → Listen → Abnahme.
- Commits `feat(00-chore/07): …`, nur mit ausdrücklich genannten Pfaden. `i18n/locales/*.json` und die Tee-Seiten ändert auch die Session für 04-Tees: nur eigene Abschnitte stagen oder abstimmen. Am besten erst umsetzen, wenn die Tee-Seiten aus 04 fertig sind.

- [x] 1. Fehlerseite
  - Dateien: `app/error.vue` (neu), `i18n/locales/de.json`, `i18n/locales/en.json` (`errorPage.*`), `app/pages/ingredients/[id]/index.vue`, `edit.vue`, `history.vue` und die entsprechenden Tee-Seiten (`statusMessage` nicht mehr übersetzen)
  - Erfüllt: AK-1.1, AK-1.2, AK-1.5
  - Prüfung: Zuerst prüfen, ob `/en/gibt-es-nicht` die Sprache Englisch erkennt (sonst Ausweg aus dem Design). `curl -i /gibt-es-nicht` → 404, „Seite nicht gefunden“, App-Bar; `/en/does-not-exist` → „Page not found“. Nicht vorhandene Zutat und nicht vorhandener Tee → 404, dieselbe Seite. Beide Buttons führen in der aktuellen Sprache zur Startseite bzw. Zutatenliste und verlassen den Fehlerzustand. Production-Build mit unerreichbarer DB, angemeldet → allgemeine Seite ohne Stacktrace. i18n-Test grün.
  - Ergebnis: `@nuxtjs/i18n` erkennt die Sprache auf der Fehlerseite aus dem Pfadpräfix, der Ausweg aus dem Design war nicht nötig. Die sechs Detailseiten werfen nur noch `createError({ statusCode, fatal: true })`.

- [x] 2. `LoadError` und Zutatenliste
  - Dateien: `app/components/LoadError.vue` (neu), `app/pages/ingredients/index.vue`, `i18n/locales/*.json` (`common.loadError`, `common.retry`)
  - Erfüllt: AK-1.3, AK-1.5
  - Prüfung: Server mit unerreichbarer DB, als Gast `/zutaten` → Fehlermeldung mit „Erneut versuchen“, nicht „Keine Zutaten gefunden“, keine Paginierung. DB starten, „Erneut versuchen“ → Liste erscheint.
  - Ergebnis: siehe Abnahme.

- [x] 3. Admin-Listen und Tee-Liste
  - Dateien: `app/pages/admin/users.vue`, `app/pages/admin/audit.vue`, `app/pages/teas/index.vue`
  - Erfüllt: AK-1.4
  - Prüfung: Als Admin anmelden, DB stoppen, Nutzer- und Audit-Liste neu laden bzw. blättern → `LoadError` statt leerer Tabelle, Suche und Filter bleiben sichtbar. Tee-Liste als Gast wie in Aufgabe 2.
  - Ergebnis: siehe Abnahme.

- [x] 4. Abnahme
  - Erfüllt: alle
  - Prüfung: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` grün. Playwright auf Deutsch und Englisch: Fehlerseite und `LoadError` bei 360 px ohne horizontales Scrollen, `securitypolicyviolation`-Listener ohne Treffer (außer zod-Eval, falls 08 noch offen). AKs einzeln vermerken.
  - Ergebnis (2026-10-23): `lint`, `typecheck`, `npm test` grün. Playwright gegen den Production-Build (15/15), die DB hinter einem TCP-Proxy im Testskript, damit „DB weg/da“ ohne Docker-Neustart ging: `/gibt-es-nicht`, `/en/does-not-exist`, nicht vorhandene Zutat und nicht vorhandener Tee → 404 mit übersetztem Titel, App-Bar und Sprachumschalter, keine Details im HTML (AK-1.1). Beide Buttons führen nach `/en` bzw. `/en/ingredients` und verlassen den Fehlerzustand. Angemeldet, DB weg → 500 mit „Etwas ist schiefgelaufen“, kein Stack, kein Prisma-Text (AK-1.2). Gast, DB weg: Zutaten- und Tee-Liste zeigen den Ladefehler statt „leer“; DB wieder da → „Erneut versuchen“ lädt (AK-1.3). Als Admin (per `ADMIN_EMAIL` am Testserver) Nutzer- und Audit-Liste mit Ladefehler statt Tabelle (AK-1.4). 360 px ohne horizontales Scrollen, 0 `securitypolicyviolation`, i18n-Test grün (AK-1.5). Testkonto `pw-chore07-admin-*` gelöscht.

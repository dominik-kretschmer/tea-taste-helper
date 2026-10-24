# 00 – Chore: Projektanalyse nach Slice 03

> Analyse vom 2026-10-23, Stand `5bc54f9`. Jedes Issue ist ein eigener Ordner und läuft nach dem Skill `spec-driven` (Anforderungen → Design → Aufgaben → Umsetzung), sofern nicht anders vereinbart.
> Status: **01–04, 06–08 und 10 umgesetzt (2026-10-23), 11 umgesetzt (2026-10-24)**, je mit eigenem Commit und Ergebnissen in der `tasks.md`. 09 ist mit 04-Tees erledigt. 05 (npm audit) ist geschlossen: Die einzige verbliebene Meldung (`node-forge`, nur Dev-Server, kein Patch) wird ignoriert, siehe [Begründung](05-chore-npm-audit/begruendung.md). Entscheidungen zu 01, 06 und 07 sind in den jeweiligen Anforderungen nachgetragen.

## Vorgehen

- Gesamten Code gelesen: `server/`, `app/`, `shared/`, `prisma/`, Tests, CI, Docker Compose, Konfiguration, Specs.
- Verdachtspunkte gezielt nachgestellt statt vermutet:
  - Production-Build (`node .output/server/index.mjs`) mit und ohne erreichbare DB
  - Grenzfälle per API
  - Playwright-Durchlauf über alle Seiten im hellen und dunklen Modus, als Gast und angemeldet
  - `npm audit`
  - veröffentlichte Docker-Ports
- Lint, Typecheck, 207 Tests und Build waren vorher grün. Keiner der Funde wird von den bestehenden Tests erfasst.

## Issues

Sortiert nach Dringlichkeit; Aufwand: XS < 1 h, S ≈ halber Tag, M ≈ ein Tag.

| Nr. | Ordner | Art | Dringlichkeit | Aufwand | Kurz |
|---|---|---|---|---|---|
| 01 | [`01-fehler-production-modus`](01-fehler-production-modus/requirements.md) | Fehler, Sicherheit | hoch | S | Gebauter Server ohne `NODE_ENV` läuft als „development“: Session-Cookie ohne `Secure`/`__Host-`, CSRF-Schlüssel nicht Pflicht, Logs nicht als JSON |
| 02 | [`02-sicherheit-docker-ports`](02-sicherheit-docker-ports/requirements.md) | Sicherheit | hoch | XS | Postgres, Ollama (ohne Auth) und Adminer lauschen auf allen Netzwerkschnittstellen |
| 03 | [`03-fehler-request-log`](03-fehler-request-log/requirements.md) | Fehler | mittel | XS | Fehlerantworten unter `/api` (4xx/5xx) bekommen keine Request-Logzeile (verletzt AK-4.1 aus 01) |
| 04 | [`04-fehler-zutat-namenslaenge`](04-fehler-zutat-namenslaenge/requirements.md) | Fehler | mittel | XS | Namen, die beim Kleinschreiben länger werden (z.B. „İ“), führen zu 500 |
| 05 | [`05-chore-npm-audit`](05-chore-npm-audit/requirements.md) – **geschlossen**, [Begründung](05-chore-npm-audit/begruendung.md) | Wartung, Sicherheit | mittel | S | `npm audit`: 11 × high (braces, micromatch, node-forge über nitropack/listhen); npm schlägt ein Downgrade auf Nuxt 4.1.3 vor |
| 06 | [`06-fehler-dunkelmodus`](06-fehler-dunkelmodus/requirements.md) | Fehler | mittel | S–M | `theme: 'system'` mit SSR: Hydration-Warnungen im dunklen Modus, die App bleibt trotzdem hell |
| 07 | [`07-fehlerseite`](07-fehlerseite/requirements.md) | UX | mittel | M | Keine eigene Fehlerseite (englisch, ohne Layout); die Zutatenliste verschluckt API-Fehler |
| 08 | [`08-chore-zod-csp`](08-chore-zod-csp/requirements.md) | Wartung | niedrig | XS | zod testet `new Function` → CSP-Verstoß `script-src eval` auf jeder Seite mit Formular |
| 09 | [`09-chore-vuetify-dense`](09-chore-vuetify-dense/requirements.md) ✅ erledigt mit 04-tees | Wartung | niedrig | XS | `<v-row dense>` in `IngredientForm` ist in Vuetify 4 veraltet (Konsolenwarnung) |
| 10 | [`10-ux-registrierung-redirect`](10-ux-registrierung-redirect/requirements.md) | UX | niedrig | XS | Registrieren ignoriert `?redirect`; der Weg „Anmelden → Noch kein Konto?“ verliert das Ziel |
| 11 | [`11-chore-prisma-schema-aufteilen`](11-chore-prisma-schema-aufteilen/requirements.md) | Wartung | niedrig | S | `schema.prisma` mit allen Tabellen in einer Datei; Aufteilung in `prisma/schema/` mit einer Datei pro Tabelle (nachgetragen am 2026-10-23) |
| 12 | [`12-chore-lesbarkeit`](12-chore-lesbarkeit/requirements.md) | Wartung | niedrig | S | Verschachtelte Ternaries, versteckte Regeln und wiederholte Aufrufe an 10 Stellen (u.a. `useFormErrors`, Audit-Log-Template); `no-nested-ternary` per ESLint (nachgetragen am 2026-10-23, Anforderungen als Entwurf) |
| 13 | [`13-fehler-admin-entsperren`](13-fehler-admin-entsperren/requirements.md) ✅ erledigt | Fehler | hoch | XS | Ein gesperrter Nutzer, der danach Admin wird (Beförderung oder `ADMIN_EMAIL`), lässt sich nicht entsperren (403); dazu `loadModerationTarget` für vier Moderationsrouten (Code-Review vom 2026-10-24) |
| 14 | [`14-chore-publish-save-tea-version`](14-chore-publish-save-tea-version/requirements.md) | Wartung | mittel | XS | `publish.post.ts` baut `saveTeaVersion` nach, ohne P2002-Behandlung (Code-Review vom 2026-10-24, Entwurf) |
| 15 | [`15-chore-translation-helper`](15-chore-translation-helper/requirements.md) | Wartung | mittel | XS | Umwandlung Übersetzungs-Zeilen ↔ Map sechsmal kopiert; `toTranslations`/`translationRows` in `server/utils/catalog.ts` (Code-Review vom 2026-10-24, Entwurf) |

Empfohlene Reihenfolge: 01 und 02 zuerst (Sicherheit), dann 03–05. Von den Funden aus dem Code-Review vom 2026-10-24 zuerst 13 (Konto kann dauerhaft gesperrt bleiben), dann 14 und 15. 06 und 07 brauchen je eine Entscheidung (siehe „Offene Fragen“ dort). 08–10 lassen sich zusammen in einem Durchgang erledigen.

## Korrektur an bestehenden Specs

- `03-zutaten/tasks.md`, Endabnahme: Dort stand, der Production-Server sei „mit Login (`__Host-session`)“ geprüft. Den Cookienamen hatte ich dabei nicht nachgesehen; ohne `NODE_ENV=production` heißt er `session` (siehe Issue 01). Die Aussage ist korrigiert.
- `02-auth-rollen/design.md` nimmt an, Nitro setze `NODE_ENV` beim Build fest auf `production`. Das gilt nur für Code, den der Build ersetzt (`nuxt.config.ts`), nicht für `useEnv()` zur Laufzeit. Wird mit Issue 01 korrigiert.

## Beobachtet, bewusst nicht aufgenommen

| Beobachtung | Warum kein Issue |
|---|---|
| Rate-Limits liegen im Speicher und gelten pro Prozess | So entschieden in 02 („Nicht im Umfang“), reicht für eine Instanz |
| Fünf Fehlversuche sperren eine E-Mail 15 Minuten, auch für den echten Nutzer | Bewusster Tausch gegen Durchprobieren (02, AK-8.1) |
| Suche und „ähnliche Namen“ sind öffentlich und ohne Rate-Limit | Bei der aktuellen Datenmenge unkritisch. Mit 05-Moderation geprüft (2026-10-24): 05 bringt keine neuen öffentlichen Suchrouten; Melden hat ein eigenes Limit (10/h), die Moderationssuche nutzt die bestehenden Listen. Mit dem Hosting erneut prüfen |
| Audit-Log ohne Aufbewahrungsfrist, `LOGIN_FAILED` speichert die eingegebene E-Mail | Gehört zu Slice 11 (DSGVO) |
| Ist die DB weg, rendern Seiten für angemeldete Nutzer einen 500er (Auth-Plugin) | Ohne DB funktioniert die App ohnehin nicht; die Fehlerseite verbessert Issue 07 |
| `PASSWORD_CHANGE_REQUIRED` sperrt auch öffentliche Lese-Routen für den betroffenen Nutzer | Gewollt, die UI leitet ohnehin auf den Passwortwechsel |

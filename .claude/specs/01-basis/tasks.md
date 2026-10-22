# Aufgaben: 01 – Basis

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-22)**

Reihenfolge:
- Infrastruktur → Werkzeuge → Server-Grundlagen → Tests → UI → CI → Doku.
- Zu jeder Aufgabe gehören ihre Unit-Tests, sobald Vitest eingerichtet ist (ab Aufgabe 4).
- Nach jeder Aufgabe gibt es einen Commit `feat(01-basis): <Aufgabe>`.
- Gepusht wird erst in Aufgabe 15, nach Rücksprache.
- Das Löschen der Volumes in Aufgabe 3 ist freigegeben und läuft ohne erneute Rückfrage.

- [x] 1. GPU-Prüfung und Anleitung
  - Dateien: `scripts/check-gpu.sh`, `docs/gpu-setup.md`
  - Erfüllt: AK-10.1, AK-10.2
  - Prüfung: `bash scripts/check-gpu.sh` meldet je Schritt `OK`/`FEHLT`. Fehlt etwas, arbeitet der Entwickler die Anleitung ab und startet das Skript erneut, bis alle Schritte `OK` melden. Erst dann folgt Aufgabe 3.

- [x] 2. Konfiguration
  - Dateien: `.env.example` (neu), `.env` (`N8N_ENCRYPTION_KEY` raus, `POSTGRES_DB`, `DATABASE_URL`, `TEST_DATABASE_URL`, `OLLAMA_URL`, `LOG_LEVEL` rein, vorhandene Zugangsdaten bleiben), `.gitignore`
  - Erfüllt: AK-3.1, AK-3.3
  - Prüfung: `.env.example` enthält alle Variablen aus dem Design und keine echten Secrets. `git status` zeigt `.env` nicht.

- [x] 3. Docker Compose umstellen
  - Dateien: `compose.yaml`, `compose.cpu.yaml` (neu), `docker/postgres/init/01-test-db.sql` (neu), `init/` (entfernen)
  - Erfüllt: AK-1.1, AK-1.2, AK-1.4, AK-10.3, AK-10.4
  - Ablauf:
    1. `compose.yaml` anpassen: n8n raus, `POSTGRES_DB`, Init-Pfad, GPU, feste Versionen.
    2. `docker compose config` muss fehlerfrei sein.
    3. `docker compose down --remove-orphans` → `docker volume rm tea-taste-helper_postgres_data tea-taste-helper_n8n_data` → `docker compose up -d`
  - Prüfung:
    - `docker compose ps`: `postgres` healthy, `ollama` und `adminer` laufen, kein `n8n`.
    - `psql -l` im Container listet `tea` und `tea_test`.
    - `docker compose exec ollama nvidia-smi` zeigt die RTX 5050.
    - `curl localhost:11434/api/tags` enthält `nomic-embed-text`.
    - Nach `docker compose restart` ist das Modell noch da.
    - `docker compose -f compose.yaml -f compose.cpu.yaml config` enthält für `ollama` keinen `deploy`-Block.

- [x] 4. Werkzeuge: Abhängigkeiten, Lint, Typecheck, Vitest
  - Dateien: `package.json` (Pakete, Scripts `lint`, `typecheck`, `test`), `eslint.config.mjs`, `nuxt.config.ts` (`@nuxt/eslint`), `vitest.config.ts` (zunächst nur Projekt `unit`)
  - Erfüllt: AK-8.1 (Grundlage), AK-9.2
  - Prüfung: `npm install` fehlerfrei. `npm run lint`, `npm run typecheck` und `npm test` laufen mit Exit-Code 0 durch, ein Platzhalter-Test darf dabei laufen.

- [x] 5. Env-Validierung
  - Dateien: `server/utils/env.ts`, `server/plugins/00.env.ts`, `test/unit/env.test.ts`
  - Erfüllt: AK-3.2
  - Prüfung:
    - Unit-Test: Eine gültige Umgebung wird geparst. Fehlt `DATABASE_URL` oder ist `LOG_LEVEL=foo`, nennt die Fehlermeldung den Variablennamen.
    - Manuell: `DATABASE_URL= npm run dev` bricht mit dieser Meldung ab.

- [x] 6. Prisma
  - Dateien: `prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/0001_init/migration.sql`, `server/utils/prisma.ts`, `package.json` (`postinstall`, `db:*`), `.gitignore` (`server/generated/`)
  - Erfüllt: AK-2.1, AK-2.2, AK-2.3
  - Prüfung:
    - `npm run db:migrate` läuft durch.
    - `SELECT extname FROM pg_extension` in `tea` enthält `vector`.
    - `npm run db:studio` startet.
    - `npm run db:reset` setzt die DB zurück und spielt die Migration erneut ein.
  - Ergebnis: Migration, Extension und Studio sind geprüft. `db:reset` wird von Prisma für KI-Agenten blockiert und braucht die ausdrückliche Zustimmung des Nutzers, deshalb prüft der Nutzer das selbst (offen).

- [x] 7. Logging
  - Dateien: `server/utils/logger.ts`, `server/plugins/request-logger.ts`, `test/unit/logger.test.ts`
  - Erfüllt: AK-4.1, AK-4.3, AK-4.4 (AK-4.2 per API-Test in Aufgabe 10)
  - Prüfung:
    - Unit-Test: `password`, `token`, `authorization` und `cookie` erscheinen als `[REDACTED]`.
    - Manuell: Ein `curl` auf eine `/api`-Route erzeugt eine Logzeile mit Methode, Pfad, Status, Dauer und Request-ID.
    - Mit `LOG_LEVEL=warn` fehlen die `info`-Zeilen.

- [x] 8. Fehlerbehandlung
  - Dateien: `server/utils/errors.ts`, `server/error.ts`, `server/api/[...].ts`, `nuxt.config.ts` (`nitro.errorHandler`), `test/unit/errors.test.ts`
  - Erfüllt: AK-5.1, AK-5.2, AK-5.3, AK-5.4
  - Prüfung:
    - Unit-Test für `toErrorResponse`:
      - `ZodError` → 400 `VALIDATION_ERROR` mit Feldern
      - `AppError` → eigener Status und Code
      - unbekannter Fehler → 500 `INTERNAL_ERROR` ohne Stack
    - Manuell: `curl -i localhost:3000/api/gibt-es-nicht` → 404 im Fehlerformat. Eine unbekannte Seite außerhalb von `/api` zeigt weiterhin die Nuxt-Fehlerseite.
  - Ergebnis: Die 404 ist geprüft, der 500er-Weg mit einer temporären Route ebenfalls (Antwort ohne Details, Stacktrace im Log). Die Nuxt-Fehlerseite für Nicht-API-Pfade wird in Aufgabe 11 geprüft, weil es erst dann Seiten-Routing gibt.

- [x] 9. Health-Endpunkt
  - Dateien: `server/utils/health.ts`, `server/api/health.get.ts`, `test/unit/health.test.ts`
  - Erfüllt: AK-6.1, AK-6.2
  - Prüfung:
    - Unit-Test: alles ok → 200; DB-Fehler bzw. Ollama-Fehler oder Timeout → 503 mit `"error"` beim betroffenen Dienst.
    - Manuell: `curl localhost:3000/api/health` → 200. Nach `docker compose stop ollama` → 503 mit `ollama: "error"`. Danach Ollama wieder starten.

- [x] 10. API-Tests gegen Test-DB
  - Dateien: `vitest.config.ts` (Projekt `api`), `test/setup/env.ts`, `test/setup/global-api.ts` (Migration auf `tea_test`, Ollama-Stub), `test/api/health.test.ts`, `test/api/errors.test.ts`
  - Erfüllt: AK-4.2, AK-8.1, AK-8.2, AK-8.3
  - Prüfung:
    - `npm test` führt `unit` und `api` aus, Exit-Code 0.
    - Die API-Tests prüfen `/api/health` → 200, die unbekannte Route → 404 im Format und den Header `X-Request-Id`.
    - Ohne `TEST_DATABASE_URL` brechen die API-Tests mit einer klaren Meldung ab.
    - Die Entwicklungsdatenbank `tea` bleibt unverändert.

- [x] 11. Vuetify-Grundlayout
  - Dateien: `app/plugins/vuetify.ts`, `app/layouts/default.vue`, `app/pages/index.vue`, `app/app.vue`, `nuxt.config.ts`
  - Erfüllt: AK-7.1, AK-7.5
  - Prüfung:
    - `localhost:3000` zeigt die App-Bar mit Titel und den Inhaltsbereich statt `NuxtWelcome`.
    - Keine Hydration-Warnungen in der Browser-Konsole.
    - Bei 360 px Breite gibt es keinen horizontalen Scrollbalken.
    - `/gibt-es-nicht` zeigt die Nuxt-Fehlerseite (HTML, 404), nicht das API-Fehlerformat (aus Aufgabe 8).

- [x] 12. Mehrsprachigkeit
  - Dateien: `nuxt.config.ts` (`@nuxtjs/i18n`), `i18n/locales/de.json`, `i18n/locales/en.json`, `app/components/LanguageSwitcher.vue`, Texte in Layout und Startseite, `test/unit/i18n.test.ts`
  - Erfüllt: AK-7.2, AK-7.3, AK-7.4
  - Prüfung:
    - `/` zeigt Deutsch, `/en` zeigt Englisch.
    - Ein Wechsel im Umschalter ändert alle Texte, und nach dem Neuladen bleibt die gewählte Sprache.
    - Unit-Test: `de.json` und `en.json` haben dieselben Schlüssel.
    - Im Template gibt es keine fest eingetragenen UI-Texte.

- [x] 13. CI und Dependabot
  - Dateien: `.github/workflows/ci.yml`, `.github/dependabot.yml`
  - Erfüllt: AK-9.1, AK-9.3
  - Prüfung: Beide YAML-Dateien sind gültig, z.B. mit `npx --yes yaml-lint` oder `actionlint`, falls vorhanden. Die Schritte in `ci.yml` entsprechen den lokalen Scripts. Der echte Lauf wird in Aufgabe 15 geprüft.

- [ ] 14. Dokumentation
  - Dateien: `README.md`, `.claude/skills/nuxt-dev/SKILL.md`
  - Erfüllt: AK-1.5
  - Prüfung:
    - Die README beschreibt Voraussetzungen (WSL, Docker, GPU-Anleitung) und den Start in der festen Reihenfolge `docker compose up -d` → `npm install` → `npm run db:migrate` → `npm run dev`.
    - Der Skill `nuxt-dev` nennt die neuen Befehle.

- [ ] 15. Abschluss
  - Erfüllt: alle AKs (Endabnahme)
  - Ablauf:
    1. `npm run lint`, `npm run typecheck`, `npm test` und `npm run build` laufen fehlerfrei.
    2. Hot Reload prüfen (AK-1.3): Text in `app/pages/index.vue` ändern, die Seite aktualisiert sich ohne Neustart.
    3. Jedes Akzeptanzkriterium AK-1.1 bis AK-10.4 einzeln prüfen und in einer Tabelle (AK | Ergebnis | Nachweis) melden.
    4. **Nach Rücksprache** auf `main` pushen und prüfen, dass der GitHub-Actions-Lauf grün ist (AK-9.1).
    5. Status in `requirements.md`, `design.md` und `tasks.md` auf „umgesetzt“ setzen.

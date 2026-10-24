---
name: nuxt-dev
description: Startet, baut und prüft die Nuxt-4-App "tea-taste-helper". Verwenden, wenn der Dev-Server gestartet, ein Production-Build erstellt oder geprüft werden soll, ob eine Änderung in der laufenden App funktioniert.
---

# Nuxt-App starten und bauen

Das Projekt ist eine Nuxt-4-App (Vue 3, Vuetify 4, @nuxtjs/i18n) mit Prisma 7 auf Postgres + pgvector und Ollama. Paketmanager: **npm**. Nuxt läuft direkt unter WSL, Postgres/Ollama/Adminer per Docker Compose.

## Projektstruktur

- `app/` – Frontend (`app/app.vue`, Seiten in `app/pages/`, Layout `app/layouts/default.vue`, Komponenten in `app/components/`, Vuetify-Plugin in `app/plugins/`)
- `i18n/locales/` – UI-Texte `de.json` / `en.json` (gleiche Schlüssel, keine festen Texte in Templates)
- `server/api/` – API-Routen; `server/utils/` – `useEnv`, `useLogger`, `usePrisma`, `AppError`, `checkHealth`, `requireUser`/`requireRole`, Sessions, Rate-Limit, `audit`
- `shared/` – Typen, Rollen (`hasRole`), zod-Schemas (`#shared/schemas/auth`) für Client und Server
- `prisma/` – Schema und Migrationen; generierter Client in `server/generated/` (nicht bearbeiten)
- `test/unit/`, `test/api/` – Vitest
- `nuxt.config.ts` – Nuxt-Konfiguration

## Befehle

| Zweck | Befehl |
|---|---|
| Dienste starten | `docker compose up -d` (ohne GPU: `-f compose.yaml -f compose.cpu.yaml`) |
| Abhängigkeiten | `npm install` |
| Migrationen anwenden | `npm run db:migrate` |
| Neue Migration erzeugen | `npx prisma migrate dev --create-only --name <name>`, SQL prüfen, dann `npm run db:migrate` |
| Dev-Server (Port 3000) | `npm run dev` |
| Lint / Typecheck | `npm run lint` / `npm run typecheck` |
| Tests | `npm test` |
| Production-Build | `npm run build` |
| Build-Vorschau | `npm run preview` |

## Vorgehen

1. `docker compose ps` prüfen; laufen `postgres` (healthy) und `ollama` nicht, `docker compose up -d`.
2. Fehlt `node_modules/`, zuerst `npm install` ausführen (erzeugt Prisma-Client und `.nuxt/`).
3. Den Dev-Server im Hintergrund starten (`npm run dev`). Erst prüfen, wenn eine Anfrage nicht mehr die Seite „Starting Nuxt…“ liefert – `Local:` erscheint früher.
4. Mit `curl http://localhost:3000/api/health` prüfen, ob DB und Ollama erreichbar sind. Seiten mit `-H 'Accept: text/html'` abrufen, sonst liefert Nuxt Fehler als JSON.
   - **Schreibende API-Aufrufe** (`POST`/`PUT`/`PATCH`/`DELETE`) brauchen ein CSRF-Token. Zuerst die Startseite mit Cookie-Jar laden, dann das Token aus `<meta name="csrf-token">` als Header `csrf-token` mitschicken:
     ```bash
     curl -s -c /tmp/jar -H 'Accept: text/html' localhost:3000/ | grep -o 'name="csrf-token" content="[^"]*"' | cut -d'"' -f4 > /tmp/csrf
     curl -s -b /tmp/jar -c /tmp/jar -H "csrf-token: $(cat /tmp/csrf)" -H 'content-type: application/json' \
       -d '{"email":"a@b.de","password":"…"}' localhost:3000/api/auth/login
     ```
   - Testkonten in der Entwicklungs-DB `tea` danach wieder löschen.
   - Seiten unter `/admin` brauchen einen Admin (`ADMIN_EMAIL`, siehe README).
5. Vor dem Abschluss `npm run lint`, `npm run typecheck`, `npm test` und `npm run build` ausführen.
6. Den Dev-Server danach wieder beenden – über seine PID bzw. Prozessgruppe, nicht mit `pkill -f`.

## Hinweise

- `.nuxt/`, `.output/`, `.data/` und `server/generated/` sind generiert und werden nicht von Hand bearbeitet.
- Geheimnisse gehören in `.env` (in `.gitignore`); Vorlage ist `.env.example`.
- Logs schreibt pino; im Dev-Modus über `pino-pretty` asynchron – beim Auslesen kurz warten.
- `npm run db:reset` wird von Prisma für KI-Agenten blockiert und braucht die ausdrückliche Zustimmung des Nutzers.
- Migrationen enthalten SQL, das Prisma nicht kennt: `pg_trgm` und die partiellen Unique-Indizes `IngredientVersion_current_key` (0003), `TeaVersion_current_key` (0004) und `Report_open_key` (0006) sowie die CHECK-Constraints `Ingredient_merged_not_hidden` und `Tea_merged_not_hidden` (0006), siehe README „Migrationen“. Neue Migrationen deshalb immer mit `--create-only` erzeugen und vor dem Anwenden prüfen, dass sie nichts davon löschen. Angewendete Migrationen nicht mehr ändern, auch keine Kommentare – sonst stimmt die Prüfsumme nicht und `migrate dev` verlangt ein Zurücksetzen.
- Sichtbarkeit von Tees: Fremde private Tees gelten überall als nicht vorhanden (404, nicht in Listen). Abfragen auf Tees deshalb nur über `server/utils/teas.ts` (`loadCurrentTea`, `listTeas`), nie direkt über Prisma.
- Ausgeblendete und zusammengeführte Einträge (05) gelten ebenfalls als nicht vorhanden. Neue Abfragen auf Zutaten oder Tees schließen sie über `ENTRY_ACTIVE` (Prisma) bzw. `activeSql('i' | 't')` (SQL) aus `server/utils/catalog.ts` aus; `loadCurrent`/`loadCurrentTea` tun das schon, außer mit `includeInactive`.
- Inhalte von Zutaten und Tees werden nur über `saveIngredientVersion`/`saveTeaVersion` geändert (Diff, Konfliktschutz, Duplikatregel); Rechte, Rate-Limit und Audit bleiben bei der Route.
- Dialoge, die per `v-if` erst beim Öffnen eingebunden werden, setzen ihren Zustand mit `watch(open, …, { immediate: true })` zurück – sonst bekommen sie die Öffnung nicht mit.
- Komponenten in Unterordnern bekommen den Ordner als Präfix: `components/catalog/RevisionDiff.vue` heißt `<CatalogRevisionDiff>`. Ein falscher Name fällt nicht im Typecheck auf, nur als Vue-Warnung im Dev-Log.
- Läuft bereits ein Dev-Server des Nutzers, keinen zweiten starten (beide schreiben in `.nuxt/`); stattdessen dessen Port nutzen.
- Neue Dateien unter `app/pages/` übernimmt ein laufender Dev-Server nicht immer zuverlässig. Bei 404 auf eine neue Seite den Dev-Server neu starten.
- Rate-Limits liegen im Speicher. Viele Test-Registrierungen von `localhost` lösen nach 5 pro Stunde 429 aus, ein Neustart des Dev-Servers setzt die Zähler zurück.
- Die API-Tests laufen gegen einen Production-Build (Cookie `__Host-session`) und höchstens zwei Testdateien parallel, weil sonst der Speicher nicht reicht.

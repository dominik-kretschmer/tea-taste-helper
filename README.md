# Tea Taste Helper

Web-App, die Tees anhand von Bewertungen, Zutaten-Vorlieben und Stimmung empfiehlt oder eigene Mischungen aus dem Vorrat zusammenstellt. Gesamtkonzept: [`.claude/specs/00 – Overview: tea-taste-helper.md`](.claude/specs/).

**Stack:** Nuxt 4 (Vue 3, Nitro) · Vuetify 4 · @nuxtjs/i18n (de/en) · Prisma 7 · Postgres 17 + pgvector · Ollama · pino · zod · Vitest

## Voraussetzungen

- WSL2 (Ubuntu) mit Node.js 22
- Docker Desktop mit WSL2-Integration (oder Docker Engine in WSL)
- Für Ollama mit GPU: NVIDIA-Treiber unter Windows, siehe [docs/gpu-setup.md](docs/gpu-setup.md). Prüfen mit `bash scripts/check-gpu.sh`.

## Start

```bash
cp .env.example .env        # einmalig; Passwort anpassen
docker compose up -d        # Postgres, Ollama, Adminer
npm install                 # erzeugt auch Prisma-Client und .nuxt
npm run db:migrate          # Migrationen anwenden
npm run dev                 # http://localhost:3000
```

Ohne GPU: `docker compose -f compose.yaml -f compose.cpu.yaml up -d`

| Dienst | Adresse |
|---|---|
| App | http://localhost:3000 (Deutsch), http://localhost:3000/en (Englisch) |
| Health | http://localhost:3000/api/health |
| Postgres | `localhost:5432`, Datenbanken `tea` (Entwicklung) und `tea_test` (Tests) |
| Ollama | http://localhost:11434 (Embedding-Modell `nomic-embed-text` wird beim Start geladen) |
| Adminer | http://localhost:8080 |

Die Datenbank `tea_test` legt das Init-Skript in `docker/postgres/init/` nur bei einem **leeren** Postgres-Volume an. Fehlt sie, das Volume neu anlegen (löscht alle lokalen DB-Daten):

```bash
docker compose down && docker volume rm tea-taste-helper_postgres_data && docker compose up -d
```

## Scripts

| Script | Zweck |
|---|---|
| `npm run dev` | Dev-Server mit Hot Reload |
| `npm run build` / `npm run preview` | Production-Build bauen / lokal starten |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript-Prüfung (`nuxt typecheck`) |
| `npm test` | Unit- und API-Tests (API-Tests gegen `TEST_DATABASE_URL`, Ollama wird gestubbt) |
| `npm run db:migrate` | Migrationen erstellen/anwenden (Entwicklung) |
| `npm run db:deploy` | Migrationen anwenden (ohne neue zu erstellen) |
| `npm run db:reset` | Datenbank zurücksetzen und Migrationen neu einspielen |
| `npm run db:studio` | Prisma Studio |

## Konfiguration

Alle Variablen stehen in [`.env.example`](.env.example). Der Server prüft sie beim Start und bricht mit dem Namen der fehlerhaften Variable ab.

## Projektstruktur

```
app/                 Frontend (Seiten, Layouts, Komponenten, Plugins)
i18n/locales/        UI-Texte (de.json, en.json – gleiche Schlüssel)
server/api/          API-Routen (Nitro)
server/utils/        Env, Logger, Prisma, Fehler, Health
server/plugins/      Env-Prüfung, Request-Logging
prisma/              Schema und Migrationen
test/                unit/, api/, setup/
docker/              Init-Skripte für Postgres
.claude/specs/       Spezifikationen (Spec-Driven Development)
```

## API-Fehlerformat

Alle Fehler unter `/api/` haben dieses Format; jede Antwort trägt den Header `X-Request-Id`, der auch in allen Logzeilen der Anfrage steht.

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "requestId": "…", "details": { } } }
```

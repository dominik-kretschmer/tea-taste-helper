# Design: 01 – Basis

> Phase 2 zu [requirements.md](requirements.md). Status: **freigegeben (2026-10-22)**

## Überblick

Ausgangslage:
- **Nuxt:** unveränderter Nuxt-4-Starter (`app/app.vue` mit `NuxtWelcome`, kein `server/`).
- **`compose.yaml`:** vorhanden und läuft. Dienste `postgres` (pgvector pg17, DB `n8n`), `n8n`, `ollama` (GPU auskommentiert), `ollama-pull` (lädt `nomic-embed-text`) und `adminer`. Images stehen auf `latest`.
- **`.env`:** vorhanden mit `POSTGRES_USER`, `POSTGRES_PASSWORD`, `N8N_ENCRYPTION_KEY`.
- **`./init`:** leer und gehört `root`. Docker hat es beim Mounten angelegt.

01 passt die bestehenden Dateien an, statt sie neu zu schreiben:
- n8n entfällt (Overview §9).
- Postgres bekommt die Datenbanken `tea` und `tea_test`.
- Ollama nutzt die GPU.
- Die Images bekommen feste Versionen.

```
WSL
├─ npm run dev  ── Nuxt 4 (SSR + Nitro)  :3000
│                  ├─ Nitro-Plugins: Env-Prüfung, Request-Logging (pino, Request-ID)
│                  ├─ Error-Handler: einheitliches JSON-Fehlerformat für /api
│                  ├─ /api/health ──► Prisma ──► postgres
│                  │              └─► fetch  ──► ollama
│                  └─ UI: Vuetify-Layout + @nuxtjs/i18n (de/en)
└─ docker compose
   ├─ postgres     pgvector/pgvector:pg17  :5432  (Datenbanken tea + tea_test)
   ├─ ollama       ollama/ollama           :11434 (NVIDIA-GPU, CPU-Fallback per Override)
   ├─ ollama-pull  einmalig: ollama pull nomic-embed-text
   └─ adminer      adminer                 :8080  (DB-Weboberfläche)
```

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `compose.yaml` | geändert | n8n entfernen, `POSTGRES_DB` → `tea`, Init-Pfad, GPU aktivieren, feste Image-Versionen |
| `compose.cpu.yaml` | neu | Override: Ollama ohne GPU |
| `init/` | entfernt | leeres, root-eigenes Verzeichnis; wird durch `docker/postgres/init/` ersetzt |
| `docker/postgres/init/01-test-db.sql` | neu | legt beim ersten Start die Datenbank `tea_test` an |
| `.env.example` | neu | Vorlage aller Variablen |
| `.env` | geändert | `N8N_ENCRYPTION_KEY` entfernen, neue Variablen ergänzen; bestehende Zugangsdaten bleiben |
| `.gitignore` | geändert | generierter Prisma-Client |
| `package.json` | geändert | Abhängigkeiten, Scripts |
| `nuxt.config.ts` | geändert | Module (i18n, eslint), Vuetify, Nitro-Error-Handler |
| `prisma.config.ts` | neu | Prisma-7-Konfiguration (Schema-Pfad, Migrationen, `DATABASE_URL`) |
| `prisma/schema.prisma` | neu | Datasource + Generator, noch keine Modelle |
| `prisma/migrations/0001_init/migration.sql` | neu | `CREATE EXTENSION IF NOT EXISTS vector;` |
| `server/utils/env.ts` | neu | zod-Schema + `parseEnv()` + `useEnv()` |
| `server/utils/logger.ts` | neu | pino-Basislogger mit Redaction |
| `server/utils/prisma.ts` | neu | gemeinsame Prisma-Instanz |
| `server/utils/errors.ts` | neu | `AppError`, `toErrorResponse()` |
| `server/utils/health.ts` | neu | `checkHealth()` mit austauschbaren Prüfungen |
| `server/plugins/00.env.ts` | neu | prüft die Umgebung beim Serverstart |
| `server/plugins/request-logger.ts` | neu | Request-ID, Kind-Logger, Log je Anfrage |
| `server/error.ts` | neu | Nitro-Error-Handler für `/api/**` |
| `server/api/health.get.ts` | neu | Health-Endpunkt |
| `server/api/[...].ts` | neu | 404 für unbekannte API-Routen |
| `app/app.vue` | geändert | `NuxtLayout` + `NuxtPage` statt `NuxtWelcome` |
| `app/plugins/vuetify.ts` | neu | Vuetify mit SSR und MDI-SVG-Icons |
| `app/layouts/default.vue` | neu | `v-app`, App-Bar, Inhaltsbereich |
| `app/components/LanguageSwitcher.vue` | neu | Sprachauswahl |
| `app/pages/index.vue` | neu | Startseite (Platzhalter mit Begrüßung) |
| `i18n/locales/de.json`, `en.json` | neu | UI-Texte |
| `eslint.config.mjs` | neu | Lint-Regeln aus `@nuxt/eslint` |
| `vitest.config.ts` | neu | Projekte `unit` und `api` |
| `test/setup/*.ts` | neu | Test-Env, Migrationen auf Test-DB, Ollama-Stub |
| `test/unit/*.test.ts`, `test/api/*.test.ts` | neu | Tests (siehe unten) |
| `.github/workflows/ci.yml` | neu | lint → typecheck → test |
| `.github/dependabot.yml` | neu | npm + GitHub Actions + Docker-Images, wöchentlich |
| `scripts/check-gpu.sh` | neu | Prüfskript GPU-Kette |
| `docs/gpu-setup.md` | neu | Installationsanleitung NVIDIA Container Toolkit unter WSL2 |
| `README.md` | geändert | Projektbeschreibung, Setup in fester Reihenfolge |
| `.claude/skills/nuxt-dev/SKILL.md` | geändert | neue Befehle und Struktur |

## Abhängigkeiten

| Paket | Version | Art |
|---|---|---|
| `@prisma/client`, `@prisma/adapter-pg`, `pg` | 7.10.x | dependency |
| `prisma` | 7.10.x | dev |
| `zod` | 4.x | dependency |
| `pino` | 10.x | dependency |
| `pino-pretty` | 13.x | dev |
| `vuetify` | 4.x, `vite-plugin-vuetify` 2.x | dependency / dev |
| `@mdi/js` | aktuell | dependency |
| `@nuxtjs/i18n` | 10.x | dependency |
| `@nuxt/eslint`, `eslint` | 1.x / 10.x | dev |
| `typescript`, `vue-tsc` | aktuell | dev (für `nuxt typecheck`) |
| `vitest` 5.x, `@nuxt/test-utils` 4.x, `@vue/test-utils` | | dev |
| `dotenv` | aktuell | dev (lädt `.env` in `prisma.config.ts` und Tests) |

## Docker Compose

Änderungen an der bestehenden `compose.yaml`. Dienstnamen und Volume-Namen bleiben gleich, damit das Ollama-Volume mit `nomic-embed-text` erhalten bleibt.

| Dienst | Änderung |
|---|---|
| `postgres` | `POSTGRES_DB: ${POSTGRES_DB}` (= `tea`) statt `n8n`; Healthcheck auf `${POSTGRES_DB}`; Init-Mount `./docker/postgres/init` statt `./init` |
| `n8n` | entfernt, ebenso Volume `n8n_data` |
| `ollama` | GPU-Block aktiviert (`driver: nvidia, count: all, capabilities: [gpu]`); feste Version statt `latest` |
| `ollama-pull` | bleibt; feste Version wie `ollama`; sonst unverändert |
| `adminer` | bleibt; feste Version statt `latest` |

- `restart: unless-stopped` bleibt bei allen Dauerdiensten.
- Die festen Versionen werden bei der Umsetzung auf den dann aktuellen stabilen Tag gesetzt. Dependabot hält sie danach aktuell.
- `compose.cpu.yaml` setzt `deploy: !reset {}` für `ollama`. Aufruf: `docker compose -f compose.yaml -f compose.cpu.yaml up -d`.
- `docker/postgres/init/01-test-db.sql`: `CREATE DATABASE tea_test;`

### Umstellung des laufenden Stacks (einmalig)

Das bestehende Postgres-Volume wurde mit der DB `n8n` initialisiert, Init-Skripte laufen dort nicht mehr. Freigegeben am 2026-10-22: Das Volume wird neu angelegt, die n8n-Daten entfallen.

1. `docker compose down --remove-orphans` stoppt alle Dienste und entfernt den n8n-Container.
2. `docker volume rm tea-taste-helper_postgres_data tea-taste-helper_n8n_data` löscht die beiden Volumes. `tea-taste-helper_ollama_data` bleibt erhalten.
3. `docker compose up -d` legt Postgres neu an, das Init-Skript erzeugt `tea_test`.

Schritt 2 löscht Daten; das ist vom Nutzer freigegeben und läuft ohne erneute Rückfrage (2026-10-22).

## Konfiguration

`.env` behält die vorhandenen Werte von `POSTGRES_USER` und `POSTGRES_PASSWORD`. `N8N_ENCRYPTION_KEY` entfällt. Neu hinzu kommen die übrigen Variablen aus `.env.example`, wobei die URLs die vorhandenen Zugangsdaten verwenden.

`.env.example`:

```dotenv
POSTGRES_USER=tea
POSTGRES_PASSWORD=change-me
POSTGRES_DB=tea
DATABASE_URL=postgresql://tea:change-me@localhost:5432/tea
TEST_DATABASE_URL=postgresql://tea:change-me@localhost:5432/tea_test
OLLAMA_URL=http://localhost:11434
LOG_LEVEL=info
```

`server/utils/env.ts`:

```ts
export const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  OLLAMA_URL: z.url().default('http://localhost:11434'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})
export type Env = z.infer<typeof envSchema>
export function parseEnv(source: Record<string, string | undefined>): Env   // wirft Fehler mit Variablennamen
export function useEnv(): Env                                                // einmal geparst, gecacht
```

`server/plugins/00.env.ts` ruft `parseEnv(process.env)` auf. Bei einem Fehler wird jede fehlerhafte Variable mit Namen geloggt, dann folgt `process.exit(1)`.

## Datenbank (Prisma 7)

- `prisma/schema.prisma`: `datasource db { provider = "postgresql" }`, `generator client { provider = "prisma-client", output = "../server/generated/prisma" }`. Noch keine Modelle.
- `prisma.config.ts` lädt `.env` per `dotenv/config` und setzt `datasource.url` auf `DATABASE_URL`.
- Die Migration `0001_init` enthält nur `CREATE EXTENSION IF NOT EXISTS vector;` und wird mit `prisma migrate dev --create-only` angelegt und dann von Hand gefüllt.
- `server/utils/prisma.ts`: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`. Die Instanz wird auf `globalThis` gecacht, damit HMR keine neuen Verbindungen öffnet (AK-2.2).
- Der generierte Client kommt nach `.gitignore`. `postinstall` erzeugt ihn: `prisma generate && nuxt prepare`.

## Logging

- `server/utils/logger.ts` erzeugt `pino({ level, redact: { paths, censor: '[REDACTED]' } })`. Die Pfade decken `password`, `token`, `authorization`, `cookie` auf oberster Ebene, in `*.` und in `req.headers.*` ab. In der Entwicklung wird über `pino-pretty` ausgegeben, sonst als JSON.
- `server/plugins/request-logger.ts` hängt sich an die Nitro-Hooks:
  - `request`: Request-ID übernehmen (eingehender Header `X-Request-Id`, nur wenn UUID-Format) oder `crypto.randomUUID()`. Dann `event.context.requestId`, `event.context.log = logger.child({ requestId })`, Startzeit setzen und den Header `X-Request-Id` an die Antwort hängen.
  - `afterResponse`: Für `/api/**` eine Zeile `{ method, path, status, durationMs }` loggen.
  - `error`: Fehler mit Stacktrace über den Kind-Logger loggen.

## Fehlerbehandlung

```ts
// server/utils/errors.ts
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {}
}
export interface ErrorBody { error: { code: string; message: string; requestId: string; details?: unknown } }
export function toErrorResponse(err: unknown, requestId: string): { status: number; body: ErrorBody }
```

Zuordnung in `toErrorResponse`:

| Fehler | Status | Code | `details` |
|---|---|---|---|
| `ZodError` | 400 | `VALIDATION_ERROR` | `z.flattenError(err).fieldErrors` |
| `AppError` | `err.status` | `err.code` | `err.details` |
| H3-Fehler mit 404 | 404 | `NOT_FOUND` | – |
| sonstige H3-Fehler (4xx) | Status übernehmen | `HTTP_<status>` | – |
| alles andere | 500 | `INTERNAL_ERROR` | – (Nachricht fest: „Internal server error“) |

- `server/error.ts` (`nitro.errorHandler`): Bei Pfaden unter `/api/` wird die Antwort aus `toErrorResponse` geschrieben. Andere Pfade gibt der Handler an den Standard-Handler von Nuxt weiter, der die Fehlerseite rendert.
- `server/api/[...].ts` wirft für alle nicht gefundenen API-Routen `new AppError(404, 'NOT_FOUND', …)`.
- Eingaben werden später mit `readValidatedBody(event, schema.parse)` bzw. `getValidatedQuery` geprüft. Ein `ZodError` landet automatisch im Handler.

## API

| Methode | Route | Request | Response | Fehler |
|---|---|---|---|---|
| GET | `/api/health` | – | `200 { status: "ok", db: "ok", ollama: "ok" }` | `503 { status: "error", db: "ok"\|"error", ollama: "ok"\|"error" }` |
| * | `/api/<unbekannt>` | – | – | `404 NOT_FOUND` |

`checkHealth({ db, ollama })` bekommt die Prüfungen als Funktionen übergeben und gibt `{ status, body }` zurück. Damit lassen sich alle Fälle ohne echte Dienste testen.
- DB-Prüfung: `prisma.$queryRaw\`SELECT 1\``
- Ollama-Prüfung: `fetch(\`${OLLAMA_URL}/api/version\`)`

Beide Prüfungen laufen parallel mit 2 s Timeout.

## UI & i18n

- `nuxt.config.ts`:
  - `build.transpile: ['vuetify']`, `vite-plugin-vuetify` mit `autoImport`.
  - `i18n: { strategy: 'prefix_except_default', defaultLocale: 'de', locales: [{ code: 'de', language: 'de-DE', file: 'de.json' }, { code: 'en', language: 'en-US', file: 'en.json' }], detectBrowserLanguage: { useCookie: true, cookieKey: 'i18n_redirected', redirectOn: 'root' } }`.
- `app/plugins/vuetify.ts`: `createVuetify({ ssr: true, icons: { defaultSet: 'mdi', aliases, sets: { mdi } } })` mit `mdi-svg`. Hell/Dunkel folgt dem System.
- `app/layouts/default.vue`:
  - `v-app` → `v-app-bar` mit Titel `$t('app.name')` und `LanguageSwitcher` → `v-main` → `v-container` mit `<slot />`.
  - Nur responsive Vuetify-Komponenten, keine festen Breiten (AK-7.5).
- `LanguageSwitcher.vue`: `v-menu` mit Icon-Button (`mdiTranslate`) und einem Eintrag pro Sprache, umgeschaltet über `setLocale()`. Das Cookie hält die Wahl fest (AK-7.3).
- Sprachdateien enthalten zunächst `app.name`, `app.tagline`, `nav.language`, `home.title`, `home.intro`, `language.de`, `language.en`.

## Tests

`vitest.config.ts` mit zwei Projekten:

| Projekt | Dateien | Umgebung | Inhalt |
|---|---|---|---|
| `unit` | `test/unit/**` | node | `parseEnv` (gültig, fehlende/ungültige Variable → Name in Meldung), `toErrorResponse` (Zod → 400, `AppError`, unbekannt → 500 ohne Stack), `checkHealth` (ok/503 je Dienst), Logger-Redaction, gleiche Schlüssel in `de.json` und `en.json` |
| `api` | `test/api/**` | `@nuxt/test-utils/e2e` (`setup({ server: true })`) | `GET /api/health` → 200, `GET /api/gibt-es-nicht` → 404 im Fehlerformat, Header `X-Request-Id` vorhanden |

- `test/setup/env.ts` lädt `.env` und setzt `DATABASE_URL = TEST_DATABASE_URL` (AK-8.2). Fehlt `TEST_DATABASE_URL`, brechen die API-Tests ab, statt auf die Entwicklungsdatenbank auszuweichen.
- Das Global-Setup des `api`-Projekts führt `prisma migrate deploy` auf der Test-DB aus und startet einen Ollama-Stub auf einem freien Port. Der Stub ist ein `node:http`-Server, der `/api/version` beantwortet, und `OLLAMA_URL` zeigt auf ihn. So brauchen Tests und CI kein echtes Ollama.

## CI

`.github/workflows/ci.yml`:
- Auslöser: `push` auf `main`, `pull_request` gegen `main`.
- Ein Job auf `ubuntu-latest` mit dem Service `postgres` (`pgvector/pgvector:pg17`, Healthcheck).
- Schritte: Checkout → Node 22 mit npm-Cache → `npm ci` → `npm run lint` → `npm run typecheck` → `npm test`.
- `TEST_DATABASE_URL` und `DATABASE_URL` zeigen als Job-Umgebung auf den Service.

`.github/dependabot.yml`: Ökosysteme `npm`, `github-actions` und `docker-compose` (feste Image-Versionen), Intervall `weekly`.

## Scripts (`package.json`)

| Script | Befehl |
|---|---|
| `dev` / `build` / `preview` / `generate` | wie bisher |
| `postinstall` | `prisma generate && nuxt prepare` |
| `lint` | `eslint .` |
| `typecheck` | `nuxt typecheck` |
| `test` | `vitest run` |
| `db:migrate` | `prisma migrate dev` |
| `db:deploy` | `prisma migrate deploy` |
| `db:reset` | `prisma migrate reset` |
| `db:studio` | `prisma studio` |

## GPU

`scripts/check-gpu.sh` (bash, `set -u`, ohne `sudo`, ändert nichts am System) prüft nacheinander:

1. `nvidia-smi` in WSL → Windows-Treiber vorhanden
2. `nvidia-ctk --version` → Container Toolkit installiert
3. `docker info` enthält Runtime `nvidia` → Docker konfiguriert
4. `docker run --rm --gpus all ubuntu nvidia-smi -L` → GPU im Container sichtbar

Jeder Schritt meldet `OK` oder `FEHLT → docs/gpu-setup.md#<abschnitt>`. Der Exit-Code ist ≠ 0, sobald ein Schritt fehlt.

`docs/gpu-setup.md` hat je Schritt einen Abschnitt:
- Treiber: kommt aus Windows, nicht in WSL installieren
- Repo + `nvidia-container-toolkit` per apt installieren
- `sudo nvidia-ctk runtime configure --runtime=docker` und Docker neu starten (Docker Desktop vs. Docker Engine in WSL)
- Prüfung
- Häufige Fehler

Stand 2026-10-22 auf dem Entwicklungsrechner: Schritt 1 und 3 sind erfüllt, 2 und 4 noch ungeprüft.

## Entscheidungen

- **Prisma 7.10 statt `latest`:** Das `latest`-Tag zeigt aktuell auf `8.0.0-rc.25`, eine Vorabversion. Verworfen: Prisma 8 RC.
- **Env über `process.env` + zod statt `runtimeConfig`:** Prisma-CLI, Tests und Server lesen dieselben Variablennamen (`DATABASE_URL`), und die Prüfung beim Start ist explizit. Verworfen: `NUXT_`-Präfix-Variablen, weil die Prisma-CLI sie nicht kennt.
- **Bestehende `compose.yaml` anpassen statt neu schreiben:** Dienst- und Volume-Namen bleiben (`postgres`, `ollama_data`), das geladene Modell bleibt erhalten. Verworfen: Umbenennen in `db`.
- **Postgres-Volume neu anlegen** (Entscheidung des Nutzers): sauberer Ausgangszustand ohne n8n-Altlast, Init-Skript greift. Verworfen: Datenbanken per Hand im bestehenden Volume anlegen.
- **`adminer` und `ollama-pull` bleiben** (Entscheidung des Nutzers). `ollama-pull` lädt weiterhin nur `nomic-embed-text`; weitere Modelle kommen mit Slice 09/10.
- **Init-Skripte unter `docker/postgres/init/`** statt `./init`: Das alte Verzeichnis gehört `root`, und ein eigener Ordner `docker/` hält die Projektwurzel aufgeräumt.
- **Eine Postgres-Instanz mit zwei Datenbanken** (`tea`, `tea_test`). Verworfen: ein zweiter Container, der mehr Ressourcen braucht und für Tests keinen Vorteil bringt.
- **Ollama in Tests gestubbt:** Die CI hat keine GPU, und die Health-Tests sollen ohne Modell schnell laufen. Verworfen: Ollama-Container in der CI.
- **GPU als Standard, CPU per Override:** Das entspricht der Zielumgebung. Verworfen: Compose-Profile, weil sie zwei Ollama-Dienste mit unterschiedlichen Namen erfordern.
- **pg17 statt pg18:** Das pgvector-Image ist für 17 lange etabliert. Ein Wechsel ist später per Dump möglich.
- **Fehlerformat zentral im Nitro-Error-Handler**, nicht in jeder Route. Verworfen: Wrapper um jeden Handler.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-1.1 | `compose.yaml` (postgres, ollama, ollama-pull, adminer, Ports), Umstellung des Stacks |
| AK-1.2 | Volumes `postgres_data`, `ollama_data` |
| AK-1.3 | `npm run dev` unter WSL (Nuxt-HMR) |
| AK-1.4 | Healthcheck `pg_isready` in `compose.yaml` |
| AK-1.5 | `README.md` |
| AK-2.1 | Migration `0001_init` |
| AK-2.2 | `server/utils/prisma.ts` (globalThis-Singleton) |
| AK-2.3 | Scripts `db:migrate`, `db:reset`, `db:studio` |
| AK-3.1 | `.env.example` |
| AK-3.2 | `server/utils/env.ts`, `server/plugins/00.env.ts`, Unit-Test |
| AK-3.3 | `.gitignore` (`.env` schon enthalten) |
| AK-4.1 | `server/plugins/request-logger.ts` (`afterResponse`) |
| AK-4.2 | `server/plugins/request-logger.ts` (`request`), API-Test |
| AK-4.3 | `server/utils/logger.ts` (`redact`), Unit-Test |
| AK-4.4 | `LOG_LEVEL` → pino `level` |
| AK-5.1 | `server/utils/errors.ts`, `server/error.ts` |
| AK-5.2 | Zuordnung `ZodError` → 400, Unit-Test |
| AK-5.3 | Zuordnung unbekannt → 500, Stacktrace nur über Logger, Unit-Test |
| AK-5.4 | `server/api/[...].ts`, API-Test |
| AK-6.1 | `server/api/health.get.ts`, `checkHealth`, API-Test |
| AK-6.2 | `checkHealth` (503), Unit-Test |
| AK-7.1 | `app/app.vue`, `app/layouts/default.vue`, `app/plugins/vuetify.ts` |
| AK-7.2 | i18n-Konfiguration (`prefix_except_default`, `defaultLocale: 'de'`) |
| AK-7.3 | `LanguageSwitcher.vue` + Cookie `i18n_redirected` |
| AK-7.4 | `i18n/locales/*.json`, Unit-Test Schlüsselgleichheit |
| AK-7.5 | responsive Layout, manuelle Prüfung bei 360 px |
| AK-8.1 | `vitest.config.ts`, Script `test` |
| AK-8.2 | `test/setup/env.ts` (Abbruch ohne `TEST_DATABASE_URL`) |
| AK-8.3 | Tests siehe Abschnitt „Tests“ |
| AK-9.1 | `.github/workflows/ci.yml` |
| AK-9.2 | gleiche Scripts lokal und in der CI |
| AK-9.3 | `.github/dependabot.yml` |
| AK-10.1 | `scripts/check-gpu.sh` |
| AK-10.2 | `docs/gpu-setup.md` |
| AK-10.3 | GPU-Reservierung in `compose.yaml` |
| AK-10.4 | `compose.cpu.yaml` |

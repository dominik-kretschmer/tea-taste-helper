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
| `npm run db:migrate` | Migrationen erstellen/anwenden und Prisma-Client erzeugen (Entwicklung) |
| `npm run db:deploy` | Migrationen anwenden (ohne neue zu erstellen) |
| `npm run db:reset` | Datenbank zurücksetzen und Migrationen neu einspielen |
| `npm run db:studio` | Prisma Studio |

## Konfiguration

Alle Variablen stehen in [`.env.example`](.env.example). Der Server prüft sie beim Start und bricht mit dem Namen der fehlerhaften Variable ab.

| Variable | Bedeutung |
|---|---|
| `ADMIN_EMAIL` | Wer sich mit dieser Adresse registriert, wird Admin. Ein bestehendes Konto mit dieser Adresse wird beim Serverstart befördert. |
| `TRUST_PROXY` | `true` nur hinter genau einem Reverse Proxy. Dann zählt der letzte `X-Forwarded-For`-Eintrag als Client-IP (Rate-Limits, Audit-Log). **Lokal mit `npm run dev` auf `true`**, weil `nuxt dev` selbst als Proxy vorgeschaltet ist. |
| `NUXT_CSURF_ENCRYPT_SECRET` | Schlüssel für CSRF-Tokens, genau 32 Zeichen (`openssl rand -base64 24`). In Production Pflicht. |
| `NUXT_PUBLIC_I18N_BASE_URL` | Öffentliche Adresse der App für SEO-Links (Standard `http://localhost:3000`). |

## Erster Admin

1. In `.env` die eigene Adresse als `ADMIN_EMAIL` eintragen und den Server (neu) starten.
2. Unter `/register` mit genau dieser Adresse registrieren. Das Konto ist sofort Admin, die Verwaltung liegt unter `/admin`.

> **Achtung:** Wer eine Adresse aus `ADMIN_EMAIL` als Erster registriert, wird Admin. Deshalb `ADMIN_EMAIL` setzen und selbst registrieren, **bevor** die App öffentlich erreichbar ist.

In der Verwaltung lassen sich Rollen vergeben (`user`, `moderator`, `admin`). Ohne Mailversand setzt ein Admin vergessene Passwörter zurück: Es entsteht ein Einmal-Passwort, das nur einmal angezeigt wird, und beim nächsten Anmelden muss der Nutzer ein neues Passwort wählen. Sicherheitsrelevante Ereignisse stehen unter `/admin/audit`.

## Projektstruktur

```
app/                 Frontend (Seiten, Layouts, Komponenten, Plugins)
i18n/locales/        UI-Texte (de.json, en.json – gleiche Schlüssel)
server/api/          API-Routen (Nitro)
server/middleware/   Session auflösen, Pflicht-Passwortwechsel
server/utils/        Env, Logger, Prisma, Fehler, Health, Sessions, Rechte, Rate-Limit, Audit
server/plugins/      Env-Prüfung, Request-Logging, ADMIN_EMAIL, Session-Aufräumen
shared/              Typen, Rollen und zod-Schemas für Client und Server
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

Häufige Codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `INVALID_CREDENTIALS` (401/403), `FORBIDDEN` (403), `CSRF_INVALID` (403), `PASSWORD_CHANGE_REQUIRED` (403), `NOT_FOUND` (404), `REGISTRATION_FAILED` (409), `RATE_LIMITED` (429, mit `Retry-After`), `INTERNAL_ERROR` (500).

## Sicherheit

- **Sessions** liegen in der Datenbank (nur der SHA-256-Hash des Tokens) im Cookie `session` bzw. in Production `__Host-session`.
- **CSRF:** Schreibende Anfragen (`POST`, `PUT`, `PATCH`, `DELETE`) an `/api` brauchen den Header `csrf-token`. Das Token steht als `<meta name="csrf-token">` im HTML und gehört zum Cookie `csrf`. In der App erledigt das `$api` (`useNuxtApp().$api`).
- **Security-Header** inklusive CSP mit Nonce setzt `nuxt-security`.
- **Rate-Limits:** Login 10 pro IP bzw. 5 Fehlversuche pro E-Mail in 15 Minuten, Registrierung 5 pro IP und Stunde.

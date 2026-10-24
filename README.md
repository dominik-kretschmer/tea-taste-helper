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

Postgres, Ollama und Adminer sind **nur vom eigenen Rechner** erreichbar (`compose.yaml` bindet die Ports an `127.0.0.1`). Wer einen Dienst bewusst im Netz braucht, legt eine eigene `compose.override.yaml` an (nicht einchecken, steht in `.gitignore`); Docker Compose liest sie automatisch:

```yaml
# compose.override.yaml
services:
  ollama:
    ports: !override
      - "0.0.0.0:11434:11434"
```

> **Achtung:** Ollama hat keine Authentifizierung. Jeder im selben Netz könnte Modelle laden, löschen und die GPU nutzen. Nur in vertrauenswürdigen Netzen freigeben.

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
| `npm run db:erd` | Datenmodell-Diagramm `docs/datenmodell.md` aus dem Schema neu erzeugen |

## Gebauten Server starten

```bash
npm run build
node --env-file=.env .output/server/index.mjs
```

- Ohne `NODE_ENV` läuft der gebaute Server als **Production**: Session-Cookie `__Host-session` mit `Secure`, Logs als JSON (eine Zeile pro Eintrag), `NUXT_CSURF_ENCRYPT_SECRET` ist Pflicht. Nur `npm run dev` ist Development.
- `Secure`-Cookies funktionieren auch auf `http://localhost` (Browser behandeln `localhost` als sicheren Kontext), sonst nur über HTTPS.
- `NODE_ENV=development` nur zum Debuggen: Der Server warnt dann beim Start, setzt unsichere Cookies und braucht `pino-pretty` (Dev-Abhängigkeit).

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

## Zutaten

Den Zutatenkatalog (`/zutaten`, englisch `/en/ingredients`) lesen alle; Anlegen, Bearbeiten und Übersetzen brauchen ein Konto. Jedes Speichern legt eine neue Version an, die Historie mit Vergleich steht unter `/zutaten/<id>/historie`. Die sprachabhängigen Pfade stehen zentral in `nuxt.config.ts` (`i18n.pages`); Links entstehen über `localePath({ name: 'ingredients-id', params: { id } })`.

## Tees

Tees (`/tees`, englisch `/en/teas`) bestehen aus Zutaten des Katalogs, optional mit Anteilen in Prozent; der nicht angegebene Rest wird als „unbekannt“ angezeigt. Neue Tees sind **privat**: Nur der Ersteller sieht und bearbeitet sie, für alle anderen (auch Admins) gibt es sie nicht (404, nicht in Listen). Der Ersteller kann einen privaten Tee löschen oder veröffentlichen; veröffentlichte Tees bearbeiten alle Angemeldeten wie Zutaten (Versionen, Historie, Übersetzungen), zurück auf privat geht nicht. Gleich benannte öffentliche Tees sind nur mit unterschiedlicher Marke erlaubt. Eigene Tees stehen unter „Meine“ (`/tees?mine=1`).

## Datenmodell

Alle Tabellen, Spalten, Beziehungen und Enums als Diagramm: [docs/datenmodell.md](docs/datenmodell.md). Die Datei wird aus dem Prisma-Schema erzeugt (`npm run db:erd`) und muss nach jeder Schema-Änderung neu erzeugt werden; ein Unit-Test prüft, dass sie aktuell ist.

Das Prisma-Schema liegt in `prisma/schema/`, aufgeteilt nach festen Regeln (ein Unit-Test prüft sie):

- `schema.prisma` enthält nur `generator` und `datasource`.
- **Eine Datei pro Tabelle**, benannt nach dem Model in kebab-case: `User` → `user.prisma`, `IngredientVersionTranslation` → `ingredient-version-translation.prisma`.
- **Alle Enums** stehen in `enums.prisma`.
- **Many-to-many nur als Verbindungstabelle**, also als eigenes Model mit zwei Fremdschlüsseln in eigener Datei (Beispiel: `tea-version-ingredient.prisma`), nie als Listenfeld auf beiden Seiten.
- Objekte, die nur als SQL in den Migrationen stehen (siehe „Migrationen“), sind am Kopf der betroffenen Tabellen-Datei vermerkt.
- Nach jeder Schema-Änderung `npm run db:erd` ausführen.

## Migrationen

Einige Datenbankobjekte stehen nur als SQL in den Migrationen, weil Prisma sie nicht abbilden kann:

| Objekt | Migration | Zweck |
|---|---|---|
| Erweiterung `pg_trgm` | `0003_ingredients` | Ähnliche Namen und schnelle Teilwortsuche |
| `IngredientVersion_current_key` (partieller Unique-Index `WHERE "isCurrent"`) | `0003_ingredients` | Genau eine aktuelle Version pro Zutat |
| `TeaVersion_current_key` (partieller Unique-Index `WHERE "isCurrent"`) | `0004_teas` | Genau eine aktuelle Version pro Tee |

Die GIN-Indizes `IngredientVersionTranslation_name_trgm` und `TeaVersionTranslation_name_trgm` stehen zusätzlich im Schema (`type: Gin`), damit Prisma sie nicht als Abweichung sieht.

Neue Migrationen deshalb immer in zwei Schritten erzeugen:

```bash
npx prisma migrate dev --create-only --name <name>   # SQL erzeugen, noch nicht anwenden
# prisma/migrations/<…>_<name>/migration.sql lesen: kein DROP der Objekte oben?
npm run db:migrate                                   # anwenden
```

Will eine neue Migration eines der Objekte löschen, gehört die Zeile aus der SQL-Datei entfernt. Eine schon angewendete Migration nicht mehr ändern – sonst verlangt `prisma migrate dev` ein Zurücksetzen der Datenbank.

## Projektstruktur

```
app/                 Frontend (Seiten, Layouts, Komponenten, Plugins)
i18n/locales/        UI-Texte (de.json, en.json – gleiche Schlüssel)
server/api/          API-Routen (Nitro)
server/middleware/   Session auflösen, Pflicht-Passwortwechsel
server/utils/        Env, Logger, Prisma, Fehler, Health, Sessions, Rechte, Rate-Limit, Audit, Katalog-, Zutaten- und Tee-Abfragen
server/plugins/      Env-Prüfung, Request-Logging, ADMIN_EMAIL, Session-Aufräumen
shared/              Typen, Rollen und zod-Schemas für Client und Server
prisma/schema/       Prisma-Schema, eine Datei pro Tabelle (siehe „Datenmodell“)
prisma/migrations/   Migrationen
test/                unit/, api/, setup/
docker/              Init-Skripte für Postgres
.claude/specs/       Spezifikationen (Spec-Driven Development)
```

## API-Fehlerformat

Alle Fehler unter `/api/` haben dieses Format; jede Antwort trägt den Header `X-Request-Id`, der auch in allen Logzeilen der Anfrage steht.

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "requestId": "…", "details": { } } }
```

Häufige Codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `INVALID_CREDENTIALS` (401/403), `FORBIDDEN` (403), `CSRF_INVALID` (403), `PASSWORD_CHANGE_REQUIRED` (403), `NOT_FOUND` (404), `REGISTRATION_FAILED` (409), `INGREDIENT_NOT_FOUND` (400, mit `index`), `ALREADY_PUBLIC` (400), `DUPLICATE_NAME` (409, mit `ingredientId` bzw. `teaId`), `EDIT_CONFLICT` (409, mit `currentVersion`), `TEA_PUBLIC` (409), `RATE_LIMITED` (429, mit `Retry-After`), `INTERNAL_ERROR` (500).

## Sicherheit

- **Sessions** liegen in der Datenbank (nur der SHA-256-Hash des Tokens). Das Cookie heißt unter `npm run dev` `session`, im gebauten Server `__Host-session` (mit `Secure`).
- **CSRF:** Schreibende Anfragen (`POST`, `PUT`, `PATCH`, `DELETE`) an `/api` brauchen den Header `csrf-token`. Das Token steht als `<meta name="csrf-token">` im HTML und gehört zum Cookie `csrf`. In der App erledigt das `$api` (`useNuxtApp().$api`).
- **Security-Header** inklusive CSP mit Nonce setzt `nuxt-security`.
- **Rate-Limits:** Login 10 pro IP bzw. 5 Fehlversuche pro E-Mail in 15 Minuten, Registrierung 5 pro IP und Stunde.

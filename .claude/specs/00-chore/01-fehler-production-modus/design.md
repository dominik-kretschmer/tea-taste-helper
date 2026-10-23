# Design: 01 – Gebauter Server läuft ohne NODE_ENV als „development“

> Phase 2 zu [requirements.md](requirements.md). Status: **Entwurf – wartet auf Freigabe**

## Überblick

Die Ursache ist eine Zeile in `server/utils/env.ts`: `NODE_ENV` hat den Standard `development`. Alle drei betroffenen Stellen (Cookie, CSRF-Pflicht, Logger) lesen nur `useEnv().NODE_ENV`. Es reicht also, den **Standard** richtig zu wählen:

| Lauf | `import.meta.dev` | `NODE_ENV` gesetzt? | Ergebnis |
|---|---|---|---|
| `nuxt dev` | `true` | (setzt nuxi selbst auf `development`) | `development` |
| gebauter Server | `false` | nein / leer | **`production`** (neu) |
| gebauter Server | `false` | ausdrücklich `development`/`test` | dieser Wert + Warnung beim Start (AK-1.7) |
| gebauter Server | `false` | `production` | `production` |

`import.meta.dev` ersetzt Nitro beim Build fest durch `true` (Dev-Server) bzw. `false` (Build). Damit hängt der Standard am Build-Typ, nicht an einer Variable, die man vergessen kann.

Cookie, CSRF und Logger bleiben unverändert; sie lesen weiter `NODE_ENV === 'production'` bzw. `=== 'development'`.

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `server/utils/env.ts` | geändert | `parseEnv(source, { dev })`: Standard für `NODE_ENV` aus `dev`; `useEnv()` übergibt `import.meta.dev` |
| `server/plugins/00.env.ts` | geändert | Warnung, wenn der gebaute Server nicht als `production` läuft (AK-1.7) |
| `test/unit/env.test.ts` | geändert | Standard je nach `dev`, CSRF-Pflicht ohne `NODE_ENV` im Build |
| `test/api/production-mode.test.ts` | neu | startet den gebauten Server selbst **ohne** `NODE_ENV` (AK-1.5) |
| `test/api/helpers.ts` | geändert | Kommentar an `SESSION_COOKIE` korrigieren |
| `.github/workflows/ci.yml` | geändert | Kommentar zum CSRF-Schlüssel („gebauter Server“ statt „Production-Build“) |
| `README.md` | geändert | Abschnitt „Gebauten Server starten“ (AK-1.6) |
| `.claude/specs/02-auth-rollen/design.md` | geändert | Annahme zu `NODE_ENV` korrigieren (AK-1.6) |

## Datenmodell

```ts
// server/utils/env.ts
export interface ParseEnvOptions {
  /** true nur unter `nuxt dev`; bestimmt den Standard für NODE_ENV */
  dev?: boolean
}

// Schema als Funktion, damit der Standard von `dev` abhängt
const createEnvSchema = (dev: boolean) => z.object({
  // ...
  NODE_ENV: optional(z.enum(['development', 'production', 'test']).default(dev ? 'development' : 'production')),
  // ...
}).superRefine(/* unverändert: CSRF-Schlüssel Pflicht, wenn NODE_ENV === 'production' */)

export function parseEnv(source: Record<string, string | undefined>, { dev = false }: ParseEnvOptions = {}): Env

export function useEnv(): Env {
  cached ??= parseEnv(process.env, { dev: import.meta.dev })
  return cached
}
```

- Der Standard `dev = false` ist bewusst die sichere Seite: Wer `parseEnv` ohne Option aufruft, bekommt Production-Verhalten.
- `envSchema` wird nicht mehr exportiert (nur intern genutzt); `Env` bleibt `z.infer<ReturnType<typeof createEnvSchema>>`.
- Leere Werte (`NODE_ENV=`) gelten wie bisher als nicht gesetzt (`optional`).

## Startwarnung (AK-1.7)

```ts
// server/plugins/00.env.ts, nach erfolgreichem useEnv()
if (!import.meta.dev && env.NODE_ENV !== 'production') {
  useLogger().warn({ nodeEnv: env.NODE_ENV }, `built server running with NODE_ENV=${env.NODE_ENV}: insecure cookies, no CSRF key required`)
}
```

Hinweis für die README: Mit `NODE_ENV=development` will der Logger `pino-pretty` laden, eine Dev-Abhängigkeit. Ohne sie startet der gebaute Server in diesem Modus nicht – das ist bei einem ausdrücklichen Debug-Schalter vertretbar.

## Tests

**Unit (`test/unit/env.test.ts`):**
- `parseEnv({ DATABASE_URL })` → `NODE_ENV: 'production'` und Fehler „NUXT_CSURF_ENCRYPT_SECRET“ (ohne `dev`).
- `parseEnv({ DATABASE_URL }, { dev: true })` → `NODE_ENV: 'development'`, kein CSRF-Pflichtfehler.
- `parseEnv({ ..., NODE_ENV: 'development' })` → bleibt `development` (ausdrücklich gesetzt).
- Der bestehende Test „setzt Standardwerte“ bekommt `{ dev: true }`.

**API (`test/api/production-mode.test.ts`):** `@nuxt/test-utils` setzt beim Start immer `NODE_ENV` (erst `test`, dann `production`). Deshalb baut die Datei per `setup({ rootDir, server: false, build: true })` und startet den Server **selbst**:

```ts
// Umgebung ohne NODE_ENV (auch nicht das von Vitest gesetzte)
const { NODE_ENV: _, ...env } = process.env
spawn('node', [join(outputDir, 'server/index.mjs')], { env: { ...env, PORT, LOG_LEVEL: 'info', ...extra } })
```

- `outputDir` aus `useTestContext().nuxt!.options.nitro.output!.dir`.
- Kleiner Helfer im Test: Prozess starten, auf `GET /api/health` warten (max. 60 s), stdout/stderr zeilenweise sammeln, am Ende beenden.
- Fall 1 (AK-1.1, AK-1.3): Mit `NUXT_CSURF_ENCRYPT_SECRET` starten, CSRF-Token von `/` holen, registrieren. `Set-Cookie` beginnt mit `__Host-session=` und enthält `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`. Jede stdout-Zeile ist gültiges JSON; es gibt eine Zeile mit `msg: 'request'` und `path: '/api/auth/register'`.
- Fall 2 (AK-1.2): Ohne `NUXT_CSURF_ENCRYPT_SECRET` starten → Prozess endet mit Code 1, stderr enthält `NUXT_CSURF_ENCRYPT_SECRET`.
- Fall 3 (AK-1.7): Mit `NODE_ENV=development` starten → stdout enthält die Warnung. Dafür muss `pino-pretty` installiert sein, was in Tests und CI der Fall ist (Dev-Abhängigkeit). Die Warnung wird im Klartext gesucht, nicht als JSON.

Der Test nutzt `createClient` aus `helpers.ts` nicht, weil der `fetch` von `@nuxt/test-utils` an dessen Server gebunden ist; er braucht nur drei Anfragen mit dem globalen `fetch`.

## README (AK-1.6)

Neuer Abschnitt nach „Scripts“:

```bash
npm run build
node --env-file=.env .output/server/index.mjs
```

- Ohne `NODE_ENV` läuft der gebaute Server als Production: Cookie `__Host-session` mit `Secure`, JSON-Logs, `NUXT_CSURF_ENCRYPT_SECRET` ist Pflicht.
- `Secure`-Cookies funktionieren auf `http://localhost` (Browser behandeln `localhost` als sicheren Kontext), sonst nur über HTTPS.
- `NODE_ENV=development` nur zum Debuggen; der Server warnt dann beim Start und braucht `pino-pretty`.

Die Zeile zu Sessions („im Cookie `session` bzw. in Production `__Host-session`“) wird präzisiert: „unter `npm run dev` `session`, im gebauten Server `__Host-session`“.

## Entscheidungen

- **Standard aus `import.meta.dev`, nicht aus `process.env.NODE_ENV` beim Build** – `import.meta.dev` ist genau die Unterscheidung „Dev-Server oder Build“, die gemeint ist, und wird von Nitro fest ersetzt. – Verworfen: `NODE_ENV` per Nitro-`define` fest einbrennen (`process.env.NODE_ENV` wäre dann nicht mehr überschreibbar, widerspricht der Entscheidung zu AK-1.7, und `useEnv` liest bewusst die echte Umgebung).
- **Ausdrücklich gesetztes `NODE_ENV` bleibt wirksam, mit Warnung** – Entscheidung vom 2026-10-23 (Debuggen des Builds). – Verworfen: Build immer Production.
- **`parseEnv` ohne Option = Production** – Fehler fallen auf die sichere Seite.
- **Eigener Serverstart im Test statt `@nuxt/test-utils`** – test-utils setzt `NODE_ENV` immer; ein leerer Wert per `startServer({ env: { NODE_ENV: '' } })` wäre nur fast dasselbe wie „nicht gesetzt“. – Verworfen: leerer Wert.
- **Kein eigener Unit-Test für `useLogger`** – der Logger hängt weiter nur an `NODE_ENV`; AK-1.3 prüft der API-Test am echten Prozess.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-1.1 | Standard `production` in `env.ts` → `sessionCookieName()`/`secure` in `session.ts` unverändert; API-Test Fall 1 |
| AK-1.2 | `superRefine` greift jetzt auch ohne `NODE_ENV`; `00.env.ts` bricht ab; Unit-Test, API-Test Fall 2 |
| AK-1.3 | `useLogger()` ohne `pretty`, weil `NODE_ENV` `production` ist; API-Test Fall 1 (jede Zeile JSON) |
| AK-1.4 | `useEnv()` übergibt `dev: true` unter `nuxt dev`; Unit-Test mit `{ dev: true }`; manuelle Prüfung mit `npm run dev` (Cookie `session`, formatierte Logs) |
| AK-1.5 | `test/api/production-mode.test.ts` |
| AK-1.6 | `README.md`, `02-auth-rollen/design.md`, Kommentare in `helpers.ts` und `ci.yml` |
| AK-1.7 | Warnung in `00.env.ts`; Unit-Test (Wert bleibt), API-Test Fall 3 |

# Design: 03 – Fehlerantworten unter /api ohne Request-Logzeile

> Phase 2 zu [requirements.md](requirements.md). Status: **freigegeben (2026-10-23)**

## Überblick

Endet eine Anfrage mit einem Fehler, schreibt der eigene Error-Handler (`server/error.ts`) die Antwort selbst; der Hook `afterResponse` läuft dann nicht. Alle Fehler unter `/api` – Validierung, `AppError` (401, 403, 409, 429), CSRF aus `nuxt-csurf`, unbekannte Route aus `server/api/[...].ts`, unerwartete 500er – laufen aber durch genau diesen Handler.

Lösung: Die Request-Zeile wird zu einer kleinen Funktion `logRequest(event)`, die **höchstens einmal pro Anfrage** schreibt (Merker im `event.context`). Sie wird an beiden Enden aufgerufen:

```
Anfrage ──► request-Hook (Request-ID, Logger, Startzeit)
   │
   ├─ Erfolg ─────────► afterResponse-Hook ──► logRequest(event)
   │
   └─ Fehler ─► error-Hook (5xx: „unhandled error“) ─► server/error.ts
                                                        setResponseStatus(...)
                                                        logRequest(event)   ◄── neu
                                                        send(...)
                        (falls afterResponse doch läuft: Merker verhindert die zweite Zeile)
```

Reihenfolge bei 500 bleibt: erst `unhandled error` (mit Stacktrace), dann die Request-Zeile mit Status 500, beide mit derselben Request-ID.

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `server/utils/request-log.ts` | neu | `logRequest(event)` – eine Zeile pro `/api`-Anfrage |
| `server/plugins/request-logger.ts` | geändert | `afterResponse` ruft `logRequest`; Kontext-Typ um `requestLogged` ergänzt |
| `server/error.ts` | geändert | nach `setResponseStatus` `logRequest(event)` aufrufen |
| `test/api/request-log.test.ts` | neu | AK-1.1 bis AK-1.3 anhand der Serverlogs (AK-1.4) |

## Datenmodell

```ts
// server/plugins/request-logger.ts (Erweiterung der bestehenden Deklaration)
declare module 'h3' {
  interface H3EventContext {
    requestId: string
    log: Logger
    startedAt: number
    /** true, sobald die Request-Zeile geschrieben ist (genau eine pro Anfrage) */
    requestLogged?: boolean
  }
}

// server/utils/request-log.ts
/** Schreibt die Request-Zeile einer /api-Anfrage, höchstens einmal (AK-4.1 aus 01). */
export function logRequest(event: H3Event): void {
  if (!event.path.startsWith('/api/') || event.context.requestLogged) return
  event.context.requestLogged = true
  const log = event.context.log ?? useLogger()
  log.info({
    method: event.method,
    path: event.path,
    status: getResponseStatus(event),
    durationMs: event.context.startedAt === undefined ? undefined : Math.round(performance.now() - event.context.startedAt),
  }, 'request')
}
```

Logformat und Felder bleiben unverändert (Nicht im Umfang).

## Tests (`test/api/request-log.test.ts`)

`@nuxt/test-utils` sammelt stdout/stderr des Servers (`captureServerLogs`, Standard an); `getServerLogs()` liefert die Zeilen, `clearServerLogs()` leert sie. Die CI setzt `LOG_LEVEL=warn` – die Datei startet ihren Server daher mit `LOG_LEVEL: 'info'`.

```ts
await setup({ rootDir, server: true, env: { ...testServerEnv, LOG_LEVEL: 'info' } })

/** Alle JSON-Logzeilen zu einer Request-ID (nach kurzer Wartezeit, Logs kommen asynchron) */
async function linesFor(requestId: string): Promise<Record<string, unknown>[]>
```

| Fall | Auslöser | Erwartung |
|---|---|---|
| 200 | `GET /api/health` | genau eine `request`-Zeile, `status: 200` (AK-1.3) |
| 201 | Registrieren | genau eine Zeile, `status: 201` (AK-1.3) |
| 400 | Registrieren mit ungültiger E-Mail | genau eine Zeile mit `method`, `path`, `status: 400`, `durationMs`, `requestId` (AK-1.1) |
| 401 | `PATCH /api/ingredients/<id>` als Gast mit CSRF-Token | dito, 401 |
| 403 | `POST` ohne CSRF-Token | dito, 403 |
| 404 | `GET /api/gibt-es-nicht` | dito, 404 |
| 409 | zweimal dieselbe Zutat anlegen | dito, 409 |
| 429 | sechs Logins mit falschem Passwort für dieselbe E-Mail | 6. Antwort 429, genau eine Zeile mit 429 |
| 500 | zweiter Block: `startServer({ env: { DATABASE_URL: 'postgresql://x:x@127.0.0.1:1/x' } })`, dann `GET /api/ingredients` | genau eine `request`-Zeile mit 500 **und** eine Zeile `unhandled error`, beide mit der Request-ID aus dem Header (AK-1.2) |

Der 500er-Block steht am Ende der Datei, weil er den Server der Datei durch einen ohne erreichbare DB ersetzt. Die Request-ID kommt jeweils aus dem Antwort-Header `X-Request-Id`.

## Entscheidungen

- **Request-Zeile im Error-Handler statt in einem anderen Hook** – der Handler ist die eine Stelle, durch die alle API-Fehler laufen, und kennt den endgültigen Status. – Verworfen: Request-Zeile im `error`-Hook (der Status steht dort noch nicht fest, z.B. ZodError → 400 entsteht erst in `toErrorResponse`); Wrapper um jeden Handler (müsste in jede Route).
- **Merker `requestLogged` statt sich auf das Hook-Verhalten von h3 zu verlassen** – Nitro/h3 können künftig `afterResponse` auch nach Fehlern auslösen; doppelte Zeilen wären dann ausgeschlossen (AK-1.3).
- **500 über einen Server ohne DB** – echter Fehlerpfad ohne Test-Route im Produktionscode. – Verworfen: eigene Test-Route (würde im Build landen); der Weg über 80 × „İ“ aus dem Befund verschwindet mit Issue 04.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-1.1 | `logRequest` in `server/error.ts`; Testfälle 400, 401, 403, 404, 409, 429 |
| AK-1.2 | `error`-Hook unverändert + `logRequest` im Handler; Testfall 500 |
| AK-1.3 | Merker `requestLogged`; Testfälle 200, 201 (genau eine Zeile) |
| AK-1.4 | `test/api/request-log.test.ts` |

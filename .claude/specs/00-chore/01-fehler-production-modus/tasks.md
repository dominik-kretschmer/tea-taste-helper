# Aufgaben: 01 – Gebauter Server läuft ohne NODE_ENV als „development“

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-23)**

Reihenfolge:
- Env-Standard → Startwarnung → API-Test → Dokumentation → Abnahme.
- Nach jeder Aufgabe ein Commit `fix(00-chore/01): <Aufgabe>` bzw. `docs(00-chore/01): …`, nur mit ausdrücklich genannten Pfaden (parallel arbeitet die Session für 04-Tees im selben Verzeichnis).
- Zum Abschluss jeder Aufgabe laufen `npm run lint`, `npm run typecheck` und `npm test` grün. `npm test` nur, wenn keine andere Session gerade testet (beide leeren `tea_test`).

- [x] 1. Standard für `NODE_ENV` aus dem Build-Typ
  - Dateien: `server/utils/env.ts` (`createEnvSchema(dev)`, `parseEnv(source, { dev })`, `useEnv()` mit `import.meta.dev`), `test/unit/env.test.ts`
  - Erfüllt: AK-1.1, AK-1.2, AK-1.4 (Grundlage)
  - Prüfung: Unit-Tests: ohne Option → `production` und CSRF-Pflichtfehler; `{ dev: true }` → `development` ohne Pflichtfehler; ausdrücklich `NODE_ENV=development` bleibt `development`. `npm run dev` → Cookie `session` ohne `Secure`, formatierte Logs.
  - Ergebnis: 13 Unit-Tests in `env.test.ts` grün. Unter `nuxt dev` (Port 3101) registriert: `set-cookie: session=…; Path=/; HttpOnly; SameSite=Lax` (ohne `Secure`), Logs formatiert (`INFO (…): request`).

- [x] 2. Startwarnung bei nicht-production im Build
  - Dateien: `server/plugins/00.env.ts`
  - Erfüllt: AK-1.7
  - Prüfung: `npm run build`, dann `NODE_ENV=development node --env-file=.env .output/server/index.mjs` → Warnzeile mit `NODE_ENV=development`. Unter `npm run dev` erscheint keine Warnung.
  - Ergebnis: Gebauter Server mit `NODE_ENV=development` schreibt `WARN … built server running with NODE_ENV=development: session cookie without Secure, CSRF key not required`. Mit einer Kopie von `.output` außerhalb des Repos startet er in diesem Modus nicht (`pino-pretty` nicht auffindbar) – wie im Design als Folge des Debug-Schalters beschrieben.

- [x] 3. API-Test mit selbst gestartetem Server ohne `NODE_ENV`
  - Dateien: `test/api/production-mode.test.ts` (neu), `test/api/helpers.ts` (Kommentar an `SESSION_COOKIE`)
  - Erfüllt: AK-1.1, AK-1.2, AK-1.3, AK-1.5, AK-1.7
  - Prüfung: Drei Fälle grün: (1) `__Host-session` mit `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, jede stdout-Zeile JSON, Request-Zeile für `/api/auth/register`; (2) ohne CSRF-Schlüssel Exit-Code 1, stderr nennt `NUXT_CSURF_ENCRYPT_SECRET`; (3) `NODE_ENV=development` → Warnung. Gegenprobe: Mit dem alten Standard (`development`) schlägt Fall 1 fehl.
  - Ergebnis: 3 Tests grün (~40 s inkl. Build). Gegenprobe mit altem Standard `development`: Fall 1 und 2 schlagen fehl, Fall 3 bleibt grün.

- [x] 4. Dokumentation und Korrektur der alten Annahme
  - Dateien: `README.md` (Abschnitt „Gebauten Server starten“, Sessions-Zeile), `.claude/specs/02-auth-rollen/design.md`, `.github/workflows/ci.yml` (Kommentar)
  - Erfüllt: AK-1.6
  - Prüfung: README nennt den Startbefehl, Production als Standard ohne `NODE_ENV`, Pflicht des CSRF-Schlüssels und `NODE_ENV=development` nur zum Debuggen (mit `pino-pretty`). Die Stelle in 02 ist korrigiert und verweist auf dieses Issue.
  - Ergebnis: Zusätzlich `.env.example` („im gebauten Server Pflicht“) angepasst.

- [x] 5. Abnahme
  - Erfüllt: alle
  - Prüfung: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` grün. Gebauter Server ohne `NODE_ENV` im Browser: registrieren, Cookie in den DevTools ist `__Host-session` mit `Secure`, Logs sind JSON. Jedes AK einzeln mit Ergebnis hier vermerken; Testkonten aus der Dev-DB löschen.
  - Ergebnis (2026-10-23): `lint`, `typecheck`, 284 Tests (20 Dateien) und `build` grün. Gebauter Server ohne `NODE_ENV`: ohne Schlüssel Abbruch mit „NUXT_CSURF_ENCRYPT_SECRET: ist in Production Pflicht“ (AK-1.2), mit Schlüssel JSON-Logzeilen (AK-1.3); Cookie `__Host-session` mit `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` per API-Test (AK-1.1, AK-1.5). AK-1.4 per Dev-Server geprüft (siehe 1), AK-1.6 README/02-Design/CI-Kommentar, AK-1.7 siehe 2. Testkonto `pw-chore01-dev` aus der Dev-DB gelöscht. Browser-DevTools-Prüfung durch `curl`/API-Test ersetzt.

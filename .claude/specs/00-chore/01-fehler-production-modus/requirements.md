# 01 – Gebauter Server läuft ohne NODE_ENV als „development“

> Chore-Issue zu [00-chore](../README.md). Phase 1: Anforderungen. Status: **Entwurf – wartet auf Freigabe**

## Befund

`useEnv()` liest `NODE_ENV` zur Laufzeit und nimmt ohne Angabe `development` an. Ein Production-Build, der wie in der Nuxt-Doku mit `node .output/server/index.mjs` startet, verhält sich dann so:

| Stelle | Erwartet in Production | Tatsächlich ohne `NODE_ENV` |
|---|---|---|
| Session-Cookie (`server/utils/session.ts`) | `__Host-session`, `Secure` | `session`, ohne `Secure` |
| CSRF-Schlüssel (`server/utils/env.ts`) | Pflicht, sonst Abbruch | nicht Pflicht |
| Logger (`server/utils/logger.ts`) | JSON-Zeilen | `pino-pretty` (Dev-Abhängigkeit; fehlt sie im Deployment, scheitert der Logger) |

Nachgestellt am 2026-10-23: Server mit `.env` (ohne `NODE_ENV`) gestartet, registriert → Cookie `session`; Logausgabe formatiert statt JSON.

Gleichzeitig sind HSTS, `upgrade-insecure-requests` und die CSP schon „production“, weil `nuxt.config.ts` beim Build ausgewertet wird. Der Server ist also halb Production, halb Development. Die API-Tests merken das nicht, weil `@nuxt/test-utils` den Server mit `NODE_ENV=production` startet.

## Ziel

Ein gebauter Server verhält sich immer wie Production, egal ob `NODE_ENV` gesetzt ist. Nur `nuxt dev` ist Development.

## User Stories

- **US-1:** Als Betreiber möchte ich, dass der gebaute Server ohne zusätzliche Variable sichere Cookies setzt und JSON loggt, damit ein vergessenes `NODE_ENV` keine Sicherheitslücke öffnet.

## Akzeptanzkriterien

- **AK-1.1:** WENN der gebaute Server ohne `NODE_ENV` startet, DANN heißt das Session-Cookie `__Host-session` und trägt `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`.
- **AK-1.2:** WENN der gebaute Server ohne `NUXT_CSURF_ENCRYPT_SECRET` startet, DANN bricht er mit einer Meldung ab, die die Variable nennt – auch ohne `NODE_ENV`.
- **AK-1.3:** WENN der gebaute Server läuft, DANN schreibt er Logzeilen als JSON (eine Zeile pro Eintrag), ohne `pino-pretty` zu laden.
- **AK-1.4:** WENN `nuxt dev` läuft, DANN bleibt alles wie bisher (Cookie `session` ohne `Secure`, formatierte Logs, CSRF-Schlüssel optional).
- **AK-1.5:** Ein automatischer Test startet den gebauten Server **ohne** `NODE_ENV` und prüft AK-1.1 und AK-1.3.
- **AK-1.6:** Die Annahme in `02-auth-rollen/design.md` („Nitro setzt NODE_ENV beim Build fest“) ist korrigiert; README beschreibt den Start des gebauten Servers.

## Nicht im Umfang

- Hosting, Dockerfile für Nuxt (folgt mit dem Hosting).
- Weitere Unterschiede zwischen Dev und Production.

## Offene Fragen

- Soll ein ausdrücklich gesetztes `NODE_ENV=development` beim gebauten Server weiterhin erlaubt sein (z.B. zum Debuggen), oder gilt der Build immer als Production? Vorschlag: Build immer Production, `NODE_ENV` nur noch informativ.

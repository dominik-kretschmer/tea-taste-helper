# 03 – Fehlerantworten unter /api ohne Request-Logzeile

> Chore-Issue zu [00-chore](../README.md). Phase 1: Anforderungen. Status: **freigegeben (2026-10-23)**

## Befund

`server/plugins/request-logger.ts` schreibt die Request-Zeile im Hook `afterResponse`. Antworten, die der eigene Fehler-Handler (`server/error.ts`) erzeugt, lösen diesen Hook nicht aus.

Nachgestellt am 2026-10-23 gegen den Production-Build: 201, 400, 401, 404, 409 und 500 ausgelöst. Im Log standen nur die Zeilen für 200 und 201. Für den 500er gibt es zwar die Zeile `unhandled error`, aber keine Request-Zeile mit Status und Dauer.

Das verletzt AK-4.1 aus 01 („WENN eine Anfrage an `/api/*` eingeht, DANN wird eine Logzeile … mit Statuscode … geschrieben“). Gerade Fehler (fehlgeschlagene Logins, 429, Konflikte) fehlen dadurch im Log.

## Ziel

Jede Anfrage an `/api/*` erzeugt genau eine Request-Zeile, auch wenn sie mit einem Fehler endet.

## User Stories

- **US-1:** Als Betreiber möchte ich auch fehlgeschlagene API-Anfragen im Log sehen, damit ich Fehler und Angriffe (z.B. viele 401/429) nachvollziehen kann.

## Akzeptanzkriterien

- **AK-1.1:** WENN eine Anfrage an `/api/*` mit 4xx endet (400, 401, 403, 404, 409, 429), DANN steht genau eine Request-Zeile mit Methode, Pfad, Status, Dauer und Request-ID im Log.
- **AK-1.2:** WENN eine Anfrage an `/api/*` mit 500 endet, DANN stehen die Request-Zeile (Status 500) und – wie bisher – die Zeile `unhandled error` mit derselben Request-ID im Log.
- **AK-1.3:** WENN eine Anfrage erfolgreich ist, DANN bleibt es bei genau einer Request-Zeile (keine doppelten Einträge).
- **AK-1.4:** Ein automatischer Test prüft AK-1.1 bis AK-1.3.

## Nicht im Umfang

- Logzeilen für Seitenaufrufe (nicht `/api`).
- Änderungen am Logformat.

## Offene Fragen

- keine

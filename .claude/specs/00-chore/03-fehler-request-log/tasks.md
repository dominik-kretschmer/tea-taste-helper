# Aufgaben: 03 – Fehlerantworten unter /api ohne Request-Logzeile

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-23)**

Reihenfolge:
- Test zuerst (zeigt den Fehler) → Umsetzung → Abnahme.
- Commits `test(00-chore/03): …` bzw. `fix(00-chore/03): …`, nur mit ausdrücklich genannten Pfaden.
- `npm test` nur, wenn keine andere Session gerade testet.

- [x] 1. API-Test für Request-Zeilen
  - Dateien: `test/api/request-log.test.ts` (neu)
  - Erfüllt: AK-1.4
  - Prüfung: Server mit `LOG_LEVEL: 'info'`; Fälle 200, 201, 400, 401, 403, 404, 409, 429 und – in einem zweiten Block mit `startServer` und unerreichbarer `DATABASE_URL` – 500, wie im Design. Vor der Umsetzung schlagen die Fehlerfälle fehl (keine Zeile), 200/201 sind grün.
  - Ergebnis: 9 Fälle. Gegen den alten Stand (`server/error.ts`, `request-logger.ts` aus HEAD) scheitern 7 (alle Fehlerfälle), 200 und 201 sind grün. Abweichung: Der 500er-Fall braucht `GET /api/ingredients?locale=de`, ohne `locale` antwortet die Route mit 400.

- [x] 2. `logRequest` an beiden Enden
  - Dateien: `server/utils/request-log.ts` (neu), `server/plugins/request-logger.ts`, `server/error.ts`
  - Erfüllt: AK-1.1, AK-1.2, AK-1.3
  - Prüfung: Test aus Aufgabe 1 vollständig grün, also genau eine Zeile je Anfrage und bei 500 zusätzlich `unhandled error` mit derselben Request-ID. `errors.test.ts` und übrige Tests unverändert grün.
  - Ergebnis: 9 von 9 grün; `errors.test.ts` und alle übrigen Tests grün.

- [x] 3. Abnahme
  - Erfüllt: alle
  - Prüfung: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` grün. Production-Build von Hand: falscher Login und unbekannte Route → je eine JSON-Zeile mit Status 401 bzw. 404 im Log. AKs einzeln vermerken.
  - Ergebnis (2026-10-23): `lint`, `typecheck` und `npm test` (312 Tests, 22 Dateien) grün, `build` läuft in den API-Tests mit. Die Logzeilen der Fehlerfälle prüft der API-Test am Production-Build (JSON, Status, Pfad, Dauer, Request-ID); die Prüfung von Hand ist damit abgedeckt. Hinweis: Die Umsetzung (Aufgabe 2) entstand in einer zweiten, parallel laufenden Instanz dieser Session und wurde gegen das Design geprüft.

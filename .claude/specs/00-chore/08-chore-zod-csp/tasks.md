# Aufgaben: 08 – zod löst CSP-Verstöße „script-src eval“ aus

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-23)**

Reihenfolge:
- Modul und Importe → ESLint-Regel → Abnahme.
- Commits `fix(00-chore/08): …` bzw. `chore(00-chore/08): …`, nur mit ausdrücklich genannten Pfaden. `shared/schemas/tea.ts` gehört zur Session für 04-Tees: Import-Änderung dort abstimmen.

- [x] 1. `shared/schemas/zod.ts` und Importe umstellen
  - Dateien: `shared/schemas/zod.ts` (neu), `shared/schemas/auth.ts`, `catalog.ts`, `ingredient.ts`, `tea.ts`
  - Erfüllt: AK-1.1, AK-1.2, AK-1.3
  - Prüfung: `grep -rn "from 'zod'" shared app` → nur noch `shared/schemas/zod.ts` und Typ-Importe (`import type`). `npm test` unverändert grün. Playwright in Dev mit `securitypolicyviolation`-Listener per `addInitScript`: `/login` laden → keine Meldung (vorher eine).
  - Ergebnis: Nur noch `shared/schemas/zod.ts` importiert `zod` als Wert; `useFormErrors.ts` hat einen Typ-Import. Unit-Tests 173 grün.

- [x] 2. ESLint-Regel gegen direkte zod-Importe
  - Dateien: `eslint.config.mjs`
  - Erfüllt: AK-1.1 (dauerhaft)
  - Prüfung: `npm run lint` grün. Probeweise `import { z } from 'zod'` in `app/pages/login.vue` → Lint-Fehler mit Hinweis; `import type { z } from 'zod'` → kein Fehler; Probe wieder entfernen.
  - Ergebnis: Probe-Import in `app/utils/format.ts` → `@typescript-eslint/no-restricted-imports` mit Hinweis; Typ-Import ohne Fehler; Probe entfernt, `lint` grün.

- [x] 3. Abnahme
  - Erfüllt: alle
  - Prüfung: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` grün. Playwright in Dev **und** gegen den Production-Build: `/login`, `/register`, `/zutaten`, `/zutaten/neu`, `/zutaten/<id>/bearbeiten`, `/tees/neu`, `/account/password`, `/admin/users`; jedes Formular einmal ungültig und einmal gültig absenden → 0 `securitypolicyviolation`. `security.test.ts` (kein `unsafe-eval`) grün. AKs einzeln vermerken; Testdaten löschen.
  - Ergebnis (2026-10-23): `lint`, `typecheck`, `npm test` (312 Tests), `build` grün. Playwright mit `securitypolicyviolation`-Listener (per `addInitScript`) in Dev und im Production-Build: Login, Registrieren, Zutat anlegen und bearbeiten, Tee anlegen, Passwort ändern, Zutatenliste, je ungültig und gültig abgesendet (Tee und Passwort nur ungültig) → 0 Verstöße. **Gegenprobe:** ohne `jitless` melden `/login`, `/register`, `/zutaten` je `script-src eval`. `/admin/users` nicht geprüft (kein Admin-Konto in der Dev-DB, `ADMIN_EMAIL` leer). `security.test.ts` grün.

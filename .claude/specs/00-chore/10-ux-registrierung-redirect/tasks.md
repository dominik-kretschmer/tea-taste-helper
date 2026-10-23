# Aufgaben: 10 – Registrieren verliert das Ziel (`?redirect`)

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-23)**

Reihenfolge:
- Helfer mit Tests → Seiten → Abnahme.
- Commits `fix(00-chore/10): …`, nur mit ausdrücklich genannten Pfaden.

- [x] 1. `safeRedirect` umziehen, strenger machen, `redirectQuery`
  - Dateien: `app/utils/redirect.ts` (neu), `app/composables/useFormErrors.ts` (Funktion entfernen), `test/unit/redirect.test.ts` (neu)
  - Erfüllt: AK-1.3
  - Prüfung: Unit-Tests aus dem Design grün, darunter `/\evil.example` und `['/a']` → Fallback. `login.vue` funktioniert per Auto-Import unverändert, `npm run typecheck` grün.
  - Ergebnis: 14 Unit-Tests grün. `ingredients/new.vue` nutzt `safeRedirect` ebenfalls (für `?return`) und funktioniert über den Auto-Import aus `app/utils` unverändert.

- [x] 2. Registrieren leitet weiter, Querverweise geben das Ziel mit
  - Dateien: `app/pages/register.vue`, `app/pages/login.vue`
  - Erfüllt: AK-1.1, AK-1.2
  - Prüfung: Als Gast „Zutat anlegen“ → `/login?redirect=/zutaten/neu` → „Registrieren“ → `/register?redirect=/zutaten/neu` → „Anmelden“ → zurück mit `redirect`. Registrieren → landet auf „Zutat anlegen“.
  - Ergebnis: siehe Abnahme.

- [x] 3. Abnahme
  - Erfüllt: alle
  - Prüfung: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` grün. Browser auf Deutsch und Englisch (AK-1.4): Ablauf aus Aufgabe 2; `/register?redirect=//evil.example` und `/register?redirect=/%5Cevil.example` → nach dem Registrieren Startseite (AK-1.3). AKs einzeln vermerken; Testkonten (`pw-chore10-*`) aus der Dev-DB löschen.
  - Ergebnis (2026-10-23): `lint`, `typecheck`, `npm test` (312 Tests), `build` grün. Playwright in Dev und im Production-Build, de und en: Gast → Login mit `redirect`, „Registrieren“/„Sign up“ und zurück behalten `redirect` (AK-1.2), nach dem Registrieren auf „Zutat anlegen“ (AK-1.1). `redirect=//evil.example` und `/%5Cevil.example` → Startseite (AK-1.3). Testkonten `pw-chore10-*` aus der Dev-DB gelöscht.

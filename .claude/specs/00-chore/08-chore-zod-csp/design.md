# Design: 08 – zod löst CSP-Verstöße „script-src eval“ aus

> Phase 2 zu [requirements.md](requirements.md). Status: **freigegeben (2026-10-23)**

## Überblick

zod 4 hat dafür einen Schalter: `z.config({ jitless: true })`. Dann erzeugt zod keinen Code per `new Function` und **überspringt auch die Probe**, die den CSP-Verstoß meldet (`zod/v4/core/util.js`, `allowsEval`: „Skip the probe under `jitless`“). Die Prüfergebnisse sind dieselben; nur der schnellere JIT-Pfad für Objekt-Schemas entfällt.

Wichtig ist die Reihenfolge: Die Probe läuft beim ersten **Erzeugen** eines Objekt-Schemas, also schon beim Import von `shared/schemas/*`. Der Schalter muss deshalb gesetzt sein, bevor irgendein Schema-Modul ausgewertet wird. Am sichersten geht das über ein eigenes Modul, das alle Schema-Dateien statt `zod` importieren:

```ts
// shared/schemas/zod.ts
// Ohne JIT: zod testet sonst per `new Function`, ob eval erlaubt ist, und löst damit
// bei unserer CSP (kein 'unsafe-eval') auf jeder Seite einen Verstoß aus (00-chore/08).
import { z } from 'zod'

z.config({ jitless: true })

export { z }
```

ES-Module werten Importe vor dem importierenden Modul aus. Importiert `shared/schemas/auth.ts` `{ z } from './zod'`, ist der Schalter gesetzt, bevor `auth.ts` ein Schema baut – unabhängig davon, in welchem Chunk und in welcher Reihenfolge Vite die Seiten lädt.

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `shared/schemas/zod.ts` | neu | setzt `jitless`, exportiert `z` |
| `shared/schemas/auth.ts`, `catalog.ts`, `ingredient.ts` (und `tea.ts`, falls aus 04 schon vorhanden) | geändert | `import { z } from './zod'` statt `from 'zod'` |
| `eslint.config.mjs` | geändert | Wert-Importe von `zod` in `app/**` und `shared/**` verbieten (außer in `shared/schemas/zod.ts`); Typ-Importe bleiben erlaubt |

`server/utils/env.ts` importiert `zod` direkt und darf das weiter: Es läuft nur auf dem Server, wo keine CSP gilt. `app/composables/useFormErrors.ts` importiert nur Typen.

## Regel gegen Rückfälle

```js
// eslint.config.mjs: weiteres Konfigurationsobjekt in withNuxt(...)
{
  files: ['app/**', 'shared/**'],
  ignores: ['shared/schemas/zod.ts'],
  rules: {
    '@typescript-eslint/no-restricted-imports': ['error', {
      paths: [{ name: 'zod', message: "Im Browser-Code aus '#shared/schemas/zod' importieren (00-chore/08).", allowTypeImports: true }],
    }],
  },
}
```

## Prüfung

- Dev und Production-Build, Playwright mit Listener `document.addEventListener('securitypolicyviolation', …)` vor dem Laden (`addInitScript`): `/login`, `/register`, `/zutaten`, `/zutaten/neu`, `/zutaten/<id>/bearbeiten`, `/account/password`, `/admin/users`; auf jeder Formularseite einmal ungültig und einmal gültig absenden → keine Meldung (AK-1.1).
- `npm test` (Unit- und API-Tests) unverändert grün (AK-1.2).
- `security.test.ts` prüft bereits, dass die CSP kein `unsafe-eval` enthält; `nuxt.config.ts` bleibt unberührt (AK-1.3).
- `npm run lint` meldet einen absichtlich eingefügten `import { z } from 'zod'` in einer Seite (danach wieder entfernen).

## Entscheidungen

- **`jitless` überall (Browser und Server)** – ein Modul für beide, keine Fallunterscheidung. Der JIT spart nur bei großen Objekt-Schemas und vielen Aufrufen messbar Zeit; unsere Schemas sind klein. – Verworfen: nur im Browser (`import.meta.client`); in Unit-Tests ist das undefiniert, Verhalten würde zwischen Test und App abweichen.
- **Eigenes Modul statt Nuxt-Plugin** – die Probe läuft schon beim Import der Schemas; ein Plugin läuft womöglich später (z.B. wenn ein Plugin oder das Layout ein Schema importiert). – Verworfen: `app/plugins/zod.client.ts` mit `enforce: 'pre'`.
- **Kein `unsafe-eval`, keine Ausnahme in der CSP** – AK-1.3.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-1.1 | `shared/schemas/zod.ts` mit `jitless`, Importe umgestellt; Playwright-Prüfung Dev und Production |
| AK-1.2 | gleiche Schemas, nur ohne JIT; bestehende Tests |
| AK-1.3 | `nuxt.config.ts` unverändert; `security.test.ts` |

# 15 – Translation-Helper zentralisieren

> Chore-Issue zu [00-chore](../README.md), aus dem Code-Review vom 2026-10-24. Phase 1: Anforderungen. Status: **Entwurf (2026-10-24)**

## Befund

Dieselbe Umwandlung steht mehrfach im Server-Code:

| Richtung | Stellen |
|---|---|
| Übersetzungs-Zeilen → `{ [locale]: { name, description } }` | `server/utils/ingredients.ts` `toSnapshot` (Z. 35) und `loadIngredientViews` (Z. 245), `server/utils/teas.ts` `toTeaSnapshot` (Z. 80), `server/utils/moderation.ts` `loadEntryInfos` (Z. 35) |
| Snapshot-Übersetzungen → Insert-Zeilen mit `nameKey` | `server/utils/ingredients.ts` `writeIngredientVersion` (Z. 171), `server/utils/teas.ts` `writeTeaVersion` (Z. 227) |

## Ziel

Jede Richtung steht genau einmal in `server/utils/catalog.ts`. Am Verhalten ändert sich nichts.

## User Stories

- **US-1:** Als Entwickler möchte ich die Umwandlung von Übersetzungen an einer Stelle haben, damit eine neue Spalte (z.B. ein weiteres Textfeld) nur dort ergänzt werden muss.

## Akzeptanzkriterien

- **AK-1.1:** `server/utils/catalog.ts` exportiert `toTranslations(rows)` und `translationRows(translations)`.
- **AK-1.2:** Die vier Stellen der Hinrichtung nutzen `toTranslations`, die zwei Stellen der Rückrichtung `translationRows`. `grep -rn 'locale as ContentLocale\] =' server` und `grep -rn 'nameKey: normalizeName(text.name)' server` finden nur noch `catalog.ts`.
- **AK-1.3:** `translationRows` liefert eine Zeile je vorhandener Sprache in der Reihenfolge von `CONTENT_LOCALES` und lässt fehlende Sprachen weg, mit `nameKey = normalizeName(name)` (wie bisher).
- **AK-1.4:** `npm run lint`, `npm run typecheck`, `npm test` und `npm run build` sind grün, ohne Änderungen an Tests.

## Nicht im Umfang

- Weitere Vereinheitlichung von Zutaten- und Tee-Code (z.B. `writeIngredientVersion`/`writeTeaVersion` zusammenlegen).
- `mergeIngredients`-Abbruch nach 10 Runden (laut Review bewusst ausgeklammert).

## Offene Fragen

- keine

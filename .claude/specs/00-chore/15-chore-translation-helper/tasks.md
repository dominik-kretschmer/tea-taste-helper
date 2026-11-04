# Aufgaben: 15 – Translation-Helper zentralisieren

> Phase 3 zu [design.md](design.md). Status: **umgesetzt (2026-11-04)**

- [x] 1. `toTranslations` und `translationRows` in `server/utils/catalog.ts` anlegen
  - Dateien: `server/utils/catalog.ts`
  - Erfüllt: AK-1.1, AK-1.3
  - Prüfung: `npm run typecheck`
- [x] 2. Vier Stellen der Hinrichtung auf `toTranslations` umstellen
  - Dateien: `server/utils/ingredients.ts` (`toSnapshot`, `loadIngredientViews`), `server/utils/teas.ts` (`toTeaSnapshot`), `server/utils/moderation.ts` (`loadEntryInfos`)
  - Erfüllt: AK-1.2
  - Prüfung: `grep -rn 'locale as ContentLocale\] =' server` findet nur `catalog.ts`; `npm run lint`
- [x] 3. Zwei Stellen der Rückrichtung auf `translationRows` umstellen
  - Dateien: `server/utils/ingredients.ts` (`writeIngredientVersion`), `server/utils/teas.ts` (`writeTeaVersion`)
  - Erfüllt: AK-1.2, AK-1.3
  - Prüfung: `grep -rn 'nameKey: normalizeName(text.name)' server` findet nur `catalog.ts`
- [x] 4. Abschluss: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` grün, Tests unverändert; Status in README und hier nachtragen; ein Commit
  - Ergebnis: lint und typecheck grün, build grün. `npm test`: 457 von 458 grün; der eine Fehler (`password.test.ts`, Zeitverhältnis dummy/real) ist ein Timing-Flake. Allein gelaufen grün. Tests unverändert.
  - Erfüllt: AK-1.4

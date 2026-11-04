# Aufgaben: 14 – Veröffentlichen speichert über `saveTeaVersion`

> Phase 3 zu [design.md](design.md). Status: **umgesetzt (2026-11-04)**

- [x] 1. Block in `publish.post.ts` durch `saveTeaVersion` ersetzen (siehe Design), nicht mehr genutzte Variablen entfernen
  - Dateien: `server/api/teas/[id]/publish.post.ts`
  - Erfüllt: AK-1.1–AK-1.5
  - Prüfung: `npx vitest run test/api/teas.test.ts` grün (41/41); `grep` aus der Abdeckung leer
- [x] 2. Abschluss: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` grün, Tests unverändert (`git diff --stat test/` leer); Status in README und hier nachtragen; ein Commit
  - Erfüllt: AK-1.6
  - Ergebnis: lint, typecheck und build grün; Tests ohne Änderung. `npm test`: 444 bestanden, 14 übersprungen, eine Datei (`production-mode.test.ts`) scheiterte im Gesamtlauf am Start des gebauten Servers (60-s-Timeout). Allein gelaufen grün (3/3).

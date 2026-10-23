# Aufgaben: 04 – Zutatennamen, die beim Kleinschreiben länger werden, führen zu 500

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-23)**

Reihenfolge:
- Tests zuerst → Migration → Abnahme.
- Commits `test(00-chore/04): …` bzw. `fix(00-chore/04): …`, nur mit ausdrücklich genannten Pfaden. `prisma/schema.prisma` ändert auch die Session für 04-Tees: vor dem Commit `git diff prisma/schema.prisma` prüfen und nur die eigene Zeile stagen (bzw. abstimmen, wer committet).
- Die Migration bekommt die Nummer **0005** (0004 ist `0004_teas`).

- [x] 1. Tests für lange `nameKey`s
  - Dateien: `test/unit/ingredient.test.ts` (bzw. wo die `normalizeName`-Tests nach dem Umbau aus 04-Tees liegen), `test/api/ingredients.test.ts`
  - Erfüllt: AK-1.3
  - Prüfung: Unit grün: `normalizeName('İ'.repeat(80))` hat Länge 160 und ist `'i̇'.repeat(80)`; `'שּׁ'.repeat(80)` → 240. Vor Aufgabe 2 schlagen die API-Fälle mit 500 fehl: Anlegen 80 × „İ“, Anlegen 80 × U+FB2C, Duplikat → 409, Umbenennen per `PATCH`, 81 × „İ“ → 400.
  - Ergebnis: Unit-Test in `test/unit/ingredient.test.ts` grün (54 Tests). API-Block „Namen mit längerem Schlüssel“ in `ingredients.test.ts` (4 Tests). Abweichung: Die Namen bestehen aus 72 Sonderzeichen plus 8 Zeichen Marker (eindeutig pro Lauf), zusammen 80. Die API-Tests liefen erst nach der Migration; dass sie vorher mit 500 scheitern, belegt der Befund (Nachstellung vom 2026-10-23).

- [x] 2. `nameKey` als `TEXT`
  - Dateien: `prisma/schema.prisma`, `prisma/migrations/0005_ingredient_name_key_text/migration.sql` (per `prisma migrate dev --create-only`)
  - Erfüllt: AK-1.1, AK-1.2, AK-1.4
  - Prüfung: Die Migration enthält nur `ALTER TABLE "IngredientVersionTranslation" ALTER COLUMN "nameKey" SET DATA TYPE TEXT;`. Vorher eine Zutat `pw-chore04` in der Dev-DB anlegen, dann `npm run db:migrate`; sie bleibt abrufbar, und ein zweites Anlegen mit demselben Namen gibt 409. Tests aus Aufgabe 1 grün.
  - Ergebnis: Die Migration enthält nur `ALTER TABLE … ALTER COLUMN "nameKey" SET DATA TYPE TEXT` (plus Kommentar), kein `DROP`. Prisma hatte den Ordner mit Zeitstempel angelegt, er wurde in `0005_ingredient_name_key_text` umbenannt. Statt einer Testzutat: Fingerabdruck aller 18 Übersetzungen der Dev-DB (md5 über `versionId`, `locale`, `nameKey`, `name`) vor und nach der Migration identisch (`95c78eb0…`). Spalte jetzt `text`; alle Indizes (auch `IngredientVersion_current_key`, `TeaVersion_current_key`, Trigramm) vorhanden.

- [x] 3. Abnahme
  - Erfüllt: alle
  - Prüfung: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` grün. Im Browser eine Zutat mit 80 × „İ“ anlegen und umbenennen, keine Fehlermeldung. AKs einzeln vermerken; `pw-chore04`-Daten aus der Dev-DB löschen.
  - Ergebnis (2026-10-23): `lint`, `typecheck` und `npm test` (312 Tests) grün. Playwright in Dev **und** im Production-Build, de und en: Zutat mit 70 × „İ“ + Marker (80 Zeichen) angelegt und umbenannt, Detailseite zeigt den Namen, kein Fehler. Testdaten (`pwc04…`) aus der Dev-DB gelöscht.

# Design: 04 – Zutatennamen, die beim Kleinschreiben länger werden, führen zu 500

> Phase 2 zu [requirements.md](requirements.md). Status: **freigegeben (2026-10-23)**

## Überblick

`IngredientVersionTranslation.nameKey` wird von `VARCHAR(80)` auf `TEXT` umgestellt. Der Name selbst bleibt `VARCHAR(80)` und die Eingabeprüfung unverändert (2–80 Zeichen). Damit passt jeder `nameKey`, den `normalizeName` aus einem gültigen Namen erzeugt.

So hat es 04-Tees für `TeaVersionTranslation.nameKey` schon festgelegt (siehe `04-tees/design.md`, „`nameKey` als TEXT“); Zutaten und Tees verhalten sich danach gleich.

**Wie lang kann `nameKey` werden?** Zwei Schritte in `normalizeName` können verlängern: `toLocaleLowerCase('und')` (z.B. „İ“ U+0130 → „i̇“, 1 → 2 Code-Units) und `normalize('NFC')` bei einigen Zeichen, die von der Komposition ausgenommen sind (z.B. U+FB2C „שּׁ“ → 3 Code-Units). Per Durchlauf über alle Codepoints geprüft (2026-10-23, Node 22): Die stärkste Verlängerung pro Zeichen ist 3×. `trim` und das Zusammenfassen von Leerraum machen den Text nur kürzer. Ein Name mit 80 Code-Units ergibt also höchstens 240; der Kommentar in `shared/utils/catalog.ts` nennt das schon.

Die Duplikatregel (Sperre per `hashtext(key)`, Suche über `locale` + `nameKey`) arbeitet mit Strings beliebiger Länge; der Index `(locale, nameKey)` bleibt. 240 Zeichen liegen weit unter der Grenze eines B-Tree-Eintrags (etwa 2,7 kB).

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `prisma/schema.prisma` | geändert | `nameKey String` ohne `@db.VarChar(80)`, mit Kommentar |
| `prisma/migrations/0005_ingredient_name_key_text/migration.sql` | neu | Spalte auf `TEXT` umstellen (0004 ist `0004_teas`) |
| `test/unit/catalog.test.ts` bzw. `test/unit/ingredient.test.ts` | geändert | Länge von `normalizeName` (AK-1.3) – dort, wo die `normalizeName`-Tests nach dem Umbau von 04-Tees liegen |
| `test/api/ingredients.test.ts` | geändert | Anlegen, Umbenennen, Duplikat mit 80 × „İ“ |

## Datenmodell

```prisma
model IngredientVersionTranslation {
  // ...
  name        String            @db.VarChar(80)
  /// TEXT statt VARCHAR(80): normalizeName kann bis zu 3× länger werden (00-chore/04)
  nameKey     String
  // ...
  @@index([locale, nameKey])
}
```

```sql
-- Nur verbreitern: bestehende Werte bleiben unverändert, der Index wird neu aufgebaut (AK-1.4)
ALTER TABLE "IngredientVersionTranslation" ALTER COLUMN "nameKey" SET DATA TYPE TEXT;
```

Die Migration entsteht mit `prisma migrate dev --create-only` und wird vor dem Anwenden gelesen: Sie darf nur diese eine Anweisung enthalten (kein `DROP`/`ADD COLUMN`).

## Tests

**Unit:**
- `normalizeName('İ'.repeat(80))` hat Länge 160 und ist gleich `'i̇'.repeat(80)`.
- `normalizeName('שּׁ'.repeat(80))` hat Länge 240 (stärkste Verlängerung, siehe oben).

**API zusätzlich:** `POST` mit `'שּׁ'.repeat(80)` → 201 (der längste mögliche `nameKey`).

**API (`ingredients.test.ts`):**
- `POST /api/ingredients` mit `name: 'İ'.repeat(80)` → 201 (AK-1.1).
- Zweite Zutat, `PATCH` mit `translations.de.name: 'İ'.repeat(80)` → 409 `DUPLICATE_NAME` (AK-1.2).
- `PATCH` (Umbenennen) einer dritten Zutat auf `'İ'.repeat(79) + 'x'` → 200; dasselbe über die Übersetzung der anderen Sprache → 200 (AK-1.1).
- `'İ'.repeat(81)` → 400 wie bisher (Grenze unverändert).

**Migration (AK-1.4):** Vor der Migration eine Zutat in der Dev-DB anlegen, `npm run db:migrate`, danach ist sie unverändert abrufbar und die Duplikatprüfung greift für sie.

## Entscheidungen

- **`nameKey` als `TEXT`** – einfach, ohne Datenverlust, gleich wie bei Tees. – Verworfen: `VARCHAR(240)` (die Obergrenze ist eine Eigenschaft von Unicode, kein fachlicher Wert, und `TEXT` kostet in Postgres nichts extra); `nameKey` kürzen (zwei verschiedene Namen bekämen denselben Schlüssel → falsche Duplikate); Eingabe auf „`nameKey` ≤ 80“ prüfen (lehnt gültige Namen ab und widerspricht AK-1.1).
- **Name selbst bleibt `VARCHAR(80)`** – die Eingabeprüfung zählt Code-Units wie Postgres Zeichen zählt; „Grapheme statt Code-Units“ ist ausdrücklich nicht im Umfang.
- **Reihenfolge mit 04-Tees** – die Änderung ist unabhängig. Liegt die Tee-Migration schon vor, bekommt diese die nächste Nummer; sonst umgekehrt. Beide Migrationen fassen nicht dieselbe Tabelle an.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-1.1 | `schema.prisma` + Migration; API-Tests Anlegen/Umbenennen |
| AK-1.2 | `assertNameAvailable` unverändert; API-Test Duplikat → 409 |
| AK-1.3 | Unit-Test `normalizeName`, API-Tests |
| AK-1.4 | `ALTER COLUMN … TYPE TEXT` (nur Verbreiterung); Prüfung mit bestehender Zutat |

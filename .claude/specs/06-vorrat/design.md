# Design: 06 – Vorrat

> Phase 2 zu [requirements.md](requirements.md). Status: **umgesetzt (2026-10-24)**

## Überblick

Eine neue Tabelle `PantryItem` mit genau einem Verweis je Zeile, entweder auf eine Zutat oder auf einen Tee. Die Vorrats-API unter `/api/pantry` wirkt immer auf den angemeldeten Nutzer. Lesen, Suche und Sortierung laufen wie bei den Katalog-Listen als SQL. Das ist nötig, weil Name und Fallback-Sprache aus der aktuellen Version kommen (Muster `listIngredients` / `listTeas`). Die Moderation braucht genau eine Ergänzung: `markMerged` hängt die Vorratseinträge in derselben Transaktion um. Das Ausblenden braucht keine Änderung, denn der Zustand wird beim Lesen aus `hiddenAt` abgeleitet.

```
Seiten                                    API                                   DB
/vorrat ─ Tabs, Suche, Seiten ──────────► GET    /api/pantry                    PantryItem (neu)
        ─ Hinzufügen ───────────────────► POST   /api/pantry                      ├─► Ingredient (hiddenAt)
        ─ Menge, Aufgebraucht ──────────► PATCH  /api/pantry/:id                  └─► Tea (hiddenAt)
        ─ Entfernen / Rückgängig ───────► DELETE /api/pantry/:id, POST …
/zutaten/:id, /tees/:id ─ PantryButton ─► GET    /api/pantry/lookup
Moderation: POST /api/admin/:type/:id/merge ─► markMerged ─► mergePantry (UPDATE/DELETE PantryItem)
```

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `prisma/schema/pantry-item.prisma` | neu | Modell `PantryItem` |
| `prisma/schema/user.prisma`, `ingredient.prisma`, `tea.prisma` | geändert | Rückrelationen `pantryItems` |
| `prisma/migrations/0007_pantry/` | neu | Tabelle, Uniques, FKs; `CHECK` als SQL (siehe Datenmodell) |
| `docs/datenmodell.md` | geändert | per `npm run db:erd` neu erzeugt |
| `shared/utils/pantry.ts` | neu | `PANTRY_GRAMS_MAX = 100_000`, `PANTRY_MAX_ENTRIES = 1000`, `PANTRY_PAGE_SIZE = 24` |
| `shared/types/pantry.ts` | neu | `PantryEntry`, `PantryPage` |
| `shared/schemas/pantry.ts` | neu | zod: `gramsSchema`, `pantryListQuerySchema`, `pantryLookupQuerySchema`, `createPantrySchema`, `updatePantrySchema` |
| `shared/schemas/tea.ts` | geändert | `teaListQuerySchema` + `withOwn` |
| `server/utils/pantry.ts` | neu | `listPantry`, `countPantry`, `findPantryEntry`, `loadPantryEntry`, `createPantryEntry`, `updatePantryEntry`, `mergePantry`, `pantryNotFound` |
| `server/utils/teas.ts` | geändert | `listTeas`: Scope „öffentlich oder eigen“ bei `withOwn` |
| `server/utils/moderation.ts` | geändert | `markMerged` ruft `mergePantry` auf |
| `server/api/pantry/index.get.ts` | neu | Liste je Tab |
| `server/api/pantry/index.post.ts` | neu | Hinzufügen (auch für „Rückgängig“) |
| `server/api/pantry/lookup.get.ts` | neu | Eintrag zu einer Zutat bzw. einem Tee (Detailseiten) |
| `server/api/pantry/[id].patch.ts` | neu | Menge ändern |
| `server/api/pantry/[id].delete.ts` | neu | Entfernen |
| `nuxt.config.ts` | geändert | `pantry: { de: '/vorrat', en: '/pantry' }` |
| `app/pages/pantry/index.vue` | neu | Vorratsseite, Middleware `auth` |
| `app/components/pantry/PantryEntryDialog.vue` | neu | Hinzufügen (Art, Suche, Menge) und Menge ändern |
| `app/components/pantry/PantryRemoveDialog.vue` | neu | Rückfrage beim Entfernen |
| `app/components/pantry/PantryButton.vue` | neu | „In den Vorrat“ bzw. „Im Vorrat: …“ auf Detailseiten |
| `app/components/moderation/EntrySearch.vue` | geändert | Prop `withOwn` (eigene private Tees mit suchen) |
| `app/pages/ingredients/[id]/index.vue`, `app/pages/teas/[id]/index.vue` | geändert | `PantryButton` |
| `app/components/UserMenu.vue` | geändert | Eintrag „Vorrat“ |
| `i18n/locales/de.json`, `en.json` | geändert | `pantry.*`, `nav.pantry`, `errors.ALREADY_IN_PANTRY`, `errors.PANTRY_FULL`, `errors.ENTRY_UNAVAILABLE` |
| `test/unit/pantry.test.ts` | neu | zod-Schemas (Grenzen der Menge) |
| `test/api/pantry.test.ts` | neu | API inkl. 401, Fremdzugriff, Moderation |
| `README.md` | geändert | Abschnitt Vorrat, neues SQL-Objekt aus 0007 |

## Datenmodell

```prisma
// 06 – Vorrat: eine Zutat oder ein Tee im Vorrat eines Nutzers
// Zusätzlich als SQL in 0007_pantry (Prisma kennt ihn nicht): CHECK-Constraint
// "PantryItem_one_target" – genau eines von ingredientId und teaId ist gesetzt.

model PantryItem {
  id           String      @id @default(uuid(7)) @db.Uuid
  userId       String      @db.Uuid
  user         User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  ingredientId String?     @db.Uuid
  ingredient   Ingredient? @relation(fields: [ingredientId], references: [id], onDelete: Restrict)
  teaId        String?     @db.Uuid
  /// Cascade: Löscht der Ersteller seinen privaten Tee, verschwindet er aus seinem Vorrat (AK-4.2)
  tea          Tea?        @relation(fields: [teaId], references: [id], onDelete: Cascade)
  /// Gramm, 0–100 000; null = ohne Menge, 0 = aufgebraucht
  grams        Int?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  @@unique([userId, ingredientId])
  @@unique([userId, teaId])
  @@index([ingredientId])
  @@index([teaId])
}
```

- Die Uniques greifen nur, wenn die Spalte gesetzt ist, denn NULL ist in Postgres eindeutig. Damit hat jeder Nutzer höchstens einen Eintrag je Zutat bzw. Tee (AK-2.3).
- Der Wertebereich der Menge wird nur per zod geprüft, nicht per DB-`CHECK`. Die Summe beim Zusammenführen wird auf 100 000 begrenzt (siehe Entscheidungen).

```ts
// shared/types/pantry.ts
export interface PantryEntry {
  id: string
  entityType: CatalogTypeValue        // 'ingredient' | 'tea'
  entityId: string
  name: string                        // aktuelle Sprache, sonst Originalsprache
  brand: string | null                // nur Tees
  grams: number | null
  empty: boolean                      // grams === 0
  hidden: boolean                     // Eintrag ausgeblendet (AK-1.3, AK-1.5)
}

export interface PantryPage extends Page<PantryEntry> {
  counts: Record<CatalogTypeValue, number>   // Anzahl je Tab (AK-1.1)
}

// Antwort von Lookup, Hinzufügen und Ändern: ohne Namen, braucht daher keine Locale (präzisiert in Aufgabe 3)
export type PantryRef = Pick<PantryEntry, 'id' | 'entityType' | 'entityId' | 'grams'>
```

```ts
// shared/schemas/pantry.ts
gramsSchema = z.number().int().min(0).max(PANTRY_GRAMS_MAX).nullable()
pantryListQuerySchema = z.object({ type: catalogTypeSchema, q: searchTermSchema.optional(), page: pageSchema, locale: contentLocaleSchema })
pantryLookupQuerySchema = z.object({ type: catalogTypeSchema, entityId: z.uuid() })
createPantrySchema = z.object({ entityType: catalogTypeSchema, entityId: z.uuid(), grams: gramsSchema })
updatePantrySchema = z.object({ grams: gramsSchema })
```

## API

Alle Routen verlangen `requireUser` (401 für Gäste, AK-0.2) und arbeiten nur mit `userId = user.id`. Einen Nutzer-Parameter gibt es nicht (AK-0.1). Fremde und unbekannte Eintrags-IDs geben 404, nie 403.

| Methode | Route | Request | Response | Fehler |
|---|---|---|---|---|
| GET | `/api/pantry` | `?type=ingredient\|tea&q&page&locale` | `PantryPage` | 400 |
| GET | `/api/pantry/lookup` | `?type&entityId` | `{ entry: PantryRef \| null }` | 400 |
| POST | `/api/pantry` | `{ entityType, entityId, grams }` | 201 `{ entry: PantryRef }` | 400 `VALIDATION_ERROR`, 400 `PANTRY_FULL`, 404 `NOT_FOUND` (+ `mergedInto`), 409 `ALREADY_IN_PANTRY` (`details: { entryId, grams }`) |
| PATCH | `/api/pantry/:id` | `{ grams }` | `{ entry: PantryRef }` | 400, 404, 409 `ENTRY_UNAVAILABLE` (ausgeblendet, AK-1.3) |
| DELETE | `/api/pantry/:id` | – | 204 | 404 |

**Liste (`listPantry`):** eine SQL-Abfrage je Typ, dazu dieselben Display-Joins wie `listIngredients` bzw. `listTeas`. Die Suche nutzt ILIKE über die Namen aller Sprachen der aktuellen Version, bei Tees auch über die Marke (wie AK-1.2 aus 04). Sortierung: `ORDER BY hidden, grams = 0, lower(name) COLLATE "de-x-icu", id`, also erst normale, dann aufgebrauchte, dann ausgeblendete Einträge (AK-1.2, AK-1.3). Seitengröße 24 per `LIMIT/OFFSET`. `counts` liefert eine `GROUP BY`-Abfrage ohne Suchfilter.

**Hinzufügen (`createPantryEntry`)**, in einer Transaktion:
1. `lockName(db, 'pantry:' + userId)`: Gleichzeitige Hinzufügungen desselben Nutzers laufen dadurch nacheinander, und die Obergrenze bleibt exakt.
2. Ziel mit `FOR SHARE` lesen. Es muss aktiv sein, bei Tees außerdem öffentlich oder eigen (`canViewTea`). Sonst 404, bei zusammengeführten Einträgen mit `mergedInto` (AK-2.4). Das `FOR SHARE` wartet auf ein laufendes Zusammenführen (`FOR UPDATE`), genau wie `assertIngredientsExist` in 05. Es kann also kein Eintrag auf einer gerade zusammengeführten Quelle entstehen.
3. Gibt es schon einen Eintrag: 409 `ALREADY_IN_PANTRY` (AK-2.3).
4. `count >= 1000`: 400 `PANTRY_FULL` (AK-2.6).
5. `INSERT`.

**Menge ändern:** `UPDATE … WHERE id AND userId`. Ist das Ziel ausgeblendet, kommt 409 `ENTRY_UNAVAILABLE`. Ändert sich der Wert, wird `updatedAt` neu gesetzt. Es gibt keinen Audit-Eintrag (AK-3.3).

**Zusammenführen (`mergePantry(db, entityType, sourceId, targetId)`):** wird in `markMerged` aufgerufen, also in derselben Transaktion wie das Umhängen der Tees (AK-5.1). Spalte `col` = `ingredientId` bzw. `teaId`.
```sql
-- 1. Nutzer mit Quelle und Ziel: Menge ins Ziel übernehmen (Regel wie 05 AK-4.3, gedeckelt)
UPDATE "PantryItem" t SET grams = CASE
    WHEN t.grams IS NULL THEN s.grams
    WHEN s.grams IS NULL THEN t.grams
    ELSE LEAST(t.grams + s.grams, 100000) END
  FROM "PantryItem" s
  WHERE s.col = source AND t.col = target AND s."userId" = t."userId";
-- 2. deren Quelle-Einträge löschen
DELETE FROM "PantryItem" s WHERE s.col = source
  AND EXISTS (SELECT 1 FROM "PantryItem" t WHERE t.col = target AND t."userId" = s."userId");
-- 3. alle übrigen auf das Ziel umhängen
UPDATE "PantryItem" SET col = target WHERE col = source;
```
Der Audit-Eintrag `INGREDIENT_MERGED` / `TEA_MERGED` bleibt unverändert (AK-3.3). Die Vorschau zeigt keine Vorratszahlen (AK-5.3).

**Ausblenden / Wiederherstellen:** keine Änderung. `hidden` wird beim Lesen aus `hiddenAt` abgeleitet (AK-5.2). `hideEntry` prüft weiterhin nur Tees und nicht den Vorrat (AK-5.3).

**Teesuche mit eigenen privaten Tees:** `GET /api/teas?withOwn=1` (nur angemeldet, sonst wird der Parameter ignoriert) setzt in `listTeas` den Scope `(v.visibility = 'public' OR t."ownerId" = viewer)` (AK-2.1).

## UI / Komponenten

**`/vorrat` (`app/pages/pantry/index.vue`)**
- Kopfzeile mit Titel und Knopf „Hinzufügen“.
- `v-tabs` „Zutaten (n)“ / „Tees (n)“, darunter Suchfeld (Debounce 300 ms), Liste und `v-pagination`. `type`, `q` und `page` stehen in der Route-Query, Daten per `useFetch` mit `watch` darauf (Muster `teas/index.vue`).
- Pro Zeile: Name als Link auf die Detailseite (bei Tees mit Marke), rechts die Menge als Chip („ohne Menge“ / „x g“ / „aufgebraucht“) und ein Menü mit „Menge ändern“, „Aufgebraucht“ (nicht bei 0) und „Entfernen“.
- Ausgeblendete Einträge: Name ohne Link, Chip „nicht mehr verfügbar“, im Menü nur „Entfernen“.
- Leerer Vorrat (beide Zähler 0): Hinweis mit Knopf „Hinzufügen“. Leere Suche: „Keine Treffer“.
- Entfernen: `PantryRemoveDialog` mit Name und Menge. Nach Bestätigung `DELETE`, danach `v-snackbar` (5 s) mit „Rückgängig“. Rückgängig ruft `POST /api/pantry` mit `entityType`, `entityId` und `grams` des gelöschten Eintrags auf und lädt die Liste neu.
- Mobil: Liste einspaltig, Menü statt einzelner Knöpfe (AK-6.2).

**`PantryEntryDialog`**
- Modus „Hinzufügen“: Umschalter Zutat/Tee (vorbelegt mit dem aktiven Tab), `EntrySearch` (bei Tees mit `withOwn`), Feld Menge (Zahl, optional, Suffix „g“). Mit `preset` (`entityType`, `entityId`, `name`) von der Detailseite sind Umschalter und Suche ausgeblendet.
- Modus „Menge ändern“: nur das Feld Menge.
- Prüfung clientseitig mit `gramsSchema` über `useFormErrors`, Fehler am Feld (AK-2.5).
- Bei 409 `ALREADY_IN_PANTRY`: Meldung mit Knopf „Menge ändern“, der in den Bearbeiten-Modus für `details.entryId` wechselt.

**`PantryButton`** (Props `entityType`, `entityId`, `name`)
- Nur angemeldet, nicht bei ausgeblendeten Einträgen. Lädt `/api/pantry/lookup` per `useFetch` (`server: false`, damit die Detailseite nicht darauf wartet).
- Ohne Eintrag: Knopf „In den Vorrat“, öffnet `PantryEntryDialog` mit `preset`. Mit Eintrag: Chip „Im Vorrat: …“ mit Link auf `/vorrat?type=…` (AK-2.2).

**`UserMenu`:** Eintrag „Vorrat“ unter dem Namen, für alle Angemeldeten (AK-0.3).

## Entscheidungen

- **Eine Tabelle mit zwei nullable FKs und `CHECK`** – echte Fremdschlüssel, Cascade beim Löschen privater Tees, Uniques je Art. Verworfen: `entityType` + `entityId` wie bei `Report` (ohne FK, Löschen müsste von Hand nachziehen) und zwei getrennte Tabellen (doppelte Routen und Abfragen).
- **Ein Tab je Art, beide serverseitig paginiert** – so lässt sich alphabetisch und seitenweise in einer Abfrage pro Art arbeiten. Verworfen: gemischte Liste mit zwei Gruppen, denn die Seitengrenzen würden mitten in die Gruppen fallen.
- **Summe beim Zusammenführen auf 100 000 g begrenzt** – damit bleibt die Regel aus AK-2.5 auch nach dem Zusammenführen gültig, und ein Eintrag lässt sich danach ohne Fehler bearbeiten. In der Praxis kommt der Fall nicht vor.
- **`ENTRY_UNAVAILABLE` beim Bearbeiten ausgeblendeter Einträge** statt 404 – der Eintrag existiert ja und wird angezeigt.
- **„Rückgängig“ = erneutes `POST`** – kein Papierkorb und keine weiche Löschung nötig. Gibt es das Ziel inzwischen nicht mehr, greift dieselbe Fehlermeldung wie beim Hinzufügen.
- **Lookup-Route statt Feld in den Detail-Antworten** – die Detail-Abfragen aus 03 und 04 bleiben unverändert und für Gäste cachebar.
- **Kein Rate-Limit auf der Vorrats-API** – die Daten sind privat, und die Obergrenze von 1 000 begrenzt den Speicher. Verworfen: das Katalog-Rate-Limit mitbenutzen, denn dann würde das Pflegen des Vorrats das Bearbeiten des Katalogs blockieren.
- **`withOwn` an `/api/teas` statt eigener Such-Route** – dieselbe Suche und Sortierung, nur ein anderer Scope.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-0.1 | Alle Pantry-Routen filtern auf `user.id`, keine Nutzer-ID im Request; fremde ID → 404 |
| AK-0.2 | `requireUser` in jeder Route; Seite mit Middleware `auth`; API-Tests 401 |
| AK-0.3 | `UserMenu.vue` |
| AK-1.1 | `listPantry`, `counts`; Tabs auf `pages/pantry/index.vue`; Route `pantry` in `nuxt.config.ts` |
| AK-1.2 | `ORDER BY … grams = 0`; Chip „aufgebraucht“ |
| AK-1.3 | `ORDER BY hidden`; Zeile ohne Link, Menü nur „Entfernen“; PATCH → 409 `ENTRY_UNAVAILABLE` |
| AK-1.4 | `LIMIT/OFFSET` 24, `q` per ILIKE, Query in URL; Leer-Hinweis |
| AK-1.5 | `PantryEntry` mit `empty`, `hidden` |
| AK-2.1 | `PantryEntryDialog`, `EntrySearch withOwn`, `listTeas` Scope, `POST /api/pantry` |
| AK-2.2 | `PantryButton`, `GET /api/pantry/lookup` |
| AK-2.3 | Uniques; `createPantryEntry` → 409 `ALREADY_IN_PANTRY`; Dialog wechselt zu „Menge ändern“ |
| AK-2.4 | `createPantryEntry` Schritt 2 (aktiv, `canViewTea`, `mergedInto`) |
| AK-2.5 | `gramsSchema` client- und serverseitig |
| AK-2.6 | `createPantryEntry` Schritt 1 und 4 |
| AK-3.1 | `PATCH /api/pantry/:id`, `PantryEntryDialog` |
| AK-3.2 | Menüpunkt „Aufgebraucht“ → PATCH `grams: 0` |
| AK-3.3 | kein `audit()` in Pantry-Routen; `*_MERGED` unverändert |
| AK-4.1 | `PantryRemoveDialog`, Snackbar, Rückgängig per `POST` |
| AK-4.2 | FK `teaId` `onDelete: Cascade` |
| AK-5.1 | `mergePantry` in `markMerged` |
| AK-5.2 | `hidden` beim Lesen aus `hiddenAt` abgeleitet |
| AK-5.3 | `hideEntry` und `previewMerge` unverändert |
| AK-6.1 | `i18n/locales/de.json`, `en.json`; `test/unit/i18n.test.ts` prüft gleiche Schlüssel |
| AK-6.2 | einspaltige Liste, Aktionen im Menü; Prüfung bei 375 px |

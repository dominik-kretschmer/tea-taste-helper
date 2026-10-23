# Design: 04 – Tees

> Phase 2 zu [requirements.md](requirements.md). Status: **umgesetzt (2026-10-23)**

## Überblick

Baut auf 01 (Fehlerformat, Prisma, i18n), 02 (Sessions, `requireUser`, `$api`, Rate-Limit, Audit) und 03 (Versionen mit `isCurrent`, Übersetzungen, Duplikatregel, Historie) auf. Tees übernehmen das Versionsmodell der Zutaten; neu sind die **Zutatenliste mit Anteilen** pro Version und die **Sichtbarkeit**.

```
Seiten (de/en-Pfade)                   API                                   DB
/tees  (Tabs: Alle | Meine) ───────►  GET    /api/teas                      Tea (ownerId)
/tees/neu ─────────────────────────►  GET    /api/teas/similar              TeaVersion (isCurrent, visibility)
                                      POST   /api/teas                      TeaVersionTranslation
/tees/:id ─────────────────────────►  GET    /api/teas/:id                  TeaVersionIngredient (position, percent)
/tees/:id/bearbeiten ──────────────►  PATCH  /api/teas/:id                  ──► Ingredient (03)
                                      POST   /api/teas/:id/publish          AuditLog (02)
                                      DELETE /api/teas/:id
/tees/:id/historie ────────────────►  GET    /api/teas/:id/revisions
                                      GET    /api/teas/:id/compare
/zutaten/:id (Abschnitt „Enthalten in“) ► GET /api/teas?ingredient=:id
```

**Kernideen:**
- **Gleiches Versionsmodell wie 03.** Jede Version ist vollständig: Grunddaten, Übersetzungen **und Zutatenliste**. Genau eine Version pro Tee ist aktuell (partieller Unique-Index). Optimistisches Sperren, „keine Änderung → keine Version“ und Historie funktionieren wie bei Zutaten.
- **Sichtbarkeit steht an der Version.** So erscheint das Veröffentlichen in Historie und Vergleich (AK-6.1). Da es nur privat → öffentlich gibt, ist die aktuelle Version maßgeblich.
- **Eine Stelle für die Sichtbarkeitsregel.** Alle Abfragen laufen über `server/utils/teas.ts`. Dort steht die Bedingung „öffentlich oder eigener Tee“ (`visibleTo(viewerId)`). Fremde private Tees sind überall „nicht vorhanden“ (404, nicht in Listen, nicht in Suche, nicht auf Zutatenseiten).
- **Ersteller am Tee, Autor an der Version.** `Tea.ownerId` bleibt fest; `TeaVersion.authorId` ist wie bei Zutaten der Bearbeiter.
- **Gemeinsame Katalog-Bausteine.** Was 03 und 04 teilen, wird aus den Zutaten-Dateien herausgelöst, statt es zu kopieren (siehe „Gemeinsam mit 03“).

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `prisma/schema.prisma` | geändert | `TeaKind`, `Visibility`, `Tea`, `TeaVersion`, `TeaVersionTranslation`, `TeaVersionIngredient`; `AuditEvent` + 4 Werte; Relationen an `User`, `Ingredient` |
| `prisma/migrations/0004_teas/` | neu | Tabellen; partieller Unique-Index „eine aktuelle Version“ als SQL |
| `shared/types/tea.ts` | neu | `TeaKind`, `VisibilityValue`, `TeaSnapshot`, `TeaDetail`, `TeaListItem`, `TeaIngredientView`, `TeaChange` |
| `shared/utils/tea.ts` | neu | Grenzwerte, `diffTeaSnapshots` |
| `shared/utils/catalog.ts` | neu | aus `shared/utils/ingredient.ts` herausgelöst: `CONTENT_LOCALES`, Text- und Brühgrenzwerte, `normalizeName`, `pickTranslation`, Text-Diff |
| `shared/utils/ingredient.ts` | geändert | nutzt `catalog.ts`; Exporte bleiben erhalten |
| `shared/schemas/catalog.ts` | neu | aus `shared/schemas/ingredient.ts`: `contentLocaleSchema`, `catalogTextSchema`, Brüh- und Notiz-Schemas |
| `shared/schemas/ingredient.ts` | geändert | nutzt `catalog.ts` |
| `shared/schemas/tea.ts` | neu | zod: Anlegen, Bearbeiten (`strict`), Veröffentlichen, Liste, Ähnlich |
| `shared/utils/roles.ts`, `shared/types/auth.ts` | geändert | `AUDIT_EVENTS` + `TEA_CREATED`, `TEA_UPDATED`, `TEA_PUBLISHED`, `TEA_DELETED` |
| `server/utils/catalog.ts` | neu | aus `server/utils/ingredients.ts`: `escapeLike`, `getUuidParam`, `assertCatalogRateLimit`, `lockName` (Advisory-Sperre) |
| `server/utils/ingredients.ts` | geändert | nutzt `catalog.ts`; `loadIngredientViews(ids)` für Tee-Anzeige |
| `server/utils/teas.ts` | neu | einzige Stelle für Tee-Abfragen: `visibleTo`, Laden (404 bei fremd-privat), Snapshot/Detail, Version schreiben, Duplikatregel, Liste, Ähnlich |
| `server/api/teas/index.get.ts` | neu | Liste, Suche, Filter Zutat, „Meine“ |
| `server/api/teas/index.post.ts` | neu | Anlegen |
| `server/api/teas/similar.get.ts` | neu | ähnliche öffentliche Tees |
| `server/api/teas/[id]/index.get.ts` | neu | Detail |
| `server/api/teas/[id]/index.patch.ts` | neu | Bearbeiten, Übersetzen, Zutaten |
| `server/api/teas/[id]/index.delete.ts` | neu | privaten Tee löschen |
| `server/api/teas/[id]/publish.post.ts` | neu | veröffentlichen |
| `server/api/teas/[id]/revisions.get.ts` | neu | Versionsliste |
| `server/api/teas/[id]/compare.get.ts` | neu | Vergleich |
| `nuxt.config.ts` | geändert | `i18n.pages` für Tees |
| `app/components/AppNav.vue` | geändert | Eintrag „Tees“ |
| `app/components/catalog/TranslationFields.vue` | neu | aus `IngredientForm` herausgelöst: Sprachwahl bzw. Tabs, Name, Beschreibung |
| `app/components/catalog/BrewFields.vue` | neu | aus `IngredientForm`: Koffein, Temperatur, Ziehzeit |
| `app/components/ingredient/IngredientForm.vue` | geändert | nutzt die beiden Bausteine; Verhalten unverändert |
| `app/components/tea/TeaForm.vue` | neu | Formular Anlegen/Bearbeiten |
| `app/components/tea/TeaIngredientsField.vue` | neu | Zutaten suchen, hinzufügen, sortieren, Anteile, Summe |
| `app/components/tea/TeaIngredientsList.vue` | neu | Anzeige der Zutaten mit Anteil und „Rest unbekannt“ |
| `app/components/tea/TeaRevisionDiff.vue` | neu | Vergleich inkl. Zutatenänderungen (nutzt `IngredientRevisionDiff` für Textfelder) |
| `app/utils/teaForm.ts` | neu | Formularzustand, Entwurf in `sessionStorage`, Umwandlung in Eingaben |
| `app/pages/teas/index.vue` | neu | Liste mit Tabs „Alle | Meine“, Suche, Zutatenfilter |
| `app/pages/teas/new.vue` | neu | Anlegen |
| `app/pages/teas/[id]/index.vue` | neu | Detail, Veröffentlichen, Löschen |
| `app/pages/teas/[id]/edit.vue` | neu | Bearbeiten/Übersetzen |
| `app/pages/teas/[id]/history.vue` | neu | Historie und Vergleich |
| `app/pages/ingredients/[id]/index.vue` | geändert | Abschnitt „Enthalten in“ (AK-8.1) |
| `app/pages/ingredients/new.vue` | geändert | `?return=` – nach dem Anlegen zurück zum Tee-Formular (AK-2.2) |
| `app/pages/admin/audit.vue` | geändert | Details für Tee-Ereignisse |
| `i18n/locales/de.json`, `en.json` | geändert | Texte |
| `test/unit/tea.test.ts` | neu | Schemas, Anteilsregeln, `diffTeaSnapshots` |
| `test/unit/ingredient.test.ts` | unverändert | sichert die Herauslösung nach `catalog.ts` ab |
| `test/api/teas.test.ts` | neu | API-Tests (siehe unten) |
| `README.md`, `.claude/skills/nuxt-dev/SKILL.md` | geändert | SQL-Objekte der neuen Migration |

## Datenmodell

```prisma
enum TeaKind {
  bought    // gekauft
  blended   // selbst gemischt
}

enum Visibility {
  private
  public
}

/// Identität eines Tees; Inhalte stehen in den Versionen.
model Tea {
  id           String       @id @default(uuid(7)) @db.Uuid
  sourceLocale String       @db.VarChar(5)
  /// Ersteller; null nach Kontolöschung (Slice 11)
  ownerId      String?      @db.Uuid
  owner        User?        @relation("TeaOwner", fields: [ownerId], references: [id], onDelete: SetNull)
  createdAt    DateTime     @default(now())
  versions     TeaVersion[]

  @@index([ownerId])
}

model TeaVersion {
  id           String                  @id @default(uuid(7)) @db.Uuid
  teaId        String                  @db.Uuid
  tea          Tea                     @relation(fields: [teaId], references: [id], onDelete: Cascade)
  version      Int
  isCurrent    Boolean                 @default(false)
  visibility   Visibility              @default(private)
  kind         TeaKind
  /// nur bei kind = bought
  brand        String?                 @db.VarChar(80)
  /// normalizeName(brand) bzw. '' – Teil der Duplikatregel
  brandKey     String                  @default("")
  caffeine     Caffeine                @default(unknown)
  brewTempC    Int?                    @db.SmallInt
  brewSeconds  Int?                    @db.SmallInt
  authorId     String?                 @db.Uuid
  author       User?                   @relation("TeaVersionAuthor", fields: [authorId], references: [id], onDelete: SetNull)
  note         String?                 @db.VarChar(200)
  createdAt    DateTime                @default(now())
  translations TeaVersionTranslation[]
  ingredients  TeaVersionIngredient[]

  @@unique([teaId, version])
}

model TeaVersionTranslation {
  versionId   String     @db.Uuid
  version     TeaVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  locale      String     @db.VarChar(5)
  name        String     @db.VarChar(80)
  /// TEXT statt VARCHAR(80): normalizeName kann bis zu 3× länger werden (siehe 00-chore/04)
  nameKey     String
  description String?    @db.VarChar(2000)

  @@id([versionId, locale])
  @@index([locale, nameKey])
  @@index([name(ops: raw("gin_trgm_ops"))], map: "TeaVersionTranslation_name_trgm", type: Gin)
}

/// Zutat einer Version, in fester Reihenfolge
model TeaVersionIngredient {
  versionId    String     @db.Uuid
  version      TeaVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  position     Int        @db.SmallInt   // 0, 1, 2 …
  ingredientId String     @db.Uuid
  ingredient   Ingredient @relation(fields: [ingredientId], references: [id], onDelete: Restrict)
  /// Anteil in Prozent 1–100; null = ohne Angabe
  percent      Int?       @db.SmallInt

  @@id([versionId, position])
  @@unique([versionId, ingredientId])
  @@index([ingredientId])   // Filter „enthält Zutat“, Zutatenseite
}
```

In der Migration zusätzlich als SQL (wie in 03, `--create-only`):

```sql
-- Genau eine aktuelle Version pro Tee
CREATE UNIQUE INDEX "TeaVersion_current_key" ON "TeaVersion" ("teaId") WHERE "isCurrent";
```

`pg_trgm` gibt es seit 0003. Der GIN-Index steht im Schema. README und Skill nennen den neuen partiellen Index.

**Beispiel** (privat angelegt, Minze ergänzt, veröffentlicht):

```
TeaVersion
 version | isCurrent | visibility | kind    | brand | note
---------+-----------+------------+---------+-------+-----------------
       1 | f         | private    | blended |       |
       2 | f         | private    | blended |       | Minze ergänzt
       3 | t         | public     | blended |       | (veröffentlicht)

TeaVersionIngredient (Version 3)
 position | ingredient   | percent
----------+--------------+--------
        0 | Grüntee      | 70
        1 | Pfefferminze | 20
        2 | Zitronengras |         → Rest 10 % unbekannt
```

```ts
// shared/types/tea.ts
export type TeaKindValue = 'bought' | 'blended'
export type VisibilityValue = 'private' | 'public'
export interface TeaIngredientRef { ingredientId: string, percent: number | null }
export interface TeaSnapshot {
  sourceLocale: ContentLocale
  visibility: VisibilityValue
  kind: TeaKindValue
  brand: string | null
  caffeine: CaffeineValue
  brewTempC: number | null
  brewSeconds: number | null
  translations: Partial<Record<ContentLocale, IngredientText>>   // Typ aus 03, umbenannt zu CatalogText (Alias bleibt)
  ingredients: TeaIngredientRef[]                                 // in Reihenfolge
}
/** Zutat zur Anzeige im Tee: Name in allen Sprachen, damit der Client mit Fallback wählen kann */
export interface TeaIngredientView extends TeaIngredientRef {
  sourceLocale: ContentLocale
  translations: Partial<Record<ContentLocale, IngredientText>>
  caffeine: CaffeineValue
}
export interface TeaDetail extends Omit<TeaSnapshot, 'ingredients'> {
  id: string
  version: number
  updatedAt: string
  updatedBy: AuthorRef | null
  owner: AuthorRef | null
  isOwner: boolean
  ingredients: TeaIngredientView[]
  /** mindestens eine Zutat ist koffeinhaltig (AK-1.6) */
  ingredientsCaffeinated: boolean
}
export interface TeaListItem {
  id: string, name: string, translated: boolean, brand: string | null,
  kind: TeaKindValue, caffeine: CaffeineValue, visibility: VisibilityValue,
}
export type TeaChange =
  | SnapshotChange                                                     // Texte, Koffein, Brühwerte (aus 03)
  | { field: 'kind' | 'brand' | 'visibility', from: unknown, to: unknown }
  | { field: 'ingredient', ingredientId: string,
      from: { position: number, percent: number | null } | null,      // null = hinzugefügt
      to: { position: number, percent: number | null } | null }       // null = entfernt
```

## Regeln (`shared/utils/tea.ts`, `shared/schemas/tea.ts`)

```ts
const ingredientRef = z.object({
  ingredientId: z.uuid(),
  percent: z.number().int().min(1).max(100).nullable().default(null),
})
const ingredientsSchema = z.array(ingredientRef).min(1).max(20)
  .refine(list => new Set(list.map(i => i.ingredientId)).size === list.length,
    { message: 'duplicate', path: [] })                          // AK-2.5
  .refine(list => list.reduce((sum, i) => sum + (i.percent ?? 0), 0) <= 100,
    { message: 'percent_sum', path: [] })                        // AK-0.1
const brandSchema = z.string().trim().max(80).nullish().transform(v => v || null)

export const createTeaSchema = z.object({
  locale: contentLocaleSchema, ...catalogTextSchema.shape,
  visibility: z.enum(['private', 'public']).default('private'),  // AK-2.1
  kind: z.enum(['bought', 'blended']),
  brand: brandSchema,
  ...brewSchemas,                                               // caffeine, brewTempC, brewSeconds (aus 03)
  ingredients: ingredientsSchema,
  note: noteSchema,
}).transform(dropBrandUnlessBought)                              // Marke nur bei „gekauft“

export const updateTeaSchema = z.strictObject({                  // unbekannte Felder (z.B. visibility) → 400, AK-4.3
  version: z.number().int().min(1),
  kind: z.enum(['bought', 'blended']).optional(),
  brand: brandSchema.optional(),
  caffeine: …optional(), brewTempC: …optional(), brewSeconds: …optional(),
  translations: z.partialRecord(contentLocaleSchema, catalogTextSchema).optional(),
  ingredients: ingredientsSchema.optional(),                     // ersetzt die ganze Liste
  note: noteSchema,
})
export const publishTeaSchema = z.object({ version: z.number().int().min(1), note: noteSchema })
export const teaListQuerySchema = z.object({
  q: …optional(), page, locale: contentLocaleSchema,
  ingredient: z.uuid().optional(),                               // AK-1.3, AK-8.1
  mine: z.stringbool().optional(),                               // AK-7.1
})
```

- **Fehler auf Listenebene** (`duplicate`, `percent_sum`) erscheinen am Zutatenfeld. `useFormErrors` bekommt dafür die Codes `validation.duplicateIngredient` und `validation.percentSum`.
- **`diffTeaSnapshots(a, b)`** nutzt den Text-Diff aus 03 und vergleicht zusätzlich `kind`, `brand`, `visibility` sowie die Zutaten über die ID: hinzugefügt, entfernt, Position oder Anteil geändert. Ändert sich nur die Reihenfolge, entstehen Einträge mit neuer Position.
- **Rest unbekannt** (AK-0.3) = `100 − Summe der angegebenen Anteile`. Er wird nur berechnet und angezeigt, nie gespeichert.

## API

Schreibende Routen brauchen Anmeldung und CSRF-Token. Lesende Routen sind öffentlich, liefern Gästen aber nur öffentliche Tees. **Fremde private Tees antworten auf jeder Route mit 404** (AK-1.7, AK-3.2, AK-4.4, AK-6.2).

| Methode | Route | Rolle | Request | Response | Fehler |
|---|---|---|---|---|---|
| GET | `/api/teas` | – (bei `mine` user) | `?q&page&locale&ingredient&mine` | `200 Page<TeaListItem>` (24/Seite) | 400, 401 (`mine` als Gast) |
| GET | `/api/teas/similar` | – | `?name&brand&locale` | `200 { items: { id, name, brand }[] }` (max. 5, nur öffentlich) | 400 |
| POST | `/api/teas` | user | `createTeaSchema` | `201 { tea: TeaDetail }` | 400 (auch `INGREDIENT_NOT_FOUND`), 401, 409 `DUPLICATE_NAME`, 429 |
| GET | `/api/teas/:id` | – | – | `200 { tea: TeaDetail }` | 404 |
| PATCH | `/api/teas/:id` | user | `updateTeaSchema` | `200 { tea, changed }` | 400, 401, 404, 409 `EDIT_CONFLICT`/`DUPLICATE_NAME`, 429 |
| POST | `/api/teas/:id/publish` | Ersteller | `publishTeaSchema` | `200 { tea }` | 400 `ALREADY_PUBLIC`, 401, 404, 409 `EDIT_CONFLICT`/`DUPLICATE_NAME`, 429 |
| DELETE | `/api/teas/:id` | Ersteller | – | `204` | 401, 404, 409 `TEA_PUBLIC` |
| GET | `/api/teas/:id/revisions` | – | `?page` | `200 Page<RevisionEntry>` | 404 |
| GET | `/api/teas/:id/compare` | – | `?from&to` | `200 { from, to, changes: TeaChange[], ingredients: Record<id, { sourceLocale, translations }> }` | 400, 404 |

**Sichtbarkeit** (`server/utils/teas.ts`): `visibleTo(viewerId)` ist die SQL- bzw. Prisma-Bedingung `v.visibility = 'public' OR t."ownerId" = viewerId` auf der aktuellen Version. `loadTea(db, id, viewer)` liefert `null` für fremd-private Tees, und die Route wirft daraufhin 404. Die Liste ohne `mine` zeigt **nur öffentliche** Tees, auch dem Ersteller (AK-1.1). Seine privaten Tees sieht er unter „Meine“.

**Liste und Suche:** SQL wie bei Zutaten:
- Join auf die aktuelle Version und `COALESCE` für den Anzeigenamen, sortiert mit `de-x-icu`.
- Suche per `EXISTS … name ILIKE` über alle Sprachen, `OR v.brand ILIKE` (AK-1.2).
- Zutatenfilter per `EXISTS (SELECT 1 FROM "TeaVersionIngredient" WHERE "versionId" = v.id AND "ingredientId" = $ingredient)`.
- `mine`: `t."ownerId" = viewer` statt `visibility = 'public'`.

**Anlegen** (Transaktion):
1. Zutaten prüfen: Alle IDs müssen existieren (`Ingredient`), sonst 400 `INGREDIENT_NOT_FOUND` mit `details: { index }`.
2. Bei `visibility = public` für den Namen die Duplikatregel prüfen (siehe unten).
3. `Tea` mit `ownerId` anlegen, dann Version 1 mit Übersetzung und Zutaten (`position` = Index).
4. Audit `TEA_CREATED { teaId, version: 1, private }`.

**Bearbeiten** wie bei Zutaten:
1. Aktuelle Version laden, fremd-privat → 404.
2. Neuen Snapshot bilden: `ingredients` ersetzt die ganze Liste; ohne `kind = bought` wird `brand` geleert.
3. `diffTeaSnapshots` leer → `changed: false`.
4. `UPDATE … SET "isCurrent" = false WHERE … version = $erwartet`, bei 0 Zeilen `EDIT_CONFLICT`.
5. Ist der Tee öffentlich, die Duplikatregel für geänderte Namen oder eine geänderte Marke prüfen.
6. Neue Version schreiben (alle Übersetzungen und Zutaten kopieren).
7. Audit `TEA_UPDATED { teaId, version, locales, private }`.

**Veröffentlichen:**
1. Ersteller prüfen (sonst 404). Ist der Tee schon öffentlich → 400 `ALREADY_PUBLIC`.
2. Optimistisches Sperren über `version`.
3. Duplikatregel für **alle** Übersetzungen (AK-4.2).
4. Neue Version mit `visibility = public`. *Umsetzung:* Ohne mitgeschickte Notiz bleibt die Notiz leer, statt „veröffentlicht“ fest auf Deutsch zu speichern; die Historie zeigt den Wechsel übersetzt aus dem Vergleich.
5. Audit `TEA_PUBLISHED`.

**Löschen:** Nur der Ersteller (sonst 404), nur private Tees (sonst 409 `TEA_PUBLIC`). `DELETE FROM "Tea"` löscht die Versionen per Kaskade mit. Danach Audit `TEA_DELETED { teaId, private: true }`.

**Duplikatregel** (`assertTeaNameAvailable(tx, locale, nameKey, brandKey, ignoreTeaId?)`):
1. Advisory-Sperre auf `tea-name:<locale>:<nameKey>:<brandKey>` (gemeinsamer Helfer `lockName`).
2. Prüfen, ob eine **öffentliche aktuelle** Version eines anderen Tees denselben `nameKey` in dieser Sprache **und** denselben `brandKey` hat.
3. Wenn ja: 409 `DUPLICATE_NAME` mit `details: { teaId, locale }`.

Wie in 03 werden die Sperren in fester Sprachreihenfolge genommen.

**Detail:**
- Die Zutaten der aktuellen Version werden mit ihren **aktuellen** Zutaten-Übersetzungen und ihrem Koffeinwert geladen (`loadIngredientViews`, ein Query).
- `ingredientsCaffeinated` = mindestens eine Zutat mit `caffeine = yes`.
- `owner` und `updatedBy` enthalten nur den Anzeigenamen; `isOwner` vergleicht mit dem angemeldeten Nutzer.

**Rate-Limit:** `assertCatalogRateLimit(event, user)` ist der gemeinsame Schlüssel `catalog:user:<id>`, 30 pro 10 Minuten. Er gilt für Zutaten und Tees, auch fürs Veröffentlichen und Löschen (AK-3.4).

**Audit:** `details.private` steuert in `admin/audit.vue`, ob der Tee verlinkt wird (AK-9.1).

## Gemeinsam mit 03

Damit Tees nicht die Zutaten-Logik kopieren, wird Folgendes herausgelöst. Die öffentlichen Namen bleiben erhalten, sodass bestehender Code und die 03-Tests unverändert laufen.

- **Gemeinsame Hilfen:**
  - `shared/utils/catalog.ts`: Sprachen, Grenzwerte, `normalizeName`, `pickTranslation`, Text-Diff
  - `shared/schemas/catalog.ts`: Text-, Brüh- und Notiz-Schemas
  - `server/utils/catalog.ts`: `escapeLike`, UUID-Parameter, Rate-Limit, `lockName`
- **UI-Bausteine** `catalog/TranslationFields.vue` und `catalog/BrewFields.vue`: `IngredientForm` und `TeaForm` setzen sich daraus zusammen.
- **Das Muster „Version deaktivieren, neue schreiben“** bleibt je Entität eine eigene Funktion. Die Tabellen unterscheiden sich, und ein generischer Helfer über `$queryRaw`-Tabellennamen wäre schwerer zu lesen als zwei kurze Funktionen.

## UI

Pfade in `nuxt.config.ts`:

| Route | de | en |
|---|---|---|
| `teas` | `/tees` | `/teas` |
| `teas-new` | `/tees/neu` | `/teas/new` |
| `teas-id` | `/tees/[id]` | `/teas/[id]` |
| `teas-id-edit` | `/tees/[id]/bearbeiten` | `/teas/[id]/edit` |
| `teas-id-history` | `/tees/[id]/historie` | `/teas/[id]/history` |

Die Navigation bekommt den Eintrag „Tees“ zwischen Start und Zutaten.

| Seite | Inhalt |
|---|---|
| Liste | Tabs **Alle / Meine** (`?mine=1`, „Meine“ nur angemeldet), Suchfeld wie bei Zutaten, Zutatenfilter als Chip (`?ingredient=<id>`, mit Namen, entfernbar). Karten mit Name, Marke, Art, Koffein-Chip, „nicht übersetzt“; unter „Meine“ zusätzlich Chip „privat“/„öffentlich“. Button „Tee anlegen“ bzw. Anmelde-Hinweis |
| Anlegen | `TeaForm`: Sprache, Name, Beschreibung, **Art** (Umschalter gekauft/selbst gemischt; bei „gekauft“ das Feld Marke), **Zutaten** (`TeaIngredientsField`), Koffein, Temperatur, Ziehzeit, **Sichtbarkeit** (Schalter „öffentlich“, Standard aus, mit Hinweis „kann nicht rückgängig gemacht werden“), Notiz. „Ähnliche Tees“ nur bei Sichtbarkeit öffentlich |
| Detail | Name (Fallback-Hinweis), Chips für Art, Marke, „privat“, Koffein (+ Hinweis „laut Zutaten koffeinhaltig“), Zubereitung, Beschreibung (`pre-line`), `TeaIngredientsList`, „Erstellt von … · Zuletzt geändert am … von …“. Buttons: Bearbeiten (öffentlich: alle Angemeldeten; privat: Ersteller), Historie; nur für den Ersteller eines privaten Tees zusätzlich **Veröffentlichen** und **Löschen** (je mit Bestätigungsdialog) |
| Bearbeiten | `TeaForm` mit Sprach-Tabs (wie Zutaten), ohne Sichtbarkeitsschalter; Konflikt, Duplikat und „Keine Änderungen“ wie in 03 |
| Historie | wie bei Zutaten; `TeaRevisionDiff` zeigt Textfelder wie `IngredientRevisionDiff` und Zutaten als „+ Minze 20 %“, „− Zimt“, „Grüntee 60 % → 70 %“, „Minze: Position 2 → 1“ |
| Zutat-Detail | neuer Abschnitt „Enthalten in“: bis 10 öffentliche Tees (`GET /api/teas?ingredient=…`), Link „alle anzeigen“ → `/tees?ingredient=…` |

**`TeaIngredientsField`:**
- `v-autocomplete` mit Suche über `GET /api/ingredients?q=…&locale=…`, 300 ms Verzögerung; bereits gewählte Zutaten sind ausgegraut.
- Jede Zeile: Name, Anteil (Zahlenfeld, leer = ohne Angabe), Buttons hoch/runter (Tastatur-bedienbar statt Drag & Drop), Entfernen.
- Darunter die Summe und „Rest unbekannt: n %“; über 100 % Fehler am Feld.
- Link „Zutat fehlt? Neu anlegen“:
  1. Das Formular speichert seinen Entwurf in `sessionStorage` (`tea-draft:new` bzw. `tea-draft:<id>`) und öffnet `/zutaten/neu?return=<aktueller Pfad>`.
  2. Nach dem Anlegen leitet die Zutaten-Seite per `safeRedirect` zu `return?addIngredient=<neue ID>`.
  3. Das Tee-Formular stellt den Entwurf wieder her, hängt die Zutat an und löscht den Entwurf (AK-2.2).

## Tests

| Projekt | Datei | Inhalt |
|---|---|---|
| unit | `tea.test.ts` | Schemas: 0/1/20/21 Zutaten, doppelte Zutat, Anteil 0/1/100/101, Summe 100/101, Marke nur bei `bought`, `strict` lehnt `visibility` im Update ab; `diffTeaSnapshots` (hinzugefügt, entfernt, verschoben, Anteil, Sichtbarkeit, Marke); Rest-Berechnung |
| unit | `ingredient.test.ts` | bleibt unverändert grün (Herauslösung nach `catalog.ts`) |
| api | `teas.test.ts` | Gast 401 bei Schreibrouten. Anlegen privat/öffentlich → Version 1, Ersteller, Audit. Unbekannte Zutat → 400. **Sichtbarkeit:** fremder privater Tee → 404 bei Detail, PATCH, Publish, DELETE, Historie, Vergleich; erscheint nicht in Liste, Suche, `similar`, Zutatenfilter; Admin ebenso 404. „Meine“ zeigt eigene private und öffentliche, Gast → 401. Liste: Sortierung, Suche über Marke und Sprachen, Zutatenfilter, Fallback. Duplikat: gleicher Name + gleiche Marke öffentlich → 409; andere Marke ok; privat ok; Veröffentlichen eines Duplikats → 409. Bearbeiten öffentlicher Tees durch Dritte → Version 2; Zutatenliste ersetzen; keine Änderung; Konflikt; `visibility` im PATCH → 400. Veröffentlichen → Version mit `public`, zweites Mal → 400. Löschen privat → 204, Versionen weg; öffentlich → 409. Historie/Vergleich mit Zutatenänderungen. Detail: `ingredientsCaffeinated`, Zutatennamen. Rate-Limit gemeinsam mit Zutaten. `nameKey` mit 80 × „İ“ speicherbar |

Browser (Playwright, wie in 03):
- Anlegen mit Zutatensuche, Sortieren und Anteilen; „Zutat fehlt“ → Zutat anlegen → zurück, Entwurf vollständig.
- Veröffentlichen und Löschen mit Dialog.
- Historie mit Zutaten-Diff.
- Zutatenseite „Enthalten in“.
- Tabs Alle/Meine.
- de/en, 360 px, keine CSP-Verstöße außer dem bekannten zod-Eval (00-chore/08).

## Entscheidungen

- **Versionsmodell wie 03, Zutatenliste je Version kopiert.** Jede Version bleibt vollständig lesbar und vergleichbar; Zurücksetzen (05) wird trivial.
  - Verworfen: Zutaten nur am Tee speichern – dann wären Zutatenänderungen nicht in der Historie.
- **Sichtbarkeit an der Version statt am Tee.** Das Veröffentlichen erscheint so in Historie und Vergleich (AK-6.1), ohne doppelte Speicherung. Abfragen joinen ohnehin die aktuelle Version.
- **404 statt 403 für fremde private Tees**, auf allen Routen (bestätigter Vorschlag 5).
- **Veröffentlichen als eigene Route** statt Feld im PATCH. Das Update-Schema ist `strict`, damit `visibility` dort mit 400 abgelehnt wird (AK-4.3). Die Route hat eigene Rechte (nur Ersteller) und eine eigene Rückfrage in der UI.
- **Anteile als ganze Prozent, Rest nur berechnet** (bestätigter Vorschlag 2). Verworfen: Dezimalwerte – auf Packungen stehen fast immer ganze Prozent.
- **Duplikat über `nameKey` + `brandKey`, nur öffentliche Tees** (bestätigter Vorschlag 3). `brandKey = ''` ohne Marke, damit „kein Hersteller“ ebenfalls eindeutig ist.
- **`nameKey` als TEXT** (Lehre aus 00-chore/04). Die Zutaten-Spalte behebt das Chore-Issue 04 separat.
- **Zutat-FK mit `Restrict`.** Zutaten lassen sich bisher nicht löschen; wenn 05 Zusammenführen bringt, muss es Tees umhängen statt sie still zu verlieren.
- **Zutaten-Reihenfolge per Hoch/Runter-Buttons**, kein Drag & Drop: per Tastatur und auf Touch bedienbar, ohne zusätzliche Bibliothek.
- **Entwurf in `sessionStorage`** für „Zutat fehlt“: nur im Tab und nur bis zum Abschluss; keine Serverlogik.
- **Gemeinsame Katalog-Bausteine herauslösen** statt kopieren. Dabei bleiben die bisherigen Exporte stehen, damit 03 unverändert bleibt.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-0.1–0.3 | Datenmodell, `createTeaSchema`/`ingredientsSchema`, Rest-Berechnung in `TeaIngredientsList` |
| AK-1.1 | `teas/index.get.ts` (nur öffentlich, ICU, 24/Seite), `pages/teas/index.vue`, i18n-Pfade |
| AK-1.2 | Suche über Übersetzungen und `brand`, `escapeLike` |
| AK-1.3 | Filter `ingredient`, Filter-Chip |
| AK-1.4 | `pickTranslation`/`useIngredientText` für Tee und Zutaten |
| AK-1.5 | `TeaDetail`, `TeaIngredientsList`, Detailseite |
| AK-1.6 | `ingredientsCaffeinated`, Hinweis auf der Detailseite |
| AK-1.7 | `loadTea`/`visibleTo` → 404 auf allen Routen, Nuxt-Fehlerseite |
| AK-2.1 | `index.post.ts`, `visibility` Standard `private` |
| AK-2.2 | `TeaIngredientsField` (Suche), `?return=` + Entwurf in `sessionStorage` |
| AK-2.3 | `similar.get.ts` (nur öffentlich), Anlegen-Seite |
| AK-2.4 | `assertTeaNameAvailable` (Name + Marke, nur öffentlich) |
| AK-2.5 | Schema-Refines, `INGREDIENT_NOT_FOUND`, Feldfehler |
| AK-2.6 | `requireUser`, Anmelde-Hinweis |
| AK-3.1 | `index.patch.ts`, Version mit Notiz |
| AK-3.2 | `loadTea` → 404 |
| AK-3.3 | `EDIT_CONFLICT`, `changed: false`, Duplikatregel beim Umbenennen |
| AK-3.4 | `assertCatalogRateLimit` (gemeinsamer Schlüssel) |
| AK-3.5, 3.6 | `index.delete.ts` (nur privat, nur Ersteller), Dialog |
| AK-4.1–4.4 | `publish.post.ts`, `strict`-Update-Schema, Dialog |
| AK-5.1 | `translations` im PATCH, Tabs in `TeaForm` |
| AK-6.1, 6.2 | `revisions.get.ts`, `compare.get.ts`, `diffTeaSnapshots`, `TeaRevisionDiff`, `loadTea` |
| AK-7.1 | `?mine=1`, Tab „Meine“ |
| AK-8.1 | Abschnitt „Enthalten in“ auf der Zutatenseite |
| AK-9.1 | `audit()` mit 4 Ereignissen, `details.private`, `admin/audit.vue` |
| AK-10.1 | gemeinsame Schemas, `useFormErrors` (+ Listen-Fehlercodes) |
| AK-10.2 | Ausgabe nur per `{{ }}`, `pre-line` |
| AK-10.3 | Sprachdateien, `AppNav`, Browserprüfung |
| AK-10.4 | `tea.test.ts`, `teas.test.ts` |

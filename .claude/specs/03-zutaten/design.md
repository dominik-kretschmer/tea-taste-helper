# Design: 03 – Zutaten

> Phase 2 zu [requirements.md](requirements.md). Status: **umgesetzt (2026-10-23)**

## Überblick

Baut auf 01 (Fehlerformat, Prisma, i18n, Vuetify) und 02 (Sessions, `requireUser`, `$api` mit CSRF, Rate-Limit, Audit) auf.

```
Seiten (de/en-Pfade)                API                                     DB
/zutaten              ─────────►  GET   /api/ingredients                  Ingredient
/zutaten/neu          ─────────►  GET   /api/ingredients/similar          IngredientVersionTranslation
                                  POST  /api/ingredients                  IngredientVersion (isCurrent)
/zutaten/:id          ─────────►  GET   /api/ingredients/:id              AuditLog (02)
/zutaten/:id/bearbeiten ───────►  PATCH /api/ingredients/:id
/zutaten/:id/historie ─────────►  GET   /api/ingredients/:id/revisions
                                  GET   /api/ingredients/:id/compare
```

**Kernideen:**
- **Versionen als echte Zeilen mit `isCurrent`-Flag** (Vorschlag des Nutzers): Jede Version ist eine vollständige Zeile in `IngredientVersion` mit ihren Übersetzungen in `IngredientVersionTranslation`. Genau eine Version pro Zutat hat `isCurrent = true`; es gibt keinen separat gespeicherten aktuellen Stand. Später kann eine andere Version aktiv geschaltet werden (Zurücksetzen in 05, ggf. Freigabe von Versionen).
- **Das Flag steht nur an der Version.** Ein partieller Unique-Index `… WHERE "isCurrent"` stellt sicher, dass es genau eine aktuelle Version pro Zutat gibt. Die Duplikatregel für Namen prüft der Code in der Transaktion, abgesichert durch eine Advisory-Sperre auf Sprache + Name.
- **Optimistisches Sperren über das Flag:** Speichern setzt die bisher aktuelle Version nur dann auf `isCurrent = false`, wenn sie noch die mitgeschickte Versionsnummer hat (AK-3.2).
- **Ein Bearbeiten-Endpunkt** für Grunddaten und Übersetzungen (`PATCH` mit Teil-Übersetzungen). So entsteht pro Speichern genau eine Version.

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `prisma/schema.prisma` | geändert | `Caffeine`, `Ingredient`, `IngredientVersion`, `IngredientVersionTranslation`; `AuditEvent` + 2 Werte; Relationen an `User` |
| `prisma/migrations/0003_ingredients/` | neu | Tabellen, `pg_trgm`, partielle Indizes (Unique + GIN) als SQL |
| `shared/types/ingredient.ts` | neu | `ContentLocale`, `IngredientSnapshot`, `IngredientDetail`, `IngredientListItem`, `RevisionEntry`, `SnapshotChange` |
| `shared/utils/ingredient.ts` | neu | `CONTENT_LOCALES`, `normalizeName`, `diffSnapshots`, `pickTranslation` |
| `shared/utils/roles.ts` | geändert | `AUDIT_EVENTS` um `INGREDIENT_CREATED`/`INGREDIENT_UPDATED` |
| `shared/types/auth.ts` | geändert | `AuditEventType` entsprechend |
| `shared/schemas/ingredient.ts` | neu | zod: Anlegen, Bearbeiten, Liste, Ähnlich, Vergleich |
| `server/utils/ingredients.ts` | neu | Einzige Stelle für Abfragen auf aktuelle Versionen (`CURRENT`-Filter), Laden als Snapshot/Detail, Version schreiben, Duplikat-Fehler, `escapeLike` |
| `server/api/ingredients/index.get.ts` | neu | Liste + Suche |
| `server/api/ingredients/index.post.ts` | neu | Anlegen |
| `server/api/ingredients/similar.get.ts` | neu | ähnliche Namen |
| `server/api/ingredients/[id]/index.get.ts` | neu | Detail |
| `server/api/ingredients/[id]/index.patch.ts` | neu | Bearbeiten + Übersetzen |
| `server/api/ingredients/[id]/revisions.get.ts` | neu | Versionsliste |
| `server/api/ingredients/[id]/compare.get.ts` | neu | Vergleich zweier Versionen |
| `nuxt.config.ts` | geändert | `i18n.customRoutes: 'config'` + `i18n.pages` (de/en-Pfade) |
| `app/layouts/default.vue` | geändert | Navigation (App-Bar-Links ab `sm`, Drawer auf schmalen Bildschirmen) |
| `app/components/AppNav.vue` | neu | Navigationseinträge (Start, Zutaten) |
| `app/components/ingredient/IngredientForm.vue` | neu | Formular für Anlegen und Bearbeiten (Sprach-Tabs) |
| `app/components/ingredient/IngredientFacts.vue` | neu | Koffein-Chip + Zubereitungshinweis |
| `app/components/ingredient/RevisionDiff.vue` | neu | Vergleichstabelle |
| `app/composables/useIngredientText.ts` | neu | Name/Beschreibung in aktueller Sprache mit Fallback-Hinweis |
| `app/pages/ingredients/index.vue` | neu | Liste + Suche |
| `app/pages/ingredients/new.vue` | neu | Anlegen + ähnliche Zutaten |
| `app/pages/ingredients/[id]/index.vue` | neu | Detail |
| `app/pages/ingredients/[id]/edit.vue` | neu | Bearbeiten/Übersetzen |
| `app/pages/ingredients/[id]/history.vue` | neu | Historie + Vergleich |
| `app/pages/admin/audit.vue` | geändert | Details für Zutat-Ereignisse (Link zur Zutat) |
| `i18n/locales/de.json`, `en.json` | geändert | Texte |
| `test/unit/ingredient.test.ts` | neu | Schemas, `normalizeName`, `diffSnapshots`, `escapeLike` |
| `test/api/ingredients.test.ts` | neu | API-Tests (siehe unten) |

## Datenmodell

```prisma
enum Caffeine {
  yes
  no
  unknown
}

/// Identität einer Zutat; alle Inhalte stehen in den Versionen.
model Ingredient {
  id           String              @id @default(uuid(7)) @db.Uuid
  sourceLocale String              @db.VarChar(5)       // 'de' | 'en' (zod-geprüft), ändert sich nie
  createdAt    DateTime            @default(now())
  versions     IngredientVersion[]
}

/// Eine vollständige Version; genau eine pro Zutat ist aktuell.
model IngredientVersion {
  id           String     @id @default(uuid(7)) @db.Uuid
  ingredientId String     @db.Uuid
  ingredient   Ingredient @relation(fields: [ingredientId], references: [id], onDelete: Cascade)
  version      Int                                  // 1, 2, 3 … je Zutat
  isCurrent    Boolean    @default(false)
  caffeine     Caffeine   @default(unknown)
  brewTempC    Int?       @db.SmallInt              // 40–100
  brewSeconds  Int?       @db.SmallInt              // 10–1800
  authorId     String?    @db.Uuid
  author       User?      @relation("IngredientVersionAuthor", fields: [authorId], references: [id], onDelete: SetNull)
  note         String?    @db.VarChar(200)
  createdAt    DateTime   @default(now())
  translations IngredientVersionTranslation[]

  @@unique([ingredientId, version])
}

model IngredientVersionTranslation {
  versionId    String            @db.Uuid
  version      IngredientVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  locale       String            @db.VarChar(5)
  name         String            @db.VarChar(80)
  nameKey      String            @db.VarChar(80)     // normalizeName(name) – für die Duplikatregel
  description  String?           @db.VarChar(2000)

  @@id([versionId, locale])
  @@index([locale, nameKey])                       // Duplikatprüfung
}
```

Was Prisma nicht ausdrücken kann, steht als SQL in der Migration `0003_ingredients`:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Genau eine aktuelle Version pro Zutat
CREATE UNIQUE INDEX "IngredientVersion_current_key"
  ON "IngredientVersion" ("ingredientId") WHERE "isCurrent";

-- Suche und Ähnlichkeit (über alle Namen; die Abfrage filtert per Join auf aktuelle Versionen)
CREATE INDEX "IngredientVersionTranslation_name_trgm"
  ON "IngredientVersionTranslation" USING gin (name gin_trgm_ops);
```

**Haken:** Prisma kennt diese beiden Indizes nicht und würde sie in künftigen Migrationen löschen wollen.

> **Ergebnis Aufgabe 1:** `prisma migrate diff` gegen die DB wollte nur den GIN-Index löschen; der partielle Unique-Index und `pg_trgm` werden ignoriert. Der GIN-Index steht deshalb auch im Schema (`@@index([name(ops: raw("gin_trgm_ops"))], type: Gin, map: …)`), danach ist der Diff leer. Das Anlegen bleibt im SQL nach `CREATE EXTENSION`. Vorher fragte `prisma migrate dev` nach dem Anwenden nach einem Namen für eine neue Migration (eben diesem `DROP INDEX`); jetzt meldet es „Already in sync“. Neue Migrationen werden deshalb mit `prisma migrate dev --create-only` erzeugt und vor dem Anwenden geprüft. Das kommt in die README und in den Skill `nuxt-dev`. Ein API-Test prüft, dass der Index „eine aktuelle Version“ greift.

`AuditEvent` bekommt `INGREDIENT_CREATED` und `INGREDIENT_UPDATED`.

**Beispiel** (Pfefferminze nach Anlegen, Ziehzeit ergänzt und englischer Übersetzung):

```
IngredientVersion
 version | isCurrent | caffeine | brewTempC | brewSeconds | author | note
---------+-----------+----------+-----------+-------------+--------+------------------
       1 | f         | no       |        95 |             | Anna   |
       2 | f         | no       |        95 |         300 | Ben    | Ziehzeit ergänzt
       3 | t         | no       |        95 |         300 | Cara   | Englisch ergänzt

IngredientVersionTranslation
 version | locale | name         | nameKey
---------+--------+--------------+--------------
       1 | de     | Pfefferminze | pfefferminze
       2 | de     | Pfefferminze | pfefferminze
       3 | de     | Pfefferminze | pfefferminze
       3 | en     | Peppermint   | peppermint
```

```ts
// shared/types/ingredient.ts
export type ContentLocale = 'de' | 'en'
export type CaffeineValue = 'yes' | 'no' | 'unknown'
export interface IngredientText { name: string, description: string | null }
export interface IngredientSnapshot {
  sourceLocale: ContentLocale
  caffeine: CaffeineValue
  brewTempC: number | null
  brewSeconds: number | null
  translations: Partial<Record<ContentLocale, IngredientText>>
}
export interface AuthorRef { displayName: string }          // nie E-Mail (AK-1.4)
export interface IngredientDetail extends IngredientSnapshot {
  id: string, version: number, updatedAt: string, updatedBy: AuthorRef | null
}
export interface IngredientListItem { id: string, name: string, translated: boolean, caffeine: CaffeineValue }
export interface RevisionEntry { version: number, isCurrent: boolean, createdAt: string, author: AuthorRef | null, note: string | null }
export interface SnapshotChange { field: 'name' | 'description' | 'caffeine' | 'brewTempC' | 'brewSeconds', locale?: ContentLocale, from: unknown, to: unknown }
```

Ein `IngredientSnapshot` wird aus einer Version samt ihren Übersetzungen gebildet. Er wird nicht mehr als JSON gespeichert. „Zuletzt geändert von“ ist der Autor der aktuellen Version, „angelegt“ der Autor von Version 1. Ein gelöschter Autor (Slice 11) erscheint als `null` und in der UI als „gelöschtes Konto“.

## Regeln und Hilfsfunktionen (`shared/utils/ingredient.ts`)

- `normalizeName(name)`: `NFC` → trimmen → Leerraum zusammenfassen → `toLocaleLowerCase('und')`. Ergibt `nameKey`. „ Grüner  Tee “ und „grüner tee“ sind also gleich.
- `pickTranslation(snapshot, locale)` → `{ text, locale, translated }`: Übersetzung der aktuellen Sprache, sonst die Originalsprache (AK-1.3).
- `diffSnapshots(a, b)` → `SnapshotChange[]`: vergleicht die Grundfelder und je Sprache `name` und `description`. Eine hinzugekommene Sprache erscheint als `from: null` (AK-5.2).

## Eingabeprüfung (`shared/schemas/ingredient.ts`)

```ts
const text = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).nullish().transform(v => v || null),
})
const facts = {
  caffeine: z.enum(['yes', 'no', 'unknown']),
  brewTempC: z.number().int().min(40).max(100).nullable(),
  brewSeconds: z.number().int().min(10).max(1800).nullable(),
}
export const createIngredientSchema = z.object({
  locale: z.enum(CONTENT_LOCALES), ...text.shape,
  caffeine: facts.caffeine.default('unknown'),
  brewTempC: facts.brewTempC.default(null), brewSeconds: facts.brewSeconds.default(null),
  note: z.string().trim().max(200).optional(),
})
export const updateIngredientSchema = z.object({
  version: z.number().int().min(1),
  caffeine: facts.caffeine.optional(), brewTempC: facts.brewTempC.optional(), brewSeconds: facts.brewSeconds.optional(),
  translations: z.partialRecord(z.enum(CONTENT_LOCALES), text).optional(),
  note: z.string().trim().max(200).optional(),
})
export const ingredientListQuerySchema = z.object({ q: z.string().trim().max(80).optional(), page, locale: z.enum(CONTENT_LOCALES) })
export const similarQuerySchema = z.object({ name: z.string().trim().min(2).max(80), locale: z.enum(CONTENT_LOCALES) })
export const compareQuerySchema = z.object({ from: z.coerce.number().int().min(1), to: z.coerce.number().int().min(1) })
```

Eine Übersetzung lässt sich nicht entfernen: Das Schema kennt kein „löschen“. Damit ist AK-4.3 für die Originalsprache und auch für alle anderen Sprachen erfüllt. Entfernen kann in 05 eine Moderationsaktion werden.

## API

Alle schreibenden Routen brauchen Anmeldung und ein CSRF-Token (02). Lesende Routen sind öffentlich. Fehler kommen im Format aus 01.

| Methode | Route | Rolle | Request | Response | Fehler |
|---|---|---|---|---|---|
| GET | `/api/ingredients` | – | `?q&page&locale` | `200 Page<IngredientListItem>` (24 pro Seite) | 400 |
| GET | `/api/ingredients/similar` | – | `?name&locale` | `200 { items: { id, name }[] }` (max. 5) | 400 |
| POST | `/api/ingredients` | user | `createIngredientSchema` | `201 { ingredient: IngredientDetail }` | 400, 401, 403, 409 `DUPLICATE_NAME`, 429 |
| GET | `/api/ingredients/:id` | – | – | `200 { ingredient: IngredientDetail }` | 404 |
| PATCH | `/api/ingredients/:id` | user | `updateIngredientSchema` | `200 { ingredient, changed: boolean }` | 400, 401, 403, 404, 409 `EDIT_CONFLICT` / `DUPLICATE_NAME`, 429 |
| GET | `/api/ingredients/:id/revisions` | – | `?page` | `200 Page<RevisionEntry>` (50 pro Seite) | 404 |
| GET | `/api/ingredients/:id/compare` | – | `?from&to` | `200 { from: RevisionEntry & { snapshot }, to: …, changes: SnapshotChange[] }` | 400, 404 |

**Liste und Suche:** `$queryRaw`, parametrisiert, Übersetzungen immer per Join auf `IngredientVersion` mit `WHERE v."isCurrent"` (die Abfragen stehen gebündelt in `server/utils/ingredients.ts`, damit der Filter nirgends fehlt). Der Anzeigename ist `COALESCE(Übersetzung der aktuellen Sprache, Originalsprache)`. Sortiert wird nach `lower(name) COLLATE "de-x-icu"`, sodass Umlaute richtig einsortiert werden. Die Suche läuft über `EXISTS (… name ILIKE '%' || q || '%')` über alle Sprachen (AK-1.2). `escapeLike` maskiert `%`, `_` und `\`.

**Ähnliche Namen:** Gesucht wird über alle aktuellen Namen aller Sprachen mit `similarity(name, $name) > 0.3 OR name ILIKE '%' || $name || '%'`, sortiert nach Ähnlichkeit, höchstens 5 Treffer. Gezeigt wird der Name in der aktuellen Sprache bzw. mit Fallback.

**Anlegen** läuft in einer Transaktion:
1. `Ingredient` anlegen.
2. `IngredientVersion` mit `version = 1` und `isCurrent = true` anlegen.
3. Die Übersetzung mit `nameKey` anlegen. Vorher läuft die Duplikatprüfung (siehe unten).
4. Nach der Transaktion den Audit-Eintrag schreiben: `INGREDIENT_CREATED` mit `{ ingredientId, version: 1 }`.

**Bearbeiten** läuft in einer Transaktion:
1. Die aktuelle Version samt Übersetzungen laden. Fehlt die Zutat, gibt es 404.
2. Neuen Snapshot bilden: aktuelle Werte, darüber die mitgeschickten Grundfelder, darüber die Übersetzungen pro Sprache.
3. Liefert `diffSnapshots(alt, neu)` eine leere Liste, kommt `200 { changed: false }` ohne neue Version (AK-3.3).
4. Alte Version deaktivieren: `UPDATE "IngredientVersion" SET "isCurrent" = false WHERE "ingredientId" = $id AND "isCurrent" AND version = $erwartet`. Bei 0 betroffenen Zeilen gibt es 409 `EDIT_CONFLICT` mit `details: { currentVersion }` (AK-3.2).
5. Für jeden geänderten Namen die Duplikatprüfung ausführen. Dann die neue Version mit `version = erwartet + 1` und `isCurrent = true` anlegen. Alle Übersetzungen des neuen Snapshots werden **kopiert**, auch unveränderte, damit jede Version vollständig ist. `@@unique([ingredientId, version])` und der Index „eine aktuelle Version“ fangen gleichzeitige Speicherungen zusätzlich ab.
6. Danach den Audit-Eintrag schreiben: `INGREDIENT_UPDATED` mit `{ ingredientId, version, locales }`.

**Duplikate** (`assertNameAvailable(tx, locale, nameKey, ignoreIngredientId?)`):
1. `SELECT pg_advisory_xact_lock(hashtext('ingredient-name:' || locale || ':' || nameKey))`. Gleichzeitige Speicherungen desselben Namens laufen dadurch nacheinander, die Sperre endet mit der Transaktion.
2. Prüfen, ob eine **aktuelle** Version einer anderen Zutat diesen `nameKey` in dieser Sprache hat (Join auf `isCurrent`).
3. Wenn ja: 409 `DUPLICATE_NAME` mit `details: { ingredientId, locale }` der bestehenden Zutat, damit die UI dorthin verlinken kann (AK-2.3).

Die Transaktionen laufen mit `READ COMMITTED` (Standard). Weil die Sperre vor der Prüfung genommen wird, sieht die zweite Anfrage den Commit der ersten.

**Rate-Limit:** `consume('catalog:user:<id>', 30, 10 min)` für POST und PATCH (AK-3.5).

**Versionen:** Es gibt nur `GET`-Routen. `PATCH`/`DELETE` auf `/revisions` antworten mit 404 aus dem Catch-all (AK-5.3). Alte Versionen werden nie geändert, nur ihr `isCurrent`-Flag wechselt. In 05 kann eine alte Version wieder aktiv geschaltet oder als neue Version kopiert werden; das legt 05 fest.

## UI

Die sprachabhängigen Pfade stehen zentral in `nuxt.config.ts`:

```ts
i18n: {
  customRoutes: 'config',
  pages: {
    'ingredients/index':        { de: '/zutaten',                  en: '/ingredients' },
    'ingredients/new':          { de: '/zutaten/neu',              en: '/ingredients/new' },
    'ingredients/[id]/index':   { de: '/zutaten/[id]',             en: '/ingredients/[id]' },
    'ingredients/[id]/edit':    { de: '/zutaten/[id]/bearbeiten',  en: '/ingredients/[id]/edit' },
    'ingredients/[id]/history': { de: '/zutaten/[id]/historie',    en: '/ingredients/[id]/history' },
  },
}
```

Links entstehen immer über `localePath({ name: 'ingredients-id', params: { id } })`, nie als fest geschriebene Pfade.

**Navigation:**
- Ab `sm` gibt es in der App-Bar Text-Links („Zutaten“).
- Darunter gibt es ein Menü-Icon, das einen `v-navigation-drawer` öffnet.
- Das Logo bzw. der Titel führt zur Startseite.
- Die Einträge liegen in `AppNav.vue` und sind für spätere Slices erweiterbar.

**Seiten:**

| Seite | Inhalt |
|---|---|
| Liste | Suchfeld mit 300 ms Verzögerung, Suchbegriff in der URL (`?q`, `?page`). Karten bzw. Liste mit Name, Koffein-Chip und „nicht übersetzt“-Hinweis. `v-pagination`. Button „Zutat anlegen“ für Angemeldete, Gäste sehen einen Anmelde-Hinweis (AK-2.4) |
| Anlegen | `IngredientForm`: Sprache (Standard: aktuelle App-Sprache), Name, Beschreibung, Koffein (`v-btn-toggle`), Temperatur und Ziehzeit (Zahlenfelder, Ziehzeit in Minuten:Sekunden angezeigt), Notiz. Unter dem Namen die Liste „Ähnliche Zutaten“ (400 ms Verzögerung, Links) |
| Detail | Name (mit Fallback-Hinweis und Link „Übersetzen“), Beschreibung mit `white-space: pre-line` (AK-7.2), `IngredientFacts`, „Zuletzt geändert am … von …“. Buttons „Bearbeiten“ (angemeldet) und „Historie“ |
| Bearbeiten | `IngredientForm` mit Tabs pro Sprache (die Originalsprache ist markiert, fehlende Übersetzungen tragen ein „+“). `?lang=en` öffnet direkt den Tab. Die Version wird beim Laden gemerkt und mitgeschickt. Bei 409 `EDIT_CONFLICT` erscheint ein Hinweis mit dem Button „Aktuelle Fassung laden“, der die eigenen Eingaben verwirft; vorher wird darauf hingewiesen. Bei `DUPLICATE_NAME` erscheint ein Link zur bestehenden Zutat. Nach dem Speichern geht es zurück zur Detailseite; ohne Änderung erscheint der Hinweis „Keine Änderungen“ |
| Historie | Versionsliste (Nummer, Datum, Autor, Notiz) mit Radiobuttons „von“ und „bis“, Standard: neueste gegen vorletzte. `RevisionDiff` zeigt die Tabelle Feld \| Sprache \| vorher \| nachher. Bei 360 px werden die Zeilen gestapelt |

`app/pages/admin/audit.vue` zeigt bei Zutat-Ereignissen „Version n“ und einen Link zur Zutat.

## Tests

| Projekt | Datei | Inhalt |
|---|---|---|
| unit | `ingredient.test.ts` | `normalizeName` (Leerraum, Groß/klein, Umlaute, NFC); `diffSnapshots` (Grundfeld, Übersetzung neu/geändert, keine Änderung); `pickTranslation` (Fallback); Schemas (Grenzen 2/80, 2000, 40/100, 10/1800, unbekannte Sprache); `escapeLike` |
| api | `ingredients.test.ts` (Ergänzung) | nach mehreren Änderungen genau eine Version mit `isCurrent` je Zutat (per SQL); 5 gleichzeitige Anlegen-Anfragen mit demselben Namen → genau eine 201, vier 409 |
| api | `ingredients.test.ts` | Gast → 401 bei POST/PATCH, GET öffentlich; Anlegen → Version 1 und Audit; Duplikat (Groß/klein, Leerzeichen) → 409 mit ID; ähnliche Namen; Liste: Sortierung mit Umlauten, Suche über Sprachen, Fallback-Flag, Seiten; Detail 404 bzw. ungültige ID; Bearbeiten → Version 2, ohne Änderung keine Version, veraltete Version → 409, Umbenennen in Duplikat → 409; Übersetzung hinzufügen; Historie und Vergleich; Rate-Limit (31. Änderung → 429); Ausgabe von `<script>` als Text in JSON (keine Veränderung) |

Die Darstellung als Text (AK-7.2) wird zusätzlich im Browser geprüft: Eine Beschreibung mit `<b>` erscheint wörtlich.

## Entscheidungen

- **Versionen als Zeilen mit `isCurrent`-Flag** (Entscheidung des Nutzers, 2026-10-22). Es gibt keinen separat gespeicherten aktuellen Stand und keine doppelte Speicherung der aktuellen Version, und andere Versionen lassen sich später aktiv schalten.
  - Verworfen: eigene Tabellen für den aktuellen Stand plus JSON-Snapshots, weil die neueste Version dann doppelt vorliegt.
  - Verworfen: nur Änderungen speichern, weil jede Anzeige und jedes Zurücksetzen dann das Nachrechnen aller Änderungen bräuchte.
- **Unveränderte Übersetzungen werden je Version kopiert:** Jede Version ist vollständig und einzeln lesbar. Der Speicher ist bei kleinen Datensätzen vernachlässigbar.
- **`isCurrent` nur an der Version** (Hinweis des Nutzers, 2026-10-22): Übersetzungen tragen kein eigenes Flag. Die Duplikatregel prüft deshalb der Code mit Advisory-Sperre statt eines Unique-Index. Gleichzeitige Anfragen deckt ein API-Test ab. Der Trigram-Index umfasst auch Namen alter Versionen, die Abfrage filtert per Join.
  - Verworfen: eine Kopie des Flags in der Übersetzungstabelle für einen partiellen Unique-Index, weil sie redundant ist und synchron gehalten werden muss.
- **Partieller Index „eine aktuelle Version“ und Trigram-Index als SQL in der Migration:** Prisma kennt sie nicht, deshalb werden neue Migrationen mit `--create-only` erzeugt und geprüft.
- **Optimistisches Sperren über das Flag:** Kein Sperren beim Öffnen, Konflikte erkennt das Speichern. Verworfen: Bearbeitungssperren, weil sie liegen bleiben, wenn jemand den Tab schließt.
- **`nameKey` (normalisierter Name):** Die Duplikatprüfung vergleicht normalisiert, sodass „ Grüner  Tee “ und „grüner tee“ gleich sind.
- **`pg_trgm` für ähnliche Namen und Suche:** Findet auch Tippfehler („Pfeferminze“) und beschleunigt `ILIKE '%…%'` per GIN-Index.
- **Sortierung mit `de-x-icu`:** Umlaute werden richtig einsortiert. Die Kollation passt auch für Englisch.
- **Sprachabhängige Pfade zentral in `nuxt.config.ts`** (`customRoutes: 'config'`).
- **Ein PATCH für Grunddaten und Übersetzungen:** genau eine Version pro Speichern.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-0.1, 0.2 | Datenmodell, `createIngredientSchema` |
| AK-1.1 | `index.get.ts` (Sortierung ICU, 24/Seite), `pages/ingredients/index.vue`, i18n-Pfade |
| AK-1.2 | `index.get.ts` (`EXISTS … ILIKE` über alle Sprachen), `escapeLike` |
| AK-1.3 | `pickTranslation`, `useIngredientText`, `translated`-Flag |
| AK-1.4 | `[id]/index.get.ts` (`updatedBy.displayName`), Detailseite |
| AK-1.5 | UUID-Pfade, 404 aus der API → Nuxt-Fehlerseite |
| AK-2.1 | `index.post.ts` (Transaktion, Version 1) |
| AK-2.2 | `similar.get.ts`, Anlegen-Seite |
| AK-2.3, 3.4 | `assertNameAvailable` (Advisory-Sperre + Prüfung gegen aktuelle Versionen), `DUPLICATE_NAME` mit ID |
| AK-2.4 | `requireUser`, Liste mit Anmelde-Hinweis |
| AK-3.1 | `[id]/index.patch.ts`, Revision mit Notiz |
| AK-3.2 | `UPDATE … SET isCurrent = false WHERE … version = …`, `EDIT_CONFLICT`, Formular-Hinweis |
| AK-3.3 | `diffSnapshots` leer → `changed: false` |
| AK-3.5 | `consume('catalog:user:…')` |
| AK-3.6 | Keine DELETE-Route |
| AK-4.1–4.3 | `translations` im PATCH, Tabs im Formular, Schema ohne Entfernen |
| AK-5.1–5.3 | `revisions.get.ts`, `compare.get.ts` (Snapshots aus zwei Versionen), `diffSnapshots`, `RevisionDiff`, nur GET-Routen |
| AK-6.1 | `audit()` mit neuen Ereignissen, `admin/audit.vue` |
| AK-7.1 | gemeinsame Schemas, `useFormErrors` |
| AK-7.2 | Ausgabe nur per `{{ }}`, `pre-line` |
| AK-7.3, 7.4 | Sprachdateien, Browserprüfung, Tests |

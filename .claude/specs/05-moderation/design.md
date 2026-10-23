# Design: 05 – Moderation

> Phase 2 zu [requirements.md](requirements.md). Status: **freigegeben (2026-10-23)**

## Überblick

Baut auf 02 (Rollen, `requireRole`, Sessions, `blockedAt`, Audit), 03 und 04 (Versionsmodell mit `isCurrent`, Duplikatregel, optimistisches Sperren, Historie) auf. Moderation fügt dem Katalog **zwei Zustände** hinzu – ausgeblendet und zusammengeführt – und neue Wege, Versionen zu schreiben: Zurücksetzen, Umhängen beim Zusammenführen, Massen-Zurücksetzen.

```
Seiten                                  API                                          DB
/zutaten/:id, /tees/:id ─ Melden ────►  POST /api/reports                            Report (neu)
                       ─ Moderation ─►  GET  /api/admin/{ingredients|teas}/:id/merge  Ingredient/Tea
                                        POST /api/admin/{…}/:id/merge                  + hiddenAt, mergedIntoId …
                                        POST /api/admin/{…}/:id/hide | /restore      CatalogEvent (neu)
…/historie ─ Zurücksetzen ───────────►  POST /api/{ingredients|teas}/:id/revert       *Version + revertedTo …
/admin/reports ──────────────────────►  GET  /api/admin/reports, POST …/resolve
                                        GET  /api/admin/reports/count
/admin/hidden ───────────────────────►  GET  /api/admin/hidden
/admin/moderation/users ─────────────►  GET  /api/admin/moderation/users             User + blockedUntil …
                                        POST|DELETE /api/admin/users/:id/block
                                        GET|POST /api/admin/users/:id/bulk-revert
/login ──────────────────────────────►  POST /api/auth/login (ACCOUNT_BLOCKED + until)
```

**Kernideen:**
- **„Aktiv“ ist eine zentrale Bedingung.** Ein Eintrag ist aktiv, wenn `hiddenAt IS NULL AND mergedIntoId IS NULL`. Sie steht genau einmal in `server/utils/ingredients.ts` bzw. `teas.ts` (`ACTIVE`, `activeSql`) und wird von allen bestehenden Abfragen übernommen: Detail, Liste, Suche, ähnliche Einträge, Duplikatregel, Zutatenprüfung im Tee, Tees einer Zutat. Nicht aktive Einträge sind dadurch überall „nicht vorhanden“, ohne dass jede Route einzeln daran denken muss.
- **Eine Funktion schreibt Versionen.** Das Muster aus den PATCH-Routen (Diff → Version deaktivieren → Duplikatregel → neue Version) wird je Entität zu `saveIngredientVersion` / `saveTeaVersion` herausgelöst. Bearbeiten, Zurücksetzen, Zusammenführen und Massen-Zurücksetzen nutzen dieselbe Funktion; Konfliktschutz und Duplikatregel gelten so automatisch überall (AK-1.3).
- **Kennzeichnung statt fester Notiztexte.** Zurücksetzungen und Umhängungen werden an der Version strukturiert gespeichert (`revertedTo`, `mergedIngredientId`, `bulkRevertOfId`). Die Historie formuliert daraus übersetzt „Zurückgesetzt auf Version n“; die Notiz bleibt allein dem Nutzer (wie beim Veröffentlichen in 04).
- **Sperren über Zeilensperren statt eigener Logik.** Zusammenführen und Ausblenden sperren die betroffenen Zeilen (`FOR UPDATE`); die Zutatenprüfung beim Speichern eines Tees nimmt `FOR SHARE`. Gleichzeitige Änderungen laufen dadurch nacheinander, und ein Tee-Speichern nach einer Zusammenführung scheitert sauber mit `EDIT_CONFLICT` (AK-4.7).

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `prisma/schema.prisma` | geändert | Felder an `User`, `Ingredient`, `Tea`, `IngredientVersion`, `TeaVersion`; Modelle `Report`, `CatalogEvent`; Enums `CatalogType`, `ReportReason`, `ReportStatus`, `CatalogEventKind`; `AuditEvent` + 13 Werte |
| `prisma/migrations/0006_moderation/` | neu | Tabellen, Spalten; partieller Unique-Index „eine offene Meldung pro Nutzer und Eintrag“ als SQL |
| `shared/types/moderation.ts` | neu | `ReportReasonValue`, `ReportInput`, `ReportGroup`, `ReportView`, `HiddenEntry`, `ModerationUser`, `BlockDuration`, `MergePreview`, `BulkRevertPlan`, `BulkRevertResult`, `CatalogEventEntry` |
| `shared/types/catalog.ts` | geändert | `RevisionEntry` + `revertedTo`, `mergedIngredient`, `bulkRevertOf`; `ModerationState` |
| `shared/types/auth.ts`, `shared/utils/roles.ts` | geändert | `AUDIT_EVENTS` + 13 Werte |
| `shared/schemas/moderation.ts` | neu | zod: Meldung, Abschließen, Listenfilter, Ausblenden, Zusammenführen, Sperren, Massen-Zurücksetzen |
| `shared/schemas/catalog.ts` | geändert | `revertSchema` (für Zutaten und Tees gleich) |
| `shared/utils/moderation.ts` | neu | `BLOCK_DURATIONS`, `blockedUntil(duration, now)`, `isBlocked(user, now)`, `combineIngredients(list, sourceId, targetId)` |
| `server/utils/catalog.ts` | geändert | `CatalogType`, `assertEntryActive`, `lockEntry` (`FOR UPDATE`), `recordCatalogEvent` |
| `server/utils/ingredients.ts` | geändert | `ACTIVE`/`activeSql` in allen Abfragen; `saveIngredientVersion`; `countTeasUsing`; `resolveMerged` |
| `server/utils/teas.ts` | geändert | `ACTIVE`/`activeSql`; `saveTeaVersion`; `assertIngredientsExist` nur aktive Zutaten, mit `FOR SHARE`; `revertedTeaSnapshot` |
| `server/utils/moderation.ts` | neu | `mergeIngredients`, `mergeTeas`, `hideEntry`, `restoreEntry`, `closeReports`, `planBulkRevert`, `runBulkRevert` |
| `server/utils/users.ts` | geändert | `assertCanBlock(actor, target)`, `toModerationUser` |
| `server/utils/session.ts` | geändert | Sperrprüfung über `isBlocked` (berücksichtigt `blockedUntil`) |
| `server/api/auth/login.post.ts` | geändert | `ACCOUNT_BLOCKED` mit `details.until` (AK-6.2) |
| `server/api/ingredients/[id]/index.patch.ts`, `server/api/teas/[id]/index.patch.ts` | geändert | nutzen `save*Version` |
| `server/api/ingredients/[id]/index.get.ts`, `server/api/teas/[id]/index.get.ts` | geändert | 404 mit `mergedInto`; `?merged=1` für die Historie; Moderatoren sehen ausgeblendete Einträge mit `moderation` |
| `server/api/ingredients/[id]/revisions.get.ts`, `server/api/teas/[id]/revisions.get.ts` | geändert | Zusatzfelder der Versionen, `events` (Ausblenden/Wiederherstellen/Zusammenführen) |
| `server/api/ingredients/[id]/compare.get.ts`, `server/api/teas/[id]/compare.get.ts` | geändert | Sichtbarkeit wie Detail; im Tee-Vergleich `mergedInto` je Zutat (AK-4.4) |
| `server/api/ingredients/[id]/revert.post.ts`, `server/api/teas/[id]/revert.post.ts` | neu | Zurücksetzen |
| `server/api/reports/index.post.ts` | neu | Melden |
| `server/api/admin/reports/index.get.ts`, `resolve.post.ts`, `count.get.ts` | neu | Meldungen |
| `server/api/admin/hidden.get.ts` | neu | ausgeblendete Einträge |
| `server/api/admin/[type]/[id]/merge.get.ts`, `merge.post.ts`, `hide.post.ts`, `restore.post.ts` | neu | `type` = `ingredients` \| `teas` |
| `server/api/admin/moderation/users.get.ts` | neu | Nutzersuche für Moderatoren |
| `server/api/admin/users/[id]/block.post.ts`, `block.delete.ts` | neu | Sperren, Entsperren |
| `server/api/admin/users/[id]/bulk-revert.get.ts`, `bulk-revert.post.ts` | neu | Vorschau, Ausführen |
| `nuxt.config.ts` | geändert | keine neuen sprachabhängigen Pfade (Admin-Pfade sind wie bisher sprachneutral) |
| `app/middleware/moderator.ts` | neu | Moderationsseiten für `moderator` und `admin` |
| `app/composables/useAuth.ts` | geändert | `isModerator` |
| `app/composables/useOpenReports.ts` | neu | Anzahl offener Meldungen für das Badge |
| `app/components/UserMenu.vue` | geändert | Eintrag „Moderation“ mit Badge |
| `app/components/AdminNav.vue` | geändert | Tabs je nach Rolle |
| `app/components/moderation/ReportDialog.vue` | neu | Melden (Grund, Kommentar, Original bei Duplikat) |
| `app/components/moderation/EntryModerationMenu.vue` | neu | Menü „Moderation“ auf Detailseiten: Zusammenführen, Ausblenden |
| `app/components/moderation/MergeDialog.vue` | neu | Ziel wählen, Vorschau, Bestätigung |
| `app/components/moderation/HideDialog.vue` | neu | Grund, Bestätigung |
| `app/components/moderation/HiddenBanner.vue` | neu | Hinweis für Moderatoren auf ausgeblendeten Einträgen, „Wiederherstellen“ |
| `app/components/moderation/BlockDialog.vue` | neu | Dauer, Grund |
| `app/components/moderation/BulkRevertDialog.vue` | neu | Zeitraum, Vorschau, Ergebnis |
| `app/components/moderation/EntrySearch.vue` | neu | Autocomplete über Zutaten bzw. öffentliche Tees (Melden-Dialog, Zusammenführen) |
| `app/components/catalog/RevertDialog.vue` | neu | Zurücksetzen mit optionaler Notiz |
| `app/components/catalog/RevisionList.vue` | neu | aus beiden Historie-Seiten herausgelöst: Versionen und Ereignisse, Zurücksetzen-Knopf |
| `app/pages/ingredients/[id]/index.vue`, `app/pages/teas/[id]/index.vue` | geändert | Melden, Moderationsmenü, Banner, Weiterleitung bei `mergedInto`, Hinweis `?mergedFrom` |
| `app/pages/ingredients/[id]/history.vue`, `app/pages/teas/[id]/history.vue` | geändert | `RevisionList`, `?merged=1` |
| `app/pages/admin/index.vue` | geändert | Weiterleitung: Admin → Nutzer, Moderator → Meldungen |
| `app/pages/admin/reports.vue` | neu | Meldungen offen/abgeschlossen |
| `app/pages/admin/hidden.vue` | neu | ausgeblendete Einträge |
| `app/pages/admin/moderation/users.vue` | neu | Sperren, Massen-Zurücksetzen |
| `app/pages/admin/audit.vue` | geändert | Details der neuen Ereignisse |
| `app/pages/login.vue` | geändert | Sperrmeldung mit Datum |
| `i18n/locales/de.json`, `en.json` | geändert | Texte |
| `test/unit/moderation.test.ts` | neu | Schemas, `blockedUntil`, `isBlocked`, `combineIngredients` |
| `test/api/moderation.test.ts` | neu | Melden, Meldungen, Ausblenden, Zusammenführen, Rechte |
| `test/api/revert.test.ts` | neu | Zurücksetzen, Massen-Zurücksetzen |
| `test/api/block.test.ts` | neu | Sperren |
| `test/api/ingredients.test.ts`, `teas.test.ts` | unverändert | sichern die Herauslösung von `save*Version` ab |
| `README.md`, `.claude/skills/nuxt-dev/SKILL.md` | geändert | SQL-Objekte der neuen Migration |

## Datenmodell

```prisma
enum CatalogType {
  ingredient
  tea
}

enum ReportReason {
  duplicate
  wrong_info
  spam
  inappropriate
  other
}

enum ReportStatus {
  open
  resolved   // erledigt
  rejected   // abgelehnt
}

enum CatalogEventKind {
  hidden
  restored
  merged
}

model User {
  // … bestehend; blockedAt bekommt die Bedeutung „gesperrt seit“
  blockedAt     DateTime?
  /// null bei gesetztem blockedAt = unbefristet
  blockedUntil  DateTime?
  blockReason   String?   @db.VarChar(500)
  blockedById   String?   @db.Uuid
  blockedBy     User?     @relation("UserBlockedBy", fields: [blockedById], references: [id], onDelete: SetNull)
  // + Rückrelationen: reports, reportsResolved, catalogEvents, hiddenIngredients, hiddenTeas …
}

model Ingredient {
  // … bestehend
  hiddenAt     DateTime?
  hiddenById   String?     @db.Uuid
  hiddenBy     User?       @relation("IngredientHiddenBy", fields: [hiddenById], references: [id], onDelete: SetNull)
  hiddenReason String?     @db.VarChar(500)
  /// gesetzt = zusammengeführt in diesen Eintrag; endgültig (AK-4.6)
  mergedIntoId String?     @db.Uuid
  mergedInto   Ingredient? @relation("IngredientMerge", fields: [mergedIntoId], references: [id], onDelete: Restrict)
  mergedFrom   Ingredient[] @relation("IngredientMerge")
  mergedAt     DateTime?

  @@index([mergedIntoId])
  @@index([hiddenAt])
}

model Tea {
  // … bestehend; dieselben sechs Felder mit Relation "TeaMerge" / "TeaHiddenBy"
}

model IngredientVersion {
  // … bestehend
  /// Inhalt entspricht dieser früheren Version (Zurücksetzen, AK-1.1)
  revertedTo     Int?   @db.SmallInt
  /// Massen-Zurücksetzung der Änderungen dieses Nutzers (AK-7.2)
  bulkRevertOfId String? @db.Uuid
  bulkRevertOf   User?  @relation("IngredientVersionBulkRevert", fields: [bulkRevertOfId], references: [id], onDelete: SetNull)
}

model TeaVersion {
  // … bestehend; revertedTo, bulkRevertOfId wie oben, zusätzlich:
  /// Version entstand durch Zusammenführen dieser Zutat (Quelle) in eine andere (AK-4.3)
  mergedIngredientId String?     @db.Uuid
  mergedIngredient   Ingredient? @relation("TeaVersionMergedIngredient", fields: [mergedIngredientId], references: [id], onDelete: Restrict)
}

model Report {
  id            String       @id @default(uuid(7)) @db.Uuid
  entityType    CatalogType
  /// Zutat oder öffentlicher Tee; kein FK, weil zwei Tabellen (siehe Entscheidungen)
  entityId      String       @db.Uuid
  reporterId    String?      @db.Uuid
  reporter      User?        @relation("ReportReporter", fields: [reporterId], references: [id], onDelete: SetNull)
  reason        ReportReason
  comment       String?      @db.VarChar(500)
  /// nur bei reason = duplicate, gleicher entityType
  duplicateOfId String?      @db.Uuid
  status        ReportStatus @default(open)
  resolvedById  String?      @db.Uuid
  resolvedBy    User?        @relation("ReportResolver", fields: [resolvedById], references: [id], onDelete: SetNull)
  resolvedAt    DateTime?
  resolutionNote String?     @db.VarChar(500)
  createdAt     DateTime     @default(now())

  @@index([status, createdAt])
  @@index([entityType, entityId, status])
}

/// Ereignisse ohne neue Version, für die Historie (AK-5.6) und die Liste „Ausgeblendet“
model CatalogEvent {
  id         BigInt           @id @default(autoincrement())
  entityType CatalogType
  entityId   String           @db.Uuid
  kind       CatalogEventKind
  actorId    String?          @db.Uuid
  actor      User?            @relation("CatalogEventActor", fields: [actorId], references: [id], onDelete: SetNull)
  /// Grund beim Ausblenden; nur Moderatoren sehen ihn
  reason     String?          @db.VarChar(500)
  /// Ziel beim Zusammenführen
  targetId   String?          @db.Uuid
  createdAt  DateTime         @default(now())

  @@index([entityType, entityId, createdAt])
}
```

In der Migration zusätzlich als SQL (`--create-only`, wie 0003/0004):

```sql
-- Höchstens eine offene Meldung je Nutzer und Eintrag (AK-2.4)
CREATE UNIQUE INDEX "Report_open_key" ON "Report" ("reporterId", "entityType", "entityId") WHERE status = 'open';
-- Zusammengeführt und ausgeblendet schließen sich aus
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_merged_not_hidden" CHECK ("mergedIntoId" IS NULL OR "hiddenAt" IS NULL);
ALTER TABLE "Tea"        ADD CONSTRAINT "Tea_merged_not_hidden"        CHECK ("mergedIntoId" IS NULL OR "hiddenAt" IS NULL);
```

```ts
// shared/types/moderation.ts (Auszug)
export type ReportReasonValue = 'duplicate' | 'wrong_info' | 'spam' | 'inappropriate' | 'other'
export type BlockDuration = '24h' | '7d' | '30d' | 'permanent'
export type CatalogTypeValue = 'ingredient' | 'tea'

export interface ReportView {
  id: string, reason: ReportReasonValue, comment: string | null, createdAt: string,
  reporter: AuthorRef | null, duplicateOf: { id: string, name: string } | null,
  status: 'open' | 'resolved' | 'rejected',
  resolvedBy: AuthorRef | null, resolvedAt: string | null, resolutionNote: string | null,
}
export interface ReportGroup {
  entityType: CatalogTypeValue, entityId: string, name: string,
  state: 'active' | 'hidden' | 'merged',
  lastAuthor: { id: string, displayName: string } | null,   // für „Autor sperren“ (AK-3.2)
  count: number, oldestAt: string, reports: ReportView[],
}
export interface MergePreview {
  source: IngredientDetail | TeaDetail, target: IngredientDetail | TeaDetail,
  teas?: { public: number, private: number },                // nur bei Zutaten (AK-4.1)
  missingTranslations: ContentLocale[],                      // Quelle hat sie, Ziel nicht (AK-4.5)
}
export interface ModerationUser {
  id: string, displayName: string, role: Role, email?: string,  // email nur für Admins (AK-6.6)
  blocked: boolean, blockedAt: string | null, blockedUntil: string | null, blockReason: string | null,
  changes30d: number,
}
export interface BulkRevertPlan {
  revert: BulkItem[], hide: BulkItem[], skip: (BulkItem & { reason: 'changed_by_others' | 'in_use' | 'duplicate' | 'ingredient_unavailable' })[],
}
export interface BulkItem { entityType: CatalogTypeValue, entityId: string, name: string, toVersion?: number }
export interface CatalogEventEntry {
  kind: 'hidden' | 'restored' | 'merged', createdAt: string, actor: AuthorRef | null,
  reason?: string | null,      // nur für Moderatoren
  mergedInto?: string,
}

// shared/types/catalog.ts – Ergänzungen
export interface RevisionEntry {
  // … bestehend
  revertedTo: number | null
  bulkRevertOf: AuthorRef | null
  mergedIngredient: { id: string, mergedInto: string } | null   // nur Tees
}
/** Nur für Moderatoren an Detail-Antworten ausgeblendeter Einträge */
export interface ModerationState { hiddenAt: string, hiddenBy: AuthorRef | null, hiddenReason: string }
```

## Regeln (`shared/schemas/moderation.ts`, `shared/utils/moderation.ts`)

```ts
const reasonText = z.string().trim().min(1).max(500)

export const reportSchema = z.object({
  entityType: z.enum(['ingredient', 'tea']),
  entityId: z.uuid(),
  reason: z.enum(['duplicate', 'wrong_info', 'spam', 'inappropriate', 'other']),
  comment: z.string().trim().max(500).nullish().transform(v => v || null),
  duplicateOfId: z.uuid().nullish(),
})
  .refine(r => r.reason !== 'other' || r.comment, { path: ['comment'], message: 'required' })        // AK-2.1
  .refine(r => r.reason !== 'duplicate' || r.duplicateOfId, { path: ['duplicateOfId'], message: 'required' }) // AK-2.2
  .transform(r => ({ ...r, duplicateOfId: r.reason === 'duplicate' ? r.duplicateOfId! : null }))

export const resolveReportsSchema = z.object({
  entityType, entityId, status: z.enum(['resolved', 'rejected']),
  note: z.string().trim().max(500).nullish().transform(v => v || null),
})
export const hideSchema = z.object({ reason: reasonText })
export const mergeSchema = z.object({ targetId: z.uuid() })
export const blockSchema = z.object({ duration: z.enum(['24h', '7d', '30d', 'permanent']), reason: reasonText })
export const bulkRevertSchema = z.object({ since: z.iso.datetime() })   // Zeiträume rechnet der Client in ein Datum um
export const revertSchema = z.object({                                  // shared/schemas/catalog.ts
  version: z.number().int().min(1),     // erwartete aktuelle Version (Konfliktschutz)
  to: z.number().int().min(1),          // Zielversion
  note: noteSchema,
})
```

- **`blockedUntil(duration, now)`**: `24h` → +24 h, `7d`/`30d` → + Tage, `permanent` → `null`.
- **`isBlocked(user, now)`**: `blockedAt != null && (blockedUntil == null || blockedUntil > now)`. Abgelaufene Sperren müssen nicht aufgeräumt werden (AK-6.3); die Felder bleiben bis zum nächsten Entsperren oder Sperren stehen und werden in der Moderationsliste als „abgelaufen“ angezeigt.
- **`combineIngredients(list, sourceId, targetId)`** (AK-4.3), rein funktional:
  - Kommt nur die Quelle vor: an ihrer Stelle steht das Ziel mit dem Anteil der Quelle.
  - Kommen beide vor: Das Ziel bleibt an seiner Position, die Quelle entfällt. Anteil = Summe, wenn beide angegeben sind, sonst der angegebene, sonst `null`. Die Summe kann 100 nicht überschreiten, weil beide schon in derselben Liste mit Summe ≤ 100 standen.
- Gleiche Funktion beim Zurücksetzen von Tees auf Versionen mit zusammengeführten Zutaten (AK-1.5): `resolveMerged` folgt `mergedIntoId` bis zum aktiven Eintrag; jede Umstellung läuft durch `combineIngredients`.

## API

Alle schreibenden Routen brauchen CSRF-Token. Routen unter `/api/admin/` außer den bestehenden Admin-Routen verlangen `requireRole(event, 'moderator')`; jede bekommt einen 401/403-Test (AK-0.2).

| Methode | Route | Rolle | Request | Response | Fehler |
|---|---|---|---|---|---|
| POST | `/api/ingredients/:id/revert` | user | `revertSchema` | `200 { ingredient, changed }` | 400, 401, 404, 409 `EDIT_CONFLICT`/`DUPLICATE_NAME`, 429 |
| POST | `/api/teas/:id/revert` | user (privat: Ersteller) | `revertSchema` | `200 { tea, changed }` | wie oben + 409 `INGREDIENT_UNAVAILABLE` `{ ingredientId }` |
| POST | `/api/reports` | user | `reportSchema` | `201 { id }` | 400, 401, 404 (Eintrag privat/inaktiv), 409 `ALREADY_REPORTED`, 429 |
| GET | `/api/admin/reports` | moderator | `?status=open\|closed&reason&type&page` | `200 Page<ReportGroup>` (25 Gruppen) | 400, 401, 403 |
| GET | `/api/admin/reports/count` | moderator | – | `200 { open }` (Anzahl Einträge mit offenen Meldungen) | 401, 403 |
| POST | `/api/admin/reports/resolve` | moderator | `resolveReportsSchema` | `200 { closed }` | 400, 401, 403, 404 (keine offenen) |
| GET | `/api/admin/hidden` | moderator | `?type&page` | `200 Page<HiddenEntry>` (25) | 401, 403 |
| GET | `/api/admin/:type/:id/merge` | moderator | `?target=` | `200 MergePreview` | 400 (gleich, inaktiv, privat), 401, 403, 404 |
| POST | `/api/admin/:type/:id/merge` | moderator | `mergeSchema` | `200 { targetId, teasChanged }` | 400, 401, 403, 404, 409 |
| POST | `/api/admin/:type/:id/hide` | moderator | `hideSchema` | `204` | 400, 401, 403, 404, 409 `INGREDIENT_IN_USE` `{ teas }` |
| POST | `/api/admin/:type/:id/restore` | moderator | – | `204` | 401, 403, 404 (nicht ausgeblendet), 409 `DUPLICATE_NAME` |
| GET | `/api/admin/moderation/users` | moderator | `?q&blocked&page` | `200 Page<ModerationUser>` (25) | 400, 401, 403 |
| POST | `/api/admin/users/:id/block` | moderator | `blockSchema` | `200 { user: ModerationUser }` | 400, 401, 403, 404 |
| DELETE | `/api/admin/users/:id/block` | moderator | – | `200 { user }` | 401, 403, 404 |
| GET | `/api/admin/users/:id/bulk-revert` | moderator | `?since` | `200 BulkRevertPlan` | 400, 401, 403, 404 |
| POST | `/api/admin/users/:id/bulk-revert` | moderator | `bulkRevertSchema` | `200 BulkRevertResult` (= Plan nach Ausführung) | 400, 401, 403, 404 |

`:type` ist `ingredients` oder `teas`; anderes → 404. Tees müssen öffentlich sein, sonst 404 (Moderatoren sehen keine privaten Tees).

**Geänderte bestehende Routen:**

| Route | Änderung |
|---|---|
| `GET /api/{ingredients,teas}/:id` | Zusammengeführt → `404 { details: { mergedInto } }` (Ziel aufgelöst). Mit `?merged=1` stattdessen `200` mit `mergedInto` (nur für die Historie-Seite der Quelle, AK-4.2). Ausgeblendet → 404, für Moderatoren `200` mit `moderation: ModerationState` (AK-5.4). |
| `GET …/:id/revisions` | Zusatzfelder je Version; `events: CatalogEventEntry[]` (alle, unpaginiert – es sind wenige). Ausgeblendet: wie Detail. Zusammengeführt: lesbar (AK-4.2). |
| `GET …/:id/compare` | Sichtbarkeit wie `revisions`. Tees: `ingredients[id].mergedInto` (AK-4.4). |
| `PATCH …/:id` | Ausgeblendet/zusammengeführt → 404, auch für Moderatoren. Tees: neue oder geänderte Zutaten müssen aktiv sein (400 `INGREDIENT_NOT_FOUND` wie bisher). |
| `GET /api/ingredients`, `similar`, `GET /api/teas`, `similar` | nur aktive Einträge (AK-4.2, AK-5.1) |
| `POST /api/auth/login` | Gesperrt nach richtigem Passwort → `403 ACCOUNT_BLOCKED { until: ISO \| null }` (AK-6.2); Grund nie in der Antwort |

### Version schreiben (`saveIngredientVersion`, `saveTeaVersion`)

```ts
saveTeaVersion(tx, {
  teaId, expectedVersion, before: TeaSnapshot, after: TeaSnapshot,
  authorId, note, revertedTo?, mergedIngredientId?, bulkRevertOfId?,
}): Promise<{ changed: false } | { changed: true, version: LoadedTeaVersion, locales: ContentLocale[] }>
```

1. `diff*Snapshots(before, after)` leer → `changed: false`.
2. `UPDATE … SET "isCurrent" = false WHERE … AND version = expectedVersion`; 0 Zeilen → 409 `EDIT_CONFLICT`.
3. Duplikatregel für geänderte Namen (bei Tees nur öffentlich, wie bisher).
4. `write*Version` mit den Zusatzfeldern.

Die PATCH-Routen behalten Rechteprüfung, Rate-Limit und Audit und rufen nur noch diese Funktion. Das P2002-Abfangen wandert mit.

### Zurücksetzen

1. `requireUser`, `assertCatalogRateLimit` (AK-1.3).
2. Aktuellen Stand laden (Tees: `loadCurrentTea` mit Sichtbarkeit → fremd-privat 404, AK-1.2). Nicht aktiv → 404.
3. Zielversion `to` laden; fehlt sie oder ist sie die aktuelle → 400.
4. Neuen Stand bilden:
   - Zutat: `toSnapshot(target)`.
   - Tee: `toTeaSnapshot(target)` mit `visibility = before.visibility` (AK-1.4); Zutaten über `resolveMerged` + `combineIngredients`; ist eine aufgelöste Zutat ausgeblendet → 409 `INGREDIENT_UNAVAILABLE` (AK-1.5).
5. `save*Version(…, { expectedVersion: input.version, revertedTo: to, note })`.
6. Audit `INGREDIENT_REVERTED` / `TEA_REVERTED { id, version, revertedTo, private }`.

### Melden

1. `requireUser`; Rate-Limit `report:user:<id>`, 10 pro Stunde (AK-2.5).
2. Eintrag muss aktiv und (Tee) öffentlich sein, sonst 404 (AK-2.6). Bei `duplicate`: `duplicateOfId` muss ein anderer aktiver, öffentlicher Eintrag gleicher Art sein, sonst 400.
3. `INSERT`; Verletzung von `Report_open_key` (P2002) → 409 `ALREADY_REPORTED` (AK-2.4).
4. Audit `REPORT_CREATED { reportId, entityType, entityId, reason }` – ohne Kommentar.

### Meldungen ansehen und abschließen

- **Liste:** SQL gruppiert nach `(entityType, entityId)` mit `min(createdAt)` aufsteigend (AK-3.1). Bei `status=closed` die Gruppen mit abgeschlossenen Meldungen, neueste zuerst. Die Seite enthält 25 Gruppen; deren Meldungen kommen in einer zweiten Abfrage. Namen in der Sprache der Anfrage mit Fallback; auch ausgeblendete und zusammengeführte Einträge haben Namen (aus ihrer letzten Version). `lastAuthor` = Autor der aktuellen Version.
- **Abschließen:** `UPDATE "Report" SET status, resolvedById, resolvedAt, resolutionNote WHERE entityType/entityId AND status = 'open'`. 0 Zeilen → 404. Audit `REPORT_RESOLVED { entityType, entityId, status, count }`.
- **Automatisch** (`closeReports(tx, type, id, actor)`): Zusammenführen und Ausblenden schließen die offenen Meldungen der Quelle bzw. des Eintrags als `resolved` in derselben Transaktion (AK-3.4).
- **Badge:** `count.get.ts` zählt `DISTINCT (entityType, entityId)` mit offenen Meldungen.

### Zusammenführen (`mergeIngredients`, eine Transaktion, AK-4.7)

1. Beide Zeilen in fester Reihenfolge (nach ID) `SELECT … FOR UPDATE` sperren. Beide aktiv, verschieden, sonst 400 bzw. 404.
2. Teeversionen sperren: `SELECT v.id, v."teaId", v.version FROM "TeaVersion" v JOIN "TeaVersionIngredient" vi … WHERE v."isCurrent" AND vi."ingredientId" = source ORDER BY v."teaId" FOR UPDATE OF v`.
3. Je Tee: Snapshot laden, `combineIngredients`, `saveTeaVersion(…, { expectedVersion: locked.version, authorId: moderator, mergedIngredientId: source })`. Gleichzeitige PATCH-Anfragen warten am Zeilen-Lock auf ihr `UPDATE … isCurrent = false` und bekommen nach dem Commit 409 `EDIT_CONFLICT`. Nichts wird still überschrieben.
4. `Ingredient` Quelle: `mergedIntoId = target, mergedAt = now`. Einträge, die bisher in die Quelle zusammengeführt waren, zeigen jetzt auf das Ziel (`UPDATE … SET "mergedIntoId" = target WHERE "mergedIntoId" = source`), damit Weiterleitungen nie Ketten bilden.
5. `recordCatalogEvent(merged, source, target)`, `closeReports`.
6. Nach dem Commit Audit `INGREDIENT_MERGED { sourceId, targetId, teasChanged, privateTeasChanged }`. Kein `TEA_UPDATED` je Tee (AK-8.1).

`mergeTeas` macht Schritt 1, 4 und 5; es gibt noch keine Verweise auf Tees (Vorrat kommt mit 06 und muss dort umgehängt werden). Audit `TEA_MERGED`.

**Vorschau** (`merge.get.ts`): beide Details, bei Zutaten die Anzahl öffentlicher und privater Tees (`countTeasUsing`), dazu die Sprachen, in denen die Quelle eine Übersetzung hat und das Ziel nicht (AK-4.5).

### Ausblenden und Wiederherstellen

- **Ausblenden:** Zeile `FOR UPDATE`, aktiv, sonst 404. Bei Zutaten `countTeasUsing(id)` über aktuelle Versionen aller **aktiven** Tees (ausgeblendete zählen nicht, siehe Wiederherstellen); > 0 → 409 `INGREDIENT_IN_USE { teas }` (AK-5.2). Dann `hiddenAt/ById/Reason` setzen, `recordCatalogEvent(hidden)`, `closeReports`. Audit `*_HIDDEN { id, reason }`.
- **Wettlauf mit dem Tee-Speichern:** `assertIngredientsExist` liest die Zutaten mit `FOR SHARE` und nur aktive. Ein Tee kann eine Zutat also nicht in dem Moment aufnehmen, in dem sie ausgeblendet wird.
- **Wiederherstellen:** Nur wenn `hiddenAt` gesetzt. Bei Tees müssen alle Zutaten der aktuellen Version aktiv sein, sonst 409 `INGREDIENT_UNAVAILABLE` (*Umsetzung:* so blockieren ausgeblendete Spam-Tees beim Massen-Zurücksetzen ihre Zutaten nicht, und es entsteht trotzdem nie ein sichtbarer Tee mit ausgeblendeter Zutat). Duplikatregel für alle Übersetzungen der aktuellen Version (`assertNameAvailable` bzw. `assertTeaNamesAvailable` ohne `before`) → 409 `DUPLICATE_NAME` (AK-5.5). Felder leeren, `recordCatalogEvent(restored)`, Audit `*_RESTORED`.
- Duplikatregel ignoriert inaktive Einträge (AK-5.3): Die `findFirst`-Bedingungen in `assertNameAvailable` und `assertTeaNameAvailable` bekommen `ingredient: ACTIVE` bzw. `tea: ACTIVE`.

### Sperren

- **`assertCanBlock(actor, target)`** (AK-6.5): `target.id === actor.id` → 403; `target.role === 'admin'` → 403; `target.role === 'moderator' && actor.role !== 'admin'` → 403.
- **Sperren:** `blockedAt = now, blockedUntil = blockedUntil(duration), blockReason, blockedById`; überschreibt eine bestehende Sperre (AK-6.8). Danach `destroyUserSessions(target)` (AK-6.1). Audit `USER_BLOCKED { duration, until, reason }`.
- **Entsperren:** Felder leeren, Audit `USER_UNBLOCKED`.
- **Session:** `resolveSession` beendet Sessions nur, wenn `isBlocked(user)` (bisher: jedes gesetzte `blockedAt`).
- **Login** (AK-6.2): Die Prüfung steht schon nach der Passwortprüfung. Sie nutzt `isBlocked` und gibt `details.until` mit. Falsches Passwort → wie bisher `INVALID_CREDENTIALS`.
- **Nutzerliste** (AK-6.6): Suche nur über `displayName` (ILIKE). `email` nur, wenn der Anfragende Admin ist. `changes30d` = Anzahl der Zutatenversionen plus öffentlichen Teeversionen des Nutzers in den letzten 30 Tagen (eine Aggregatabfrage für die Seite). Filter `blocked=1` = aktuell gesperrt.

### Massen-Zurücksetzen (`planBulkRevert`, `runBulkRevert`)

Vorschau und Ausführung nutzen dieselbe Planung; die Ausführung plant innerhalb jeder Teil-Transaktion neu, damit die Vorschau nicht veraltet sein kann.

1. Kandidaten: aktive Zutaten und aktive **öffentliche** Tees mit mindestens einer Version des Nutzers ab `since` (AK-7.1, AK-7.5).
2. Je Eintrag: `f` = erste Version des Nutzers ab `since`.
   - Gibt es eine Version > `f` von jemand anderem → `skip: changed_by_others` (AK-7.3).
   - `f = 1` (im Zeitraum angelegt) → `hide` (AK-7.4).
   - sonst → `revert` auf `f − 1`.
3. Ausführung je Eintrag in einer eigenen Transaktion, **erst Tees, dann Zutaten**, damit vom Nutzer angelegte Tees ihre Zutaten nicht mehr blockieren:
   - Zurücksetzen über die Logik aus „Zurücksetzen“ mit `authorId = moderator`, `bulkRevertOfId = nutzer`. `DUPLICATE_NAME` bzw. `INGREDIENT_UNAVAILABLE` → `skip`.
   - Ausblenden über `hideEntry` mit Grund „Massen-Zurücksetzung“ (in der UI übersetzt; gespeichert als fester Schlüssel `bulk_revert`). `INGREDIENT_IN_USE` → `skip: in_use`. Das gilt auch, wenn nur private Tees des Nutzers die Zutat noch enthalten, denn private Tees bleiben unberührt (AK-7.5) und eine verwendete Zutat darf nie ausgeblendet sein (AK-5.2).
4. Kein Rate-Limit (AK-7.6). Ein Audit `BULK_REVERT { userId, since, reverted, hidden, skipped }`; die einzelnen Zurücksetzungen und Ausblendungen erzeugen **keine** eigenen Audit-Einträge, die Versionen tragen `bulkRevertOfId`.

## UI

**Neue Seiten** (Admin-Pfade sind wie bisher sprachneutral, nur mit Präfix `/en`):

| Seite | Middleware | Inhalt |
|---|---|---|
| `/admin` | `moderator` | Weiterleitung: Admin → `/admin/users`, Moderator → `/admin/reports` |
| `/admin/reports` | `moderator` | Tabs **Offen / Abgeschlossen**, Filter Grund und Art (Chips). Je Gruppe eine Karte: Name mit Link, Art, Zustand (ausgeblendet/zusammengeführt), Anzahl, älteste Meldung; aufklappbar die Meldungen (Grund, Kommentar, Original-Link, Melder, Datum). Aktionen: Historie, Zusammenführen (bei Duplikat-Meldung mit vorausgewähltem Ziel), Ausblenden, „Autor sperren“ (→ `BlockDialog` für `lastAuthor`), Abschließen als erledigt / abgelehnt mit Notiz (AK-3.1–3.3) |
| `/admin/hidden` | `moderator` | Liste neueste zuerst: Name (Link zur Detailseite, die Moderatoren sehen), Art, Grund, Moderator, Datum (AK-5.4) |
| `/admin/moderation/users` | `moderator` | Suche nach Anzeigename, Schalter „nur gesperrte“. Tabelle bzw. Karten unter 600 px: Name, Rolle, (E-Mail für Admins), Status („gesperrt bis …“, „dauerhaft gesperrt“, „Sperre abgelaufen“), Grund, Änderungen 30 Tage. Aktionen: Sperren/Ändern, Entsperren, Änderungen zurücksetzen (AK-6.6) |

`AdminNav` zeigt die Tabs je nach Rolle: Meldungen (mit Badge), Ausgeblendet, Nutzer sperren – und nur für Admins zusätzlich Nutzerverwaltung und Audit-Log. `/admin/users` und `/admin/audit` behalten die Middleware `admin`.

**Nutzermenü** (AK-0.1, AK-3.5): Für `moderator` und `admin` gibt es den Eintrag „Moderation“ mit `v-badge` (Anzahl offener Meldungen, `useOpenReports`; geladen beim Öffnen des Menüs und beim Seitenwechsel im Admin-Bereich, kein Polling). Admins behalten „Verwaltung“.

**Detailseiten** (Zutat, Tee):
- Button **Melden** für angemeldete Nutzer bei aktiven, öffentlichen Einträgen → `ReportDialog`: Grund als Radiogruppe, Kommentar (Pflichtmarkierung bei „Sonstiges“), bei „Duplikat“ `EntrySearch` für das Original. Danach Snackbar „Danke, die Meldung ist eingegangen“ (AK-2.3). `ALREADY_REPORTED` erscheint als Hinweis im Dialog. Gäste sehen einen Text-Link „Zum Melden anmelden“ (AK-2.6).
- Für Moderatoren `EntryModerationMenu` (Icon-Button): **Zusammenführen…** → `MergeDialog`, **Ausblenden…** → `HideDialog`.
- **Ausgeblendet** (nur Moderatoren sehen die Seite): `HiddenBanner` mit Datum, Moderator, Grund und dem Button **Wiederherstellen**; Bearbeiten und Melden sind ausgeblendet.
- **Weiterleitung** (AK-4.2): Liefert das Detail 404 mit `mergedInto`, ruft die Seite `navigateTo(ziel + '?mergedFrom=<id>', { redirectCode: 301 })` auf. Die Zielseite zeigt dann `v-alert` „Der aufgerufene Eintrag wurde mit diesem zusammengeführt“ und einen Link zur Historie der Quelle.

**`MergeDialog`** (AK-4.1, 4.5, 4.6, 9.3):
1. Ziel per `EntrySearch` wählen; die Quelle selbst ist ausgeschlossen.
2. Vorschau: zwei Spalten (unter 600 px untereinander) mit Name, Übersetzungen und Kernfeldern. Bei Zutaten „Es werden n öffentliche und m private Tees umgestellt“. Hinweis auf fehlende Übersetzungen mit Link „Ziel erst bearbeiten“.
3. Checkbox „Mir ist klar, dass sich das nicht rückgängig machen lässt“ schaltet den Button frei.

**Historie** (`RevisionList`, aus beiden Historie-Seiten herausgelöst):
- Versionen und `events` nach Zeit gemischt. Ereignisse erscheinen als schmale Zeile ohne Radio-Buttons: „Ausgeblendet von … am …“ (Grund nur für Moderatoren), „Wiederhergestellt …“, „Zusammengeführt in …“ (Link).
- Zusätzliche Kennzeichnung je Version: Chip „Zurückgesetzt auf Version n“, „Massen-Zurücksetzung: Änderungen von <Name>“, „Zutat zusammengeführt: <Quelle> → <Ziel>“ (Tees).
- Bei jeder nicht aktuellen Version für Berechtigte (angemeldet; private Tees: Ersteller) der Button **Auf diese Version zurücksetzen** → `RevertDialog` mit optionaler Notiz. Bei `EDIT_CONFLICT` bietet der Dialog an, die Historie neu zu laden. `DUPLICATE_NAME` und `INGREDIENT_UNAVAILABLE` zeigen den verlinkten Eintrag (AK-1.1, 1.3, 1.5).
- Historie einer zusammengeführten Quelle: Die Seite lädt das Detail mit `?merged=1` und zeigt oben „Zusammengeführt in …“. Zurücksetzen ist dort nicht möglich.

**`BlockDialog`** (AK-6.1, 6.8): Dauer als Radiogruppe (24 Stunden, 7 Tage, 30 Tage, unbefristet), Grund (Pflicht), Bestätigen. Bei bestehender Sperre ist der Dialog vorbelegt und heißt „Sperre ändern“.

**`BulkRevertDialog`** (AK-7.1–7.5):
1. Zeitraum (24 Stunden, 7 Tage, 30 Tage, ab Datum) → Vorschau mit drei Listen: wird zurückgesetzt (mit Zielversion), wird ausgeblendet, wird übersprungen (mit Grund).
2. Bestätigen → Ergebnis mit Zählern. Die übersprungenen Einträge sind zur Einzelprüfung verlinkt.

**Login** (AK-6.2): `ACCOUNT_BLOCKED` zeigt „Dein Konto ist gesperrt bis <Datum, Uhrzeit>“ bzw. „… ist dauerhaft gesperrt“ (`formatDateTime`).

**Audit-Log** (AK-8.2): Die neuen Ereignisse erscheinen übersetzt mit Details: Zielversion, Quelle → Ziel, Anzahl umgestellter Tees, Dauer und Ende der Sperre, Zähler der Massen-Zurücksetzung. Private Tees werden über `details.private` wie bisher nicht verlinkt.

## Tests

| Projekt | Datei | Inhalt |
|---|---|---|
| unit | `moderation.test.ts` | `reportSchema` (Kommentar Pflicht bei `other`, Original Pflicht bei `duplicate`, 500/501 Zeichen); `blockSchema`; `blockedUntil` für alle Dauern; `isBlocked` (unbefristet, läuft noch, abgelaufen, nie gesperrt); `combineIngredients` (nur Quelle, beide mit/ohne Anteile, Position des Ziels bleibt, Reihenfolge der übrigen) |
| api | `revert.test.ts` | Zutat zurücksetzen → neue Version mit `revertedTo`, Inhalt = Zielversion inkl. Übersetzungen; Tee mit Zutaten und Anteilen; Zielversion privat → Tee bleibt öffentlich; Konflikt; keine Änderung; Duplikat; Rate-Limit gemeinsam; fremder privater Tee 404; Gast 401; Zielversion mit zusammengeführter Zutat → Zielzutat; mit ausgeblendeter → 409. Massen-Zurücksetzen: Vorschau = Ausführung; zurücksetzen auf Stand vor dem Zeitraum; übersprungen bei Fremdänderung; neu angelegte ausgeblendet; verwendete Zutat übersprungen; private Tees unberührt; kein Rate-Limit; ein Audit-Eintrag |
| api | `moderation.test.ts` | **Rechte:** jede neue Admin-Route Gast 401, Nutzer 403, Moderator ok; `/admin/users` und `/admin/audit` für Moderatoren weiter 403. **Melden:** ok → 201; Doppelmeldung 409; nach Abschluss erneut möglich; privater/ausgeblendeter Eintrag 404; Duplikat ohne/mit falschem Original 400; Rate-Limit 11. Meldung. **Meldungen:** Gruppierung, Sortierung, Filter, Abschließen, Badge-Zahl; Melder bekommen keine fremden Kommentare (kein lesender Endpunkt für Nutzer). **Zusammenführen:** Zutat mit öffentlichem und privatem Tee → neue Versionen mit Ziel, `mergedIngredientId`, Moderator als Autor; Tee mit Quelle und Ziel → Anteile addiert; Quelle 404 mit `mergedInto`, nicht in Liste/Suche/`similar`; Historie lesbar; alte Versionen unverändert; Kette A→B, B→C → A zeigt auf C; Meldungen geschlossen; Tee-Zusammenführung; nicht aktive Quelle/Ziel 400; gleichzeitiges PATCH → 409 statt Verlust. **Ausblenden:** 404 für Nutzer und Gäste, sichtbar für Moderatoren; nicht in Liste, Suche, Zutatenauswahl, „Enthalten in“; verwendete Zutat 409 mit Anzahl; Name wieder frei; Wiederherstellen; Wiederherstellen bei neuem Duplikat 409; Ereignisse in der Historie, Grund nur für Moderatoren |
| api | `block.test.ts` | Sperren → Sessions weg, Login mit richtigem Passwort 403 + `until`, mit falschem 401 wie immer; unbefristet `until: null`; nach Ablauf (Zeit per `vi.setSystemTime` bzw. `blockedUntil` in der Vergangenheit) Login ok; Entsperren; erneutes Sperren ersetzt Dauer; Rollenregeln (Moderator → Moderator 403, Admin → Moderator ok, Admin nicht sperrbar, selbst 403); Nutzerliste ohne E-Mail für Moderatoren, mit für Admins; `changes30d` |
| api | `ingredients.test.ts`, `teas.test.ts` | bleiben unverändert grün (Herauslösung von `save*Version`, `ACTIVE`-Filter) |

Browser (Playwright, wie in 03/04):
- Melden mit allen Gründen, Duplikat-Suche.
- Meldungsliste mit Abschließen.
- Zusammenführen mit Vorschau und Weiterleitung inkl. Hinweis.
- Ausblenden, Banner, Wiederherstellen.
- Historie mit Zurücksetzen und Ereignissen.
- Sperren und die Login-Meldung des Gesperrten.
- Massen-Zurücksetzen mit Vorschau.
- Badge.
- de/en, 360 px, hell/dunkel, keine CSP-Verstöße.

## Entscheidungen

- **Moderationszustand an `Ingredient`/`Tea`, nicht an der Version.** Ausblenden und Zusammenführen betreffen den Eintrag als Ganzes und erzeugen keine Version (bestätigter Vorschlag 8). Eine Bedingung `ACTIVE` an einer Stelle hält alle Abfragen konsistent.
  - Verworfen: Ausblenden als Version mit Flag – dann müsste jede „aktuelle Version“-Abfrage zusätzlich das Flag prüfen, und Zurücksetzen könnte ausgeblendete Einträge versehentlich wieder sichtbar machen.
- **Eigene Tabelle `CatalogEvent` für die Historie** statt Auslesen des Audit-Logs. Das Audit-Log ist Admins vorbehalten, enthält IPs und hat keinen Index auf Einträge. Die Historie ist öffentlich und braucht nur wer, wann, was.
- **`Report` mit `entityType` + `entityId` ohne Fremdschlüssel.** Zutaten werden nie gelöscht, öffentliche Tees auch nicht (nur private, und die lassen sich nicht melden). Zwei nullable FKs mit CHECK wären sicherer, machen aber das Gruppieren und Filtern umständlicher.
  - Verworfen: je eine Meldungstabelle für Zutaten und Tees – die Moderationsliste bräuchte dann ein `UNION` über alles.
- **Zurücksetzen als eigene Route** statt eines Felds im PATCH. Zurücksetzen hat eigene Regeln: Sichtbarkeit bleibt, zusammengeführte Zutaten werden aufgelöst, Kennzeichnung `revertedTo`. Der Client muss den alten Inhalt nicht erst laden und zurückschicken.
- **Strukturierte Kennzeichnung (`revertedTo`, `mergedIngredientId`, `bulkRevertOfId`) statt fester Notiztexte**, wie beim Veröffentlichen in 04: Die Historie zeigt sie in der Sprache des Betrachters, und die Notiz bleibt vollständig dem Nutzer (max. 200 Zeichen). Das präzisiert AK-1.1, AK-4.3 und AK-7.2.
- **Zeilensperren (`FOR UPDATE`/`FOR SHARE`) für Zusammenführen und Ausblenden** statt Serializable-Transaktionen: Es sperrt nur, was wirklich betroffen ist. Zusammen mit dem bestehenden optimistischen Sperren gewinnt nie ein Vorgang still (AK-4.7).
- **Weiterleitungen ohne Ketten:** Beim Zusammenführen werden frühere Quellen auf das neue Ziel umgebogen. `resolveMerged` braucht deshalb höchstens einen Schritt, folgt aber zur Sicherheit bis zu 5 Schritten.
- **Massen-Zurücksetzen je Eintrag in eigener Transaktion**, nicht alles oder nichts: Ein einzelner Konflikt (z.B. Duplikat) soll die übrigen Zurücksetzungen nicht verhindern. Das Ergebnis listet das Übersprungene (AK-7.3).
- **Sperrfelder am `User`** statt einer Sperr-Historie: Die Historie steht im Audit-Log (`USER_BLOCKED`/`USER_UNBLOCKED`). `blockedAt` aus 02 wird weiterverwendet und bedeutet „gesperrt seit“.
- **Moderations-Nutzerliste getrennt von `/admin/users`:** Sie hat andere Rechte (keine E-Mail, keine Rollen, keine Passwort-Resets) und andere Spalten. Ein gemeinsamer Endpunkt mit Rollenweichen wäre fehleranfälliger (bestätigter Vorschlag 3).
- **Badge ohne Polling:** Die Zahl wird beim Öffnen des Menüs und im Admin-Bereich geladen. Für ein paar Moderatoren reicht das; Live-Updates wären unverhältnismäßig.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-0.1 | `moderator`-Middleware, `UserMenu` „Moderation“, `AdminNav` je Rolle; `/admin/users`, `/admin/audit` bleiben `admin` |
| AK-0.2 | `requireRole(event, 'moderator')` in allen neuen Admin-Routen, Rechte-Tests in `moderation.test.ts` |
| AK-1.1 | `revert.post.ts`, `revertedTo`, `RevertDialog`, Chip in `RevisionList` |
| AK-1.2 | `loadCurrentTea` mit Sichtbarkeit → 404 |
| AK-1.3 | `save*Version` (Konflikt, keine Änderung, Duplikat), `assertCatalogRateLimit` |
| AK-1.4 | `visibility = before.visibility` beim Tee-Zurücksetzen |
| AK-1.5 | `resolveMerged` + `combineIngredients`, 409 `INGREDIENT_UNAVAILABLE` |
| AK-1.6 | `requireUser`; Button nur für Angemeldete |
| AK-2.1, 2.2 | `reportSchema`, `ReportDialog`, `EntrySearch` |
| AK-2.3 | Snackbar; Melden ändert den Eintrag nicht |
| AK-2.4 | `Report_open_key` → 409 `ALREADY_REPORTED` |
| AK-2.5 | Rate-Limit `report:user:<id>` 10/h |
| AK-2.6 | Prüfung aktiv + öffentlich → 404; Anmelde-Hinweis; 401 |
| AK-3.1 | `admin/reports/index.get.ts` (gruppiert, älteste zuerst, 25, Filter), `pages/admin/reports.vue` |
| AK-3.2 | Aktionen auf der Meldungskarte, `lastAuthor`, vorausgewähltes Ziel |
| AK-3.3 | `resolve.post.ts`, Tab „Abgeschlossen“ |
| AK-3.4 | `closeReports` in Zusammenführen und Ausblenden |
| AK-3.5 | `count.get.ts`, `useOpenReports`, Badge |
| AK-4.1 | `merge.get.ts` (`MergePreview`), `MergeDialog`, Prüfung gleich/inaktiv → 400 |
| AK-4.2 | `ACTIVE` in Liste/Suche/`similar`/Auswahl, 404 mit `mergedInto`, Weiterleitung + Hinweis, `?merged=1` für die Historie |
| AK-4.3 | `mergeIngredients` + `combineIngredients`, `saveTeaVersion` mit `mergedIngredientId` |
| AK-4.4 | alte Versionen unverändert, `mergedInto` im Tee-Vergleich |
| AK-4.5 | `missingTranslations` in der Vorschau, Hinweis im Dialog |
| AK-4.6 | keine Rückgängig-Route, Checkbox im Dialog |
| AK-4.7 | eine Transaktion, `FOR UPDATE` auf Zutaten und Teeversionen, optimistisches Sperren |
| AK-5.1 | `hide.post.ts`, `ACTIVE` in allen Abfragen inkl. „Enthalten in“ |
| AK-5.2 | `countTeasUsing` → 409 `INGREDIENT_IN_USE`, `FOR SHARE` in `assertIngredientsExist` |
| AK-5.3 | `ACTIVE` in `assertNameAvailable`/`assertTeaNameAvailable` |
| AK-5.4 | `admin/hidden.get.ts`, `pages/admin/hidden.vue`, Detail/Historie für Moderatoren mit `moderation` |
| AK-5.5 | `restore.post.ts` mit Duplikatregel, `HiddenBanner` |
| AK-5.6 | `CatalogEvent`, `events` in `revisions`, `RevisionList` (Grund nur für Moderatoren) |
| AK-5.7 | `teas/[id]/index.delete.ts` unverändert |
| AK-6.1 | `block.post.ts`, `destroyUserSessions`, `BlockDialog` |
| AK-6.2 | `login.post.ts` mit `isBlocked` und `until`, Login-Seite |
| AK-6.3 | `isBlocked` wertet `blockedUntil` aus (in `resolveSession` und Login) |
| AK-6.4 | `block.delete.ts` |
| AK-6.5 | `assertCanBlock` |
| AK-6.6 | `admin/moderation/users.get.ts` (`email` nur für Admins, `changes30d`, Filter), Seite |
| AK-6.7 | Sperren ändert keine Inhalte |
| AK-6.8 | Sperren überschreibt bestehende Sperre |
| AK-7.1 | `bulk-revert.get.ts` (`planBulkRevert`), `BulkRevertDialog` |
| AK-7.2 | `runBulkRevert` → Zurücksetzen mit `bulkRevertOfId` |
| AK-7.3 | `skip: changed_by_others` |
| AK-7.4 | `hide` für `f = 1`, Zutaten in Gebrauch → `skip: in_use` (Tees zuerst) |
| AK-7.5 | Kandidaten nur öffentlich; Ergebnis mit Zählern |
| AK-7.6 | kein `assertCatalogRateLimit` in `runBulkRevert` |
| AK-8.1 | `audit()` mit 13 neuen Ereignissen, Details wie beschrieben, kein `TEA_UPDATED` je umgehängtem Tee |
| AK-8.2 | `AUDIT_EVENTS`, `admin/audit.vue`, `details.private` |
| AK-9.1 | `shared/schemas/moderation.ts`, `useFormErrors` |
| AK-9.2 | Ausgabe nur per `{{ }}`; Kommentare nur über Moderator-Routen |
| AK-9.3 | Bestätigungen in `MergeDialog`, `HideDialog`, `BlockDialog`, `BulkRevertDialog` |
| AK-9.4 | Sprachdateien, Browserprüfung 360 px hell/dunkel, CSP |
| AK-9.5 | `moderation.test.ts` (unit, api), `revert.test.ts`, `block.test.ts` |

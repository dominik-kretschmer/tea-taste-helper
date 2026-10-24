import { Prisma } from '../generated/prisma/client'
import { PANTRY_GRAMS_MAX, PANTRY_MAX_ENTRIES, PANTRY_PAGE_SIZE } from '#shared/utils/pantry'

// Vorrat (06): Jede Abfrage ist auf den Besitzer `userId` beschränkt (AK-0.1).

export const pantryNotFound = (details?: unknown) => new AppError(404, 'NOT_FOUND', 'Pantry entry not found', details)

/** Verweis-Spalte je Art */
const COLUMN = { ingredient: 'ingredientId', tea: 'teaId' } as const satisfies Record<CatalogTypeValue, string>

type PantryRow = Omit<PantryEntry, 'empty'>

/** Abfrage einer Art mit Name (aktuelle Sprache, sonst Original) und Zustand; `where` filtert zusätzlich. */
function selectEntries(type: CatalogTypeValue, locale: ContentLocale, where: Prisma.Sql) {
  return type === 'ingredient'
    ? Prisma.sql`
        SELECT p.id, 'ingredient' AS "entityType", i.id AS "entityId", COALESCE(own.name, src.name) AS name,
               NULL::text AS brand, p.grams, NOT (${activeSql('i')}) AS hidden
        FROM "PantryItem" p
        JOIN "Ingredient" i ON i.id = p."ingredientId"
        JOIN "IngredientVersion" v ON v."ingredientId" = i.id AND v."isCurrent"
        ${ingredientDisplayJoins(locale)}
        WHERE ${where}`
    : Prisma.sql`
        SELECT p.id, 'tea' AS "entityType", t.id AS "entityId", COALESCE(own.name, src.name) AS name,
               v.brand, p.grams, NOT (${activeSql('t')}) AS hidden
        FROM "PantryItem" p
        JOIN "Tea" t ON t.id = p."teaId"
        JOIN "TeaVersion" v ON v."teaId" = t.id AND v."isCurrent"
        ${teaDisplayJoins(locale)}
        WHERE ${where}`
}

const toEntry = (row: PantryRow): PantryEntry => ({ ...row, empty: row.grams === 0 })

/** Suche über die Namen aller Sprachen der aktuellen Version, bei Tees auch über die Marke (AK-1.4) */
function searchSql(type: CatalogTypeValue, q: string | undefined) {
  if (!q) return Prisma.empty
  const pattern = `%${escapeLike(q)}%`
  return type === 'ingredient'
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "IngredientVersionTranslation" x WHERE x."versionId" = v.id AND x.name ILIKE ${pattern})`
    : Prisma.sql`AND (v.brand ILIKE ${pattern} OR EXISTS (
        SELECT 1 FROM "TeaVersionTranslation" x WHERE x."versionId" = v.id AND x.name ILIKE ${pattern}))`
}

/** Anzahl der Einträge je Art (AK-1.1) */
export async function countPantry(db: Db, userId: string): Promise<Record<CatalogTypeValue, number>> {
  const [row] = await db.$queryRaw<Record<CatalogTypeValue, number>[]>`
    SELECT count("ingredientId")::int AS ingredient, count("teaId")::int AS tea
    FROM "PantryItem" WHERE "userId" = ${userId}::uuid`
  return row ?? { ingredient: 0, tea: 0 }
}

/** Eine Seite einer Art: normale, dann aufgebrauchte, dann ausgeblendete Einträge, je alphabetisch (AK-1.1–1.4) */
export async function listPantry(db: Db, userId: string, query: { type: CatalogTypeValue, q?: string, page: number, locale: ContentLocale }): Promise<PantryPage> {
  const where = Prisma.sql`p."userId" = ${userId}::uuid ${searchSql(query.type, query.q)}`
  const brandOrder = query.type === 'tea' ? Prisma.sql`, lower(COALESCE(brand, '')) COLLATE "de-x-icu"` : Prisma.empty
  const [rows, [{ total } = { total: 0 }], counts] = await Promise.all([
    db.$queryRaw<PantryRow[]>`
      SELECT * FROM (${selectEntries(query.type, query.locale, where)}) e
      ORDER BY hidden, COALESCE(grams = 0, false), lower(name) COLLATE "de-x-icu" ${brandOrder}, id
      LIMIT ${PANTRY_PAGE_SIZE} OFFSET ${(query.page - 1) * PANTRY_PAGE_SIZE}`,
    db.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM (${selectEntries(query.type, query.locale, where)}) e`,
    countPantry(db, userId),
  ])
  return { items: rows.map(toEntry), total, page: query.page, pageSize: PANTRY_PAGE_SIZE, counts }
}

const pantrySelect = { id: true, ingredientId: true, teaId: true, grams: true } as const

function toRef(row: { id: string, ingredientId: string | null, teaId: string | null, grams: number | null }): PantryRef {
  return row.ingredientId
    ? { id: row.id, entityType: 'ingredient', entityId: row.ingredientId, grams: row.grams }
    : { id: row.id, entityType: 'tea', entityId: row.teaId!, grams: row.grams }
}

/** Eintrag des Nutzers zu einer Zutat bzw. einem Tee (AK-2.2) */
export async function findPantryEntry(db: Db, userId: string, type: CatalogTypeValue, entityId: string): Promise<PantryRef | null> {
  const row = await db.pantryItem.findFirst({ where: { userId, [COLUMN[type]]: entityId }, select: pantrySelect })
  return row && toRef(row)
}

/**
 * Hält Zutat bzw. Tee bis zum Ende der Transaktion fest (`FOR SHARE`, wartet auf laufendes Zusammenführen)
 * und prüft: aktiv, Tee öffentlich oder eigen; sonst 404, zusammengeführt mit `mergedInto` (AK-2.4).
 */
async function assertAddable(db: Db, userId: string, type: CatalogTypeValue, entityId: string): Promise<void> {
  const [row] = type === 'ingredient'
    ? await db.$queryRaw<{ hiddenAt: Date | null, mergedIntoId: string | null, visible: boolean }[]>`
        SELECT "hiddenAt", "mergedIntoId", true AS visible FROM "Ingredient" WHERE id = ${entityId}::uuid FOR SHARE`
    : await db.$queryRaw<{ hiddenAt: Date | null, mergedIntoId: string | null, visible: boolean }[]>`
        SELECT t."hiddenAt", t."mergedIntoId", (v.visibility = 'public' OR t."ownerId" = ${userId}::uuid) AS visible
        FROM "Tea" t JOIN "TeaVersion" v ON v."teaId" = t.id AND v."isCurrent"
        WHERE t.id = ${entityId}::uuid FOR SHARE OF t`
  if (!row?.visible || row.hiddenAt) throw pantryNotFound()
  if (row.mergedIntoId) throw pantryNotFound({ mergedInto: row.mergedIntoId })
}

/** Neuer Eintrag (AK-2.1, AK-2.3–2.6); in der Transaktion des Aufrufers. */
export async function createPantryEntry(db: Db, userId: string, input: { entityType: CatalogTypeValue, entityId: string, grams: number | null }): Promise<PantryRef> {
  // Hinzufügungen desselben Nutzers nacheinander, damit Eindeutigkeit und Obergrenze exakt bleiben
  await lockName(db, `pantry:${userId}`)
  await assertAddable(db, userId, input.entityType, input.entityId)
  const existing = await findPantryEntry(db, userId, input.entityType, input.entityId)
  if (existing) throw new AppError(409, 'ALREADY_IN_PANTRY', 'Already in pantry', { entryId: existing.id, grams: existing.grams })
  if (await db.pantryItem.count({ where: { userId } }) >= PANTRY_MAX_ENTRIES) {
    throw new AppError(400, 'PANTRY_FULL', 'Pantry is full', { max: PANTRY_MAX_ENTRIES })
  }
  const row = await db.pantryItem.create({
    data: { userId, [COLUMN[input.entityType]]: input.entityId, grams: input.grams },
    select: pantrySelect,
  })
  return toRef(row)
}

/** Menge ändern (AK-3.1); ausgeblendete Einträge nur entfernen (AK-1.3). */
export async function updatePantryEntry(db: Db, userId: string, id: string, grams: number | null): Promise<PantryRef> {
  const row = await db.pantryItem.findFirst({
    where: { id, userId },
    select: { ...pantrySelect, ingredient: { select: { hiddenAt: true } }, tea: { select: { hiddenAt: true } } },
  })
  if (!row) throw pantryNotFound()
  if ((row.ingredient ?? row.tea)?.hiddenAt) throw new AppError(409, 'ENTRY_UNAVAILABLE', 'Entry is hidden')
  return toRef(await db.pantryItem.update({ where: { id }, data: { grams }, select: pantrySelect }))
}

/** Eintrag entfernen (AK-4.1); fremde und unbekannte IDs → 404. */
export async function deletePantryEntry(db: Db, userId: string, id: string): Promise<void> {
  const { count } = await db.pantryItem.deleteMany({ where: { id, userId } })
  if (!count) throw pantryNotFound()
}

/**
 * Hängt Vorratseinträge der Quelle auf das Ziel um (AK-5.1), in der Transaktion des Zusammenführens.
 * Hat ein Nutzer beide, bleibt das Ziel: Mengen addiert (gedeckelt), sonst die angegebene (wie 05 AK-4.3).
 */
export async function mergePantry(db: Db, type: CatalogTypeValue, sourceId: string, targetId: string): Promise<void> {
  const col = Prisma.raw(`"${COLUMN[type]}"`)
  await db.$executeRaw`
    UPDATE "PantryItem" t SET grams = CASE
        WHEN t.grams IS NULL THEN s.grams
        WHEN s.grams IS NULL THEN t.grams
        ELSE LEAST(t.grams + s.grams, ${PANTRY_GRAMS_MAX}) END
    FROM "PantryItem" s
    WHERE s.${col} = ${sourceId}::uuid AND t.${col} = ${targetId}::uuid AND s."userId" = t."userId"`
  await db.$executeRaw`
    DELETE FROM "PantryItem" s WHERE s.${col} = ${sourceId}::uuid
      AND EXISTS (SELECT 1 FROM "PantryItem" t WHERE t.${col} = ${targetId}::uuid AND t."userId" = s."userId")`
  await db.$executeRaw`UPDATE "PantryItem" SET ${col} = ${targetId}::uuid WHERE ${col} = ${sourceId}::uuid`
}

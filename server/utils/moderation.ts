import type { H3Event } from 'h3'
import { Prisma } from '../generated/prisma/client'

// Bausteine der Moderation (05): Einträge beider Arten benennen, Meldungen schließen.

export const MODERATION_PAGE_SIZE = 25
const REPORTS_PER_HOUR = 10
const HOUR = 60 * 60 * 1000

export const entryKey = (entityType: CatalogTypeValue, entityId: string) => `${entityType}:${entityId}`

export interface EntryInfo {
  name: string
  state: EntryState
  /** Autor der aktuellen Version */
  lastAuthor: { id: string, displayName: string } | null
}

/**
 * Name (aktuelle Sprache, sonst Originalsprache), Zustand und letzter Autor für Einträge beider Arten –
 * auch ausgeblendete und zusammengeführte (Moderationslisten, AK-3.1, AK-5.4).
 */
export async function loadEntryInfos(db: Db, entries: { entityType: CatalogTypeValue, entityId: string }[], locale: ContentLocale): Promise<Map<string, EntryInfo>> {
  const ids = (type: CatalogTypeValue) => [...new Set(entries.filter(entry => entry.entityType === type).map(entry => entry.entityId))]
  const versionSelect = { where: { isCurrent: true }, include: { translations: true, author: { select: { id: true, displayName: true } } } } as const
  const [ingredients, teas] = await Promise.all([
    db.ingredient.findMany({ where: { id: { in: ids('ingredient') } }, include: { versions: versionSelect } }),
    db.tea.findMany({ where: { id: { in: ids('tea') } }, include: { versions: versionSelect } }),
  ])
  const result = new Map<string, EntryInfo>()
  const add = (entityType: CatalogTypeValue, row: (typeof ingredients)[number] | (typeof teas)[number]) => {
    const version = row.versions[0]
    if (!version) return
    const translations: CatalogTranslations = {}
    for (const text of version.translations) translations[text.locale as ContentLocale] = { name: text.name, description: text.description }
    const state: EntryState = row.mergedIntoId ? 'merged' : row.hiddenAt ? 'hidden' : 'active'
    result.set(entryKey(entityType, row.id), {
      name: pickTranslation({ sourceLocale: row.sourceLocale as ContentLocale, translations }, locale).text.name,
      state,
      lastAuthor: version.author,
    })
  }
  for (const row of ingredients) add('ingredient', row)
  for (const row of teas) add('tea', row)
  return result
}

/**
 * Meldbar bzw. als Duplikat-Original wählbar: aktive Zutat oder aktiver öffentlicher Tee (AK-2.6).
 * Private Tees gelten für alle als nicht vorhanden – auch für ihren Ersteller, weil Meldungen Moderatoren
 * erreichen, die private Tees nie sehen.
 */
export async function isReportable(db: Db, entityType: CatalogTypeValue, entityId: string): Promise<boolean> {
  return entityType === 'ingredient'
    ? !!(await loadCurrent(db, entityId))
    : !!(await loadCurrentTea(db, entityId, null))
}

/** Höchstens 10 Meldungen pro Stunde und Nutzer (AK-2.5). */
export function assertReportRateLimit(event: H3Event, user: PublicUser): void {
  assertRateLimit(event, consume(`report:user:${user.id}`, REPORTS_PER_HOUR, HOUR))
}

/** Schließt die offenen Meldungen eines Eintrags; liefert die Anzahl (AK-3.3, AK-3.4). */
export async function closeReports(db: Db, input: {
  entityType: CatalogTypeValue
  entityId: string
  actorId: string
  status: 'resolved' | 'rejected'
  note?: string | null
}): Promise<number> {
  const { count } = await db.report.updateMany({
    where: { entityType: input.entityType, entityId: input.entityId, status: 'open' },
    data: { status: input.status, resolvedById: input.actorId, resolvedAt: new Date(), resolutionNote: input.note ?? null },
  })
  return count
}

export interface ReportListQuery {
  status: 'open' | 'closed'
  reason?: ReportReasonValue
  type?: CatalogTypeValue
  locale: ContentLocale
  page: number
}

/**
 * Meldungen nach Eintrag gruppiert (AK-3.1): offene älteste zuerst, abgeschlossene zuletzt
 * abgeschlossene zuerst; 25 Gruppen pro Seite.
 */
export async function listReportGroups(db: Db, query: ReportListQuery): Promise<Page<ReportGroup>> {
  const statusSql = query.status === 'open' ? Prisma.sql`r.status = 'open'` : Prisma.sql`r.status <> 'open'`
  const reasonSql = query.reason ? Prisma.sql`AND r.reason = ${query.reason}::"ReportReason"` : Prisma.empty
  const typeSql = query.type ? Prisma.sql`AND r."entityType" = ${query.type}::"CatalogType"` : Prisma.empty
  const where = Prisma.sql`${statusSql} ${reasonSql} ${typeSql}`
  const order = query.status === 'open' ? Prisma.sql`"oldestAt" ASC` : Prisma.sql`"latestAt" DESC`

  const [groups, [{ total } = { total: 0 }]] = await Promise.all([
    db.$queryRaw<{ entityType: CatalogTypeValue, entityId: string, count: number, oldestAt: Date }[]>`
      SELECT r."entityType"::text AS "entityType", r."entityId", count(*)::int AS count,
             min(r."createdAt") AS "oldestAt", max(COALESCE(r."resolvedAt", r."createdAt")) AS "latestAt"
      FROM "Report" r
      WHERE ${where}
      GROUP BY r."entityType", r."entityId"
      ORDER BY ${order}, r."entityId"
      LIMIT ${MODERATION_PAGE_SIZE} OFFSET ${(query.page - 1) * MODERATION_PAGE_SIZE}`,
    db.$queryRaw<{ total: number }[]>`
      SELECT count(DISTINCT (r."entityType", r."entityId"))::int AS total FROM "Report" r WHERE ${where}`,
  ])
  if (!groups.length) return { items: [], total, page: query.page, pageSize: MODERATION_PAGE_SIZE }

  const reports = await db.report.findMany({
    where: {
      OR: groups.map(group => ({ entityType: group.entityType, entityId: group.entityId })),
      ...(query.status === 'open' ? { status: 'open' as const } : { status: { not: 'open' as const } }),
      ...(query.reason ? { reason: query.reason } : {}),
    },
    include: { reporter: { select: { displayName: true } }, resolvedBy: { select: { displayName: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const infos = await loadEntryInfos(db, [
    ...groups,
    ...reports.flatMap(report => (report.duplicateOfId ? [{ entityType: report.entityType, entityId: report.duplicateOfId }] : [])),
  ], query.locale)

  const items = groups.map((group): ReportGroup => {
    const key = entryKey(group.entityType, group.entityId)
    const info = infos.get(key)
    return {
      entityType: group.entityType,
      entityId: group.entityId,
      name: info?.name ?? '',
      state: info?.state ?? 'active',
      lastAuthor: info?.lastAuthor ?? null,
      count: group.count,
      oldestAt: group.oldestAt.toISOString(),
      reports: reports
        .filter(report => entryKey(report.entityType, report.entityId) === key)
        .map(report => ({
          id: report.id,
          reason: report.reason,
          comment: report.comment,
          createdAt: report.createdAt.toISOString(),
          reporter: report.reporter,
          duplicateOf: report.duplicateOfId
            ? { id: report.duplicateOfId, name: infos.get(entryKey(report.entityType, report.duplicateOfId))?.name ?? '' }
            : null,
          status: report.status,
          resolvedBy: report.resolvedBy,
          resolvedAt: report.resolvedAt?.toISOString() ?? null,
          resolutionNote: report.resolutionNote,
        })),
    }
  })
  return { items, total, page: query.page, pageSize: MODERATION_PAGE_SIZE }
}

/** Teeversionen (aktuelle, nicht zusammengeführte Tees), die diese Zutat enthalten (AK-4.1, AK-5.2). */
export async function countTeasUsing(db: Db, ingredientId: string): Promise<{ public: number, private: number }> {
  const [row] = await db.$queryRaw<{ public: number, private: number }[]>`
    SELECT count(*) FILTER (WHERE v.visibility = 'public')::int AS public,
           count(*) FILTER (WHERE v.visibility = 'private')::int AS private
    FROM "TeaVersionIngredient" vi
    JOIN "TeaVersion" v ON v.id = vi."versionId" AND v."isCurrent"
    JOIN "Tea" t ON t.id = v."teaId" AND t."mergedIntoId" IS NULL
    WHERE vi."ingredientId" = ${ingredientId}::uuid`
  return row ?? { public: 0, private: 0 }
}

/**
 * Sperrt die Zeile eines Eintrags bis zum Ende der Transaktion (`FOR UPDATE`) und liefert seinen
 * Zustand – oder null, wenn es ihn nicht gibt bzw. ein Tee privat ist (Moderatoren sehen keine
 * privaten Tees).
 */
export async function lockEntry(db: Db, entityType: CatalogTypeValue, id: string) {
  const rows = entityType === 'ingredient'
    ? await db.$queryRaw<{ id: string, hiddenAt: Date | null, mergedIntoId: string | null }[]>`
        SELECT id, "hiddenAt", "mergedIntoId" FROM "Ingredient" WHERE id = ${id}::uuid FOR UPDATE`
    : await db.$queryRaw<{ id: string, hiddenAt: Date | null, mergedIntoId: string | null }[]>`
        SELECT t.id, t."hiddenAt", t."mergedIntoId" FROM "Tea" t
        JOIN "TeaVersion" v ON v."teaId" = t.id AND v."isCurrent" AND v.visibility = 'public'
        WHERE t.id = ${id}::uuid FOR UPDATE OF t`
  return rows[0] ?? null
}

const entryNotFound = () => new AppError(404, 'NOT_FOUND', 'Entry not found')

/**
 * Blendet einen aktiven Eintrag aus (AK-5.1). Zutaten nur, wenn kein Tee sie mehr enthält
 * (409 INGREDIENT_IN_USE, AK-5.2). Offene Meldungen gelten damit als erledigt (AK-3.4).
 */
export async function hideEntry(db: Db, input: { entityType: CatalogTypeValue, id: string, actorId: string, reason: string }): Promise<void> {
  const row = await lockEntry(db, input.entityType, input.id)
  if (!row || !isEntryActive(row)) throw entryNotFound()
  if (input.entityType === 'ingredient') {
    const teas = await countTeasUsing(db, input.id)
    if (teas.public + teas.private > 0) {
      throw new AppError(409, 'INGREDIENT_IN_USE', 'The ingredient is still used in teas', { teas: teas.public + teas.private })
    }
  }
  const data = { hiddenAt: new Date(), hiddenById: input.actorId, hiddenReason: input.reason }
  if (input.entityType === 'ingredient') await db.ingredient.update({ where: { id: input.id }, data })
  else await db.tea.update({ where: { id: input.id }, data })
  await recordCatalogEvent(db, { entityType: input.entityType, entityId: input.id, kind: 'hidden', actorId: input.actorId, reason: input.reason })
  await closeReports(db, { entityType: input.entityType, entityId: input.id, actorId: input.actorId, status: 'resolved' })
}

/** Macht einen ausgeblendeten Eintrag unverändert wieder sichtbar; Duplikatregel wie beim Anlegen (AK-5.5). */
export async function restoreEntry(db: Db, input: { entityType: CatalogTypeValue, id: string, actorId: string }): Promise<void> {
  const row = await lockEntry(db, input.entityType, input.id)
  if (!row?.hiddenAt) throw entryNotFound()
  const data = { hiddenAt: null, hiddenById: null, hiddenReason: null }

  if (input.entityType === 'ingredient') {
    const current = await loadCurrent(db, input.id, { includeInactive: true })
    for (const locale of CONTENT_LOCALES) {
      const name = current?.version.translations.find(text => text.locale === locale)?.name
      if (name) await assertNameAvailable(db, locale, normalizeName(name), input.id)
    }
    await db.ingredient.update({ where: { id: input.id }, data })
  }
  else {
    const current = await loadCurrentTea(db, input.id, null, { includeInactive: true })
    if (current) await assertTeaNamesAvailable(db, toTeaSnapshot(current.tea, current.version), { teaId: input.id })
    await db.tea.update({ where: { id: input.id }, data })
  }
  await recordCatalogEvent(db, { entityType: input.entityType, entityId: input.id, kind: 'restored', actorId: input.actorId })
}

/** Ausgeblendete Einträge beider Arten, zuletzt ausgeblendete zuerst (AK-5.4). */
export async function listHiddenEntries(db: Db, query: { type?: CatalogTypeValue, locale: ContentLocale, page: number }): Promise<Page<HiddenEntry>> {
  const ingredients = Prisma.sql`SELECT 'ingredient' AS "entityType", id AS "entityId", "hiddenAt", "hiddenById", "hiddenReason" FROM "Ingredient" WHERE "hiddenAt" IS NOT NULL`
  const teas = Prisma.sql`SELECT 'tea' AS "entityType", id AS "entityId", "hiddenAt", "hiddenById", "hiddenReason" FROM "Tea" WHERE "hiddenAt" IS NOT NULL`
  const source = query.type === 'ingredient' ? ingredients : query.type === 'tea' ? teas : Prisma.sql`${ingredients} UNION ALL ${teas}`

  type Row = { entityType: CatalogTypeValue, entityId: string, hiddenAt: Date, hiddenById: string | null, hiddenReason: string | null }
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db.$queryRaw<Row[]>`
      SELECT * FROM (${source}) h ORDER BY "hiddenAt" DESC, "entityId"
      LIMIT ${MODERATION_PAGE_SIZE} OFFSET ${(query.page - 1) * MODERATION_PAGE_SIZE}`,
    db.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM (${source}) h`,
  ])
  const [infos, moderators] = await Promise.all([
    loadEntryInfos(db, rows, query.locale),
    db.user.findMany({ where: { id: { in: rows.flatMap(row => (row.hiddenById ? [row.hiddenById] : [])) } }, select: { id: true, displayName: true } }),
  ])
  const names = new Map(moderators.map(user => [user.id, user.displayName]))
  return {
    items: rows.map(row => ({
      entityType: row.entityType,
      entityId: row.entityId,
      name: infos.get(entryKey(row.entityType, row.entityId))?.name ?? '',
      hiddenAt: row.hiddenAt.toISOString(),
      hiddenBy: row.hiddenById && names.has(row.hiddenById) ? { displayName: names.get(row.hiddenById)! } : null,
      hiddenReason: row.hiddenReason ?? '',
    })),
    total,
    page: query.page,
    pageSize: MODERATION_PAGE_SIZE,
  }
}

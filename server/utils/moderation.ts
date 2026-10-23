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

/**
 * Aktive Tees, deren aktuelle Version diese Zutat enthält (AK-4.1, AK-5.2). Ausgeblendete Tees zählen
 * nicht: Sie lassen sich nur wiederherstellen, solange alle ihre Zutaten aktiv sind (`restoreEntry`).
 */
export async function countTeasUsing(db: Db, ingredientId: string): Promise<{ public: number, private: number }> {
  const [row] = await db.$queryRaw<{ public: number, private: number }[]>`
    SELECT count(*) FILTER (WHERE v.visibility = 'public')::int AS public,
           count(*) FILTER (WHERE v.visibility = 'private')::int AS private
    FROM "TeaVersionIngredient" vi
    JOIN "TeaVersion" v ON v.id = vi."versionId" AND v."isCurrent"
    JOIN "Tea" t ON t.id = v."teaId" AND ${activeSql('t')}
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
    if (current) {
      const snapshot = toTeaSnapshot(current.tea, current.version)
      // Nie ein sichtbarer Tee mit ausgeblendeter oder zusammengeführter Zutat (AK-5.1, AK-5.2)
      const resolved = await resolveMerged(db, snapshot.ingredients.map(item => item.ingredientId))
      const unavailable = [...resolved].find(([original, entry]) => entry.hidden || entry.id !== original)
      if (unavailable) {
        throw new AppError(409, 'INGREDIENT_UNAVAILABLE', 'The tea contains an ingredient that is no longer available', { ingredientId: unavailable[0] })
      }
      await assertTeaNamesAvailable(db, snapshot, { teaId: input.id })
    }
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

const invalidMerge = (message: string) => new AppError(400, 'INVALID_MERGE', message)

/** Beide Einträge sperren (feste Reihenfolge nach ID) und prüfen: vorhanden, verschieden, aktiv (AK-4.1). */
async function lockMergePair(db: Db, entityType: CatalogTypeValue, sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) throw invalidMerge('Source and target must differ')
  const rows = new Map<string, Awaited<ReturnType<typeof lockEntry>>>()
  for (const id of [sourceId, targetId].sort()) rows.set(id, await lockEntry(db, entityType, id))
  if (!rows.get(sourceId)) throw entryNotFound()
  if (!rows.get(targetId)) throw invalidMerge('Target not found')
  if (![...rows.values()].every(row => row && isEntryActive(row))) throw invalidMerge('Hidden or merged entries cannot be merged')
}

/** Frühere Quellen zeigen auf das neue Ziel, damit Weiterleitungen keine Ketten bilden. */
async function markMerged(db: Db, entityType: CatalogTypeValue, sourceId: string, targetId: string, actorId: string): Promise<void> {
  const mergedAt = new Date()
  if (entityType === 'ingredient') {
    await db.ingredient.update({ where: { id: sourceId }, data: { mergedIntoId: targetId, mergedAt } })
    await db.ingredient.updateMany({ where: { mergedIntoId: sourceId }, data: { mergedIntoId: targetId } })
  }
  else {
    await db.tea.update({ where: { id: sourceId }, data: { mergedIntoId: targetId, mergedAt } })
    await db.tea.updateMany({ where: { mergedIntoId: sourceId }, data: { mergedIntoId: targetId } })
  }
  await recordCatalogEvent(db, { entityType, entityId: sourceId, kind: 'merged', actorId, targetId })
  await closeReports(db, { entityType, entityId: sourceId, actorId, status: 'resolved' })
}

/**
 * Führt die Zutat `sourceId` in `targetId` zusammen (AK-4.2–4.7), in der Transaktion des Aufrufers:
 * Jeder Tee, dessen aktuelle Version die Quelle enthält, bekommt eine neue Version mit dem Ziel.
 * Die Abfrage läuft wiederholt, bis kein Tee mehr übrig ist: Ein gleichzeitiges Speichern, das vor
 * dem Sperren committet wurde, liefert eine neue Version, die erst die nächste Abfrage sieht.
 */
export async function mergeIngredients(db: Db, input: { sourceId: string, targetId: string, actorId: string }): Promise<{ teasChanged: number, privateTeasChanged: number }> {
  const { sourceId, targetId } = input
  await lockMergePair(db, 'ingredient', sourceId, targetId)

  let teasChanged = 0
  let privateTeasChanged = 0
  for (let round = 0; round < 10; round++) {
    const versions = await db.$queryRaw<{ teaId: string, version: number }[]>`
      SELECT v."teaId", v.version FROM "TeaVersion" v
      JOIN "TeaVersionIngredient" vi ON vi."versionId" = v.id AND vi."ingredientId" = ${sourceId}::uuid
      WHERE v."isCurrent"
      ORDER BY v."teaId"
      FOR UPDATE OF v`
    if (!versions.length) break
    for (const locked of versions) {
      const tea = await db.tea.findUniqueOrThrow({ where: { id: locked.teaId } })
      const version = await loadTeaVersion(db, locked.teaId, locked.version)
      if (!version) continue
      const before = toTeaSnapshot(tea, version)
      const after = { ...before, ingredients: combineIngredients(before.ingredients, sourceId, targetId) }
      await saveTeaVersion(db, {
        teaId: tea.id,
        expectedVersion: locked.version,
        before,
        after,
        authorId: input.actorId,
        note: null,
        mergedIngredientId: sourceId,
      })
      teasChanged++
      if (before.visibility === 'private') privateTeasChanged++
    }
  }

  await markMerged(db, 'ingredient', sourceId, targetId, input.actorId)
  return { teasChanged, privateTeasChanged }
}

/** Führt den öffentlichen Tee `sourceId` in `targetId` zusammen (AK-4.2); Verweise auf Tees gibt es noch nicht. */
export async function mergeTeas(db: Db, input: { sourceId: string, targetId: string, actorId: string }): Promise<void> {
  await lockMergePair(db, 'tea', input.sourceId, input.targetId)
  await markMerged(db, 'tea', input.sourceId, input.targetId, input.actorId)
}

/** Vorschau: beide Einträge, betroffene Tees, fehlende Übersetzungen im Ziel (AK-4.1, AK-4.5). */
export async function previewMerge(db: Db, entityType: CatalogTypeValue, sourceId: string, targetId: string, viewer: PublicUser): Promise<MergePreview> {
  if (sourceId === targetId) throw invalidMerge('Source and target must differ')
  const load = async (id: string) => {
    if (entityType === 'ingredient') {
      const current = await loadCurrent(db, id)
      return current ? toDetail(id, current.ingredient.sourceLocale, current.version) : null
    }
    const current = await loadCurrentTea(db, id, null)
    return current ? toTeaDetail(db, current.tea, current.version, viewer) : null
  }
  const [source, target] = await Promise.all([load(sourceId), load(targetId)])
  if (!source) throw entryNotFound()
  if (!target) throw invalidMerge('Target not found or not active')
  const missingTranslations = CONTENT_LOCALES.filter(locale => source.translations[locale] && !target.translations[locale])
  return {
    source,
    target,
    missingTranslations,
    ...(entityType === 'ingredient' ? { teas: await countTeasUsing(db, sourceId) } : {}),
  }
}

// --- Massen-Zurücksetzen (AK-7.1–7.6) ---

type BulkDecision =
  | { action: 'revert', toVersion: number }
  | { action: 'hide' }
  | { action: 'skip', reason: BulkSkipReason }

/**
 * Was mit einem Eintrag passiert: `f` ist die erste Version des Nutzers ab `since`. Hat danach jemand
 * anderes geändert → überspringen (AK-7.3); hat der Nutzer ihn angelegt (f = 1) → ausblenden (AK-7.4);
 * sonst zurück auf f − 1 (AK-7.2). `null`, wenn der Nutzer im Zeitraum nichts daran geändert hat.
 */
export function decideBulkEntry(versions: { version: number, authorId: string | null, createdAt: Date }[], userId: string, since: Date): BulkDecision | null {
  const sorted = [...versions].sort((a, b) => a.version - b.version)
  const first = sorted.find(v => v.authorId === userId && v.createdAt >= since)
  if (!first) return null
  if (sorted.some(v => v.version > first.version && v.authorId !== userId)) return { action: 'skip', reason: 'changed_by_others' }
  return first.version === 1 ? { action: 'hide' } : { action: 'revert', toVersion: first.version - 1 }
}

const versionFields = { version: true, authorId: true, createdAt: true } as const

/** Aktive Zutaten und aktive öffentliche Tees, die der Nutzer seit `since` geändert hat (AK-7.1, AK-7.5). */
async function bulkCandidates(db: Db, userId: string, since: Date) {
  const changed = { authorId: userId, createdAt: { gte: since } }
  const [ingredients, teas] = await Promise.all([
    db.ingredient.findMany({
      where: { ...ENTRY_ACTIVE, versions: { some: changed } },
      select: { id: true, versions: { select: versionFields } },
    }),
    db.tea.findMany({
      where: { ...ENTRY_ACTIVE, versions: { some: changed }, AND: [{ versions: { some: { isCurrent: true, visibility: 'public' } } }] },
      select: { id: true, versions: { select: versionFields } },
    }),
  ])
  return [
    // Tees zuerst: Ausgeblendete neue Tees des Nutzers blockieren dann seine neuen Zutaten nicht mehr
    ...teas.map(row => ({ entityType: 'tea' as const, entityId: row.id, versions: row.versions })),
    ...ingredients.map(row => ({ entityType: 'ingredient' as const, entityId: row.id, versions: row.versions })),
  ]
}

/** Vorschau (AK-7.1). */
export async function planBulkRevert(db: Db, userId: string, since: Date, locale: ContentLocale): Promise<BulkRevertPlan> {
  const candidates = await bulkCandidates(db, userId, since)
  const infos = await loadEntryInfos(db, candidates, locale)
  const plan: BulkRevertPlan = { revert: [], hide: [], skip: [] }
  const hiddenTeas = new Set<string>()
  for (const candidate of candidates) {
    const decision = decideBulkEntry(candidate.versions, userId, since)
    if (!decision) continue
    const item = { entityType: candidate.entityType, entityId: candidate.entityId, name: infos.get(entryKey(candidate.entityType, candidate.entityId))?.name ?? '' }
    if (decision.action === 'revert') {
      plan.revert.push({ ...item, toVersion: decision.toVersion })
    }
    else if (decision.action === 'hide') {
      // Wie bei der Ausführung: Eine Zutat bleibt, solange ein Tee sie enthält, der nicht mit ausgeblendet wird
      if (candidate.entityType === 'ingredient' && (await teasUsing(db, candidate.entityId)).some(teaId => !hiddenTeas.has(teaId))) {
        plan.skip.push({ ...item, reason: 'in_use' })
        continue
      }
      if (candidate.entityType === 'tea') hiddenTeas.add(candidate.entityId)
      plan.hide.push(item)
    }
    else {
      plan.skip.push({ ...item, reason: decision.reason })
    }
  }
  return plan
}

/** IDs der Tees, deren aktuelle Version die Zutat enthält (wie `countTeasUsing`). */
async function teasUsing(db: Db, ingredientId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ teaId: string }[]>`
    SELECT v."teaId" FROM "TeaVersionIngredient" vi
    JOIN "TeaVersion" v ON v.id = vi."versionId" AND v."isCurrent"
    JOIN "Tea" t ON t.id = v."teaId" AND ${activeSql('t')}
    WHERE vi."ingredientId" = ${ingredientId}::uuid`
  return rows.map(row => row.teaId)
}

const SKIP_CODES: Record<string, BulkSkipReason> = {
  INGREDIENT_IN_USE: 'in_use',
  DUPLICATE_NAME: 'duplicate',
  INGREDIENT_UNAVAILABLE: 'ingredient_unavailable',
  EDIT_CONFLICT: 'conflict',
}

/** Setzt einen Eintrag auf `toVersion` zurück, gekennzeichnet als Massen-Zurücksetzung (AK-7.2). */
async function revertForBulk(db: Db, entityType: CatalogTypeValue, id: string, toVersion: number, input: { userId: string, actorId: string }): Promise<void> {
  const marks = { authorId: input.actorId, note: null, revertedTo: toVersion, bulkRevertOfId: input.userId }
  if (entityType === 'ingredient') {
    const current = await loadCurrent(db, id)
    const target = await loadVersion(db, id, toVersion)
    if (!current || !target) throw new AppError(409, 'EDIT_CONFLICT', 'Entry changed')
    await saveIngredientVersion(db, {
      ingredientId: id,
      expectedVersion: current.version.version,
      before: toSnapshot(current.ingredient.sourceLocale, current.version),
      after: toSnapshot(current.ingredient.sourceLocale, target),
      ...marks,
    })
    return
  }
  const current = await loadCurrentTea(db, id, null)
  const target = await loadTeaVersion(db, id, toVersion)
  if (!current || !target) throw new AppError(409, 'EDIT_CONFLICT', 'Entry changed')
  const before = toTeaSnapshot(current.tea, current.version)
  await saveTeaVersion(db, {
    teaId: id,
    expectedVersion: current.version.version,
    before,
    after: await revertedTeaSnapshot(db, current.tea, before, target),
    ...marks,
  })
}

/**
 * Führt die Massen-Zurücksetzung aus: jeder Eintrag in einer eigenen Transaktion, damit ein Konflikt
 * die übrigen nicht verhindert (AK-7.3). Die Entscheidung fällt dort jeweils neu. Kein Rate-Limit (AK-7.6).
 */
export async function runBulkRevert(prisma: ReturnType<typeof usePrisma>, input: { userId: string, actorId: string, since: Date, locale: ContentLocale }): Promise<BulkRevertResult> {
  const candidates = await bulkCandidates(prisma, input.userId, input.since)
  const infos = await loadEntryInfos(prisma, candidates, input.locale)
  const result: BulkRevertResult = { revert: [], hide: [], skip: [] }

  for (const candidate of candidates) {
    const { entityType, entityId } = candidate
    const item = { entityType, entityId, name: infos.get(entryKey(entityType, entityId))?.name ?? '' }
    try {
      const done = await prisma.$transaction(async (tx) => {
        const row = await lockEntry(tx, entityType, entityId)
        if (!row || !isEntryActive(row)) return null
        const versions = entityType === 'ingredient'
          ? await tx.ingredientVersion.findMany({ where: { ingredientId: entityId }, select: versionFields })
          : await tx.teaVersion.findMany({ where: { teaId: entityId }, select: versionFields })
        const decision = decideBulkEntry(versions, input.userId, input.since)
        if (!decision || decision.action === 'skip') return decision
        if (decision.action === 'hide') {
          await hideEntry(tx, { entityType, id: entityId, actorId: input.actorId, reason: BULK_REVERT_REASON })
        }
        else {
          await revertForBulk(tx, entityType, entityId, decision.toVersion, input)
        }
        return decision
      })
      if (!done) continue
      if (done.action === 'revert') result.revert.push({ ...item, toVersion: done.toVersion })
      else if (done.action === 'hide') result.hide.push(item)
      else result.skip.push({ ...item, reason: done.reason })
    }
    catch (error) {
      const reason = error instanceof AppError ? SKIP_CODES[error.code] : undefined
      if (!reason) throw error
      result.skip.push({ ...item, reason })
    }
  }
  return result
}

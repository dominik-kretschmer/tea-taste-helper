import type { H3Event } from 'h3'
import { Prisma } from '../generated/prisma/client'
import type { Tea, TeaVersion, TeaVersionIngredient, TeaVersionTranslation } from '../generated/prisma/client'

// Einzige Stelle für Abfragen auf Tees. Wie bei Zutaten ist „aktuell“ die eine Version mit
// isCurrent = true. Dazu kommt die Sichtbarkeit: Fremde private Tees gelten überall als nicht
// vorhanden (404, nicht in Listen) – auch für Admins (AK-1.7).

export const TEA_LIST_PAGE_SIZE = 24
export const TEA_SIMILAR_LIMIT = 5

/** Angemeldeter Nutzer der Anfrage oder `null` für Gäste. */
export type Viewer = { id: string } | null | undefined

const teaVersionInclude = {
  translations: true,
  ingredients: { orderBy: { position: 'asc' } },
  author: { select: { displayName: true } },
  ...teaMarksInclude(),
} as const satisfies Prisma.TeaVersionInclude

/** Kennzeichnungen einer Teeversion für die Historie (05) */
export function teaMarksInclude() {
  return { ...marksInclude, mergedIngredient: { select: { id: true, mergedIntoId: true } } } as const
}

export type LoadedTeaVersion = TeaVersion & {
  translations: TeaVersionTranslation[]
  ingredients: TeaVersionIngredient[]
  author: { displayName: string } | null
  bulkRevertOf: { displayName: string } | null
  mergedIngredient: { id: string, mergedIntoId: string | null } | null
}

export const teaNotFound = (details?: unknown) => new AppError(404, 'NOT_FOUND', 'Tea not found', details)

/** Tee-ID aus dem Routenparameter `id`; ungültige IDs gelten als nicht gefunden. */
export function getTeaIdParam(event: H3Event): string {
  return getUuidParam(event, teaNotFound)
}

/** Öffentlich oder eigener Tee (AK-1.7). */
export function canViewTea(tea: Pick<Tea, 'ownerId'>, version: Pick<TeaVersion, 'visibility'>, viewer: Viewer): boolean {
  return version.visibility === 'public' || (!!viewer && tea.ownerId === viewer.id)
}

/**
 * Aktuelle Version samt Tee, oder `null`, wenn es den Tee nicht gibt oder der Betrachter ihn nicht sehen
 * darf. Ausgeblendete und zusammengeführte Tees gelten als nicht vorhanden, außer mit `includeInactive`
 * (05 AK-4.2, AK-5.1); dann entscheidet der Aufrufer über `assertReadable`.
 */
export async function loadCurrentTea(db: Db, id: string, viewer: Viewer, options: { includeInactive?: boolean } = {}) {
  const tea = await db.tea.findUnique({
    where: { id },
    include: { versions: { where: { isCurrent: true }, include: teaVersionInclude }, hiddenBy: { select: { displayName: true } } },
  })
  const version = tea?.versions[0]
  if (!tea || !version || !canViewTea(tea, version, viewer)) return null
  if (!options.includeInactive && !isEntryActive(tea)) return null
  return { tea, version }
}

/** Tee für Detail, Historie und Vergleich: sichtbar (AK-1.7) und lesbar (05 AK-4.2, AK-5.4), sonst 404. */
export async function loadReadableTea(db: Db, id: string, viewer: PublicUser | null | undefined, options: { allowMerged?: boolean } = {}) {
  const current = await loadCurrentTea(db, id, viewer, { includeInactive: true })
  if (!current) throw teaNotFound()
  return { ...current, ...assertReadable(current.tea, viewer, teaNotFound, options) }
}

/** Eine bestimmte Version (alt oder aktuell); die Sichtbarkeit prüft der Aufrufer über die aktuelle Version. */
export async function loadTeaVersion(db: Db, teaId: string, version: number): Promise<LoadedTeaVersion | null> {
  return db.teaVersion.findUnique({
    where: { teaId_version: { teaId, version } },
    include: teaVersionInclude,
  })
}

export function toTeaSnapshot(tea: Pick<Tea, 'sourceLocale'>, version: LoadedTeaVersion): TeaSnapshot {
  const translations: CatalogTranslations = {}
  for (const row of version.translations) {
    translations[row.locale as ContentLocale] = { name: row.name, description: row.description }
  }
  return {
    sourceLocale: tea.sourceLocale as ContentLocale,
    visibility: version.visibility,
    kind: version.kind,
    brand: version.brand,
    caffeine: version.caffeine,
    brewTempC: version.brewTempC,
    brewSeconds: version.brewSeconds,
    translations,
    ingredients: version.ingredients.map(row => ({ ingredientId: row.ingredientId, percent: row.percent })),
  }
}

/** Detail mit Zutatennamen in allen Sprachen, Ersteller und Koffein-Hinweis (AK-1.5, AK-1.6). */
export async function toTeaDetail(db: Db, tea: Tea, version: LoadedTeaVersion, viewer: Viewer): Promise<TeaDetail> {
  const snapshot = toTeaSnapshot(tea, version)
  const [views, owner] = await Promise.all([
    loadIngredientViews(db, snapshot.ingredients.map(item => item.ingredientId)),
    tea.ownerId ? db.user.findUnique({ where: { id: tea.ownerId }, select: { displayName: true } }) : null,
  ])
  const ingredients = snapshot.ingredients.flatMap((item) => {
    const view = views.get(item.ingredientId)
    return view ? [{ ...item, ...view }] : []
  })
  return {
    id: tea.id,
    ...snapshot,
    ingredients,
    ingredientsCaffeinated: ingredients.some(item => item.caffeine === 'yes'),
    version: version.version,
    updatedAt: version.createdAt.toISOString(),
    updatedBy: version.author,
    owner,
    isOwner: !!viewer && tea.ownerId === viewer.id,
  }
}

export async function loadTeaDetail(db: Db, id: string, viewer: PublicUser | null | undefined, options: { allowMerged?: boolean } = {}): Promise<TeaDetail> {
  const { tea, version, mergedInto, moderation } = await loadReadableTea(db, id, viewer, options)
  return { ...(await toTeaDetail(db, tea, version, viewer)), ...(mergedInto ? { mergedInto } : {}), ...(moderation ? { moderation } : {}) }
}

/**
 * Alle Zutaten müssen existieren und aktiv sein, sonst 400 mit der Position der ersten fehlenden
 * (AK-2.5, 05 AK-5.1). `FOR SHARE` hält sie bis zum Ende der Transaktion fest: Ausblenden oder
 * Zusammenführen derselben Zutat wartet, bzw. diese Prüfung wartet auf sie (05 AK-4.7, AK-5.2).
 */
export async function assertIngredientsExist(db: Db, ingredients: TeaIngredientRef[]): Promise<void> {
  const wanted = ingredients.map(item => item.ingredientId)
  const found = await db.$queryRaw<{ id: string }[]>`
    SELECT i.id FROM "Ingredient" i
    WHERE i.id = ANY(${wanted}::uuid[]) AND ${activeSql('i')}
    ORDER BY i.id
    FOR SHARE`
  const ids = new Set(found.map(row => row.id))
  const index = ingredients.findIndex(item => !ids.has(item.ingredientId))
  if (index >= 0) {
    throw new AppError(400, 'INGREDIENT_NOT_FOUND', 'Ingredient not found', { index, ingredientId: ingredients[index]!.ingredientId })
  }
}

/** Schlüssel der Marke für die Duplikatregel; ohne Marke ''. */
export const brandKeyOf = (brand: string | null) => (brand ? normalizeName(brand) : '')

/**
 * Duplikatregel für öffentliche Tees (AK-2.4): keine öffentliche aktuelle Version eines anderen Tees
 * darf in dieser Sprache denselben normalisierten Namen **und** dieselbe Marke haben.
 */
export async function assertTeaNameAvailable(db: Db, locale: ContentLocale, nameKey: string, brandKey: string, ignoreTeaId?: string): Promise<void> {
  await lockName(db, `tea-name:${locale}:${nameKey}:${brandKey}`)
  const existing = await db.teaVersionTranslation.findFirst({
    where: {
      locale,
      nameKey,
      version: {
        isCurrent: true,
        visibility: 'public',
        brandKey,
        // Ausgeblendete und zusammengeführte Tees zählen nicht (05 AK-5.3)
        tea: ENTRY_ACTIVE,
        ...(ignoreTeaId ? { teaId: { not: ignoreTeaId } } : {}),
      },
    },
    select: { version: { select: { teaId: true } } },
  })
  if (existing) {
    throw new AppError(409, 'DUPLICATE_NAME', 'A public tea with this name and brand already exists', {
      teaId: existing.version.teaId,
      locale,
    })
  }
}

/**
 * Prüft alle Namen eines öffentlichen Stands in fester Sprachreihenfolge (wegen der Sperren).
 * Mit `before` nur Sprachen, deren Name oder deren Marke sich gegenüber diesem Stand geändert hat.
 */
export async function assertTeaNamesAvailable(db: Db, snapshot: TeaSnapshot, options: { teaId?: string, before?: TeaSnapshot } = {}): Promise<void> {
  if (snapshot.visibility !== 'public') return
  const brandKey = brandKeyOf(snapshot.brand)
  for (const locale of CONTENT_LOCALES) {
    const name = snapshot.translations[locale]?.name
    if (!name) continue
    const nameKey = normalizeName(name)
    const { before } = options
    const previous = before?.translations[locale]?.name
    const unchanged = before
      && before.visibility === 'public'
      && previous !== undefined
      && normalizeName(previous) === nameKey
      && brandKeyOf(before.brand) === brandKey
    if (!unchanged) await assertTeaNameAvailable(db, locale, nameKey, brandKey, options.teaId)
  }
}

/** Legt eine neue, aktuelle Version mit allen Übersetzungen und Zutaten des Snapshots an. */
export async function writeTeaVersion(db: Db, input: {
  teaId: string
  version: number
  snapshot: TeaSnapshot
  authorId: string
  note: string | null
} & VersionMarks): Promise<LoadedTeaVersion> {
  const { snapshot } = input
  return db.teaVersion.create({
    data: {
      teaId: input.teaId,
      version: input.version,
      isCurrent: true,
      revertedTo: input.revertedTo ?? null,
      bulkRevertOfId: input.bulkRevertOfId ?? null,
      mergedIngredientId: input.mergedIngredientId ?? null,
      visibility: snapshot.visibility,
      kind: snapshot.kind,
      brand: snapshot.kind === 'bought' ? snapshot.brand : null,
      brandKey: snapshot.kind === 'bought' ? brandKeyOf(snapshot.brand) : '',
      caffeine: snapshot.caffeine,
      brewTempC: snapshot.brewTempC,
      brewSeconds: snapshot.brewSeconds,
      authorId: input.authorId,
      note: input.note,
      translations: {
        create: CONTENT_LOCALES.flatMap((locale) => {
          const text = snapshot.translations[locale]
          return text ? [{ locale, name: text.name, nameKey: normalizeName(text.name), description: text.description }] : []
        }),
      },
      ingredients: {
        create: snapshot.ingredients.map((item, position) => ({ position, ingredientId: item.ingredientId, percent: item.percent })),
      },
    },
    include: teaVersionInclude,
  })
}

// --- Liste, Suche, Ähnlichkeit (SQL wie bei Zutaten) ---

/** Anzeigename in `locale`, sonst Originalsprache; `v` ist die aktuelle Version, `t` der Tee. */
export const teaDisplayJoins = (locale: ContentLocale) => Prisma.sql`
  JOIN "TeaVersionTranslation" src ON src."versionId" = v.id AND src.locale = t."sourceLocale"
  LEFT JOIN "TeaVersionTranslation" own ON own."versionId" = v.id AND own.locale = ${locale}`

export interface TeaListQuery {
  q?: string
  page: number
  locale: ContentLocale
  ingredient?: string
  mine?: boolean
  withOwn?: boolean
}

/**
 * Öffentliche Tees (AK-1.1) bzw. mit `mine` alle eigenen (AK-7.1), mit `withOwn` beides (06 AK-2.1); Suche über Namen aller Sprachen
 * und die Marke (AK-1.2), Filter auf eine Zutat (AK-1.3).
 */
export async function listTeas(db: Db, query: TeaListQuery, viewer: Viewer): Promise<Page<TeaListItem>> {
  const scope = query.mine && viewer
    ? Prisma.sql`t."ownerId" = ${viewer.id}::uuid`
    : query.withOwn && viewer
      ? Prisma.sql`(v.visibility = 'public' OR t."ownerId" = ${viewer.id}::uuid)`
      : Prisma.sql`v.visibility = 'public'`
  const pattern = query.q ? `%${escapeLike(query.q)}%` : null
  const search = pattern
    ? Prisma.sql`AND (v.brand ILIKE ${pattern} OR EXISTS (
        SELECT 1 FROM "TeaVersionTranslation" x WHERE x."versionId" = v.id AND x.name ILIKE ${pattern}))`
    : Prisma.empty
  const ingredient = query.ingredient
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "TeaVersionIngredient" vi WHERE vi."versionId" = v.id AND vi."ingredientId" = ${query.ingredient}::uuid)`
    : Prisma.empty

  const [items, [{ total } = { total: 0 }]] = await Promise.all([
    db.$queryRaw<TeaListItem[]>`
      SELECT t.id, COALESCE(own.name, src.name) AS name, own.name IS NOT NULL AS translated, v.brand,
             v.kind::text AS kind, v.caffeine::text AS caffeine, v.visibility::text AS visibility
      FROM "Tea" t
      JOIN "TeaVersion" v ON v."teaId" = t.id AND v."isCurrent"
      ${teaDisplayJoins(query.locale)}
      WHERE ${scope} AND ${activeSql('t')} ${search} ${ingredient}
      ORDER BY lower(COALESCE(own.name, src.name)) COLLATE "de-x-icu", lower(COALESCE(v.brand, '')) COLLATE "de-x-icu", t.id
      LIMIT ${TEA_LIST_PAGE_SIZE} OFFSET ${(query.page - 1) * TEA_LIST_PAGE_SIZE}`,
    db.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total
      FROM "Tea" t
      JOIN "TeaVersion" v ON v."teaId" = t.id AND v."isCurrent"
      WHERE ${scope} AND ${activeSql('t')} ${search} ${ingredient}`,
  ])
  return { items, total, page: query.page, pageSize: TEA_LIST_PAGE_SIZE }
}

/** Bis zu 5 öffentliche Tees mit ähnlichem Namen in irgendeiner Sprache (AK-2.3). */
export async function findSimilarTeas(db: Db, name: string, locale: ContentLocale): Promise<{ id: string, name: string, brand: string | null }[]> {
  return db.$queryRaw`
    WITH hits AS (
      SELECT v."teaId" AS id, max(similarity(x.name, ${name})) AS score
      FROM "TeaVersionTranslation" x
      JOIN "TeaVersion" v ON v.id = x."versionId" AND v."isCurrent" AND v.visibility = 'public'
      WHERE x.name % ${name} OR x.name ILIKE ${`%${escapeLike(name)}%`}
      GROUP BY v."teaId"
    )
    SELECT t.id, COALESCE(own.name, src.name) AS name, v.brand
    FROM hits h
    JOIN "Tea" t ON t.id = h.id AND ${activeSql('t')}
    JOIN "TeaVersion" v ON v."teaId" = t.id AND v."isCurrent"
    ${teaDisplayJoins(locale)}
    ORDER BY h.score DESC, lower(COALESCE(own.name, src.name)) COLLATE "de-x-icu"
    LIMIT ${TEA_SIMILAR_LIMIT}`
}

const teaEditConflict = (details?: unknown) => new AppError(409, 'EDIT_CONFLICT', 'The tea was changed in the meantime', details)

/**
 * Speichert `after` als neue Version, wenn er sich von `before` unterscheidet. Einziger Weg für
 * Änderungen am Inhalt: Zutatenprüfung, optimistisches Sperren über `expectedVersion` und
 * Duplikatregel (AK-2.5, AK-3.3). Rechte, Rate-Limit und Audit bleiben beim Aufrufer.
 */
export async function saveTeaVersion(db: Db, input: {
  teaId: string
  expectedVersion: number
  before: TeaSnapshot
  after: TeaSnapshot
  authorId: string
  note: string | null
} & VersionMarks): Promise<{ changed: false } | { changed: true, version: LoadedTeaVersion, locales: ContentLocale[] }> {
  const { teaId: id, before, after } = input
  const changes = diffTeaSnapshots(before, after)
  if (!changes.length) return { changed: false }
  if (changes.some(change => change.field === 'ingredient')) await assertIngredientsExist(db, after.ingredients)

  // Nur die Version deaktivieren, die der Aufrufer geladen hat
  const deactivated = await db.$executeRaw`
    UPDATE "TeaVersion" SET "isCurrent" = false
    WHERE "teaId" = ${id}::uuid AND "isCurrent" AND version = ${input.expectedVersion}`
  if (deactivated === 0) {
    const latest = await db.teaVersion.findFirst({ where: { teaId: id, isCurrent: true }, select: { version: true } })
    throw teaEditConflict({ currentVersion: latest?.version ?? input.expectedVersion })
  }

  await assertTeaNamesAvailable(db, after, { teaId: id, before })
  const version = await writeTeaVersion(db, {
    teaId: id,
    version: input.expectedVersion + 1,
    snapshot: after,
    authorId: input.authorId,
    note: input.note,
    revertedTo: input.revertedTo,
    bulkRevertOfId: input.bulkRevertOfId,
    mergedIngredientId: input.mergedIngredientId,
  }).catch((error: unknown) => {
    // Gleichzeitige Speicherung, die das UPDATE oben nicht erkannt hat (Unique-Index greift)
    if ((error as { code?: string }).code === 'P2002') throw teaEditConflict()
    throw error
  })
  const locales = [...new Set(changes.flatMap(change => ('locale' in change && change.locale ? [change.locale] : [])))]
  return { changed: true, version, locales }
}

/**
 * Stand für das Zurücksetzen auf `target` (05 AK-1.4, AK-1.5): Inhalt der Zielversion, aber die
 * Sichtbarkeit bleibt; zusammengeführte Zutaten werden durch ihr Ziel ersetzt. Enthält sie eine
 * ausgeblendete Zutat, 409 INGREDIENT_UNAVAILABLE.
 */
export async function revertedTeaSnapshot(db: Db, tea: Pick<Tea, 'sourceLocale'>, before: TeaSnapshot, target: LoadedTeaVersion): Promise<TeaSnapshot> {
  const snapshot = toTeaSnapshot(tea, target)
  const resolved = await resolveMerged(db, snapshot.ingredients.map(item => item.ingredientId))
  let ingredients = snapshot.ingredients
  for (const [original, entry] of resolved) {
    if (entry.hidden) {
      throw new AppError(409, 'INGREDIENT_UNAVAILABLE', 'The version contains an ingredient that is no longer available', { ingredientId: entry.id })
    }
    if (entry.id !== original) ingredients = combineIngredients(ingredients, original, entry.id)
  }
  return { ...snapshot, visibility: before.visibility, ingredients }
}

import type { H3Event } from 'h3'
import { Prisma } from '../generated/prisma/client'
import type { IngredientVersion, IngredientVersionTranslation } from '../generated/prisma/client'

// Einzige Stelle für Abfragen auf Zutaten. Inhalte stehen in Versionen; „aktuell“ ist immer die eine
// Version mit isCurrent = true. Jede Abfrage auf Inhalte muss über CURRENT bzw. den Join in den
// SQL-Abfragen gehen, sonst tauchen Namen alter Versionen auf.

export const CURRENT = { isCurrent: true } as const satisfies Prisma.IngredientVersionWhereInput

export const LIST_PAGE_SIZE = 24
export const SIMILAR_LIMIT = 5

const versionInclude = {
  translations: true,
  author: { select: { displayName: true } },
} as const satisfies Prisma.IngredientVersionInclude

export type LoadedVersion = IngredientVersion & {
  translations: IngredientVersionTranslation[]
  author: { displayName: string } | null
}

/** Zutat-ID aus dem Routenparameter `id`; ungültige IDs gelten als nicht gefunden (AK-1.5). */
export function getIngredientIdParam(event: H3Event): string {
  return getUuidParam(event, notFound)
}

export const notFound = (details?: unknown) => new AppError(404, 'NOT_FOUND', 'Ingredient not found', details)

export function toSnapshot(sourceLocale: string, version: LoadedVersion): IngredientSnapshot {
  const translations: IngredientSnapshot['translations'] = {}
  for (const row of version.translations) {
    translations[row.locale as ContentLocale] = { name: row.name, description: row.description }
  }
  return {
    sourceLocale: sourceLocale as ContentLocale,
    caffeine: version.caffeine,
    brewTempC: version.brewTempC,
    brewSeconds: version.brewSeconds,
    translations,
  }
}

/** Versionszeile für die Historie; passt auf Zutaten- und Tee-Versionen. */
export function toRevisionEntry(version: { version: number, isCurrent: boolean, createdAt: Date, note: string | null, author: { displayName: string } | null }): RevisionEntry {
  return {
    version: version.version,
    isCurrent: version.isCurrent,
    createdAt: version.createdAt.toISOString(),
    author: version.author,
    note: version.note,
  }
}

/**
 * Aktuelle Version samt Übersetzungen, oder `null`, wenn es die Zutat nicht gibt. Ausgeblendete und
 * zusammengeführte Zutaten gelten als nicht vorhanden, außer mit `includeInactive` (05 AK-4.2, AK-5.1).
 */
export async function loadCurrent(db: Db, id: string, options: { includeInactive?: boolean } = {}) {
  const ingredient = await db.ingredient.findUnique({
    where: { id },
    include: { versions: { where: CURRENT, include: versionInclude }, hiddenBy: { select: { displayName: true } } },
  })
  const version = ingredient?.versions[0]
  if (!ingredient || !version || (!options.includeInactive && !isEntryActive(ingredient))) return null
  return { ingredient, version }
}

/** Eine bestimmte Version (alt oder aktuell). */
export async function loadVersion(db: Db, ingredientId: string, version: number): Promise<LoadedVersion | null> {
  return db.ingredientVersion.findUnique({
    where: { ingredientId_version: { ingredientId, version } },
    include: versionInclude,
  })
}

export function toDetail(id: string, sourceLocale: string, version: LoadedVersion): IngredientDetail {
  return {
    id,
    ...toSnapshot(sourceLocale, version),
    version: version.version,
    updatedAt: version.createdAt.toISOString(),
    updatedBy: version.author,
  }
}

/**
 * Detail für die Detailseite: zusammengeführt → 404 mit `mergedInto` (mit `allowMerged` lesbar),
 * ausgeblendet → 404, für Moderatoren mit `moderation` (05 AK-4.2, AK-5.4).
 */
export async function loadDetail(db: Db, id: string, viewer?: PublicUser | null, options: { allowMerged?: boolean } = {}): Promise<IngredientDetail> {
  const current = await loadCurrent(db, id, { includeInactive: true })
  if (!current) throw notFound()
  const state = assertReadable(current.ingredient, viewer, notFound, options)
  return { ...toDetail(id, current.ingredient.sourceLocale, current.version), ...state }
}

/** Zutat für Historie und Vergleich: wie `loadDetail`, zusammengeführte sind lesbar (AK-4.2). */
export async function loadReadableIngredient(db: Db, id: string, viewer: PublicUser | null | undefined) {
  const ingredient = await db.ingredient.findUnique({ where: { id }, include: { hiddenBy: { select: { displayName: true } } } })
  if (!ingredient) throw notFound()
  return { ingredient, ...assertReadable(ingredient, viewer, notFound, { allowMerged: true }) }
}

/**
 * Prüft die Duplikatregel (AK-2.3, AK-3.4): keine aktuelle Version einer anderen Zutat darf in dieser
 * Sprache denselben normalisierten Namen haben. Die Advisory-Sperre lässt gleichzeitige Speicherungen
 * desselben Namens nacheinander laufen; sie endet mit der Transaktion. Bei mehreren Namen in
 * CONTENT_LOCALES-Reihenfolge aufrufen, damit sich Sperren nicht über Kreuz blockieren.
 */
export async function assertNameAvailable(db: Db, locale: ContentLocale, nameKey: string, ignoreIngredientId?: string): Promise<void> {
  await lockName(db, `ingredient-name:${locale}:${nameKey}`)
  const existing = await db.ingredientVersionTranslation.findFirst({
    where: {
      locale,
      nameKey,
      // Ausgeblendete und zusammengeführte Zutaten zählen nicht (05 AK-5.3)
      version: { ...CURRENT, ingredient: ENTRY_ACTIVE, ...(ignoreIngredientId ? { ingredientId: { not: ignoreIngredientId } } : {}) },
    },
    select: { version: { select: { ingredientId: true } } },
  })
  if (existing) {
    throw new AppError(409, 'DUPLICATE_NAME', 'An ingredient with this name already exists', {
      ingredientId: existing.version.ingredientId,
      locale,
    })
  }
}

/** Legt eine neue, aktuelle Version mit allen Übersetzungen des Snapshots an. */
export async function writeVersion(db: Db, input: {
  ingredientId: string
  version: number
  snapshot: IngredientSnapshot
  authorId: string
  note: string | null
}): Promise<LoadedVersion> {
  const { snapshot } = input
  return db.ingredientVersion.create({
    data: {
      ingredientId: input.ingredientId,
      version: input.version,
      isCurrent: true,
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
    },
    include: versionInclude,
  })
}

// --- Liste, Suche, Ähnlichkeit (SQL, weil Prisma COALESCE über Joins und pg_trgm nicht abbildet) ---

/** Anzeigename in `locale`, sonst Originalsprache (AK-1.3); `v` ist die aktuelle Version, `i` die Zutat. */
const displayJoins = (locale: ContentLocale) => Prisma.sql`
  JOIN "IngredientVersionTranslation" src ON src."versionId" = v.id AND src.locale = i."sourceLocale"
  LEFT JOIN "IngredientVersionTranslation" own ON own."versionId" = v.id AND own.locale = ${locale}`

export async function listIngredients(db: Db, query: { q?: string, page: number, locale: ContentLocale }): Promise<Page<IngredientListItem>> {
  const search = query.q
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "IngredientVersionTranslation" t
        WHERE t."versionId" = v.id AND t.name ILIKE ${`%${escapeLike(query.q)}%`})`
    : Prisma.empty

  const [items, [{ total } = { total: 0 }]] = await Promise.all([
    db.$queryRaw<IngredientListItem[]>`
      SELECT i.id, COALESCE(own.name, src.name) AS name, own.name IS NOT NULL AS translated, v.caffeine::text AS caffeine
      FROM "Ingredient" i
      JOIN "IngredientVersion" v ON v."ingredientId" = i.id AND v."isCurrent"
      ${displayJoins(query.locale)}
      WHERE ${activeSql('i')} ${search}
      ORDER BY lower(COALESCE(own.name, src.name)) COLLATE "de-x-icu", i.id
      LIMIT ${LIST_PAGE_SIZE} OFFSET ${(query.page - 1) * LIST_PAGE_SIZE}`,
    db.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total
      FROM "Ingredient" i
      JOIN "IngredientVersion" v ON v."ingredientId" = i.id AND v."isCurrent"
      WHERE ${activeSql('i')} ${search}`,
  ])
  return { items, total, page: query.page, pageSize: LIST_PAGE_SIZE }
}

/** Bis zu 5 Zutaten mit ähnlichem aktuellem Namen in irgendeiner Sprache (AK-2.2). */
export async function findSimilar(db: Db, name: string, locale: ContentLocale): Promise<{ id: string, name: string }[]> {
  // `%` nutzt den GIN-Index; Schwelle ist pg_trgm.similarity_threshold (Standard 0.3)
  return db.$queryRaw`
    WITH hits AS (
      SELECT v."ingredientId" AS id, max(similarity(t.name, ${name})) AS score
      FROM "IngredientVersionTranslation" t
      JOIN "IngredientVersion" v ON v.id = t."versionId" AND v."isCurrent"
      WHERE t.name % ${name} OR t.name ILIKE ${`%${escapeLike(name)}%`}
      GROUP BY v."ingredientId"
    )
    SELECT i.id, COALESCE(own.name, src.name) AS name
    FROM hits h
    JOIN "Ingredient" i ON i.id = h.id AND ${activeSql('i')}
    JOIN "IngredientVersion" v ON v."ingredientId" = i.id AND v."isCurrent"
    ${displayJoins(locale)}
    ORDER BY h.score DESC, lower(COALESCE(own.name, src.name)) COLLATE "de-x-icu"
    LIMIT ${SIMILAR_LIMIT}`
}

/**
 * Zutaten mit aktuellen Übersetzungen und Koffeinwert, für die Anzeige in Tees (ein Query).
 * Nicht vorhandene IDs fehlen in der Map.
 */
export async function loadIngredientViews(db: Db, ids: string[]): Promise<Map<string, Omit<TeaIngredientView, 'ingredientId' | 'percent'>>> {
  if (!ids.length) return new Map()
  const rows = await db.ingredient.findMany({
    where: { id: { in: ids } },
    include: { versions: { where: CURRENT, include: { translations: true } } },
  })
  return new Map(rows.flatMap((row) => {
    const version = row.versions[0]
    if (!version) return []
    const translations: CatalogTranslations = {}
    for (const text of version.translations) translations[text.locale as ContentLocale] = { name: text.name, description: text.description }
    return [[row.id, { sourceLocale: row.sourceLocale as ContentLocale, translations, caffeine: version.caffeine }]]
  }))
}

const editConflict = (details?: unknown) => new AppError(409, 'EDIT_CONFLICT', 'The ingredient was changed in the meantime', details)

/**
 * Speichert `after` als neue Version, wenn er sich von `before` unterscheidet (AK-3.3). Einziger Weg
 * für Änderungen am Inhalt: optimistisches Sperren über `expectedVersion` (AK-3.2) und Duplikatregel
 * für geänderte Namen (AK-3.4, AK-4.2). Rechte, Rate-Limit und Audit bleiben beim Aufrufer.
 */
export async function saveIngredientVersion(db: Db, input: {
  ingredientId: string
  expectedVersion: number
  before: IngredientSnapshot
  after: IngredientSnapshot
  authorId: string
  note: string | null
}): Promise<{ changed: false } | { changed: true, version: LoadedVersion, locales: ContentLocale[] }> {
  const { ingredientId: id, before, after } = input
  const changes = diffSnapshots(before, after)
  if (!changes.length) return { changed: false }

  // Nur die Version deaktivieren, die der Aufrufer geladen hat
  const deactivated = await db.$executeRaw`
    UPDATE "IngredientVersion" SET "isCurrent" = false
    WHERE "ingredientId" = ${id}::uuid AND "isCurrent" AND version = ${input.expectedVersion}`
  if (deactivated === 0) {
    const latest = await loadCurrent(db, id)
    throw editConflict({ currentVersion: latest?.version.version ?? input.expectedVersion })
  }

  // Reihenfolge fest wegen der Sperren
  for (const locale of CONTENT_LOCALES) {
    const name = after.translations[locale]?.name
    if (!name) continue
    const key = normalizeName(name)
    const previous = before.translations[locale]?.name
    if (previous === undefined || normalizeName(previous) !== key) await assertNameAvailable(db, locale, key, id)
  }

  const version = await writeVersion(db, {
    ingredientId: id,
    version: input.expectedVersion + 1,
    snapshot: after,
    authorId: input.authorId,
    note: input.note,
  }).catch((error: unknown) => {
    // Gleichzeitige Speicherung, die das UPDATE oben nicht erkannt hat (Unique-Index greift)
    if ((error as { code?: string }).code === 'P2002') throw editConflict()
    throw error
  })
  const locales = [...new Set(changes.flatMap(change => change.locale ? [change.locale] : []))]
  return { changed: true, version, locales }
}

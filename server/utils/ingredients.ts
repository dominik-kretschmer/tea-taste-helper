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

export const notFound = () => new AppError(404, 'NOT_FOUND', 'Ingredient not found')

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

export function toRevisionEntry(version: LoadedVersion | (IngredientVersion & { author: { displayName: string } | null })): RevisionEntry {
  return {
    version: version.version,
    isCurrent: version.isCurrent,
    createdAt: version.createdAt.toISOString(),
    author: version.author,
    note: version.note,
  }
}

/** Aktuelle Version samt Übersetzungen, oder `null`, wenn es die Zutat nicht gibt. */
export async function loadCurrent(db: Db, id: string) {
  const ingredient = await db.ingredient.findUnique({
    where: { id },
    include: { versions: { where: CURRENT, include: versionInclude } },
  })
  const version = ingredient?.versions[0]
  return ingredient && version ? { ingredient, version } : null
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

export async function loadDetail(db: Db, id: string): Promise<IngredientDetail> {
  const current = await loadCurrent(db, id)
  if (!current) throw notFound()
  return toDetail(id, current.ingredient.sourceLocale, current.version)
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
      version: { ...CURRENT, ...(ignoreIngredientId ? { ingredientId: { not: ignoreIngredientId } } : {}) },
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
      WHERE true ${search}
      ORDER BY lower(COALESCE(own.name, src.name)) COLLATE "de-x-icu", i.id
      LIMIT ${LIST_PAGE_SIZE} OFFSET ${(query.page - 1) * LIST_PAGE_SIZE}`,
    db.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total
      FROM "Ingredient" i
      JOIN "IngredientVersion" v ON v."ingredientId" = i.id AND v."isCurrent"
      WHERE true ${search}`,
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
    JOIN "Ingredient" i ON i.id = h.id
    JOIN "IngredientVersion" v ON v."ingredientId" = i.id AND v."isCurrent"
    ${displayJoins(locale)}
    ORDER BY h.score DESC, lower(COALESCE(own.name, src.name)) COLLATE "de-x-icu"
    LIMIT ${SIMILAR_LIMIT}`
}

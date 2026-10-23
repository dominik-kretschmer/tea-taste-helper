import type { H3Event } from 'h3'
import { z } from 'zod'
import { Prisma } from '../generated/prisma/client'

// Gemeinsame Server-Bausteine für Katalog-Einträge (Zutaten, Tees).

export type Db = Prisma.TransactionClient

const TEN_MINUTES = 10 * 60 * 1000
const CATALOG_CHANGES_PER_WINDOW = 30

/** Maskiert `%`, `_` und `\` für ILIKE (Standard-Escape ist der Backslash). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`)
}

/** UUID aus dem Routenparameter `id`; ungültige IDs gelten als nicht gefunden. */
export function getUuidParam(event: H3Event, notFound: () => Error): string {
  const parsed = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) throw notFound()
  return parsed.data
}

/** Höchstens 30 Katalogänderungen (Zutaten und Tees zusammen) in 10 Minuten pro Nutzer. */
export function assertCatalogRateLimit(event: H3Event, user: PublicUser): void {
  assertRateLimit(event, consume(`catalog:user:${user.id}`, CATALOG_CHANGES_PER_WINDOW, TEN_MINUTES))
}

/**
 * Advisory-Sperre bis zum Ende der Transaktion; gleichzeitige Speicherungen desselben Schlüssels
 * laufen dadurch nacheinander. Mehrere Sperren immer in derselben Reihenfolge nehmen.
 */
export async function lockName(db: Db, key: string): Promise<void> {
  await db.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${key}))`
}

// --- 05 – Moderation: Zustand eines Katalog-Eintrags ---

/** Kennzeichnungen einer neuen Version: Zurücksetzen, Massen-Zurücksetzung, Zusammenführen (05). */
export interface VersionMarks {
  revertedTo?: number | null
  bulkRevertOfId?: string | null
  /** nur Tees */
  mergedIngredientId?: string | null
}

/** Prisma-Include für die Anzeige der Kennzeichnungen in der Historie */
export const marksInclude = {
  bulkRevertOf: { select: { displayName: true } },
} as const

/** Moderationsfelder an `Ingredient` und `Tea`. */
export interface ModerationFields {
  hiddenAt: Date | null
  hiddenReason: string | null
  mergedIntoId: string | null
  hiddenBy?: { displayName: string } | null
}

/** Prisma-Bedingung „aktiv“: weder ausgeblendet noch zusammengeführt (gilt für Ingredient und Tea). */
export const ENTRY_ACTIVE = { hiddenAt: null, mergedIntoId: null } as const

/** Dieselbe Bedingung als SQL für den Tabellen-Alias `alias` (`i` bzw. `t`). */
export const activeSql = (alias: 'i' | 't') =>
  Prisma.sql`${Prisma.raw(alias)}."hiddenAt" IS NULL AND ${Prisma.raw(alias)}."mergedIntoId" IS NULL`

export function isEntryActive(row: Pick<ModerationFields, 'hiddenAt' | 'mergedIntoId'>): boolean {
  return !row.hiddenAt && !row.mergedIntoId
}

/**
 * Lesbarkeit eines Eintrags für Detail, Historie und Vergleich (AK-4.2, AK-5.1, AK-5.4):
 * - zusammengeführt: 404 mit `mergedInto`, außer mit `allowMerged` (Historie der Quelle);
 * - ausgeblendet: 404, außer für Moderatoren – dann mit `moderation`.
 */
export function assertReadable(
  row: ModerationFields,
  viewer: PublicUser | null | undefined,
  notFound: (details?: unknown) => Error,
  options: { allowMerged?: boolean } = {},
): { mergedInto?: string, moderation?: ModerationState } {
  if (row.mergedIntoId) {
    if (!options.allowMerged) throw notFound({ mergedInto: row.mergedIntoId })
    return { mergedInto: row.mergedIntoId }
  }
  if (row.hiddenAt) {
    if (!hasRole(viewer, 'moderator')) throw notFound()
    return {
      moderation: { hiddenAt: row.hiddenAt.toISOString(), hiddenBy: row.hiddenBy ?? null, hiddenReason: row.hiddenReason ?? '' },
    }
  }
  return {}
}

const ROUTE_TYPES: Record<string, CatalogTypeValue> = { ingredients: 'ingredient', teas: 'tea' }

/** Art und ID aus `/api/admin/:type/:id/…`; unbekannte Arten und ungültige IDs gelten als nicht gefunden. */
export function getEntryParams(event: H3Event): { entityType: CatalogTypeValue, id: string } {
  const entityType = ROUTE_TYPES[getRouterParam(event, 'type') ?? '']
  const notFound = () => new AppError(404, 'NOT_FOUND', 'Entry not found')
  if (!entityType) throw notFound()
  return { entityType, id: getUuidParam(event, notFound) }
}

/** Hält ein Ereignis ohne neue Version für die Historie fest (05 AK-5.6). */
export async function recordCatalogEvent(db: Db, input: {
  entityType: CatalogTypeValue
  entityId: string
  kind: 'hidden' | 'restored' | 'merged'
  actorId: string
  reason?: string | null
  targetId?: string | null
}): Promise<void> {
  await db.catalogEvent.create({ data: { ...input, reason: input.reason ?? null, targetId: input.targetId ?? null } })
}

/** Ereignisse eines Eintrags für die Historie, älteste zuerst; den Grund sehen nur Moderatoren (AK-5.6). */
export async function loadCatalogEvents(db: Db, entityType: CatalogTypeValue, entityId: string, viewer: PublicUser | null | undefined): Promise<CatalogEventEntry[]> {
  const moderator = hasRole(viewer, 'moderator')
  const rows = await db.catalogEvent.findMany({
    where: { entityType, entityId },
    include: { actor: { select: { displayName: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(row => ({
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    actor: row.actor,
    ...(moderator ? { reason: row.reason } : {}),
    ...(row.targetId ? { mergedInto: row.targetId } : {}),
  }))
}

import type { H3Event } from 'h3'
import { z } from 'zod'
import type { Prisma } from '../generated/prisma/client'

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

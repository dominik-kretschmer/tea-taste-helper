import type { H3Event } from 'h3'

// Zähler mit festem Zeitfenster im Speicher. Reicht für eine Instanz (02, „Nicht im Umfang“).
interface Bucket {
  count: number
  resetAt: number
}

export interface RateLimitResult {
  ok: boolean
  retryAfterSec: number
}

const buckets = new Map<string, Bucket>()
let lastPrune = 0
const PRUNE_INTERVAL_MS = 60_000

function current(key: string, now: number): Bucket | undefined {
  if (now - lastPrune > PRUNE_INTERVAL_MS) {
    for (const [k, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(k)
    lastPrune = now
  }
  const bucket = buckets.get(key)
  return bucket && bucket.resetAt > now ? bucket : undefined
}

const result = (ok: boolean, bucket: Bucket | undefined, now: number): RateLimitResult => ({
  ok,
  retryAfterSec: bucket ? Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) : 0,
})

/** Zählt einen Versuch; `ok: false`, sobald mehr als `limit` Versuche im Fenster liegen. */
export function consume(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  let bucket = current(key, now)
  if (!bucket) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }
  bucket.count++
  return result(bucket.count <= limit, bucket, now)
}

/** Prüft ohne zu zählen; `ok: false`, wenn das Limit bereits ausgeschöpft ist. */
export function check(key: string, limit: number): RateLimitResult {
  const now = Date.now()
  const bucket = current(key, now)
  return result(!bucket || bucket.count < limit, bucket, now)
}

export function reset(key: string): void {
  buckets.delete(key)
}

/** Nur für Tests: alle Zähler löschen. */
export function resetAllRateLimits(): void {
  buckets.clear()
  lastPrune = 0
}

/** Wirft 429 RATE_LIMITED mit Retry-After, wenn das Ergebnis nicht ok ist (AK-8.1, AK-8.2). */
export function assertRateLimit(event: H3Event, limit: RateLimitResult): void {
  if (limit.ok) return
  setResponseHeader(event, 'Retry-After', limit.retryAfterSec)
  throw new AppError(429, 'RATE_LIMITED', 'Too many attempts, please try again later')
}

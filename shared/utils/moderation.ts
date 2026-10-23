import type { TeaIngredientRef } from '../types/tea'
import type { BlockDuration } from '../types/moderation'

export const REPORT_REASONS = ['duplicate', 'wrong_info', 'spam', 'inappropriate', 'other'] as const
export const BLOCK_DURATIONS = ['24h', '7d', '30d', 'permanent'] as const
export const CATALOG_TYPES = ['ingredient', 'tea'] as const
export const MODERATION_TEXT_MAX = 500
/** Fester Grund beim Ausblenden durch eine Massen-Zurücksetzung (in der UI übersetzt) */
export const BULK_REVERT_REASON = 'bulk_revert'

const HOUR = 60 * 60 * 1000
const DURATION_MS: Record<Exclude<BlockDuration, 'permanent'>, number> = { '24h': 24 * HOUR, '7d': 7 * 24 * HOUR, '30d': 30 * 24 * HOUR }

/** Ende einer Sperre ab `now`; `null` = unbefristet (AK-6.1). */
export function blockedUntil(duration: BlockDuration, now: Date = new Date()): Date | null {
  return duration === 'permanent' ? null : new Date(now.getTime() + DURATION_MS[duration])
}

/** Gesperrt ist, wer `blockedAt` hat und dessen Sperre unbefristet ist oder noch läuft (AK-6.3). */
export function isBlocked(user: { blockedAt: Date | null, blockedUntil: Date | null }, now: Date = new Date()): boolean {
  return !!user.blockedAt && (!user.blockedUntil || user.blockedUntil > now)
}

/**
 * Ersetzt in einer Zutatenliste die Quelle durch das Ziel (AK-4.3). Kommt nur die Quelle vor, steht
 * das Ziel an ihrer Stelle. Kommen beide vor, bleibt das Ziel an seiner Position, die Quelle entfällt,
 * und die Anteile werden addiert, wenn beide angegeben sind – sonst gilt der angegebene.
 */
export function combineIngredients(list: TeaIngredientRef[], sourceId: string, targetId: string): TeaIngredientRef[] {
  const source = list.find(item => item.ingredientId === sourceId)
  if (!source) return list
  const target = list.find(item => item.ingredientId === targetId)
  if (!target) return list.map(item => (item === source ? { ingredientId: targetId, percent: source.percent } : item))
  const percent = source.percent !== null && target.percent !== null ? source.percent + target.percent : (target.percent ?? source.percent)
  return list.filter(item => item !== source).map(item => (item === target ? { ingredientId: targetId, percent } : item))
}

// Feste Zeitzone, damit Server und Browser identisch rendern (sonst Hydration-Abweichungen).
const TIME_ZONE = 'Europe/Berlin'

export function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '–'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(iso))
}

/** Ziehzeit in Sekunden als „m:ss“, z.B. 210 → „3:30“. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return ''
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Liest „m:ss“ oder ganze Minuten („5“) als Sekunden. Leer → null, unlesbar → NaN
 * (das Schema meldet dann einen Fehler).
 */
export function parseDuration(value: string | null | undefined): number | null {
  const text = value?.trim() ?? ''
  if (!text) return null
  const match = /^(\d{1,2})(?::([0-5]\d))?$/.exec(text)
  if (!match) return Number.NaN
  return Number(match[1]) * 60 + Number(match[2] ?? 0)
}

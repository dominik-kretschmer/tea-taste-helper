// Feste Zeitzone, damit Server und Browser identisch rendern (sonst Hydration-Abweichungen).
const TIME_ZONE = 'Europe/Berlin'

export function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '–'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(iso))
}

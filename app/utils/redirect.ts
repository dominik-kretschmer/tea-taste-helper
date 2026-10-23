/**
 * Nur interne Pfade als Ziel nach Login/Registrierung zulassen. Kein Open Redirect über
 * `?redirect=//evil` oder `/\evil` – Browser lesen `\` in URLs wie `/` (00-chore/10).
 */
export function safeRedirect(target: unknown, fallback: string): string {
  return typeof target === 'string' && target.startsWith('/') && !/^\/[/\\]/.test(target) ? target : fallback
}

/** Query für Querverweise zwischen Login und Registrierung: `redirect` nur, wenn es sicher ist. */
export function redirectQuery(target: unknown): { redirect?: string } {
  const safe = safeRedirect(target, '')
  return safe ? { redirect: safe } : {}
}

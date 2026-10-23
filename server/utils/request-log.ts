import type { H3Event } from 'h3'

/**
 * Schreibt die Request-Zeile einer /api-Anfrage, höchstens einmal (AK-4.1 aus 01).
 * Aufgerufen nach Erfolg (afterResponse) und aus dem Error-Handler, den afterResponse
 * nicht erreicht (00-chore/03).
 */
export function logRequest(event: H3Event): void {
  if (!event.path.startsWith('/api/') || event.context.requestLogged) return
  event.context.requestLogged = true
  const log = event.context.log ?? useLogger()
  log.info({
    method: event.method,
    path: event.path,
    status: getResponseStatus(event),
    durationMs: event.context.startedAt === undefined ? undefined : Math.round(performance.now() - event.context.startedAt),
  }, 'request')
}

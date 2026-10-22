import { randomUUID } from 'node:crypto'
import type { Logger } from 'pino'

declare module 'h3' {
  interface H3EventContext {
    requestId: string
    log: Logger
    startedAt: number
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Request-ID für jede Anfrage, eine Logzeile pro /api-Anfrage (AK-4.1, AK-4.2).
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const incoming = getRequestHeader(event, 'x-request-id')
    const requestId = incoming && UUID.test(incoming) ? incoming : randomUUID()

    event.context.requestId = requestId
    event.context.log = useLogger().child({ requestId })
    event.context.startedAt = performance.now()
    setResponseHeader(event, 'X-Request-Id', requestId)
  })

  nitroApp.hooks.hook('afterResponse', (event) => {
    if (!event.path.startsWith('/api/')) return
    event.context.log.info({
      method: event.method,
      path: event.path,
      status: getResponseStatus(event),
      durationMs: Math.round(performance.now() - event.context.startedAt),
    }, 'request')
  })

  nitroApp.hooks.hook('error', (error, { event }) => {
    // 4xx sind erwartete Fehler und stehen bereits in der Request-Zeile; nur 5xx mit Stacktrace loggen.
    const status = isError(error) ? error.statusCode : 500
    if (status < 500) return
    const log = event?.context.log ?? useLogger()
    log.error({ err: isError(error) && error.cause instanceof Error ? error.cause : error }, 'unhandled error')
  })
})

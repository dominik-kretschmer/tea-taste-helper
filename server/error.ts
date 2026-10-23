// Einheitliches JSON-Fehlerformat für /api/**. Andere Pfade bleiben unbehandelt und
// fallen an den Nuxt-Handler (Fehlerseite) durch, siehe `nitro:config` in nuxt.config.ts.
export default defineNitroErrorHandler((error, event) => {
  if (!event.path.startsWith('/api/')) return

  const { status, body } = toErrorResponse(error, event.context.requestId ?? 'unknown')
  setResponseStatus(event, status)
  logRequest(event)
  setResponseHeader(event, 'Content-Type', 'application/json')
  return send(event, JSON.stringify(body))
})

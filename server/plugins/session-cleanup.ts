// Löscht stündlich abgelaufene Sessions; beim Auflösen werden sie ohnehin einzeln entfernt.
const INTERVAL_MS = 60 * 60 * 1000

export default defineNitroPlugin((nitroApp) => {
  if (import.meta.prerender) return

  const timer = setInterval(async () => {
    try {
      const count = await purgeExpiredSessions()
      if (count) useLogger().info({ count }, 'expired sessions purged')
    }
    catch (err) {
      useLogger().error({ err }, 'session cleanup failed')
    }
  }, INTERVAL_MS)
  timer.unref()

  nitroApp.hooks.hook('close', () => clearInterval(timer))
})

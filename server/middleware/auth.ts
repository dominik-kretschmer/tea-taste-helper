// Löst für /api/** den angemeldeten Nutzer auf und erzwingt den Pflicht-Passwortwechsel (AK-6.2).
// Seiten holen den Nutzer über /api/auth/me; Assets (/_nuxt/…) brauchen keine DB-Abfrage.
const ALLOWED_DURING_PASSWORD_CHANGE = new Set(['/api/auth/password', '/api/auth/logout', '/api/auth/me', '/api/health'])

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return

  const user = await resolveSession(event)
  event.context.user = user

  const path = event.path.split('?')[0]!
  if (user?.mustChangePassword && !ALLOWED_DURING_PASSWORD_CHANGE.has(path)) {
    throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Password change required')
  }
})

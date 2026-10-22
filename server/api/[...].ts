// Fängt alle unbekannten API-Routen ab, damit sie nicht von der Nuxt-App gerendert werden (AK-5.4).
export default defineEventHandler((event) => {
  throw new AppError(404, 'NOT_FOUND', `Route not found: ${event.method} ${event.path}`)
})

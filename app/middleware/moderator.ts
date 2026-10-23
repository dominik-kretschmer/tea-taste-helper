// Moderationsbereich für Moderatoren und Admins (05 AK-0.1); die API prüft unabhängig davon selbst.
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, isModerator } = useAuth()
  const localePath = useLocalePath()
  if (!loggedIn.value) return navigateTo(localePath({ path: '/login', query: { redirect: to.fullPath } }))
  if (!isModerator.value) return navigateTo(localePath('/'))
})

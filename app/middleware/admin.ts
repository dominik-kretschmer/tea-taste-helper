// Verwaltung nur für Admins (AK-5.4); die API prüft unabhängig davon selbst.
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, isAdmin } = useAuth()
  const localePath = useLocalePath()
  if (!loggedIn.value) return navigateTo(localePath({ path: '/login', query: { redirect: to.fullPath } }))
  if (!isAdmin.value) return navigateTo(localePath('/'))
})

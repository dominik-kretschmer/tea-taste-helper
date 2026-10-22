// Nur für angemeldete Nutzer; Gäste gehen zur Anmeldung und kommen danach zurück.
export default defineNuxtRouteMiddleware((to) => {
  if (useAuth().loggedIn.value) return
  return navigateTo(useLocalePath()({ path: '/login', query: { redirect: to.fullPath } }))
})

// Anmelden/Registrieren nur für Gäste.
export default defineNuxtRouteMiddleware(() => {
  if (useAuth().loggedIn.value) return navigateTo(useLocalePath()('/'))
})

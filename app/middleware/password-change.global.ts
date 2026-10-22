// Nach einem Admin-Reset gibt es nur die Seite zum Passwortwechsel (AK-6.2).
export default defineNuxtRouteMiddleware((to) => {
  const { user } = useAuth()
  if (!user.value?.mustChangePassword) return
  if (useRouteBaseName()(to) === 'account-password') return
  return navigateTo(useLocalePath()('/account/password'))
})

// $api: $fetch mit CSRF-Header für alle eigenen API-Aufrufe (AK-9.2).
export default defineNuxtPlugin(() => {
  const user = useState<PublicUser | null>('auth:user', () => null)

  const api = $fetch.create({
    onRequest({ options }) {
      const { csrf, headerName } = useCsrf()
      if (!csrf) return
      const headers = new Headers(options.headers)
      headers.set(headerName, csrf)
      options.headers = headers
    },
    onResponseError({ response }) {
      // Session ist serverseitig beendet (Logout anderswo, Admin-Reset, Ablauf)
      if (response.status === 401) user.value = null
    },
  })

  return { provide: { api } }
})

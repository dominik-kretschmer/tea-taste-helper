// Lädt den angemeldeten Nutzer beim Server-Rendern; der Zustand kommt per Payload in den Browser,
// so erscheint der Anzeigename ohne Flackern (AK-2.8).
export default defineNuxtPlugin(async () => {
  await useAuth().refresh()
})

import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { de, en } from 'vuetify/locale'

export default defineNuxtPlugin((nuxtApp) => {
  const i18n = nuxtApp.$i18n
  const colorTheme = useColorTheme()

  const vuetify = createVuetify({
    ssr: true,
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    // Nicht 'system': das löst Vuetify erst im Browser auf und weicht dann vom Server-HTML ab.
    // Server und Browser starten mit demselben, vom Server bestimmten Thema (00-chore/06).
    theme: { defaultTheme: colorTheme.resolved.value },
    // Eingebaute Vuetify-Texte (Tabellen, Paginierung, Labels) in der App-Sprache
    locale: { locale: i18n.locale.value, fallback: 'en', messages: { de, en } },
  })
  nuxtApp.vueApp.use(vuetify)

  watch(i18n.locale, (locale) => {
    vuetify.locale.current.value = locale
  })

  // Wahl oder Systemthema ändern sich → ohne Neuladen umschalten
  watch(colorTheme.resolved, name => vuetify.theme.change(name))

  if (import.meta.client) {
    // Erst nach der vollständigen Hydration messen (app:mounted wäre zu früh: Suspense-Inhalte
    // hydrieren danach noch). Korrigiert eine falsche Vermutung des Servers und folgt Änderungen.
    onNuxtReady(() => {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const measure = () => colorTheme.setSystem(media.matches ? 'dark' : 'light')
      measure()
      media.addEventListener('change', measure)
    })
  }
})

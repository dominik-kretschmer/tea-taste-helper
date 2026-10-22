import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { de, en } from 'vuetify/locale'

export default defineNuxtPlugin((nuxtApp) => {
  const i18n = nuxtApp.$i18n

  const vuetify = createVuetify({
    ssr: true,
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    // Hell/Dunkel folgt dem Betriebssystem
    theme: { defaultTheme: 'system' },
    // Eingebaute Vuetify-Texte (Tabellen, Paginierung, Labels) in der App-Sprache
    locale: { locale: i18n.locale.value, fallback: 'en', messages: { de, en } },
  })
  nuxtApp.vueApp.use(vuetify)

  watch(i18n.locale, (locale) => {
    vuetify.locale.current.value = locale
  })
})

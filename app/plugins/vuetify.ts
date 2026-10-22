import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'

export default defineNuxtPlugin((nuxtApp) => {
  const vuetify = createVuetify({
    ssr: true,
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    // Hell/Dunkel folgt dem Betriebssystem
    theme: { defaultTheme: 'system' },
  })
  nuxtApp.vueApp.use(vuetify)
})

import { fileURLToPath } from 'node:url'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint'],
  build: {
    transpile: ['vuetify'],
  },
  vite: {
    // Vuetify-Komponenten automatisch importieren
    plugins: [vuetify({ autoImport: true })],
    vue: {
      template: { transformAssetUrls },
    },
  },
  hooks: {
    // Eigener Error-Handler vor dem von Nuxt: übernimmt /api/**, alles andere geht an die Nuxt-Fehlerseite.
    'nitro:config'(config) {
      const nuxtHandlers = [config.errorHandler ?? []].flat()
      config.errorHandler = [fileURLToPath(new URL('./server/error.ts', import.meta.url)), ...nuxtHandlers]
    },
  },
})

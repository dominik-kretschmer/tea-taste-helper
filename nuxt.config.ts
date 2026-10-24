import { fileURLToPath } from 'node:url'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@nuxtjs/i18n', 'nuxt-security'],
  security: {
    nonce: true,
    headers: {
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'strict-dynamic'", "'nonce-{{nonce}}'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'", ...(process.env.NODE_ENV === 'production' ? [] : ['ws:'])],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'base-uri': ["'none'"],
        'object-src': ["'none'"],
        'script-src-attr': ["'none'"],
        'upgrade-insecure-requests': process.env.NODE_ENV === 'production',
      },
      xFrameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin',
      strictTransportSecurity: process.env.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubdomains: true }
        : false,
    },
    // Eigener Rate-Limiter (pro IP und pro E-Mail), siehe server/utils/rate-limit.ts
    rateLimiter: false,
    // Würde legitime Eingaben blockieren; Eingaben prüft zod, Vue escapt bei der Ausgabe
    xssValidator: false,
    csrf: {
      methodsToProtect: ['POST', 'PUT', 'PATCH', 'DELETE'],
    },
  },
  i18n: {
    // Deutsch ohne Präfix (/), Englisch unter /en
    strategy: 'prefix_except_default',
    defaultLocale: 'de',
    // Öffentliche Adresse für SEO-Links; in Production per NUXT_PUBLIC_I18N_BASE_URL setzen
    baseUrl: 'http://localhost:3000',
    locales: [
      { code: 'de', language: 'de-DE', file: 'de.json' },
      { code: 'en', language: 'en-US', file: 'en.json' },
    ],
    // Sprachabhängige Pfade zentral hier (Schlüssel = Routenname); Links immer über localePath({ name })
    customRoutes: 'config',
    pages: {
      'ingredients': { de: '/zutaten', en: '/ingredients' },
      'ingredients-new': { de: '/zutaten/neu', en: '/ingredients/new' },
      'ingredients-id': { de: '/zutaten/[id]', en: '/ingredients/[id]' },
      'ingredients-id-edit': { de: '/zutaten/[id]/bearbeiten', en: '/ingredients/[id]/edit' },
      'ingredients-id-history': { de: '/zutaten/[id]/historie', en: '/ingredients/[id]/history' },
      'teas': { de: '/tees', en: '/teas' },
      'teas-new': { de: '/tees/neu', en: '/teas/new' },
      'teas-id': { de: '/tees/[id]', en: '/teas/[id]' },
      'teas-id-edit': { de: '/tees/[id]/bearbeiten', en: '/teas/[id]/edit' },
      'teas-id-history': { de: '/tees/[id]/historie', en: '/teas/[id]/history' },
      'pantry': { de: '/vorrat', en: '/pantry' },
    },
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
    },
  },
  routeRules: {
    '/**': {
      headers: {
        // Chromium schickt das Systemthema mit; Critical-CH wiederholt den allerersten Request
        // einmal mit dem Hint, damit schon das Server-HTML dunkel sein kann (00-chore/06)
        'Accept-CH': 'Sec-CH-Prefers-Color-Scheme',
        'Critical-CH': 'Sec-CH-Prefers-Color-Scheme',
        'Vary': 'Sec-CH-Prefers-Color-Scheme',
      },
    },
  },
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

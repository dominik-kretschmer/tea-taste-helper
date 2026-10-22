// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: ['server/generated/**'],
  },
  {
    // API-Tests arbeiten mit losen JSON-Antworten
    files: ['test/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)

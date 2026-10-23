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
  {
    // zod nur über shared/schemas/zod.ts (setzt jitless, sonst CSP-Verstoß durch die eval-Probe, 00-chore/08)
    files: ['app/**', 'shared/**'],
    ignores: ['shared/schemas/zod.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [{ name: 'zod', message: "Im App- und Shared-Code aus '#shared/schemas/zod' importieren (00-chore/08).", allowTypeImports: true }],
      }],
    },
  },
)

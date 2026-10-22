import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: 'api',
          include: ['test/api/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/setup/global-api.ts'],
          setupFiles: ['test/setup/env.ts'],
          // Jede Testdatei baut die App einmal und startet einen eigenen Server. Mehr als zwei
          // parallele Builds sprengen 8 GB RAM (Exit 137).
          maxWorkers: 2,
          sequence: { groupOrder: 1 },
          testTimeout: 30_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
})

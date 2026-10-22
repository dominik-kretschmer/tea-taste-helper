import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('GET /api/health', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../..', import.meta.url)), server: true })

  it('meldet DB und Ollama als erreichbar', async () => {
    // Die erste DB-Verbindung eines frisch gestarteten Servers kann unter Last das 2-s-Timeout reißen.
    await expect.poll(async () => (await fetch('/api/health')).status, { timeout: 10_000, interval: 500 }).toBe(200)
    const response = await fetch('/api/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', db: 'ok', ollama: 'ok' })
  })
})

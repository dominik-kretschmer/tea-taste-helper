import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('GET /api/health', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../..', import.meta.url)), server: true })

  it('meldet DB und Ollama als erreichbar', async () => {
    const response = await fetch('/api/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', db: 'ok', ollama: 'ok' })
  })
})

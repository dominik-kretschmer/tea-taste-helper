import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('API-Fehler und Request-ID', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../..', import.meta.url)), server: true })

  it('unbekannte API-Route → 404 im einheitlichen Fehlerformat', async () => {
    const response = await fetch('/api/gibt-es-nicht')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = await response.json()
    expect(body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: expect.any(String),
        requestId: response.headers.get('x-request-id'),
      },
    })
  })

  it('setzt eine Request-ID als Header', async () => {
    const response = await fetch('/api/health')
    expect(response.headers.get('x-request-id')).toMatch(UUID)
  })

  it('übernimmt eine gültige eingehende Request-ID', async () => {
    const requestId = '11111111-2222-4333-8444-555555555555'
    const response = await fetch('/api/health', { headers: { 'X-Request-Id': requestId } })
    expect(response.headers.get('x-request-id')).toBe(requestId)
  })
})

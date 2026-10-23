import { randomUUID } from 'node:crypto'
import { getServerLogs, setup, startServer } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { createClient, PASSWORD, registerUser, rootDir, testServerEnv, uniqueEmail, type ApiResponse } from './helpers'

type LogLine = Record<string, unknown>

/** JSON-Logzeilen des Servers zu einer Request-ID; wartet kurz, weil Logs asynchron ankommen. */
async function linesFor(response: ApiResponse | Response): Promise<LogLine[]> {
  const requestId = response.headers.get('x-request-id')
  expect(requestId).toBeTruthy()
  await new Promise(resolve => setTimeout(resolve, 200))
  return getServerLogs()
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LogLine]
      }
      catch {
        return []
      }
    })
    .filter(line => line.requestId === requestId)
}

const requestLines = (lines: LogLine[]) => lines.filter(line => line.msg === 'request')

/** Genau eine Request-Zeile mit allen Feldern und dem erwarteten Status (AK-1.1, AK-1.3). */
async function expectOneRequestLine(response: ApiResponse, method: string, path: string) {
  const lines = requestLines(await linesFor(response))
  expect(lines).toHaveLength(1)
  expect(lines[0]).toMatchObject({ method, path, status: response.status, requestId: response.headers.get('x-request-id') })
  expect(lines[0]!.durationMs).toEqual(expect.any(Number))
}

describe('Request-Log für /api (00-chore/03)', async () => {
  // Die CI setzt LOG_LEVEL=warn; Request-Zeilen sind info
  await setup({ rootDir, server: true, env: { ...testServerEnv, LOG_LEVEL: 'info' } })

  describe('Erfolg: genau eine Zeile (AK-1.3)', () => {
    it('200', async () => {
      const client = await createClient()
      const response = await client.get('/api/health')
      expect(response.status).toBe(200)
      await expectOneRequestLine(response, 'GET', '/api/health')
    })

    it('201', async () => {
      const client = await createClient()
      const response = await client.post('/api/auth/register', { email: uniqueEmail('log'), displayName: 'Log', password: PASSWORD, remember: false })
      expect(response.status).toBe(201)
      await expectOneRequestLine(response, 'POST', '/api/auth/register')
    })
  })

  describe('Fehler 4xx: genau eine Zeile (AK-1.1)', () => {
    it('400 Validierung', async () => {
      const client = await createClient()
      const response = await client.post('/api/auth/register', { email: 'kein-mail', displayName: 'Log', password: PASSWORD })
      expect(response.status).toBe(400)
      await expectOneRequestLine(response, 'POST', '/api/auth/register')
    })

    it('401 Gast', async () => {
      const client = await createClient()
      const path = `/api/ingredients/${randomUUID()}`
      const response = await client.patch(path, { version: 1 })
      expect(response.status).toBe(401)
      await expectOneRequestLine(response, 'PATCH', path)
    })

    it('403 CSRF', async () => {
      const client = await createClient()
      client.csrfToken = ''
      const response = await client.post('/api/auth/login', { email: uniqueEmail('log'), password: PASSWORD })
      expect(response.status).toBe(403)
      await expectOneRequestLine(response, 'POST', '/api/auth/login')
    })

    it('404 unbekannte Route', async () => {
      const client = await createClient()
      const response = await client.get('/api/gibt-es-nicht')
      expect(response.status).toBe(404)
      await expectOneRequestLine(response, 'GET', '/api/gibt-es-nicht')
    })

    it('409 Duplikat', async () => {
      const { client } = await registerUser()
      const name = `Log-Zutat ${randomUUID().slice(0, 8)}`
      expect((await client.post('/api/ingredients', { locale: 'de', name })).status).toBe(201)
      const response = await client.post('/api/ingredients', { locale: 'de', name })
      expect(response.status).toBe(409)
      await expectOneRequestLine(response, 'POST', '/api/ingredients')
    })

    it('429 Rate-Limit', async () => {
      const { email } = await registerUser()
      const client = await createClient()
      for (let i = 0; i < 5; i++) {
        expect((await client.post('/api/auth/login', { email, password: 'falsch-falsch' })).status).toBe(401)
      }
      const response = await client.post('/api/auth/login', { email, password: 'falsch-falsch' })
      expect(response.status).toBe(429)
      await expectOneRequestLine(response, 'POST', '/api/auth/login')
    })
  })

  // Steht am Ende: ersetzt den Server dieser Datei durch einen ohne erreichbare DB
  describe('Fehler 500 (AK-1.2)', () => {
    it('Request-Zeile mit 500 und „unhandled error“ mit derselben Request-ID', async () => {
      const client = await createClient()
      await startServer({ env: { ...testServerEnv, LOG_LEVEL: 'info', DATABASE_URL: 'postgresql://x:x@127.0.0.1:1/x' } })
      const response = await client.get('/api/ingredients?locale=de')
      expect(response.status).toBe(500)
      const lines = await linesFor(response)
      const request = requestLines(lines)
      expect(request).toHaveLength(1)
      expect(request[0]).toMatchObject({ method: 'GET', path: '/api/ingredients?locale=de', status: 500 })
      expect(lines.filter(line => line.msg === 'unhandled error')).toHaveLength(1)
    })
  })
})

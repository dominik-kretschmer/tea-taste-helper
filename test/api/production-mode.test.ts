import { type ChildProcess, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { afterEach, describe, expect, it } from 'vitest'
import { PASSWORD, rootDir, uniqueEmail } from './helpers'

const CSRF_SECRET = 'production-mode-test-secret-32ch'

interface Started {
  process: ChildProcess
  baseUrl: string
  lines: string[]
  exited: Promise<number | null>
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  await new Promise(resolve => server.close(resolve))
  return port
}

let running: Started | undefined

/**
 * Startet den gebauten Server selbst: @nuxt/test-utils setzt NODE_ENV immer,
 * hier soll die Variable wirklich fehlen (00-chore/01, AK-1.5).
 */
async function startBuilt(extra: Record<string, string> = {}): Promise<Started> {
  const outputDir = useTestContext().nuxt!.options.nitro.output!.dir!
  const port = await freePort()
  const { NODE_ENV: _, ...inherited } = process.env
  const child = spawn('node', [join(outputDir, 'server/index.mjs')], {
    env: { ...inherited, PORT: String(port), HOST: '127.0.0.1', LOG_LEVEL: 'info', NUXT_CSURF_ENCRYPT_SECRET: CSRF_SECRET, ...extra },
  })
  const lines: string[] = []
  let buffer = ''
  const collect = (chunk: Buffer) => {
    buffer += chunk.toString()
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    lines.push(...parts.filter(Boolean))
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  const exited = new Promise<number | null>(resolve => child.on('exit', code => resolve(code)))
  running = { process: child, baseUrl: `http://127.0.0.1:${port}`, lines, exited }
  return running
}

async function waitForHealth(server: Started) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${server.baseUrl}/api/health`)).status < 500) return
    }
    catch {
      // Server lauscht noch nicht
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Server nicht erreichbar:\n${server.lines.join('\n')}`)
}

/** Registriert ein Konto wie ein Browser (CSRF-Token aus dem HTML, Cookies mitschicken). */
async function register(server: Started) {
  const page = await fetch(`${server.baseUrl}/`, { headers: { accept: 'text/html' } })
  const html = await page.text()
  const token = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1]
  if (!token) throw new Error('Kein CSRF-Token im HTML gefunden')
  const cookie = page.headers.getSetCookie().map(header => header.split(';')[0]).join('; ')
  return fetch(`${server.baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'csrf-token': token, cookie },
    body: JSON.stringify({ email: uniqueEmail('prodmode'), displayName: 'Prod-Test', password: PASSWORD, remember: false }),
  })
}

describe('Gebauter Server ohne NODE_ENV (00-chore/01)', async () => {
  await setup({ rootDir, server: false, build: true })

  afterEach(async () => {
    if (!running) return
    running.process.kill('SIGTERM')
    await running.exited
    running = undefined
  })

  it('setzt __Host-session mit Secure und schreibt JSON-Logs (AK-1.1, AK-1.3)', async () => {
    const server = await startBuilt()
    await waitForHealth(server)

    const response = await register(server)
    expect(response.status).toBe(201)
    const session = response.headers.getSetCookie().find(header => header.startsWith('__Host-session='))
    expect(session).toBeDefined()
    expect(session).toMatch(/;\s*Secure/i)
    expect(session).toMatch(/;\s*HttpOnly/i)
    expect(session).toMatch(/;\s*SameSite=Lax/i)
    expect(session).toMatch(/;\s*Path=\//i)

    // Logzeilen kommen asynchron
    await new Promise(resolve => setTimeout(resolve, 300))
    const logLines = server.lines.filter(line => !line.startsWith('Listening on'))
    const parsed = logLines.map(line => JSON.parse(line) as Record<string, unknown>)
    expect(parsed).toContainEqual(expect.objectContaining({ msg: 'request', path: '/api/auth/register', status: 201 }))
  })

  it('bricht ohne CSRF-Schlüssel ab und nennt die Variable (AK-1.2)', async () => {
    const server = await startBuilt({ NUXT_CSURF_ENCRYPT_SECRET: '' })
    expect(await server.exited).toBe(1)
    expect(server.lines.join('\n')).toContain('NUXT_CSURF_ENCRYPT_SECRET')
  })

  it('warnt, wenn NODE_ENV ausdrücklich development ist (AK-1.7)', async () => {
    const server = await startBuilt({ NODE_ENV: 'development' })
    await waitForHealth(server)
    expect(server.lines.join('\n')).toContain('built server running with NODE_ENV=development')
  })
})

import { randomInt, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { fetch } from '@nuxt/test-utils/e2e'
import pg from 'pg'

export const rootDir = fileURLToPath(new URL('../..', import.meta.url))

/** Testserver-Umgebung: X-Forwarded-For auswerten, damit jeder Client eine eigene IP hat (Rate-Limits). */
export const testServerEnv = { TRUST_PROXY: 'true' }

export const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`
export const uniqueEmail = (prefix = 'user') => `${prefix}-${randomUUID().slice(0, 8)}@test.local`
export const PASSWORD = 'richtig-geheim-123'

/** Die API-Tests laufen gegen den gebauten Server, der ohne NODE_ENV als production gilt (00-chore/01); @nuxt/test-utils setzt zusätzlich NODE_ENV=production. */
export const SESSION_COOKIE = '__Host-session'

export interface ApiResponse<T = any> {
  status: number
  headers: Headers
  body: T
  text: string
  setCookies: string[]
}

/**
 * HTTP-Client wie ein Browser: hält Cookies, holt das CSRF-Token aus dem <meta>-Tag der Startseite
 * und schickt es bei schreibenden Anfragen mit.
 */
export async function createClient(options: { ip?: string } = {}) {
  const ip = options.ip ?? randomIp()
  const cookies = new Map<string, string>()
  let csrfToken = ''

  const remember = (response: Response) => {
    for (const header of response.headers.getSetCookie()) {
      const [pair = '', ...attributes] = header.split(';')
      const index = pair.indexOf('=')
      const name = pair.slice(0, index).trim()
      const value = pair.slice(index + 1)
      const expired = attributes.some(a => /^\s*max-age=0\s*$/i.test(a)) || value === ''
      if (expired) cookies.delete(name)
      else cookies.set(name, value)
    }
  }

  async function request<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResponse<T>> {
    const response = await fetch(path, {
      method,
      redirect: 'manual',
      headers: {
        'x-forwarded-for': ip,
        'cookie': [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
        ...(method !== 'GET' && csrfToken ? { 'csrf-token': csrfToken } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    remember(response)
    const text = await response.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    }
    catch {
      json = undefined
    }
    return { status: response.status, headers: response.headers, body: json as T, text, setCookies: response.headers.getSetCookie() }
  }

  const page = await request('GET', '/', undefined, { accept: 'text/html' })
  csrfToken = page.text.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1] ?? ''
  if (!csrfToken) throw new Error('Kein CSRF-Token im HTML gefunden')

  return {
    ip,
    cookies,
    get csrfToken() {
      return csrfToken
    },
    set csrfToken(value: string) {
      csrfToken = value
    },
    request,
    get: <T = any>(path: string) => request<T>('GET', path),
    post: <T = any>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
    patch: <T = any>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  }
}

export type TestClient = Awaited<ReturnType<typeof createClient>>

/** Registriert einen neuen Nutzer und liefert den angemeldeten Client. */
export async function registerUser(options: { email?: string, displayName?: string, password?: string, remember?: boolean } = {}) {
  const client = await createClient()
  const email = options.email ?? uniqueEmail()
  const response = await client.post('/api/auth/register', {
    email,
    displayName: options.displayName ?? 'Testnutzer',
    password: options.password ?? PASSWORD,
    remember: options.remember ?? false,
  })
  if (response.status !== 201) throw new Error(`Registrierung fehlgeschlagen: ${response.status} ${response.text}`)
  return { client, email, user: response.body.user as PublicUser }
}

/** Neuer Client, der sich mit vorhandenen Zugangsdaten anmeldet. */
export async function loginAs(email: string, password = PASSWORD, remember = false) {
  const client = await createClient()
  const response = await client.post('/api/auth/login', { email, password, remember })
  return { client, response }
}

/** Direkter Zugriff auf die Test-DB (DATABASE_URL zeigt per test/setup/env.ts auf tea_test). */
export async function db<T extends pg.QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    return (await client.query<T>(sql, params)).rows
  }
  finally {
    await client.end()
  }
}

export const findCookie = (setCookies: string[], name: string) => setCookies.find(c => c.startsWith(`${name}=`))

/** Legt eine Zutat direkt in der DB an (Version 1, ohne Autor); schont das Rate-Limit der Testnutzer. */
export async function insertIngredient(name: string, options: { caffeine?: 'yes' | 'no' | 'unknown', locale?: string } = {}): Promise<string> {
  const [{ id }] = await db<{ id: string }>(
    `WITH i AS (INSERT INTO "Ingredient" (id, "sourceLocale") VALUES (gen_random_uuid(), $1::text) RETURNING id),
          v AS (INSERT INTO "IngredientVersion" (id, "ingredientId", version, "isCurrent", caffeine)
                SELECT gen_random_uuid(), id, 1, true, $3::"Caffeine" FROM i RETURNING id, "ingredientId")
     INSERT INTO "IngredientVersionTranslation" ("versionId", locale, name, "nameKey")
     SELECT id, $1::text, $2::text, lower($2::text) FROM v RETURNING (SELECT "ingredientId" FROM v) AS id`,
    [options.locale ?? 'de', name, options.caffeine ?? 'unknown'],
  )
  return id
}

/** Setzt die Rolle direkt in der DB; sie gilt ab der nächsten Anfrage. */
export async function setRole(userId: string, role: 'user' | 'moderator' | 'admin'): Promise<void> {
  await db(`UPDATE "User" SET role = $2::"Role" WHERE id = $1`, [userId, role])
}

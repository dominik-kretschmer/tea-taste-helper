import { z } from 'zod'

// Leere Werte (z.B. `DATABASE_URL=`) gelten als nicht gesetzt.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(value => (value === '' ? undefined : value), schema)

// Der Standard für NODE_ENV hängt am Build-Typ: nur `nuxt dev` ist development, ein gebauter
// Server ohne NODE_ENV läuft als production (00-chore/01). Ein gesetzter Wert gilt immer.
const createEnvSchema = (dev: boolean) => z.object({
  DATABASE_URL: optional(z.url({ protocol: /^postgres(ql)?$/ })),
  OLLAMA_URL: optional(z.url().default('http://localhost:11434')),
  LOG_LEVEL: optional(z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')),
  NODE_ENV: optional(z.enum(['development', 'production', 'test']).default(dev ? 'development' : 'production')),
  // Wird bei Registrierung bzw. Serverstart automatisch Admin (02, AK-4.1/4.2)
  ADMIN_EMAIL: optional(z.email().transform(email => email.toLowerCase()).optional()),
  // X-Forwarded-For nur hinter einem vertrauenswürdigen Reverse Proxy auswerten
  TRUST_PROXY: optional(z.enum(['true', 'false']).default('false').transform(value => value === 'true')),
  // AES-256-Schlüssel für CSRF-Tokens (nuxt-csurf liest ihn als runtimeConfig.csurf.encryptSecret)
  NUXT_CSURF_ENCRYPT_SECRET: optional(z.string().length(32, 'muss genau 32 Zeichen lang sein (openssl rand -base64 24)').optional()),
}).superRefine((env, ctx) => {
  // Ohne festen Schlüssel erzeugt nuxt-csurf ihn beim Build und schreibt ihn in die Build-Artefakte.
  if (env.NODE_ENV === 'production' && !env.NUXT_CSURF_ENCRYPT_SECRET) {
    ctx.addIssue({ code: 'custom', path: ['NUXT_CSURF_ENCRYPT_SECRET'], message: 'ist in Production Pflicht' })
  }
})

export type Env = z.infer<ReturnType<typeof createEnvSchema>>

export interface ParseEnvOptions {
  /** true nur unter `nuxt dev`; bestimmt den Standard für NODE_ENV */
  dev?: boolean
}

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Ungültige Umgebung:\n${issues.map(issue => `  - ${issue}`).join('\n')}`)
    this.name = 'EnvError'
  }
}

/**
 * Prüft die Umgebungsvariablen; wirft einen EnvError, der jede fehlerhafte Variable beim Namen nennt.
 * Ohne `dev` gilt der sichere Standard (production).
 */
export function parseEnv(source: Record<string, string | undefined>, { dev = false }: ParseEnvOptions = {}): Env {
  const result = createEnvSchema(dev).safeParse(source)
  if (!result.success) {
    throw new EnvError(result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`))
  }
  return result.data
}

let cached: Env | undefined

/** Geprüfte Umgebung des laufenden Prozesses, wird nur einmal geparst. */
export function useEnv(): Env {
  cached ??= parseEnv(process.env, { dev: import.meta.dev })
  return cached
}

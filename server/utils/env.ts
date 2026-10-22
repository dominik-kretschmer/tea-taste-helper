import { z } from 'zod'

// Leere Werte (z.B. `DATABASE_URL=`) gelten als nicht gesetzt.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(value => (value === '' ? undefined : value), schema)

export const envSchema = z.object({
  DATABASE_URL: optional(z.url({ protocol: /^postgres(ql)?$/ })),
  OLLAMA_URL: optional(z.url().default('http://localhost:11434')),
  LOG_LEVEL: optional(z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')),
  NODE_ENV: optional(z.enum(['development', 'production', 'test']).default('development')),
})

export type Env = z.infer<typeof envSchema>

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Ungültige Umgebung:\n${issues.map(issue => `  - ${issue}`).join('\n')}`)
    this.name = 'EnvError'
  }
}

/** Prüft die Umgebungsvariablen; wirft einen EnvError, der jede fehlerhafte Variable beim Namen nennt. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    throw new EnvError(result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`))
  }
  return result.data
}

let cached: Env | undefined

/** Geprüfte Umgebung des laufenden Prozesses, wird nur einmal geparst. */
export function useEnv(): Env {
  cached ??= parseEnv(process.env)
  return cached
}

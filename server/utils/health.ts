export type ServiceStatus = 'ok' | 'error'

export interface HealthBody {
  status: ServiceStatus
  db: ServiceStatus
  ollama: ServiceStatus
}

export type HealthCheck = () => Promise<unknown>

export const HEALTH_TIMEOUT_MS = 2000

function withTimeout(check: HealthCheck, ms: number): Promise<unknown> {
  return Promise.race([
    check(),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms} ms`)), ms).unref()),
  ])
}

/** Führt die Prüfungen parallel aus; 503, sobald ein Dienst nicht erreichbar ist (AK-6.1, AK-6.2). */
export async function checkHealth(
  checks: { db: HealthCheck, ollama: HealthCheck },
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<{ status: 200 | 503, body: HealthBody, errors: Partial<Record<'db' | 'ollama', unknown>> }> {
  const [db, ollama] = await Promise.allSettled([
    withTimeout(checks.db, timeoutMs),
    withTimeout(checks.ollama, timeoutMs),
  ])

  const body: HealthBody = {
    status: db.status === 'fulfilled' && ollama.status === 'fulfilled' ? 'ok' : 'error',
    db: db.status === 'fulfilled' ? 'ok' : 'error',
    ollama: ollama.status === 'fulfilled' ? 'ok' : 'error',
  }
  const errors = {
    ...(db.status === 'rejected' ? { db: db.reason } : {}),
    ...(ollama.status === 'rejected' ? { ollama: ollama.reason } : {}),
  }
  return { status: body.status === 'ok' ? 200 : 503, body, errors }
}

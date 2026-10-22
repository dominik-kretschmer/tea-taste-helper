import type { H3Event } from 'h3'

// Schlüssel, die nie im Audit-Log landen dürfen (AK-11.2) – auch verschachtelt.
const SENSITIVE_KEY = /pass|token|hash|session|secret|cookie|authorization/i

/** Entfernt sensible Schlüssel rekursiv aus `details`. */
export function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(clean)
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !SENSITIVE_KEY.test(key))
          .map(([key, inner]) => [key, clean(inner)]),
      )
    }
    return value
  }
  return clean(details) as Record<string, unknown>
}

export interface AuditInput {
  event: AuditEventType
  actorId?: string | null
  targetId?: string | null
  details?: Record<string, unknown>
}

/**
 * Schreibt einen Audit-Eintrag mit IP und Request-ID der Anfrage (AK-11.1).
 * Ein Fehler beim Schreiben wird geloggt, bricht die eigentliche Aktion aber nicht ab.
 */
export async function audit(event: H3Event | null, input: AuditInput): Promise<void> {
  try {
    await usePrisma().auditLog.create({
      data: {
        event: input.event,
        actorId: input.actorId ?? null,
        targetId: input.targetId ?? null,
        ip: event ? getClientIp(event) : null,
        requestId: event?.context.requestId ?? null,
        details: input.details ? (sanitizeDetails(input.details) as object) : undefined,
      },
    })
  }
  catch (err) {
    const log = event?.context.log ?? useLogger()
    log.error({ err, auditEvent: input.event }, 'audit log write failed')
  }
}

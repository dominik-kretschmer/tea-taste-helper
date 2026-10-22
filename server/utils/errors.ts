import { isError } from 'h3'
import { z } from 'zod'

/** Erwarteter Fehler mit eigenem Status und maschinenlesbarem Code. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export interface ErrorBody {
  error: { code: string, message: string, requestId: string, details?: unknown }
}

// h3 verpackt geworfene Fehler in einen H3Error; der eigentliche Fehler steckt in `cause` bzw. bei
// readValidatedBody & Co. in `data`.
function unwrap(error: unknown): unknown {
  if (!isError(error)) return error
  for (const inner of [error.data, error.cause]) {
    if (inner instanceof z.ZodError || inner instanceof AppError) return inner
  }
  return error
}

/** Bildet einen beliebigen Fehler auf das einheitliche API-Fehlerformat ab (AK-5.1–5.3). */
export function toErrorResponse(error: unknown, requestId: string): { status: number, body: ErrorBody } {
  const build = (status: number, code: string, message: string, details?: unknown) => ({
    status,
    body: { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } },
  })

  const inner = unwrap(error)

  if (inner instanceof z.ZodError) {
    return build(400, 'VALIDATION_ERROR', 'Invalid input', z.flattenError(inner).fieldErrors)
  }
  if (inner instanceof AppError) {
    return build(inner.status, inner.code, inner.message, inner.details)
  }
  if (isError(inner) && inner.statusCode < 500) {
    const message = inner.statusMessage || inner.message
    // nuxt-csurf wirft einen H3-Fehler mit genau dieser statusMessage
    if (inner.statusCode === 403 && inner.statusMessage === 'CSRF Token Mismatch') {
      return build(403, 'CSRF_INVALID', 'Invalid or missing CSRF token')
    }
    const known: Record<number, string> = { 404: 'NOT_FOUND', 429: 'RATE_LIMITED' }
    return build(inner.statusCode, known[inner.statusCode] ?? `HTTP_${inner.statusCode}`, message || 'Error')
  }
  return build(500, 'INTERNAL_ERROR', 'Internal server error')
}

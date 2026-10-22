import { createError } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppError, toErrorResponse } from '../../server/utils/errors'

const requestId = 'req-1'

function zodError() {
  const result = z.object({ name: z.string().min(1) }).safeParse({ name: '' })
  if (result.success) throw new Error('erwartet ungültige Eingabe')
  return result.error
}

describe('toErrorResponse', () => {
  it('ZodError → 400 VALIDATION_ERROR mit betroffenen Feldern', () => {
    const { status, body } = toErrorResponse(zodError(), requestId)
    expect(status).toBe(400)
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR', requestId })
    expect(body.error.details).toHaveProperty('name')
  })

  it('erkennt ZodError auch in einem H3Error (readValidatedBody)', () => {
    const wrapped = createError({ statusCode: 400, statusMessage: 'Validation Error', data: zodError() })
    expect(toErrorResponse(wrapped, requestId).body.error.code).toBe('VALIDATION_ERROR')
  })

  it('AppError → eigener Status, Code und Details', () => {
    const error = new AppError(409, 'CONFLICT', 'Gibt es schon', { id: 1 })
    expect(toErrorResponse(error, requestId)).toEqual({
      status: 409,
      body: { error: { code: 'CONFLICT', message: 'Gibt es schon', requestId, details: { id: 1 } } },
    })
  })

  it('erkennt AppError auch in einem H3Error (geworfen im Handler)', () => {
    const wrapped = createError(new AppError(404, 'NOT_FOUND', 'weg'))
    expect(toErrorResponse(wrapped, requestId)).toMatchObject({ status: 404, body: { error: { code: 'NOT_FOUND' } } })
  })

  it('H3-404 → NOT_FOUND, andere 4xx → HTTP_<status>', () => {
    expect(toErrorResponse(createError({ statusCode: 404 }), requestId).body.error.code).toBe('NOT_FOUND')
    expect(toErrorResponse(createError({ statusCode: 405, statusMessage: 'Method Not Allowed' }), requestId))
      .toMatchObject({ status: 405, body: { error: { code: 'HTTP_405', message: 'Method Not Allowed' } } })
  })

  it('unbekannter Fehler → 500 INTERNAL_ERROR ohne interne Details', () => {
    const { status, body } = toErrorResponse(new Error('DB-Passwort falsch: geheim'), requestId)
    expect(status).toBe(500)
    expect(body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId } })
    expect(JSON.stringify(body)).not.toMatch(/geheim|stack|at /)
  })
})

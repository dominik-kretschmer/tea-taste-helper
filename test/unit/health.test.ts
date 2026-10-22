import { describe, expect, it } from 'vitest'
import { checkHealth } from '../../server/utils/health'

const ok = async () => {}
const fail = async () => {
  throw new Error('down')
}
const hang = () => new Promise(() => {})

describe('checkHealth', () => {
  it('200, wenn alle Dienste erreichbar sind', async () => {
    const result = await checkHealth({ db: ok, ollama: ok })
    expect(result).toMatchObject({ status: 200, body: { status: 'ok', db: 'ok', ollama: 'ok' }, errors: {} })
  })

  it('503 mit db: error, wenn die Datenbank fehlt', async () => {
    const result = await checkHealth({ db: fail, ollama: ok })
    expect(result.status).toBe(503)
    expect(result.body).toEqual({ status: 'error', db: 'error', ollama: 'ok' })
    expect(result.errors.db).toBeInstanceOf(Error)
  })

  it('503 mit ollama: error, wenn Ollama fehlt', async () => {
    const result = await checkHealth({ db: ok, ollama: fail })
    expect(result.status).toBe(503)
    expect(result.body).toEqual({ status: 'error', db: 'ok', ollama: 'error' })
  })

  it('wertet eine hängende Prüfung nach dem Timeout als Fehler', async () => {
    const result = await checkHealth({ db: ok, ollama: hang }, 20)
    expect(result.body.ollama).toBe('error')
    expect(String(result.errors.ollama)).toMatch(/timeout/)
  })
})

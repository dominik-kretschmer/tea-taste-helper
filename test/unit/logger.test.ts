import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createLogger } from '../../server/utils/logger'

function capture(level = 'info') {
  const lines: Record<string, unknown>[] = []
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()))
      callback()
    },
  })
  return { logger: createLogger({ level, destination }), lines }
}

describe('createLogger', () => {
  it('schreibt JSON mit den übergebenen Feldern', () => {
    const { logger, lines } = capture()
    logger.child({ requestId: 'abc' }).info({ path: '/api/health' }, 'request')
    expect(lines[0]).toMatchObject({ requestId: 'abc', path: '/api/health', msg: 'request' })
  })

  it.each(['password', 'token', 'authorization', 'cookie'])('schwärzt %s auf jeder Ebene', (key) => {
    const { logger, lines } = capture()
    logger.info({ [key]: 'geheim', body: { [key]: 'geheim' }, req: { headers: { [key]: 'geheim' } } })
    const output = JSON.stringify(lines[0])
    expect(output).not.toContain('geheim')
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(3)
  })

  it('beachtet das Log-Level', () => {
    const { logger, lines } = capture('warn')
    logger.info('nicht sichtbar')
    logger.warn('sichtbar')
    expect(lines.map(line => line.msg)).toEqual(['sichtbar'])
  })
})

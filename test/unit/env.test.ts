import { describe, expect, it } from 'vitest'
import { EnvError, parseEnv } from '../../server/utils/env'

const valid = {
  DATABASE_URL: 'postgresql://tea:secret@localhost:5432/tea',
  OLLAMA_URL: 'http://localhost:11434',
  LOG_LEVEL: 'debug',
  NODE_ENV: 'test',
}

describe('parseEnv', () => {
  it('akzeptiert eine gültige Umgebung', () => {
    expect(parseEnv(valid)).toEqual(valid)
  })

  it('setzt Standardwerte für optionale Variablen', () => {
    const env = parseEnv({ DATABASE_URL: valid.DATABASE_URL, OLLAMA_URL: '' })
    expect(env.OLLAMA_URL).toBe('http://localhost:11434')
    expect(env.LOG_LEVEL).toBe('info')
    expect(env.NODE_ENV).toBe('development')
  })

  it.each([
    ['fehlt', { ...valid, DATABASE_URL: undefined }],
    ['leer', { ...valid, DATABASE_URL: '' }],
    ['kein Postgres', { ...valid, DATABASE_URL: 'mysql://localhost/tea' }],
  ])('nennt DATABASE_URL, wenn sie %s', (_, source) => {
    expect(() => parseEnv(source)).toThrow(/DATABASE_URL/)
  })

  it('nennt LOG_LEVEL bei ungültigem Wert', () => {
    expect(() => parseEnv({ ...valid, LOG_LEVEL: 'foo' })).toThrow(/LOG_LEVEL/)
  })

  it('listet alle fehlerhaften Variablen auf einmal', () => {
    try {
      parseEnv({ LOG_LEVEL: 'foo', OLLAMA_URL: 'kein-url' })
      expect.unreachable()
    }
    catch (error) {
      expect(error).toBeInstanceOf(EnvError)
      const names = (error as EnvError).issues.map(issue => issue.split(':')[0])
      expect(names).toEqual(expect.arrayContaining(['DATABASE_URL', 'LOG_LEVEL', 'OLLAMA_URL']))
    }
  })
})

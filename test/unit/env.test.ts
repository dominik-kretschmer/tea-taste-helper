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
    expect(parseEnv(valid)).toEqual({ ...valid, TRUST_PROXY: false })
  })

  it('normalisiert ADMIN_EMAIL und TRUST_PROXY', () => {
    const env = parseEnv({ ...valid, ADMIN_EMAIL: 'Chef@Example.ORG', TRUST_PROXY: 'true' })
    expect(env.ADMIN_EMAIL).toBe('chef@example.org')
    expect(env.TRUST_PROXY).toBe(true)
  })

  it('nennt ADMIN_EMAIL und TRUST_PROXY bei ungültigen Werten', () => {
    expect(() => parseEnv({ ...valid, ADMIN_EMAIL: 'kein-mail' })).toThrow(/ADMIN_EMAIL/)
    expect(() => parseEnv({ ...valid, TRUST_PROXY: 'ja' })).toThrow(/TRUST_PROXY/)
  })

  it('verlangt in Production einen CSRF-Schlüssel mit 32 Zeichen', () => {
    const production = { ...valid, NODE_ENV: 'production' }
    expect(() => parseEnv(production)).toThrow(/NUXT_CSURF_ENCRYPT_SECRET/)
    expect(() => parseEnv({ ...production, NUXT_CSURF_ENCRYPT_SECRET: 'zu-kurz' })).toThrow(/32 Zeichen/)
    expect(parseEnv({ ...production, NUXT_CSURF_ENCRYPT_SECRET: 'a'.repeat(32) }).NUXT_CSURF_ENCRYPT_SECRET).toHaveLength(32)
  })

  it('setzt Standardwerte für optionale Variablen', () => {
    const env = parseEnv({ DATABASE_URL: valid.DATABASE_URL, OLLAMA_URL: '' }, { dev: true })
    expect(env.OLLAMA_URL).toBe('http://localhost:11434')
    expect(env.LOG_LEVEL).toBe('info')
    expect(env.NODE_ENV).toBe('development')
  })

  describe('NODE_ENV-Standard (00-chore/01)', () => {
    const minimal = { DATABASE_URL: valid.DATABASE_URL }

    it('ist im gebauten Server production und verlangt dann den CSRF-Schlüssel', () => {
      expect(() => parseEnv(minimal)).toThrow(/NUXT_CSURF_ENCRYPT_SECRET/)
      expect(() => parseEnv({ ...minimal, NODE_ENV: '' })).toThrow(/NUXT_CSURF_ENCRYPT_SECRET/)
      expect(parseEnv({ ...minimal, NUXT_CSURF_ENCRYPT_SECRET: 'a'.repeat(32) }).NODE_ENV).toBe('production')
    })

    it('ist unter nuxt dev development, ohne CSRF-Pflicht', () => {
      expect(parseEnv(minimal, { dev: true }).NODE_ENV).toBe('development')
    })

    it('übernimmt einen ausdrücklich gesetzten Wert', () => {
      expect(parseEnv({ ...minimal, NODE_ENV: 'development' }).NODE_ENV).toBe('development')
      expect(parseEnv({ ...minimal, NODE_ENV: 'test' }).NODE_ENV).toBe('test')
    })
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
      parseEnv({ LOG_LEVEL: 'foo', OLLAMA_URL: 'kein-url' }, { dev: true })
      expect.unreachable()
    }
    catch (error) {
      expect(error).toBeInstanceOf(EnvError)
      const names = (error as EnvError).issues.map(issue => issue.split(':')[0])
      expect(names).toEqual(expect.arrayContaining(['DATABASE_URL', 'LOG_LEVEL', 'OLLAMA_URL']))
    }
  })
})

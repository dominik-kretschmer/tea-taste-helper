import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pickClientIp } from '../../server/utils/client-ip'
import { check, consume, reset, resetAllRateLimits } from '../../server/utils/rate-limit'

const MIN = 60_000

describe('Rate-Limiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
    resetAllRateLimits()
  })
  afterEach(() => vi.useRealTimers())

  it('erlaubt genau `limit` Versuche im Fenster', () => {
    const results = Array.from({ length: 6 }, () => consume('login:ip:1.2.3.4', 5, 15 * MIN))
    expect(results.map(r => r.ok)).toEqual([true, true, true, true, true, false])
  })

  it('meldet die Restzeit des Fensters als Retry-After', () => {
    for (let i = 0; i < 3; i++) consume('k', 2, 15 * MIN)
    vi.advanceTimersByTime(5 * MIN)
    expect(consume('k', 2, 15 * MIN)).toEqual({ ok: false, retryAfterSec: 10 * 60 })
  })

  it('beginnt nach Ablauf des Fensters neu', () => {
    for (let i = 0; i < 3; i++) consume('k', 2, 15 * MIN)
    vi.advanceTimersByTime(15 * MIN)
    expect(consume('k', 2, 15 * MIN).ok).toBe(true)
  })

  it('check zählt nicht mit und sperrt ab ausgeschöpftem Limit', () => {
    expect(check('mail', 2).ok).toBe(true)
    consume('mail', 2, MIN)
    expect(check('mail', 2).ok).toBe(true)
    consume('mail', 2, MIN)
    expect(check('mail', 2)).toMatchObject({ ok: false })
    expect(check('mail', 2)).toMatchObject({ ok: false })
  })

  it('reset setzt den Zähler zurück (erfolgreicher Login, AK-8.3)', () => {
    for (let i = 0; i < 5; i++) consume('mail', 5, MIN)
    reset('mail')
    expect(check('mail', 5).ok).toBe(true)
  })

  it('trennt Schlüssel voneinander', () => {
    for (let i = 0; i < 3; i++) consume('a', 2, MIN)
    expect(consume('b', 2, MIN).ok).toBe(true)
  })
})

describe('pickClientIp', () => {
  it('ignoriert X-Forwarded-For ohne TRUST_PROXY', () => {
    expect(pickClientIp('9.9.9.9', '1.2.3.4', false)).toBe('1.2.3.4')
  })

  it('nimmt mit TRUST_PROXY den letzten Eintrag aus X-Forwarded-For (vom Proxy angehängt)', () => {
    expect(pickClientIp('9.9.9.9', '1.2.3.4', true)).toBe('9.9.9.9')
    // Der Client schickt selbst „6.6.6.6“ mit, der Proxy hängt die echte Adresse an
    expect(pickClientIp('6.6.6.6, 9.9.9.9 ', '1.2.3.4', true)).toBe('9.9.9.9')
  })

  it('fällt ohne Header bzw. Socket-Adresse zurück', () => {
    expect(pickClientIp(undefined, '1.2.3.4', true)).toBe('1.2.3.4')
    expect(pickClientIp(undefined, undefined, false)).toBe('unknown')
  })
})

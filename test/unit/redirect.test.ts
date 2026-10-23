import { describe, expect, it } from 'vitest'
import { redirectQuery, safeRedirect } from '../../app/utils/redirect'

describe('safeRedirect', () => {
  it.each(['/zutaten/neu', '/en/ingredients/new?x=1', '/'])('lässt internen Pfad %s durch', (target) => {
    expect(safeRedirect(target, '/home')).toBe(target)
  })

  it.each([
    ['protokollrelativ', '//evil.example'],
    ['Backslash', '/\\evil.example'],
    ['absolute URL', 'https://evil.example'],
    ['relativer Pfad', 'evil'],
    ['leer', ''],
    ['fehlt', undefined],
    ['Array (doppelter Query-Parameter)', ['/a']],
  ])('nimmt bei %s den Fallback', (_, target) => {
    expect(safeRedirect(target, '/home')).toBe('/home')
  })
})

describe('redirectQuery', () => {
  it('gibt ein sicheres Ziel weiter', () => {
    expect(redirectQuery('/zutaten/neu')).toEqual({ redirect: '/zutaten/neu' })
  })

  it.each([['//evil'], ['/\\evil'], [undefined]])('lässt %s weg', (target) => {
    expect(redirectQuery(target)).toEqual({})
  })
})

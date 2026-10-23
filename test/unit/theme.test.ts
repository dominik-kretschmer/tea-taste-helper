import { describe, expect, it } from 'vitest'
import { parseColorSchemeHint, resolveTheme, toPreference, toThemeName } from '../../app/utils/theme'

describe('toPreference', () => {
  it.each(['light', 'dark', 'system'])('übernimmt %s', (value) => {
    expect(toPreference(value)).toBe(value)
  })

  it.each([undefined, null, '', 'DARK', 'blau', 1])('macht aus %j „system“', (value) => {
    expect(toPreference(value)).toBe('system')
  })
})

describe('toThemeName', () => {
  it('kennt nur light und dark', () => {
    expect(toThemeName('dark')).toBe('dark')
    expect(toThemeName('light')).toBe('light')
    expect(toThemeName('system')).toBeUndefined()
    expect(toThemeName(undefined)).toBeUndefined()
  })
})

describe('parseColorSchemeHint', () => {
  it.each([
    ['"dark"', 'dark'],
    ['"light"', 'light'],
    [' "dark" ', 'dark'],
  ])('%j → %s', (header, expected) => {
    expect(parseColorSchemeHint(header)).toBe(expected)
  })

  it.each([undefined, '', 'dark', '"blue"', '"dark", "light"'])('%j → undefined', (header) => {
    expect(parseColorSchemeHint(header)).toBeUndefined()
  })
})

describe('resolveTheme', () => {
  it.each([
    ['light', undefined, 'light'],
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
    ['system', 'dark', 'dark'],
    ['system', 'light', 'light'],
    ['system', undefined, 'light'],
  ] as const)('%s + System %s → %s', (preference, system, expected) => {
    expect(resolveTheme(preference, system)).toBe(expected)
  })
})

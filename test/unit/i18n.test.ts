import { describe, expect, it } from 'vitest'
import de from '../../i18n/locales/de.json'
import en from '../../i18n/locales/en.json'

function keys(messages: object, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
}

describe('Sprachdateien', () => {
  it('de.json und en.json haben dieselben Schlüssel', () => {
    expect(keys(en).sort()).toEqual(keys(de).sort())
  })

  it('enthalten keine leeren Texte', () => {
    for (const messages of [de, en]) {
      const empty = keys(messages).filter(key =>
        key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages) === '')
      expect(empty).toEqual([])
    }
  })
})

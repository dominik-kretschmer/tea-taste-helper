import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error – reines JS-Skript ohne Typdeklaration
import { generate, OUTPUT } from '../../scripts/datenmodell.mjs'

describe('docs/datenmodell.md', () => {
  it('ist aus dem aktuellen Prisma-Schema erzeugt (sonst: npm run db:erd)', () => {
    expect(readFileSync(OUTPUT, 'utf8')).toBe(generate())
  })
})

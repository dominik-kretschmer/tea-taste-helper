import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { blockSchema, bulkRevertSchema, hideSchema, reportSchema } from '../../shared/schemas/moderation'
import { revertSchema } from '../../shared/schemas/catalog'
import { blockedUntil, combineIngredients, isBlocked } from '../../shared/utils/moderation'

const entityId = randomUUID()
const base = { entityType: 'ingredient', entityId } as const

describe('reportSchema', () => {
  it('nimmt einen einfachen Grund ohne Kommentar an', () => {
    expect(reportSchema.parse({ ...base, reason: 'spam' })).toEqual({ ...base, reason: 'spam', comment: null, duplicateOfId: null })
  })

  it('verlangt bei „Sonstiges“ einen Kommentar', () => {
    const result = reportSchema.safeParse({ ...base, reason: 'other', comment: '   ' })
    expect(result.error?.issues).toEqual([expect.objectContaining({ path: ['comment'], message: 'required' })])
    expect(reportSchema.safeParse({ ...base, reason: 'other', comment: 'Name falsch geschrieben' }).success).toBe(true)
  })

  it('verlangt bei „Duplikat“ das Original und verwirft es bei anderen Gründen', () => {
    const original = randomUUID()
    expect(reportSchema.safeParse({ ...base, reason: 'duplicate' }).error?.issues)
      .toEqual([expect.objectContaining({ path: ['duplicateOfId'], message: 'required' })])
    expect(reportSchema.parse({ ...base, reason: 'duplicate', duplicateOfId: original }).duplicateOfId).toBe(original)
    expect(reportSchema.parse({ ...base, reason: 'spam', duplicateOfId: original }).duplicateOfId).toBeNull()
  })

  it.each([[500, true], [501, false]])('Kommentar mit %i Zeichen → gültig: %s', (length, ok) => {
    expect(reportSchema.safeParse({ ...base, reason: 'wrong_info', comment: 'x'.repeat(length) }).success).toBe(ok)
  })

  it('lehnt unbekannte Gründe und Arten ab', () => {
    expect(reportSchema.safeParse({ ...base, reason: 'boring' }).success).toBe(false)
    expect(reportSchema.safeParse({ ...base, entityType: 'user', reason: 'spam' }).success).toBe(false)
  })
})

describe('hideSchema, blockSchema', () => {
  it('verlangt einen Grund', () => {
    expect(hideSchema.safeParse({ reason: '  ' }).success).toBe(false)
    expect(hideSchema.parse({ reason: ' Spam ' })).toEqual({ reason: 'Spam' })
    expect(blockSchema.safeParse({ duration: '7d', reason: '' }).success).toBe(false)
  })

  it('kennt nur die festen Dauern', () => {
    for (const duration of ['24h', '7d', '30d', 'permanent']) expect(blockSchema.safeParse({ duration, reason: 'x' }).success).toBe(true)
    expect(blockSchema.safeParse({ duration: '1y', reason: 'x' }).success).toBe(false)
  })
})

describe('revertSchema, bulkRevertSchema', () => {
  it('verlangt erwartete und Zielversion', () => {
    expect(revertSchema.parse({ version: 3, to: 1 })).toEqual({ version: 3, to: 1, note: null })
    expect(revertSchema.safeParse({ version: 3 }).success).toBe(false)
    expect(revertSchema.safeParse({ version: 3, to: 0 }).success).toBe(false)
  })

  it('wandelt das Datum um und lehnt die Zukunft ab', () => {
    expect(bulkRevertSchema.parse({ since: '2026-10-01T00:00:00Z' }).since).toEqual(new Date('2026-10-01T00:00:00Z'))
    expect(bulkRevertSchema.safeParse({ since: new Date(Date.now() + 60_000).toISOString() }).success).toBe(false)
    expect(bulkRevertSchema.safeParse({ since: 'gestern' }).success).toBe(false)
  })
})

describe('blockedUntil, isBlocked', () => {
  const now = new Date('2026-10-23T12:00:00Z')

  it.each([
    ['24h', '2026-10-24T12:00:00.000Z'],
    ['7d', '2026-10-30T12:00:00.000Z'],
    ['30d', '2026-11-22T12:00:00.000Z'],
  ] as const)('%s → %s', (duration, expected) => {
    expect(blockedUntil(duration, now)?.toISOString()).toBe(expected)
  })

  it('unbefristet → null', () => {
    expect(blockedUntil('permanent', now)).toBeNull()
  })

  it.each([
    ['nie gesperrt', null, null, false],
    ['unbefristet', now, null, true],
    ['läuft noch', now, new Date(now.getTime() + 1000), true],
    ['abgelaufen', now, new Date(now.getTime() - 1000), false],
  ] as const)('%s → %s', (_label, blockedAt, until, expected) => {
    expect(isBlocked({ blockedAt, blockedUntil: until }, now)).toBe(expected)
  })
})

describe('combineIngredients', () => {
  const [a, b, source, target] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]

  it('ersetzt die Quelle an ihrer Stelle mit ihrem Anteil', () => {
    const list = [{ ingredientId: a, percent: 50 }, { ingredientId: source, percent: 30 }, { ingredientId: b, percent: null }]
    expect(combineIngredients(list, source, target)).toEqual([
      { ingredientId: a, percent: 50 }, { ingredientId: target, percent: 30 }, { ingredientId: b, percent: null },
    ])
  })

  it.each([
    [20, 30, 50],
    [20, null, 20],
    [null, 30, 30],
    [null, null, null],
  ])('Quelle %s + Ziel %s → %s, Ziel bleibt an seiner Position', (sourcePercent, targetPercent, expected) => {
    const list = [
      { ingredientId: source, percent: sourcePercent },
      { ingredientId: a, percent: null },
      { ingredientId: target, percent: targetPercent },
    ]
    expect(combineIngredients(list, source, target)).toEqual([
      { ingredientId: a, percent: null }, { ingredientId: target, percent: expected },
    ])
  })

  it('lässt Listen ohne Quelle unverändert', () => {
    const list = [{ ingredientId: a, percent: 10 }]
    expect(combineIngredients(list, source, target)).toBe(list)
  })
})

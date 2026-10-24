import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createPantrySchema, pantryListQuerySchema, pantryLookupQuerySchema, updatePantrySchema } from '../../shared/schemas/pantry'

describe('updatePantrySchema', () => {
  it.each([null, 0, 1, 100_000])('nimmt %s g an', (grams) => {
    expect(updatePantrySchema.parse({ grams })).toEqual({ grams })
  })

  it.each([-1, 100_001, 1.5, '5', undefined])('lehnt %s ab', (grams) => {
    expect(updatePantrySchema.safeParse({ grams }).success).toBe(false)
  })
})

describe('createPantrySchema', () => {
  const entityId = randomUUID()

  it('setzt fehlende Menge auf „ohne Menge“', () => {
    expect(createPantrySchema.parse({ entityType: 'tea', entityId })).toEqual({ entityType: 'tea', entityId, grams: null })
  })

  it('verlangt eine bekannte Art und eine UUID', () => {
    expect(createPantrySchema.safeParse({ entityType: 'user', entityId }).success).toBe(false)
    expect(createPantrySchema.safeParse({ entityType: 'tea', entityId: '123' }).success).toBe(false)
  })
})

describe('Abfragen', () => {
  it('Liste: Art ist Pflicht, Seite beginnt bei 1', () => {
    expect(pantryListQuerySchema.parse({ type: 'ingredient', locale: 'de' })).toEqual({ type: 'ingredient', locale: 'de', page: 1 })
    expect(pantryListQuerySchema.safeParse({ locale: 'de' }).success).toBe(false)
  })

  it('Lookup: nur Zutat oder Tee mit UUID', () => {
    expect(pantryLookupQuerySchema.safeParse({ type: 'tea', entityId: randomUUID() }).success).toBe(true)
    expect(pantryLookupQuerySchema.safeParse({ type: 'report', entityId: randomUUID() }).success).toBe(false)
  })
})

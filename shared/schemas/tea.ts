// Eingabe-Schemas für Tees (Client und Server). Import: #shared/schemas/tea
import { z } from './zod'
import { TEA_BRAND_MAX, TEA_INGREDIENTS_MAX, TEA_INGREDIENTS_MIN, TEA_KINDS, VISIBILITIES } from '../utils/tea'
import { pageSchema } from './auth'
import {
  catalogNameSchema, catalogTextSchema, contentLocaleSchema, createFactsShape, noteSchema, optionalText,
  searchTermSchema, translationsSchema, updateFactsShape,
} from './catalog'

export { compareQuerySchema, revisionsQuerySchema } from './catalog'

const teaKindSchema = z.enum(TEA_KINDS)
const brandSchema = optionalText(TEA_BRAND_MAX)

export const teaIngredientSchema = z.object({
  ingredientId: z.uuid(),
  percent: z.number().int().min(1).max(100).nullable().default(null),
})

/**
 * Zutaten in Reihenfolge. Listenfehler tragen als Meldung einen Schlüssel aus `validation.*`,
 * damit das Formular sie übersetzt am Zutatenfeld zeigt (AK-2.5).
 */
export const teaIngredientsSchema = z.array(teaIngredientSchema)
  .min(TEA_INGREDIENTS_MIN)
  .max(TEA_INGREDIENTS_MAX)
  .refine(list => new Set(list.map(item => item.ingredientId)).size === list.length, { message: 'duplicateIngredient' })
  .refine(list => list.reduce((sum, item) => sum + (item.percent ?? 0), 0) <= 100, { message: 'percentSum' })

/** Die Marke gibt es nur bei gekauften Tees. */
const dropBrandUnlessBought = <T extends { kind?: string, brand?: string | null }>(value: T): T =>
  value.kind && value.kind !== 'bought' ? { ...value, brand: null } : value

export const createTeaSchema = z.object({
  locale: contentLocaleSchema,
  ...catalogTextSchema.shape,
  visibility: z.enum(VISIBILITIES).default('private'),
  kind: teaKindSchema,
  brand: brandSchema,
  ...createFactsShape,
  ingredients: teaIngredientsSchema,
  note: noteSchema,
}).transform(dropBrandUnlessBought)

/**
 * Bearbeiten und Übersetzen; fehlende Felder bleiben unverändert, `ingredients` ersetzt die ganze Liste.
 * `strictObject`: unbekannte Felder wie `visibility` werden mit 400 abgelehnt (AK-4.3).
 */
export const updateTeaSchema = z.strictObject({
  version: z.number().int().min(1),
  kind: teaKindSchema.optional(),
  brand: brandSchema.optional(),
  ...updateFactsShape,
  translations: translationsSchema.optional(),
  ingredients: teaIngredientsSchema.optional(),
  note: noteSchema,
})

export const publishTeaSchema = z.object({
  version: z.number().int().min(1),
  note: noteSchema,
})

export const teaListQuerySchema = z.object({
  q: searchTermSchema.optional(),
  page: pageSchema,
  locale: contentLocaleSchema,
  ingredient: z.uuid().optional(),
  mine: z.stringbool().optional(),
  /** zusätzlich eigene private Tees (Vorrat, 06 AK-2.1) */
  withOwn: z.stringbool().optional(),
})

export const similarTeaQuerySchema = z.object({
  name: catalogNameSchema,
  locale: contentLocaleSchema,
})

export type CreateTeaInput = z.input<typeof createTeaSchema>
export type UpdateTeaInput = z.input<typeof updateTeaSchema>

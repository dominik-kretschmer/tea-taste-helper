// Eingabe-Schemas für den Vorrat (Client und Server). Import: #shared/schemas/pantry
import { z } from './zod'
import { PANTRY_GRAMS_MAX } from '../utils/pantry'
import { pageSchema } from './auth'
import { contentLocaleSchema, searchTermSchema } from './catalog'
import { catalogTypeSchema } from './moderation'

/** Ganze Gramm 0–100 000; null = ohne Menge (AK-2.5) */
export const gramsSchema = z.number().int().min(0).max(PANTRY_GRAMS_MAX).nullable()

export const pantryListQuerySchema = z.object({
  type: catalogTypeSchema,
  q: searchTermSchema.optional(),
  page: pageSchema,
  locale: contentLocaleSchema,
})

export const pantryLookupQuerySchema = z.object({
  type: catalogTypeSchema,
  entityId: z.uuid(),
})

export const createPantrySchema = z.object({
  entityType: catalogTypeSchema,
  entityId: z.uuid(),
  grams: gramsSchema.default(null),
})

export const updatePantrySchema = z.object({
  grams: gramsSchema,
})

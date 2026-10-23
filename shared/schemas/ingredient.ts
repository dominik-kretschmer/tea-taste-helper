// Eingabe-Schemas für Zutaten (Client und Server). Import: #shared/schemas/ingredient
import { z } from 'zod'
import { pageSchema } from './auth'
import {
  catalogNameSchema, catalogTextSchema, contentLocaleSchema, createFactsShape, noteSchema, searchTermSchema,
  translationsSchema, updateFactsShape,
} from './catalog'

export { compareQuerySchema, contentLocaleSchema, revisionsQuerySchema, similarQuerySchema } from './catalog'

export const ingredientNameSchema = catalogNameSchema
export const ingredientTextSchema = catalogTextSchema

export const createIngredientSchema = z.object({
  locale: contentLocaleSchema,
  ...catalogTextSchema.shape,
  ...createFactsShape,
  note: noteSchema,
})

/**
 * Bearbeiten und Übersetzen in einem (eine Version pro Speichern). Fehlende Felder bleiben unverändert;
 * Übersetzungen lassen sich nur setzen, nicht entfernen (AK-4.3).
 */
export const updateIngredientSchema = z.object({
  version: z.number().int().min(1),
  ...updateFactsShape,
  translations: translationsSchema.optional(),
  note: noteSchema,
})

export const ingredientListQuerySchema = z.object({
  q: searchTermSchema.optional(),
  page: pageSchema,
  locale: contentLocaleSchema,
})

export type CreateIngredientInput = z.input<typeof createIngredientSchema>
export type UpdateIngredientInput = z.input<typeof updateIngredientSchema>

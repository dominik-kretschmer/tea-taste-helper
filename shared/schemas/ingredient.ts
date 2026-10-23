// Gemeinsame Eingabe-Schemas für Zutaten (Client und Server). Import: #shared/schemas/ingredient
import { z } from 'zod'
import {
  BREW_SECONDS_MAX, BREW_SECONDS_MIN, BREW_TEMP_MAX, BREW_TEMP_MIN, CAFFEINE_VALUES, CONTENT_LOCALES,
  INGREDIENT_DESCRIPTION_MAX, INGREDIENT_NAME_MAX, INGREDIENT_NAME_MIN, INGREDIENT_NOTE_MAX,
} from '../utils/ingredient'
import { pageSchema } from './auth'

export const contentLocaleSchema = z.enum(CONTENT_LOCALES)

/** Leere Eingaben (auch nur Leerzeichen) werden zu `null`. */
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null)

export const ingredientNameSchema = z.string().trim().min(INGREDIENT_NAME_MIN).max(INGREDIENT_NAME_MAX)

export const ingredientTextSchema = z.object({
  name: ingredientNameSchema,
  description: optionalText(INGREDIENT_DESCRIPTION_MAX),
})

const caffeineSchema = z.enum(CAFFEINE_VALUES)
const brewTempSchema = z.number().int().min(BREW_TEMP_MIN).max(BREW_TEMP_MAX).nullable()
const brewSecondsSchema = z.number().int().min(BREW_SECONDS_MIN).max(BREW_SECONDS_MAX).nullable()
const noteSchema = optionalText(INGREDIENT_NOTE_MAX)

export const createIngredientSchema = z.object({
  locale: contentLocaleSchema,
  ...ingredientTextSchema.shape,
  caffeine: caffeineSchema.default('unknown'),
  brewTempC: brewTempSchema.default(null),
  brewSeconds: brewSecondsSchema.default(null),
  note: noteSchema,
})

/**
 * Bearbeiten und Übersetzen in einem (eine Version pro Speichern). Fehlende Felder bleiben unverändert;
 * Übersetzungen lassen sich nur setzen, nicht entfernen (AK-4.3).
 */
export const updateIngredientSchema = z.object({
  version: z.number().int().min(1),
  caffeine: caffeineSchema.optional(),
  brewTempC: brewTempSchema.optional(),
  brewSeconds: brewSecondsSchema.optional(),
  translations: z.partialRecord(contentLocaleSchema, ingredientTextSchema).optional(),
  note: noteSchema,
})

export const ingredientListQuerySchema = z.object({
  q: z.string().trim().max(INGREDIENT_NAME_MAX).optional(),
  page: pageSchema,
  locale: contentLocaleSchema,
})

export const similarQuerySchema = z.object({
  name: ingredientNameSchema,
  locale: contentLocaleSchema,
})

export const revisionsQuerySchema = z.object({
  page: pageSchema,
})

export const compareQuerySchema = z.object({
  from: z.coerce.number().int().min(1),
  to: z.coerce.number().int().min(1),
})

export type CreateIngredientInput = z.input<typeof createIngredientSchema>
export type UpdateIngredientInput = z.input<typeof updateIngredientSchema>

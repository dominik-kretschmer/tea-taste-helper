// Gemeinsame Eingabe-Bausteine für Katalog-Einträge (Zutaten, Tees). Import: #shared/schemas/catalog
import { z } from './zod'
import {
  BREW_SECONDS_MAX, BREW_SECONDS_MIN, BREW_TEMP_MAX, BREW_TEMP_MIN, CAFFEINE_VALUES, CATALOG_DESCRIPTION_MAX,
  CATALOG_NAME_MAX, CATALOG_NAME_MIN, CATALOG_NOTE_MAX, CONTENT_LOCALES,
} from '../utils/catalog'
import { pageSchema } from './auth'

export const contentLocaleSchema = z.enum(CONTENT_LOCALES)

/** Leere Eingaben (auch nur Leerzeichen) werden zu `null`. */
export const optionalText = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null)

export const catalogNameSchema = z.string().trim().min(CATALOG_NAME_MIN).max(CATALOG_NAME_MAX)

export const catalogTextSchema = z.object({
  name: catalogNameSchema,
  description: optionalText(CATALOG_DESCRIPTION_MAX),
})

export const caffeineSchema = z.enum(CAFFEINE_VALUES)
export const brewTempSchema = z.number().int().min(BREW_TEMP_MIN).max(BREW_TEMP_MAX).nullable()
export const brewSecondsSchema = z.number().int().min(BREW_SECONDS_MIN).max(BREW_SECONDS_MAX).nullable()
export const noteSchema = optionalText(CATALOG_NOTE_MAX)

/** Grundfelder beim Anlegen (mit Standardwerten). */
export const createFactsShape = {
  caffeine: caffeineSchema.default('unknown'),
  brewTempC: brewTempSchema.default(null),
  brewSeconds: brewSecondsSchema.default(null),
}

/** Grundfelder beim Bearbeiten (fehlend = unverändert). */
export const updateFactsShape = {
  caffeine: caffeineSchema.optional(),
  brewTempC: brewTempSchema.optional(),
  brewSeconds: brewSecondsSchema.optional(),
}

/** Übersetzungen lassen sich nur setzen, nicht entfernen. */
export const translationsSchema = z.partialRecord(contentLocaleSchema, catalogTextSchema)

export const searchTermSchema = z.string().trim().max(CATALOG_NAME_MAX)

export const similarQuerySchema = z.object({
  name: catalogNameSchema,
  locale: contentLocaleSchema,
})

export const revisionsQuerySchema = z.object({
  page: pageSchema,
})

export const compareQuerySchema = z.object({
  from: z.coerce.number().int().min(1),
  to: z.coerce.number().int().min(1),
})

/** Zurücksetzen auf `to`; `version` ist die geladene aktuelle Version (Konfliktschutz, 05 AK-1.1, AK-1.3). */
export const revertSchema = z.object({
  version: z.number().int().min(1),
  to: z.number().int().min(1),
  note: noteSchema,
})

export const detailQuerySchema = z.object({
  merged: z.stringbool().default(false),
})

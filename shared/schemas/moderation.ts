// Eingaben der Moderation (05). Import: #shared/schemas/moderation
import { z } from './zod'
import { BLOCK_DURATIONS, CATALOG_TYPES, MODERATION_TEXT_MAX, REPORT_REASONS } from '../utils/moderation'
import { contentLocaleSchema, optionalText } from './catalog'
import { pageSchema } from './auth'

/** Pflicht-Grund beim Ausblenden und Sperren */
const reasonText = z.string().trim().min(1).max(MODERATION_TEXT_MAX)

export const catalogTypeSchema = z.enum(CATALOG_TYPES)
export const reportReasonSchema = z.enum(REPORT_REASONS)

export const reportSchema = z.object({
  entityType: catalogTypeSchema,
  entityId: z.uuid(),
  reason: reportReasonSchema,
  comment: optionalText(MODERATION_TEXT_MAX),
  duplicateOfId: z.uuid().nullish(),
})
  .refine(input => input.reason !== 'other' || input.comment, { path: ['comment'], message: 'required' }) // AK-2.1
  .refine(input => input.reason !== 'duplicate' || input.duplicateOfId, { path: ['duplicateOfId'], message: 'required' }) // AK-2.2
  .transform(input => ({ ...input, duplicateOfId: input.reason === 'duplicate' ? input.duplicateOfId! : null }))

export const resolveReportsSchema = z.object({
  entityType: catalogTypeSchema,
  entityId: z.uuid(),
  status: z.enum(['resolved', 'rejected']),
  note: optionalText(MODERATION_TEXT_MAX),
})

export const reportListQuerySchema = z.object({
  status: z.enum(['open', 'closed']).default('open'),
  reason: reportReasonSchema.optional(),
  type: catalogTypeSchema.optional(),
  locale: contentLocaleSchema.default('de'),
  page: pageSchema,
})

export const hiddenListQuerySchema = z.object({
  type: catalogTypeSchema.optional(),
  locale: contentLocaleSchema.default('de'),
  page: pageSchema,
})

export const hideSchema = z.object({ reason: reasonText })
export const mergeSchema = z.object({ targetId: z.uuid() })
export const mergePreviewQuerySchema = z.object({ target: z.uuid() })
export const blockSchema = z.object({ duration: z.enum(BLOCK_DURATIONS), reason: reasonText })

export const moderationUsersQuerySchema = z.object({
  q: z.string().trim().max(40).optional(),
  blocked: z.stringbool().optional(),
  page: pageSchema,
})

/** Zeiträume rechnet der Client in ein Datum um; nicht in der Zukunft */
export const bulkRevertSchema = z.object({
  since: z.iso.datetime({ offset: true }).transform(value => new Date(value))
    .refine(date => date.getTime() <= Date.now(), { message: 'future' }),
})

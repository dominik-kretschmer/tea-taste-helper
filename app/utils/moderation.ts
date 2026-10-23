// Pfade und Routennamen je Art eines Katalog-Eintrags (Moderation, 05)

/** Segment der Admin-API: /api/admin/<segment>/:id/… */
export const entityApiSegment = (type: CatalogTypeValue) => (type === 'ingredient' ? 'ingredients' : 'teas')

/** Routenname der Detailseite bzw. ihrer Unterseiten */
export const entityRouteName = (type: CatalogTypeValue, page: '' | 'edit' | 'history' = '') =>
  `${entityApiSegment(type)}-id${page ? `-${page}` : ''}`

/** Ziel einer Zusammenführung aus einem 404 der Detail-API (`details.mergedInto`), sonst null (05 AK-4.2). */
export function mergedTargetOf(error: unknown): string | null {
  const details = (error as { data?: { error?: { details?: { mergedInto?: unknown } } } } | null)?.data?.error?.details
  return typeof details?.mergedInto === 'string' ? details.mergedInto : null
}

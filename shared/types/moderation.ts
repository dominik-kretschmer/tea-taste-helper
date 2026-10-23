// Typen der Moderation (05): Meldungen, Ausblenden, Zusammenführen, Sperren, Massen-Zurücksetzen.
import type { Role } from './auth'
import type { AuthorRef, ContentLocale, RevisionEntry } from './catalog'
import type { IngredientDetail } from './ingredient'
import type { TeaDetail } from './tea'

export type CatalogTypeValue = 'ingredient' | 'tea'
export type ReportReasonValue = 'duplicate' | 'wrong_info' | 'spam' | 'inappropriate' | 'other'
export type ReportStatusValue = 'open' | 'resolved' | 'rejected'
export type BlockDuration = '24h' | '7d' | '30d' | 'permanent'
/** Zustand eines Eintrags: aktiv, ausgeblendet oder in einen anderen zusammengeführt. */
export type EntryState = 'active' | 'hidden' | 'merged'

export interface ReportView {
  id: string
  reason: ReportReasonValue
  comment: string | null
  createdAt: string
  reporter: AuthorRef | null
  duplicateOf: { id: string, name: string } | null
  status: ReportStatusValue
  resolvedBy: AuthorRef | null
  resolvedAt: string | null
  resolutionNote: string | null
}

/** Meldungen eines Eintrags (AK-3.1). */
export interface ReportGroup {
  entityType: CatalogTypeValue
  entityId: string
  name: string
  state: EntryState
  /** Autor der aktuellen Version, für „Autor sperren“ (AK-3.2) */
  lastAuthor: { id: string, displayName: string } | null
  count: number
  oldestAt: string
  reports: ReportView[]
}

export interface HiddenEntry {
  entityType: CatalogTypeValue
  entityId: string
  name: string
  hiddenAt: string
  hiddenBy: AuthorRef | null
  hiddenReason: string
}

export interface MergePreview {
  source: IngredientDetail | TeaDetail
  target: IngredientDetail | TeaDetail
  /** nur bei Zutaten: Tees, die umgestellt werden (AK-4.1) */
  teas?: { public: number, private: number }
  /** Sprachen, in denen die Quelle eine Übersetzung hat und das Ziel nicht (AK-4.5) */
  missingTranslations: ContentLocale[]
}

/** Nutzer in der Moderations-Nutzerliste; `email` nur für Admins (AK-6.6). */
export interface ModerationUser {
  id: string
  displayName: string
  role: Role
  email?: string
  blocked: boolean
  blockedAt: string | null
  blockedUntil: string | null
  blockReason: string | null
  changes30d: number
}

export interface BulkItem {
  entityType: CatalogTypeValue
  entityId: string
  name: string
  /** Zielversion beim Zurücksetzen */
  toVersion?: number
}

export type BulkSkipReason = 'changed_by_others' | 'in_use' | 'duplicate' | 'ingredient_unavailable' | 'conflict'

export interface BulkRevertPlan {
  revert: BulkItem[]
  hide: BulkItem[]
  skip: (BulkItem & { reason: BulkSkipReason })[]
}

/** Ergebnis der Ausführung; gleiche Form wie die Vorschau (AK-7.5). */
export type BulkRevertResult = BulkRevertPlan

/** Ereignis ohne neue Version in der Historie (AK-5.6). */
export interface CatalogEventEntry {
  kind: 'hidden' | 'restored' | 'merged'
  createdAt: string
  actor: AuthorRef | null
  /** nur für Moderatoren */
  reason?: string | null
  /** ID des Ziels beim Zusammenführen */
  mergedInto?: string
}

/** Antwort der Historie: Versionen seitenweise, Ereignisse vollständig (es sind wenige). */
export interface RevisionPage {
  items: RevisionEntry[]
  total: number
  page: number
  pageSize: number
  events: CatalogEventEntry[]
}

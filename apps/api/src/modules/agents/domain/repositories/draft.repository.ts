import type {
  Draft,
  DraftStatus,
  DraftTier,
  NewDraft,
} from '../../application/services/draft-types'

export const DRAFT_REPOSITORY = Symbol('DRAFT_REPOSITORY')

export interface IDraftRepository {
  insert(draft: NewDraft): Promise<Draft>
  getById(opts: { tenantId: string; draftId: string }): Promise<Draft | null>
  updateStatus(opts: {
    tenantId: string
    draftId: string
    status: DraftStatus
    extra?: {
      approvedAt?: Date
      executedAt?: Date
      executionOutcome?: string
    }
  }): Promise<void>
  /**
   * Atomically transitions a draft from `fromStatus` to 'executed'.
   * Returns true if the update affected a row (transition happened),
   * false if the row was already in a different state (race condition / idempotence).
   */
  atomicTransitionToExecuted(opts: {
    tenantId: string
    draftId: string
    fromStatus: DraftStatus
  }): Promise<boolean>
  listPendingExpired(opts: { tenantId: string; now: Date }): Promise<Draft[]>
  /**
   * Cross-tenant query used by the system-wide expiry sweeper.
   * No tenantId filter — returns all pending drafts whose expiresAt is before `now`.
   */
  listAllPendingExpired(opts: { now: Date }): Promise<Draft[]>
  listForApprover(opts: {
    tenantId: string
    approverId: string
    statuses?: DraftStatus[]
  }): Promise<Draft[]>
  listAuditDrafts(opts: {
    tenantId: string
    initiatorUserId?: string
    approverUserId?: string
    tier?: DraftTier
    statuses?: DraftStatus[]
    domainKind?: string
    approvedAtFrom?: Date
    approvedAtTo?: Date
    taintAtDraftTime?: boolean
    page?: number
    pageSize?: number
  }): Promise<{ items: Draft[]; total: number }>
}

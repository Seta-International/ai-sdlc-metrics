import type { Draft, DraftStatus, NewDraft } from '../../application/services/draft-types'

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
  listPendingExpired(opts: { tenantId: string; now: Date }): Promise<Draft[]>
  listForApprover(opts: {
    tenantId: string
    approverId: string
    statuses?: DraftStatus[]
  }): Promise<Draft[]>
}

export interface DecisionCase {
  id: string
  tenantId: string
  module: string
  subjectId: string
  requestedBy: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  createdAt: Date
}

export interface DecisionOutcome {
  id: string
  tenantId: string
  caseId: string
  finalAction: 'approved' | 'rejected'
  decidedBy: string
  decidedAt: Date
  comment: string | null
}

export const DECISION_CASE_REPOSITORY = Symbol('IDecisionCaseRepository')

export interface IDecisionCaseRepository {
  findById(id: string, tenantId: string): Promise<DecisionCase | null>
  insert(data: {
    tenantId: string
    module: string
    subjectId: string
    requestedBy: string
  }): Promise<DecisionCase>
  updateStatus(id: string, tenantId: string, status: DecisionCase['status']): Promise<void>
  insertOutcome(data: {
    tenantId: string
    caseId: string
    finalAction: 'approved' | 'rejected'
    decidedBy: string
    comment: string | null
  }): Promise<DecisionOutcome>
}

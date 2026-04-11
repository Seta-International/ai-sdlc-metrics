import { DomainException } from './domain.exception'

export class DecisionCaseNotFoundException extends DomainException {
  readonly code = 'DECISION_CASE_NOT_FOUND'

  constructor(id: string) {
    super(`Decision case not found: ${id}`)
  }
}

export class DecisionCaseAlreadyResolvedException extends DomainException {
  readonly code = 'DECISION_CASE_ALREADY_RESOLVED'

  constructor(id: string, status: string) {
    super(`Decision case ${id} is already resolved (status: ${status})`)
  }
}

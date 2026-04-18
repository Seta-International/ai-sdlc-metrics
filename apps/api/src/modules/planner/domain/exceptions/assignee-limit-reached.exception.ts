import { DomainException } from '@future/core'

export class AssigneeLimitReachedException extends DomainException {
  readonly code = 'ASSIGNEE_LIMIT_REACHED'
  constructor(taskId: string, max = 20) {
    super(`Assignee limit (${max}) reached for task: ${taskId}`)
  }
}

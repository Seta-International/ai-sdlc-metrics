import { DomainException } from '@future/core'

export class ChecklistLimitReachedException extends DomainException {
  readonly code = 'CHECKLIST_LIMIT_REACHED'
  constructor(taskId: string, max = 20) {
    super(`Checklist limit (${max}) reached for task: ${taskId}`)
  }
}

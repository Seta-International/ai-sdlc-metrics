import { DomainException } from '@future/core'

export class TaskNotFoundException extends DomainException {
  readonly code = 'TASK_NOT_FOUND'
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`)
  }
}

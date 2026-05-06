import { DomainException } from '@future/core'

export class DependencySelfLinkException extends DomainException {
  readonly code = 'DEPENDENCY_SELF_LINK'
  constructor(taskId: string) {
    super(`Task ${taskId} cannot depend on itself`)
  }
}

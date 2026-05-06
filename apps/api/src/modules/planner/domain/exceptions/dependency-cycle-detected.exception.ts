import { DomainException } from '@future/core'

export class DependencyCycleDetectedException extends DomainException {
  readonly code = 'DEPENDENCY_CYCLE_DETECTED'
  constructor(fromTaskId: string, toTaskId: string) {
    super(`Adding dependency from ${fromTaskId} to ${toTaskId} would create a cycle`)
  }
}

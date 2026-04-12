// NOTE: DomainException is imported cross-module from kernel. This is intentional —
// it is the shared base class for all domain exceptions across the application.
// No other kernel domain internals should be imported by other modules.
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

export class AccountNotFoundException extends DomainException {
  readonly code = 'ACCOUNT_NOT_FOUND'
  constructor(id: string) {
    super(`Account not found: ${id}`)
  }
}

export class ProjectNotFoundException extends DomainException {
  readonly code = 'PROJECT_NOT_FOUND'
  constructor(id: string) {
    super(`Project not found: ${id}`)
  }
}

export class ProjectRoleNotFoundException extends DomainException {
  readonly code = 'PROJECT_ROLE_NOT_FOUND'
  constructor(id: string) {
    super(`Project role not found: ${id}`)
  }
}

export class AllocationNotFoundException extends DomainException {
  readonly code = 'ALLOCATION_NOT_FOUND'
  constructor(id: string) {
    super(`Allocation not found: ${id}`)
  }
}

export class AllocationAlreadyConfirmedException extends DomainException {
  readonly code = 'ALLOCATION_ALREADY_CONFIRMED'
  constructor(id: string) {
    super(`Allocation is already confirmed: ${id}`)
  }
}

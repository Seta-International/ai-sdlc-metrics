import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

export class EmploymentProfileNotFoundException extends DomainException {
  readonly code = 'EMPLOYMENT_PROFILE_NOT_FOUND'
  constructor(id: string) {
    super(`Employment profile not found: ${id}`)
  }
}

export class EmploymentProfileAlreadyExistsException extends DomainException {
  readonly code = 'EMPLOYMENT_PROFILE_ALREADY_EXISTS'
  constructor(actorId: string) {
    super(`Employment profile already exists for actor: ${actorId}`)
  }
}

export class InvalidEmploymentStatusTransitionException extends DomainException {
  readonly code = 'INVALID_EMPLOYMENT_STATUS_TRANSITION'
  constructor(from: string, to: string) {
    super(`Invalid employment status transition: ${from} → ${to}`)
  }
}

export class ProfileChangeRequestNotFoundException extends DomainException {
  readonly code = 'PROFILE_CHANGE_REQUEST_NOT_FOUND'
  constructor(id: string) {
    super(`Profile change request not found: ${id}`)
  }
}

export class ProfileChangeRequestNotPendingException extends DomainException {
  readonly code = 'PROFILE_CHANGE_REQUEST_NOT_PENDING'
  constructor(id: string) {
    super(`Profile change request is not in pending state: ${id}`)
  }
}

export class OnboardingCaseNotFoundException extends DomainException {
  readonly code = 'ONBOARDING_CASE_NOT_FOUND'
  constructor(id: string) {
    super(`Onboarding case not found: ${id}`)
  }
}

export class OnboardingTaskNotFoundException extends DomainException {
  readonly code = 'ONBOARDING_TASK_NOT_FOUND'
  constructor(id: string) {
    super(`Onboarding task not found: ${id}`)
  }
}

export class OffboardingCaseNotFoundException extends DomainException {
  readonly code = 'OFFBOARDING_CASE_NOT_FOUND'
  constructor(id: string) {
    super(`Offboarding case not found: ${id}`)
  }
}

export class OffboardingCaseAlreadyActiveException extends DomainException {
  readonly code = 'OFFBOARDING_CASE_ALREADY_ACTIVE'
  constructor(profileId: string) {
    super(`An active offboarding case already exists for profile: ${profileId}`)
  }
}

export class OffboardingNotInProcessingException extends DomainException {
  readonly code = 'OFFBOARDING_NOT_IN_PROCESSING'
  constructor(id: string) {
    super(`Offboarding case is not in processing state: ${id}`)
  }
}

export class OnboardingTemplateNotFoundException extends DomainException {
  readonly code = 'ONBOARDING_TEMPLATE_NOT_FOUND'
  constructor(id: string) {
    super(`Onboarding template not found: ${id}`)
  }
}

export class OffboardingTemplateNotFoundException extends DomainException {
  readonly code = 'OFFBOARDING_TEMPLATE_NOT_FOUND'
  constructor(id: string) {
    super(`Offboarding template not found: ${id}`)
  }
}

import { DomainException } from '@future/core'

export class PersonProfileNotFoundException extends DomainException {
  readonly code = 'PERSON_PROFILE_NOT_FOUND'
  constructor(id: string) {
    super(`Person profile not found: ${id}`)
  }
}

export class PersonProfileAlreadyExistsException extends DomainException {
  readonly code = 'PERSON_PROFILE_ALREADY_EXISTS'
  constructor(actorId: string) {
    super(`Person profile already exists for actor: ${actorId}`)
  }
}

export class EmploymentNotFoundException extends DomainException {
  readonly code = 'EMPLOYMENT_NOT_FOUND'
  constructor(id: string) {
    super(`Employment not found: ${id}`)
  }
}

export class InvalidEmploymentStatusTransitionException extends DomainException {
  readonly code = 'INVALID_EMPLOYMENT_STATUS_TRANSITION'
  constructor(from: string, to: string) {
    super(`Invalid employment status transition: ${from} → ${to}`)
  }
}

export class JobAssignmentNotFoundException extends DomainException {
  readonly code = 'JOB_ASSIGNMENT_NOT_FOUND'
  constructor(id: string) {
    super(`Job assignment not found: ${id}`)
  }
}

export class JobProfileNotFoundException extends DomainException {
  readonly code = 'JOB_PROFILE_NOT_FOUND'
  constructor(id: string) {
    super(`Job profile not found: ${id}`)
  }
}

export class JobFamilyNotFoundException extends DomainException {
  readonly code = 'JOB_FAMILY_NOT_FOUND'
  constructor(id: string) {
    super(`Job family not found: ${id}`)
  }
}

export class DuplicateCompanyEmailException extends DomainException {
  readonly code = 'DUPLICATE_COMPANY_EMAIL'
  constructor(email: string) {
    super(`Company email already in use: ${email}`)
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

export class OnboardingTemplateNotFoundException extends DomainException {
  readonly code = 'ONBOARDING_TEMPLATE_NOT_FOUND'
  constructor(id: string) {
    super(`Onboarding template not found: ${id}`)
  }
}

export class OffboardingCaseNotFoundException extends DomainException {
  readonly code = 'OFFBOARDING_CASE_NOT_FOUND'
  constructor(id: string) {
    super(`Offboarding case not found: ${id}`)
  }
}

export class OffboardingTaskNotFoundException extends DomainException {
  readonly code = 'OFFBOARDING_TASK_NOT_FOUND'
  constructor(id: string) {
    super(`Offboarding task not found: ${id}`)
  }
}

export class OffboardingTemplateNotFoundException extends DomainException {
  readonly code = 'OFFBOARDING_TEMPLATE_NOT_FOUND'
  constructor(id: string) {
    super(`Offboarding template not found: ${id}`)
  }
}

export class OffboardingCaseAlreadyActiveException extends DomainException {
  readonly code = 'OFFBOARDING_CASE_ALREADY_ACTIVE'
  constructor(profileId: string) {
    super(`An offboarding case is already active for profile: ${profileId}`)
  }
}

export class OffboardingNotInProcessingException extends DomainException {
  readonly code = 'OFFBOARDING_NOT_IN_PROCESSING'
  constructor(id: string) {
    super(`Offboarding case is not in processing state: ${id}`)
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

export class ProbationRecordNotFoundException extends DomainException {
  readonly code = 'PROBATION_RECORD_NOT_FOUND'
  constructor(employmentId: string) {
    super(`Probation record not found for employment: ${employmentId}`)
  }
}

export class ProbationExtensionNotAllowedException extends DomainException {
  readonly code = 'PROBATION_EXTENSION_NOT_ALLOWED'
  constructor(reason: string) {
    super(`Probation extension not allowed: ${reason}`)
  }
}

export class InvalidProbationStatusException extends DomainException {
  readonly code = 'INVALID_PROBATION_STATUS'
  constructor(status: string, action: string) {
    super(`Cannot ${action} probation in status: ${status}`)
  }
}

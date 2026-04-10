import { DomainException } from './domain.exception'

export class DuplicateSsoSubjectException extends DomainException {
  readonly code = 'DUPLICATE_SSO_SUBJECT'

  constructor(ssoSubject: string) {
    super(`An identity with SSO subject already exists: ${ssoSubject}`)
  }
}

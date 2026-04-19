import { DomainException } from '@future/core'

export class EvidenceBodyTooLongException extends DomainException {
  readonly code = 'EVIDENCE_BODY_TOO_LONG'
  constructor(maxLength = 4000) {
    super(`Evidence body exceeds maximum length of ${maxLength} characters`)
  }
}

import { DomainException } from '@future/core'

export class EvidenceBodyRequiredException extends DomainException {
  readonly code = 'EVIDENCE_BODY_REQUIRED'
  constructor() {
    super('Body is required for note evidence')
  }
}

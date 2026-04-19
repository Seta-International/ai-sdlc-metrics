import { DomainException } from '@future/core'

export class EvidenceNotFoundException extends DomainException {
  readonly code = 'EVIDENCE_NOT_FOUND'
  constructor(evidenceId: string) {
    super(`Evidence not found: ${evidenceId}`)
  }
}

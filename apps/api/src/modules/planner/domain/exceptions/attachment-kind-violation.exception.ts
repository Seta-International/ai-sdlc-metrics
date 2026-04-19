import { DomainException } from '@future/core'

export class AttachmentKindViolationException extends DomainException {
  readonly code = 'ATTACHMENT_KIND_VIOLATION'
  constructor(message: string) {
    super(message)
  }
}

import { DomainException } from '@future/core'

export class AttachmentKindViolationException extends DomainException {
  readonly code = 'ATTACHMENT_KIND_VIOLATION'
  constructor(readonly field: string) {
    super(`Attachment kind violation: ${field}`)
  }
}

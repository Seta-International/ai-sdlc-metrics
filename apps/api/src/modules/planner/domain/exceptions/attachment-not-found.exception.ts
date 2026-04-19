import { DomainException } from '@future/core'

export class AttachmentNotFoundException extends DomainException {
  readonly code = 'ATTACHMENT_NOT_FOUND'
  constructor(attachmentId: string) {
    super(`Attachment not found: ${attachmentId}`)
  }
}

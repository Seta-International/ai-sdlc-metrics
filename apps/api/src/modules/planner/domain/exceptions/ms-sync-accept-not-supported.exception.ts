import { DomainException } from '@future/core'

export class MsSyncAcceptNotSupportedException extends DomainException {
  readonly code = 'MS_SYNC_ACCEPT_NOT_SUPPORTED'
  constructor(kind: string) {
    super(
      `Accept MS state for "${kind}" conflicts is not yet supported — use Retry to re-attempt the push`,
    )
  }
}

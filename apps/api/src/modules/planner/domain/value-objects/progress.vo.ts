import { DomainException } from '@future/core'

class InvalidProgressException extends DomainException {
  readonly code = 'INVALID_PROGRESS'
  constructor(value: number) {
    super(`Progress must be 0, 50, or 100; got ${value}`)
  }
}

export class Progress {
  private constructor(readonly value: 0 | 50 | 100) {}

  static of(value: number): Progress {
    if (value !== 0 && value !== 50 && value !== 100) {
      throw new InvalidProgressException(value)
    }
    return new Progress(value as 0 | 50 | 100)
  }
}

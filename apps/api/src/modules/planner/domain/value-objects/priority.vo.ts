import { DomainException } from '@future/core'

class InvalidPriorityException extends DomainException {
  readonly code = 'INVALID_PRIORITY'
  constructor(value: number) {
    super(`Priority must be 1, 3, 5, or 9; got ${value}`)
  }
}

export class Priority {
  private constructor(readonly value: 1 | 3 | 5 | 9) {}

  static of(value: number): Priority {
    if (value !== 1 && value !== 3 && value !== 5 && value !== 9) {
      throw new InvalidPriorityException(value)
    }
    return new Priority(value as 1 | 3 | 5 | 9)
  }
}

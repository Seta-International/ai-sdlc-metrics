import { DomainException } from '@future/core'

type LabelSlotValue =
  | 'category1'
  | 'category2'
  | 'category3'
  | 'category4'
  | 'category5'
  | 'category6'
  | 'category7'
  | 'category8'
  | 'category9'
  | 'category10'
  | 'category11'
  | 'category12'
  | 'category13'
  | 'category14'
  | 'category15'
  | 'category16'
  | 'category17'
  | 'category18'
  | 'category19'
  | 'category20'
  | 'category21'
  | 'category22'
  | 'category23'
  | 'category24'
  | 'category25'

const VALID_SLOTS = new Set<string>(Array.from({ length: 25 }, (_, i) => `category${i + 1}`))

class InvalidLabelSlotException extends DomainException {
  readonly code = 'INVALID_LABEL_SLOT'
  constructor(value: string) {
    super(`LabelSlot must be one of category1..category25; got "${value}"`)
  }
}

export class LabelSlot {
  private constructor(readonly value: LabelSlotValue) {}

  static of(value: string): LabelSlot {
    if (!VALID_SLOTS.has(value)) {
      throw new InvalidLabelSlotException(value)
    }
    return new LabelSlot(value as LabelSlotValue)
  }
}

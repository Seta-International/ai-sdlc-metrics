import { DomainException } from '@future/core'

export class LabelSlotNotDefinedException extends DomainException {
  readonly code = 'LABEL_SLOT_NOT_DEFINED'
  constructor(slot: string, planId: string) {
    super(`Label slot "${slot}" is not defined on plan ${planId}`)
  }
}

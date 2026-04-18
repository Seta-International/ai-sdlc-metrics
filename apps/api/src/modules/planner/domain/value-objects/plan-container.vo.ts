import { DomainException } from '@future/core'

export type PlanContainerData =
  | { type: 'group'; externalId: string }
  | { type: 'roster'; externalId: string }
  | { type: 'none' }

type PlanContainerInput =
  | { type: 'group'; externalId?: string }
  | { type: 'roster'; externalId?: string }
  | { type: 'none'; externalId?: string }
  | { type: string; externalId?: string }

class InvalidPlanContainerException extends DomainException {
  readonly code = 'INVALID_PLAN_CONTAINER'
  constructor(message: string) {
    super(message)
  }
}

/**
 * PlanContainer is a branded value object that wraps the validated container data.
 * For 'none' containers, the externalId property does not exist on the instance.
 * For 'group'/'roster' containers, externalId is present and non-empty.
 */
export class PlanContainer {
  // Not declared as class fields — the validated data is stored by Object.assign.
  // This ensures 'externalId' is not present on 'none' containers.
  readonly type!: PlanContainerData['type']

  private constructor(data: PlanContainerData) {
    Object.assign(this, data)
    Object.freeze(this)
  }

  static of(input: PlanContainerInput): PlanContainer {
    const { type } = input
    const externalId = (input as { externalId?: string }).externalId

    if (type === 'none') {
      if (externalId !== undefined) {
        throw new InvalidPlanContainerException(
          'PlanContainer with type "none" must not have an externalId',
        )
      }
      return new PlanContainer({ type: 'none' })
    }

    if (type === 'group' || type === 'roster') {
      if (!externalId) {
        throw new InvalidPlanContainerException(
          `PlanContainer with type "${type}" requires a non-empty externalId`,
        )
      }
      return new PlanContainer({ type, externalId })
    }

    throw new InvalidPlanContainerException(
      `PlanContainer type must be "group", "roster", or "none"; got "${type}"`,
    )
  }
}

import { DomainException } from '@future/core'

export type PlanContainerData =
  | { type: 'ms_group'; externalId: string }
  | { type: 'ms_roster'; externalId: string }
  | { type: 'future_only' }

type PlanContainerInput =
  | { type: 'ms_group'; externalId?: string }
  | { type: 'ms_roster'; externalId?: string }
  | { type: 'future_only'; externalId?: string }
  | { type: string; externalId?: string }

class InvalidPlanContainerException extends DomainException {
  readonly code = 'INVALID_PLAN_CONTAINER'
  constructor(message: string) {
    super(message)
  }
}

/**
 * PlanContainer is a branded value object that wraps the validated container data.
 * For 'future_only' containers, the externalId property does not exist on the instance.
 * For 'ms_group'/'ms_roster' containers, externalId is present and non-empty.
 */
export class PlanContainer {
  // Not declared as class fields — the validated data is stored by Object.assign.
  // This ensures 'externalId' is not present on 'future_only' containers.
  readonly type!: PlanContainerData['type']

  private constructor(data: PlanContainerData) {
    Object.assign(this, data)
    Object.freeze(this)
  }

  static of(input: PlanContainerInput): PlanContainer {
    const { type } = input
    const externalId = (input as { externalId?: string }).externalId

    if (type === 'future_only') {
      if (externalId !== undefined) {
        throw new InvalidPlanContainerException(
          'PlanContainer with type "future_only" must not have an externalId',
        )
      }
      return new PlanContainer({ type: 'future_only' })
    }

    if (type === 'ms_group' || type === 'ms_roster') {
      if (!externalId) {
        throw new InvalidPlanContainerException(
          `PlanContainer with type "${type}" requires a non-empty externalId`,
        )
      }
      return new PlanContainer({ type, externalId })
    }

    throw new InvalidPlanContainerException(
      `PlanContainer type must be "ms_group", "ms_roster", or "future_only"; got "${type}"`,
    )
  }
}

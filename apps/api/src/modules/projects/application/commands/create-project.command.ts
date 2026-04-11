import type { DeliveryModel } from '../../domain/entities/project.entity'

export class CreateProjectCommand {
  constructor(
    readonly tenantId: string,
    readonly accountId: string,
    readonly name: string,
    readonly code: string | null,
    readonly description: string | null,
    readonly deliveryModel: DeliveryModel | null,
    readonly startedAt: Date | null,
    readonly tags: unknown,
  ) {}
}

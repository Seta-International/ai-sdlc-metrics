import type { DeliveryModel, ProjectStatus } from '../../domain/entities/project.entity'

export class UpdateProjectCommand {
  constructor(
    readonly tenantId: string,
    readonly projectId: string,
    readonly data: {
      name?: string
      code?: string | null
      description?: string | null
      deliveryModel?: DeliveryModel | null
      status?: ProjectStatus
      startedAt?: Date | null
      endedAt?: Date | null
      tags?: unknown
    },
  ) {}
}

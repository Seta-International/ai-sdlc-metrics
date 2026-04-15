import { Inject, Injectable } from '@nestjs/common'
import {
  FIELD_VISIBILITY_CONFIG_REPOSITORY,
  type IFieldVisibilityConfigRepository,
} from '../../domain/repositories/field-visibility-config.repository'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import { type VisibilityTier, getAllowedTiers } from '../../domain/value-objects/visibility-tier'

@Injectable()
export class FieldVisibilityFilterService {
  constructor(
    @Inject(FIELD_VISIBILITY_CONFIG_REPOSITORY)
    private readonly visibilityRepo: IFieldVisibilityConfigRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly assignmentRepo: IJobAssignmentRepository,
  ) {}

  async resolveMaxTier(
    tenantId: string,
    viewerEmploymentId: string,
    targetEmploymentId: string,
    isSelf: boolean,
    hasConfidentialPermission: boolean,
    hasRestrictedPermission: boolean,
  ): Promise<VisibilityTier> {
    if (isSelf) return 'confidential'
    if (hasConfidentialPermission) return 'confidential'

    const targetAssignment = await this.assignmentRepo.findCurrent(targetEmploymentId, tenantId)
    if (targetAssignment?.managerId === viewerEmploymentId) return 'restricted'

    if (hasRestrictedPermission) return 'restricted'

    return 'public'
  }

  async filterFields(
    tenantId: string,
    data: Record<string, unknown>,
    maxTier: VisibilityTier,
  ): Promise<Record<string, unknown>> {
    const configs = await this.visibilityRepo.findByTenant(tenantId)
    const allowedTiers = new Set(getAllowedTiers(maxTier))

    const configMap = new Map(configs.map((c) => [c.fieldPath, c.visibilityTier]))
    const result: Record<string, unknown> = {}

    for (const [fieldPath, value] of Object.entries(data)) {
      const tier = configMap.get(fieldPath) ?? 'public'
      if (allowedTiers.has(tier)) {
        result[fieldPath] = value
      }
    }

    return result
  }
}

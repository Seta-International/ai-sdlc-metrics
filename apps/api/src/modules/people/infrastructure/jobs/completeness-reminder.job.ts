import { Inject, Injectable } from '@nestjs/common'
import { EventBus, QueryBus } from '@nestjs/cqrs'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  GetProfileCompletenessQuery,
  type CompletenessResult,
} from '../../application/queries/get-profile-completeness.query'

@Injectable()
export class CompletenessReminderJob {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Runs weekly. Emits ProfileIncompleteEvent for profiles below threshold and past deadline.
   */
  async handle(tenantId: string, threshold = 80): Promise<void> {
    const employments = await this.employmentRepo.listByTenant(tenantId, { status: 'active' })

    for (const employment of employments) {
      const completeness: CompletenessResult = await this.queryBus.execute(
        new GetProfileCompletenessQuery(tenantId, employment.id),
      )

      if (completeness.score < threshold) {
        const requiredMissing = completeness.missing.filter((m) => m.isRequired)

        for (const field of requiredMissing) {
          if (field.deadlineDays !== null) {
            this.eventBus.publish({
              type: 'ProfileIncompleteEvent',
              tenantId,
              employmentId: employment.id,
              fieldPath: field.fieldPath,
              label: field.label,
              deadlineDays: field.deadlineDays,
              currentScore: completeness.score,
            })
          }
        }
      }
    }
  }
}

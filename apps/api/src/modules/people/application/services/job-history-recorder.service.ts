import { Inject, Injectable } from '@nestjs/common'
import {
  JOB_HISTORY_REPOSITORY,
  type IJobHistoryRepository,
} from '../../domain/repositories/job-history.repository'
import type { JobHistoryChangeType } from '../../domain/entities/job-history-entry.entity'

export interface RecordChangeInput {
  profileId: string
  tenantId: string
  effectiveFrom: Date
  jobTitle: string | null
  departmentId: string | null
  managerProfileId: string | null
  changeReason: string | null
  recordedBy: string | null
}

@Injectable()
export class JobHistoryRecorderService {
  constructor(
    @Inject(JOB_HISTORY_REPOSITORY)
    private readonly repo: IJobHistoryRepository,
  ) {}

  async recordHire(input: RecordChangeInput) {
    return this.record(input, 'hire')
  }

  async recordDepartmentTransfer(input: RecordChangeInput) {
    await this.repo.closeOpenEntry(input.profileId, input.tenantId, input.effectiveFrom)
    return this.record(input, 'department_transfer')
  }

  async recordPromotion(input: RecordChangeInput) {
    await this.repo.closeOpenEntry(input.profileId, input.tenantId, input.effectiveFrom)
    return this.record(input, 'promotion')
  }

  async recordManagerChange(input: RecordChangeInput) {
    await this.repo.closeOpenEntry(input.profileId, input.tenantId, input.effectiveFrom)
    return this.record(input, 'manager_change')
  }

  async recordTermination(profileId: string, tenantId: string, effectiveTo: Date) {
    await this.repo.closeOpenEntry(profileId, tenantId, effectiveTo)
  }

  async recordRehire(input: RecordChangeInput) {
    return this.record(input, 'rehire')
  }

  private async record(input: RecordChangeInput, changeType: JobHistoryChangeType) {
    return this.repo.recordChange({
      tenantId: input.tenantId,
      profileId: input.profileId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null,
      jobTitle: input.jobTitle,
      departmentId: input.departmentId,
      managerProfileId: input.managerProfileId,
      changeType,
      changeReason: input.changeReason,
      recordedBy: input.recordedBy,
    })
  }
}

import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { randomUUID } from 'crypto'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'
import type { ChangeRequestStatus } from '../../domain/entities/profile-change-request.entity'
import { EditPolicyService } from '../services/edit-policy.service'
import { RequestProfileChangesCommand } from './request-profile-changes.command'

@CommandHandler(RequestProfileChangesCommand)
export class RequestProfileChangesHandler implements ICommandHandler<RequestProfileChangesCommand> {
  constructor(
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRepo: IProfileChangeRequestRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    private readonly editPolicyService: EditPolicyService,
  ) {}

  async execute(command: RequestProfileChangesCommand): Promise<void> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) {
      throw new EmploymentNotFoundException(command.employmentId)
    }

    const batchId = randomUUID()
    const rows: Array<{
      tenantId: string
      employmentId: string
      batchId: string
      reason: string | null
      fieldPath: string
      oldValue: unknown
      newValue: unknown
      effectiveDate: Date | null
      status: ChangeRequestStatus
      requestedBy: string
      reviewedBy: string | null
      reviewedAt: Date | null
      reviewNote: string | null
      decisionCaseId: string | null
    }> = []

    for (const change of command.changes) {
      const policy = await this.editPolicyService.resolveEditMode(
        command.tenantId,
        change.fieldPath,
        false,
      )

      if (!policy.canEdit) {
        throw new Error(
          `Field ${change.fieldPath} is ${policy.editMode} — cannot be edited by this user`,
        )
      }

      const existing = await this.changeRepo.findPendingByFieldPath(
        command.employmentId,
        change.fieldPath,
        command.tenantId,
      )
      if (existing) {
        await this.changeRepo.updateStatus(existing.id, command.tenantId, 'superseded')
      }

      let status: ChangeRequestStatus
      if (change.effectiveDate && change.effectiveDate > new Date()) {
        status = 'scheduled'
      } else if (policy.requiresApproval) {
        status = 'pending'
      } else {
        status = 'applied'
      }

      rows.push({
        tenantId: command.tenantId,
        employmentId: command.employmentId,
        batchId,
        reason: command.reason ?? null,
        fieldPath: change.fieldPath,
        oldValue: change.oldValue,
        newValue: change.newValue,
        effectiveDate: change.effectiveDate ?? null,
        status,
        requestedBy: command.requestedBy,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        decisionCaseId: null,
      })
    }

    await this.changeRepo.insertMany(rows)
  }
}

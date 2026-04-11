import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { EmploymentProfileNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'
import { KernelAuditService } from '../../../kernel/application/facades/kernel-audit.service'
import { KernelWorkflowService } from '../../../kernel/application/facades/kernel-workflow.service'
import type { ProfileChangeRequest } from '../../domain/entities/profile-change-request.entity'
import { RequestProfileChangeCommand } from './request-profile-change.command'

@CommandHandler(RequestProfileChangeCommand)
export class RequestProfileChangeHandler implements ICommandHandler<
  RequestProfileChangeCommand,
  ProfileChangeRequest
> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRequestRepo: IProfileChangeRequestRepository,
    private readonly auditService: KernelAuditService,
    private readonly workflowService: KernelWorkflowService,
  ) {}

  async execute(command: RequestProfileChangeCommand): Promise<ProfileChangeRequest> {
    // Guard: profile must exist
    const profile = await this.profileRepo.findById(command.profileId, command.tenantId)
    if (!profile) throw new EmploymentProfileNotFoundException(command.profileId)

    // Create the change request (pending, no decisionCaseId yet)
    const changeRequest = await this.changeRequestRepo.insert({
      tenantId: command.tenantId,
      profileId: command.profileId,
      fieldPath: command.fieldPath,
      oldValue: command.oldValue,
      newValue: command.newValue,
      status: 'pending',
      decisionCaseId: null,
      requestedBy: command.requestedBy,
      reviewedBy: null,
    })

    // Create kernel decision case
    const decisionCaseId = await this.workflowService.createDecisionCase(
      command.tenantId,
      'people',
      changeRequest.id,
      command.requestedBy,
    )

    // Audit log
    await this.auditService.log({
      tenantId: command.tenantId,
      actorId: command.requestedBy,
      eventType: 'profile_change_requested',
      module: 'people',
      subjectId: command.profileId,
      payload: {
        changeRequestId: changeRequest.id,
        fieldPath: command.fieldPath,
        decisionCaseId: decisionCaseId ?? null,
      },
    })

    return changeRequest
  }
}

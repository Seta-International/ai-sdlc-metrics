import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { EmploymentProfileNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { CreateDecisionCaseCommand } from '../../../kernel/application/commands/create-decision-case.command'
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
    private readonly auditFacade: KernelAuditFacade,
    private readonly commandBus: CommandBus,
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

    // Dispatch kernel decision case
    const decisionCase = await this.commandBus.execute(
      new CreateDecisionCaseCommand(
        command.tenantId,
        'people',
        changeRequest.id,
        command.requestedBy,
      ),
    )

    // Audit log
    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.requestedBy,
      eventType: 'profile_change_requested',
      module: 'people',
      subjectId: command.profileId,
      payload: {
        changeRequestId: changeRequest.id,
        fieldPath: command.fieldPath,
        decisionCaseId: decisionCase?.id ?? null,
      },
    })

    return changeRequest
  }
}

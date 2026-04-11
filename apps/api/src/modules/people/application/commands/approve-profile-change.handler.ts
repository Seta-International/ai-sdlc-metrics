import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ProfileChangeRequestNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'
import {
  EMPLOYMENT_PROFILE_DETAIL_REPOSITORY,
  type IEmploymentProfileDetailRepository,
} from '../../domain/repositories/employment-profile-detail.repository'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import { ResolveDecisionCaseCommand } from '../../../kernel/application/commands/resolve-decision-case.command'
import { ApproveProfileChangeCommand } from './approve-profile-change.command'

@CommandHandler(ApproveProfileChangeCommand)
export class ApproveProfileChangeHandler implements ICommandHandler<
  ApproveProfileChangeCommand,
  void
> {
  constructor(
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRequestRepo: IProfileChangeRequestRepository,
    @Inject(EMPLOYMENT_PROFILE_DETAIL_REPOSITORY)
    private readonly detailRepo: IEmploymentProfileDetailRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: ApproveProfileChangeCommand): Promise<void> {
    const request = await this.changeRequestRepo.findById(command.changeRequestId, command.tenantId)
    if (!request) throw new ProfileChangeRequestNotFoundException(command.changeRequestId)

    // Extract field name from path (e.g. "detail.bankAccountNumber" → "bankAccountNumber")
    const fieldName = request.fieldPath.replace(/^detail\./, '')

    // Apply the change to the detail record
    await this.detailRepo.updateField(
      request.profileId,
      command.tenantId,
      fieldName,
      request.newValue,
    )

    // Mark request as approved
    await this.changeRequestRepo.updateStatus(
      command.changeRequestId,
      command.tenantId,
      'approved',
      command.approvedBy,
    )

    // Resolve the kernel decision case
    if (request.decisionCaseId) {
      await this.commandBus.execute(
        new ResolveDecisionCaseCommand(
          command.tenantId,
          request.decisionCaseId,
          'approved',
          command.approvedBy,
          null,
        ),
      )
    }

    // Audit log
    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.approvedBy,
      eventType: 'profile_change_approved',
      module: 'people',
      subjectId: request.profileId,
      payload: { changeRequestId: request.id, fieldPath: request.fieldPath },
    })
  }
}

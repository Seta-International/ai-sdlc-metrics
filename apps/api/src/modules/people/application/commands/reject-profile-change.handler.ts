import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  ProfileChangeRequestNotFoundException,
  ProfileChangeRequestNotPendingException,
} from '../../domain/exceptions/people.exceptions'
import {
  PROFILE_CHANGE_REQUEST_REPOSITORY,
  type IProfileChangeRequestRepository,
} from '../../domain/repositories/profile-change-request.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelDecisionFacade } from '../../../kernel/application/facades/kernel-decision.facade'
import { RejectProfileChangeCommand } from './reject-profile-change.command'

@CommandHandler(RejectProfileChangeCommand)
export class RejectProfileChangeHandler implements ICommandHandler<
  RejectProfileChangeCommand,
  void
> {
  constructor(
    @Inject(PROFILE_CHANGE_REQUEST_REPOSITORY)
    private readonly changeRequestRepo: IProfileChangeRequestRepository,
    private readonly auditFacade: KernelAuditFacade,
    private readonly decisionFacade: KernelDecisionFacade,
  ) {}

  async execute(command: RejectProfileChangeCommand): Promise<void> {
    const request = await this.changeRequestRepo.findById(command.changeRequestId, command.tenantId)
    if (!request) throw new ProfileChangeRequestNotFoundException(command.changeRequestId)
    if (request.status !== 'pending') {
      throw new ProfileChangeRequestNotPendingException(command.changeRequestId)
    }

    // Mark request as rejected
    await this.changeRequestRepo.updateStatus(
      command.changeRequestId,
      command.tenantId,
      'rejected',
      command.rejectedBy,
      command.comment,
    )

    // Resolve the kernel decision case with rejection + comment via facade
    if (request.decisionCaseId) {
      await this.decisionFacade.resolveDecisionCase(
        command.tenantId,
        request.decisionCaseId,
        'rejected',
        command.rejectedBy,
        command.comment,
      )
    }

    // Audit log
    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.rejectedBy,
      eventType: 'profile_change_rejected',
      module: 'people',
      subjectId: request.employmentId,
      payload: {
        changeRequestId: request.id,
        fieldPath: request.fieldPath,
        comment: command.comment,
      },
    })
  }
}

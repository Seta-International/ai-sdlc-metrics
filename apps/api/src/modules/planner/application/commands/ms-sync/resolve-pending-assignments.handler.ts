import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  ROSTER_MEMBER_REPOSITORY,
  type IRosterMemberRepository,
} from '../../../domain/repositories/roster-member.repository'
import { IdentityQueryFacade } from '../../../../identity/application/facades/identity-query.facade'
import { ResolvePendingAssignmentsCommand } from './resolve-pending-assignments.command'

@CommandHandler(ResolvePendingAssignmentsCommand)
export class ResolvePendingAssignmentsHandler implements ICommandHandler<ResolvePendingAssignmentsCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly identityFacade: IdentityQueryFacade,
    @Inject(ROSTER_MEMBER_REPOSITORY) private readonly memberRepo: IRosterMemberRepository,
  ) {}

  async execute(cmd: ResolvePendingAssignmentsCommand): Promise<void> {
    const tasks = await this.taskRepo.listWithPendingAssignments(cmd.tenantId)
    for (const task of tasks) {
      const stillPending: string[] = []
      const newlyResolved: string[] = []
      for (const aadOid of task.pendingMsAssignments) {
        const actorId = await this.identityFacade.getActorIdByExternalUserId(aadOid, cmd.tenantId)
        if (actorId) newlyResolved.push(actorId)
        else stillPending.push(aadOid)
      }
      if (newlyResolved.length > 0 || stillPending.length !== task.pendingMsAssignments.length) {
        await this.taskRepo.applyPendingResolution(task.id, {
          newAssignees: newlyResolved,
          stillPending,
          origin: 'ms-sync-pull',
        })
      }
    }
    const unresolvedMembers = await this.memberRepo.listUnresolved(cmd.tenantId)
    for (const member of unresolvedMembers) {
      const actorId = await this.identityFacade.getActorIdByExternalUserId(
        member.ssoSubject,
        cmd.tenantId,
      )
      if (actorId) {
        await this.memberRepo.resolveMember(
          cmd.tenantId,
          member.msRosterId,
          member.ssoSubject,
          actorId,
        )
      }
    }
  }
}

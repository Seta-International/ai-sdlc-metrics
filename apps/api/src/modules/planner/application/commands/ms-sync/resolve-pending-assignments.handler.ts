import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { IdentityQueryFacade } from '../../../../identity/application/facades/identity-query.facade'
import { ResolvePendingAssignmentsCommand } from './resolve-pending-assignments.command'

@CommandHandler(ResolvePendingAssignmentsCommand)
export class ResolvePendingAssignmentsHandler implements ICommandHandler<ResolvePendingAssignmentsCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly identityFacade: IdentityQueryFacade,
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
  }
}

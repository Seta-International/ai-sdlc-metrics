import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { EvidenceRemovedEvent } from '@future/event-contracts'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  TASK_EVIDENCE_REPOSITORY,
  type ITaskEvidenceRepository,
} from '../../../domain/repositories/task-evidence.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { EvidenceNotFoundException } from '../../../domain/exceptions/evidence-not-found.exception'
import { RemoveEvidenceCommand } from './remove-evidence.command'

@CommandHandler(RemoveEvidenceCommand)
export class RemoveEvidenceHandler implements ICommandHandler<RemoveEvidenceCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(TASK_EVIDENCE_REPOSITORY)
    private readonly evidenceRepo: ITaskEvidenceRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RemoveEvidenceCommand): Promise<void> {
    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    const evidence = await this.evidenceRepo.findById(command.evidenceId, command.tenantId)
    if (!evidence || evidence.taskId !== command.taskId) {
      throw new EvidenceNotFoundException(command.evidenceId)
    }

    const isSubmitter = evidence.submittedBy === command.actorId
    if (!isSubmitter) {
      await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)
    }

    await this.evidenceRepo.remove(command.evidenceId, command.tenantId)

    await this.eventBus.publish(
      new EvidenceRemovedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.evidenceId,
        evidence.storageKey ?? null,
      ),
    )
  }
}

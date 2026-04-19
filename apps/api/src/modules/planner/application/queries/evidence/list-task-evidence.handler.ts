import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  TASK_EVIDENCE_REPOSITORY,
  type ITaskEvidenceRepository,
} from '../../../domain/repositories/task-evidence.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { ListTaskEvidenceQuery, type TaskEvidenceDto } from './list-task-evidence.query'

@QueryHandler(ListTaskEvidenceQuery)
export class ListTaskEvidenceHandler implements IQueryHandler<
  ListTaskEvidenceQuery,
  TaskEvidenceDto[]
> {
  constructor(
    @Inject(TASK_EVIDENCE_REPOSITORY)
    private readonly evidenceRepo: ITaskEvidenceRepository,
    private readonly authSvc: PlanAuthorizationService,
  ) {}

  async execute(query: ListTaskEvidenceQuery): Promise<TaskEvidenceDto[]> {
    await this.authSvc.assertCanEditPlan(query.actorId, query.planId, query.tenantId)

    const evidenceList = await this.evidenceRepo.listByTask(query.taskId, query.tenantId)

    return evidenceList.map((ev) => ({
      id: ev.id,
      taskId: ev.taskId,
      tenantId: ev.tenantId,
      submittedBy: ev.submittedBy,
      submittedAt: ev.submittedAt,
      kind: ev.kind,
      caption: ev.caption,
      storageKey: ev.storageKey,
      filename: ev.filename,
      contentType: ev.contentType,
      sizeBytes: ev.sizeBytes,
      url: ev.url,
      linkTitle: ev.linkTitle,
      body: ev.body,
      verifiedBy: ev.verifiedBy,
      verifiedAt: ev.verifiedAt,
      verificationNote: ev.verificationNote,
    }))
  }
}

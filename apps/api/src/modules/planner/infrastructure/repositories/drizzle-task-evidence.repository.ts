import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, desc, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { ITaskEvidenceRepository } from '../../domain/repositories/task-evidence.repository'
import { TaskEvidence } from '../../domain/entities/task-evidence.entity'
import { plannerTaskEvidence } from '../schema/planner.schema'

@Injectable()
export class DrizzleTaskEvidenceRepository implements ITaskEvidenceRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async add(evidence: TaskEvidence): Promise<void> {
    await this.db.insert(plannerTaskEvidence).values({
      id: evidence.id,
      taskId: evidence.taskId,
      tenantId: evidence.tenantId,
      submittedBy: evidence.submittedBy,
      submittedAt: evidence.submittedAt,
      kind: evidence.kind,
      caption: evidence.caption,
      storageKey: evidence.storageKey ?? null,
      filename: evidence.filename ?? null,
      contentType: evidence.contentType ?? null,
      sizeBytes: evidence.sizeBytes ?? null,
      url: evidence.url ?? null,
      linkTitle: evidence.linkTitle ?? null,
      body: evidence.body ?? null,
      verifiedBy: evidence.verifiedBy,
      verifiedAt: evidence.verifiedAt,
      verificationNote: evidence.verificationNote,
    })
  }

  async findById(id: string, tenantId: string): Promise<TaskEvidence | null> {
    const rows = await this.db
      .select()
      .from(plannerTaskEvidence)
      .where(and(eq(plannerTaskEvidence.id, id), eq(plannerTaskEvidence.tenantId, tenantId)))
      .limit(1)

    const row = rows[0]
    if (!row) return null

    return TaskEvidence.reconstitute({
      id: row.id,
      taskId: row.taskId,
      tenantId: row.tenantId,
      submittedBy: row.submittedBy,
      submittedAt: row.submittedAt,
      kind: row.kind,
      caption: row.caption,
      storageKey: row.storageKey,
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      url: row.url,
      linkTitle: row.linkTitle,
      body: row.body,
      verifiedBy: row.verifiedBy,
      verifiedAt: row.verifiedAt,
      verificationNote: row.verificationNote,
    })
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(plannerTaskEvidence)
      .where(and(eq(plannerTaskEvidence.id, id), eq(plannerTaskEvidence.tenantId, tenantId)))
  }

  async listByTask(taskId: string, tenantId: string): Promise<TaskEvidence[]> {
    const rows = await this.db
      .select()
      .from(plannerTaskEvidence)
      .where(
        and(eq(plannerTaskEvidence.taskId, taskId), eq(plannerTaskEvidence.tenantId, tenantId)),
      )
      .orderBy(desc(plannerTaskEvidence.submittedAt))

    return rows.map((row) =>
      TaskEvidence.reconstitute({
        id: row.id,
        taskId: row.taskId,
        tenantId: row.tenantId,
        submittedBy: row.submittedBy,
        submittedAt: row.submittedAt,
        kind: row.kind,
        caption: row.caption,
        storageKey: row.storageKey,
        filename: row.filename,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
        url: row.url,
        linkTitle: row.linkTitle,
        body: row.body,
        verifiedBy: row.verifiedBy,
        verifiedAt: row.verifiedAt,
        verificationNote: row.verificationNote,
      }),
    )
  }
}

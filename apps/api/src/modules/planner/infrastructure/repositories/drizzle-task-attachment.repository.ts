import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, desc, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { ITaskAttachmentRepository } from '../../domain/repositories/task-attachment.repository'
import { TaskAttachment } from '../../domain/entities/task-attachment.entity'
import { plannerTaskAttachment } from '../schema/planner.schema'

@Injectable()
export class DrizzleTaskAttachmentRepository implements ITaskAttachmentRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async add(attachment: TaskAttachment): Promise<void> {
    await this.db.insert(plannerTaskAttachment).values({
      id: attachment.id,
      taskId: attachment.taskId,
      tenantId: attachment.tenantId,
      createdBy: attachment.createdBy,
      kind: attachment.kind,
      storageKey: attachment.storageKey ?? null,
      filename: attachment.filename ?? null,
      contentType: attachment.contentType ?? null,
      sizeBytes: attachment.sizeBytes ?? null,
      url: attachment.url ?? null,
      linkTitle: attachment.linkTitle ?? null,
      previewType: attachment.previewType ?? null,
      createdAt: attachment.createdAt,
    })
  }

  async list(taskId: string, tenantId: string): Promise<TaskAttachment[]> {
    const rows = await this.db
      .select()
      .from(plannerTaskAttachment)
      .where(
        and(eq(plannerTaskAttachment.taskId, taskId), eq(plannerTaskAttachment.tenantId, tenantId)),
      )
      .orderBy(desc(plannerTaskAttachment.createdAt))

    return rows.map((row) =>
      TaskAttachment.reconstitute({
        id: row.id,
        taskId: row.taskId,
        tenantId: row.tenantId,
        createdBy: row.createdBy,
        kind: row.kind,
        storageKey: row.storageKey,
        filename: row.filename,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
        url: row.url,
        linkTitle: row.linkTitle,
        previewType: row.previewType,
        createdAt: row.createdAt,
      }),
    )
  }

  async findById(id: string, tenantId: string): Promise<TaskAttachment | null> {
    const rows = await this.db
      .select()
      .from(plannerTaskAttachment)
      .where(and(eq(plannerTaskAttachment.id, id), eq(plannerTaskAttachment.tenantId, tenantId)))
      .limit(1)

    const row = rows[0]
    if (!row) return null

    return TaskAttachment.reconstitute({
      id: row.id,
      taskId: row.taskId,
      tenantId: row.tenantId,
      createdBy: row.createdBy,
      kind: row.kind,
      storageKey: row.storageKey,
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      url: row.url,
      linkTitle: row.linkTitle,
      previewType: row.previewType,
      createdAt: row.createdAt,
    })
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(plannerTaskAttachment)
      .where(and(eq(plannerTaskAttachment.id, id), eq(plannerTaskAttachment.tenantId, tenantId)))
  }
}

import { Injectable, Inject } from '@nestjs/common'
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { IMsSyncConflictRepository } from '../../domain/repositories/ms-sync-conflict.repository'
import { MsSyncConflictEntity } from '../../domain/entities/ms-sync-conflict.entity'
import { msSyncConflict } from '../schema/planner.schema'

@Injectable()
export class DrizzleMsSyncConflictRepository implements IMsSyncConflictRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(entity: MsSyncConflictEntity): Promise<void> {
    await this.db.insert(msSyncConflict).values({
      id: entity.id,
      tenantId: entity.tenantId,
      kind: entity.kind,
      taskId: entity.taskId ?? undefined,
      planId: entity.planId ?? undefined,
      field: entity.field ?? undefined,
      mineValue: entity.mineValue ?? undefined,
      theirsValue: entity.theirsValue ?? undefined,
      mineChangedAt: entity.mineChangedAt ?? undefined,
      theirsChangedAt: entity.theirsChangedAt ?? undefined,
      resolution: entity.resolution ?? undefined,
      resolvedByActorId: entity.resolvedByActorId ?? undefined,
      resolvedAt: entity.resolvedAt ?? undefined,
      rawError: entity.rawError ?? undefined,
      createdAt: entity.createdAt,
    })
  }

  async get(id: string): Promise<MsSyncConflictEntity | null> {
    const rows = await this.db
      .select()
      .from(msSyncConflict)
      .where(eq(msSyncConflict.id, id))
      .limit(1)
    return rows[0] ? rowToEntity(rows[0]) : null
  }

  async list(
    tenantId: string,
    opts: { resolved: 'open' | 'all'; limit: number; before?: Date },
  ): Promise<MsSyncConflictEntity[]> {
    const conditions = [eq(msSyncConflict.tenantId, tenantId)]
    if (opts.resolved === 'open') {
      conditions.push(isNull(msSyncConflict.resolvedAt))
    }
    if (opts.before) {
      conditions.push(lt(msSyncConflict.createdAt, opts.before))
    }
    const rows = await this.db
      .select()
      .from(msSyncConflict)
      .where(and(...conditions))
      .orderBy(desc(msSyncConflict.createdAt))
      .limit(opts.limit)
    return rows.map(rowToEntity)
  }

  async listOpenForTenant(tenantId: string): Promise<MsSyncConflictEntity[]> {
    const rows = await this.db
      .select()
      .from(msSyncConflict)
      .where(and(eq(msSyncConflict.tenantId, tenantId), isNull(msSyncConflict.resolvedAt)))
    return rows.map(rowToEntity)
  }

  async markResolved(id: string, actorId: string, resolution: string): Promise<void> {
    await this.db
      .update(msSyncConflict)
      .set({
        resolution,
        resolvedByActorId: actorId,
        resolvedAt: sql`NOW()`,
      })
      .where(eq(msSyncConflict.id, id))
  }
}

type MsSyncConflictRow = typeof msSyncConflict.$inferSelect

function rowToEntity(row: MsSyncConflictRow): MsSyncConflictEntity {
  return MsSyncConflictEntity.reconstitute({
    id: row.id,
    tenantId: row.tenantId,
    kind: row.kind,
    taskId: row.taskId ?? null,
    planId: row.planId ?? null,
    field: row.field ?? null,
    mineValue: row.mineValue ?? null,
    theirsValue: row.theirsValue ?? null,
    mineChangedAt: row.mineChangedAt ?? null,
    theirsChangedAt: row.theirsChangedAt ?? null,
    resolution: row.resolution ?? null,
    resolvedByActorId: row.resolvedByActorId ?? null,
    resolvedAt: row.resolvedAt ?? null,
    rawError: row.rawError ?? null,
    createdAt: row.createdAt,
  })
}

import { Injectable, Inject } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { IMsLinkedGroupRepository } from '../../domain/repositories/ms-linked-group.repository'
import { MsLinkedGroupEntity } from '../../domain/entities/ms-linked-group.entity'
import { msLinkedGroup } from '../schema/planner.schema'

@Injectable()
export class DrizzleMsLinkedGroupRepository implements IMsLinkedGroupRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string): Promise<MsLinkedGroupEntity | null> {
    const rows = await this.db.select().from(msLinkedGroup).where(eq(msLinkedGroup.id, id)).limit(1)
    return rows.length > 0 ? rowToEntity(rows[0]!) : null
  }

  async findByTenantAndGroup(
    tenantId: string,
    msGroupId: string,
  ): Promise<MsLinkedGroupEntity | null> {
    const rows = await this.db
      .select()
      .from(msLinkedGroup)
      .where(and(eq(msLinkedGroup.tenantId, tenantId), eq(msLinkedGroup.msGroupId, msGroupId)))
      .limit(1)
    return rows.length > 0 ? rowToEntity(rows[0]!) : null
  }

  async listForTenant(tenantId: string): Promise<MsLinkedGroupEntity[]> {
    const rows = await this.db
      .select()
      .from(msLinkedGroup)
      .where(eq(msLinkedGroup.tenantId, tenantId))
    return rows.map(rowToEntity)
  }

  async listActiveForTenant(tenantId: string): Promise<MsLinkedGroupEntity[]> {
    const rows = await this.db
      .select()
      .from(msLinkedGroup)
      .where(and(eq(msLinkedGroup.tenantId, tenantId), isNull(msLinkedGroup.unlinkedAt)))
    return rows.map(rowToEntity)
  }

  async upsert(entity: MsLinkedGroupEntity): Promise<void> {
    await this.db
      .insert(msLinkedGroup)
      .values({
        id: entity.id,
        tenantId: entity.tenantId,
        msGroupId: entity.msGroupId,
        displayName: entity.displayName,
        linkedByActorId: entity.linkedByActorId,
        linkedAt: entity.linkedAt,
        syncEnabled: entity.syncEnabled,
        backfillingAt: entity.backfillingAt,
        backfillJobId: entity.backfillJobId,
        unlinkedAt: entity.unlinkedAt,
      })
      .onConflictDoUpdate({
        target: [msLinkedGroup.id],
        set: {
          displayName: entity.displayName,
          syncEnabled: entity.syncEnabled,
          backfillingAt: entity.backfillingAt,
          backfillJobId: entity.backfillJobId,
          unlinkedAt: entity.unlinkedAt,
        },
      })
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(msLinkedGroup)
      .where(and(eq(msLinkedGroup.id, id), eq(msLinkedGroup.tenantId, tenantId)))
  }

  async removeAllForTenant(tenantId: string): Promise<void> {
    await this.db.delete(msLinkedGroup).where(eq(msLinkedGroup.tenantId, tenantId))
  }
}

type MsLinkedGroupRow = typeof msLinkedGroup.$inferSelect

function rowToEntity(row: MsLinkedGroupRow): MsLinkedGroupEntity {
  return MsLinkedGroupEntity.reconstitute({
    id: row.id,
    tenantId: row.tenantId,
    msGroupId: row.msGroupId,
    displayName: row.displayName,
    linkedByActorId: row.linkedByActorId,
    linkedAt: row.linkedAt,
    syncEnabled: row.syncEnabled,
    backfillingAt: row.backfillingAt ?? null,
    backfillJobId: row.backfillJobId ?? null,
    unlinkedAt: row.unlinkedAt ?? null,
  })
}

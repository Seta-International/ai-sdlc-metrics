import { Injectable, Inject } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { IMsLinkedRosterRepository } from '../../domain/repositories/ms-linked-roster.repository'
import { MsLinkedRosterEntity } from '../../domain/entities/ms-linked-roster.entity'
import { msLinkedRoster } from '../schema/planner.schema'

@Injectable()
export class DrizzleMsLinkedRosterRepository implements IMsLinkedRosterRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByTenantAndRoster(
    tenantId: string,
    msRosterId: string,
  ): Promise<MsLinkedRosterEntity | null> {
    const rows = await this.db
      .select()
      .from(msLinkedRoster)
      .where(and(eq(msLinkedRoster.tenantId, tenantId), eq(msLinkedRoster.msRosterId, msRosterId)))
      .limit(1)
    return rows.length > 0 ? rowToEntity(rows[0]!) : null
  }

  async listForTenant(tenantId: string): Promise<MsLinkedRosterEntity[]> {
    const rows = await this.db
      .select()
      .from(msLinkedRoster)
      .where(eq(msLinkedRoster.tenantId, tenantId))
    return rows.map(rowToEntity)
  }

  async listActiveForTenant(tenantId: string): Promise<MsLinkedRosterEntity[]> {
    const rows = await this.db
      .select()
      .from(msLinkedRoster)
      .where(and(eq(msLinkedRoster.tenantId, tenantId), isNull(msLinkedRoster.unlinkedAt)))
    return rows.map(rowToEntity)
  }

  async upsert(entity: MsLinkedRosterEntity): Promise<void> {
    await this.db
      .insert(msLinkedRoster)
      .values({
        id: entity.id,
        tenantId: entity.tenantId,
        msRosterId: entity.msRosterId,
        displayName: entity.displayName,
        linkedByActorId: entity.linkedByActorId,
        linkedAt: entity.linkedAt,
        syncEnabled: entity.syncEnabled,
        mintedByFutureAt: entity.mintedByFutureAt,
        unlinkedAt: entity.unlinkedAt,
      })
      .onConflictDoUpdate({
        target: [msLinkedRoster.tenantId, msLinkedRoster.msRosterId],
        set: {
          displayName: entity.displayName,
          syncEnabled: entity.syncEnabled,
          mintedByFutureAt: entity.mintedByFutureAt,
          unlinkedAt: entity.unlinkedAt,
        },
      })
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(msLinkedRoster)
      .where(and(eq(msLinkedRoster.id, id), eq(msLinkedRoster.tenantId, tenantId)))
  }
}

type MsLinkedRosterRow = typeof msLinkedRoster.$inferSelect

function rowToEntity(row: MsLinkedRosterRow): MsLinkedRosterEntity {
  return MsLinkedRosterEntity.reconstitute({
    id: row.id,
    tenantId: row.tenantId,
    msRosterId: row.msRosterId,
    displayName: row.displayName,
    linkedByActorId: row.linkedByActorId,
    linkedAt: row.linkedAt,
    syncEnabled: row.syncEnabled,
    mintedByFutureAt: row.mintedByFutureAt ?? null,
    unlinkedAt: row.unlinkedAt ?? null,
  })
}

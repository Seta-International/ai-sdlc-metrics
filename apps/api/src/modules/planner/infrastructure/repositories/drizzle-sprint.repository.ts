import { Injectable, Inject } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { plannerSprint } from '../schema/planner.schema'
import type { ISprintRepository, SprintRecord } from '../../domain/repositories/sprint.repository'

@Injectable()
export class DrizzleSprintRepository implements ISprintRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async save(record: SprintRecord): Promise<void> {
    await this.db.insert(plannerSprint).values({
      id: record.id,
      tenantId: record.tenantId,
      planId: record.planId,
      name: record.name,
      startDate: record.startDate,
      endDate: record.endDate,
      completedAt: record.completedAt,
    })
  }

  async findById(id: string, tenantId: string): Promise<SprintRecord | null> {
    const rows = await this.db
      .select()
      .from(plannerSprint)
      .where(and(eq(plannerSprint.id, id), eq(plannerSprint.tenantId, tenantId)))

    if (rows.length === 0) return null
    const row = rows[0]!
    return {
      id: row.id,
      tenantId: row.tenantId,
      planId: row.planId,
      name: row.name,
      startDate: row.startDate, // Drizzle date() returns string
      endDate: row.endDate, // Drizzle date() returns string
      completedAt: row.completedAt ?? null,
    }
  }

  async listByPlan(planId: string, tenantId: string): Promise<SprintRecord[]> {
    const rows = await this.db
      .select()
      .from(plannerSprint)
      .where(and(eq(plannerSprint.planId, planId), eq(plannerSprint.tenantId, tenantId)))

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      planId: row.planId,
      name: row.name,
      startDate: row.startDate,
      endDate: row.endDate,
      completedAt: row.completedAt ?? null,
    }))
  }

  async complete(id: string, tenantId: string, completedAt: Date): Promise<void> {
    await this.db
      .update(plannerSprint)
      .set({ completedAt })
      .where(and(eq(plannerSprint.id, id), eq(plannerSprint.tenantId, tenantId)))
  }
}

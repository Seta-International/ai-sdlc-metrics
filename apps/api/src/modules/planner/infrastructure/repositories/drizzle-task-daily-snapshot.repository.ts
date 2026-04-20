import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, asc, between, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type {
  ITaskDailySnapshotRepository,
  Snapshot,
} from '../../domain/repositories/task-daily-snapshot.repository'
import { plannerTaskDailySnapshot } from '../schema/task-daily-snapshot.schema'

@Injectable()
export class DrizzleTaskDailySnapshotRepository implements ITaskDailySnapshotRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async upsert(snapshot: Snapshot): Promise<void> {
    await this.db
      .insert(plannerTaskDailySnapshot)
      .values({
        tenantId: snapshot.tenantId,
        planId: snapshot.planId,
        snapshotDate: snapshot.snapshotDate,
        totalCount: snapshot.totalCount,
        openCount: snapshot.openCount,
        completedCount: snapshot.completedCount,
        byPriority: snapshot.byPriority,
        byBucket: snapshot.byBucket,
        byAssignee: snapshot.byAssignee,
        completedInDay: snapshot.completedInDay,
      })
      .onConflictDoUpdate({
        target: [
          plannerTaskDailySnapshot.tenantId,
          plannerTaskDailySnapshot.planId,
          plannerTaskDailySnapshot.snapshotDate,
        ],
        set: {
          totalCount: snapshot.totalCount,
          openCount: snapshot.openCount,
          completedCount: snapshot.completedCount,
          byPriority: snapshot.byPriority,
          byBucket: snapshot.byBucket,
          byAssignee: snapshot.byAssignee,
          completedInDay: snapshot.completedInDay,
        },
      })
  }

  async listForPlanInRange(
    planId: string,
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<Snapshot[]> {
    const rows = await this.db
      .select()
      .from(plannerTaskDailySnapshot)
      .where(
        and(
          eq(plannerTaskDailySnapshot.planId, planId),
          eq(plannerTaskDailySnapshot.tenantId, tenantId),
          between(plannerTaskDailySnapshot.snapshotDate, startDate, endDate),
        ),
      )
      .orderBy(asc(plannerTaskDailySnapshot.snapshotDate))

    return rows.map((row) => ({
      tenantId: row.tenantId,
      planId: row.planId,
      snapshotDate: row.snapshotDate,
      totalCount: row.totalCount,
      openCount: row.openCount,
      completedCount: row.completedCount,
      byPriority: row.byPriority,
      byBucket: row.byBucket,
      byAssignee: row.byAssignee,
      completedInDay: row.completedInDay,
    }))
  }
}

import { Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, or } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { plannerTaskDependency } from '../schema/planner.schema'
import type {
  DependencyEdge,
  DependencyKind,
  DependencyRecord,
  ITaskDependencyRepository,
} from '../../domain/repositories/task-dependency.repository'

export class DrizzleTaskDependencyRepository implements ITaskDependencyRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async add(record: DependencyRecord): Promise<void> {
    await this.db.insert(plannerTaskDependency).values({
      tenantId: record.tenantId,
      fromTaskId: record.fromTaskId,
      toTaskId: record.toTaskId,
      kind: record.kind,
      createdBy: record.tenantId, // placeholder — no actorId in DependencyRecord
    })
  }

  async remove(
    fromTaskId: string,
    toTaskId: string,
    kind: DependencyKind,
    tenantId: string,
  ): Promise<void> {
    await this.db
      .delete(plannerTaskDependency)
      .where(
        and(
          eq(plannerTaskDependency.tenantId, tenantId),
          eq(plannerTaskDependency.fromTaskId, fromTaskId),
          eq(plannerTaskDependency.toTaskId, toTaskId),
          eq(plannerTaskDependency.kind, kind),
        ),
      )
  }

  async exists(
    fromTaskId: string,
    toTaskId: string,
    kind: DependencyKind,
    tenantId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: plannerTaskDependency.id })
      .from(plannerTaskDependency)
      .where(
        and(
          eq(plannerTaskDependency.tenantId, tenantId),
          eq(plannerTaskDependency.fromTaskId, fromTaskId),
          eq(plannerTaskDependency.toTaskId, toTaskId),
          eq(plannerTaskDependency.kind, kind),
        ),
      )
    return rows.length > 0
  }

  async listEdgesForPlan(planId: string, tenantId: string): Promise<DependencyEdge[]> {
    // Filter by tenantId only — task UUIDs are globally unique so cross-plan cycles can't happen
    const rows = await this.db
      .select()
      .from(plannerTaskDependency)
      .where(eq(plannerTaskDependency.tenantId, tenantId))
    return rows.map((r) => ({ from: r.fromTaskId, to: r.toTaskId, kind: r.kind as DependencyKind }))
  }

  async listForTask(
    taskId: string,
    tenantId: string,
  ): Promise<{ predecessors: DependencyRecord[]; successors: DependencyRecord[] }> {
    const rows = await this.db
      .select()
      .from(plannerTaskDependency)
      .where(
        and(
          eq(plannerTaskDependency.tenantId, tenantId),
          or(
            eq(plannerTaskDependency.fromTaskId, taskId),
            eq(plannerTaskDependency.toTaskId, taskId),
          ),
        ),
      )

    const predecessors: DependencyRecord[] = []
    const successors: DependencyRecord[] = []

    for (const row of rows) {
      if (row.toTaskId === taskId) {
        predecessors.push({
          fromTaskId: row.fromTaskId,
          toTaskId: row.toTaskId,
          kind: row.kind as DependencyKind,
          tenantId: row.tenantId,
        })
      } else if (row.fromTaskId === taskId) {
        successors.push({
          fromTaskId: row.fromTaskId,
          toTaskId: row.toTaskId,
          kind: row.kind as DependencyKind,
          tenantId: row.tenantId,
        })
      }
    }

    return { predecessors, successors }
  }
}

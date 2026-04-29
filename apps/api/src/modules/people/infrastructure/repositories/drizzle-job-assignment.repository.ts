import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm'
import type { JobAssignment } from '../../domain/entities/job-assignment.entity'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { jobAssignment } from '../schema/people.schema'

@Injectable()
export class DrizzleJobAssignmentRepository implements IJobAssignmentRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<JobAssignment | null> {
    const rows = await this.db
      .select()
      .from(jobAssignment)
      .where(and(eq(jobAssignment.id, id), eq(jobAssignment.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as JobAssignment | undefined) ?? null
  }

  async findCurrent(employmentId: string, tenantId: string): Promise<JobAssignment | null> {
    const rows = await this.db
      .select()
      .from(jobAssignment)
      .where(
        and(
          eq(jobAssignment.employmentId, employmentId),
          eq(jobAssignment.tenantId, tenantId),
          isNull(jobAssignment.effectiveTo),
        ),
      )
      .limit(1)
    return (rows[0] as JobAssignment | undefined) ?? null
  }

  async findCurrentMany(employmentIds: string[], tenantId: string): Promise<JobAssignment[]> {
    if (employmentIds.length === 0) return []
    return (await this.db
      .select()
      .from(jobAssignment)
      .where(
        and(
          eq(jobAssignment.tenantId, tenantId),
          inArray(jobAssignment.employmentId, employmentIds),
          isNull(jobAssignment.effectiveTo),
        ),
      )
      .orderBy(asc(jobAssignment.employmentId))) as JobAssignment[]
  }

  async findCurrentByManagerId(managerId: string, tenantId: string): Promise<JobAssignment[]> {
    return (await this.db
      .select()
      .from(jobAssignment)
      .where(
        and(
          eq(jobAssignment.tenantId, tenantId),
          eq(jobAssignment.managerId, managerId),
          isNull(jobAssignment.effectiveTo),
        ),
      )
      .orderBy(asc(jobAssignment.employmentId))) as JobAssignment[]
  }

  async countCurrentByManagerId(managerId: string, tenantId: string): Promise<number> {
    const rows = await this.db
      .select({ count: count() })
      .from(jobAssignment)
      .where(
        and(
          eq(jobAssignment.tenantId, tenantId),
          eq(jobAssignment.managerId, managerId),
          isNull(jobAssignment.effectiveTo),
        ),
      )
    return rows[0]?.count ?? 0
  }

  async findAsOf(
    employmentId: string,
    tenantId: string,
    asOfDate: Date,
  ): Promise<JobAssignment | null> {
    const rows = await this.db
      .select()
      .from(jobAssignment)
      .where(
        and(
          eq(jobAssignment.employmentId, employmentId),
          eq(jobAssignment.tenantId, tenantId),
          lte(jobAssignment.effectiveFrom, asOfDate),
          or(isNull(jobAssignment.effectiveTo), gt(jobAssignment.effectiveTo, asOfDate)),
        ),
      )
      .limit(1)
    return (rows[0] as JobAssignment | undefined) ?? null
  }

  async findHistory(employmentId: string, tenantId: string): Promise<JobAssignment[]> {
    return (await this.db
      .select()
      .from(jobAssignment)
      .where(
        and(eq(jobAssignment.employmentId, employmentId), eq(jobAssignment.tenantId, tenantId)),
      )
      .orderBy(desc(jobAssignment.effectiveFrom))) as JobAssignment[]
  }

  async insert(data: Omit<JobAssignment, 'id' | 'createdAt'>): Promise<JobAssignment> {
    const rows = await this.db
      .insert(jobAssignment)
      .values(data as typeof jobAssignment.$inferInsert)
      .returning()
    return rows[0] as JobAssignment
  }

  async closeAssignment(id: string, tenantId: string, effectiveTo: Date): Promise<void> {
    await this.db
      .update(jobAssignment)
      .set({ effectiveTo } as typeof jobAssignment.$inferInsert)
      .where(and(eq(jobAssignment.id, id), eq(jobAssignment.tenantId, tenantId)))
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(jobAssignment)
      .where(and(eq(jobAssignment.id, id), eq(jobAssignment.tenantId, tenantId)))
  }

  async updateManagerId(
    employmentId: string,
    managerId: string | null,
    tenantId: string,
  ): Promise<void> {
    const current = await this.findCurrent(employmentId, tenantId)
    if (!current) return
    await this.db
      .update(jobAssignment)
      .set({ managerId })
      .where(and(eq(jobAssignment.id, current.id), eq(jobAssignment.tenantId, tenantId)))
  }
}

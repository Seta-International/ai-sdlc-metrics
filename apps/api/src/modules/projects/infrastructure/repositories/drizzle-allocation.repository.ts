import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, isNull, sql, lte, gte, or } from 'drizzle-orm'
import type {
  Allocation,
  BillingType,
  MemberType,
  AllocationStatus,
} from '../../domain/entities/allocation.entity'
import type { IAllocationRepository } from '../../domain/repositories/allocation.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { allocation, project } from '../schema/index'

@Injectable()
export class DrizzleAllocationRepository implements IAllocationRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<Allocation | null> {
    const rows = await this.db
      .select()
      .from(allocation)
      .where(and(eq(allocation.id, id), eq(allocation.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as Allocation | undefined) ?? null
  }

  async findByActorId(actorId: string, tenantId: string): Promise<Allocation[]> {
    const rows = await this.db
      .select()
      .from(allocation)
      .where(and(eq(allocation.actorId, actorId), eq(allocation.tenantId, tenantId)))
    return rows as Allocation[]
  }

  async findActiveByActorId(actorId: string, tenantId: string): Promise<Allocation[]> {
    const rows = await this.db
      .select()
      .from(allocation)
      .where(
        and(
          eq(allocation.actorId, actorId),
          eq(allocation.tenantId, tenantId),
          isNull(allocation.endedAt),
        ),
      )
    return rows as Allocation[]
  }

  async findConfirmedByActorId(actorId: string, tenantId: string): Promise<Allocation[]> {
    const rows = await this.db
      .select()
      .from(allocation)
      .where(
        and(
          eq(allocation.actorId, actorId),
          eq(allocation.tenantId, tenantId),
          eq(allocation.status, 'confirmed'),
        ),
      )
    return rows as Allocation[]
  }

  async findByProjectRoleId(projectRoleId: string, tenantId: string): Promise<Allocation[]> {
    const rows = await this.db
      .select()
      .from(allocation)
      .where(and(eq(allocation.projectRoleId, projectRoleId), eq(allocation.tenantId, tenantId)))
    return rows as Allocation[]
  }

  async findByAccountId(accountId: string, tenantId: string): Promise<Allocation[]> {
    const rows = await this.db
      .select({
        id: allocation.id,
        tenantId: allocation.tenantId,
        projectId: allocation.projectId,
        projectRoleId: allocation.projectRoleId,
        actorId: allocation.actorId,
        position: allocation.position,
        hoursPerDay: allocation.hoursPerDay,
        billingType: allocation.billingType,
        memberType: allocation.memberType,
        status: allocation.status,
        startedAt: allocation.startedAt,
        endedAt: allocation.endedAt,
        note: allocation.note,
        createdAt: allocation.createdAt,
        updatedAt: allocation.updatedAt,
      })
      .from(allocation)
      .innerJoin(project, eq(allocation.projectId, project.id))
      .where(and(eq(project.accountId, accountId), eq(allocation.tenantId, tenantId)))
    return rows as Allocation[]
  }

  async insert(data: {
    tenantId: string
    projectId: string
    projectRoleId: string
    actorId: string | null
    position: string | null
    hoursPerDay: string
    billingType: BillingType
    memberType: MemberType
    startedAt: Date
    endedAt: Date | null
    note: string | null
  }): Promise<Allocation> {
    const rows = await this.db
      .insert(allocation)
      .values({
        tenantId: data.tenantId,
        projectId: data.projectId,
        projectRoleId: data.projectRoleId,
        actorId: data.actorId,
        position: data.position,
        hoursPerDay: data.hoursPerDay,
        billingType: data.billingType,
        memberType: data.memberType,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
        note: data.note,
      })
      .returning()
    return rows[0] as Allocation
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        Allocation,
        'position' | 'hoursPerDay' | 'billingType' | 'memberType' | 'startedAt' | 'endedAt' | 'note'
      >
    >,
  ): Promise<void> {
    await this.db
      .update(allocation)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(allocation.id, id), eq(allocation.tenantId, tenantId)))
  }

  async updateStatus(id: string, tenantId: string, status: AllocationStatus): Promise<void> {
    await this.db
      .update(allocation)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(allocation.id, id), eq(allocation.tenantId, tenantId)))
  }

  async close(id: string, tenantId: string, endedAt: Date): Promise<void> {
    await this.db
      .update(allocation)
      .set({ endedAt, updatedAt: new Date() })
      .where(and(eq(allocation.id, id), eq(allocation.tenantId, tenantId)))
  }

  async closeAllForActor(actorId: string, tenantId: string, endedAt: Date): Promise<void> {
    await this.db
      .update(allocation)
      .set({ endedAt, updatedAt: new Date() })
      .where(
        and(
          eq(allocation.actorId, actorId),
          eq(allocation.tenantId, tenantId),
          isNull(allocation.endedAt),
        ),
      )
  }

  /**
   * Flag confirmed allocations as tentative for actor within future date range.
   * Spec: "Find all confirmed allocations for actor within future date range."
   * Filters: started_at <= expectedLastDay AND (ended_at IS NULL OR ended_at >= NOW())
   */
  async flagTentativeForActor(
    actorId: string,
    tenantId: string,
    expectedLastDay: Date,
  ): Promise<void> {
    await this.db
      .update(allocation)
      .set({ status: 'tentative', updatedAt: new Date() })
      .where(
        and(
          eq(allocation.actorId, actorId),
          eq(allocation.tenantId, tenantId),
          eq(allocation.status, 'confirmed'),
          lte(allocation.startedAt, expectedLastDay),
          or(isNull(allocation.endedAt), gte(allocation.endedAt, new Date())),
        ),
      )
  }

  /**
   * Sum confirmed hours per day for actor within a date range.
   * Only includes allocations that overlap [startDate, endDate]:
   * WHERE started_at <= endDate AND (ended_at IS NULL OR ended_at >= startDate)
   */
  async sumConfirmedHoursPerDay(
    actorId: string,
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const result = await this.db
      .select({ total: sql<number>`COALESCE(SUM(${allocation.hoursPerDay}::numeric), 0)` })
      .from(allocation)
      .where(
        and(
          eq(allocation.actorId, actorId),
          eq(allocation.tenantId, tenantId),
          eq(allocation.status, 'confirmed'),
          lte(allocation.startedAt, endDate),
          or(isNull(allocation.endedAt), gte(allocation.endedAt, startDate)),
        ),
      )
    return Number(result[0]?.total ?? 0)
  }
}

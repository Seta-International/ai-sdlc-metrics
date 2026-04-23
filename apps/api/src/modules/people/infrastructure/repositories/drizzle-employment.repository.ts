import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm'
import type { Employment } from '../../domain/entities/employment.entity'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { EmploymentStatus } from '../../domain/value-objects/employment-status'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { employment, jobAssignment, personProfile } from '../schema/people.schema'

@Injectable()
export class DrizzleEmploymentRepository implements IEmploymentRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<Employment | null> {
    const rows = await this.db
      .select()
      .from(employment)
      .where(and(eq(employment.id, id), eq(employment.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as Employment | undefined) ?? null
  }

  async findManyByIds(ids: string[], tenantId: string): Promise<Employment[]> {
    if (ids.length === 0) return []
    const rows = await this.db
      .select()
      .from(employment)
      .where(and(eq(employment.tenantId, tenantId), inArray(employment.id, ids)))
      .orderBy(asc(employment.id))
    return rows as Employment[]
  }

  async findByPersonProfileId(personProfileId: string, tenantId: string): Promise<Employment[]> {
    const rows = await this.db
      .select()
      .from(employment)
      .where(
        and(eq(employment.personProfileId, personProfileId), eq(employment.tenantId, tenantId)),
      )
    return rows as Employment[]
  }

  async findActiveByActorId(actorId: string, tenantId: string): Promise<Employment | null> {
    const rows = await this.db
      .select()
      .from(employment)
      .innerJoin(personProfile, eq(employment.personProfileId, personProfile.id))
      .where(
        and(
          eq(personProfile.actorId, actorId),
          eq(employment.tenantId, tenantId),
          ne(employment.employmentStatus, 'terminated'),
        ),
      )
      .limit(1)
    return (rows[0]?.employment as Employment | undefined) ?? null
  }

  async findActiveRootEmployments(tenantId: string): Promise<Employment[]> {
    const rows = await this.db
      .select({ employment })
      .from(employment)
      .leftJoin(
        jobAssignment,
        and(
          eq(jobAssignment.employmentId, employment.id),
          eq(jobAssignment.tenantId, tenantId),
          isNull(jobAssignment.effectiveTo),
        ),
      )
      .where(
        and(
          eq(employment.tenantId, tenantId),
          ne(employment.employmentStatus, 'terminated'),
          isNull(jobAssignment.managerId),
        ),
      )
      .orderBy(asc(employment.employeeCode), asc(employment.id))
    return rows.map((row) => row.employment as Employment)
  }

  async insert(data: Omit<Employment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Employment> {
    const rows = await this.db
      .insert(employment)
      .values(data as typeof employment.$inferInsert)
      .returning()
    return rows[0] as Employment
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: EmploymentStatus,
    terminationDate?: Date | null,
    terminationReason?: string | null,
  ): Promise<void> {
    await this.db
      .update(employment)
      .set({
        employmentStatus: status,
        terminationDate: terminationDate ?? null,
        terminationReason: terminationReason ?? null,
        updatedAt: new Date(),
      } as typeof employment.$inferInsert)
      .where(and(eq(employment.id, id), eq(employment.tenantId, tenantId)))
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<Employment, 'id' | 'tenantId' | 'personProfileId' | 'createdAt'>>,
  ): Promise<Employment> {
    const rows = await this.db
      .update(employment)
      .set({ ...data, updatedAt: new Date() } as typeof employment.$inferInsert)
      .where(and(eq(employment.id, id), eq(employment.tenantId, tenantId)))
      .returning()
    return rows[0] as Employment
  }

  async listByTenant(
    tenantId: string,
    filters?: { status?: EmploymentStatus; countryCode?: string; limit?: number; offset?: number },
  ): Promise<Employment[]> {
    const conditions = [eq(employment.tenantId, tenantId)]
    if (filters?.status) conditions.push(eq(employment.employmentStatus, filters.status))
    if (filters?.countryCode) conditions.push(eq(employment.countryCode, filters.countryCode))
    let q = this.db
      .select()
      .from(employment)
      .where(and(...conditions))
      .$dynamic()
    if (filters?.limit !== undefined) q = q.limit(filters.limit)
    if (filters?.offset !== undefined) q = q.offset(filters.offset)
    return (await q) as Employment[]
  }

  async countByTenant(
    tenantId: string,
    filters?: { status?: EmploymentStatus; countryCode?: string },
  ): Promise<number> {
    const conditions = [eq(employment.tenantId, tenantId)]
    if (filters?.status) conditions.push(eq(employment.employmentStatus, filters.status))
    if (filters?.countryCode) conditions.push(eq(employment.countryCode, filters.countryCode))
    const result = await this.db
      .select({ count: count() })
      .from(employment)
      .where(and(...conditions))
    return result[0]?.count ?? 0
  }
}

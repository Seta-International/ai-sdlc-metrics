import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type {
  EmploymentProfile,
  EmploymentStatus,
} from '../../domain/entities/employment-profile.entity'
import type { IEmploymentProfileRepository } from '../../domain/repositories/employment-profile.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { employmentProfile } from '../schema/index'

@Injectable()
export class DrizzleEmploymentProfileRepository implements IEmploymentProfileRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<EmploymentProfile | null> {
    const rows = await this.db
      .select()
      .from(employmentProfile)
      .where(and(eq(employmentProfile.id, id), eq(employmentProfile.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as EmploymentProfile | undefined) ?? null
  }

  async findByActorId(actorId: string, tenantId: string): Promise<EmploymentProfile | null> {
    const rows = await this.db
      .select()
      .from(employmentProfile)
      .where(and(eq(employmentProfile.actorId, actorId), eq(employmentProfile.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as EmploymentProfile | undefined) ?? null
  }

  async findByEmployeeCode(
    employeeCode: string,
    tenantId: string,
  ): Promise<EmploymentProfile | null> {
    const rows = await this.db
      .select()
      .from(employmentProfile)
      .where(
        and(
          eq(employmentProfile.employeeCode, employeeCode),
          eq(employmentProfile.tenantId, tenantId),
        ),
      )
      .limit(1)
    return (rows[0] as EmploymentProfile | undefined) ?? null
  }

  async insert(
    data: Omit<EmploymentProfile, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<EmploymentProfile> {
    const rows = await this.db
      .insert(employmentProfile)
      .values({
        tenantId: data.tenantId,
        actorId: data.actorId,
        employeeCode: data.employeeCode,
        companyEmail: data.companyEmail,
        employmentType: data.employmentType,
        employmentStatus: data.employmentStatus,
        workArrangement: data.workArrangement,
        hireDate: data.hireDate,
        terminationDate: data.terminationDate ?? undefined,
        jobTitle: data.jobTitle,
        jobLevel: data.jobLevel ?? undefined,
        costCenter: data.costCenter ?? undefined,
      })
      .returning()
    return rows[0] as EmploymentProfile
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: EmploymentStatus,
    terminationDate?: Date,
  ): Promise<void> {
    await this.db
      .update(employmentProfile)
      .set({
        employmentStatus: status,
        terminationDate: terminationDate ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(employmentProfile.id, id), eq(employmentProfile.tenantId, tenantId)))
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<EmploymentProfile, 'id' | 'tenantId' | 'actorId' | 'createdAt'>>,
  ): Promise<EmploymentProfile> {
    const rows = await this.db
      .update(employmentProfile)
      .set({ ...data, updatedAt: new Date() } as Record<string, unknown>)
      .where(and(eq(employmentProfile.id, id), eq(employmentProfile.tenantId, tenantId)))
      .returning()
    return rows[0] as EmploymentProfile
  }

  async listByTenant(
    tenantId: string,
    filters?: { status?: EmploymentStatus; limit?: number; offset?: number },
  ): Promise<EmploymentProfile[]> {
    const conditions = [eq(employmentProfile.tenantId, tenantId)]

    if (filters?.status) {
      conditions.push(eq(employmentProfile.employmentStatus, filters.status))
    }

    let q = this.db
      .select()
      .from(employmentProfile)
      .where(and(...conditions))
      .$dynamic()

    if (filters?.limit !== undefined) q = q.limit(filters.limit)
    if (filters?.offset !== undefined) q = q.offset(filters.offset)

    const rows = await q
    return rows as EmploymentProfile[]
  }
}

import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, count, eq } from 'drizzle-orm'
import type { JobProfile } from '../../domain/entities/job-profile.entity'
import type { IJobProfileRepository } from '../../domain/repositories/job-profile.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { jobProfile } from '../schema/people.schema'

@Injectable()
export class DrizzleJobProfileRepository implements IJobProfileRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<JobProfile | null> {
    const rows = await this.db
      .select()
      .from(jobProfile)
      .where(and(eq(jobProfile.id, id), eq(jobProfile.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as JobProfile | undefined) ?? null
  }

  async listByTenant(
    tenantId: string,
    filters?: { familyId?: string; isActive?: boolean },
  ): Promise<JobProfile[]> {
    const conditions = [eq(jobProfile.tenantId, tenantId)]
    if (filters?.familyId !== undefined)
      conditions.push(eq(jobProfile.jobFamilyId, filters.familyId))
    if (filters?.isActive !== undefined) conditions.push(eq(jobProfile.isActive, filters.isActive))
    const rows = await this.db
      .select()
      .from(jobProfile)
      .where(and(...conditions))
    return rows as JobProfile[]
  }

  async insert(data: Omit<JobProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<JobProfile> {
    const rows = await this.db
      .insert(jobProfile)
      .values(data as Record<string, unknown>)
      .returning()
    return rows[0] as JobProfile
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Pick<JobProfile, 'title' | 'level' | 'description' | 'isActive'>>,
  ): Promise<JobProfile> {
    const rows = await this.db
      .update(jobProfile)
      .set({ ...data, updatedAt: new Date() } as Record<string, unknown>)
      .where(and(eq(jobProfile.id, id), eq(jobProfile.tenantId, tenantId)))
      .returning()
    return rows[0] as JobProfile
  }

  async countByJobFamilyId(jobFamilyId: string, tenantId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(jobProfile)
      .where(and(eq(jobProfile.jobFamilyId, jobFamilyId), eq(jobProfile.tenantId, tenantId)))
    return result[0]?.count ?? 0
  }
}

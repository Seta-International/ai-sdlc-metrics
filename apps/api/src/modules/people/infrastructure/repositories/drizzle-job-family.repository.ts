import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { JobFamily } from '../../domain/entities/job-family.entity'
import type { IJobFamilyRepository } from '../../domain/repositories/job-family.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { jobFamily } from '../schema/people.schema'

@Injectable()
export class DrizzleJobFamilyRepository implements IJobFamilyRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<JobFamily | null> {
    const rows = await this.db
      .select()
      .from(jobFamily)
      .where(and(eq(jobFamily.id, id), eq(jobFamily.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as JobFamily | undefined) ?? null
  }

  async listByTenant(tenantId: string): Promise<JobFamily[]> {
    const rows = await this.db.select().from(jobFamily).where(eq(jobFamily.tenantId, tenantId))
    return rows as JobFamily[]
  }

  async insert(data: Omit<JobFamily, 'id' | 'createdAt'>): Promise<JobFamily> {
    const rows = await this.db
      .insert(jobFamily)
      .values(data as typeof jobFamily.$inferInsert)
      .returning()
    return rows[0] as JobFamily
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Pick<JobFamily, 'name' | 'description' | 'parentId' | 'isActive'>>,
  ): Promise<JobFamily> {
    const rows = await this.db
      .update(jobFamily)
      .set(data as typeof jobFamily.$inferInsert)
      .where(and(eq(jobFamily.id, id), eq(jobFamily.tenantId, tenantId)))
      .returning()
    return rows[0] as JobFamily
  }
}

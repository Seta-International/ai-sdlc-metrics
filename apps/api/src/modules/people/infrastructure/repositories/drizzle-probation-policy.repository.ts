import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { ProbationPolicy } from '../../domain/entities/probation-policy.entity'
import type { IProbationPolicyRepository } from '../../domain/repositories/probation-policy.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { probationPolicy } from '../schema/people.schema'

@Injectable()
export class DrizzleProbationPolicyRepository implements IProbationPolicyRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<ProbationPolicy | null> {
    const rows = await this.db
      .select()
      .from(probationPolicy)
      .where(and(eq(probationPolicy.id, id), eq(probationPolicy.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as ProbationPolicy | undefined) ?? null
  }

  async findByCountryAndLevel(
    countryCode: string,
    jobLevelCategory: string,
    tenantId: string,
  ): Promise<ProbationPolicy | null> {
    const rows = await this.db
      .select()
      .from(probationPolicy)
      .where(
        and(
          eq(probationPolicy.tenantId, tenantId),
          eq(probationPolicy.countryCode, countryCode),
          eq(
            probationPolicy.jobLevelCategory,
            jobLevelCategory as ProbationPolicy['jobLevelCategory'],
          ),
        ),
      )
      .limit(1)
    return (rows[0] as ProbationPolicy | undefined) ?? null
  }

  async listByTenant(tenantId: string): Promise<ProbationPolicy[]> {
    const rows = await this.db
      .select()
      .from(probationPolicy)
      .where(eq(probationPolicy.tenantId, tenantId))
    return rows as ProbationPolicy[]
  }

  async insert(
    data: Omit<ProbationPolicy, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ProbationPolicy> {
    const rows = await this.db
      .insert(probationPolicy)
      .values(data as Record<string, unknown>)
      .returning()
    return rows[0] as ProbationPolicy
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<ProbationPolicy, 'id' | 'tenantId' | 'createdAt'>>,
  ): Promise<ProbationPolicy> {
    const rows = await this.db
      .update(probationPolicy)
      .set({ ...data, updatedAt: new Date() } as Record<string, unknown>)
      .where(and(eq(probationPolicy.id, id), eq(probationPolicy.tenantId, tenantId)))
      .returning()
    return rows[0] as ProbationPolicy
  }
}

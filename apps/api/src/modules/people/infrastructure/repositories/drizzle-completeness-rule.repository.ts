import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, isNull, or } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { CompletenessRule } from '../../domain/entities/completeness-rule.entity'
import type { ICompletenessRuleRepository } from '../../domain/repositories/completeness-rule.repository'
import { completenessRule } from '../schema/documents.schema'

@Injectable()
export class DrizzleCompletenessRuleRepository implements ICompletenessRuleRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findApplicable(
    tenantId: string,
    countryCode: string,
    employmentType: string,
  ): Promise<CompletenessRule[]> {
    return (await this.db
      .select()
      .from(completenessRule)
      .where(
        and(
          eq(completenessRule.tenantId, tenantId),
          or(isNull(completenessRule.countryCode), eq(completenessRule.countryCode, countryCode)),
          or(
            isNull(completenessRule.employmentType),
            eq(completenessRule.employmentType, employmentType),
          ),
        ),
      )
      .orderBy(asc(completenessRule.sortOrder))) as CompletenessRule[]
  }

  async listByTenant(tenantId: string): Promise<CompletenessRule[]> {
    return (await this.db
      .select()
      .from(completenessRule)
      .where(eq(completenessRule.tenantId, tenantId))
      .orderBy(asc(completenessRule.sortOrder))) as CompletenessRule[]
  }

  async insertMany(data: Omit<CompletenessRule, 'id'>[]): Promise<CompletenessRule[]> {
    const rows = await this.db
      .insert(completenessRule)
      .values(data as (typeof completenessRule.$inferInsert)[])
      .returning()
    return rows as CompletenessRule[]
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<CompletenessRule, 'id' | 'tenantId'>>,
  ): Promise<CompletenessRule> {
    const rows = await this.db
      .update(completenessRule)
      .set(data as Record<string, unknown>)
      .where(and(eq(completenessRule.id, id), eq(completenessRule.tenantId, tenantId)))
      .returning()
    return rows[0] as CompletenessRule
  }
}

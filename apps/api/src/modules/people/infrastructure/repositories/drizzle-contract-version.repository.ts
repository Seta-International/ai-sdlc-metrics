import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, lt, count } from 'drizzle-orm'
import type { ContractVersion } from '../../domain/entities/contract-version.entity'
import type { IContractVersionRepository } from '../../domain/repositories/contract-version.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { contractVersion } from '../schema/people.schema'

@Injectable()
export class DrizzleContractVersionRepository implements IContractVersionRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<ContractVersion | null> {
    const rows = await this.db
      .select()
      .from(contractVersion)
      .where(and(eq(contractVersion.id, id), eq(contractVersion.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as ContractVersion | undefined) ?? null
  }

  async findByEmploymentId(employmentId: string, tenantId: string): Promise<ContractVersion[]> {
    const rows = await this.db
      .select()
      .from(contractVersion)
      .where(
        and(eq(contractVersion.employmentId, employmentId), eq(contractVersion.tenantId, tenantId)),
      )
    return rows as ContractVersion[]
  }

  async findActiveByEmploymentId(
    employmentId: string,
    tenantId: string,
  ): Promise<ContractVersion | null> {
    const rows = await this.db
      .select()
      .from(contractVersion)
      .where(
        and(
          eq(contractVersion.employmentId, employmentId),
          eq(contractVersion.tenantId, tenantId),
          eq(contractVersion.status, 'active'),
        ),
      )
      .limit(1)
    return (rows[0] as ContractVersion | undefined) ?? null
  }

  async insert(data: Omit<ContractVersion, 'id' | 'createdAt'>): Promise<ContractVersion> {
    const rows = await this.db
      .insert(contractVersion)
      .values(data as typeof contractVersion.$inferInsert)
      .returning()
    return rows[0] as ContractVersion
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<
      Omit<ContractVersion, 'id' | 'tenantId' | 'employmentId' | 'createdAt' | 'createdBy'>
    >,
  ): Promise<ContractVersion> {
    const rows = await this.db
      .update(contractVersion)
      .set(data as typeof contractVersion.$inferInsert)
      .where(and(eq(contractVersion.id, id), eq(contractVersion.tenantId, tenantId)))
      .returning()
    return rows[0] as ContractVersion
  }

  async countExpiringBefore(tenantId: string, date: Date): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(contractVersion)
      .where(
        and(
          eq(contractVersion.tenantId, tenantId),
          eq(contractVersion.status, 'active'),
          lt(contractVersion.endDate, date),
        ),
      )
    return rows[0]?.total ?? 0
  }
}

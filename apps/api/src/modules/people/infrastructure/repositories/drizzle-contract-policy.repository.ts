import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { ContractPolicy } from '../../domain/entities/contract-policy.entity'
import type { IContractPolicyRepository } from '../../domain/repositories/contract-policy.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { contractPolicy } from '../schema/people.schema'

@Injectable()
export class DrizzleContractPolicyRepository implements IContractPolicyRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByCountry(countryCode: string, tenantId: string): Promise<ContractPolicy | null> {
    const rows = await this.db
      .select()
      .from(contractPolicy)
      .where(
        and(eq(contractPolicy.countryCode, countryCode), eq(contractPolicy.tenantId, tenantId)),
      )
      .limit(1)
    return (rows[0] as ContractPolicy | undefined) ?? null
  }

  async listByTenant(tenantId: string): Promise<ContractPolicy[]> {
    const rows = await this.db
      .select()
      .from(contractPolicy)
      .where(eq(contractPolicy.tenantId, tenantId))
    return rows as ContractPolicy[]
  }

  async insert(
    data: Omit<ContractPolicy, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ContractPolicy> {
    const rows = await this.db
      .insert(contractPolicy)
      .values(data as Record<string, unknown>)
      .returning()
    return rows[0] as ContractPolicy
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        ContractPolicy,
        | 'maxFixedTermMonths'
        | 'maxFixedTermRenewals'
        | 'forceIndefiniteAfter'
        | 'probationRequiresContract'
      >
    >,
  ): Promise<ContractPolicy> {
    const rows = await this.db
      .update(contractPolicy)
      .set({ ...data, updatedAt: new Date() } as Record<string, unknown>)
      .where(and(eq(contractPolicy.id, id), eq(contractPolicy.tenantId, tenantId)))
      .returning()
    return rows[0] as ContractPolicy
  }
}

import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, sql } from 'drizzle-orm'
import type { Account, BillingModel } from '../../domain/entities/account.entity'
import type { IAccountRepository } from '../../domain/repositories/account.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { account } from '../schema/index'

@Injectable()
export class DrizzleAccountRepository implements IAccountRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<Account | null> {
    const rows = await this.db
      .select()
      .from(account)
      .where(and(eq(account.id, id), eq(account.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as Account | undefined) ?? null
  }

  async insert(data: {
    tenantId: string
    name: string
    clientCompany: string | null
    description: string | null
    domain: string | null
    location: string | null
    timezone: string | null
    billingModel: BillingModel | null
    accountManagerId: string | null
    startedAt: Date | null
  }): Promise<Account> {
    const rows = await this.db
      .insert(account)
      .values({
        tenantId: data.tenantId,
        name: data.name,
        clientCompany: data.clientCompany,
        description: data.description,
        domain: data.domain,
        location: data.location,
        timezone: data.timezone,
        billingModel: data.billingModel,
        accountManagerId: data.accountManagerId,
        startedAt: data.startedAt,
      })
      .returning()
    return rows[0] as Account
  }

  async update(id: string, tenantId: string, data: Partial<Account>): Promise<void> {
    await this.db
      .update(account)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(account.id, id), eq(account.tenantId, tenantId)))
  }

  async list(tenantId: string, options: { limit: number; offset: number }): Promise<Account[]> {
    const rows = await this.db
      .select()
      .from(account)
      .where(eq(account.tenantId, tenantId))
      .limit(options.limit)
      .offset(options.offset)
    return rows as Account[]
  }

  async count(tenantId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(account)
      .where(eq(account.tenantId, tenantId))
    return Number(result[0]?.count ?? 0)
  }
}

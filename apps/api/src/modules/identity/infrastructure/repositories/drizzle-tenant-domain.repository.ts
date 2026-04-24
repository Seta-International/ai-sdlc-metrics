import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { TenantDomainEntity } from '../../domain/entities/tenant-domain.entity'
import type { ITenantDomainRepository } from '../../domain/repositories/tenant-domain.repository'
import type { TenantDomainStatus } from '../../domain/entities/tenant-domain.entity'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { tenantDomain } from '../schema/index'

type TenantDomainRow = typeof tenantDomain.$inferSelect

function toEntity(row: TenantDomainRow): TenantDomainEntity {
  return TenantDomainEntity.reconstruct({
    id: row.id,
    tenantId: row.tenantId,
    domain: row.domain,
    status: row.status as TenantDomainStatus,
    verificationTokenHash: row.verificationTokenHash,
    verifiedAt: row.verifiedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

@Injectable()
export class DrizzleTenantDomainRepository implements ITenantDomainRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(data: {
    tenantId: string
    domain: string
    status: TenantDomainStatus
    verificationTokenHash: string
    verifiedAt?: Date | null
  }): Promise<TenantDomainEntity> {
    const rows = await this.db
      .insert(tenantDomain)
      .values({
        tenantId: data.tenantId,
        domain: data.domain,
        status: data.status,
        verificationTokenHash: data.verificationTokenHash,
        verifiedAt: data.verifiedAt ?? undefined,
      })
      .returning()
    return toEntity(rows[0] as TenantDomainRow)
  }

  async findById(id: string, tenantId: string): Promise<TenantDomainEntity | null> {
    const rows = await this.db
      .select()
      .from(tenantDomain)
      .where(and(eq(tenantDomain.id, id), eq(tenantDomain.tenantId, tenantId)))
      .limit(1)
    const row = rows[0] as TenantDomainRow | undefined
    return row ? toEntity(row) : null
  }

  async findByTenantId(tenantId: string): Promise<TenantDomainEntity[]> {
    const rows = await this.db
      .select()
      .from(tenantDomain)
      .where(eq(tenantDomain.tenantId, tenantId))
    return (rows as TenantDomainRow[]).map(toEntity)
  }

  async findVerifiedByDomain(domain: string): Promise<TenantDomainEntity | null> {
    const rows = await this.db
      .select()
      .from(tenantDomain)
      .where(and(eq(tenantDomain.domain, domain), eq(tenantDomain.status, 'verified')))
      .limit(1)
    const row = rows[0] as TenantDomainRow | undefined
    return row ? toEntity(row) : null
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Pick<TenantDomainEntity, 'status' | 'verifiedAt' | 'verificationTokenHash'>>,
  ): Promise<void> {
    await this.db
      .update(tenantDomain)
      .set({ ...data, updatedAt: new Date() } as Record<string, unknown>)
      .where(and(eq(tenantDomain.id, id), eq(tenantDomain.tenantId, tenantId)))
  }
}

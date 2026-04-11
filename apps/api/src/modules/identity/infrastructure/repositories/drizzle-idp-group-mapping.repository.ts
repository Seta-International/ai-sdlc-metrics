import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { idpGroupMapping } from '../schema/index'

@Injectable()
export class DrizzleIdpGroupMappingRepository implements IIdpGroupMappingRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByProviderId(identityProviderId: string, tenantId: string): Promise<IdpGroupMapping[]> {
    const rows = await this.db
      .select()
      .from(idpGroupMapping)
      .where(
        and(
          eq(idpGroupMapping.identityProviderId, identityProviderId),
          eq(idpGroupMapping.tenantId, tenantId),
        ),
      )
    return rows as IdpGroupMapping[]
  }

  async findByTenantId(tenantId: string): Promise<IdpGroupMapping[]> {
    const rows = await this.db
      .select()
      .from(idpGroupMapping)
      .where(eq(idpGroupMapping.tenantId, tenantId))
    return rows as IdpGroupMapping[]
  }

  async upsert(data: {
    tenantId: string
    identityProviderId: string
    externalGroupId: string
    externalGroupName: string
    roleKey: string
    scopeType: IdpGroupMapping['scopeType']
    scopeId: string | null
  }): Promise<IdpGroupMapping> {
    const rows = await this.db
      .insert(idpGroupMapping)
      .values({
        tenantId: data.tenantId,
        identityProviderId: data.identityProviderId,
        externalGroupId: data.externalGroupId,
        externalGroupName: data.externalGroupName,
        roleKey: data.roleKey,
        scopeType: data.scopeType,
        scopeId: data.scopeId ?? undefined,
      })
      .onConflictDoUpdate({
        target: [
          idpGroupMapping.tenantId,
          idpGroupMapping.externalGroupId,
          idpGroupMapping.roleKey,
          idpGroupMapping.scopeType,
          idpGroupMapping.scopeId,
        ],
        set: {
          externalGroupName: data.externalGroupName,
          identityProviderId: data.identityProviderId,
          updatedAt: new Date(),
        },
      })
      .returning()
    return rows[0] as IdpGroupMapping
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(idpGroupMapping)
      .where(and(eq(idpGroupMapping.id, id), eq(idpGroupMapping.tenantId, tenantId)))
  }
}

import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { identityProvider } from '../schema/index'

@Injectable()
export class DrizzleIdentityProviderRepository implements IIdentityProviderRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<IdentityProviderEntity | null> {
    const rows = await this.db
      .select()
      .from(identityProvider)
      .where(and(eq(identityProvider.id, id), eq(identityProvider.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as IdentityProviderEntity | undefined) ?? null
  }

  async findByTenantId(tenantId: string): Promise<IdentityProviderEntity[]> {
    const rows = await this.db
      .select()
      .from(identityProvider)
      .where(eq(identityProvider.tenantId, tenantId))
    return rows as IdentityProviderEntity[]
  }

  async findPrimary(tenantId: string): Promise<IdentityProviderEntity | null> {
    const rows = await this.db
      .select()
      .from(identityProvider)
      .where(and(eq(identityProvider.tenantId, tenantId), eq(identityProvider.isPrimary, true)))
      .limit(1)
    return (rows[0] as IdentityProviderEntity | undefined) ?? null
  }

  async findPrimaryByTenantId(tenantId: string): Promise<IdentityProviderEntity | null> {
    return this.findPrimary(tenantId)
  }

  async insert(data: {
    tenantId: string
    providerType: IdentityProviderEntity['providerType']
    displayName: string
    clientId: string
    clientSecretRef: string
    directoryId: string | null
    isPrimary: boolean
    syncEnabled: boolean
  }): Promise<IdentityProviderEntity> {
    const rows = await this.db
      .insert(identityProvider)
      .values({
        tenantId: data.tenantId,
        providerType: data.providerType,
        displayName: data.displayName,
        clientId: data.clientId,
        clientSecretRef: data.clientSecretRef,
        directoryId: data.directoryId ?? undefined,
        isPrimary: data.isPrimary,
        syncEnabled: data.syncEnabled,
      })
      .returning()
    return rows[0] as IdentityProviderEntity
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        IdentityProviderEntity,
        | 'displayName'
        | 'clientId'
        | 'clientSecretRef'
        | 'directoryId'
        | 'isPrimary'
        | 'syncEnabled'
        | 'lastSyncAt'
        | 'syncStatus'
      >
    >,
  ): Promise<void> {
    await this.db
      .update(identityProvider)
      .set({ ...data, updatedAt: new Date() } as Record<string, unknown>)
      .where(and(eq(identityProvider.id, id), eq(identityProvider.tenantId, tenantId)))
  }
}

import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { ApiKeyEntity } from '../../domain/entities/api-key.entity'
import type { IApiKeyRepository } from '../../domain/repositories/api-key.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { apiKey } from '../schema/index'

@Injectable()
export class DrizzleApiKeyRepository implements IApiKeyRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByKeyHash(keyHash: string, tenantId: string): Promise<ApiKeyEntity | null> {
    const rows = await this.db
      .select()
      .from(apiKey)
      .where(and(eq(apiKey.keyHash, keyHash), eq(apiKey.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as ApiKeyEntity | undefined) ?? null
  }

  async insert(data: {
    tenantId: string
    actorId: string
    keyHash: string
    keyLastFour: string
    name: string
    expiresAt: Date | null
  }): Promise<ApiKeyEntity> {
    const rows = await this.db
      .insert(apiKey)
      .values({
        tenantId: data.tenantId,
        actorId: data.actorId,
        keyHash: data.keyHash,
        keyLastFour: data.keyLastFour,
        name: data.name,
        expiresAt: data.expiresAt ?? undefined,
      })
      .returning()
    return rows[0] as ApiKeyEntity
  }

  async revoke(id: string, tenantId: string): Promise<void> {
    await this.db
      .update(apiKey)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKey.id, id), eq(apiKey.tenantId, tenantId)))
  }

  async updateLastUsed(id: string, tenantId: string): Promise<void> {
    await this.db
      .update(apiKey)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(apiKey.id, id), eq(apiKey.tenantId, tenantId)))
  }
}

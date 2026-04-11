import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { ApiKey, ApiKeyEntity } from '../../domain/entities/api-key.entity'
import type {
  IApiKeyRepository,
  ApiKeyListItem,
} from '../../domain/repositories/api-key.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { apiKey } from '../schema/index'

@Injectable()
export class DrizzleApiKeyRepository implements IApiKeyRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<ApiKey | null> {
    const rows = await this.db
      .select()
      .from(apiKey)
      .where(and(eq(apiKey.id, id), eq(apiKey.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as ApiKeyEntity | undefined) ?? null
  }

  async findByKeyHash(keyHash: string, tenantId: string): Promise<ApiKey | null> {
    const rows = await this.db
      .select()
      .from(apiKey)
      .where(and(eq(apiKey.keyHash, keyHash), eq(apiKey.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as ApiKeyEntity | undefined) ?? null
  }

  async listByTenantId(tenantId: string): Promise<ApiKeyListItem[]> {
    const rows = await this.db.select().from(apiKey).where(eq(apiKey.tenantId, tenantId))
    return rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      name: row.name,
      keyLastFour: row.keyLastFour,
      lastUsedAt: row.lastUsedAt ?? null,
      expiresAt: row.expiresAt ?? null,
      revokedAt: row.revokedAt ?? null,
      createdAt: row.createdAt,
    }))
  }

  async insert(data: {
    tenantId: string
    actorId: string
    keyHash: string
    keyLastFour: string
    name: string
    expiresAt: Date | null
  }): Promise<ApiKey> {
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

  async revoke(id: string, tenantId: string, revokedAt: Date = new Date()): Promise<void> {
    await this.db
      .update(apiKey)
      .set({ revokedAt })
      .where(and(eq(apiKey.id, id), eq(apiKey.tenantId, tenantId)))
  }

  async updateLastUsedAt(
    id: string,
    tenantId: string,
    lastUsedAt: Date = new Date(),
  ): Promise<void> {
    await this.db
      .update(apiKey)
      .set({ lastUsedAt })
      .where(and(eq(apiKey.id, id), eq(apiKey.tenantId, tenantId)))
  }
}

import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { MagicLinkToken } from '../../domain/entities/magic-link-token.entity'
import type { IMagicLinkTokenRepository } from '../../domain/repositories/magic-link-token.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { magicLinkToken } from '../schema/index'

@Injectable()
export class DrizzleMagicLinkTokenRepository implements IMagicLinkTokenRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(data: {
    tenantId: string
    email: string
    tokenHash: string
    expiresAt: Date
  }): Promise<MagicLinkToken> {
    const rows = await this.db
      .insert(magicLinkToken)
      .values({
        tenantId: data.tenantId,
        email: data.email,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      })
      .returning()
    return rows[0] as MagicLinkToken
  }

  async findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null> {
    const rows = await this.db
      .select()
      .from(magicLinkToken)
      .where(
        and(
          eq(magicLinkToken.tokenHash, tokenHash),
          isNull(magicLinkToken.usedAt),
          gt(magicLinkToken.expiresAt, new Date()),
        ),
      )
      .limit(1)
    return (rows[0] as MagicLinkToken | undefined) ?? null
  }

  async markUsed(id: string, tenantId: string): Promise<void> {
    await this.db
      .update(magicLinkToken)
      .set({ usedAt: new Date() })
      .where(and(eq(magicLinkToken.id, id), eq(magicLinkToken.tenantId, tenantId)))
  }
}

import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { EmailGenerationConfig } from '../../domain/entities/email-generation-config.entity'
import type { IEmailGenerationConfigRepository } from '../../domain/repositories/email-generation-config.repository'
import { emailGenerationConfig } from '../schema/people.schema'

@Injectable()
export class DrizzleEmailGenerationConfigRepository implements IEmailGenerationConfigRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByTenantId(tenantId: string): Promise<EmailGenerationConfig | null> {
    const rows = await this.db
      .select()
      .from(emailGenerationConfig)
      .where(eq(emailGenerationConfig.tenantId, tenantId))
      .limit(1)
    return (rows[0] as EmailGenerationConfig) ?? null
  }

  async upsert(data: EmailGenerationConfig): Promise<EmailGenerationConfig> {
    const rows = await this.db
      .insert(emailGenerationConfig)
      .values(data as unknown as typeof emailGenerationConfig.$inferInsert)
      .onConflictDoUpdate({
        target: emailGenerationConfig.tenantId,
        set: {
          domain: data.domain,
          pattern: data.pattern,
          transliteration: data.transliteration,
        } as unknown as typeof emailGenerationConfig.$inferInsert,
      })
      .returning()
    return rows[0] as EmailGenerationConfig
  }
}

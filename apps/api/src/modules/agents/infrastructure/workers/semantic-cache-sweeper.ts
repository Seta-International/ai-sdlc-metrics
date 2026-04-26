import { Inject, Injectable, Logger } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentToolResultCache } from '../schema/agent-tool-result-cache.schema'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'

export const SEMANTIC_CACHE_SWEEPER_JOB_NAME = 'agents.semantic-cache-sweep'

@Injectable()
export class SemanticCacheSweeper {
  private readonly logger = new Logger(SemanticCacheSweeper.name)

  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async registerJob(pgBoss: PgBossService): Promise<void> {
    await pgBoss.schedule(SEMANTIC_CACHE_SWEEPER_JOB_NAME, '*/5 * * * *')
    pgBoss.registerScheduledWorker(SEMANTIC_CACHE_SWEEPER_JOB_NAME, async () => {
      await this.handle()
    })
  }

  async handle(): Promise<{ deletedCount: number }> {
    try {
      const result = await this.db
        .delete(agentToolResultCache)
        .where(
          sql`${agentToolResultCache.storedAt} + ${agentToolResultCache.ttlSeconds} * interval '1 second' < NOW()`,
        )
      const deletedCount = result.rowCount ?? 0
      this.logger.log(`SemanticCacheSweeper: deleted ${deletedCount} expired cache row(s)`)
      return { deletedCount }
    } catch (err) {
      this.logger.error('SemanticCacheSweeper: failed to sweep expired rows', err)
      return { deletedCount: 0 }
    }
  }
}

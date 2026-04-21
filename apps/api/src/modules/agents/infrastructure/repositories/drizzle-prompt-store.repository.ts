import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentPromptStore } from '../schema/agents.schema'
import type { PromptStore, PromptStoreEntry } from '../../domain/ports/prompt-store.port'

@Injectable()
export class DrizzlePromptStoreRepository implements PromptStore {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async putIfAbsent(
    input: Omit<PromptStoreEntry, 'firstSeenAt'>,
  ): Promise<{ entry: PromptStoreEntry; inserted: boolean }> {
    const rows = await this.db
      .insert(agentPromptStore)
      .values(input)
      .onConflictDoNothing({ target: agentPromptStore.contentHash })
      .returning()

    if (rows.length > 0) {
      return { entry: rows[0] as PromptStoreEntry, inserted: true }
    }
    const existing = await this.get(input.contentHash, input.tenantId)
    if (!existing) {
      throw new Error(
        `prompt_store race: conflict on ${input.contentHash} but row not visible to tenant`,
      )
    }
    return { entry: existing, inserted: false }
  }

  async get(contentHash: string, tenantId: string): Promise<PromptStoreEntry | null> {
    const rows = await this.db
      .select()
      .from(agentPromptStore)
      .where(
        and(eq(agentPromptStore.contentHash, contentHash), eq(agentPromptStore.tenantId, tenantId)),
      )
      .limit(1)
    return (rows[0] as PromptStoreEntry | undefined) ?? null
  }
}

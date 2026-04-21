import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentNarrativeStore } from '../schema/agents.schema'
import type { NarrativeStore, NarrativeStoreEntry } from '../../domain/ports/narrative-store.port'

@Injectable()
export class DrizzleNarrativeStoreRepository implements NarrativeStore {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async putIfAbsent(
    input: Omit<NarrativeStoreEntry, 'firstSeenAt'>,
  ): Promise<{ entry: NarrativeStoreEntry; inserted: boolean }> {
    const rows = await this.db
      .insert(agentNarrativeStore)
      .values(input)
      .onConflictDoNothing({ target: agentNarrativeStore.contentHash })
      .returning()

    if (rows.length > 0) {
      return { entry: rows[0] as NarrativeStoreEntry, inserted: true }
    }
    const existing = await this.get(input.contentHash, input.tenantId)
    if (!existing) {
      throw new Error(
        `narrative_store race: conflict on ${input.contentHash} but row not visible to tenant`,
      )
    }
    return { entry: existing, inserted: false }
  }

  async get(contentHash: string, tenantId: string): Promise<NarrativeStoreEntry | null> {
    const rows = await this.db
      .select()
      .from(agentNarrativeStore)
      .where(
        and(
          eq(agentNarrativeStore.contentHash, contentHash),
          eq(agentNarrativeStore.tenantId, tenantId),
        ),
      )
      .limit(1)
    return (rows[0] as NarrativeStoreEntry | undefined) ?? null
  }
}

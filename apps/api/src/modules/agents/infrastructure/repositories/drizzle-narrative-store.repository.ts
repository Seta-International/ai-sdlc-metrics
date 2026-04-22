import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { metrics } from '@opentelemetry/api'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { agentNarrativeStore } from '../schema/agents.schema'
import type { NarrativeStore, NarrativeStoreEntry } from '../../domain/ports/narrative-store.port'

const appendCounter = metrics
  .getMeter('agents.narrative-store')
  .createCounter('agent_narrative_store_append_total', {
    description: 'First-write appends to agent_narrative_store.',
  })

@Injectable()
export class DrizzleNarrativeStoreRepository implements NarrativeStore {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly audit: KernelAuditFacade,
  ) {}

  async appendIfMissing(
    input: Omit<NarrativeStoreEntry, 'firstSeenAt'> & { actorId: string },
  ): Promise<{ entry: NarrativeStoreEntry; wasAppended: boolean }> {
    const { actorId, ...row } = input
    const rows = await this.db
      .insert(agentNarrativeStore)
      .values(row)
      .onConflictDoNothing({ target: agentNarrativeStore.contentHash })
      .returning()

    if (rows.length > 0) {
      const entry = rows[0] as NarrativeStoreEntry
      appendCounter.add(1)
      await this.audit.recordEvent({
        tenantId: entry.tenantId,
        actorId,
        eventType: 'agent.narrative_stored',
        module: 'agents',
        subjectId: entry.contentHash,
        payload: { roleKey: entry.roleKey, byteCount: entry.content.length },
      })
      return { entry, wasAppended: true }
    }

    const existing = await this.get(row.contentHash, row.tenantId)
    if (!existing) {
      throw new Error(
        `narrative_store race: conflict on ${row.contentHash} but row not visible to tenant`,
      )
    }
    return { entry: existing, wasAppended: false }
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

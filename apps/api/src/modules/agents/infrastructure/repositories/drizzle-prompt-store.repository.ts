import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { metrics } from '@opentelemetry/api'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { agentPromptStore } from '../schema/agents.schema'
import type { PromptStore, PromptStoreEntry } from '../../domain/ports/prompt-store.port'

const appendCounter = metrics
  .getMeter('agents.prompt-store')
  .createCounter('agent_prompt_store_append_total', {
    description: 'First-write appends to agent_prompt_store, labeled by layer.',
  })

@Injectable()
export class DrizzlePromptStoreRepository implements PromptStore {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly audit: KernelAuditFacade,
  ) {}

  async appendIfMissing(
    input: Omit<PromptStoreEntry, 'firstSeenAt'> & { actorId: string },
  ): Promise<{ entry: PromptStoreEntry; wasAppended: boolean }> {
    const { actorId, ...row } = input
    const rows = await this.db
      .insert(agentPromptStore)
      .values(row)
      .onConflictDoNothing({ target: agentPromptStore.contentHash })
      .returning()

    if (rows.length > 0) {
      const entry = rows[0] as PromptStoreEntry
      appendCounter.add(1, { layer: entry.layer })
      await this.audit.recordEvent({
        tenantId: entry.tenantId,
        actorId,
        eventType: 'agent.prompt_stored',
        module: 'agents',
        subjectId: entry.contentHash,
        payload: { layer: entry.layer, byteCount: entry.content.length },
      })
      return { entry, wasAppended: true }
    }

    const existing = await this.get(row.contentHash, row.tenantId)
    if (!existing) {
      throw new Error(
        `prompt_store race: conflict on ${row.contentHash} but row not visible to tenant`,
      )
    }
    return { entry: existing, wasAppended: false }
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

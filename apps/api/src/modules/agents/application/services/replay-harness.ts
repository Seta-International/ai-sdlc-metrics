/**
 * Reconstructs the full LLM message array for a given trace_id by resolving
 * all pinned hashes from the agent session. Errors explicitly on any lookup
 * miss — no silent fallback, no fuzzy match.
 */

import { Inject, Injectable } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { PROMPT_STORE } from '../../domain/ports/prompt-store.port'
import type { PromptStore } from '../../domain/ports/prompt-store.port'
import { NARRATIVE_STORE } from '../../domain/ports/narrative-store.port'
import type { NarrativeStore } from '../../domain/ports/narrative-store.port'
import { AGENT_SESSION_PORT } from '../../domain/ports/agent-session.port'
import type { AgentSessionPort } from '../../domain/ports/agent-session.port'
import {
  agentConversationMessages,
  agentToolInvocations,
} from '../../infrastructure/schema/agents.schema'
import type { ReplayResult, LlmMessageArray, ToolCallRecord } from '../../domain/scorer-types'

export class ReplayLookupMissError extends Error {
  constructor(
    public readonly hash: string,
    public readonly expectedLayer: string,
    public readonly traceId: string,
  ) {
    super(`Replay lookup miss: hash=${hash} layer=${expectedLayer} traceId=${traceId}`)
    this.name = 'ReplayLookupMissError'
  }
}

export class ReplayToolOutputMissError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly traceId: string,
  ) {
    super(`Replay tool output miss: tool=${toolName} traceId=${traceId} (turn not 100%-captured)`)
    this.name = 'ReplayToolOutputMissError'
  }
}

export const REPLAY_HARNESS = Symbol('REPLAY_HARNESS')

export type ReplayOpts = {
  traceId: string
  mode: 'prompt-only' | 'full'
}

@Injectable()
export class ReplayHarness {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(PROMPT_STORE) private readonly promptStore: PromptStore,
    @Inject(NARRATIVE_STORE) private readonly narrativeStore: NarrativeStore,
    @Inject(AGENT_SESSION_PORT) private readonly sessionPort: AgentSessionPort,
  ) {}

  async replay(opts: ReplayOpts): Promise<ReplayResult> {
    const { traceId, mode } = opts

    // Load the user message for this traceId — we need conversationId +
    // tenantId + userId to look up the session.
    const messageRows = await this.db
      .select()
      .from(agentConversationMessages)
      .where(
        and(
          eq(agentConversationMessages.traceId, traceId),
          eq(agentConversationMessages.role, 'user'),
        ),
      )
      .limit(1)

    const messageRow = messageRows[0]
    if (!messageRow) {
      throw new ReplayLookupMissError(traceId, 'session', traceId)
    }

    const { tenantId, userId, conversationId } = messageRow
    const userContent = (messageRow.content as { text?: string } | null)?.text ?? ''

    const session = await this.sessionPort.findByConversation({
      tenantId,
      userId,
      conversationId,
    })

    if (!session) {
      throw new ReplayLookupMissError(traceId, 'session', traceId)
    }

    const {
      routerPromptHash,
      permissionNarrativeHash,
      toolCatalogHash,
      canonicalizerVersionHash,
      pinnedSubAgentPromptHashes,
    } = session

    const routerPromptEntry = await this.promptStore.get(routerPromptHash, tenantId)
    if (!routerPromptEntry) {
      throw new ReplayLookupMissError(routerPromptHash, 'router', traceId)
    }

    const narrativeEntry = await this.narrativeStore.get(permissionNarrativeHash, tenantId)
    if (!narrativeEntry) {
      throw new ReplayLookupMissError(permissionNarrativeHash, 'permission_narrative', traceId)
    }

    const toolCatalogEntry = await this.promptStore.get(toolCatalogHash, tenantId)
    if (!toolCatalogEntry) {
      throw new ReplayLookupMissError(toolCatalogHash, 'tool_catalog', traceId)
    }

    const resolvedSubAgentHashes: Record<string, string> = {}
    for (const [key, hash] of Object.entries(pinnedSubAgentPromptHashes)) {
      const entry = await this.promptStore.get(hash, tenantId)
      if (!entry) {
        throw new ReplayLookupMissError(hash, `sub_agent:${key}`, traceId)
      }
      resolvedSubAgentHashes[key] = hash
    }

    const systemContent = [
      routerPromptEntry.content,
      narrativeEntry.content,
      toolCatalogEntry.content,
    ]
      .filter(Boolean)
      .join('\n\n')

    const messageTurn: LlmMessageArray = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ]

    // Tool outputs (full mode only).
    let toolOutputs: ToolCallRecord[] | undefined

    if (mode === 'full') {
      const invocationRows = await this.db
        .select()
        .from(agentToolInvocations)
        .where(eq(agentToolInvocations.traceId, traceId))

      const records: ToolCallRecord[] = []
      for (const row of invocationRows) {
        // resultPreview is a Buffer (bytea). A null resultPreview with no
        // resultHash means the output was never captured → raise.
        if (row.resultPreview === null && row.resultHash === null) {
          throw new ReplayToolOutputMissError(row.toolName, traceId)
        }

        let result: unknown
        if (row.resultPreview !== null) {
          try {
            result = JSON.parse(row.resultPreview.toString('utf8'))
          } catch {
            result = row.resultPreview.toString('utf8')
          }
        }

        records.push({
          toolName: row.toolName,
          args: row.args as Record<string, unknown>,
          result,
        })
      }

      toolOutputs = records
    }

    const pinnedVersions: Record<string, string> = {
      routerPrompt: routerPromptHash,
      permissionNarrative: permissionNarrativeHash,
      toolCatalog: toolCatalogHash,
      ...resolvedSubAgentHashes,
    }

    return {
      messages: [messageTurn],
      toolOutputs,
      pinnedVersions,
      canonicalizerVersionHash,
    } as ReplayResult
  }
}

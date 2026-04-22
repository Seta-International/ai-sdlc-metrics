/**
 * Plan 02 — Agent session port.
 *
 * A session pins the hashes that make a conversation turn deterministically
 * replayable. Created at the first turn of a conversation; referenced by every
 * subsequent turn so mid-session registry changes do NOT affect active
 * sessions.
 */
export interface AgentSessionEntry {
  id: string
  tenantId: string
  userId: string
  conversationId: string
  routerPromptHash: string
  permissionNarrativeHash: string
  toolCatalogHash: string
  directiveSchemaHash: string
  canonicalizerVersionHash: string
  /**
   * Map of sub-agent key → prompt content hash, captured at session start.
   * Downstream turns re-resolve sub-agents via these pinned hashes.
   */
  pinnedSubAgentPromptHashes: Record<string, string>
  startedAt: Date
  endedAt: Date | null
}

export interface AgentSessionPort {
  /**
   * Return the most-recent active (non-ended) session for this conversation,
   * or `null` when no such session exists. Ordered by `startedAt DESC`.
   */
  findByConversation(opts: {
    tenantId: string
    userId: string
    conversationId: string
  }): Promise<AgentSessionEntry | null>

  create(entry: Omit<AgentSessionEntry, 'startedAt' | 'endedAt'>): Promise<AgentSessionEntry>

  /**
   * Set `ended_at = now()` on the session with the given id. No-op when the
   * row does not exist or is already ended.
   */
  endSession(id: string): Promise<void>
}

export const AGENT_SESSION_PORT = Symbol('AGENT_SESSION_PORT')

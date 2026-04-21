export type PromptLayer = 'system' | 'router' | 'sub_agent' | 'tool_catalog' | 'directive_schema'

export interface PromptStoreEntry {
  contentHash: string
  layer: PromptLayer
  content: string
  tenantId: string
  firstSeenAt: Date
}

/**
 * Hash-keyed, content-addressable prompt store.
 *
 * Primary key is `contentHash` alone, NOT `(contentHash, tenantId)`. Identical
 * prompt content produces the same SHA-256, so two tenants writing the same
 * layer content dedupe to a single row — the first writer wins `firstSeenAt`
 * and `tenantId`. Subsequent tenants calling `appendIfMissing` for the same
 * hash observe `wasAppended: false` and receive the row the first tenant
 * inserted.
 *
 * Tenant isolation is enforced on reads: `get(hash, tenantId)` filters by
 * `tenantId` (app-level) and RLS is enabled + forced on the table. A tenant
 * whose `tenantId` does not match the stored row observes `null`.
 *
 * This is a cache, not a tenant-owned record. Do not embed tenant-specific
 * data in prompt content — if it's the same text, it's the same cache entry.
 *
 * First-write emits a `agent.prompt_stored` kernel audit event attributed to
 * `actorId` (the turn initiator or scheduling principal that triggered
 * prompt assembly).
 */
export interface PromptStore {
  appendIfMissing(
    entry: Omit<PromptStoreEntry, 'firstSeenAt'> & { actorId: string },
  ): Promise<{ entry: PromptStoreEntry; wasAppended: boolean }>
  get(contentHash: string, tenantId: string): Promise<PromptStoreEntry | null>
}

export const PROMPT_STORE = Symbol('PROMPT_STORE')

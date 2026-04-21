export type PromptLayer = 'system' | 'developer' | 'user' | 'tool_catalog'

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
 * **Primary key is `contentHash` alone, NOT `(contentHash, tenantId)`.** This is
 * deliberate: identical prompt content produces the same SHA-256, so two tenants
 * writing the same system/developer prompt dedupe to a single row — the first
 * writer wins `firstSeenAt` and `tenantId`. Subsequent tenants calling
 * `putIfAbsent` for the same hash observe `inserted: false` and receive the row
 * the first tenant inserted.
 *
 * Tenant isolation is enforced on reads: `get(hash, tenantId)` filters by
 * `tenantId` (app-level) and RLS is enabled + forced on the table. A tenant
 * whose `tenantId` does not match the stored row observes `null`.
 *
 * This is a cache, not a tenant-owned record. Do not store tenant-specific data
 * in prompt content — by definition, if it's the same text, it's the same cache
 * entry.
 */
export interface PromptStore {
  /**
   * Idempotent write. If `contentHash` already exists, returns the stored row
   * (not the input) and `inserted: false`. The stored row may have been inserted
   * under a different `tenantId`; see the `PromptStore` interface docs.
   */
  putIfAbsent(
    entry: Omit<PromptStoreEntry, 'firstSeenAt'>,
  ): Promise<{ entry: PromptStoreEntry; inserted: boolean }>
  get(contentHash: string, tenantId: string): Promise<PromptStoreEntry | null>
}

export const PROMPT_STORE = Symbol('PROMPT_STORE')

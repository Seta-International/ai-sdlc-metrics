export interface NarrativeStoreEntry {
  contentHash: string
  tenantId: string
  roleId: string
  content: string
  firstSeenAt: Date
}

/**
 * Hash-keyed, content-addressable role-narrative store.
 *
 * **Primary key is `contentHash` alone, NOT `(contentHash, tenantId)`.** Same
 * cache semantics as `PromptStore`: identical `(content, roleId)` produces the
 * same hash and dedupes to a single row across tenants. First writer wins
 * `firstSeenAt`, `tenantId`, and `roleId`; subsequent `putIfAbsent` calls
 * observe `inserted: false` and receive the row the first tenant inserted.
 *
 * Tenant isolation is enforced on reads: `get(hash, tenantId)` filters by
 * `tenantId` and RLS is enabled + forced on the table. A tenant whose
 * `tenantId` does not match the stored row observes `null`.
 *
 * This is a cache, not a tenant-owned record. Do not embed tenant-specific data
 * in narrative content — by definition, identical text = identical cache entry.
 */
export interface NarrativeStore {
  /**
   * Idempotent write. If `contentHash` already exists, returns the stored row
   * (not the input) and `inserted: false`. The stored row may have been
   * inserted under a different `tenantId` or `roleId`; see the `NarrativeStore`
   * interface docs.
   */
  putIfAbsent(
    entry: Omit<NarrativeStoreEntry, 'firstSeenAt'>,
  ): Promise<{ entry: NarrativeStoreEntry; inserted: boolean }>
  get(contentHash: string, tenantId: string): Promise<NarrativeStoreEntry | null>
}

export const NARRATIVE_STORE = Symbol('NARRATIVE_STORE')

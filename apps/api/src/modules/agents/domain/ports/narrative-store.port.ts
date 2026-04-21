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
 * Primary key is `contentHash` alone, NOT `(contentHash, tenantId)`. Same
 * cache semantics as `PromptStore`: identical `(content, roleId)` produces
 * the same hash and dedupes to a single row across tenants. First writer
 * wins `firstSeenAt`, `tenantId`, and `roleId`; subsequent `appendIfMissing`
 * calls observe `wasAppended: false` and receive the row the first tenant
 * inserted.
 *
 * Tenant isolation is enforced on reads: `get(hash, tenantId)` filters by
 * `tenantId` and RLS is enabled + forced on the table. A tenant whose
 * `tenantId` does not match the stored row observes `null`.
 *
 * This is a cache, not a tenant-owned record. Do not embed tenant-specific
 * data in narrative content — identical text = identical cache entry.
 *
 * First-write emits a `agent.narrative_stored` kernel audit event attributed
 * to `actorId` (the principal whose permission evaluation produced the
 * narrative).
 */
export interface NarrativeStore {
  appendIfMissing(
    entry: Omit<NarrativeStoreEntry, 'firstSeenAt'> & { actorId: string },
  ): Promise<{ entry: NarrativeStoreEntry; wasAppended: boolean }>
  get(contentHash: string, tenantId: string): Promise<NarrativeStoreEntry | null>
}

export const NARRATIVE_STORE = Symbol('NARRATIVE_STORE')

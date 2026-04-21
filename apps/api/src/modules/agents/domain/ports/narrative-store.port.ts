export interface NarrativeStoreEntry {
  contentHash: string
  tenantId: string
  roleId: string
  content: string
  firstSeenAt: Date
}

export interface NarrativeStore {
  putIfAbsent(
    entry: Omit<NarrativeStoreEntry, 'firstSeenAt'>,
  ): Promise<{ entry: NarrativeStoreEntry; inserted: boolean }>
  get(contentHash: string, tenantId: string): Promise<NarrativeStoreEntry | null>
}

export const NARRATIVE_STORE = Symbol('NARRATIVE_STORE')

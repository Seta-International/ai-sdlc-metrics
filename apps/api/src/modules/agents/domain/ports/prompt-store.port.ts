export type PromptLayer = 'system' | 'developer' | 'user' | 'tool_catalog'

export interface PromptStoreEntry {
  contentHash: string
  layer: PromptLayer
  content: string
  tenantId: string
  firstSeenAt: Date
}

export interface PromptStore {
  /**
   * Idempotent write: if the (contentHash, tenantId) already exists, return it without rewriting.
   * Returns the stored entry and whether the write actually inserted a row.
   */
  putIfAbsent(
    entry: Omit<PromptStoreEntry, 'firstSeenAt'>,
  ): Promise<{ entry: PromptStoreEntry; inserted: boolean }>
  get(contentHash: string, tenantId: string): Promise<PromptStoreEntry | null>
}

export const PROMPT_STORE = Symbol('PROMPT_STORE')

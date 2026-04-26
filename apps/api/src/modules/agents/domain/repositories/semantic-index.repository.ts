export interface SemanticIndexResult {
  sourceId: string
  sourceType: string
  score: number
}

export interface SemanticIndexRepository {
  index(opts: {
    tenantId: string
    /** Required for GDPR purgeForUser — stored on the row for O(1) erasure. */
    userId: string
    /** Sub-agent that opted into semantic recall (null = applies to all). */
    subAgentId?: string | null
    sourceId: string
    sourceType: string
    text: string
    embedding: number[]
    embeddingModel: string
    retentionPolicy?: string
    metadata?: Record<string, unknown>
  }): Promise<void>

  search(opts: {
    tenantId: string
    userId: string
    /**
     * Pre-computed embedding of the query text. The caller is responsible for
     * embedding the raw query string before calling this method — keeps the
     * repository free of external API dependencies.
     */
    queryEmbedding: number[]
    embeddingModel: string
    topK: number
    /** Optional: scope to a specific sub-agent's recall entries. */
    subAgentId?: string | null
  }): Promise<ReadonlyArray<SemanticIndexResult>>

  purgeForUser(opts: { tenantId: string; userId: string }): Promise<{ count: number }>
}

export const SEMANTIC_INDEX_REPOSITORY = Symbol('SEMANTIC_INDEX_REPOSITORY')

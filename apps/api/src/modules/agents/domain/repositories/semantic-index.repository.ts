export interface SemanticIndexResult {
  sourceId: string
  sourceType: string
  score: number
}

export interface SemanticIndexRepository {
  index(opts: {
    tenantId: string
    sourceId: string
    sourceType: string
    text: string
    retentionPolicy?: string
  }): Promise<void>

  search(opts: {
    tenantId: string
    query: string
    topK: number
  }): Promise<ReadonlyArray<SemanticIndexResult>>

  purgeForUser(opts: { tenantId: string; userId: string }): Promise<{ count: number }>
}

export const SEMANTIC_INDEX_REPOSITORY = Symbol('SEMANTIC_INDEX_REPOSITORY')

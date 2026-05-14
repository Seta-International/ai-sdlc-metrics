/**
 * A single result chunk returned from a vector similarity search.
 * score is cosine similarity in [0, 1] where 1 = identical.
 */
export interface VectorChunk {
  sourceId: string
  content: string
  score: number
  metadata?: Record<string, unknown>
}

/**
 * Input for upserting a single chunk into the vector store.
 * tenantId is explicit here (not read from context) because upsert is
 * called from background indexers that may run outside a request ALS context.
 */
export interface VectorUpsertInput {
  sourceId: string
  tenantId: string
  content: string
  /** Byte-offset range of this chunk within the source document */
  charRange: { start: number; end: number }
  metadata: Record<string, unknown>
  embedding: number[]
}

export interface VectorSearchParams {
  tenantId: string
  vector: number[]
  topK: number
  /** Metadata filter — same key/value syntax as the underlying store's filter DSL */
  filter?: Record<string, unknown>
}

/**
 * Tenant-scoped vector store abstraction.
 * The pg implementation uses HNSW with iterative_scan=strict_order for
 * correctness under multi-tenant RLS filtering (see platform/agent/vector/SCOPE.md).
 */
export interface VectorStore {
  search(params: VectorSearchParams): Promise<VectorChunk[]>
  upsert(input: VectorUpsertInput): Promise<void>
}

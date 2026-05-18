import type { EmbeddingsClient } from '@seta/agent-embeddings'
import type { DbSql } from '@seta/db'

/** Dependencies injected at construction by `createAgentRag`. */
export interface RagDeps {
  sql: DbSql
  embeddings: EmbeddingsClient
}

export interface IngestOptions {
  /** Chunk size in tokens. Default: 512. */
  maxTokens?: number
  /** Rolling-window overlap in tokens. Default: 64. */
  overlapTokens?: number
  signal?: AbortSignal
}

export interface RetrieveOptions {
  /** Top-k after fusion. Default: 8. */
  k?: number
  /** Vector similarity floor (0..1). Default: 0.3. */
  minSim?: number
  /** RRF smoothing constant. Default: 60 (literature standard). Advanced. */
  rrfK?: number
  signal?: AbortSignal
}

export interface RagCitation {
  sourceId: string
  /**
   * Character span into the original ingested content.
   * `null` only for chunks ingested before the `span jsonb` column landed.
   */
  span: { startChar: number; endChar: number } | null
}

export interface RagHit {
  chunkId: string
  sourceId: string
  content: string
  /** Fused rank score (higher = better). */
  rrfScore: number
  /** 1-based rank in the vector leg. Always present in P1. */
  vectorRank?: number
  /** Reserved for P2 hybrid retrieve. `undefined` in P1. */
  ftsRank?: number
  /** 0..1 cosine similarity from `searchChunks`. */
  vectorSimilarity?: number
  citation: RagCitation
}

export interface RagApi {
  ingest(sourceId: string, content: string, opts?: IngestOptions): Promise<void>
  retrieve(query: string, opts?: RetrieveOptions): Promise<RagHit[]>
}

/** Input to `fuseByRRF`: one ranked list per leg. */
export interface RankedItem {
  id: string
}

/** Output of `fuseByRRF`. */
export interface FusedItem {
  id: string
  rrfScore: number
  /** `ranks[legIndex] = 1-based rank within that leg`. */
  ranks: Record<number, number>
}

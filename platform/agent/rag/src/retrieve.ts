import type { EmbeddingsClient } from '@seta/agent-embeddings'
import { searchChunks } from '@seta/agent-vector'
import type { DbSql } from '@seta/db'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenancy'
import { fuseByRRF } from './rrf.js'
import type { RagHit, RetrieveOptions } from './types.js'

const log = logger.child({ service: 'agent-rag' })

const DEFAULT_K = 8
const DEFAULT_MIN_SIM = 0.3
const DEFAULT_RRF_K = 60

export interface RetrieveDeps {
  sql: DbSql
  embeddings: EmbeddingsClient
}

/**
 * Build the `retrieve(query, opts)` closure bound to `deps`.
 *
 * P1 is vector-only: a single ranked list runs through `fuseByRRF` so the
 * output shape (`rrfScore`, `vectorRank`, `ranks`) is uniform with the
 * P2 hybrid path. Single-leg passthrough is mathematically identity in
 * rank order.
 *
 * Errors propagate unchanged. `AbortError` is logged at `info` not
 * `error` — abort is normal control flow, not a failure.
 */
export function createRetrieve(deps: RetrieveDeps) {
  return async function retrieve(query: string, opts: RetrieveOptions = {}): Promise<RagHit[]> {
    const tenantId = tenantContext.getTenantId()
    const k = opts.k ?? DEFAULT_K
    const minSim = opts.minSim ?? DEFAULT_MIN_SIM
    const rrfK = opts.rrfK ?? DEFAULT_RRF_K

    log.info({ tenantId, queryLength: query.length, k, minSim }, 'retrieve:start')

    try {
      const { embeddings: vecs } = await deps.embeddings.embed(
        [query],
        opts.signal !== undefined ? { signal: opts.signal } : {},
      )
      const vec = vecs[0]!
      log.debug({ tenantId }, 'retrieve:embedded')

      const hits = await searchChunks(deps.sql, vec, { k, minSim })
      log.debug({ tenantId, k, returned: hits.length }, 'retrieve:searched')

      const ranked = hits.map((h) => ({ id: h.id }))
      const fused = fuseByRRF([ranked], rrfK)

      const byId = new Map(hits.map((h) => [h.id, h]))
      const result: RagHit[] = fused.map((f) => {
        const h = byId.get(f.id)!
        return {
          chunkId: h.id,
          sourceId: h.sourceId,
          content: h.content,
          rrfScore: f.rrfScore,
          vectorRank: f.ranks[0]!,
          vectorSimilarity: h.similarity,
          citation: { sourceId: h.sourceId, span: h.span },
        }
      })

      log.info({ tenantId, k, returned: result.length }, 'retrieve:done')
      return result
    } catch (err) {
      if (isAbortError(err)) {
        log.info({ tenantId }, 'retrieve:aborted')
        throw err
      }
      log.error({ err, tenantId }, 'retrieve:failed')
      throw err
    }
  }
}

function isAbortError(e: unknown): boolean {
  if (e instanceof Error) {
    if (e.name === 'AbortError') return true
    const code = (e as unknown as { code?: unknown }).code
    if (typeof code === 'string' && code === 'ABORT_ERR') return true
  }
  return false
}

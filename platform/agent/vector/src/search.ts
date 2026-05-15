import { type DbSql, withTenant } from '@seta/db'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { VectorQueryFailedError } from './errors.js'

const log = logger.child({ service: 'agent-vector' })

export interface SearchHit {
  id: string
  content: string
  similarity: number
}

export interface SearchOptions {
  k?: number // default 8
  minSim?: number // default 0.3
}

type Row = { id: string; content: string; similarity: string | number }

export async function searchChunks(
  sql: DbSql,
  query: number[],
  opts: SearchOptions = {},
): Promise<SearchHit[]> {
  const tenantId = tenantContext.getTenantId()
  const k = opts.k ?? 8
  const minSim = opts.minSim ?? 0.3
  // pgvector text input is '[v1,v2,...]'.
  const vec = `[${query.join(',')}]`

  try {
    const rows = await withTenant(sql, tenantId, async (tx) => {
      // Per-tx HNSW tuning. iterative_scan = strict_order is LOAD-BEARING
      // for correctness under RLS — without it, filtered LIMIT k can return
      // < k rows (pgvector ≥ 0.8.0). See setup.md §6.
      await tx`SET LOCAL hnsw.ef_search       = 100`
      await tx`SET LOCAL hnsw.iterative_scan  = strict_order`
      await tx`SET LOCAL hnsw.max_scan_tuples = 20000`

      return tx<Row[]>`
        SELECT id,
               content,
               1 - (embedding <=> ${vec}::vector) AS similarity
        FROM agent_vector.chunks
        WHERE 1 - (embedding <=> ${vec}::vector) > ${minSim}
        ORDER BY embedding <=> ${vec}::vector
        LIMIT ${k}
      `
    })
    log.debug({ tenantId, k, minSim, returned: rows.length }, 'vector.search_chunks')
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      similarity: Number(r.similarity),
    }))
  } catch (err) {
    log.error({ err, tenantId, k, minSim }, 'vector.search_chunks.failed')
    throw new VectorQueryFailedError(err)
  }
}

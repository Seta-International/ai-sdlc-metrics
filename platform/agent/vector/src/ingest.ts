import { type DbSql, withTenant } from '@seta/db'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { VectorInsertFailedError, VectorQueryFailedError } from './errors.js'
import type { NewChunk } from './schema.js'

const log = logger.child({ service: 'agent-vector' })

function vectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}

export async function findExistingHashes(
  sql: DbSql,
  sourceId: string,
  hashes: string[],
): Promise<Set<string>> {
  const tenantId = tenantContext.getTenantId()
  if (hashes.length === 0) return new Set()

  try {
    const rows = await withTenant(sql, tenantId, async (tx) => {
      return tx<Array<{ content_hash: string }>>`
        SELECT content_hash
        FROM agent_vector.chunks
        WHERE source_id = ${sourceId}
          AND content_hash IN ${tx(hashes)}
      `
    })
    const found = new Set(rows.map((r) => r.content_hash))
    log.debug(
      { tenantId, sourceId, requested: hashes.length, found: found.size },
      'vector.find_existing_hashes',
    )
    return found
  } catch (err) {
    log.error(
      { err, tenantId, sourceId, requested: hashes.length },
      'vector.find_existing_hashes.failed',
    )
    throw new VectorQueryFailedError(err)
  }
}

export async function insertChunks(sql: DbSql, rows: NewChunk[]): Promise<void> {
  const tenantId = tenantContext.getTenantId()
  if (rows.length === 0) return

  for (const r of rows) {
    if (r.tenantId !== tenantId) {
      throw new VectorInsertFailedError(
        new Error(`row tenantId ${r.tenantId} does not match context tenantId ${tenantId}`),
      )
    }
  }

  try {
    await withTenant(sql, tenantId, async (tx) => {
      const values = rows.map((r) => ({
        tenant_id: r.tenantId,
        source_id: r.sourceId,
        content: r.content,
        content_hash: r.contentHash,
        token_count: r.tokenCount,
        embedding: vectorLiteral(r.embedding as number[]),
      }))
      await tx`
        INSERT INTO agent_vector.chunks ${tx(values)}
        ON CONFLICT (tenant_id, source_id, content_hash) DO NOTHING
      `
    })
    log.debug({ tenantId, rowCount: rows.length }, 'vector.insert_chunks')
  } catch (err) {
    log.error({ err, tenantId, rowCount: rows.length }, 'vector.insert_chunks.failed')
    throw new VectorInsertFailedError(err)
  }
}

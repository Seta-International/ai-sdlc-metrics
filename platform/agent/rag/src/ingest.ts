import { createHash } from 'node:crypto'
import { chunkText } from '@seta/agent-chunking'
import type { EmbeddingsClient } from '@seta/agent-embeddings'
import { findExistingHashes, insertChunks } from '@seta/agent-vector'
import type { DbSql } from '@seta/db'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenancy'
import type { IngestOptions } from './types.js'

const log = logger.child({ service: 'agent-rag' })

const DEFAULT_MAX_TOKENS = 512
const DEFAULT_OVERLAP_TOKENS = 64

const sha256hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

export interface IngestDeps {
  sql: DbSql
  embeddings: EmbeddingsClient
}

/**
 * Build the `ingest(sourceId, content, opts)` closure bound to `deps`.
 *
 * Flow: chunk → hash → dedup pre-check → embed only new chunks → insert.
 * Re-ingest of identical `(sourceId, content)` produces zero embeds and
 * zero new rows. `ingest:dedup-result` is the load-bearing cost-saving
 * log line.
 *
 * Errors from upstream packages (`ChunkingError`, `LlmError`,
 * `VectorQueryFailedError`, `VectorInsertFailedError`, `AbortError`)
 * propagate unchanged. The function logs `ingest:failed` at boundary
 * exit and rethrows.
 */
export function createIngest(deps: IngestDeps) {
  return async function ingest(
    sourceId: string,
    content: string,
    opts: IngestOptions = {},
  ): Promise<void> {
    const tenantId = tenantContext.getTenantId()
    log.info({ sourceId, tenantId, contentLength: content.length }, 'ingest:start')

    try {
      const chunks = chunkText(content, {
        maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        overlapTokens: opts.overlapTokens ?? DEFAULT_OVERLAP_TOKENS,
        model: 'text-embedding-3-small',
      })
      log.debug({ sourceId, tenantId, chunkCount: chunks.length }, 'ingest:chunked')

      const hashed = chunks.map((c) => ({
        ...c,
        contentHash: sha256hex(c.content),
      }))

      const existing = await findExistingHashes(
        deps.sql,
        sourceId,
        hashed.map((h) => h.contentHash),
      )
      const toEmbed = hashed.filter((h) => !existing.has(h.contentHash))

      log.info(
        {
          sourceId,
          tenantId,
          total: chunks.length,
          skipped: existing.size,
          toEmbed: toEmbed.length,
        },
        'ingest:dedup-result',
      )

      if (toEmbed.length === 0) {
        log.info({ sourceId, tenantId }, 'ingest:all-deduped')
        log.info({ sourceId, tenantId, embedded: 0, skipped: existing.size }, 'ingest:done')
        return
      }

      log.debug({ sourceId, tenantId, batchSize: toEmbed.length }, 'ingest:embedding')
      const { embeddings: vecs } = await deps.embeddings.embed(
        toEmbed.map((c) => c.content),
        opts.signal !== undefined ? { signal: opts.signal } : {},
      )

      await insertChunks(
        deps.sql,
        toEmbed.map((c, i) => ({
          tenantId,
          sourceId,
          content: c.content,
          contentHash: c.contentHash,
          tokenCount: c.tokenCount,
          span: { startChar: c.startChar, endChar: c.endChar },
          embedding: vecs[i]!,
        })),
      )

      log.info(
        {
          sourceId,
          tenantId,
          embedded: toEmbed.length,
          skipped: existing.size,
        },
        'ingest:done',
      )
    } catch (err) {
      log.error({ err, sourceId, tenantId }, 'ingest:failed')
      throw err
    }
  }
}

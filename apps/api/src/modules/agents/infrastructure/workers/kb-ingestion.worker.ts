import { Inject, Injectable, Logger } from '@nestjs/common'
import { encode } from 'gpt-tokenizer'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { S3StorageClient } from '@future/storage'
import { parsePdf } from '@future/documents'
import { BASE_DB_TOKEN } from '../../../../common/db/db.module'
import {
  agentKbDocument,
  agentKbChunk,
  agentKbEmbedding,
  agentKbIngestionRun,
} from '../schema/agents.schema'
import { withProviderRetry } from '../adapters/provider-retry'

export type KbIngestionJob = { documentId: string; tenantId: string }
export type EmbedBatchFn = (inputs: string[]) => Promise<number[][]>

const CHUNK_TOKEN_LIMIT = 512
const CHUNK_OVERLAP_TOKENS = 50
const EMBED_BATCH_SIZE = 25

@Injectable()
export class KbIngestionWorker {
  private readonly logger = new Logger(KbIngestionWorker.name)

  constructor(
    @Inject(BASE_DB_TOKEN) private readonly db: Db,
    private readonly storage: S3StorageClient,
    private readonly embedBatch: EmbedBatchFn,
  ) {}

  async registerJob(pgBoss: {
    work: (name: string, fn: (job: { data: KbIngestionJob }) => Promise<void>) => void
  }): Promise<void> {
    pgBoss.work('kb-ingestion', async (job) => {
      await this.handle(job.data)
    })
  }

  async handle(payload: KbIngestionJob): Promise<void> {
    const { documentId, tenantId } = payload

    const docs = await this.db
      .select()
      .from(agentKbDocument)
      .where(eq(agentKbDocument.id, documentId))
      .limit(1)

    const doc = docs[0]
    if (!doc || (doc.status !== 'pending' && doc.status !== 'processing')) {
      return
    }

    const runRows = await this.db
      .insert(agentKbIngestionRun)
      .values({ documentId, tenantId, status: 'started' })
      .returning({ id: agentKbIngestionRun.id })
    const runId = runRows[0]!.id

    await this.db
      .update(agentKbDocument)
      .set({ status: 'processing' })
      .where(eq(agentKbDocument.id, documentId))

    try {
      const fileBuffer = await this.storage.getObjectBuffer(doc.s3Key)

      let text: string
      if (doc.s3Key.endsWith('.pdf')) {
        const parsed = await parsePdf(fileBuffer)
        text = parsed.text
      } else {
        text = fileBuffer.toString('utf-8')
      }

      const chunks = splitIntoChunks(text, CHUNK_TOKEN_LIMIT, CHUNK_OVERLAP_TOKENS)

      const chunkRows = await this.db
        .insert(agentKbChunk)
        .values(
          chunks.map((c, i) => ({
            documentId,
            tenantId,
            content: c.text,
            position: i,
            tokenCount: c.tokenCount,
          })),
        )
        .returning({ id: agentKbChunk.id })

      for (let i = 0; i < chunkRows.length; i += EMBED_BATCH_SIZE) {
        const batchIds = chunkRows.slice(i, i + EMBED_BATCH_SIZE)
        const batchTexts = chunks.slice(i, i + EMBED_BATCH_SIZE).map((c) => c.text)

        const vectors = await withProviderRetry(() => this.embedBatch(batchTexts), {
          maxAttempts: 2,
        })

        await this.db.insert(agentKbEmbedding).values(
          batchIds.map((row, j) => ({
            chunkId: row.id,
            tenantId,
            embedding: vectors[j]!,
          })),
        )
      }

      await this.db
        .update(agentKbDocument)
        .set({ status: 'ready', chunkCount: chunkRows.length })
        .where(eq(agentKbDocument.id, documentId))

      await this.db
        .update(agentKbIngestionRun)
        .set({ status: 'completed', chunksWritten: chunkRows.length, finishedAt: new Date() })
        .where(eq(agentKbIngestionRun.id, runId))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.db
        .update(agentKbDocument)
        .set({ status: 'failed', errorMessage: msg })
        .where(eq(agentKbDocument.id, documentId))
      await this.db
        .update(agentKbIngestionRun)
        .set({ status: 'failed', errorMessage: msg, finishedAt: new Date() })
        .where(eq(agentKbIngestionRun.id, runId))
      this.logger.error(`kb-ingestion failed documentId=${documentId}: ${msg}`)
    }
  }
}

interface Chunk {
  text: string
  tokenCount: number
}

function splitIntoChunks(text: string, maxTokens: number, overlapTokens: number): Chunk[] {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const chunks: Chunk[] = []
  let current = ''
  let currentTokens = 0

  for (const sentence of sentences) {
    const stokens = encode(sentence).length
    if (currentTokens + stokens > maxTokens && current.length > 0) {
      chunks.push({ text: current.trimEnd(), tokenCount: currentTokens })
      // carry overlap: keep last N tokens to preserve context across chunk boundary
      const words = current.split(' ')
      let overlapText = ''
      let overlapCount = 0
      for (let i = words.length - 1; i >= 0 && overlapCount < overlapTokens; i--) {
        overlapText = (words[i] ?? '') + ' ' + overlapText
        overlapCount += encode(words[i] ?? '').length
      }
      current = overlapText
      currentTokens = overlapCount
    }
    current += sentence + ' '
    currentTokens += stokens
  }

  if (current.trim().length > 0) {
    chunks.push({ text: current.trimEnd(), tokenCount: currentTokens })
  }

  return chunks.length > 0 ? chunks : [{ text: text.slice(0, 4000), tokenCount: maxTokens }]
}

import { Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import type { Db } from '@future/db'

export type EmbedQueryFn = (query: string) => Promise<number[]>

export interface KbChunkResult {
  chunkId: string
  documentId: string
  documentTitle: string
  section: string
  chunkContent: string
  score: number
}

const TOP_K = 8

@Injectable()
export class KbRetriever {
  constructor(
    private readonly db: Db,
    private readonly embedQuery: EmbedQueryFn,
  ) {}

  async retrieve(query: string): Promise<KbChunkResult[]> {
    const embedding = await this.embedQuery(query)
    const vectorLiteral = `[${embedding.join(',')}]`

    const result = (await this.db.execute(sql`
      SELECT
        c.id          AS chunk_id,
        c.content,
        c.position,
        d.id          AS document_id,
        d.title,
        1 - (e.embedding <=> ${vectorLiteral}::vector) AS score
      FROM   agents.agent_kb_chunk     c
      JOIN   agents.agent_kb_document  d ON d.id = c.document_id
      JOIN   agents.agent_kb_embedding e ON e.chunk_id = c.id
      WHERE  d.tenant_id = current_setting('app.tenant_id', true)::uuid
        AND  d.status    = 'ready'
      ORDER  BY e.embedding <=> ${vectorLiteral}::vector
      LIMIT  ${TOP_K}
    `)) as unknown as {
      rows: Array<{
        chunk_id: string
        content: string
        position: number
        document_id: string
        title: string
        score: number
      }>
    }

    return result.rows.map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      documentTitle: r.title,
      section: `chunk ${r.position + 1}`,
      chunkContent: r.content,
      score: Number(r.score),
    }))
  }
}

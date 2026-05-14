import type { Tool } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'
import type { ReadToolDeps } from './list_my_tasks.js'

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
}

export interface VectorChunk {
  sourceId: string
  content: string
  score: number
}

export interface VectorUpsertInput {
  sourceId: string
  tenantId: string
  content: string
  charRange: { start: number; end: number }
  metadata: Record<string, unknown>
  embedding: number[]
}

export interface VectorStore {
  search(opts: {
    tenantId: string
    vector: number[]
    topK: number
    filter?: Record<string, unknown>
  }): Promise<VectorChunk[]>
  upsert(input: VectorUpsertInput): Promise<void>
}

export interface SemanticSearchDeps extends ReadToolDeps {
  embeddings: EmbeddingProvider
  vector: VectorStore
}

const Input = z.object({
  query: z.string().min(2),
  planId: z.string().optional(),
  topK: z.number().min(1).max(20).default(8),
})

const Output = z.object({
  results: z.array(
    z.object({
      taskId: z.string(),
      title: z.string(),
      planId: z.string(),
      score: z.number(),
      snippet: z.string(),
    }),
  ),
})

export function searchTasksSemanticTool(
  deps: SemanticSearchDeps,
): Tool<z.infer<typeof Input>, z.infer<typeof Output>> {
  return {
    id: 'planner.search_tasks_semantic',
    description:
      'Find Planner tasks by semantic meaning. Use for "find tasks about X", "similar to Y", "have we done Z".',
    inputSchema: Input as never,
    outputSchema: Output as never,
    annotations: { readOnlyHint: true, idempotentHint: true },
    async execute(input, _ctx) {
      try {
        const tenantId = tenantContext.getTenantId()
        const vec = await deps.embeddings.embed(input.query)

        const chunks = await deps.vector.search({
          tenantId,
          vector: vec,
          topK: input.topK * 2,
          filter: {
            'metadata.type': 'planner_task',
            ...(input.planId ? { 'metadata.plan_id': input.planId } : {}),
          },
        })

        const taskIds = chunks.map((c) => c.sourceId)
        if (taskIds.length === 0) return { ok: true, value: { results: [] } }

        const visibleRows = (await deps.sql`
          SELECT graph_task_id, title, plan_id
          FROM planner.v_visible_tasks
          WHERE graph_task_id = ANY(${taskIds}::text[])
        `) as Array<{ graph_task_id: string; title: string; plan_id: string }>

        const visibleSet = new Set(visibleRows.map((r) => r.graph_task_id))
        const rowMap = new Map(visibleRows.map((r) => [r.graph_task_id, r]))

        const results = chunks
          .filter((c) => visibleSet.has(c.sourceId))
          .slice(0, input.topK)
          .map((c) => ({
            taskId: c.sourceId,
            title: rowMap.get(c.sourceId)?.title ?? '',
            planId: rowMap.get(c.sourceId)?.plan_id ?? '',
            score: c.score,
            snippet: c.content.slice(0, 200),
          }))

        return { ok: true, value: { results } }
      } catch (e) {
        return { ok: false, error: { name: (e as Error).name, message: (e as Error).message } }
      }
    },
  }
}

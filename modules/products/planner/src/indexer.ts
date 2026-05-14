import type { EmbeddingProvider } from '@seta/agent-embeddings'
import type { VectorStore } from '@seta/agent-vector'
import PQueue from 'p-queue'

export type { EmbeddingProvider, VectorStore }

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface TaskIndexerDeps {
  sql: DbSql
  embeddings: EmbeddingProvider
  vector: VectorStore
  concurrency?: number
}

interface TaskRow {
  graph_task_id: string
  tenant_id: string
  title: string
  plan_id: string
  description?: string | null
}

export function createTaskIndexer(deps: TaskIndexerDeps) {
  const queue = new PQueue({ concurrency: deps.concurrency ?? 5 })

  async function indexTasks(tenantId: string, taskIds: string[]): Promise<void> {
    await Promise.all(
      taskIds.map((taskId) =>
        queue.add(async () => {
          const rows = (await deps.sql`
            SELECT t.graph_task_id, t.tenant_id, t.title, t.plan_id, d.description
            FROM connector_ms365_planner.planner_tasks_cache t
            LEFT JOIN connector_ms365_planner.planner_task_details_cache d
              ON d.graph_task_id = t.graph_task_id AND d.tenant_id = t.tenant_id
            WHERE t.graph_task_id = ${taskId} AND t.tenant_id = ${tenantId}
            LIMIT 1
          `) as TaskRow[]

          const task = rows[0]
          if (!task) return

          const content = [task.title, task.description ?? ''].join('\n').slice(0, 2000)
          const embedding = await deps.embeddings.embed(content)

          await deps.vector.upsert({
            sourceId: task.graph_task_id,
            tenantId: task.tenant_id,
            content,
            charRange: { start: 0, end: content.length },
            metadata: { type: 'planner_task', plan_id: task.plan_id },
            embedding,
          })
        }),
      ),
    )
  }

  return { indexTasks }
}

import type { Tool } from '@seta/agent-core'
import type { PlannerCache, PlannerClient } from '@seta/connector-ms365-planner'
import type { GraphFetch } from '@seta/ms-graph'
import { getOneOnOnePrepTool } from './tools/read/get_one_on_one_prep.js'
import { getProjectStatusTool } from './tools/read/get_project_status.js'
import { getTaskTool } from './tools/read/get_task.js'
import { listBucketsTool } from './tools/read/list_buckets.js'
import type { ReadToolDeps } from './tools/read/list_my_tasks.js'
import { listMyTasksTool } from './tools/read/list_my_tasks.js'
import { listPlanTasksTool } from './tools/read/list_plan_tasks.js'
import { listPlansTool } from './tools/read/list_plans.js'
import type {
  EmbeddingProvider,
  SemanticSearchDeps,
  VectorStore,
} from './tools/read/search_tasks_semantic.js'
import { searchTasksSemanticTool } from './tools/read/search_tasks_semantic.js'
import type { MintInput } from './tools/write/_continuation.js'
import { addCommentsCommitTool } from './tools/write/add_comments.commit.js'
import { addCommentsPreviewTool } from './tools/write/add_comments.preview.js'
import { completeTasksCommitTool } from './tools/write/complete_tasks.commit.js'
import { completeTasksPreviewTool } from './tools/write/complete_tasks.preview.js'
import { createPlanCommitTool } from './tools/write/create_plan.commit.js'
import { createPlanPreviewTool } from './tools/write/create_plan.preview.js'
import { createTasksCommitTool } from './tools/write/create_tasks.commit.js'
import { createTasksPreviewTool } from './tools/write/create_tasks.preview.js'
import { updateTasksCommitTool } from './tools/write/update_tasks.commit.js'
import { updateTasksPreviewTool } from './tools/write/update_tasks.preview.js'

export interface PlannerToolsDeps {
  sql: ReadToolDeps['sql']
  registry: { requireConsent(tenantId: string, connectorId: string): Promise<void> }
  tokenForUser: (tenantId: string, userId: string) => Promise<{ accessToken: string }>
  buildClient: (token: string) => PlannerClient
  buildCache: (client: PlannerClient) => PlannerCache
  buildGraph: () => GraphFetch
  continuationStore: {
    mint(i: MintInput): Promise<{ token: string; expiresAt: Date }>
    verify(v: {
      token: string
      userId: string
      tenantId: string
      toolId: string
    }): Promise<{ payload: Record<string, unknown>; etagSnapshot: Record<string, string> }>
    markConsumed(token: string, card: Record<string, unknown>): Promise<void>
  }
  etagStore: { get(taskId: string): Promise<string | null> }
  embeddings: EmbeddingProvider
  vector: VectorStore
  ttlMinutes?: number
  batchConcurrency?: number
}

export function createPlannerTools(deps: PlannerToolsDeps): Record<string, Tool> {
  const ttlMinutes = deps.ttlMinutes ?? 15
  const batchConcurrency = deps.batchConcurrency ?? 10

  const readDeps: ReadToolDeps = { sql: deps.sql }
  const semanticDeps: SemanticSearchDeps = {
    sql: deps.sql,
    embeddings: deps.embeddings,
    vector: deps.vector,
  }

  const previewBase = {
    registry: deps.registry,
    tokenForUser: deps.tokenForUser,
    buildClient: deps.buildClient,
    buildCache: deps.buildCache,
    continuationStore: deps.continuationStore,
    ttlMinutes,
  }

  const commitBase = {
    registry: deps.registry,
    tokenForUser: deps.tokenForUser,
    buildGraph: deps.buildGraph,
    buildCache: () => deps.buildCache(null as unknown as PlannerClient),
    continuationStore: deps.continuationStore,
    batchConcurrency,
  }

  const tools = [
    // read tools
    listMyTasksTool(readDeps),
    listPlanTasksTool(readDeps),
    getTaskTool(readDeps),
    listPlansTool(readDeps),
    listBucketsTool(readDeps),
    searchTasksSemanticTool(semanticDeps),
    getProjectStatusTool(readDeps),
    getOneOnOnePrepTool(readDeps),
    // preview tools
    updateTasksPreviewTool({ ...previewBase, etagStore: deps.etagStore }),
    createTasksPreviewTool(previewBase),
    completeTasksPreviewTool({ ...previewBase, etagStore: deps.etagStore }),
    addCommentsPreviewTool(previewBase),
    createPlanPreviewTool({
      registry: deps.registry,
      continuationStore: deps.continuationStore,
      ttlMinutes,
    }),
    // commit tools
    updateTasksCommitTool(commitBase),
    createTasksCommitTool(commitBase),
    completeTasksCommitTool(commitBase),
    addCommentsCommitTool({
      registry: deps.registry,
      continuationStore: deps.continuationStore,
    }),
    createPlanCommitTool({
      registry: deps.registry,
      tokenForUser: deps.tokenForUser,
      buildGraph: deps.buildGraph,
      buildCache: () => deps.buildCache(null as unknown as PlannerClient),
      continuationStore: deps.continuationStore,
    }),
  ]

  return Object.fromEntries(tools.map((t) => [t.id, t])) as Record<string, Tool>
}

export type { TaskIndexerDeps } from './indexer.js'
export { createTaskIndexer } from './indexer.js'
export {
  PLANNER_INSTRUCTIONS,
  PLANNER_PROFILE_SEED,
  PLANNER_SLUG,
  PLANNER_TOOL_IDS,
  PLANNER_WORKING_MEMORY_TEMPLATE,
} from './seeds/planner.js'
export type {
  EmbeddingProvider,
  VectorChunk,
  VectorStore,
  VectorUpsertInput,
} from './tools/read/search_tasks_semantic.js'

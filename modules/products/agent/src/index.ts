import type { AgentConfig } from '@seta/agent-core'
export { createThreadRoutes } from './routes'
import type { PlannerClient } from '@seta/connector-ms365-planner'
import {
  createEtagStore,
  createPlannerCache,
  createPlannerClient,
} from '@seta/connector-ms365-planner'
import type { ConnectorRegistry } from '@seta/connector-registry'
import { Unauthorized } from '@seta/middleware'
import type { GraphFetch } from '@seta/ms-graph'
import type { TokenVault } from '@seta/oauth'
import { tenantContext } from '@seta/tenant'
import {
  addCommentsCommitTool,
  addCommentsPreviewTool,
  completeTasksCommitTool,
  completeTasksPreviewTool,
  createContinuationStore,
  createPlanCommitTool,
  createPlanPreviewTool,
  createTasksCommitTool,
  createTasksPreviewTool,
  getTaskTool,
  listBucketsTool,
  listMyTasksTool,
  listPlansTool,
  listPlanTasksTool,
  updateTasksCommitTool,
  updateTasksPreviewTool,
  workloadAnalysisTool,
} from './tools/planner/index.js'

export const PLANNER_AGENT_CONFIG: AgentConfig = {
  model: 'anthropic/claude-haiku-4-5',
  systemPrompt:
    'You are the Seta Planner agent. Help users manage their Microsoft Planner tasks. ' +
    'Use available tools to read and write tasks. Always confirm destructive actions before executing.',
  cacheTtl: '5m',
}

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface PlannerToolFactoryDeps {
  registry: ConnectorRegistry
  vault: TokenVault
  graph: GraphFetch
  sql: DbSql
  hmacKey: string
  ttls: { tasks: number; plans: number; buckets: number; staleFallbackMax: number }
  continuationTtlMin: number
  batchConcurrency: number
}

export function createPlannerTools(deps: PlannerToolFactoryDeps) {
  const tokenForUser = async (tenantId: string, userId: string) => {
    const bundle = await deps.vault.get(tenantId, 'entra', `user:${userId}`)
    if (!bundle) throw new Unauthorized('no token for user')
    return { accessToken: bundle.accessToken }
  }

  const buildClient = (token: string): PlannerClient =>
    createPlannerClient({
      graph: deps.graph,
      token,
      actor: { type: 'user', userId: tenantContext.getUserId() ?? 'unknown' },
    })

  const buildCache = (client: PlannerClient) =>
    createPlannerCache({
      sql: deps.sql,
      client,
      ttlTasksSec: deps.ttls.tasks,
      ttlPlansSec: deps.ttls.plans,
      ttlBucketsSec: deps.ttls.buckets,
      staleFallbackMaxSec: deps.ttls.staleFallbackMax,
    })

  const continuationStore = createContinuationStore({
    sql: deps.sql,
    hmacKey: deps.hmacKey,
    ttlMin: deps.continuationTtlMin,
  })

  const etagStore = createEtagStore(deps.sql)

  const directory = {
    displayName: async (userId: string): Promise<string | null> => {
      const tenantId = tenantContext.getTenantId()
      const rows = await deps.sql`
        SELECT display_name FROM connector_ms365_directory.directory_users
        WHERE tenant_id = ${tenantId} AND entra_object_id = ${userId}
        LIMIT 1
      `
      return (rows[0] as { display_name?: string } | undefined)?.display_name ?? null
    },
  }

  const buildSql = () => deps.sql

  const buildGraph = () => deps.graph

  const makeWriteCache = () => buildCache(buildClient(''))

  const readDeps = { registry: deps.registry, tokenForUser, buildClient, buildCache }

  const previewBase = {
    registry: deps.registry,
    tokenForUser,
    buildClient,
    buildCache,
    continuationStore,
    ttlMinutes: deps.continuationTtlMin,
  }

  const previewFull = { ...previewBase, etagStore }

  const commitDeps = {
    registry: deps.registry,
    tokenForUser,
    buildGraph,
    buildCache: makeWriteCache,
    continuationStore,
    batchConcurrency: deps.batchConcurrency,
  }

  return [
    listMyTasksTool(readDeps),
    listPlanTasksTool(readDeps),
    getTaskTool(readDeps),
    listPlansTool(readDeps),
    listBucketsTool(readDeps),
    workloadAnalysisTool({ registry: deps.registry, buildSql, directory }),
    updateTasksPreviewTool(previewFull),
    createTasksPreviewTool(previewBase),
    completeTasksPreviewTool(previewFull),
    addCommentsPreviewTool(previewBase),
    createPlanPreviewTool({
      registry: deps.registry,
      continuationStore,
      ttlMinutes: deps.continuationTtlMin,
    }),
    updateTasksCommitTool(commitDeps),
    createTasksCommitTool(commitDeps),
    completeTasksCommitTool(commitDeps),
    addCommentsCommitTool({ registry: deps.registry, continuationStore }),
    createPlanCommitTool({
      registry: deps.registry,
      tokenForUser,
      buildGraph,
      buildCache: () => makeWriteCache(),
      continuationStore,
    }),
  ]
}

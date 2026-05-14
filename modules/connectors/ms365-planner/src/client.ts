import type { AuditActor, GraphFetch } from '@seta/ms-graph'
import { GraphUnavailable } from '@seta/ms-graph'
import { logger } from '@seta/observability'

const log = logger.child({ component: 'planner-client' })

export type TaskUpdate = Partial<{
  title: string
  assignments: Record<string, { '@odata.type': string; orderHint: string } | null>
  dueDateTime: string | null
  priority: number
  percentComplete: number
  bucketId: string
  appliedCategories: Record<string, boolean>
}>

export interface CreateTaskInput {
  planId: string
  bucketId?: string
  title: string
  assignments?: Record<
    string,
    { '@odata.type': 'microsoft.graph.plannerAssignment'; orderHint: string }
  >
  dueDateTime?: string
  priority?: number
}

export interface PlannerClientDeps {
  graph: GraphFetch
  actor: AuditActor
  token: string
}

export interface PlannerClient {
  getTask(id: string): Promise<{ data: unknown; etag: string | null }>
  getTaskDetails(id: string): Promise<{ data: unknown; etag: string | null }>
  updateTask(
    id: string,
    etag: string,
    patch: TaskUpdate,
  ): Promise<{ data: unknown; etag: string | null }>
  createTask(input: CreateTaskInput): Promise<{ data: unknown; etag: string | null }>
  deleteTask(id: string, etag: string): Promise<void>
  listMyTasks(): AsyncIterable<unknown>
  listPlanTasks(planId: string): AsyncIterable<unknown>
  listMyPlans(): AsyncIterable<unknown>
  listBuckets(planId: string): AsyncIterable<unknown>
  getPlan(id: string): Promise<{ data: unknown; etag: string | null }>
  getBucket(id: string): Promise<{ data: unknown; etag: string | null }>
  createPlan(input: {
    owner: string
    title: string
  }): Promise<{ data: unknown; etag: string | null }>
  listAllPlans(): AsyncIterable<unknown>
  listPlanTasksDelta(
    planId: string,
    deltaToken?: string,
  ): Promise<{
    items: unknown[]
    nextDeltaToken: string
  }>
  listGroupMembers(groupId: string): AsyncIterable<unknown>
}

const CONNECTOR_ID = 'ms365-planner'

export function createPlannerClient(deps: PlannerClientDeps): PlannerClient {
  const base = { token: deps.token, actor: deps.actor, connectorId: CONNECTOR_ID } as const
  return {
    getTask: async (id) => {
      const r = await deps.graph.call({ ...base, method: 'GET', path: `/planner/tasks/${id}` })
      return { data: r.data, etag: r.etag }
    },
    getTaskDetails: async (id) => {
      const r = await deps.graph.call({
        ...base,
        method: 'GET',
        path: `/planner/tasks/${id}/details`,
      })
      return { data: r.data, etag: r.etag }
    },
    updateTask: async (id, etag, patch) => {
      const r = await deps.graph.call({
        ...base,
        method: 'PATCH',
        path: `/planner/tasks/${id}`,
        etag,
        headers: { Prefer: 'return=representation' },
        body: patch,
      })
      log.info({ taskId: id }, 'planner.updateTask')
      return { data: r.data, etag: r.etag }
    },
    createTask: async (input) => {
      const r = await deps.graph.call({
        ...base,
        method: 'POST',
        path: '/planner/tasks',
        body: input,
      })
      log.info({ planId: input.planId, title: input.title }, 'planner.createTask')
      return { data: r.data, etag: r.etag }
    },
    deleteTask: async (id, etag) => {
      await deps.graph.call({ ...base, method: 'DELETE', path: `/planner/tasks/${id}`, etag })
      log.info({ taskId: id }, 'planner.deleteTask')
    },
    listMyTasks: () => deps.graph.paginate({ ...base, method: 'GET', path: '/me/planner/tasks' }),
    listPlanTasks: (planId) =>
      deps.graph.paginate({ ...base, method: 'GET', path: `/planner/plans/${planId}/tasks` }),
    listMyPlans: () => deps.graph.paginate({ ...base, method: 'GET', path: '/me/planner/plans' }),
    listBuckets: (planId) =>
      deps.graph.paginate({ ...base, method: 'GET', path: `/planner/plans/${planId}/buckets` }),
    getPlan: async (id) => {
      const r = await deps.graph.call({ ...base, method: 'GET', path: `/planner/plans/${id}` })
      return { data: r.data, etag: r.etag }
    },
    getBucket: async (id) => {
      const r = await deps.graph.call({ ...base, method: 'GET', path: `/planner/buckets/${id}` })
      return { data: r.data, etag: r.etag }
    },
    createPlan: async (input) => {
      const r = await deps.graph.call({
        ...base,
        method: 'POST',
        path: '/planner/plans',
        body: { container: { url: input.owner }, title: input.title },
      })
      return { data: r.data, etag: r.etag }
    },

    listAllPlans: () => deps.graph.paginate({ ...base, method: 'GET', path: '/planner/plans' }),

    listPlanTasksDelta: async (planId, deltaToken) => {
      const startPath = deltaToken
        ? `/planner/plans/${planId}/tasks/delta?$deltatoken=${deltaToken}`
        : `/planner/plans/${planId}/tasks/delta`
      const items: unknown[] = []
      let path = startPath
      while (true) {
        const res = await deps.graph.call<{
          value?: unknown[]
          '@odata.nextLink'?: string
          '@odata.deltaLink'?: string
        }>({ ...base, method: 'GET', path })
        const page = res.data
        if (page.value) items.push(...page.value)
        if (page['@odata.deltaLink']) {
          const url = new URL(page['@odata.deltaLink'])
          const nextToken = url.searchParams.get('$deltatoken') ?? ''
          return { items, nextDeltaToken: nextToken }
        }
        if (page['@odata.nextLink']) {
          const nextUrl = new URL(page['@odata.nextLink'])
          path = nextUrl.pathname.replace(/^\/v1\.0/, '') + nextUrl.search
          continue
        }
        throw new GraphUnavailable('delta response missing both nextLink and deltaLink')
      }
    },

    listGroupMembers: (groupId) =>
      deps.graph.paginate({ ...base, method: 'GET', path: `/groups/${groupId}/members` }),
  }
}

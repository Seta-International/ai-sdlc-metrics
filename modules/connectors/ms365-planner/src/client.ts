import type { AuditActor, GraphFetch } from '@seta/ms-graph'

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
  createPlan(input: {
    owner: string
    title: string
  }): Promise<{ data: unknown; etag: string | null }>
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
      return { data: r.data, etag: r.etag }
    },
    createTask: async (input) => {
      const r = await deps.graph.call({
        ...base,
        method: 'POST',
        path: '/planner/tasks',
        body: input,
      })
      return { data: r.data, etag: r.etag }
    },
    deleteTask: async (id, etag) => {
      await deps.graph.call({ ...base, method: 'DELETE', path: `/planner/tasks/${id}`, etag })
    },
    listMyTasks: () => deps.graph.paginate({ ...base, method: 'GET', path: '/me/planner/tasks' }),
    listPlanTasks: (planId) =>
      deps.graph.paginate({ ...base, method: 'GET', path: `/planner/plans/${planId}/tasks` }),
    listMyPlans: () => deps.graph.paginate({ ...base, method: 'GET', path: '/me/planner/plans' }),
    listBuckets: (planId) =>
      deps.graph.paginate({ ...base, method: 'GET', path: `/planner/plans/${planId}/buckets` }),
    createPlan: async (input) => {
      const r = await deps.graph.call({
        ...base,
        method: 'POST',
        path: '/planner/plans',
        body: { container: { url: input.owner }, title: input.title },
      })
      return { data: r.data, etag: r.etag }
    },
  }
}

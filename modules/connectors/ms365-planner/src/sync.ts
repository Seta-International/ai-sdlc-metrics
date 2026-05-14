import type { GraphFetch } from '@seta/ms-graph'
import { createPlannerClient } from './client.js'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
type SqlWithArray = DbSql & { array(arr: unknown[]): unknown[] }

export interface PlannerSyncWorkerDeps {
  sql: SqlWithArray
  graph: GraphFetch
  getAppToken: (tenantId: string) => Promise<string>
  intervalMs?: number
  afterSync?: (tenantId: string, changedTaskIds: string[]) => Promise<void>
}

const SYNC_ACTOR = { type: 'system' as const, label: 'planner-sync' }

export function createPlannerSyncWorker(deps: PlannerSyncWorkerDeps) {
  const { sql, graph, getAppToken, intervalMs = 3 * 60 * 1000, afterSync } = deps
  let timer: ReturnType<typeof setInterval> | null = null

  interface PlanRow {
    id: string
    ownerGroupId: string | null
    raw: unknown
  }

  async function upsertPlansBatch(tenantId: string, plans: PlanRow[]): Promise<void> {
    for (const plan of plans) {
      await sql`
        INSERT INTO connector_ms365_planner.planner_plans_cache
          (tenant_id, graph_plan_id, owner_group_id, title, container_url, raw, synced_at, soft_deleted_at)
        VALUES (
          ${tenantId}::uuid, ${plan.id}, ${plan.ownerGroupId},
          ${(plan.raw as { title?: string }).title ?? null},
          ${(plan.raw as { container?: { url?: string } }).container?.url ?? null},
          ${JSON.stringify(plan.raw)}::jsonb, now(), NULL
        )
        ON CONFLICT (tenant_id, graph_plan_id) DO UPDATE SET
          owner_group_id  = EXCLUDED.owner_group_id,
          title           = EXCLUDED.title,
          container_url   = EXCLUDED.container_url,
          raw             = EXCLUDED.raw,
          synced_at       = now(),
          soft_deleted_at = NULL
      `
    }
  }

  async function softDeleteRemovedPlans(tenantId: string, seenPlanIds: string[]): Promise<void> {
    if (seenPlanIds.length === 0) return
    await sql`
      UPDATE connector_ms365_planner.planner_plans_cache
      SET soft_deleted_at = now()
      WHERE tenant_id    = ${tenantId}::uuid
        AND soft_deleted_at IS NULL
        AND graph_plan_id <> ALL(${sql.array(seenPlanIds)})
    `
  }

  async function syncTenantTasksDelta(
    tenantId: string,
    token: string,
    planId: string,
  ): Promise<string[]> {
    const client = createPlannerClient({ graph, token, actor: SYNC_ACTOR })

    const watermarkRows = await sql`
      SELECT delta_token FROM connector_ms365_planner.sync_watermarks
      WHERE tenant_id  = ${tenantId}::uuid
        AND scope_kind = 'tasks'
        AND scope_id   = ${planId}
    `
    const storedToken =
      (watermarkRows[0] as { delta_token?: string } | undefined)?.delta_token ?? undefined

    const { items, nextDeltaToken } = await client.listPlanTasksDelta(planId, storedToken)
    const changedTaskIds: string[] = []

    for (const raw of items) {
      const task = raw as {
        id: string
        planId?: string
        bucketId?: string
        title?: string
        percentComplete?: number
        priority?: number
        dueDateTime?: string | null
        assignments?: Record<string, unknown>
        createdBy?: { user?: { id?: string } }
        createdDateTime?: string | null
        lastModifiedBy?: { user?: { id?: string } }
        lastModifiedDateTime?: string | null
        '@odata.etag'?: string
        '@removed'?: unknown
      }

      if (task['@removed']) {
        await sql`
          UPDATE connector_ms365_planner.planner_tasks_cache
          SET soft_deleted_at = now()
          WHERE tenant_id    = ${tenantId}::uuid
            AND graph_task_id = ${task.id}
        `
        continue
      }

      const assigneeIds = Object.keys(task.assignments ?? {})
      await sql`
        INSERT INTO connector_ms365_planner.planner_tasks_cache (
          tenant_id, graph_task_id, plan_id, bucket_id, title,
          percent_complete, priority, due_date, assignee_ids,
          created_by, created_at_graph, last_modified_by, last_modified_at_graph,
          etag, raw, synced_at
        ) VALUES (
          ${tenantId}::uuid,
          ${task.id},
          ${task.planId ?? planId},
          ${task.bucketId ?? null},
          ${task.title ?? null},
          ${task.percentComplete ?? 0},
          ${task.priority ?? 1},
          ${task.dueDateTime ?? null}::timestamptz,
          ${sql.array(assigneeIds)},
          ${task.createdBy?.user?.id ?? null},
          ${task.createdDateTime ?? null}::timestamptz,
          ${task.lastModifiedBy?.user?.id ?? null},
          ${task.lastModifiedDateTime ?? null}::timestamptz,
          ${task['@odata.etag'] ?? null},
          ${JSON.stringify(raw)}::jsonb,
          now()
        )
        ON CONFLICT (tenant_id, graph_task_id) DO UPDATE SET
          plan_id              = EXCLUDED.plan_id,
          bucket_id            = EXCLUDED.bucket_id,
          title                = EXCLUDED.title,
          percent_complete     = EXCLUDED.percent_complete,
          priority             = EXCLUDED.priority,
          due_date             = EXCLUDED.due_date,
          assignee_ids         = EXCLUDED.assignee_ids,
          last_modified_by     = EXCLUDED.last_modified_by,
          last_modified_at_graph = EXCLUDED.last_modified_at_graph,
          etag                 = EXCLUDED.etag,
          raw                  = EXCLUDED.raw,
          synced_at            = now(),
          soft_deleted_at      = NULL
      `
      changedTaskIds.push(task.id)
    }

    await sql`
      INSERT INTO connector_ms365_planner.sync_watermarks
        (tenant_id, scope_kind, scope_id, last_sync_at, status, delta_token)
      VALUES
        (${tenantId}::uuid, 'tasks', ${planId}, now(), 'ok', ${nextDeltaToken})
      ON CONFLICT (tenant_id, scope_kind, scope_id) DO UPDATE SET
        last_sync_at = now(),
        status       = 'ok',
        delta_token  = EXCLUDED.delta_token
    `

    return changedTaskIds
  }

  async function syncTenantPlanMembers(
    tenantId: string,
    token: string,
    planId: string,
    ownerGroupId: string,
  ): Promise<void> {
    const client = createPlannerClient({ graph, token, actor: SYNC_ACTOR })
    const seenUserIds: string[] = []

    for await (const raw of client.listGroupMembers(ownerGroupId)) {
      const member = raw as { id?: string }
      if (!member.id) continue
      seenUserIds.push(member.id)
      await sql`
        INSERT INTO connector_ms365_planner.plan_members (tenant_id, plan_id, user_id, synced_at)
        VALUES (${tenantId}::uuid, ${planId}, ${member.id}, now())
        ON CONFLICT (tenant_id, plan_id, user_id) DO UPDATE SET synced_at = now()
      `
    }

    if (seenUserIds.length > 0) {
      await sql`
        DELETE FROM connector_ms365_planner.plan_members
        WHERE tenant_id = ${tenantId}::uuid
          AND plan_id   = ${planId}
          AND user_id   <> ALL(${sql.array(seenUserIds)})
      `
    }
  }

  async function syncTenant(tenantId: string): Promise<void> {
    const token = await getAppToken(tenantId)
    const client = createPlannerClient({ graph, token, actor: SYNC_ACTOR })

    const seenPlans: PlanRow[] = []
    const allChangedTaskIds: string[] = []

    for await (const raw of client.listAllPlans()) {
      const graphPlan = raw as {
        id: string
        owner?: string
        title?: string
        container?: { url?: string }
      }
      const plan: PlanRow = { id: graphPlan.id, ownerGroupId: graphPlan.owner ?? null, raw }
      seenPlans.push(plan)

      const changed = await syncTenantTasksDelta(tenantId, token, plan.id)
      allChangedTaskIds.push(...changed)

      if (plan.ownerGroupId) {
        await syncTenantPlanMembers(tenantId, token, plan.id, plan.ownerGroupId)
      }
    }

    if (seenPlans.length === 0) return

    await upsertPlansBatch(tenantId, seenPlans)
    await softDeleteRemovedPlans(
      tenantId,
      seenPlans.map((p) => p.id),
    )

    if (allChangedTaskIds.length > 0) {
      await afterSync?.(tenantId, allChangedTaskIds)
    }
  }

  return {
    start(tenantIds: string[]): void {
      if (timer) return
      timer = setInterval(() => {
        for (const tenantId of tenantIds) {
          syncTenant(tenantId).catch((err) => {
            void err
          })
        }
      }, intervalMs)
    },

    stop(): void {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },

    syncTenant,
  }
}

export type PlannerSyncWorker = ReturnType<typeof createPlannerSyncWorker>

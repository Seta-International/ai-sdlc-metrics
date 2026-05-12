import { GraphNotFound, GraphUnavailable } from '@seta/ms-graph'
import { tenantContext } from '@seta/tenant'
import type { PlannerClient } from './client'

export type ReadSource = 'cache:fresh' | 'cache:stale-fallback' | 'live'

export interface ReadResult<T> {
  data: T
  source: ReadSource
  ageSeconds: number
}

export interface PlannerCacheDeps {
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  client: Pick<PlannerClient, 'getTask'>
  ttlTasksSec: number
  staleFallbackMaxSec: number
  now?: () => number
}

export interface PlannerCache {
  task: {
    one(taskId: string): Promise<ReadResult<unknown> | null>
    upsert(taskId: string, etag: string, raw: unknown): Promise<void>
    softDelete(taskId: string): Promise<void>
  }
}

interface CachedTaskRow {
  graphTaskId: string
  etag: string | null
  raw: unknown
  syncedAt: Date
}

export function createPlannerCache(deps: PlannerCacheDeps): PlannerCache {
  const nowMs = deps.now ?? (() => Date.now())

  function getTenantId(): string {
    return tenantContext.getTenantId()
  }

  return {
    task: {
      async one(taskId: string): Promise<ReadResult<unknown> | null> {
        const tenantId = getTenantId()
        const rows = await deps.sql`
          SELECT graph_task_id AS "graphTaskId", etag, raw, synced_at AS "syncedAt"
          FROM connector_ms365_planner.planner_tasks_cache
          WHERE tenant_id = ${tenantId}
            AND graph_task_id = ${taskId}
            AND soft_deleted_at IS NULL
        `

        const row = rows.length > 0 ? (rows[0] as CachedTaskRow) : null
        const currentMs = nowMs()

        if (row !== null) {
          const ageMs = currentMs - row.syncedAt.getTime()
          const ageSeconds = ageMs / 1000

          if (ageSeconds < deps.ttlTasksSec) {
            return { source: 'cache:fresh', data: row.raw, ageSeconds }
          }
        }

        try {
          const result = await deps.client.getTask(taskId)
          await deps.sql`
            INSERT INTO connector_ms365_planner.planner_tasks_cache
              (tenant_id, graph_task_id, etag, raw, synced_at)
            VALUES (${tenantId}, ${taskId}, ${result.etag}, ${result.data}, NOW())
            ON CONFLICT (tenant_id, graph_task_id)
            DO UPDATE SET
              etag = EXCLUDED.etag,
              raw = EXCLUDED.raw,
              synced_at = EXCLUDED.synced_at,
              soft_deleted_at = NULL
          `
          return { source: 'live', data: result.data, ageSeconds: 0 }
        } catch (err) {
          if (err instanceof GraphNotFound) {
            await deps.sql`
              UPDATE connector_ms365_planner.planner_tasks_cache
              SET soft_deleted_at = NOW()
              WHERE tenant_id = ${tenantId}
                AND graph_task_id = ${taskId}
            `
            return null
          }

          if (err instanceof GraphUnavailable) {
            if (row !== null) {
              const ageMs = currentMs - row.syncedAt.getTime()
              const ageSeconds = ageMs / 1000
              if (ageSeconds < deps.staleFallbackMaxSec) {
                return { source: 'cache:stale-fallback', data: row.raw, ageSeconds }
              }
            }
            throw err
          }

          throw err
        }
      },

      async upsert(taskId: string, etag: string, raw: unknown): Promise<void> {
        const tenantId = getTenantId()
        await deps.sql`
          INSERT INTO connector_ms365_planner.planner_tasks_cache
            (tenant_id, graph_task_id, etag, raw, synced_at)
          VALUES (${tenantId}, ${taskId}, ${etag}, ${raw}, NOW())
          ON CONFLICT (tenant_id, graph_task_id)
          DO UPDATE SET
            etag = EXCLUDED.etag,
            raw = EXCLUDED.raw,
            synced_at = EXCLUDED.synced_at
        `
      },

      async softDelete(taskId: string): Promise<void> {
        const tenantId = getTenantId()
        await deps.sql`
          UPDATE connector_ms365_planner.planner_tasks_cache
          SET soft_deleted_at = NOW()
          WHERE tenant_id = ${tenantId}
            AND graph_task_id = ${taskId}
        `
      },
    },
  }
}

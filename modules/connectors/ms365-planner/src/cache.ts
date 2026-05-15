import { Unprocessable } from '@seta/middleware'
import { GraphNotFound, GraphUnavailable } from '@seta/ms-graph'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenancy'
import type { PlannerClient } from './client'

const log = logger.child({ component: 'planner-cache' })

export type ReadSource = 'cache:fresh' | 'cache:stale-fallback' | 'live'

export interface ReadResult<T> {
  data: T
  source: ReadSource
  ageSeconds: number
}

export interface PlannerCacheDeps {
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  client: Pick<
    PlannerClient,
    'getTask' | 'getTaskDetails' | 'listMyPlans' | 'listBuckets' | 'getPlan' | 'getBucket'
  >
  ttlTasksSec: number
  ttlPlansSec?: number
  ttlBucketsSec?: number
  staleFallbackMaxSec: number
  now?: () => number
}

export interface PlannerCache {
  task: {
    one(taskId: string): Promise<ReadResult<unknown> | null>
    upsert(taskId: string, etag: string, raw: unknown): Promise<void>
    softDelete(taskId: string): Promise<void>
  }
  taskDetails: {
    one(taskId: string): Promise<ReadResult<unknown> | null>
    upsert(taskId: string, etag: string, raw: unknown): Promise<void>
  }
  plan: {
    one(planId: string): Promise<ReadResult<unknown> | null>
    upsert(planId: string, etag: string, raw: unknown): Promise<void>
    softDelete(planId: string): Promise<void>
  }
  bucket: {
    one(bucketId: string): Promise<ReadResult<unknown> | null>
    upsert(bucketId: string, etag: string, raw: unknown): Promise<void>
    softDelete(bucketId: string): Promise<void>
  }
}

type SqlFn = PlannerCacheDeps['sql']

interface CachedRow {
  etag: string | null
  raw: unknown
  syncedAt: Date
}

interface EntityOps {
  selectOne(sql: SqlFn, tenantId: string, id: string): Promise<unknown[]>
  upsertLive(
    sql: SqlFn,
    tenantId: string,
    id: string,
    etag: string | null,
    data: unknown,
  ): Promise<unknown>
  upsertRow(sql: SqlFn, tenantId: string, id: string, etag: string, raw: unknown): Promise<unknown>
  softDeleteRow?(sql: SqlFn, tenantId: string, id: string): Promise<unknown>
}

interface EntityCacheOpts {
  ops: EntityOps
  sql: SqlFn
  ttlSec: number
  staleFallbackMaxSec: number
  now: () => number
  fetchLive: (id: string) => Promise<{ data: unknown; etag: string | null }>
}

function buildEntityCache(opts: EntityCacheOpts) {
  const { ops, sql, ttlSec, staleFallbackMaxSec, now, fetchLive } = opts

  function getTenantId(): string {
    return tenantContext.getTenantId()
  }

  return {
    async one(id: string): Promise<ReadResult<unknown> | null> {
      const tenantId = getTenantId()
      const rows = await ops.selectOne(sql, tenantId, id)
      const row = rows.length > 0 ? (rows[0] as CachedRow) : null
      const currentMs = now()

      if (row !== null) {
        const ageMs = currentMs - row.syncedAt.getTime()
        const ageSeconds = ageMs / 1000
        if (ageSeconds < ttlSec) {
          log.debug({ id, ageSeconds }, 'cache.hit')
          return { source: 'cache:fresh', data: row.raw, ageSeconds }
        }
      }

      log.debug({ id }, 'cache.miss')
      try {
        const result = await fetchLive(id)
        await ops.upsertLive(sql, tenantId, id, result.etag, result.data)
        return { source: 'live', data: result.data, ageSeconds: 0 }
      } catch (err) {
        if (err instanceof GraphNotFound) {
          if (ops.softDeleteRow) {
            await ops.softDeleteRow(sql, tenantId, id)
          }
          return null
        }

        if (err instanceof GraphUnavailable) {
          if (row !== null) {
            const ageMs = currentMs - row.syncedAt.getTime()
            const ageSeconds = ageMs / 1000
            if (ageSeconds < staleFallbackMaxSec) {
              log.warn({ id, ageSeconds }, 'cache.stale-fallback')
              return { source: 'cache:stale-fallback', data: row.raw, ageSeconds }
            }
          }
          throw err
        }

        throw err
      }
    },

    async upsert(id: string, etag: string, raw: unknown): Promise<void> {
      const tenantId = getTenantId()
      await ops.upsertRow(sql, tenantId, id, etag, raw)
    },

    async softDelete(id: string): Promise<void> {
      const tenantId = getTenantId()
      if (!ops.softDeleteRow) throw new Unprocessable('softDelete not supported for this entity')
      await ops.softDeleteRow(sql, tenantId, id)
    },
  }
}

const taskOps: EntityOps = {
  selectOne: (sql, tenantId, id) => sql`
    SELECT etag, raw, synced_at AS "syncedAt"
    FROM connector_ms365_planner.planner_tasks_cache
    WHERE tenant_id = ${tenantId}
      AND graph_task_id = ${id}
      AND soft_deleted_at IS NULL
  `,
  upsertLive: (sql, tenantId, id, etag, data) => sql`
    INSERT INTO connector_ms365_planner.planner_tasks_cache
      (tenant_id, graph_task_id, etag, raw, synced_at)
    VALUES (${tenantId}, ${id}, ${etag}, ${data}, NOW())
    ON CONFLICT (tenant_id, graph_task_id)
    DO UPDATE SET
      etag = EXCLUDED.etag,
      raw = EXCLUDED.raw,
      synced_at = EXCLUDED.synced_at,
      soft_deleted_at = NULL
  `,
  upsertRow: (sql, tenantId, id, etag, raw) => sql`
    INSERT INTO connector_ms365_planner.planner_tasks_cache
      (tenant_id, graph_task_id, etag, raw, synced_at)
    VALUES (${tenantId}, ${id}, ${etag}, ${raw}, NOW())
    ON CONFLICT (tenant_id, graph_task_id)
    DO UPDATE SET
      etag = EXCLUDED.etag,
      raw = EXCLUDED.raw,
      synced_at = EXCLUDED.synced_at,
      soft_deleted_at = NULL
  `,
  softDeleteRow: (sql, tenantId, id) => sql`
    UPDATE connector_ms365_planner.planner_tasks_cache
    SET soft_deleted_at = NOW()
    WHERE tenant_id = ${tenantId}
      AND graph_task_id = ${id}
  `,
}

const taskDetailsOps: EntityOps = {
  selectOne: (sql, tenantId, id) => sql`
    SELECT etag, raw, synced_at AS "syncedAt"
    FROM connector_ms365_planner.planner_task_details_cache
    WHERE tenant_id = ${tenantId}
      AND graph_task_id = ${id}
  `,
  upsertLive: (sql, tenantId, id, etag, data) => sql`
    INSERT INTO connector_ms365_planner.planner_task_details_cache
      (tenant_id, graph_task_id, etag, raw, synced_at)
    VALUES (${tenantId}, ${id}, ${etag}, ${data}, NOW())
    ON CONFLICT (tenant_id, graph_task_id)
    DO UPDATE SET
      etag = EXCLUDED.etag,
      raw = EXCLUDED.raw,
      synced_at = EXCLUDED.synced_at
  `,
  upsertRow: (sql, tenantId, id, etag, raw) => sql`
    INSERT INTO connector_ms365_planner.planner_task_details_cache
      (tenant_id, graph_task_id, etag, raw, synced_at)
    VALUES (${tenantId}, ${id}, ${etag}, ${raw}, NOW())
    ON CONFLICT (tenant_id, graph_task_id)
    DO UPDATE SET
      etag = EXCLUDED.etag,
      raw = EXCLUDED.raw,
      synced_at = EXCLUDED.synced_at
  `,
}

const planOps: EntityOps = {
  selectOne: (sql, tenantId, id) => sql`
    SELECT etag, raw, synced_at AS "syncedAt"
    FROM connector_ms365_planner.planner_plans_cache
    WHERE tenant_id = ${tenantId}
      AND graph_plan_id = ${id}
      AND soft_deleted_at IS NULL
  `,
  upsertLive: (sql, tenantId, id, etag, data) => sql`
    INSERT INTO connector_ms365_planner.planner_plans_cache
      (tenant_id, graph_plan_id, etag, raw, synced_at)
    VALUES (${tenantId}, ${id}, ${etag}, ${data}, NOW())
    ON CONFLICT (tenant_id, graph_plan_id)
    DO UPDATE SET
      etag = EXCLUDED.etag,
      raw = EXCLUDED.raw,
      synced_at = EXCLUDED.synced_at,
      soft_deleted_at = NULL
  `,
  upsertRow: (sql, tenantId, id, etag, raw) => sql`
    INSERT INTO connector_ms365_planner.planner_plans_cache
      (tenant_id, graph_plan_id, etag, raw, synced_at)
    VALUES (${tenantId}, ${id}, ${etag}, ${raw}, NOW())
    ON CONFLICT (tenant_id, graph_plan_id)
    DO UPDATE SET
      etag = EXCLUDED.etag,
      raw = EXCLUDED.raw,
      synced_at = EXCLUDED.synced_at,
      soft_deleted_at = NULL
  `,
  softDeleteRow: (sql, tenantId, id) => sql`
    UPDATE connector_ms365_planner.planner_plans_cache
    SET soft_deleted_at = NOW()
    WHERE tenant_id = ${tenantId}
      AND graph_plan_id = ${id}
  `,
}

const bucketOps: EntityOps = {
  selectOne: (sql, tenantId, id) => sql`
    SELECT etag, raw, synced_at AS "syncedAt"
    FROM connector_ms365_planner.planner_buckets_cache
    WHERE tenant_id = ${tenantId}
      AND graph_bucket_id = ${id}
      AND soft_deleted_at IS NULL
  `,
  upsertLive: (sql, tenantId, id, etag, data) => sql`
    INSERT INTO connector_ms365_planner.planner_buckets_cache
      (tenant_id, graph_bucket_id, etag, raw, synced_at)
    VALUES (${tenantId}, ${id}, ${etag}, ${data}, NOW())
    ON CONFLICT (tenant_id, graph_bucket_id)
    DO UPDATE SET
      etag = EXCLUDED.etag,
      raw = EXCLUDED.raw,
      synced_at = EXCLUDED.synced_at,
      soft_deleted_at = NULL
  `,
  upsertRow: (sql, tenantId, id, etag, raw) => sql`
    INSERT INTO connector_ms365_planner.planner_buckets_cache
      (tenant_id, graph_bucket_id, etag, raw, synced_at)
    VALUES (${tenantId}, ${id}, ${etag}, ${raw}, NOW())
    ON CONFLICT (tenant_id, graph_bucket_id)
    DO UPDATE SET
      etag = EXCLUDED.etag,
      raw = EXCLUDED.raw,
      synced_at = EXCLUDED.synced_at,
      soft_deleted_at = NULL
  `,
  softDeleteRow: (sql, tenantId, id) => sql`
    UPDATE connector_ms365_planner.planner_buckets_cache
    SET soft_deleted_at = NOW()
    WHERE tenant_id = ${tenantId}
      AND graph_bucket_id = ${id}
  `,
}

export function createPlannerCache(deps: PlannerCacheDeps): PlannerCache {
  const nowMs = deps.now ?? (() => Date.now())
  const ttlPlansSec = deps.ttlPlansSec ?? deps.ttlTasksSec
  const ttlBucketsSec = deps.ttlBucketsSec ?? deps.ttlTasksSec

  const common = {
    sql: deps.sql,
    now: nowMs,
    staleFallbackMaxSec: deps.staleFallbackMaxSec,
  }

  return {
    task: buildEntityCache({
      ...common,
      ops: taskOps,
      ttlSec: deps.ttlTasksSec,
      fetchLive: (id) => deps.client.getTask(id),
    }),

    taskDetails: buildEntityCache({
      ...common,
      ops: taskDetailsOps,
      ttlSec: deps.ttlTasksSec,
      fetchLive: (id) => deps.client.getTaskDetails(id),
    }),

    plan: buildEntityCache({
      ...common,
      ops: planOps,
      ttlSec: ttlPlansSec,
      fetchLive: (id) => deps.client.getPlan(id),
    }),

    bucket: buildEntityCache({
      ...common,
      ops: bucketOps,
      ttlSec: ttlBucketsSec,
      fetchLive: (id) => deps.client.getBucket(id),
    }),
  }
}

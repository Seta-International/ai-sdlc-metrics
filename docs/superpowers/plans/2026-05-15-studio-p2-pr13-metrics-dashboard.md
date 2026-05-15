# PR-13: Metrics Dashboard Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the metrics dashboard slice end-to-end: createMetricsRoutes (4 bucketed rollups bounded to 7d/30d/90d), SDK methods, Studio /metrics page with range Tabs + 4 Recharts panels + KeyValueList summary.

**Architecture:** Rollups read from existing materialized views in @seta/analytics (refresh already wired via planner-sync afterSync hook). Range is enum-bounded (7d/30d/90d). Recharts components used directly in apps/studio (no @seta/ui chart wrapper yet — defer to P3).

**Tech Stack:** Hono, @hono/zod-openapi, Zod 4.4.3, @seta/analytics, @seta/agent-sdk, Recharts (already added in PR-3), @seta/ui (Tabs from PR-8, SectionCard from PR-8, KeyValueList from PR-8).

---

## Pre-flight

- [ ] Read `/Users/canh/Projects/Seta/seta-os/CLAUDE.md` — Working rules, Boundaries, Schema-driven, Footguns, Conventions.
- [ ] Read `/Users/canh/Projects/Seta/seta-os/docs/superpowers/specs/2026-05-15-studio-p2-master-plan.md` §0 (Studio layout & AgentPanel ownership — admin-only, no `AgentPanel` in Studio) + §17 (this slice) + §7 (universal route conventions, SDK method matrix). The `'metrics'` value in the `@seta/ui` `AgentContext['page']` union is reserved for OTHER Workspace modules; Studio does not consume it.
- [ ] Read `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/src/index.ts` — current exports: `analyticsSchema`, `createAnalyticsTools`, `refreshAnalyticsViews`. PR-13 adds `createMetricsRoutes` + 4 query functions next to them.
- [ ] Read `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/migrations/0000_create-analytics-schema-and-views.sql` — existing views `analytics.mv_assignee_workload` + `analytics.mv_plan_weekly_velocity`. **They do not cover runs/tokens/latency/errors.** This PR adds 4 new materialized views via a Drizzle custom migration plus underlying telemetry table (`analytics.run_events`) seeded by the kernel run-loop (post-PR; for now, this PR writes the schema + RLS + views, and integration tests insert rows directly).
- [ ] Read `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/src/tools/workload_by_assignee.ts` — pattern for `DbSql` + `tenantContext` queries against `analytics.*`.
- [ ] Read `/Users/canh/Projects/Seta/seta-os/apps/api/src/main.ts` lines 1-50 + 125-250 — composition point + `afterSync` hook that already calls `refreshAnalyticsViews(sql)`.
- [ ] Read `/Users/canh/Projects/Seta/seta-os/platform/agent/server/src/routes.ts` — `createXRoutes(deps): Hono` factory pattern (DbSql injection, `tenantContext.getTenantId()`, `DomainError`).
- [ ] Read `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/client/AgentClient.ts` + `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/index.ts` — SDK client method pattern, Zod schemas + `request()` transport.
- [ ] Read Mastra reference: `/Users/canh/Projects/Seta/mastra/packages/playground-ui/src/domains/metrics/components/` (`latency-card-view.tsx`, `model-usage-cost-card-view.tsx`, `traces-volume-card-view.tsx`) for chart-grid + Recharts patterns. We DO NOT copy code; pattern only.
- [ ] Confirm cwd is repo root for all `pnpm` commands.

---

## Task 1 — Add `@hono/zod-openapi` + `hono` to `@seta/analytics`

- [ ] Run `pnpm view @hono/zod-openapi version` and record the pin. (At time of writing the workspace uses one pin across packages; reuse it.)
- [ ] Run `pnpm --filter @seta/analytics add @hono/zod-openapi@<resolved-pin> hono@<resolved-pin>`. Verify only `modules/products/analytics/package.json` `dependencies` and `pnpm-lock.yaml` change.
- [ ] Run `pnpm --filter @seta/analytics add @seta/identity@workspace:* @seta/tenant@workspace:*` (workspace protocol mandatory). `@seta/tenant` is already a transitive but make it a direct dep — `createMetricsRoutes` imports `requireTenantMembership` from it.
- [ ] Run `pnpm --filter @seta/analytics typecheck` — must pass before any code change.

---

## Task 2 — Generate custom migration `0001_metrics_views.sql`

### 2.1 — Run drizzle-kit custom

- [ ] Run `pnpm --filter @seta/analytics exec drizzle-kit generate --custom --name metrics_views`. Verify a new file `modules/products/analytics/migrations/0001_metrics_views.sql` appears empty (custom = blank template) and `migrations/meta/_journal.json` + `migrations/meta/0001_snapshot.json` are written.
- [ ] Open `modules/products/analytics/migrations/0001_metrics_views.sql` and write the DDL below.

### 2.2 — Fill the custom SQL

- [ ] Replace the empty file contents with:

```sql
-- Telemetry source table (kernel writes one row per run; later PRs replace stub seeds in tests).
CREATE TABLE analytics.run_events (
  run_id       uuid        PRIMARY KEY,
  tenant_id    uuid        NOT NULL,
  agent_id     uuid,
  status       text        NOT NULL,                       -- 'started' | 'completed' | 'failed'
  error_kind   text,                                       -- nullable; populated on failure
  started_at   timestamptz NOT NULL,
  ended_at     timestamptz,
  duration_ms  integer,
  prompt_tokens     integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  cached_tokens     integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE analytics.run_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE analytics.run_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation_run_events
  ON analytics.run_events AS PERMISSIVE FOR ALL TO tenant_user
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
CREATE INDEX run_events_tenant_started_idx
  ON analytics.run_events (tenant_id, started_at DESC);
--> statement-breakpoint

-- Daily runs rollup (used for 7d + 30d ranges).
CREATE MATERIALIZED VIEW analytics.mv_runs_daily AS
SELECT
  tenant_id,
  date_trunc('day', started_at)::date                              AS bucket_date,
  COUNT(*)                                                         AS started,
  COUNT(*) FILTER (WHERE status = 'completed')                     AS completed,
  COUNT(*) FILTER (WHERE status = 'failed')                        AS failed
FROM analytics.run_events
GROUP BY tenant_id, date_trunc('day', started_at);
--> statement-breakpoint
CREATE UNIQUE INDEX ON analytics.mv_runs_daily (tenant_id, bucket_date);
--> statement-breakpoint

-- Weekly runs rollup (used for 90d range).
CREATE MATERIALIZED VIEW analytics.mv_runs_weekly AS
SELECT
  tenant_id,
  date_trunc('week', started_at)::date                             AS bucket_date,
  COUNT(*)                                                         AS started,
  COUNT(*) FILTER (WHERE status = 'completed')                     AS completed,
  COUNT(*) FILTER (WHERE status = 'failed')                        AS failed
FROM analytics.run_events
GROUP BY tenant_id, date_trunc('week', started_at);
--> statement-breakpoint
CREATE UNIQUE INDEX ON analytics.mv_runs_weekly (tenant_id, bucket_date);
--> statement-breakpoint

-- Daily token rollup.
CREATE MATERIALIZED VIEW analytics.mv_tokens_daily AS
SELECT
  tenant_id,
  date_trunc('day', started_at)::date                              AS bucket_date,
  COALESCE(SUM(prompt_tokens), 0)::bigint                          AS prompt,
  COALESCE(SUM(completion_tokens), 0)::bigint                      AS completion,
  COALESCE(SUM(cached_tokens), 0)::bigint                          AS cached
FROM analytics.run_events
GROUP BY tenant_id, date_trunc('day', started_at);
--> statement-breakpoint
CREATE UNIQUE INDEX ON analytics.mv_tokens_daily (tenant_id, bucket_date);
--> statement-breakpoint

-- Weekly token rollup.
CREATE MATERIALIZED VIEW analytics.mv_tokens_weekly AS
SELECT
  tenant_id,
  date_trunc('week', started_at)::date                             AS bucket_date,
  COALESCE(SUM(prompt_tokens), 0)::bigint                          AS prompt,
  COALESCE(SUM(completion_tokens), 0)::bigint                      AS completion,
  COALESCE(SUM(cached_tokens), 0)::bigint                          AS cached
FROM analytics.run_events
GROUP BY tenant_id, date_trunc('week', started_at);
--> statement-breakpoint
CREATE UNIQUE INDEX ON analytics.mv_tokens_weekly (tenant_id, bucket_date);
--> statement-breakpoint

-- Daily latency rollup (p50/p95/p99 via percentile_cont on duration_ms).
CREATE MATERIALIZED VIEW analytics.mv_latency_daily AS
SELECT
  tenant_id,
  date_trunc('day', started_at)::date                              AS bucket_date,
  COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms), 0)::integer AS p50,
  COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::integer AS p95,
  COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms), 0)::integer AS p99
FROM analytics.run_events
WHERE duration_ms IS NOT NULL
GROUP BY tenant_id, date_trunc('day', started_at);
--> statement-breakpoint
CREATE UNIQUE INDEX ON analytics.mv_latency_daily (tenant_id, bucket_date);
--> statement-breakpoint

-- Weekly latency rollup.
CREATE MATERIALIZED VIEW analytics.mv_latency_weekly AS
SELECT
  tenant_id,
  date_trunc('week', started_at)::date                             AS bucket_date,
  COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms), 0)::integer AS p50,
  COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::integer AS p95,
  COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms), 0)::integer AS p99
FROM analytics.run_events
WHERE duration_ms IS NOT NULL
GROUP BY tenant_id, date_trunc('week', started_at);
--> statement-breakpoint
CREATE UNIQUE INDEX ON analytics.mv_latency_weekly (tenant_id, bucket_date);
--> statement-breakpoint

-- Daily error rollup (one row per (date, kind); UI pivots to byKind map).
CREATE MATERIALIZED VIEW analytics.mv_errors_daily AS
SELECT
  tenant_id,
  date_trunc('day', started_at)::date                              AS bucket_date,
  COALESCE(error_kind, 'unknown')                                  AS error_kind,
  COUNT(*)                                                         AS count
FROM analytics.run_events
WHERE status = 'failed'
GROUP BY tenant_id, date_trunc('day', started_at), error_kind;
--> statement-breakpoint
CREATE UNIQUE INDEX ON analytics.mv_errors_daily (tenant_id, bucket_date, error_kind);
--> statement-breakpoint

-- Weekly error rollup.
CREATE MATERIALIZED VIEW analytics.mv_errors_weekly AS
SELECT
  tenant_id,
  date_trunc('week', started_at)::date                             AS bucket_date,
  COALESCE(error_kind, 'unknown')                                  AS error_kind,
  COUNT(*)                                                         AS count
FROM analytics.run_events
WHERE status = 'failed'
GROUP BY tenant_id, date_trunc('week', started_at), error_kind;
--> statement-breakpoint
CREATE UNIQUE INDEX ON analytics.mv_errors_weekly (tenant_id, bucket_date, error_kind);
```

- [ ] Run `pnpm migrate` against the local dev DB (after `pnpm db:up`). Verify the 6 new MVs and `analytics.run_events` exist via `psql -d seta -c '\dm analytics.*'`.

### 2.3 — Wire run_events to the Drizzle schema (so $inferInsert exists for tests)

- [ ] Edit `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/src/schema.ts` to add the table mapping (no new tables in SQL — schema-side mirror only):

```ts
import { sql } from 'drizzle-orm'
import { date, index, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const analyticsSchema = pgSchema('analytics')

export const runEvents = analyticsSchema.table(
  'run_events',
  {
    runId: uuid('run_id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    agentId: uuid('agent_id'),
    status: text('status').notNull(),
    errorKind: text('error_kind'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    cachedTokens: integer('cached_tokens').notNull().default(0),
  },
  (t) => [index('run_events_tenant_started_idx').on(t.tenantId, t.startedAt)],
)

export type RunEventRow = typeof runEvents.$inferSelect
export type NewRunEvent = typeof runEvents.$inferInsert
```

- [ ] Run `pnpm --filter @seta/analytics exec drizzle-kit generate` (no `--custom`). Drizzle should detect that `analytics.run_events` already exists in the snapshot from step 2.1; if it emits a duplicate-create, delete the emitted file and instead re-run `drizzle-kit generate --custom --name sync_run_events_snapshot` and leave the body empty (the journal advances; the snapshot stays in sync). Verify `_journal.json` has the new entry.
- [ ] Run `pnpm --filter @seta/analytics typecheck`.

### 2.4 — Extend `refreshAnalyticsViews` to refresh the 6 new MVs

- [ ] Edit `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/src/index.ts`:

```ts
export async function refreshAnalyticsViews(
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>,
): Promise<void> {
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_assignee_workload`
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_plan_weekly_velocity`
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_runs_daily`
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_runs_weekly`
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_tokens_daily`
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_tokens_weekly`
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_latency_daily`
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_latency_weekly`
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_errors_daily`
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_errors_weekly`
}
```

- [ ] Run `pnpm --filter @seta/analytics typecheck`.

---

## Task 3 — Metrics Zod schemas (single source of truth shared between routes + SDK)

### 3.1 — Failing test first

- [ ] Create `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/src/metrics/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ErrorMetrics,
  LatencyMetrics,
  MetricsRange,
  RunMetrics,
  TokenMetrics,
} from './schemas'

describe('MetricsRange', () => {
  it.each(['7d', '30d', '90d'])('accepts %s', (r) => {
    expect(MetricsRange.parse(r)).toBe(r)
  })

  it.each(['1d', '180d', '30D', '', 'forever'])('rejects %s', (r) => {
    expect(() => MetricsRange.parse(r)).toThrow()
  })
})

describe('RunMetrics', () => {
  it('parses a well-formed payload', () => {
    const v = RunMetrics.parse({
      buckets: [{ date: '2026-05-08', started: 12, completed: 10, failed: 2 }],
      summary: { totalRuns: 12, errorRate: 0.166 },
    })
    expect(v.summary.totalRuns).toBe(12)
  })
  it('rejects negative counts', () => {
    expect(() =>
      RunMetrics.parse({
        buckets: [{ date: '2026-05-08', started: -1, completed: 0, failed: 0 }],
        summary: { totalRuns: 0, errorRate: 0 },
      }),
    ).toThrow()
  })
})

describe('TokenMetrics', () => {
  it('parses', () => {
    expect(
      TokenMetrics.parse({
        buckets: [{ date: '2026-05-08', prompt: 100, completion: 50, cached: 10 }],
        summary: { totalTokens: 160 },
      }).summary.totalTokens,
    ).toBe(160)
  })
})

describe('LatencyMetrics', () => {
  it('parses', () => {
    expect(
      LatencyMetrics.parse({
        buckets: [{ date: '2026-05-08', p50: 100, p95: 500, p99: 1200 }],
        summary: { p95: 500 },
      }).summary.p95,
    ).toBe(500)
  })
})

describe('ErrorMetrics', () => {
  it('parses with byKind map', () => {
    expect(
      ErrorMetrics.parse({
        buckets: [
          { date: '2026-05-08', count: 5, byKind: { Timeout: 3, RateLimit: 2 } },
        ],
        summary: { totalErrors: 5 },
      }).buckets[0].byKind.Timeout,
    ).toBe(3)
  })
})
```

- [ ] Run `pnpm --filter @seta/analytics vitest run src/metrics/schemas.test.ts`. Expect: module not found.

### 3.2 — Implementation

- [ ] Create `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/src/metrics/schemas.ts`:

```ts
import { z } from '@hono/zod-openapi'

export const MetricsRange = z.enum(['7d', '30d', '90d']).openapi('MetricsRange')
export type MetricsRange = z.infer<typeof MetricsRange>

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

export const RunBucket = z.object({
  date: DateString,
  started: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})

export const RunMetrics = z
  .object({
    buckets: z.array(RunBucket),
    summary: z.object({
      totalRuns: z.number().int().nonnegative(),
      errorRate: z.number().min(0).max(1),
    }),
  })
  .openapi('RunMetrics')
export type RunMetrics = z.infer<typeof RunMetrics>

export const TokenBucket = z.object({
  date: DateString,
  prompt: z.number().int().nonnegative(),
  completion: z.number().int().nonnegative(),
  cached: z.number().int().nonnegative(),
})

export const TokenMetrics = z
  .object({
    buckets: z.array(TokenBucket),
    summary: z.object({
      totalTokens: z.number().int().nonnegative(),
    }),
  })
  .openapi('TokenMetrics')
export type TokenMetrics = z.infer<typeof TokenMetrics>

export const LatencyBucket = z.object({
  date: DateString,
  p50: z.number().int().nonnegative(),
  p95: z.number().int().nonnegative(),
  p99: z.number().int().nonnegative(),
})

export const LatencyMetrics = z
  .object({
    buckets: z.array(LatencyBucket),
    summary: z.object({
      p95: z.number().int().nonnegative(),
    }),
  })
  .openapi('LatencyMetrics')
export type LatencyMetrics = z.infer<typeof LatencyMetrics>

export const ErrorBucket = z.object({
  date: DateString,
  count: z.number().int().nonnegative(),
  byKind: z.record(z.string(), z.number().int().nonnegative()),
})

export const ErrorMetrics = z
  .object({
    buckets: z.array(ErrorBucket),
    summary: z.object({
      totalErrors: z.number().int().nonnegative(),
    }),
  })
  .openapi('ErrorMetrics')
export type ErrorMetrics = z.infer<typeof ErrorMetrics>

export function bucketGranularity(range: MetricsRange): 'daily' | 'weekly' {
  return range === '90d' ? 'weekly' : 'daily'
}

export function rangeDays(range: MetricsRange): number {
  return range === '7d' ? 7 : range === '30d' ? 30 : 90
}
```

- [ ] Run `pnpm --filter @seta/analytics vitest run src/metrics/schemas.test.ts`. Expect green.

---

## Task 4 — `getRunMetrics(sql, { tenantId, range })`

### 4.1 — Failing integration test

- [ ] Create `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/tests/integration/getRunMetrics.test.ts`:

```ts
import { withTenant } from '@seta/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getRunMetrics } from '../../src/metrics/queries'

// Reuse the workspace integration harness — same pattern as workload_by_assignee.test.ts.
declare const sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>

const TENANT_A = '11111111-1111-1111-1111-111111111111'
const TENANT_B = '22222222-2222-2222-2222-222222222222'

async function seed(tenantId: string, daysAgo: number, status: 'completed' | 'failed') {
  await sql`
    INSERT INTO analytics.run_events
      (run_id, tenant_id, status, error_kind, started_at, ended_at, duration_ms,
       prompt_tokens, completion_tokens, cached_tokens)
    VALUES
      (gen_random_uuid(), ${tenantId}, ${status},
       ${status === 'failed' ? 'Timeout' : null},
       now() - (${daysAgo}::int * INTERVAL '1 day'),
       now() - (${daysAgo}::int * INTERVAL '1 day') + INTERVAL '5 seconds',
       5000, 100, 50, 10)
  `
}

beforeEach(async () => {
  await sql`TRUNCATE analytics.run_events`
  // refresh the relevant MVs
  await sql`REFRESH MATERIALIZED VIEW analytics.mv_runs_daily`
  await sql`REFRESH MATERIALIZED VIEW analytics.mv_runs_weekly`
})

describe('getRunMetrics', () => {
  it('returns daily buckets for 7d range', async () => {
    await seed(TENANT_A, 0, 'completed')
    await seed(TENANT_A, 0, 'completed')
    await seed(TENANT_A, 0, 'failed')
    await seed(TENANT_A, 2, 'completed')
    await sql`REFRESH MATERIALIZED VIEW analytics.mv_runs_daily`

    const out = await withTenant(sql, TENANT_A, () =>
      getRunMetrics(sql, { tenantId: TENANT_A, range: '7d' }),
    )

    expect(out.buckets.length).toBeGreaterThanOrEqual(2)
    expect(out.summary.totalRuns).toBe(4)
    expect(out.summary.errorRate).toBeCloseTo(0.25, 2)
  })

  it('uses weekly granularity for 90d range', async () => {
    await seed(TENANT_A, 60, 'completed')
    await sql`REFRESH MATERIALIZED VIEW analytics.mv_runs_weekly`

    const out = await withTenant(sql, TENANT_A, () =>
      getRunMetrics(sql, { tenantId: TENANT_A, range: '90d' }),
    )

    expect(out.buckets.length).toBeGreaterThanOrEqual(1)
    // dates land on a week boundary (Monday in date_trunc('week', ...))
    const d = new Date(out.buckets[0].date)
    expect(d.getUTCDay()).toBe(1)
  })

  it('isolates tenants via RLS', async () => {
    await seed(TENANT_A, 0, 'completed')
    await seed(TENANT_B, 0, 'completed')
    await sql`REFRESH MATERIALIZED VIEW analytics.mv_runs_daily`

    const aOut = await withTenant(sql, TENANT_A, () =>
      getRunMetrics(sql, { tenantId: TENANT_A, range: '7d' }),
    )
    expect(aOut.summary.totalRuns).toBe(1)
  })
})
```

- [ ] Run `pnpm --filter @seta/analytics vitest run tests/integration/getRunMetrics.test.ts`. Expect failure: `queries.ts` missing.

### 4.2 — Implementation

- [ ] Create `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/src/metrics/queries.ts` (start with just `getRunMetrics`; later tasks add the other three):

```ts
import { bucketGranularity, type MetricsRange, type RunMetrics } from './schemas'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

interface QueryOpts {
  tenantId: string
  range: MetricsRange
}

interface RunBucketRow {
  bucket_date: Date
  started: string | number
  completed: string | number
  failed: string | number
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function getRunMetrics(sql: DbSql, { tenantId, range }: QueryOpts): Promise<RunMetrics> {
  const granularity = bucketGranularity(range)
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const rows = (granularity === 'daily'
    ? ((await sql`
        SELECT bucket_date, started, completed, failed
        FROM analytics.mv_runs_daily
        WHERE tenant_id = ${tenantId}
          AND bucket_date >= (now() - (${days}::int * INTERVAL '1 day'))::date
        ORDER BY bucket_date ASC
      `) as RunBucketRow[])
    : ((await sql`
        SELECT bucket_date, started, completed, failed
        FROM analytics.mv_runs_weekly
        WHERE tenant_id = ${tenantId}
          AND bucket_date >= (now() - (${days}::int * INTERVAL '1 day'))::date
        ORDER BY bucket_date ASC
      `) as RunBucketRow[]))

  const buckets = rows.map((r) => ({
    date: toIsoDate(r.bucket_date),
    started: Number(r.started),
    completed: Number(r.completed),
    failed: Number(r.failed),
  }))
  const totalRuns = buckets.reduce((s, b) => s + b.started, 0)
  const totalFailed = buckets.reduce((s, b) => s + b.failed, 0)
  const errorRate = totalRuns === 0 ? 0 : totalFailed / totalRuns
  return { buckets, summary: { totalRuns, errorRate } }
}
```

- [ ] Run `pnpm --filter @seta/analytics vitest run tests/integration/getRunMetrics.test.ts`. Expect green (requires `DATABASE_URL`).
- [ ] Run `pnpm --filter @seta/analytics typecheck`.

---

## Task 5 — `getTokenMetrics(sql, { tenantId, range })`

### 5.1 — Failing integration test

- [ ] Create `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/tests/integration/getTokenMetrics.test.ts` mirroring task 4 but seeding `prompt_tokens=100, completion_tokens=50, cached_tokens=10`, refreshing `mv_tokens_daily`/`mv_tokens_weekly`, and asserting `summary.totalTokens === sum(prompt+completion+cached)` across the buckets and that 90d uses weekly.
- [ ] Run the file; expect failure.

### 5.2 — Implementation

- [ ] Add to `modules/products/analytics/src/metrics/queries.ts`:

```ts
import type { TokenMetrics } from './schemas'

interface TokenBucketRow {
  bucket_date: Date
  prompt: string | number
  completion: string | number
  cached: string | number
}

export async function getTokenMetrics(
  sql: DbSql,
  { tenantId, range }: QueryOpts,
): Promise<TokenMetrics> {
  const granularity = bucketGranularity(range)
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const rows = (granularity === 'daily'
    ? ((await sql`
        SELECT bucket_date, prompt, completion, cached
        FROM analytics.mv_tokens_daily
        WHERE tenant_id = ${tenantId}
          AND bucket_date >= (now() - (${days}::int * INTERVAL '1 day'))::date
        ORDER BY bucket_date ASC
      `) as TokenBucketRow[])
    : ((await sql`
        SELECT bucket_date, prompt, completion, cached
        FROM analytics.mv_tokens_weekly
        WHERE tenant_id = ${tenantId}
          AND bucket_date >= (now() - (${days}::int * INTERVAL '1 day'))::date
        ORDER BY bucket_date ASC
      `) as TokenBucketRow[]))

  const buckets = rows.map((r) => ({
    date: toIsoDate(r.bucket_date),
    prompt: Number(r.prompt),
    completion: Number(r.completion),
    cached: Number(r.cached),
  }))
  const totalTokens = buckets.reduce((s, b) => s + b.prompt + b.completion + b.cached, 0)
  return { buckets, summary: { totalTokens } }
}
```

- [ ] Run the test. Expect green.
- [ ] Run `pnpm --filter @seta/analytics typecheck`.

---

## Task 6 — `getLatencyMetrics(sql, { tenantId, range })`

### 6.1 — Failing integration test

- [ ] Create `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/tests/integration/getLatencyMetrics.test.ts`. Seed 10 runs in one day with varying `duration_ms` (`100, 200, 300, ..., 1000`). Refresh `mv_latency_daily`. Assert `buckets[0].p50` ≈ 500 (±50 for `percentile_cont` interpolation), `p95` ≈ 950, `summary.p95 === buckets[0].p95`. Plus a 90d variant against `mv_latency_weekly`.
- [ ] Run the file; expect failure.

### 6.2 — Implementation

- [ ] Add to `modules/products/analytics/src/metrics/queries.ts`:

```ts
import type { LatencyMetrics } from './schemas'

interface LatencyBucketRow {
  bucket_date: Date
  p50: string | number
  p95: string | number
  p99: string | number
}

export async function getLatencyMetrics(
  sql: DbSql,
  { tenantId, range }: QueryOpts,
): Promise<LatencyMetrics> {
  const granularity = bucketGranularity(range)
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const rows = (granularity === 'daily'
    ? ((await sql`
        SELECT bucket_date, p50, p95, p99
        FROM analytics.mv_latency_daily
        WHERE tenant_id = ${tenantId}
          AND bucket_date >= (now() - (${days}::int * INTERVAL '1 day'))::date
        ORDER BY bucket_date ASC
      `) as LatencyBucketRow[])
    : ((await sql`
        SELECT bucket_date, p50, p95, p99
        FROM analytics.mv_latency_weekly
        WHERE tenant_id = ${tenantId}
          AND bucket_date >= (now() - (${days}::int * INTERVAL '1 day'))::date
        ORDER BY bucket_date ASC
      `) as LatencyBucketRow[]))

  const buckets = rows.map((r) => ({
    date: toIsoDate(r.bucket_date),
    p50: Number(r.p50),
    p95: Number(r.p95),
    p99: Number(r.p99),
  }))
  // Summary p95 = max bucket p95 (range-wide peak).
  const p95 = buckets.reduce((m, b) => Math.max(m, b.p95), 0)
  return { buckets, summary: { p95 } }
}
```

- [ ] Run the test. Expect green.

---

## Task 7 — `getErrorMetrics(sql, { tenantId, range })`

### 7.1 — Failing integration test

- [ ] Create `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/tests/integration/getErrorMetrics.test.ts`. Seed 3 `Timeout` failures and 2 `RateLimit` failures on the same day. Refresh `mv_errors_daily`. Assert one bucket with `count: 5`, `byKind: { Timeout: 3, RateLimit: 2 }`, `summary.totalErrors: 5`.
- [ ] Run the file; expect failure.

### 7.2 — Implementation

- [ ] Add to `modules/products/analytics/src/metrics/queries.ts`:

```ts
import type { ErrorMetrics } from './schemas'

interface ErrorBucketRow {
  bucket_date: Date
  error_kind: string
  count: string | number
}

export async function getErrorMetrics(
  sql: DbSql,
  { tenantId, range }: QueryOpts,
): Promise<ErrorMetrics> {
  const granularity = bucketGranularity(range)
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const rows = (granularity === 'daily'
    ? ((await sql`
        SELECT bucket_date, error_kind, count
        FROM analytics.mv_errors_daily
        WHERE tenant_id = ${tenantId}
          AND bucket_date >= (now() - (${days}::int * INTERVAL '1 day'))::date
        ORDER BY bucket_date ASC, error_kind ASC
      `) as ErrorBucketRow[])
    : ((await sql`
        SELECT bucket_date, error_kind, count
        FROM analytics.mv_errors_weekly
        WHERE tenant_id = ${tenantId}
          AND bucket_date >= (now() - (${days}::int * INTERVAL '1 day'))::date
        ORDER BY bucket_date ASC, error_kind ASC
      `) as ErrorBucketRow[]))

  // Pivot rows-per-(date, kind) into one bucket per date with byKind map.
  const byDate = new Map<string, { date: string; count: number; byKind: Record<string, number> }>()
  for (const r of rows) {
    const date = toIsoDate(r.bucket_date)
    const n = Number(r.count)
    const existing = byDate.get(date)
    if (existing) {
      existing.count += n
      existing.byKind[r.error_kind] = (existing.byKind[r.error_kind] ?? 0) + n
    } else {
      byDate.set(date, { date, count: n, byKind: { [r.error_kind]: n } })
    }
  }
  const buckets = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
  const totalErrors = buckets.reduce((s, b) => s + b.count, 0)
  return { buckets, summary: { totalErrors } }
}
```

- [ ] Run the test. Expect green.
- [ ] Run `pnpm --filter @seta/analytics typecheck`.

---

## Task 8 — `createMetricsRoutes` factory

### 8.1 — Failing route test

- [ ] Create `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/tests/integration/metrics-routes.test.ts`:

```ts
import { withTenant } from '@seta/db'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMetricsRoutes } from '../../src/metrics/routes'

declare const sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>

const TENANT = '11111111-1111-1111-1111-111111111111'
const USER = '99999999-9999-9999-9999-999999999999'

// Stub auth + membership middleware so the route layer is testable in isolation.
// We do NOT mock @seta/* — we inject fakes via the factory deps, matching the
// pattern used elsewhere when the SSO + tenant packages are not yet booted.
const requireSession = async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
  c.set('session', { userId: USER })
  await next()
}
const requireTenantMembership = async (_c: unknown, next: () => Promise<void>) => {
  await next()
}
const tenantMiddleware = async (_c: unknown, next: () => Promise<void>) => {
  await withTenant(sql, TENANT, async () => {
    await next()
  })
}

beforeEach(async () => {
  await sql`TRUNCATE analytics.run_events`
  await sql`REFRESH MATERIALIZED VIEW analytics.mv_runs_daily`
  await sql`INSERT INTO analytics.run_events (run_id, tenant_id, status, started_at, ended_at, duration_ms)
            VALUES (gen_random_uuid(), ${TENANT}, 'completed', now(), now() + INTERVAL '1 second', 1000)`
  await sql`REFRESH MATERIALIZED VIEW analytics.mv_runs_daily`
})

describe('createMetricsRoutes', () => {
  const app = createMetricsRoutes({
    sql,
    requireSession,
    requireTenantMembership,
    tenantMiddleware,
  })

  it('GET /metrics/runs?tenantId=&range=7d returns RunMetrics', async () => {
    const res = await app.request(`/metrics/runs?tenantId=${TENANT}&range=7d`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.summary.totalRuns).toBe(1)
    expect(body.buckets).toHaveLength(1)
  })

  it('rejects unbounded range with 400', async () => {
    const res = await app.request(`/metrics/runs?tenantId=${TENANT}&range=180d`)
    expect(res.status).toBe(400)
  })

  it.each(['/metrics/tokens', '/metrics/latency', '/metrics/errors'])(
    'GET %s answers 200 for range=30d',
    async (path) => {
      const res = await app.request(`${path}?tenantId=${TENANT}&range=30d`)
      expect(res.status).toBe(200)
    },
  )
})
```

- [ ] Run the test. Expect failure: `routes.ts` missing.

### 8.2 — Implementation

- [ ] Create `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/src/metrics/routes.ts`:

```ts
import { onError } from '@seta/middleware'
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import {
  getErrorMetrics,
  getLatencyMetrics,
  getRunMetrics,
  getTokenMetrics,
} from './queries'
import { ErrorMetrics, LatencyMetrics, MetricsRange, RunMetrics, TokenMetrics } from './schemas'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface MetricsRoutesDeps {
  sql: DbSql
  requireSession: MiddlewareHandler
  requireTenantMembership: MiddlewareHandler
  tenantMiddleware: MiddlewareHandler
}

const Query = z.object({
  tenantId: z.string().uuid().openapi({ param: { name: 'tenantId', in: 'query' } }),
  range: MetricsRange.openapi({ param: { name: 'range', in: 'query' } }),
})

export function createMetricsRoutes(deps: MetricsRoutesDeps): OpenAPIHono {
  const app = new OpenAPIHono().onError(onError)

  app.use('*', deps.requireSession)
  app.use('*', deps.tenantMiddleware)
  app.use('*', deps.requireTenantMembership)

  app.openapi(
    createRoute({
      method: 'get',
      path: '/metrics/runs',
      request: { query: Query },
      responses: {
        200: { description: 'Run metrics', content: { 'application/json': { schema: RunMetrics } } },
      },
    }),
    async (c) => {
      const { tenantId, range } = c.req.valid('query')
      return c.json(await getRunMetrics(deps.sql, { tenantId, range }))
    },
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/metrics/tokens',
      request: { query: Query },
      responses: {
        200: { description: 'Token metrics', content: { 'application/json': { schema: TokenMetrics } } },
      },
    }),
    async (c) => {
      const { tenantId, range } = c.req.valid('query')
      return c.json(await getTokenMetrics(deps.sql, { tenantId, range }))
    },
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/metrics/latency',
      request: { query: Query },
      responses: {
        200: { description: 'Latency metrics', content: { 'application/json': { schema: LatencyMetrics } } },
      },
    }),
    async (c) => {
      const { tenantId, range } = c.req.valid('query')
      return c.json(await getLatencyMetrics(deps.sql, { tenantId, range }))
    },
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/metrics/errors',
      request: { query: Query },
      responses: {
        200: { description: 'Error metrics', content: { 'application/json': { schema: ErrorMetrics } } },
      },
    }),
    async (c) => {
      const { tenantId, range } = c.req.valid('query')
      return c.json(await getErrorMetrics(deps.sql, { tenantId, range }))
    },
  )

  return app
}
```

- [ ] Run the route integration test. Expect green.

### 8.3 — Public exports

- [ ] Edit `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/src/index.ts` to export the new public surface:

```ts
export { createMetricsRoutes } from './metrics/routes'
export {
  getErrorMetrics,
  getLatencyMetrics,
  getRunMetrics,
  getTokenMetrics,
} from './metrics/queries'
export {
  ErrorMetrics,
  LatencyMetrics,
  MetricsRange,
  RunMetrics,
  TokenMetrics,
} from './metrics/schemas'
```

- [ ] Run `pnpm --filter @seta/analytics build` to confirm the dts emits cleanly.

---

## Task 9 — Mount `/metrics/*` in `apps/api/src/main.ts`

- [ ] Add to the existing analytics import in `apps/api/src/main.ts`:

```ts
import {
  ANALYTICS_PROFILE_SEED,
  createAnalyticsTools,
  createMetricsRoutes,
  refreshAnalyticsViews,
} from '@seta/analytics'
import { requireSession } from '@seta/identity'
import { requireTenantMembership, tenantMiddleware } from '@seta/tenant'
```

- [ ] Below the existing `app.route('/agent', agentRouter)` line, add:

```ts
app.route(
  '/',
  createMetricsRoutes({
    sql: sql as never,
    requireSession,
    requireTenantMembership,
    tenantMiddleware,
  }),
)
```

- [ ] Run `pnpm --filter @seta/api typecheck`.
- [ ] Smoke: `pnpm --filter @seta/api dev` in one terminal; `curl -s 'http://localhost:8080/metrics/runs?tenantId=<seeded-tenant>&range=7d' -H 'cookie: seta_sess=<dev-session>'` returns `{"buckets":[...],"summary":{...}}`. (Dev session via the PR-1 SSO dev login — until PR-1 lands, run the route integration test instead.)
- [ ] Add a one-line composition integration test under `apps/api/tests/integration/metrics-mount.test.ts` that boots the app and asserts `GET /metrics/runs` with an unauthenticated client returns 401 (via `requireSession`).

---

## Task 10 — SDK: `getRunMetrics`/`getTokenMetrics`/`getLatencyMetrics`/`getErrorMetrics`

### 10.1 — SDK schemas

- [ ] Add `@seta/analytics` as a workspace dep of `@seta/agent-sdk`: `pnpm --filter @seta/agent-sdk add @seta/analytics@workspace:*`. Verify only `platform/agent/sdk/package.json` and the lockfile change.
- [ ] Create `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/schemas/metrics.ts`:

```ts
export {
  ErrorMetrics,
  LatencyMetrics,
  MetricsRange,
  RunMetrics,
  TokenMetrics,
} from '@seta/analytics'
export type {
  ErrorMetrics as ErrorMetricsT,
  LatencyMetrics as LatencyMetricsT,
  MetricsRange as MetricsRangeT,
  RunMetrics as RunMetricsT,
  TokenMetrics as TokenMetricsT,
} from '@seta/analytics'
```

### 10.2 — Failing SDK test (MSW)

- [ ] Create `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/client/AgentClient.metrics.test.ts`:

```ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AgentClient } from './AgentClient'

const BASE = 'http://api.test'
const TENANT = '11111111-1111-1111-1111-111111111111'

const runsFixture = {
  buckets: [{ date: '2026-05-08', started: 5, completed: 4, failed: 1 }],
  summary: { totalRuns: 5, errorRate: 0.2 },
}
const tokensFixture = {
  buckets: [{ date: '2026-05-08', prompt: 1000, completion: 500, cached: 100 }],
  summary: { totalTokens: 1600 },
}
const latencyFixture = {
  buckets: [{ date: '2026-05-08', p50: 200, p95: 800, p99: 1500 }],
  summary: { p95: 800 },
}
const errorsFixture = {
  buckets: [{ date: '2026-05-08', count: 1, byKind: { Timeout: 1 } }],
  summary: { totalErrors: 1 },
}

const server = setupServer(
  http.get(`${BASE}/metrics/runs`, ({ request }) => {
    const url = new URL(request.url)
    expect(url.searchParams.get('tenantId')).toBe(TENANT)
    expect(['7d', '30d', '90d']).toContain(url.searchParams.get('range'))
    return HttpResponse.json(runsFixture)
  }),
  http.get(`${BASE}/metrics/tokens`, () => HttpResponse.json(tokensFixture)),
  http.get(`${BASE}/metrics/latency`, () => HttpResponse.json(latencyFixture)),
  http.get(`${BASE}/metrics/errors`, () => HttpResponse.json(errorsFixture)),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('AgentClient metrics methods', () => {
  const client = new AgentClient({ baseUrl: BASE })

  it('getRunMetrics returns the parsed payload', async () => {
    expect(await client.getRunMetrics(TENANT, '7d')).toEqual(runsFixture)
  })
  it('getTokenMetrics', async () => {
    expect(await client.getTokenMetrics(TENANT, '30d')).toEqual(tokensFixture)
  })
  it('getLatencyMetrics', async () => {
    expect(await client.getLatencyMetrics(TENANT, '90d')).toEqual(latencyFixture)
  })
  it('getErrorMetrics', async () => {
    expect(await client.getErrorMetrics(TENANT, '7d')).toEqual(errorsFixture)
  })
})
```

- [ ] Run `pnpm --filter @seta/agent-sdk vitest run src/client/AgentClient.metrics.test.ts`. Expect failure: methods missing.

### 10.3 — SDK implementation

- [ ] Edit `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/client/AgentClient.ts` to add the four methods inside the class:

```ts
import {
  ErrorMetrics,
  LatencyMetrics,
  MetricsRange,
  RunMetrics,
  TokenMetrics,
} from '@seta/analytics'

// ... existing AgentClient class ...

  getRunMetrics(
    tenantId: string,
    range: MetricsRange,
    init: { signal?: AbortSignal } = {},
  ): Promise<RunMetrics> {
    const reqInit: { schema: typeof RunMetrics; signal?: AbortSignal } = { schema: RunMetrics }
    if (init.signal) reqInit.signal = init.signal
    return request(
      this.opts,
      `/metrics/runs?tenantId=${encodeURIComponent(tenantId)}&range=${range}`,
      reqInit,
    )
  }

  getTokenMetrics(
    tenantId: string,
    range: MetricsRange,
    init: { signal?: AbortSignal } = {},
  ): Promise<TokenMetrics> {
    const reqInit: { schema: typeof TokenMetrics; signal?: AbortSignal } = { schema: TokenMetrics }
    if (init.signal) reqInit.signal = init.signal
    return request(
      this.opts,
      `/metrics/tokens?tenantId=${encodeURIComponent(tenantId)}&range=${range}`,
      reqInit,
    )
  }

  getLatencyMetrics(
    tenantId: string,
    range: MetricsRange,
    init: { signal?: AbortSignal } = {},
  ): Promise<LatencyMetrics> {
    const reqInit: { schema: typeof LatencyMetrics; signal?: AbortSignal } = { schema: LatencyMetrics }
    if (init.signal) reqInit.signal = init.signal
    return request(
      this.opts,
      `/metrics/latency?tenantId=${encodeURIComponent(tenantId)}&range=${range}`,
      reqInit,
    )
  }

  getErrorMetrics(
    tenantId: string,
    range: MetricsRange,
    init: { signal?: AbortSignal } = {},
  ): Promise<ErrorMetrics> {
    const reqInit: { schema: typeof ErrorMetrics; signal?: AbortSignal } = { schema: ErrorMetrics }
    if (init.signal) reqInit.signal = init.signal
    return request(
      this.opts,
      `/metrics/errors?tenantId=${encodeURIComponent(tenantId)}&range=${range}`,
      reqInit,
    )
  }
```

- [ ] Edit `/Users/canh/Projects/Seta/seta-os/platform/agent/sdk/src/index.ts` to re-export:

```ts
export {
  ErrorMetrics,
  LatencyMetrics,
  MetricsRange,
  RunMetrics,
  TokenMetrics,
} from '@seta/analytics'
```

- [ ] Run `pnpm --filter @seta/agent-sdk vitest run src/client/AgentClient.metrics.test.ts`. Expect green.
- [ ] Run `pnpm --filter @seta/agent-sdk typecheck`.
- [ ] Run `pnpm --filter @seta/agent-sdk build`.

---

## Task 11 — Studio: react-query options keyed by (tenantId, range)

- [ ] Edit `/Users/canh/Projects/Seta/seta-os/apps/studio/src/api/queries.ts` (assume it already exists with `meQuery`/`tenantsQuery`/etc. — append the four metrics query factories):

```ts
import { queryOptions } from '@tanstack/react-query'
import type { MetricsRange } from '@seta/agent-sdk'
import { client } from './client'

export const runMetricsQuery = (tenantId: string, range: MetricsRange) =>
  queryOptions({
    queryKey: ['metrics', 'runs', tenantId, range] as const,
    queryFn: ({ signal }) => client.getRunMetrics(tenantId, range, { signal }),
    staleTime: 30_000,
  })

export const tokenMetricsQuery = (tenantId: string, range: MetricsRange) =>
  queryOptions({
    queryKey: ['metrics', 'tokens', tenantId, range] as const,
    queryFn: ({ signal }) => client.getTokenMetrics(tenantId, range, { signal }),
    staleTime: 30_000,
  })

export const latencyMetricsQuery = (tenantId: string, range: MetricsRange) =>
  queryOptions({
    queryKey: ['metrics', 'latency', tenantId, range] as const,
    queryFn: ({ signal }) => client.getLatencyMetrics(tenantId, range, { signal }),
    staleTime: 30_000,
  })

export const errorMetricsQuery = (tenantId: string, range: MetricsRange) =>
  queryOptions({
    queryKey: ['metrics', 'errors', tenantId, range] as const,
    queryFn: ({ signal }) => client.getErrorMetrics(tenantId, range, { signal }),
    staleTime: 30_000,
  })
```

- [ ] Run `pnpm --filter @seta/studio typecheck`.

---

## Task 12 — Studio: `features/metrics/` chart components (one panel per file)

### 12.1 — Failing component test for the runs chart

- [ ] Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/features/metrics/RunsChart.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RunsChart } from './RunsChart'

const fixture = {
  buckets: [
    { date: '2026-05-08', started: 5, completed: 4, failed: 1 },
    { date: '2026-05-09', started: 7, completed: 6, failed: 1 },
  ],
  summary: { totalRuns: 12, errorRate: 0.166 },
}

describe('RunsChart', () => {
  it('renders one bar group per bucket', () => {
    const { container } = render(<RunsChart data={fixture} />)
    // Recharts emits one <g class="recharts-bar"> per series; we just sanity-check the data length.
    expect(container.querySelectorAll('.recharts-bar')).toHaveLength(3)
    expect(screen.getByText(/started/i)).toBeInTheDocument()
  })
})
```

- [ ] Run; expect failure.

### 12.2 — Implementation

- [ ] Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/features/metrics/RunsChart.tsx`:

```tsx
import type { RunMetrics } from '@seta/agent-sdk'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function RunsChart({ data }: { data: RunMetrics }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data.buckets} stackOffset="sign">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Bar dataKey="started" stackId="r" name="started" fill="var(--color-primary)" />
        <Bar dataKey="completed" stackId="r" name="completed" fill="var(--color-success)" />
        <Bar dataKey="failed" stackId="r" name="failed" fill="var(--color-error)" />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] Run the test. Expect green.

### 12.3 — TokensChart, LatencyChart, ErrorsChart

- [ ] Create `apps/studio/src/features/metrics/TokensChart.tsx` — `AreaChart` stacked (`prompt`, `completion`, `cached`). Co-located test asserting 3 `<g class="recharts-area">` elements.
- [ ] Create `apps/studio/src/features/metrics/LatencyChart.tsx` — `LineChart` with 3 `<Line>` series (`p50`, `p95`, `p99`). Co-located test asserting 3 `<g class="recharts-line">` elements.
- [ ] Create `apps/studio/src/features/metrics/ErrorsChart.tsx` — pivots `byKind` across the buckets into a union of kinds, renders a stacked `BarChart` with one `<Bar>` per kind. Co-located test seeds 2 buckets with `byKind: { Timeout: 3 }` and `{ RateLimit: 2 }` and asserts 2 distinct `<Bar>` series render.
- [ ] Run `pnpm --filter @seta/studio vitest run src/features/metrics/`. Expect all green.

---

## Task 13 — Studio: `MetricsSummary` (KeyValueList)

### 13.1 — Failing test

- [ ] Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/features/metrics/MetricsSummary.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MetricsSummary } from './MetricsSummary'

describe('MetricsSummary', () => {
  it('renders 4 entries with formatted numbers', () => {
    render(
      <MetricsSummary
        runs={{ totalRuns: 12345, errorRate: 0.1234 }}
        tokens={{ totalTokens: 9876543 }}
        latency={{ p95: 1850 }}
      />,
    )
    expect(screen.getByText(/12,345/)).toBeInTheDocument()
    expect(screen.getByText(/9,876,543/)).toBeInTheDocument()
    expect(screen.getByText(/12\.3%/)).toBeInTheDocument()
    expect(screen.getByText(/1,850 ms/)).toBeInTheDocument()
  })
})
```

- [ ] Run; expect failure.

### 13.2 — Implementation

- [ ] Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/features/metrics/MetricsSummary.tsx`:

```tsx
import type { LatencyMetrics, RunMetrics, TokenMetrics } from '@seta/agent-sdk'
import { KeyValueList } from '@seta/ui'

const n = new Intl.NumberFormat('en-US')

interface Props {
  runs: RunMetrics['summary']
  tokens: TokenMetrics['summary']
  latency: LatencyMetrics['summary']
}

export function MetricsSummary({ runs, tokens, latency }: Props) {
  return (
    <KeyValueList
      entries={[
        { key: 'Total runs', value: n.format(runs.totalRuns) },
        { key: 'Total tokens', value: n.format(tokens.totalTokens) },
        { key: 'Error rate', value: `${(runs.errorRate * 100).toFixed(1)}%` },
        { key: 'p95 latency', value: `${n.format(latency.p95)} ms` },
      ]}
    />
  )
}
```

- [ ] Run the test. Expect green.

---

## Task 14 — Studio: `/tenants/:id/metrics` page

### 14.1 — Failing page test (with MSW)

- [ ] Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/routes/_authed/tenants.$id.metrics.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { routeTree } from '../../routeTree.gen'

const TENANT = '11111111-1111-1111-1111-111111111111'

const make = (n: number) => ({
  buckets: Array.from({ length: n }, (_, i) => ({
    date: `2026-05-${String(i + 1).padStart(2, '0')}`,
    started: 1, completed: 1, failed: 0,
  })),
  summary: { totalRuns: n, errorRate: 0 },
})

const server = setupServer(
  http.get('http://localhost/metrics/runs', ({ request }) => {
    const range = new URL(request.url).searchParams.get('range')
    return HttpResponse.json(make(range === '90d' ? 13 : range === '30d' ? 30 : 7))
  }),
  http.get('http://localhost/metrics/tokens', () =>
    HttpResponse.json({ buckets: [], summary: { totalTokens: 42 } }),
  ),
  http.get('http://localhost/metrics/latency', () =>
    HttpResponse.json({ buckets: [], summary: { p95: 500 } }),
  ),
  http.get('http://localhost/metrics/errors', () =>
    HttpResponse.json({ buckets: [], summary: { totalErrors: 0 } }),
  ),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function mount(initial: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initial] }),
    context: { queryClient: qc },
  })
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('/tenants/:id/metrics', () => {
  it('renders 4 charts + summary for default 7d', async () => {
    mount(`/tenants/${TENANT}/metrics`)
    await waitFor(() => expect(screen.getByText(/Total runs/)).toBeInTheDocument())
    expect(screen.getByText(/Runs over time/)).toBeInTheDocument()
    expect(screen.getByText(/Token spend/)).toBeInTheDocument()
    expect(screen.getByText(/Latency/)).toBeInTheDocument()
    expect(screen.getByText(/Errors by kind/)).toBeInTheDocument()
  })

  it('switching range to 30d refetches and updates summary', async () => {
    const user = userEvent.setup()
    mount(`/tenants/${TENANT}/metrics`)
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument())
    await user.click(screen.getByRole('tab', { name: '30d' }))
    await waitFor(() => expect(screen.getByText('30')).toBeInTheDocument())
  })

  it('persists the range in URL search params', async () => {
    const user = userEvent.setup()
    mount(`/tenants/${TENANT}/metrics?range=90d`)
    await waitFor(() => expect(screen.getByText('13')).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: '90d' })).toHaveAttribute('data-state', 'active')
    await user.click(screen.getByRole('tab', { name: '7d' }))
    await waitFor(() => expect(window.location.search).toMatch(/range=7d/))
  })
})
```

- [ ] Run `pnpm --filter @seta/studio vitest run src/routes/_authed/tenants.\$id.metrics.test.tsx`. Expect failure: route module missing.

### 14.2 — Page implementation

- [ ] Create `/Users/canh/Projects/Seta/seta-os/apps/studio/src/routes/_authed/tenants.$id.metrics.tsx`:

```tsx
import type { MetricsRange } from '@seta/agent-sdk'
import { SectionCard, Tabs, TabsContent, TabsList, TabsTrigger } from '@seta/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import {
  errorMetricsQuery,
  latencyMetricsQuery,
  runMetricsQuery,
  tokenMetricsQuery,
} from '../../api/queries'
import { ErrorsChart } from '../../features/metrics/ErrorsChart'
import { LatencyChart } from '../../features/metrics/LatencyChart'
import { MetricsSummary } from '../../features/metrics/MetricsSummary'
import { RunsChart } from '../../features/metrics/RunsChart'
import { TokensChart } from '../../features/metrics/TokensChart'

const SearchSchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('7d'),
})

export const Route = createFileRoute('/_authed/tenants/$id/metrics')({
  validateSearch: SearchSchema,
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: async ({ params, deps, context }) => {
    const tenantId = params.id
    const { range } = deps
    await Promise.all([
      context.queryClient.ensureQueryData(runMetricsQuery(tenantId, range)),
      context.queryClient.ensureQueryData(tokenMetricsQuery(tenantId, range)),
      context.queryClient.ensureQueryData(latencyMetricsQuery(tenantId, range)),
      context.queryClient.ensureQueryData(errorMetricsQuery(tenantId, range)),
    ])
  },
  component: MetricsPage,
})

function MetricsPage() {
  const { id: tenantId } = Route.useParams()
  const { range } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const runs = useSuspenseQuery(runMetricsQuery(tenantId, range))
  const tokens = useSuspenseQuery(tokenMetricsQuery(tenantId, range))
  const latency = useSuspenseQuery(latencyMetricsQuery(tenantId, range))
  const errors = useSuspenseQuery(errorMetricsQuery(tenantId, range))

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Metrics</h1>
        <Tabs
          value={range}
          onValueChange={(v) =>
            navigate({ search: { range: v as MetricsRange }, replace: true })
          }
        >
          <TabsList>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
            <TabsTrigger value="90d">90d</TabsTrigger>
          </TabsList>
          <TabsContent value={range} />
        </Tabs>
      </header>

      <MetricsSummary
        runs={runs.data.summary}
        tokens={tokens.data.summary}
        latency={latency.data.summary}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Runs over time">
          <RunsChart data={runs.data} />
        </SectionCard>
        <SectionCard title="Token spend">
          <TokensChart data={tokens.data} />
        </SectionCard>
        <SectionCard title="Latency (p50 / p95 / p99)">
          <LatencyChart data={latency.data} />
        </SectionCard>
        <SectionCard title="Errors by kind">
          <ErrorsChart data={errors.data} />
        </SectionCard>
      </div>
    </div>
  )
}
```

- [ ] Run `pnpm --filter @seta/studio vitest run src/routes/_authed/tenants.\$id.metrics.test.tsx`. Expect green.

---

## Task 15 — Update `apps/studio/src/nav/agentContext.ts` — N/A in Studio

> Studio is admin-only and does NOT mount the right-side `AgentPanel` (master plan §0). There is no `apps/studio/src/nav/agentContext.ts` to extend for `/metrics`. The `'metrics'` `AgentContext['page']` value remains reserved in `@seta/ui` for OTHER Workspace modules. Skip to Task 16.

---

## Task 16 — E2E spec

- [ ] Create `/Users/canh/Projects/Seta/seta-os/tests/e2e/studio/metrics.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.describe('Metrics dashboard', () => {
  test('renders 4 charts + KV summary, range switch refetches', async ({ page, request }) => {
    // Seed analytics.run_events for the dev tenant.
    await request.post('/test-helpers/seed-run-events', {
      data: { count: 24, errorKinds: ['Timeout', 'RateLimit'] },
    })

    await page.goto('/login')
    await page.getByRole('button', { name: /Microsoft/ }).click() // dev SSO stub
    await page.goto('/tenants/dev/metrics')

    await expect(page.getByText('Total runs')).toBeVisible()
    await expect(page.getByText('Runs over time')).toBeVisible()
    await expect(page.getByText('Token spend')).toBeVisible()
    await expect(page.getByText(/Latency/)).toBeVisible()
    await expect(page.getByText('Errors by kind')).toBeVisible()

    // 4 SectionCards each with one ResponsiveContainer.
    await expect(page.locator('.recharts-responsive-container')).toHaveCount(4)

    // Switch to 90d — request fires with range=90d.
    const reqPromise = page.waitForRequest(/\/metrics\/runs\?.*range=90d/)
    await page.getByRole('tab', { name: '90d' }).click()
    await reqPromise

    await expect(page).toHaveURL(/range=90d/)
  })
})
```

- [ ] Run `pnpm test:e2e -- studio/metrics.spec.ts` against the dockerized stack. Expect green.

---

## Task 17 — Update SCOPE.md files

- [ ] Edit `/Users/canh/Projects/Seta/seta-os/modules/products/analytics/SCOPE.md` (create if absent) to add a "Metrics surface" section: lists `createMetricsRoutes`, the 4 query functions, the 6 new MVs, and `analytics.run_events` as owned tables. Note that `refreshAnalyticsViews` now refreshes 10 MVs.
- [ ] Edit `/Users/canh/Projects/Seta/seta-os/apps/api/SCOPE.md` to add `/metrics/*` to the route-mount inventory under "Mounts".
- [ ] Edit `/Users/canh/Projects/Seta/seta-os/apps/studio/SCOPE.md` to add the metrics functional area to the "Owns" list: `/tenants/:id/metrics` page with 4 Recharts panels and KeyValueList summary; range bounded to 7d/30d/90d via URL search-param.

---

## Task 18 — Verification before completion

- [ ] Run `pnpm --filter @seta/analytics typecheck && pnpm --filter @seta/analytics test:unit && pnpm --filter @seta/analytics test:integration`. All green.
- [ ] Run `pnpm --filter @seta/agent-sdk typecheck && pnpm --filter @seta/agent-sdk test:unit`. All green.
- [ ] Run `pnpm --filter @seta/studio typecheck && pnpm --filter @seta/studio test:unit`. All green.
- [ ] Run `pnpm --filter @seta/api typecheck`. Green.
- [ ] Run `pnpm lint`. Green.
- [ ] **Demo state:** `pnpm db:up` → seed via `tests/e2e/studio/seed-run-events.ts` (or psql) → `pnpm --filter @seta/api dev` + `pnpm --filter @seta/studio dev` → open `http://localhost:5173/tenants/<dev-tenant>/metrics`. See:
  - KeyValueList summary above the grid with non-zero `Total runs`, `Total tokens`, `Error rate`, `p95 latency`.
  - 2x2 grid of 4 charts (collapses to 1-col below 1024px).
  - Click 30d tab → URL becomes `?range=30d`, charts refetch and re-render.
  - Click 90d tab → URL becomes `?range=90d`, weekly buckets visible (fewer x-axis points than 30d).
- [ ] Confirm OpenAPI doc (if `apps/api` exposes `/openapi.json`) now lists `/metrics/runs`, `/metrics/tokens`, `/metrics/latency`, `/metrics/errors` with the right query schemas.

---

## Task 19 — Changeset + commits

- [ ] Run `pnpm changeset` and write one entry per changed published package (`@seta/analytics`, `@seta/agent-sdk`). `apps/studio` and `apps/api` are private (no changeset needed).
- [ ] Stage in three logical commits (do **not** bundle):
  - `feat(analytics): add metrics views + queries + createMetricsRoutes (7d/30d/90d rollups)`
  - `feat(agent-sdk): add getRunMetrics / getTokenMetrics / getLatencyMetrics / getErrorMetrics`
  - `feat(studio): add /tenants/:id/metrics dashboard (4 charts + summary + range tabs)`
- [ ] Use HEREDOC for messages per CLAUDE.md. Do not push.

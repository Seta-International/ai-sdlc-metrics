# Plan 4.2 — Link Groups + One-Shot Backfill (Pull-Only Mode)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tenant admin selects an M365 Group to sync. Future imports all current plans, buckets, tasks, and taskDetails into the planner DB. One-way pull only; push comes in Plan 4.4. Steady-state polling comes in Plan 4.3. This plan ships the first real Graph-touching code.

**Architecture:** Production `MsGraphClient` (thin fetch wrapper, etag-aware, paginated). New `ms_linked_group` + `ms_plan_sync_state` tables. `ms-sync-backfill-group` pg-boss job with SSE progress. Mappers for plan/bucket/task/taskDetails/assignments. Container picker UI extension in `web-planner`. Flip `planner.ms_sync.enabled` on for SETA internal at plan close.

**Tech Stack:** Drizzle, NestJS CQRS, pg-boss, native fetch, React SSE.

**Source spec:** [`2026-04-21-planner-ms-sync-4a-design.md`](../../specs/2026-04-21-planner-ms-sync-4a-design.md) §3.1, §3.4, §4.2, §4.3, §5.6, §8.2, §8.5, §10.2 (Plan 4.2).

**Depends on:** Plan 4.1 complete.

---

## Task 1: Migrations — `ms_linked_group`, `ms_plan_sync_state`, planner entity extensions

**Files:**

- Modify: `apps/api/src/modules/planner/infrastructure/schema/planner.schema.ts`
- Generate: `packages/db/drizzle/migrations/NNNN_planner_ms_link.sql`

- [ ] **Step 1: Append new tables to the Drizzle schema**

```typescript
export const msLinkedGroup = plannerSchema.table(
  'ms_linked_group',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    msGroupId: text('ms_group_id').notNull(),
    displayName: text('display_name').notNull(),
    linkedByActorId: uuid('linked_by_actor_id').notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
    syncEnabled: boolean('sync_enabled').notNull().default(true),
    backfillingAt: timestamp('backfilling_at', { withTimezone: true }),
    backfillJobId: text('backfill_job_id'),
    unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
  },
  (t) => ({
    uniqueGroup: uniqueIndex('uniq_ms_linked_group_tenant_msgroup').on(t.tenantId, t.msGroupId),
  }),
)

export const msPlanSyncState = plannerSchema.table(
  'ms_plan_sync_state',
  {
    planId: uuid('plan_id').primaryKey().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    msPlanId: text('ms_plan_id').notNull(),
    msPlanEtag: text('ms_plan_etag'),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    lastSuccessfulPollAt: timestamp('last_successful_poll_at', { withTimezone: true }),
    consecutiveErrorCount: integer('consecutive_error_count').notNull().default(0),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    pollPausedUntil: timestamp('poll_paused_until', { withTimezone: true }),
  },
  (t) => ({
    uniqueMsPlan: uniqueIndex('uniq_ms_plan_sync_state_tenant_msplan').on(t.tenantId, t.msPlanId),
  }),
)
```

- [ ] **Step 2: Extend `plan` / `bucket` / `task` columns**

Append to the existing table definitions (or add via `alterTable` pattern used elsewhere in the codebase):

- `plan.msPlanId TEXT`
- `plan.msPlanEtag TEXT`
- `plan.containerType TEXT NOT NULL DEFAULT 'future_only'` (values: `future_only | ms_group | ms_roster`)
- `plan.containerRef TEXT`
- `plan.isMsArchived BOOLEAN NOT NULL DEFAULT false`
- `bucket.msBucketId TEXT`
- `bucket.msBucketEtag TEXT`
- `task.msTaskId TEXT`
- `task.msTaskEtag TEXT`
- `task.msDetailsEtag TEXT`
- `task.pendingMsAssignments JSONB DEFAULT '[]'::jsonb`
- `task.msSoftDeletedAt TIMESTAMPTZ`

Sub-project #1 may already have some of these columns. Check each before adding. If Sub-project #1 is the source of truth and these already exist, don't re-declare.

- [ ] **Step 3: Generate migration + add RLS**

```bash
bun run --cwd packages/db db:generate
```

Edit the generated SQL. Append RLS for the two new tables:

```sql
ALTER TABLE planner.ms_linked_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner.ms_plan_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON planner.ms_linked_group
  FOR ALL USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE POLICY tenant_isolation ON planner.ms_plan_sync_state
  FOR ALL USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

No RLS changes needed for existing tables — existing `plan`/`task`/`bucket` policies already cover the new columns.

- [ ] **Step 4: Apply + verify**

```bash
bun run --cwd packages/db db:migrate
psql "$DATABASE_URL" -c "\d planner.ms_linked_group"
psql "$DATABASE_URL" -c "\d planner.ms_plan_sync_state"
```

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src/modules/planner/infrastructure/schema packages/db/drizzle/migrations
git commit -m "feat(planner): ms_linked_group + ms_plan_sync_state + plan/bucket/task extensions"
```

---

## Task 2: `MsGraphClient` — the thin-fetch workhorse

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/ms-graph/ms-graph-client.ts`
- Create: `apps/api/src/modules/planner/infrastructure/ms-graph/ms-graph-client.spec.ts`
- Create: `apps/api/src/modules/planner/infrastructure/ms-graph/errors.ts`

Client responsibilities for this plan:

- Acquire tenant token via `IdentityQueryFacade.getGraphCredential` + `MsGraphTokenAcquirer` (imported via facade).
- GET / POST / PATCH / DELETE with etag support on request (`If-Match`, `If-None-Match`) and response (`@odata.etag`).
- Paginate `@odata.nextLink`.
- Map HTTP errors to typed error classes: `GraphPreconditionFailedError` (412), `GraphThrottledError` (429 w/ retryAfter), `GraphAuthError` (401/403-auth), `GraphQuotaError` (403-quota with planner limit code), `GraphNotFoundError` (404), `GraphServerError` (5xx), `GraphUnknownError`.
- Retry on network errors with exponential back-off (max 3 attempts in the client layer; caller can retry more).

- [ ] **Step 1: Errors file**

```typescript
export class GraphError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message)
  }
}

export class GraphPreconditionFailedError extends GraphError {}
export class GraphThrottledError extends GraphError {
  constructor(
    message: string,
    body: unknown,
    public readonly retryAfterSeconds: number,
  ) {
    super(message, 429, body)
  }
}
export class GraphAuthError extends GraphError {}
export class GraphQuotaError extends GraphError {
  constructor(
    message: string,
    body: unknown,
    public readonly limitCode: string,
  ) {
    super(message, 403, body)
  }
}
export class GraphNotFoundError extends GraphError {}
export class GraphServerError extends GraphError {}
export class GraphUnknownError extends GraphError {}
```

- [ ] **Step 2: Test — full matrix**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MsGraphClient } from './ms-graph-client'
import {
  GraphPreconditionFailedError,
  GraphThrottledError,
  GraphAuthError,
  GraphQuotaError,
  GraphNotFoundError,
  GraphServerError,
} from './errors'

describe('MsGraphClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let identityFacade: any
  let tokenAcquirer: any

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    identityFacade = {
      getGraphCredential: vi.fn().mockResolvedValue({
        tenantAdId: 'aad',
        clientId: 'c',
        clientSecretRef: 'arn',
        scopes: [],
      }),
    }
    tokenAcquirer = { acquire: vi.fn().mockResolvedValue('tok') }
  })

  const client = () => new MsGraphClient(identityFacade, tokenAcquirer)

  it('GET returns body + etag', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'p1', '@odata.etag': 'W/"abc"' }),
    })
    const result = await client().get('t1', '/planner/plans/p1')
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ id: 'p1' })
    expect(result.etag).toBe('W/"abc"')
  })

  it('GET with If-None-Match returning 304 — null body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 304,
      headers: new Headers(),
      text: async () => '',
    })
    const result = await client().get('t1', '/planner/plans/p1', { ifNoneMatch: 'W/"abc"' })
    expect(result.status).toBe(304)
    expect(result.body).toBeNull()
  })

  it('PATCH with If-Match — 412 throws GraphPreconditionFailedError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 412,
      headers: new Headers(),
      text: async () => '{"error":"etag mismatch"}',
    })
    await expect(
      client().patch('t1', '/planner/tasks/x', { title: 'n' }, { ifMatch: 'W/"stale"' }),
    ).rejects.toBeInstanceOf(GraphPreconditionFailedError)
  })

  it('429 throws GraphThrottledError with retryAfter', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '42' }),
      text: async () => 'Too many',
    })
    await expect(client().get('t1', '/groups')).rejects.toMatchObject({
      name: 'GraphThrottledError',
      retryAfterSeconds: 42,
    })
  })

  it('401 throws GraphAuthError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => 'unauth',
    })
    await expect(client().get('t1', '/groups')).rejects.toBeInstanceOf(GraphAuthError)
  })

  it('403 with planner limit code throws GraphQuotaError carrying the code', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({ error: { code: 'MaximumTasksInProject', message: 'Plan full' } }),
    })
    await expect(client().post('t1', '/planner/tasks', { planId: 'x' })).rejects.toMatchObject({
      name: 'GraphQuotaError',
      limitCode: 'MaximumTasksInProject',
    })
  })

  it('404 throws GraphNotFoundError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      text: async () => '',
    })
    await expect(client().get('t1', '/planner/plans/nope')).rejects.toBeInstanceOf(
      GraphNotFoundError,
    )
  })

  it('500 throws GraphServerError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      text: async () => 'oops',
    })
    await expect(client().get('t1', '/groups')).rejects.toBeInstanceOf(GraphServerError)
  })

  it('paginate follows @odata.nextLink across pages', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          value: [{ id: 'a' }],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/x?$skip=1',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ value: [{ id: 'b' }] }),
      })

    const items = await client().getAllPages<{ id: string }>('t1', '/x')
    expect(items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends If-Match when provided on PATCH', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
      text: async () => '',
    })
    await client().patch('t1', '/planner/tasks/x', { title: 'n' }, { ifMatch: 'W/"abc"' })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/planner/tasks/x'),
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'If-Match': 'W/"abc"' }),
      }),
    )
  })
})
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement**

```typescript
import { Injectable } from '@nestjs/common'
import {
  GraphAuthError,
  GraphError,
  GraphNotFoundError,
  GraphPreconditionFailedError,
  GraphQuotaError,
  GraphServerError,
  GraphThrottledError,
  GraphUnknownError,
} from './errors'
import type { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import type { MsGraphTokenAcquirer } from '../../../identity/infrastructure/providers/microsoft/ms-graph-token-acquirer'

export interface GraphResponse<T> {
  status: number
  body: T | null
  etag: string | null
}

export interface GraphGetOptions {
  ifNoneMatch?: string
  useBeta?: boolean
}

export interface GraphMutateOptions {
  ifMatch?: string
  useBeta?: boolean
  preferReturnRepresentation?: boolean
}

const V1 = 'https://graph.microsoft.com/v1.0'
const BETA = 'https://graph.microsoft.com/beta'

@Injectable()
export class MsGraphClient {
  constructor(
    private readonly identityFacade: IdentityQueryFacade,
    private readonly tokenAcquirer: MsGraphTokenAcquirer,
  ) {}

  async get<T>(
    tenantId: string,
    path: string,
    opts: GraphGetOptions = {},
  ): Promise<GraphResponse<T>> {
    return this.request<T>(tenantId, 'GET', path, undefined, {
      ifNoneMatch: opts.ifNoneMatch,
      useBeta: opts.useBeta,
    })
  }

  async post<T>(
    tenantId: string,
    path: string,
    body: unknown,
    opts: GraphMutateOptions = {},
  ): Promise<GraphResponse<T>> {
    return this.request<T>(tenantId, 'POST', path, body, opts)
  }

  async patch<T>(
    tenantId: string,
    path: string,
    body: unknown,
    opts: GraphMutateOptions = {},
  ): Promise<GraphResponse<T>> {
    return this.request<T>(tenantId, 'PATCH', path, body, opts)
  }

  async delete(
    tenantId: string,
    path: string,
    opts: GraphMutateOptions = {},
  ): Promise<GraphResponse<void>> {
    return this.request<void>(tenantId, 'DELETE', path, undefined, opts)
  }

  async getAllPages<T>(tenantId: string, path: string, opts: GraphGetOptions = {}): Promise<T[]> {
    const collected: T[] = []
    let url: string | undefined = (opts.useBeta ? BETA : V1) + path
    while (url) {
      const page = await this.requestAbsolute<{ value: T[]; '@odata.nextLink'?: string }>(
        tenantId,
        'GET',
        url,
        undefined,
        { ifNoneMatch: opts.ifNoneMatch },
      )
      if (page.body?.value) collected.push(...page.body.value)
      url = page.body?.['@odata.nextLink']
    }
    return collected
  }

  private async request<T>(
    tenantId: string,
    method: string,
    path: string,
    body: unknown | undefined,
    opts: {
      ifMatch?: string
      ifNoneMatch?: string
      useBeta?: boolean
      preferReturnRepresentation?: boolean
    },
  ): Promise<GraphResponse<T>> {
    const url = (opts.useBeta ? BETA : V1) + path
    return this.requestAbsolute<T>(tenantId, method, url, body, opts)
  }

  private async requestAbsolute<T>(
    tenantId: string,
    method: string,
    url: string,
    body: unknown | undefined,
    opts: { ifMatch?: string; ifNoneMatch?: string; preferReturnRepresentation?: boolean },
  ): Promise<GraphResponse<T>> {
    const cred = await this.identityFacade.getGraphCredential(tenantId)
    if (!cred) throw new GraphAuthError('No MS Graph credential for tenant', 401, null)
    const token = await this.tokenAcquirer.acquire(cred)

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (opts.ifMatch) headers['If-Match'] = opts.ifMatch
    if (opts.ifNoneMatch) headers['If-None-Match'] = opts.ifNoneMatch
    if (opts.preferReturnRepresentation) headers['Prefer'] = 'return=representation'

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (response.status === 304) {
      return { status: 304, body: null, etag: response.headers.get('etag') }
    }
    if (response.status === 204) {
      return { status: 204, body: null, etag: response.headers.get('etag') }
    }

    if (!response.ok) {
      const text = await response.text()
      this.throwTypedError(response.status, text, response.headers)
    }

    const etag = response.headers.get('etag')
    const contentType = response.headers.get('content-type') ?? ''
    const parsedBody = contentType.includes('application/json')
      ? ((await response.json()) as T)
      : null
    return { status: response.status, body: parsedBody, etag }
  }

  private throwTypedError(status: number, text: string, headers: Headers): never {
    let parsed: any = null
    try {
      parsed = JSON.parse(text)
    } catch {}

    if (status === 412)
      throw new GraphPreconditionFailedError(`412 Precondition Failed`, status, parsed ?? text)
    if (status === 429) {
      const ra = parseInt(headers.get('retry-after') ?? '30', 10)
      throw new GraphThrottledError(
        `429 Throttled; retry-after=${ra}`,
        parsed ?? text,
        isNaN(ra) ? 30 : ra,
      )
    }
    if (status === 401) throw new GraphAuthError(`401 Unauthorized`, status, parsed ?? text)
    if (status === 403) {
      const limitCode = parsed?.error?.code
      const plannerLimits = [
        'MaximumPlannerPlans',
        'MaximumTasksInProject',
        'MaximumActiveTasksInProject',
        'MaximumBucketsInProject',
        'MaximumReferencesOnTask',
        'MaximumChecklistItemsOnTask',
        'MaximumAssigneesInTasks',
        'MaximumUsersSharedWithProject',
        'MaximumTasksCreatedByUser',
        'MaximumTasksAssignedToUser',
      ]
      if (typeof limitCode === 'string' && plannerLimits.includes(limitCode)) {
        throw new GraphQuotaError(`403 Quota: ${limitCode}`, parsed, limitCode)
      }
      throw new GraphAuthError(`403 Forbidden`, status, parsed ?? text)
    }
    if (status === 404) throw new GraphNotFoundError(`404 Not Found`, status, parsed ?? text)
    if (status >= 500) throw new GraphServerError(`${status} Server Error`, status, parsed ?? text)
    throw new GraphUnknownError(`${status} ${text.slice(0, 200)}`, status, parsed ?? text)
  }
}
```

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add -A apps/api/src/modules/planner/infrastructure/ms-graph
git commit -m "feat(planner): MsGraphClient thin-fetch workhorse with typed errors"
```

---

## Task 3: Entity + repository — `MsLinkedGroup` and `MsPlanSyncState`

Tight task — entities are plain data holders; repos mirror the existing `planner` module's Drizzle pattern.

**Files:**

- Create: `apps/api/src/modules/planner/domain/entities/ms-linked-group.entity.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/domain/entities/ms-plan-sync-state.entity.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/domain/repositories/ms-linked-group.repository.ts`
- Create: `apps/api/src/modules/planner/domain/repositories/ms-plan-sync-state.repository.ts`
- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-ms-linked-group.repository.ts` (+ `.integration.spec.ts`)
- Create: `apps/api/src/modules/planner/infrastructure/repositories/drizzle-ms-plan-sync-state.repository.ts` (+ `.integration.spec.ts`)

- [ ] **Step 1: `MsLinkedGroupEntity`** — constructor for id + tenantId + msGroupId + displayName + linkedByActorId + linkedAt + syncEnabled + backfillingAt? + backfillJobId? + unlinkedAt?. Methods: `pauseSync()`, `resumeSync()`, `startBackfill(jobId)`, `finishBackfill()`, `unlink()`.

- [ ] **Step 2: `MsPlanSyncStateEntity`** — constructor for planId + tenantId + msPlanId + msPlanEtag? + lastPolledAt? + lastSuccessfulPollAt? + consecutiveErrorCount + lastErrorCode? + lastErrorMessage? + pollPausedUntil?. Methods: `recordSuccessfulPoll(etag)`, `recordError(code, message)`, `pauseUntil(date)`.

- [ ] **Step 3: Repository interfaces** — `IMsLinkedGroupRepository`: `findByTenantAndGroup`, `listForTenant`, `upsert`, `remove`. `IMsPlanSyncStateRepository`: `get(planId)`, `upsertState(entity)`, `listForTenant(tenantId)`, `listPausable(tenantId)`.

- [ ] **Step 4: Drizzle adapters + integration tests** — follow the pattern from Plan 4.0 Task 4 (`idp_group_member` repository).

- [ ] **Step 5: Register in `planner.module.ts`** via DI tokens.

- [ ] **Step 6: Run tests + coverage**

- [ ] **Step 7: Commit**

```bash
git add -A apps/api/src/modules/planner
git commit -m "feat(planner): ms_linked_group + ms_plan_sync_state entities/repositories"
```

---

## Task 4: Mappers — MS shape → domain

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/ms-graph/mappers/ms-plan.mapper.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/infrastructure/ms-graph/mappers/ms-bucket.mapper.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/infrastructure/ms-graph/mappers/ms-task.mapper.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/infrastructure/ms-graph/mappers/ms-task-details.mapper.ts` (+ `.spec.ts`)

Mapper responsibilities: accept MS Graph JSON shape, return domain entity prepared for upsert. Include `@odata.etag` in the result. Reject invalid / missing required fields loudly.

- [ ] **Step 1: `ms-plan.mapper.ts` — test first**

```typescript
import { mapMsPlanToDomain } from './ms-plan.mapper'

describe('mapMsPlanToDomain', () => {
  it('maps title, etag, and container info', () => {
    const ms = {
      id: 'p1',
      title: 'Marketing Q2',
      container: {
        type: 'group',
        containerId: 'g-123',
      },
      '@odata.etag': 'W/"xyz"',
    }
    const result = mapMsPlanToDomain(ms, { tenantId: 't1' })
    expect(result.msPlanId).toBe('p1')
    expect(result.msPlanEtag).toBe('W/"xyz"')
    expect(result.title).toBe('Marketing Q2')
    expect(result.containerType).toBe('ms_group')
    expect(result.containerRef).toBe('g-123')
  })

  it('maps roster container', () => {
    const ms = {
      id: 'p2',
      title: 'Roster Plan',
      container: { type: 'roster', containerId: 'r-1' },
      '@odata.etag': 'W/"abc"',
    }
    const result = mapMsPlanToDomain(ms, { tenantId: 't1' })
    expect(result.containerType).toBe('ms_roster')
    expect(result.containerRef).toBe('r-1')
  })

  it('throws on missing id', () => {
    expect(() => mapMsPlanToDomain({ title: 'x' } as any, { tenantId: 't1' })).toThrow(/id/)
  })
})
```

- [ ] **Step 2: `ms-plan.mapper.ts` implementation**

```typescript
import type { PlanContainerType } from '../../../domain/entities/plan.entity'

export interface MappedMsPlan {
  tenantId: string
  msPlanId: string
  msPlanEtag: string
  title: string
  containerType: PlanContainerType
  containerRef: string
}

export function mapMsPlanToDomain(ms: any, ctx: { tenantId: string }): MappedMsPlan {
  if (!ms?.id) throw new Error('plannerPlan.id missing')
  if (!ms.container?.containerId) throw new Error('plannerPlan.container.containerId missing')

  const kind: PlanContainerType =
    ms.container.type === 'group'
      ? 'ms_group'
      : ms.container.type === 'roster'
        ? 'ms_roster'
        : (() => {
            throw new Error(`Unsupported container type ${ms.container.type}`)
          })()

  return {
    tenantId: ctx.tenantId,
    msPlanId: ms.id,
    msPlanEtag: ms['@odata.etag'] ?? '',
    title: ms.title ?? '(untitled)',
    containerType: kind,
    containerRef: ms.container.containerId,
  }
}
```

- [ ] **Step 3: `ms-bucket.mapper.ts`**

Fields: `id`, `name`, `planId`, `orderHint`, `@odata.etag`. Output: `{ tenantId, planId (local), msBucketId, msBucketEtag, name, orderHint }`. Caller resolves MS planId → local planId.

- [ ] **Step 4: `ms-task.mapper.ts`**

Fields: `id`, `planId`, `bucketId`, `title`, `orderHint`, `assigneePriority`, `percentComplete`, `priority`, `startDateTime`, `dueDateTime`, `completedDateTime`, `appliedCategories`, `assignments`, `createdBy`, `@odata.etag`.

Assignments are an open-type map keyed by AAD user ID. Output includes raw `aadAssignments: Record<string, { orderHint: string }>` — resolution happens later in the pull worker via `IdentityQueryFacade.getActorIdByExternalUserId`.

```typescript
export interface MappedMsTask {
  tenantId: string
  msTaskId: string
  msTaskEtag: string
  msPlanId: string
  msBucketId: string | null
  title: string
  orderHint: string
  assigneePriority: string | null
  percentComplete: number
  priority: number
  startDateTime: Date | null
  dueDateTime: Date | null
  completedDateTime: Date | null
  appliedCategories: Record<string, boolean>
  aadAssignments: Record<string, { orderHint: string }>
}

export function mapMsTaskToDomain(ms: any, ctx: { tenantId: string }): MappedMsTask {
  if (!ms?.id) throw new Error('plannerTask.id missing')
  const assignments: Record<string, { orderHint: string }> = {}
  if (ms.assignments && typeof ms.assignments === 'object') {
    for (const [aadId, val] of Object.entries(ms.assignments)) {
      if (val && typeof val === 'object' && 'orderHint' in (val as any)) {
        assignments[aadId] = { orderHint: (val as any).orderHint }
      }
    }
  }
  return {
    tenantId: ctx.tenantId,
    msTaskId: ms.id,
    msTaskEtag: ms['@odata.etag'] ?? '',
    msPlanId: ms.planId,
    msBucketId: ms.bucketId ?? null,
    title: ms.title ?? '(untitled)',
    orderHint: ms.orderHint ?? '',
    assigneePriority: ms.assigneePriority ?? null,
    percentComplete: typeof ms.percentComplete === 'number' ? ms.percentComplete : 0,
    priority: typeof ms.priority === 'number' ? ms.priority : 5,
    startDateTime: ms.startDateTime ? new Date(ms.startDateTime) : null,
    dueDateTime: ms.dueDateTime ? new Date(ms.dueDateTime) : null,
    completedDateTime: ms.completedDateTime ? new Date(ms.completedDateTime) : null,
    appliedCategories:
      ms.appliedCategories && typeof ms.appliedCategories === 'object' ? ms.appliedCategories : {},
    aadAssignments: assignments,
  }
}
```

- [ ] **Step 5: `ms-task-details.mapper.ts`**

Fields: `id` (same as task), `description`, `previewType`, `checklist` (keyed map), `references` (keyed map), `@odata.etag`.

```typescript
export interface MappedMsTaskDetails {
  msTaskId: string
  msDetailsEtag: string
  description: string | null
  previewType: string
  checklist: Array<{ id: string; title: string; isChecked: boolean; orderHint: string }>
  references: Array<{ encodedUrl: string; alias: string | null; type: string | null }>
}

export function mapMsTaskDetailsToDomain(ms: any): MappedMsTaskDetails {
  if (!ms?.id) throw new Error('plannerTaskDetails.id missing')
  const checklist: MappedMsTaskDetails['checklist'] = []
  if (ms.checklist && typeof ms.checklist === 'object') {
    for (const [id, val] of Object.entries(ms.checklist)) {
      checklist.push({
        id,
        title: (val as any).title ?? '',
        isChecked: Boolean((val as any).isChecked),
        orderHint: (val as any).orderHint ?? '',
      })
    }
  }
  const references: MappedMsTaskDetails['references'] = []
  if (ms.references && typeof ms.references === 'object') {
    for (const [encodedUrl, val] of Object.entries(ms.references)) {
      references.push({
        encodedUrl,
        alias: (val as any)?.alias ?? null,
        type: (val as any)?.type ?? null,
      })
    }
  }
  return {
    msTaskId: ms.id,
    msDetailsEtag: ms['@odata.etag'] ?? '',
    description: ms.description ?? null,
    previewType: ms.previewType ?? 'automatic',
    checklist,
    references,
  }
}
```

- [ ] **Step 6: Tests for bucket, task, taskDetails mappers** (follow plan-mapper pattern)

- [ ] **Step 7: Run all mapper tests, coverage**

- [ ] **Step 8: Commit**

```bash
git add -A apps/api/src/modules/planner/infrastructure/ms-graph/mappers
git commit -m "feat(planner): MS Graph → domain mappers for plan/bucket/task/taskDetails"
```

---

## Task 5: `LinkMsGroupCommand` — creates `ms_linked_group` and enqueues backfill

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/ms-sync/link-ms-group.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/link-ms-group.handler.ts` (+ `.spec.ts`)

- [ ] **Step 1: Command**

```typescript
export class LinkMsGroupCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly msGroupId: string,
  ) {}
}
```

- [ ] **Step 2: Test**

```typescript
describe('LinkMsGroupHandler', () => {
  it('fetches group displayName, upserts ms_linked_group, enqueues backfill job', async () => {
    const graph = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        body: { id: 'g1', displayName: 'Marketing' },
        etag: null,
      }),
    }
    const groupRepo = { findByTenantAndGroup: vi.fn().mockResolvedValue(null), upsert: vi.fn() }
    const pgBoss = { send: vi.fn().mockResolvedValue('job-123') }
    const eventBus = { publish: vi.fn() }

    const handler = new LinkMsGroupHandler(graph, groupRepo, pgBoss, eventBus)
    await handler.execute(new LinkMsGroupCommand('t1', 'a1', 'g1'))

    expect(graph.get).toHaveBeenCalledWith('t1', '/groups/g1?$select=id,displayName')
    expect(groupRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', msGroupId: 'g1', displayName: 'Marketing' }),
    )
    expect(pgBoss.send).toHaveBeenCalledWith(
      'ms-sync-backfill-group',
      expect.objectContaining({ tenantId: 't1', msGroupId: 'g1' }),
      expect.objectContaining({ singletonKey: expect.stringContaining('g1') }),
    )
  })

  it('rejects when group already linked', async () => {
    const graph = { get: vi.fn() }
    const groupRepo = {
      findByTenantAndGroup: vi.fn().mockResolvedValue({ msGroupId: 'g1' }),
      upsert: vi.fn(),
    }
    const pgBoss = { send: vi.fn() }
    const eventBus = { publish: vi.fn() }

    const handler = new LinkMsGroupHandler(graph, groupRepo, pgBoss, eventBus)
    await expect(handler.execute(new LinkMsGroupCommand('t1', 'a1', 'g1'))).rejects.toThrow(
      /already linked/i,
    )
  })
})
```

- [ ] **Step 3: Handler implementation**

```typescript
@CommandHandler(LinkMsGroupCommand)
export class LinkMsGroupHandler implements ICommandHandler<LinkMsGroupCommand> {
  constructor(
    private readonly graph: MsGraphClient,
    @Inject(MS_LINKED_GROUP_REPOSITORY)
    private readonly groupRepo: IMsLinkedGroupRepository,
    @Inject(PG_BOSS) private readonly pgBoss: PgBoss,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: LinkMsGroupCommand,
  ): Promise<{ id: string; displayName: string; backfillJobId: string }> {
    const existing = await this.groupRepo.findByTenantAndGroup(command.tenantId, command.msGroupId)
    if (existing && !existing.unlinkedAt) {
      throw new Error(`Group ${command.msGroupId} is already linked`)
    }
    const res = await this.graph.get<{ id: string; displayName: string }>(
      command.tenantId,
      `/groups/${encodeURIComponent(command.msGroupId)}?$select=id,displayName`,
    )
    if (!res.body) throw new Error('Group not found or inaccessible')

    const entity = MsLinkedGroupEntity.create({
      tenantId: command.tenantId,
      msGroupId: command.msGroupId,
      displayName: res.body.displayName,
      linkedByActorId: command.actorId,
      syncEnabled: true,
    })
    entity.startBackfill('pending')
    await this.groupRepo.upsert(entity)

    const jobId = await this.pgBoss.send(
      'ms-sync-backfill-group',
      { tenantId: command.tenantId, msGroupId: command.msGroupId, linkedGroupId: entity.id },
      { singletonKey: `backfill:${command.tenantId}:${command.msGroupId}` },
    )
    entity.startBackfill(jobId ?? 'unknown')
    await this.groupRepo.upsert(entity)

    this.eventBus.publish({
      type: 'planner.ms_sync.group_linked',
      tenantId: command.tenantId,
      msGroupId: command.msGroupId,
      actorId: command.actorId,
      occurredAt: new Date().toISOString(),
    } as any)

    return { id: entity.id, displayName: entity.displayName, backfillJobId: jobId ?? 'unknown' }
  }
}
```

(Event emission uses an `MsGroupLinkedEvent` contract you'll add at the same time — same pattern as Plan 4.1's events.)

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src/modules/planner/application/commands/ms-sync packages/event-contracts
git commit -m "feat(planner): LinkMsGroupCommand enqueues backfill + emits event"
```

---

## Task 6: Backfill pg-boss job — full group import

**Files:**

- Create: `apps/api/src/modules/planner/infrastructure/ms-graph/pull/backfill-group.worker.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/infrastructure/ms-graph/pull/plan-ingestor.ts` (+ `.spec.ts`)
- Modify: `apps/api/src/modules/planner/infrastructure/jobs/pg-boss.registrar.ts` (register worker)

The `plan-ingestor.ts` is the reusable routine shared with Plan 4.3's steady-state poll. It:

1. Fetches `/planner/plans/{planId}` (with If-None-Match).
2. Upserts `plan` + `ms_plan_sync_state` (origin: `ms-sync-backfill` for backfill path, `ms-sync-pull` for steady poll).
3. Fetches `/planner/plans/{planId}/buckets` and upserts.
4. Paginates `/planner/plans/{planId}/tasks`; for each new or etag-changed task, fetches `/planner/tasks/{id}/details` and upserts.
5. Resolves assignees → writes `task.assignees` or `pending_ms_assignments`.

- [ ] **Step 1: `PlanIngestor` — signature + contract test**

```typescript
import { PlanIngestor } from './plan-ingestor'

describe('PlanIngestor', () => {
  let graph: any,
    planRepo: any,
    bucketRepo: any,
    taskRepo: any,
    syncStateRepo: any,
    identityFacade: any

  beforeEach(() => {
    /* mock everything */
  })

  it('ingests plan, buckets, tasks, details in one pass', async () => {
    // set up mocked Graph responses...
    const ingestor = new PlanIngestor(
      graph,
      planRepo,
      bucketRepo,
      taskRepo,
      syncStateRepo,
      identityFacade,
    )
    await ingestor.ingestPlan({ tenantId: 't1', msPlanId: 'p1', origin: 'ms-sync-backfill' })

    // assertions on repo calls
  })

  it('resolves assignees through IdentityQueryFacade', async () => {
    /* ... */
  })
  it('unresolved AAD OIDs land in pending_ms_assignments', async () => {
    /* ... */
  })
  it('respects If-None-Match — skips details fetch when task etag unchanged', async () => {
    /* ... */
  })
})
```

- [ ] **Step 2: `PlanIngestor` implementation**

```typescript
import { Injectable } from '@nestjs/common'
import type { MsGraphClient } from '../ms-graph-client'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import type { IBucketRepository } from '../../../domain/repositories/bucket.repository'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { IMsPlanSyncStateRepository } from '../../../domain/repositories/ms-plan-sync-state.repository'
import type { IdentityQueryFacade } from '../../../../identity/application/facades/identity-query.facade'
import { mapMsPlanToDomain } from '../mappers/ms-plan.mapper'
import { mapMsBucketToDomain } from '../mappers/ms-bucket.mapper'
import { mapMsTaskToDomain } from '../mappers/ms-task.mapper'
import { mapMsTaskDetailsToDomain } from '../mappers/ms-task-details.mapper'

export type PullOrigin = 'ms-sync-backfill' | 'ms-sync-pull'

export interface IngestPlanInput {
  tenantId: string
  msPlanId: string
  origin: PullOrigin
}

@Injectable()
export class PlanIngestor {
  constructor(
    private readonly graph: MsGraphClient,
    private readonly planRepo: IPlanRepository,
    private readonly bucketRepo: IBucketRepository,
    private readonly taskRepo: ITaskRepository,
    private readonly syncStateRepo: IMsPlanSyncStateRepository,
    private readonly identityFacade: IdentityQueryFacade,
  ) {}

  async ingestPlan(input: IngestPlanInput): Promise<void> {
    const existingState = await this.syncStateRepo.findByMsPlanId(input.tenantId, input.msPlanId)

    // --- Plan
    const planRes = await this.graph.get<any>(
      input.tenantId,
      `/planner/plans/${encodeURIComponent(input.msPlanId)}`,
      { ifNoneMatch: existingState?.msPlanEtag ?? undefined },
    )
    let localPlan = existingState ? await this.planRepo.get(existingState.planId) : null

    if (planRes.status !== 304 && planRes.body) {
      const mapped = mapMsPlanToDomain(planRes.body, { tenantId: input.tenantId })
      localPlan = await this.planRepo.upsertFromMs(mapped, { origin: input.origin })
      await this.syncStateRepo.upsertState({
        planId: localPlan.id,
        tenantId: input.tenantId,
        msPlanId: mapped.msPlanId,
        msPlanEtag: mapped.msPlanEtag,
        lastPolledAt: new Date(),
        lastSuccessfulPollAt: new Date(),
        consecutiveErrorCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
        pollPausedUntil: null,
      })
    }

    if (!localPlan) return

    // --- Buckets
    const buckets = await this.graph.getAllPages<any>(
      input.tenantId,
      `/planner/plans/${encodeURIComponent(input.msPlanId)}/buckets`,
    )
    for (const ms of buckets) {
      const mapped = mapMsBucketToDomain(ms, {
        tenantId: input.tenantId,
        localPlanId: localPlan.id,
      })
      await this.bucketRepo.upsertFromMs(mapped, { origin: input.origin })
    }

    // --- Tasks (+ details per dirty task)
    const tasks = await this.graph.getAllPages<any>(
      input.tenantId,
      `/planner/plans/${encodeURIComponent(input.msPlanId)}/tasks`,
    )

    for (const ms of tasks) {
      const mapped = mapMsTaskToDomain(ms, { tenantId: input.tenantId })
      const existingTask = await this.taskRepo.findByMsTaskId(input.tenantId, mapped.msTaskId)
      const taskEtagChanged = !existingTask || existingTask.msTaskEtag !== mapped.msTaskEtag

      // Resolve assignees
      const resolved: string[] = []
      const pending: string[] = []
      for (const aadId of Object.keys(mapped.aadAssignments)) {
        const actorId = await this.identityFacade.getActorIdByExternalUserId(aadId, input.tenantId)
        if (actorId) resolved.push(actorId)
        else pending.push(aadId)
      }

      const upsertedTask = await this.taskRepo.upsertFromMs(
        {
          ...mapped,
          localPlanId: localPlan.id,
          assigneeActorIds: resolved,
          pendingMsAssignments: pending,
        },
        { origin: input.origin },
      )

      if (taskEtagChanged || !existingTask || !existingTask.msDetailsEtag) {
        const detailsRes = await this.graph.get<any>(
          input.tenantId,
          `/planner/tasks/${encodeURIComponent(mapped.msTaskId)}/details`,
          { ifNoneMatch: existingTask?.msDetailsEtag ?? undefined },
        )
        if (detailsRes.status !== 304 && detailsRes.body) {
          const details = mapMsTaskDetailsToDomain(detailsRes.body)
          await this.taskRepo.upsertDetailsFromMs(
            { taskId: upsertedTask.id, ...details },
            { origin: input.origin },
          )
        }
      }
    }

    // Detect MS-side deletions
    const msTaskIds = new Set(tasks.map((t: any) => t.id))
    const localTasks = await this.taskRepo.listByPlan(localPlan.id, { onlySynced: true })
    for (const local of localTasks) {
      if (local.msTaskId && !msTaskIds.has(local.msTaskId) && !local.msSoftDeletedAt) {
        await this.taskRepo.softDeleteFromMs(local.id, { origin: input.origin })
      }
    }
  }
}
```

The repositories gain new methods: `upsertFromMs`, `upsertDetailsFromMs`, `softDeleteFromMs`, `findByMsTaskId`, `listByPlan(..., { onlySynced })`. Each accepts an `origin` option and writes it into emitted outbox event payloads.

- [ ] **Step 3: Implement those repository methods** — mirror existing `upsert` + set `payload.origin` on emitted events.

- [ ] **Step 4: `backfill-group.worker.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common'
import { PlanIngestor } from './plan-ingestor'
import type { MsGraphClient } from '../ms-graph-client'
import type { IMsLinkedGroupRepository } from '../../../domain/repositories/ms-linked-group.repository'
import type { EventBus } from '@nestjs/cqrs'
import {
  createBackfillProgressEvent,
  createMsGroupBackfillCompletedEvent,
} from '@future/event-contracts'

interface BackfillJobData {
  tenantId: string
  msGroupId: string
  linkedGroupId: string
}

@Injectable()
export class BackfillGroupWorker {
  private readonly logger = new Logger(BackfillGroupWorker.name)
  private readonly rpsTarget = 3

  constructor(
    private readonly graph: MsGraphClient,
    private readonly ingestor: PlanIngestor,
    private readonly groupRepo: IMsLinkedGroupRepository,
    private readonly eventBus: EventBus,
  ) {}

  async run(data: BackfillJobData): Promise<void> {
    const plans = await this.graph.getAllPages<any>(
      data.tenantId,
      `/groups/${encodeURIComponent(data.msGroupId)}/planner/plans`,
    )

    let processed = 0
    const total = plans.length

    this.eventBus.publish(
      createBackfillProgressEvent({
        jobId: data.linkedGroupId,
        tenantId: data.tenantId,
        msGroupId: data.msGroupId,
        total,
        processed,
        occurredAt: new Date().toISOString(),
      }),
    )

    for (const p of plans) {
      const start = Date.now()
      await this.ingestor.ingestPlan({
        tenantId: data.tenantId,
        msPlanId: p.id,
        origin: 'ms-sync-backfill',
      })
      processed++

      this.eventBus.publish(
        createBackfillProgressEvent({
          jobId: data.linkedGroupId,
          tenantId: data.tenantId,
          msGroupId: data.msGroupId,
          total,
          processed,
          occurredAt: new Date().toISOString(),
        }),
      )

      // RPS throttle: ensure at least 1/rps seconds per plan iteration
      const budget = Math.floor(1000 / this.rpsTarget)
      const elapsed = Date.now() - start
      if (elapsed < budget) await new Promise((r) => setTimeout(r, budget - elapsed))
    }

    const group = await this.groupRepo.findById(data.linkedGroupId)
    if (group) {
      group.finishBackfill()
      await this.groupRepo.upsert(group)
    }

    this.eventBus.publish(
      createMsGroupBackfillCompletedEvent({
        tenantId: data.tenantId,
        msGroupId: data.msGroupId,
        linkedGroupId: data.linkedGroupId,
        totalPlans: total,
        occurredAt: new Date().toISOString(),
      }),
    )
  }
}
```

Add the two new event contracts (`backfill-progress.event.ts`, `ms-group-backfill-completed.event.ts`) in `packages/event-contracts/src/planner/ms-sync/` following the pattern from Plan 4.1.

- [ ] **Step 5: Register the worker with pg-boss**

In the pg-boss registrar:

```typescript
await boss.work('ms-sync-backfill-group', async (job) => {
  await backfillWorker.run(job.data as BackfillJobData)
})
```

- [ ] **Step 6: Integration test (Testcontainers + mock Graph)**

```typescript
it('backfill imports a 3-plan/10-task group into Future DB', async () => {
  // seed Graph mock to respond to /groups/g1/planner/plans with 3 plans, etc.
  await worker.run({ tenantId: 't1', msGroupId: 'g1', linkedGroupId: 'lg-1' })

  const plans = await planRepo.listByContainer({
    tenantId: 't1',
    containerType: 'ms_group',
    containerRef: 'g1',
  })
  expect(plans).toHaveLength(3)
  const tasks = await taskRepo.listByTenant('t1')
  expect(tasks).toHaveLength(10)
})
```

- [ ] **Step 7: Run tests — expect PASS**

- [ ] **Step 8: Commit**

```bash
git add -A apps/api/src/modules/planner packages/event-contracts
git commit -m "feat(planner): backfill-group worker + PlanIngestor + progress events"
```

---

## Task 7: Destroy-sync now also converts plans to future-only

**Files:**

- Modify: `apps/api/src/modules/planner/application/commands/ms-sync/disconnect-ms-sync.handler.ts` (from Plan 4.1)
- Modify: `apps/api/src/modules/planner/application/commands/ms-sync/disconnect-ms-sync.handler.spec.ts`

- [ ] **Step 1: Extend test**

```typescript
it('destroy: converts all MS-linked plans to future_only and removes ms_linked_group rows', async () => {
  const planRepo = { convertAllToFutureOnly: vi.fn() }
  const groupRepo = { removeAllForTenant: vi.fn() }
  // ... existing setup
  await handler.execute(new DisconnectMsSyncCommand('t1', 'a1', 'destroy'))
  expect(planRepo.convertAllToFutureOnly).toHaveBeenCalledWith('t1')
  expect(groupRepo.removeAllForTenant).toHaveBeenCalledWith('t1')
})
```

- [ ] **Step 2: Extend handler**

Inject `IPlanRepository.convertAllToFutureOnly(tenantId)` and `IMsLinkedGroupRepository.removeAllForTenant(tenantId)`. Call in the `destroy` branch after the secret delete.

`convertAllToFutureOnly` sets `plan.containerType='future_only'`, clears `containerRef`, `msPlanId`, `msPlanEtag`. Keeps all tasks + layered data.

Similarly clear `ms_plan_sync_state` rows for the tenant.

- [ ] **Step 3: Run — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(planner): destroy-sync converts MS plans to future-only"
```

---

## Task 8: tRPC `msSync.groups.*` + status plan counts

**Files:**

- Extend: `apps/api/src/modules/planner/interface/trpc/ms-sync.router.ts`
- Create: `apps/api/src/modules/planner/application/queries/ms-sync/list-available-groups.handler.ts` (uses `IdentityQueryFacade` / `directoryFactory`)
- Create: `apps/api/src/modules/planner/application/queries/ms-sync/list-linked-groups.handler.ts`

- [ ] **Step 1: `groups.listAvailable` procedure** — calls `IDirectoryProvider.listGroupsWithMembers()` via the factory, filters out already-linked Groups, returns `{ externalGroupId, displayName, memberCount }`.

- [ ] **Step 2: `groups.link({ msGroupId })` mutation** — executes `LinkMsGroupCommand`; returns `{ linkedGroupId, backfillJobId }`.

- [ ] **Step 3: `groups.unlink({ msGroupId })` mutation** — soft-sets `ms_linked_group.sync_enabled=false`, `unlinked_at=now()`. Does NOT delete plans.

- [ ] **Step 4: `groups.listLinked` query** — returns each linked Group with `{ id, msGroupId, displayName, syncEnabled, backfillingAt?, planCount, lastPolledAt, lastError }`.

- [ ] **Step 5: Integration tests per procedure**

- [ ] **Step 6: Commit**

```bash
git add -A apps/api/src/modules/planner
git commit -m "feat(planner): msSync.groups tRPC procedures"
```

---

## Task 9: web-admin — Linked Groups UI + Link drawer

**Files:**

- Modify: `apps/web-admin/src/app/integrations/microsoft/page.tsx`
- Create: `apps/web-admin/src/app/integrations/microsoft/linked-groups-table.tsx` (+ `.spec.tsx`)
- Create: `apps/web-admin/src/app/integrations/microsoft/link-group-drawer.tsx` (+ `.spec.tsx`)
- Create: `apps/web-admin/src/app/integrations/microsoft/backfill-progress-slideover.tsx` (+ `.spec.tsx`)
- Create: `apps/web-admin/src/app/integrations/microsoft/backfill/[jobId]/page.tsx`

- [ ] **Step 1: `LinkedGroupsTable`** — uses `<DataTable>` from `@future/ui`. Columns: Name, Plans count, Status dot (green / yellow / red), Last poll, Actions (overflow menu: Unlink, Retry, View plans). Status dot placeholder until Plan 4.3 / 4.7.

- [ ] **Step 2: `LinkGroupDrawer`** — fetches `msSync.groups.listAvailable` on open. Search box; checkbox list; Link button triggers mutation; on success, opens `BackfillProgressSlideover` auto.

- [ ] **Step 3: `BackfillProgressSlideover`** — opens an SSE stream to `/api/planner/ms-sync/backfill/{jobId}/progress`. Shows progress bar + "X / Y tasks imported" + Pause button. Closes + toasts on completion.

- [ ] **Step 4: `/api/planner/ms-sync/backfill/[jobId]/progress/route.ts`** — an SSE endpoint that subscribes to the outbox's `BackfillProgressEvent` filtered by `jobId`. Re-use the SSE pattern from Sub-project #3's carry-over SSE.

- [ ] **Step 5: Mount everything in `page.tsx`** — between the StatusCard and tab placeholders, add Linked Groups section.

- [ ] **Step 6: Tests for each component**

- [ ] **Step 7: Commit**

```bash
git add -A apps/web-admin/src/app/integrations/microsoft
git commit -m "feat(web-admin): linked groups table + link drawer + backfill SSE progress"
```

---

## Task 10: web-planner — container picker in new-plan form

**Files:**

- Modify: `apps/web-planner/src/components/new-plan-form/new-plan-form.tsx`
- Create: `apps/web-planner/src/components/new-plan-form/container-picker.tsx` (+ `.spec.tsx`)

- [ ] **Step 1: `ContainerPicker`** — fetches `msSync.groups.listLinked` (cached, small result). Renders a dropdown with sections: "Future-only", "Microsoft 365 Groups". Rosters come in Plan 4.6; leave the section hidden for now.

- [ ] **Step 2: Integrate into new-plan form** — passes `containerType` + `containerRef` to the `plans.create` mutation. `plans.create` in the API is extended to accept these fields and to push to MS when `containerType != 'future_only'` (the push side comes in Plan 4.4 — for now, create persists locally only; first push lands after 4.4).

- [ ] **Step 3: Tests**

- [ ] **Step 4: Commit**

```bash
git add -A apps/web-planner
git commit -m "feat(web-planner): container picker in new-plan form"
```

---

## Task 11: Flip `planner.ms_sync.enabled` on for SETA internal

**Files:**

- Modify: `apps/api/src/modules/admin/infrastructure/seed/feature-flags.seed.ts` (or equivalent override file for internal tenant)

- [ ] **Step 1: Set the flag on for SETA internal tenant only**

Follow the pattern Sub-project #3 used to flip `planner.personal.enabled` on for SETA.

- [ ] **Step 2: Deploy + smoke**

Manually walk: connect → link one Group → see plans + tasks appear in web-planner within ~5 minutes.

- [ ] **Step 3: Commit the flag flip separately**

```bash
git add -A
git commit -m "chore(flags): enable planner.ms_sync for SETA internal tenant"
```

## Completion criteria

- `MsGraphClient` production-ready with typed errors.
- `ms_linked_group` + `ms_plan_sync_state` tables with RLS.
- `LinkMsGroupCommand` + `UnlinkMsGroup` + `msSync.groups.*` tRPC.
- Backfill pg-boss job imports a Group's plans/buckets/tasks/details end-to-end.
- web-admin shows Linked Groups table + Link drawer + live backfill progress.
- web-planner new-plan form has Container picker.
- Destroy-sync converts MS plans to future-only cleanly.
- `planner.ms_sync.enabled` on for SETA internal.
- **Scope boundary: no push.** Future-side edits on MS-linked plans persist locally but do not sync to MS. Plan 4.4 adds push.
- Coverage ≥ 70%.

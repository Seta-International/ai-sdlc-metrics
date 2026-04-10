# Platform Standard Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first shippable version of the Future platform-standard table, including the shared `@future/ui` table kit, the `preferences` saved-view module, typed list contracts in `apps/api`, synchronous CSV export for small result sets, and one real `web-people` reference page.

**Architecture:** This work stays inside one delivery slice. `@future/ui` owns controlled table state, rendering, stories, and component tests. `apps/api` adds a typed tRPC request context, a new `preferences` module for actor-scoped saved views, and a fixture-backed `people.directory` endpoint that exercises the standardized query contract. Export in this slice is intentionally limited to synchronous CSV for `<=1000` rows; the async `>1000` export job path is a follow-up workstream. Because auth/session extraction is not implemented yet, the API will temporarily derive tenant/actor identity from dev/test request headers, then swap that adapter later without changing router signatures.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, TanStack Table, tRPC 11, NestJS 11, Drizzle ORM, Vitest 4, Testing Library, Storybook React Vite, Playwright

---

## File Map

| File                                                                                            | Action                           | Purpose                                                                               |
| ----------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| `.env.example`                                                                                  | Modify                           | Add safe dev/test actor and tenant header values for local request identity bootstrap |
| `packages/api-client/src/client.ts`                                                             | Modify                           | Let web zones attach dev/test headers when calling tRPC                               |
| `apps/api/src/common/trpc/app-router.ts`                                                        | Modify                           | Add typed tRPC context and shared router/procedure exports                            |
| `apps/api/src/common/trpc/context.ts`                                                           | Create                           | Build request context from Fastify request + CLS                                      |
| `apps/api/src/common/trpc/procedures.ts`                                                        | Create                           | Export `publicProcedure` and `protectedProcedure` with actor/tenant guard             |
| `apps/api/src/common/trpc/context.spec.ts`                                                      | Create                           | Verify dev/test header parsing and fallback behavior                                  |
| `apps/api/src/common/cls/cls.module.ts`                                                         | Modify                           | Populate tenant/actor identity into CLS from request headers in dev/test              |
| `apps/api/src/main.ts`                                                                          | Modify                           | Mount the tRPC Fastify adapter at `/trpc`                                             |
| `apps/api/src/app.module.ts`                                                                    | Modify                           | Import `DbModule` and `PreferencesModule`                                             |
| `apps/api/src/common/db/db.module.ts`                                                           | Modify                           | Keep DB provider wiring reusable for new module tests                                 |
| `apps/api/src/modules/preferences/preferences.module.ts`                                        | Create via Nest CLI, then modify | New cross-cutting module boundary for saved views                                     |
| `apps/api/src/modules/preferences/application/facades/preferences-query.facade.ts`              | Create                           | Read-side API for resolving and listing saved views                                   |
| `apps/api/src/modules/preferences/application/commands/*.ts`                                    | Create                           | Create, update, delete, and set-default command handlers                              |
| `apps/api/src/modules/preferences/domain/entities/saved-view.entity.ts`                         | Create                           | Saved-view domain shape                                                               |
| `apps/api/src/modules/preferences/domain/repositories/saved-view.repository.ts`                 | Create                           | Repository port                                                                       |
| `apps/api/src/modules/preferences/infrastructure/schema/preferences.schema.ts`                  | Create                           | Drizzle schema for `preferences.saved_view`                                           |
| `apps/api/src/modules/preferences/infrastructure/repositories/drizzle-saved-view.repository.ts` | Create                           | Drizzle adapter for saved-view CRUD and resolve logic                                 |
| `apps/api/src/modules/preferences/interface/trpc/preferences.router.ts`                         | Create                           | `preferences.savedView.*` tRPC surface                                                |
| `apps/api/src/modules/preferences/interface/trpc/preferences.router.integration.spec.ts`        | Create                           | Integration coverage for resolve/default/save semantics                               |
| `apps/api/src/common/trpc/app-router.ts`                                                        | Modify                           | Register `preferences` router                                                         |
| `apps/api/src/common/list/future-list.contract.ts`                                              | Create                           | Shared Zod schemas for list queries, list results, and export queries                 |
| `packages/db/drizzle/migrations/*`                                                              | Generate                         | SQL migration artifacts for `preferences.saved_view`                                  |
| `apps/api/src/modules/people/interface/trpc/people.router.ts`                                   | Modify                           | Add `people.directory.list` and `people.directory.export` procedures                  |
| `apps/api/src/modules/people/interface/trpc/people.router.integration.spec.ts`                  | Create                           | Verify list query validation and response shape                                       |
| `apps/api/src/modules/people/application/queries/list-people-directory.query.ts`                | Create                           | Fixture-backed query handler contract for the reference page                          |
| `apps/api/src/modules/people/application/queries/people-directory.fixture.ts`                   | Create                           | Deterministic reference dataset                                                       |
| `apps/api/src/modules/people/application/queries/export-people-directory.query.ts`              | Create                           | CSV export builder for the reference page                                             |
| `packages/ui/package.json`                                                                      | Modify via CLI + script update   | Add TanStack Table, test tooling, Storybook scripts                                   |
| `packages/ui/vitest.config.ts`                                                                  | Create                           | UI unit/component test runner                                                         |
| `packages/ui/.storybook/main.ts`                                                                | Create                           | Storybook framework config                                                            |
| `packages/ui/.storybook/preview.ts`                                                             | Create                           | Storybook global styling and decorators                                               |
| `packages/ui/src/test/setup.ts`                                                                 | Create                           | Testing Library + jest-dom bootstrap                                                  |
| `packages/ui/src/components/data-table/table-state.ts`                                          | Create                           | Shared table state types, dirty detection, and serialization helpers                  |
| `packages/ui/src/components/data-table/table-state.spec.ts`                                     | Create                           | Unit coverage for state serialization and dirty logic                                 |
| `packages/ui/src/components/data-table/data-table.tsx`                                          | Create                           | Controlled TanStack table renderer                                                    |
| `packages/ui/src/components/data-table/data-table-toolbar.tsx`                                  | Create                           | Toolbar shell                                                                         |
| `packages/ui/src/components/data-table/data-table-search.tsx`                                   | Create                           | Debounced search input                                                                |
| `packages/ui/src/components/data-table/data-table-filters.tsx`                                  | Create                           | Filter-chip/filter-popover rendering                                                  |
| `packages/ui/src/components/data-table/data-table-column-header.tsx`                            | Create                           | Sorting + pinning + visibility column menu                                            |
| `packages/ui/src/components/data-table/data-table-view-options.tsx`                             | Create                           | Density/visibility/pinning controls                                                   |
| `packages/ui/src/components/data-table/data-table-pagination.tsx`                               | Create                           | Standard page controls                                                                |
| `packages/ui/src/components/data-table/data-table-bulk-actions.tsx`                             | Create                           | Bulk-action container                                                                 |
| `packages/ui/src/components/data-table/data-table-expanded-row.tsx`                             | Create                           | Detail-panel wrapper                                                                  |
| `packages/ui/src/components/data-table/data-table-empty.tsx`                                    | Create                           | Empty/no-results state                                                                |
| `packages/ui/src/components/data-table/data-table-loading.tsx`                                  | Create                           | Loading state                                                                         |
| `packages/ui/src/components/data-table/data-table-error.tsx`                                    | Create                           | Inline retry state                                                                    |
| `packages/ui/src/components/data-table/data-table.spec.tsx`                                     | Create                           | Component tests for sorting, expansion, visibility, density, and selection            |
| `packages/ui/src/components/data-table/data-table.stories.tsx`                                  | Create                           | Storybook stories for core table states                                               |
| `packages/ui/src/index.ts`                                                                      | Modify                           | Export the new table kit                                                              |
| `apps/web-people/src/lib/trpc.ts`                                                               | Create                           | Typed client instance with dev/test headers                                           |
| `apps/web-people/src/lib/table-url-state.ts`                                                    | Create                           | URL parsing + replace/push helpers for list state                                     |
| `apps/web-people/src/components/people-directory-table.tsx`                                     | Create                           | Client component that wires API data to `@future/ui`                                  |
| `apps/web-people/src/app/page.tsx`                                                              | Modify                           | Replace “Coming soon” with the People directory reference page                        |
| `apps/e2e/tests/people-directory.spec.ts`                                                       | Create                           | Playwright coverage for search, sort, saved views, expansion, and export              |
| `docs/architecture/application.md`                                                              | Modify                           | Add `preferences` module to the canonical module map                                  |
| `docs/engineering/tech-stack.md`                                                                | Modify                           | Document TanStack Table + Storybook in the shared UI stack                            |

---

## Task 1: Wire tRPC Request Context And Dev/Test Identity Bootstrap

**Files:**

- Modify: `packages/api-client/src/client.ts`
- Modify: `.env.example`
- Modify: `apps/api/src/common/trpc/app-router.ts`
- Create: `apps/api/src/common/trpc/context.ts`
- Create: `apps/api/src/common/trpc/procedures.ts`
- Create: `apps/api/src/common/trpc/context.spec.ts`
- Modify: `apps/api/src/common/cls/cls.module.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing request-context tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildRequestIdentity } from './context.js'

describe('buildRequestIdentity', () => {
  it('reads tenant and actor from dev headers', () => {
    const identity = buildRequestIdentity({
      headers: {
        'x-future-tenant-id': 'tenant-dev',
        'x-future-actor-id': 'actor-dev',
      },
    })

    expect(identity).toEqual({ tenantId: 'tenant-dev', actorId: 'actor-dev' })
  })

  it('ignores spoofable identity headers in production', () => {
    const identity = buildRequestIdentity({
      headers: {
        'x-future-tenant-id': 'tenant-prod',
        'x-future-actor-id': 'actor-prod',
      },
      environment: 'production',
    })

    expect(identity).toEqual({ tenantId: null, actorId: null })
  })
})
```

- [ ] **Step 2: Run the failing unit test**

Run: `bun run --cwd apps/api test -- src/common/trpc/context.spec.ts`

Expected: FAIL because `context.ts` and `buildRequestIdentity` do not exist yet.

- [ ] **Step 3: Implement typed tRPC context and procedures**

Create `apps/api/src/common/trpc/context.ts` and `apps/api/src/common/trpc/procedures.ts` so they expose:

```ts
export type TrpcContext = {
  tenantId: string | null
  actorId: string | null
}

export function buildRequestIdentity(input: {
  headers: Record<string, unknown>
  environment?: string
}): TrpcContext {
  // Read x-future-tenant-id / x-future-actor-id in local dev and tests only.
}
```

`procedures.ts` should export `publicProcedure` and `protectedProcedure`, where `protectedProcedure` throws immediately if `tenantId` or `actorId` is missing.

- [ ] **Step 4: Update the API and client plumbing**

Make these changes:

```ts
// apps/api/src/common/trpc/app-router.ts
const t = initTRPC.context<TrpcContext>().create()
```

```ts
// packages/api-client/src/client.ts
export function createTRPCClient(options: {
  apiUrl: string
  headers?: Record<string, string> | (() => Record<string, string>)
}) {
  return createTRPCProxyClient<AppRouter>({
    links: [httpBatchLink({ url: `${options.apiUrl}/trpc`, headers: options.headers })],
  })
}
```

Add `NEXT_PUBLIC_DEV_TENANT_ID` and `NEXT_PUBLIC_DEV_ACTOR_ID` placeholders to `.env.example`.

- [ ] **Step 5: Mount the tRPC Fastify adapter and CLS bootstrap**

Mount `/trpc` in `apps/api/src/main.ts` using the Fastify adapter from `@trpc/server/adapters/fastify`. Update `ClsModule.forRoot(...setup)` to stash tenant/actor IDs from the dev/test headers into CLS when they are present.

The temporary header trust must be explicitly gated:

```ts
const allowDevIdentityHeaders = environment === 'development' || environment === 'test'
```

If `allowDevIdentityHeaders` is `false`, `buildRequestIdentity` must ignore `x-future-tenant-id` and `x-future-actor-id` entirely and return `{ tenantId: null, actorId: null }`.

- [ ] **Step 6: Run API typecheck and unit tests**

Run: `bun run --cwd apps/api typecheck`

Expected: PASS.

Run: `bun run --cwd apps/api test -- src/common/trpc/context.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .env.example packages/api-client/src/client.ts
git add apps/api/src/common/trpc/app-router.ts apps/api/src/common/trpc/context.ts
git add apps/api/src/common/trpc/procedures.ts apps/api/src/common/trpc/context.spec.ts
git add apps/api/src/common/cls/cls.module.ts apps/api/src/main.ts apps/api/src/app.module.ts
git commit -m "feat(api): add typed trpc request context"
```

---

## Task 2: Add The `preferences` Module And Saved-View Persistence

**Files:**

- Create via CLI: `apps/api/src/modules/preferences/preferences.module.ts`
- Create: `apps/api/src/modules/preferences/application/facades/preferences-query.facade.ts`
- Create: `apps/api/src/modules/preferences/application/commands/create-saved-view.command.ts`
- Create: `apps/api/src/modules/preferences/application/commands/update-saved-view.command.ts`
- Create: `apps/api/src/modules/preferences/application/commands/delete-saved-view.command.ts`
- Create: `apps/api/src/modules/preferences/application/commands/set-default-saved-view.command.ts`
- Create: `apps/api/src/modules/preferences/domain/entities/saved-view.entity.ts`
- Create: `apps/api/src/modules/preferences/domain/repositories/saved-view.repository.ts`
- Create: `apps/api/src/modules/preferences/infrastructure/schema/preferences.schema.ts`
- Create: `apps/api/src/modules/preferences/infrastructure/repositories/drizzle-saved-view.repository.ts`
- Modify: `apps/api/src/app.module.ts`
- Generate: `packages/db/drizzle/migrations/*`

- [ ] **Step 1: Generate the Nest module shell**

Run from `apps/api`:

```bash
bunx nest generate module modules/preferences --no-spec
```

Expected: `src/modules/preferences/preferences.module.ts` exists.

- [ ] **Step 2: Write the failing integration test for saved-view resolution**

Create `apps/api/src/modules/preferences/interface/trpc/preferences.router.integration.spec.ts` with a failing test like:

```ts
it('resolves views, activeView, and defaultViewId without exposing foreign views', async () => {
  const caller = appRouter.createCaller({ tenantId: 'tenant-1', actorId: 'actor-1' })
  const result = await caller.preferences.savedView.resolve({
    resourceKey: 'people.directory',
    activeViewId: null,
  })

  expect(result.views).toHaveLength(2)
  expect(result.activeView?.name).toBe('Default Directory View')
  expect(result.defaultViewId).toBeDefined()
})
```

The test file must also include failing cases for:

- invalid `activeViewId` falling back to the default view
- deleted `activeViewId` falling back to the default view
- foreign `activeViewId` returning only the current actor's views

- [ ] **Step 3: Add the schema and repository port**

Create `preferences.schema.ts` with `preferencesSchema = pgSchema('preferences')` and the `saved_view` table:

```ts
export const savedView = preferencesSchema.table('saved_view', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  resourceKey: text('resource_key').notNull(),
  name: text('name').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  stateJson: jsonb('state_json').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

Add a partial unique index for `(tenant_id, actor_id, resource_key)` where `is_default = true`.

- [ ] **Step 4: Generate the migration**

Run:

```bash
bun run --cwd packages/db generate
```

Expected: new migration SQL and updated Drizzle metadata appear under `packages/db/drizzle/migrations/`.

- [ ] **Step 5: Implement the repository and application layer**

Create:

- `saved-view.entity.ts`
- `saved-view.repository.ts`
- command files
- `preferences-query.facade.ts`
- `drizzle-saved-view.repository.ts`

Create a canonical persisted-state normalizer alongside the repository work, for example:

```ts
export function normalizeSavedViewState(
  input: FutureTableState | PersistedSavedViewState,
): PersistedSavedViewState {
  return {
    search: input.search,
    filters: input.filters,
    sorting: input.sorting,
    pagination: {
      pageSize: input.pagination.pageSize,
    },
    columnVisibility: input.columnVisibility,
    columnPinning: input.columnPinning,
    density: input.density,
  }
}
```

Repository behavior must include:

- `listByResource`
- `resolve`
- `create`
- `update`
- `delete`
- `setDefault`

`resolve` must return the fallback-resolved `activeView`, not just the raw requested one.
All create/update persistence paths must pass through the normalizer so `state_json` never stores `pageIndex`, `rowSelection`, `expanded`, or other transient UI state.

- [ ] **Step 6: Wire the module into the app**

Update:

```ts
// apps/api/src/app.module.ts
imports: [ConfigModule.forRoot({ isGlobal: true }), AppClsModule, DbModule, TrpcModule, ..., PreferencesModule]
```

`preferences.module.ts` should provide the repository adapter plus `PreferencesQueryFacade`.

- [ ] **Step 7: Run integration tests and generate confidence on default semantics**

Run: `bun run --cwd apps/api test:integration -- src/modules/preferences/interface/trpc/preferences.router.integration.spec.ts`

Expected: PASS, including:

- default fallback when `activeViewId` is missing
- stale `activeViewId` fallback
- one-default-per-resource semantics
- deleting a default leaves no default

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/preferences apps/api/src/app.module.ts
git add packages/db/drizzle/migrations packages/db/drizzle/meta
git commit -m "feat(preferences): add saved view persistence"
```

---

## Task 3: Expose The `preferences.savedView.*` tRPC Surface

**Files:**

- Create: `apps/api/src/modules/preferences/interface/trpc/preferences.router.ts`
- Modify: `apps/api/src/common/trpc/app-router.ts`
- Modify: `apps/api/src/modules/preferences/preferences.module.ts`
- Modify: `apps/api/src/modules/preferences/interface/trpc/preferences.router.integration.spec.ts`

- [ ] **Step 1: Extend the existing failing integration test to cover the full router contract**

Add failing cases for:

- `list`
- `create`
- `update`
- `delete`
- `setDefault`
- `resolve`

`resolve` cases must assert the full response shape:

- `views`
- `activeView`
- `defaultViewId`

- [ ] **Step 2: Run the failing integration test**

Run: `bun run --cwd apps/api test:integration -- src/modules/preferences/interface/trpc/preferences.router.integration.spec.ts`

Expected: FAIL because `preferences.router.ts` is missing.

- [ ] **Step 3: Implement the router**

Create `preferences.router.ts`:

```ts
import { router } from '../../../../common/trpc/app-router.js'
import { protectedProcedure } from '../../../../common/trpc/procedures.js'
import { z } from 'zod'

export const preferencesRouter = router({
  savedView: router({
    list: protectedProcedure.input(z.object({ resourceKey: z.string() })).query(...),
    resolve: protectedProcedure.input(z.object({ resourceKey: z.string(), activeViewId: z.string().uuid().nullable() })).query(...),
    create: protectedProcedure.input(...).mutation(...),
    update: protectedProcedure.input(...).mutation(...),
    delete: protectedProcedure.input(...).mutation(...),
    setDefault: protectedProcedure.input(...).mutation(...),
  }),
})
```

The router must never accept `actorId` or `tenantId` in input, and `resolve` must return the full page-hydration contract from the spec.

- [ ] **Step 4: Register the router**

Update:

```ts
// apps/api/src/common/trpc/app-router.ts
import { preferencesRouter } from '../../modules/preferences/interface/trpc/preferences.router.js'

export const appRouter = router({
  kernel: kernelRouter,
  preferences: preferencesRouter,
  people: peopleRouter,
  // ...
})
```

- [ ] **Step 5: Run integration tests**

Run: `bun run --cwd apps/api test:integration -- src/modules/preferences/interface/trpc/preferences.router.integration.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/trpc/app-router.ts
git add apps/api/src/modules/preferences/interface/trpc/preferences.router.ts
git add apps/api/src/modules/preferences/interface/trpc/preferences.router.integration.spec.ts
git commit -m "feat(preferences): add saved view trpc router"
```

---

## Task 4: Add The Shared List Contract And People Directory Reference Endpoint

**Files:**

- Create: `apps/api/src/common/list/future-list.contract.ts`
- Create: `apps/api/src/modules/people/application/queries/list-people-directory.query.ts`
- Create: `apps/api/src/modules/people/application/queries/people-directory.fixture.ts`
- Create: `apps/api/src/modules/people/application/queries/export-people-directory.query.ts`
- Modify: `apps/api/src/modules/people/interface/trpc/people.router.ts`
- Create: `apps/api/src/modules/people/interface/trpc/people.router.integration.spec.ts`

- [ ] **Step 1: Write the failing list-contract integration test**

Create `people.router.integration.spec.ts` with cases for:

- valid `search` + `sorting` + `filters`
- invalid sort field rejection
- invalid filter operator rejection
- stable `rows/totalCount/pageCount/pageIndex/pageSize` response shape
- export returning the full filtered result set as CSV while ignoring pagination
- export returning a typed over-limit error when the filtered result set exceeds `1000` rows

- [ ] **Step 2: Run the failing integration test**

Run: `bun run --cwd apps/api test:integration -- src/modules/people/interface/trpc/people.router.integration.spec.ts`

Expected: FAIL because the router is still empty.

- [ ] **Step 3: Create the shared list/export schema**

Create `apps/api/src/common/list/future-list.contract.ts` with:

```ts
const scalarFilterValue = z.union([z.string(), z.number(), z.boolean()])

const scalarFilterSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'neq', 'contains', 'starts_with', 'ends_with', 'gt', 'gte', 'lt', 'lte']),
  value: scalarFilterValue,
})

const arrayFilterSchema = z.object({
  field: z.string(),
  operator: z.enum(['in', 'not_in']),
  value: z.array(scalarFilterValue),
})

const rangeFilterSchema = z.object({
  field: z.string(),
  operator: z.literal('between'),
  value: z.object({
    from: z.union([z.string(), z.number()]),
    to: z.union([z.string(), z.number()]),
  }),
})

const emptyFilterSchema = z.object({
  field: z.string(),
  operator: z.enum(['is_empty', 'is_not_empty']),
  value: z.null(),
})

export const futureTableFilterSchema = z.union([
  scalarFilterSchema,
  arrayFilterSchema,
  rangeFilterSchema,
  emptyFilterSchema,
])

export const futureListQuerySchema = z.object({
  resourceKey: z.string(),
  search: z.string(),
  filters: z.array(futureTableFilterSchema),
  sorting: z.array(z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) })),
  pagination: z.object({
    pageIndex: z.number().int().min(0),
    pageSize: z.number().int().positive(),
  }),
})

export const futureExportQuerySchema = futureListQuerySchema.omit({ pagination: true }).extend({
  columns: z.array(z.string()).optional(),
})

export const futureListResultSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  totalCount: z.number().int().min(0),
  pageCount: z.number().int().min(0),
  pageIndex: z.number().int().min(0),
  pageSize: z.number().int().positive(),
  availableFilters: z.record(z.string(), z.array(z.unknown())).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})
```

- [ ] **Step 4: Create the fixture-backed query handlers**

Create `people-directory.fixture.ts` with a deterministic array of rows that exercises:

- text search
- status/category filtering
- sorting
- expansion fields
- at least one row with rich detail-panel content

Create `list-people-directory.query.ts` with explicit field/operator allowlists:

```ts
export const PEOPLE_DIRECTORY_SORT_FIELDS = [
  'fullName',
  'department',
  'jobTitle',
  'status',
] as const
export const PEOPLE_DIRECTORY_FILTER_FIELDS = ['department', 'status', 'employmentType'] as const
```

Create `export-people-directory.query.ts` that reuses the same allowlists and transforms the fully filtered + sorted rows into:

```ts
{
  filename: 'people-directory.csv',
  csv: string
}
```

Export must ignore pagination. If the filtered result set exceeds `1000` rows, return a typed over-limit error that explicitly points to the deferred async export workstream:

```ts
{
  code: 'EXPORT_LIMIT_EXCEEDED'
  limit: 1000
  message: 'Large exports are deferred to the async export workstream.'
}
```

- [ ] **Step 5: Implement the router procedures**

Update `people.router.ts` so it exposes:

```ts
export const peopleRouter = router({
  directory: router({
    list: protectedProcedure.input(futureListQuerySchema).query(({ input }) => {
      return listPeopleDirectory(input)
    }),
    export: protectedProcedure.input(futureExportQuerySchema).query(({ input }) => {
      return exportPeopleDirectory(input)
    }),
  }),
})
```

The procedures must return the standardized list result shape including `availableFilters` and `meta`, reject unknown fields/operators, and ensure export does not use `pageIndex` or `pageSize`. Large async export jobs are out of scope for this plan.

- [ ] **Step 6: Run the integration tests**

Run: `bun run --cwd apps/api test:integration -- src/modules/people/interface/trpc/people.router.integration.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/list/future-list.contract.ts
git add apps/api/src/modules/people/application/queries/list-people-directory.query.ts
git add apps/api/src/modules/people/application/queries/people-directory.fixture.ts
git add apps/api/src/modules/people/application/queries/export-people-directory.query.ts
git add apps/api/src/modules/people/interface/trpc/people.router.ts
git add apps/api/src/modules/people/interface/trpc/people.router.integration.spec.ts
git commit -m "feat(people): add directory list contract"
```

---

## Task 5: Add `@future/ui` Table State Utilities And Test Harness

**Files:**

- Modify: `packages/ui/package.json`
- Create: `packages/ui/vitest.config.ts`
- Create: `packages/ui/src/test/setup.ts`
- Create: `packages/ui/src/components/data-table/table-state.ts`
- Create: `packages/ui/src/components/data-table/table-state.spec.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Install the runtime and test dependencies**

Run:

```bash
bun add @tanstack/react-table --cwd packages/ui
bun add -d vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event --cwd packages/ui
```

Expected: `packages/ui/package.json` gains the new dependencies.

- [ ] **Step 2: Add package scripts and test config**

Run:

```bash
bun pm pkg set scripts.test="vitest run --config vitest.config.ts" --cwd packages/ui
```

Expected: `packages/ui/package.json` contains the new `test` script.

Then create `vitest.config.ts` with:

```ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 3: Write the failing table-state tests**

Create `table-state.spec.ts` for:

- filter serialization
- explicit empty URL overrides
- dirty-state comparison rules
- invalid `pageIndex` / `pageSize` coercion

- [ ] **Step 4: Implement the table-state utilities**

Create `table-state.ts` with exported types and helpers:

```ts
export type FutureTableState = {
  /* spec-aligned state */
}
export type PersistedSavedViewState = {
  search: FutureTableState['search']
  filters: FutureTableState['filters']
  sorting: FutureTableState['sorting']
  pagination: {
    pageSize: FutureTableState['pagination']['pageSize']
  }
  columnVisibility: FutureTableState['columnVisibility']
  columnPinning: FutureTableState['columnPinning']
  density: FutureTableState['density']
}

export function serializeTableStateToSearchParams(state: FutureTableState): URLSearchParams
export function parseTableStateFromSearchParams(params: URLSearchParams): FutureTableState
export function isSavedViewDirty(saved: PersistedSavedViewState, current: FutureTableState): boolean
```

- [ ] **Step 5: Export the state helpers**

Update `packages/ui/src/index.ts`:

```ts
export * from './components/data-table/table-state'
```

- [ ] **Step 6: Run UI tests and typecheck**

Run: `bun run --cwd packages/ui test`

Expected: PASS.

Run: `bun run --cwd packages/ui typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/package.json packages/ui/vitest.config.ts packages/ui/src/test/setup.ts
git add packages/ui/src/components/data-table/table-state.ts packages/ui/src/components/data-table/table-state.spec.ts
git add packages/ui/src/index.ts
git commit -m "feat(ui): add table state utilities"
```

---

## Task 6: Build The `@future/ui` DataTable Kit And Stories

**Files:**

- Create: `packages/ui/.storybook/main.ts`
- Create: `packages/ui/.storybook/preview.ts`
- Create: `packages/ui/src/components/data-table/data-table.tsx`
- Create: `packages/ui/src/components/data-table/data-table-toolbar.tsx`
- Create: `packages/ui/src/components/data-table/data-table-search.tsx`
- Create: `packages/ui/src/components/data-table/data-table-filters.tsx`
- Create: `packages/ui/src/components/data-table/data-table-column-header.tsx`
- Create: `packages/ui/src/components/data-table/data-table-view-options.tsx`
- Create: `packages/ui/src/components/data-table/data-table-pagination.tsx`
- Create: `packages/ui/src/components/data-table/data-table-bulk-actions.tsx`
- Create: `packages/ui/src/components/data-table/data-table-expanded-row.tsx`
- Create: `packages/ui/src/components/data-table/data-table-empty.tsx`
- Create: `packages/ui/src/components/data-table/data-table-loading.tsx`
- Create: `packages/ui/src/components/data-table/data-table-error.tsx`
- Create: `packages/ui/src/components/data-table/data-table.spec.tsx`
- Create: `packages/ui/src/components/data-table/data-table.stories.tsx`
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Install Storybook for the UI package**

Run:

```bash
bun add -d storybook @storybook/react-vite vite --cwd packages/ui
```

Expected: Storybook packages are added to `packages/ui/package.json`.

- [ ] **Step 2: Add Storybook scripts and config**

Run:

```bash
bun pm pkg set scripts.storybook="storybook dev -p 6006" --cwd packages/ui
bun pm pkg set scripts.build-storybook="storybook build" --cwd packages/ui
```

Create `.storybook/main.ts` and `.storybook/preview.ts` using the React Vite framework and importing `src/styles/globals.css`.

- [ ] **Step 3: Write the failing component tests**

Create `data-table.spec.tsx` with failing tests for:

- sortable headers
- row expansion
- row selection
- density switching
- column visibility toggle
- export callback wiring
- empty/loading/error render states

- [ ] **Step 4: Implement the DataTable component family**

Use TanStack Table inside `data-table.tsx` and compose the remaining files around it. Keep the API controlled-first:

```tsx
<DataTable
  columns={columns}
  rows={rows}
  state={state}
  totalCount={totalCount}
  onStateChange={setState}
  renderExpandedRow={renderExpandedRow}
/>
```

Use the existing `Table` primitives from `packages/ui/src/components/ui/table.tsx` instead of reimplementing table markup. Keep the body rendering isolated behind one internal seam so row virtualization can be added later without changing the public component API.

`data-table-toolbar.tsx` must expose export affordances:

```tsx
<DataTableToolbar onExport={handleExport} exportDisabled={rows.length === 0} />
```

- [ ] **Step 5: Add Storybook stories**

Create `data-table.stories.tsx` stories for:

- populated default
- loading
- no results
- dirty saved view
- expanded row
- selected rows
- export enabled

- [ ] **Step 6: Export the new UI kit**

Update `packages/ui/src/index.ts` to export the full table surface.

- [ ] **Step 7: Run package verification**

Run:

```bash
bun run --cwd packages/ui test
bun run --cwd packages/ui typecheck
bun run --cwd packages/ui build-storybook
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/.storybook packages/ui/package.json
git add packages/ui/src/components/data-table packages/ui/src/index.ts
git commit -m "feat(ui): add platform standard data table kit"
```

---

## Task 7: Build The `web-people` Reference Page And End-To-End Coverage

**Files:**

- Create: `apps/web-people/src/lib/trpc.ts`
- Create: `apps/web-people/src/lib/table-url-state.ts`
- Create: `apps/web-people/src/components/people-directory-table.tsx`
- Modify: `apps/web-people/src/app/page.tsx`
- Create: `apps/e2e/tests/people-directory.spec.ts`
- Modify: `docs/architecture/application.md`
- Modify: `docs/engineering/tech-stack.md`

- [ ] **Step 1: Write the failing browser flow**

Create `apps/e2e/tests/people-directory.spec.ts` covering:

- table renders on `/`
- search updates the URL
- sorting changes the result order
- selecting a saved view restores filters and density
- valid `activeViewId` hydrates first
- explicit URL params override saved-view values after hydration
- initial load with no valid `activeViewId` rewrites the URL to `activeViewId=<defaultViewId>` using replace-state semantics
- invalid or foreign `activeViewId` with a default view removes the invalid value and replaces it with `activeViewId=<defaultViewId>`
- invalid `activeViewId` with no default view falls back to raw URL state without adding a replacement `activeViewId`
- expanding a row shows detail content
- export downloads a CSV file for the current filtered result set

- [ ] **Step 2: Run the failing Playwright test**

Run:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 bun run --cwd apps/e2e test:e2e -- people-directory.spec.ts
```

Expected: FAIL because the page is still “Coming soon.”

- [ ] **Step 3: Create the web client helpers**

Create `apps/web-people/src/lib/trpc.ts`:

```ts
import { createTRPCClient } from '@future/api-client'

export const trpc = createTRPCClient({
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  headers: () => ({
    'x-future-tenant-id': process.env.NEXT_PUBLIC_DEV_TENANT_ID ?? '',
    'x-future-actor-id': process.env.NEXT_PUBLIC_DEV_ACTOR_ID ?? '',
  }),
})
```

Create `table-url-state.ts` to parse and push `FutureTableState` against `window.location.search`. Add one named helper that owns the saved-view precedence rules:

```ts
export function resolveHydratedTableState(args: {
  urlState: FutureTableState
  activeView: PersistedSavedViewState | null
  defaultView: PersistedSavedViewState | null
  requestedActiveViewId: string | null
}): {
  nextState: FutureTableState
  nextActiveViewId: string | null
  replaceUrl: boolean
}
```

- [ ] **Step 4: Build the People directory page**

Create `people-directory-table.tsx` as a client component that:

- loads `preferences.savedView.resolve`
- loads `people.directory.list`
- calls `people.directory.export` and triggers a CSV download
- resolves first-load state in this order:
  - saved view from `activeViewId` when valid
  - default view when `activeViewId` is missing or invalid
  - explicit URL params applied on top of the base state
- treats foreign `activeViewId` the same as invalid/deleted `activeViewId`
- when the default view is used on first load, writes `activeViewId=<defaultViewId>` back into the URL with replace-state semantics
- clears invalid `activeViewId` with replace-state semantics
- applies a selected saved view by resetting `pageIndex` to `0`
- keeps `activeViewId` in the URL
- keeps `isViewDirty` local
- calls `preferences.savedView.create/update/delete/setDefault` from the toolbar actions

Replace `apps/web-people/src/app/page.tsx` with the reference page shell that renders `PeopleDirectoryTable`.

- [ ] **Step 5: Run the web app checks**

Run:

```bash
bun run --cwd apps/web-people typecheck
bun run --cwd apps/web-people lint
```

Expected: PASS.

- [ ] **Step 6: Run end-to-end verification**

Start the API and web app locally, then run:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 bun run --cwd apps/e2e test:e2e -- people-directory.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Update the architecture docs**

Make these doc updates:

- add `preferences` to the module table in `docs/architecture/application.md`
- note TanStack Table + Storybook in `docs/engineering/tech-stack.md`

- [ ] **Step 8: Commit**

```bash
git add apps/web-people/src/lib/trpc.ts apps/web-people/src/lib/table-url-state.ts
git add apps/web-people/src/components/people-directory-table.tsx apps/web-people/src/app/page.tsx
git add apps/e2e/tests/people-directory.spec.ts
git add docs/architecture/application.md docs/engineering/tech-stack.md
git commit -m "feat(people): add standard table reference page"
```

---

## Final Verification

- [ ] **Step 1: Run the full targeted verification set**

```bash
bun run --cwd apps/api test
bun run --cwd apps/api test:integration
bun run --cwd packages/ui test
bun run --cwd packages/ui typecheck
bun run --cwd apps/web-people typecheck
bun run --cwd apps/web-people lint
bun run --cwd packages/ui build-storybook
PLAYWRIGHT_BASE_URL=http://localhost:3001 bun run --cwd apps/e2e test:e2e -- people-directory.spec.ts
```

Expected: all commands PASS.

- [ ] **Step 2: Final commit**

```bash
git add apps/api packages/ui apps/web-people apps/e2e docs
git commit -m "feat(ui): ship platform standard table foundation"
```

# Plan 3.2 — My Plans + Sidebar Wiring

> Covers spec **Plan 3.2** — see [design spec](../../specs/2026-04-20-personal-hubs-design.md) sections 7.1 (`personal.listPlans`), 8.2 (nav config), 8.3 (`PlannerSidebarPlansGroup`), 8.7 (empty states), 8.9 (feature flag).
> Depends on Plan 3.1 merged — schema columns, `CreatePersonalPlan` command, `ListPlansForActorHandler`, `NavGroup` union refactor, `tenantSettings.plannerPersonalEnabled`, `admin.getTenantTimezone`, and all permission strings are already in place.

**Goal:** First user-visible surface of Personal Hubs. Ship the `personal.listPlans` tRPC procedure, a dynamic `PlannerSidebarPlansGroup` sidebar section, a `/personal/plans` route with a card grid, and rewire `plannerNavConfig` to expose Personal Hubs nav items. Final task flips `planner.personal.enabled = true` for the SETA internal tenant so the new surface actually ships.

**Architecture:** A new `personal` sub-router is mounted at `plannerRouter.personal`. It holds only `listPlans` in 3.2 — Plans 3.3/3.4/3.5 extend it. A new `assertPersonalEnabled` gate on `PlannerRouterService` rejects all `personal.*` procedures with `FORBIDDEN` when the tenant flag is off. Frontend: `PlannerSidebarPlansGroup` is a client component consumed via the `NavGroup.render` API introduced in 3.1 — it calls the new `usePersonalPlans` hook, renders pinned personal plan first with a `<User />` icon, team plans alphabetically with `<Folder />`, and shows `<SidebarMenuSkeleton />` while loading. A single-purpose `usePersonalPlans` hook wraps the tRPC query. A second hook, `useTenantTimezone`, is shipped here (consumed by 3.4/3.5) because it's a tiny wrapper and landing it now keeps Plan 3.4 from needing a hook-only commit. The existing `/plans` page is unchanged; a new `/personal/plans` page mounts a card grid.

**Tech stack:** NestJS CQRS, tRPC, React 19 / Next.js 15 App Router, React Query, `@future/ui` primitives, `lucide-react` icons, Vitest + React Testing Library.

---

## File Map

### Backend — `personal` router + flag gate

| File                                                                                    | Action | Purpose                                                                            |
| --------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `apps/api/src/modules/planner/interface/trpc/planner-router.service.ts`                 | Modify | Add `assertPersonalEnabled(tenantId)` that rejects when `personalEnabled` is false |
| `apps/api/src/modules/planner/interface/trpc/personal.router.ts`                        | Create | New tRPC router with `listPlans` procedure only                                    |
| `apps/api/src/modules/planner/interface/trpc/personal.router.spec.ts`                   | Create | Unit tests: flag-gate + delegation to `ListPlansForActorQuery`                     |
| `apps/api/src/modules/planner/interface/trpc/personal-feature-flag.integration.spec.ts` | Create | Integration: FORBIDDEN when flag off, pass when flag on                            |
| `apps/api/src/modules/planner/interface/trpc/planner.router.ts`                         | Modify | Mount `personal: personalRouter` on the planner router                             |

### Frontend — hooks

| File                                                         | Action | Purpose                                                           |
| ------------------------------------------------------------ | ------ | ----------------------------------------------------------------- |
| `apps/web-planner/src/lib/hooks/use-personal-plans.ts`       | Create | Wraps `trpc.planner.personal.listPlans.query` in `useQuery`       |
| `apps/web-planner/src/lib/hooks/use-personal-plans.spec.ts`  | Create | Hook unit tests                                                   |
| `apps/web-planner/src/lib/hooks/use-tenant-timezone.ts`      | Create | Wraps `trpc.admin.getTenantTimezone.query` (session-scoped cache) |
| `apps/web-planner/src/lib/hooks/use-tenant-timezone.spec.ts` | Create | Hook unit tests                                                   |

### Frontend — sidebar dynamic group

| File                                                                           | Action | Purpose                                                                         |
| ------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------- |
| `apps/web-planner/src/components/sidebar/planner-sidebar-plans-group.tsx`      | Create | Dynamic sidebar component: pinned personal plan, alpha team plans, active state |
| `apps/web-planner/src/components/sidebar/planner-sidebar-plans-group.spec.tsx` | Create | Component tests: loading skeleton, personal pinned first, empty state           |
| `apps/web-planner/src/navigation.ts`                                           | Modify | Rewrite: Personal Hubs nav items + dynamic `render` for Plans group             |

### Frontend — My Plans page + components

| File                                                              | Action | Purpose                                                                |
| ----------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| `apps/web-planner/src/app/personal/plans/page.tsx`                | Create | `/personal/plans` route — card grid with two empty states per spec 8.7 |
| `apps/web-planner/src/app/personal/plans/page.spec.tsx`           | Create | Page tests: grid renders, empty-state variants                         |
| `apps/web-planner/src/components/my-plans/my-plans-grid.tsx`      | Create | Grid orchestrator: pinned personal card + team cards                   |
| `apps/web-planner/src/components/my-plans/my-plans-grid.spec.tsx` | Create | Grid tests                                                             |
| `apps/web-planner/src/components/my-plans/plan-card.tsx`          | Create | Card primitive: name, member count, role, personal badge if applicable |
| `apps/web-planner/src/components/my-plans/plan-card.spec.tsx`     | Create | Card tests                                                             |
| `apps/web-planner/src/components/personal-plan-badge.tsx`         | Create | Small `<User />` + "Personal" pill, reused in sidebar and cards        |
| `apps/web-planner/src/components/personal-plan-badge.spec.tsx`    | Create | Badge tests                                                            |

### Frontend — route shell wiring

| File                                               | Action | Purpose                                                                |
| -------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| `apps/web-planner/src/app/page.tsx`                | Modify | Redirect target → `/personal/tasks/board` (spec default landing route) |
| `apps/web-planner/src/app/personal/tasks/page.tsx` | Create | 3.3 placeholder: redirects to `/personal/plans` with a note            |
| `apps/web-planner/src/app/personal/today/page.tsx` | Create | 3.4 placeholder: redirects to `/personal/plans` with a note            |

### Feature-flag flip

| File                                          | Action | Purpose                                                                                                                     |
| --------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/seeds/planner-personal-flag.sql` | Create | Idempotent seed SQL: `UPDATE admin.tenant_settings SET planner_personal_enabled = true WHERE tenant_id = …` for SETA tenant |

### Dependencies

None. `personal.listPlans` reuses `ListPlansForActorHandler` from 3.1. Hooks use existing `@tanstack/react-query` + `@future/auth`. No `bun add` needed.

---

## Task 1 — `PlannerRouterService.assertPersonalEnabled`

**Files:**

- Modify: `apps/api/src/modules/planner/interface/trpc/planner-router.service.ts`
- Modify: `apps/api/src/modules/planner/interface/trpc/planner-router.service.spec.ts` (or create if absent)

- [ ] **Step 1: Write failing tests.**

```ts
// planner-router.service.spec.ts — add a describe block
describe('assertPersonalEnabled', () => {
  let svc: PlannerRouterService
  let adminFacade: { getPlannerViewFlags: jest.Mock; isPlannerEnabled: jest.Mock }

  beforeEach(async () => {
    adminFacade = {
      getPlannerViewFlags: jest.fn(),
      isPlannerEnabled: jest.fn().mockResolvedValue(true),
    }
    const mod = await Test.createTestingModule({
      providers: [
        PlannerRouterService,
        { provide: CommandBus, useValue: { execute: jest.fn() } },
        { provide: QueryBus, useValue: { execute: jest.fn() } },
        { provide: AdminQueryFacade, useValue: adminFacade },
      ],
    }).compile()
    svc = mod.get(PlannerRouterService)
    svc.onModuleInit()
  })

  it('resolves when planner.personal.enabled is true', async () => {
    adminFacade.getPlannerViewFlags.mockResolvedValue({
      viewsEnabled: true,
      gridEnabled: true,
      scheduleEnabled: true,
      chartsEnabled: true,
      personalEnabled: true,
    })
    await expect(svc.assertPersonalEnabled('tenant-1')).resolves.toBeUndefined()
  })

  it('throws TRPCError FORBIDDEN when personal is disabled', async () => {
    adminFacade.getPlannerViewFlags.mockResolvedValue({
      viewsEnabled: true,
      gridEnabled: true,
      scheduleEnabled: true,
      chartsEnabled: true,
      personalEnabled: false,
    })
    await expect(svc.assertPersonalEnabled('tenant-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/api/src/modules/planner/interface/trpc/planner-router.service.spec.ts`
Expected: FAIL — `svc.assertPersonalEnabled is not a function`.

- [ ] **Step 3: Extend the service.**

```ts
// planner-router.service.ts — add method inside the class
async assertPersonalEnabled(tenantId: string): Promise<void> {
  const flags = await this.adminQueryFacade.getPlannerViewFlags(tenantId)
  if (!flags.personalEnabled) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Personal Hubs is not enabled for this tenant',
    })
  }
}
```

- [ ] **Step 4: Run tests — expect pass.**

Run: `bun test apps/api/src/modules/planner/interface/trpc/planner-router.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/planner/interface/trpc/planner-router.service.ts apps/api/src/modules/planner/interface/trpc/planner-router.service.spec.ts
git commit -m "feat(planner): assertPersonalEnabled gate on PlannerRouterService"
```

---

## Task 2 — `personal.router.ts` with `listPlans`

**Files:**

- Create: `apps/api/src/modules/planner/interface/trpc/personal.router.ts`
- Create: `apps/api/src/modules/planner/interface/trpc/personal.router.spec.ts`

- [ ] **Step 1: Write failing unit test.**

```ts
// personal.router.spec.ts
import { TRPCError } from '@trpc/server'
import { personalRouter } from './personal.router'
import { PlannerRouterService } from './planner-router.service'
import { ListPlansForActorQuery } from '../../application/queries/plans/list-plans-for-actor.query'

describe('personalRouter', () => {
  const actorId = '00000000-0000-0000-0000-0000000000a1'
  const tenantId = '00000000-0000-0000-0000-0000000000t1'
  let assertPersonalEnabled: jest.Mock
  let query: jest.Mock

  beforeEach(() => {
    assertPersonalEnabled = jest.fn().mockResolvedValue(undefined)
    query = jest.fn()
    jest.spyOn(PlannerRouterService, 'getInstance').mockReturnValue({
      assertPersonalEnabled,
      query,
    } as unknown as PlannerRouterService)
  })

  afterEach(() => jest.restoreAllMocks())

  it('listPlans asserts personal-enabled then delegates to ListPlansForActorQuery', async () => {
    const plans = [
      { id: 'p1', name: 'Personal', memberCount: 1, myRole: 'owner', updatedAt: new Date() },
    ]
    query.mockResolvedValue(plans)

    const caller = personalRouter.createCaller({} as never)
    const result = await caller.listPlans({ actorId, tenantId })

    expect(assertPersonalEnabled).toHaveBeenCalledWith(tenantId)
    expect(query).toHaveBeenCalledWith(expect.any(ListPlansForActorQuery))
    expect(result).toEqual(plans)
  })

  it('propagates FORBIDDEN from assertPersonalEnabled', async () => {
    assertPersonalEnabled.mockRejectedValue(new TRPCError({ code: 'FORBIDDEN', message: 'off' }))

    const caller = personalRouter.createCaller({} as never)
    await expect(caller.listPlans({ actorId, tenantId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/api/src/modules/planner/interface/trpc/personal.router.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the router.**

```ts
// personal.router.ts
import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { ListPlansForActorQuery } from '../../application/queries/plans/list-plans-for-actor.query'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

export const personalRouter = router({
  listPlans: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPersonalEnabled(input.tenantId)
      return svc()
        .query(new ListPlansForActorQuery(input.actorId, input.tenantId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
```

- [ ] **Step 4: Run tests — expect pass.**

Run: `bun test apps/api/src/modules/planner/interface/trpc/personal.router.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/planner/interface/trpc/personal.router.ts apps/api/src/modules/planner/interface/trpc/personal.router.spec.ts
git commit -m "feat(planner): personal.router.ts with listPlans procedure"
```

---

## Task 3 — Mount `personal` on `plannerRouter`

**Files:**

- Modify: `apps/api/src/modules/planner/interface/trpc/planner.router.ts`

- [ ] **Step 1: Write failing compile test.**

Add to `apps/api/src/modules/planner/interface/trpc/planner.router.integration.spec.ts` (already exists):

```ts
it('exposes planner.personal.listPlans', () => {
  const keys = Object.keys(plannerRouter._def.procedures)
  // `personal` shows up in the sub-router structure
  expect(plannerRouter.personal).toBeDefined()
  expect(plannerRouter.personal._def.procedures.listPlans).toBeDefined()
})
```

Required import at top of the file if not already: `import { plannerRouter } from './planner.router'`.

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/api/src/modules/planner/interface/trpc/planner.router.integration.spec.ts`
Expected: FAIL — `plannerRouter.personal` is undefined.

- [ ] **Step 3: Mount the sub-router.**

```ts
// planner.router.ts — add import + mount
import { personalRouter } from './personal.router'

export const plannerRouter = router({
  plans: planRouter,
  labels: labelRouter,
  buckets: bucketRouter,
  tasks: taskRouter,
  checklist: checklistRouter,
  attachments: attachmentRouter,
  comments: commentRouter,
  evidence: evidenceRouter,
  personal: personalRouter, // NEW
})
```

- [ ] **Step 4: Run tests — expect pass.**

Run: `bun test apps/api/src/modules/planner/interface/trpc/planner.router.integration.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/modules/planner/interface/trpc/planner.router.ts apps/api/src/modules/planner/interface/trpc/planner.router.integration.spec.ts
git commit -m "feat(planner): mount personal sub-router on plannerRouter"
```

---

## Task 4 — Feature-flag integration test

**Files:**

- Create: `apps/api/src/modules/planner/interface/trpc/personal-feature-flag.integration.spec.ts`

Pattern after the existing `planner-feature-flag.integration.spec.ts`. Use the same test-bootstrap helpers.

- [ ] **Step 1: Write the integration test.**

```ts
// personal-feature-flag.integration.spec.ts
import { TRPCError } from '@trpc/server'
import { bootstrapTestModule, type TestBootstrap } from '../../../../test/bootstrap-test-module'
import { seedTenant, seedActor } from '../../../../test/seed'
import { appRouter } from '../../../../common/trpc/app-router'
import { setTenantPersonalFlag } from '../../../../test/admin-flags'

describe('personal router feature flag (integration)', () => {
  let ctx: TestBootstrap
  let tenantId: string
  let actorId: string

  beforeAll(async () => {
    ctx = await bootstrapTestModule()
    tenantId = await seedTenant(ctx.db)
    actorId = await seedActor(ctx.db, { tenantId })
  })

  afterAll(async () => {
    await ctx.shutdown()
  })

  it('rejects listPlans with FORBIDDEN when planner.personal.enabled is false', async () => {
    await setTenantPersonalFlag(ctx.db, tenantId, false)
    const caller = appRouter.createCaller(ctx.makeCtx({ actorId, tenantId }))
    await expect(caller.planner.personal.listPlans({ actorId, tenantId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('allows listPlans when planner.personal.enabled is true', async () => {
    await setTenantPersonalFlag(ctx.db, tenantId, true)
    const caller = appRouter.createCaller(ctx.makeCtx({ actorId, tenantId }))
    const plans = await caller.planner.personal.listPlans({ actorId, tenantId })
    expect(Array.isArray(plans)).toBe(true)
  })
})
```

> **Note:** the helpers `bootstrapTestModule`, `seedTenant`, `seedActor`, `setTenantPersonalFlag` follow existing patterns in `apps/api/src/test/`. If `setTenantPersonalFlag` does not exist, add it alongside the existing `setTenantFlag` helper — one-line `UPDATE admin.tenant_settings SET planner_personal_enabled = $1 WHERE tenant_id = $2`. If the project uses a different integration harness, adapt the import path but preserve the FORBIDDEN ↔ flag-off assertion exactly.

- [ ] **Step 2: Run.**

```bash
bun run db:up && bun run db:migrate
bun test apps/api/src/modules/planner/interface/trpc/personal-feature-flag.integration.spec.ts
```

Expected: PASS both cases.

- [ ] **Step 3: Commit.**

```bash
git add apps/api/src/modules/planner/interface/trpc/personal-feature-flag.integration.spec.ts apps/api/src/test/
git commit -m "test(planner): integration coverage for planner.personal feature flag"
```

---

## Task 5 — `usePersonalPlans` hook

**Files:**

- Create: `apps/web-planner/src/lib/hooks/use-personal-plans.ts`
- Create: `apps/web-planner/src/lib/hooks/use-personal-plans.spec.ts`

- [ ] **Step 1: Write failing test.**

```ts
// use-personal-plans.spec.ts
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { usePersonalPlans } from './use-personal-plans'
import { trpc } from '../trpc'
import { useSession } from '@future/auth'

jest.mock('../trpc', () => ({
  trpc: {
    planner: {
      personal: {
        listPlans: { query: jest.fn() },
      },
    },
  },
}))
jest.mock('@future/auth', () => ({ useSession: jest.fn() }))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('usePersonalPlans', () => {
  const session = {
    actorId: '00000000-0000-0000-0000-0000000000a1',
    tenantId: '00000000-0000-0000-0000-0000000000t1',
  }

  beforeEach(() => {
    ;(useSession as jest.Mock).mockReturnValue(session)
    ;(trpc.planner.personal.listPlans.query as jest.Mock).mockReset()
  })

  it('returns the list of plans on success', async () => {
    const plans = [
      { id: 'pp', name: 'Personal', memberCount: 1, myRole: 'owner', updatedAt: new Date().toISOString(), ownerActorId: session.actorId },
      { id: 'pa', name: 'Alpha', memberCount: 3, myRole: 'editor', updatedAt: new Date().toISOString(), ownerActorId: null },
    ]
    ;(trpc.planner.personal.listPlans.query as jest.Mock).mockResolvedValue(plans)

    const { result } = renderHook(() => usePersonalPlans(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual(plans)
    expect(trpc.planner.personal.listPlans.query).toHaveBeenCalledWith({
      actorId: session.actorId,
      tenantId: session.tenantId,
    })
  })

  it('stays disabled when no session is present', () => {
    ;(useSession as jest.Mock).mockReturnValue(null)
    const { result } = renderHook(() => usePersonalPlans(), { wrapper })
    expect(result.current.data).toBeUndefined()
    expect(trpc.planner.personal.listPlans.query).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/web-planner/src/lib/hooks/use-personal-plans.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```ts
// use-personal-plans.ts
'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useSession } from '@future/auth'
import { trpc } from '../trpc'

export interface PersonalPlanSummary {
  id: string
  name: string
  memberCount: number
  myRole: 'owner' | 'editor' | 'viewer' | null
  updatedAt: string
  ownerActorId: string | null
}

export function usePersonalPlans(): UseQueryResult<PersonalPlanSummary[]> {
  const session = useSession()

  return useQuery({
    queryKey: ['planner.personal.listPlans', session?.actorId, session?.tenantId],
    queryFn: () =>
      trpc.planner.personal.listPlans
        .query({ actorId: session!.actorId, tenantId: session!.tenantId })
        .then((data) => data as unknown as PersonalPlanSummary[]),
    enabled: !!session,
  })
}
```

- [ ] **Step 4: Run tests — expect pass.**

Run: `bun test apps/web-planner/src/lib/hooks/use-personal-plans.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/lib/hooks/use-personal-plans.ts apps/web-planner/src/lib/hooks/use-personal-plans.spec.ts
git commit -m "feat(web-planner): usePersonalPlans hook"
```

> **Note on `ownerActorId`:** `ListPlansForActorHandler.PlanSummary` (from 3.1) does not yet return `ownerActorId`. Add the field in this plan — the sidebar and card components need to know whether a plan is personal to pick the right icon.

- [ ] **Step 6: Extend `PlanSummary` with `ownerActorId`.**

Edit `apps/api/src/modules/planner/application/queries/plans/list-plans-for-actor.handler.ts`:

```ts
export interface PlanSummary {
  id: string
  name: string
  memberCount: number
  myRole: 'owner' | 'editor' | 'viewer' | null
  updatedAt: Date
  ownerActorId: string | null // NEW — null for team plans, actor id for personal plans
}

// in toSummary():
return {
  id: plan.id,
  name: plan.name,
  memberCount: plan.members.length,
  myRole: member?.role ?? null,
  updatedAt: plan.updatedAt,
  ownerActorId: plan.ownerActorId, // NEW
}
```

Update `list-plans-for-actor.handler.spec.ts` to assert `ownerActorId` is returned. Run: `bun test apps/api/src/modules/planner/application/queries/plans/list-plans-for-actor.handler.spec.ts` → PASS.

```bash
git add apps/api/src/modules/planner/application/queries/plans/list-plans-for-actor.handler.ts apps/api/src/modules/planner/application/queries/plans/list-plans-for-actor.handler.spec.ts
git commit -m "feat(planner): expose ownerActorId on PlanSummary"
```

---

## Task 6 — `useTenantTimezone` hook

**Files:**

- Create: `apps/web-planner/src/lib/hooks/use-tenant-timezone.ts`
- Create: `apps/web-planner/src/lib/hooks/use-tenant-timezone.spec.ts`

> Consumed by Plans 3.4 / 3.5. Shipped here so those plans don't need a hook-only commit, and so 3.2 has a test pattern for tenant-scoped session cache.

- [ ] **Step 1: Write failing test.**

```ts
// use-tenant-timezone.spec.ts
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTenantTimezone } from './use-tenant-timezone'
import { trpc } from '../trpc'
import { useSession } from '@future/auth'

jest.mock('../trpc', () => ({
  trpc: { admin: { getTenantTimezone: { query: jest.fn() } } },
}))
jest.mock('@future/auth', () => ({ useSession: jest.fn() }))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useTenantTimezone', () => {
  beforeEach(() => {
    ;(useSession as jest.Mock).mockReturnValue({
      actorId: 'a',
      tenantId: '00000000-0000-0000-0000-0000000000t1',
    })
    ;(trpc.admin.getTenantTimezone.query as jest.Mock).mockReset()
  })

  it('returns the tenant timezone', async () => {
    ;(trpc.admin.getTenantTimezone.query as jest.Mock).mockResolvedValue({ timezone: 'Asia/Ho_Chi_Minh' })
    const { result } = renderHook(() => useTenantTimezone(), { wrapper })
    await waitFor(() => expect(result.current.timezone).toBe('Asia/Ho_Chi_Minh'))
  })

  it('returns the default while loading', () => {
    ;(trpc.admin.getTenantTimezone.query as jest.Mock).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useTenantTimezone(), { wrapper })
    expect(result.current.timezone).toBe('Asia/Ho_Chi_Minh')
    expect(result.current.isLoading).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/web-planner/src/lib/hooks/use-tenant-timezone.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```ts
// use-tenant-timezone.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from '@future/auth'
import { trpc } from '../trpc'

const DEFAULT_TENANT_TIMEZONE = 'Asia/Ho_Chi_Minh'

export interface TenantTimezoneResult {
  timezone: string
  isLoading: boolean
}

export function useTenantTimezone(): TenantTimezoneResult {
  const session = useSession()

  const { data, isLoading } = useQuery({
    queryKey: ['admin.getTenantTimezone', session?.tenantId],
    queryFn: () =>
      trpc.admin.getTenantTimezone.query().then((r) => r as unknown as { timezone: string }),
    enabled: !!session,
    staleTime: 1000 * 60 * 60, // 1h — timezone rarely changes
  })

  return {
    timezone: data?.timezone ?? DEFAULT_TENANT_TIMEZONE,
    isLoading,
  }
}
```

- [ ] **Step 4: Run tests — expect pass.**

Run: `bun test apps/web-planner/src/lib/hooks/use-tenant-timezone.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/lib/hooks/use-tenant-timezone.ts apps/web-planner/src/lib/hooks/use-tenant-timezone.spec.ts
git commit -m "feat(web-planner): useTenantTimezone hook"
```

---

## Task 7 — `PersonalPlanBadge`

**Files:**

- Create: `apps/web-planner/src/components/personal-plan-badge.tsx`
- Create: `apps/web-planner/src/components/personal-plan-badge.spec.tsx`

- [ ] **Step 1: Write failing test.**

```tsx
// personal-plan-badge.spec.tsx
import { render, screen } from '@testing-library/react'
import { PersonalPlanBadge } from './personal-plan-badge'

describe('PersonalPlanBadge', () => {
  it('renders the label and a user icon', () => {
    render(<PersonalPlanBadge />)
    expect(screen.getByText('Personal')).toBeInTheDocument()
    // lucide `User` icon has role=img via aria attributes; assert via testid fallback
    expect(screen.getByTestId('personal-plan-badge')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/web-planner/src/components/personal-plan-badge.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```tsx
// personal-plan-badge.tsx
import { User } from 'lucide-react'

export function PersonalPlanBadge() {
  return (
    <span
      data-testid="personal-plan-badge"
      className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-510 text-fg-muted"
    >
      <User size={10} aria-hidden />
      Personal
    </span>
  )
}
```

- [ ] **Step 4: Run tests — expect pass.**

Run: `bun test apps/web-planner/src/components/personal-plan-badge.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/components/personal-plan-badge.tsx apps/web-planner/src/components/personal-plan-badge.spec.tsx
git commit -m "feat(web-planner): PersonalPlanBadge component"
```

---

## Task 8 — `PlanCard` component

**Files:**

- Create: `apps/web-planner/src/components/my-plans/plan-card.tsx`
- Create: `apps/web-planner/src/components/my-plans/plan-card.spec.tsx`

- [ ] **Step 1: Write failing test.**

```tsx
// plan-card.spec.tsx
import { render, screen } from '@testing-library/react'
import { PlanCard } from './plan-card'

describe('PlanCard', () => {
  const base = {
    id: 'p1',
    name: 'Alpha Team',
    memberCount: 3,
    myRole: 'editor' as const,
    updatedAt: new Date().toISOString(),
    ownerActorId: null,
    isPersonal: false,
  }

  it('renders plan name, member count, role, and links to the board', () => {
    render(<PlanCard plan={base} />)
    expect(screen.getByText('Alpha Team')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('editor')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/plans/p1/board')
  })

  it('renders the personal badge when isPersonal is true', () => {
    render(<PlanCard plan={{ ...base, isPersonal: true, ownerActorId: 'a1' }} />)
    expect(screen.getByTestId('personal-plan-badge')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/web-planner/src/components/my-plans/plan-card.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```tsx
// plan-card.tsx
import Link from 'next/link'
import { Users } from 'lucide-react'
import { Card } from '@future/ui'
import { PersonalPlanBadge } from '../personal-plan-badge'

export interface PlanCardData {
  id: string
  name: string
  memberCount: number
  myRole: 'owner' | 'editor' | 'viewer' | null
  updatedAt: string
  ownerActorId: string | null
  isPersonal: boolean
}

export function PlanCard({ plan }: { plan: PlanCardData }) {
  return (
    <Link href={`/plans/${plan.id}/board`} className="block hover:opacity-90 transition-opacity">
      <Card className="p-4 cursor-pointer hover:bg-elevated transition-colors">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-510 text-fg-primary truncate">{plan.name}</h2>
          {plan.isPersonal && <PersonalPlanBadge />}
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-xs text-fg-muted">
          <Users size={12} />
          <span>{plan.memberCount}</span>
          {plan.myRole && <span className="ml-1 capitalize text-fg-subtle">{plan.myRole}</span>}
        </div>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 4: Run tests — expect pass.**

Run: `bun test apps/web-planner/src/components/my-plans/plan-card.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/components/my-plans/plan-card.tsx apps/web-planner/src/components/my-plans/plan-card.spec.tsx
git commit -m "feat(web-planner): PlanCard component"
```

---

## Task 9 — `MyPlansGrid` component

**Files:**

- Create: `apps/web-planner/src/components/my-plans/my-plans-grid.tsx`
- Create: `apps/web-planner/src/components/my-plans/my-plans-grid.spec.tsx`

- [ ] **Step 1: Write failing test.**

```tsx
// my-plans-grid.spec.tsx
import { render, screen, within } from '@testing-library/react'
import { MyPlansGrid } from './my-plans-grid'

describe('MyPlansGrid', () => {
  const actorId = 'a1'
  const personal = {
    id: 'pp',
    name: 'Personal',
    memberCount: 1,
    myRole: 'owner' as const,
    updatedAt: new Date().toISOString(),
    ownerActorId: actorId,
  }
  const teamA = {
    id: 'ta',
    name: 'Alpha',
    memberCount: 3,
    myRole: 'editor' as const,
    updatedAt: new Date().toISOString(),
    ownerActorId: null,
  }
  const teamB = {
    id: 'tb',
    name: 'Beta',
    memberCount: 5,
    myRole: 'viewer' as const,
    updatedAt: new Date().toISOString(),
    ownerActorId: null,
  }

  it('renders personal plan first then team plans alphabetically', () => {
    render(<MyPlansGrid plans={[teamB, teamA, personal]} actorId={actorId} />)
    const grid = screen.getByTestId('my-plans-grid')
    const names = within(grid)
      .getAllByRole('link')
      .map((a) => within(a).getByRole('heading').textContent)
    expect(names).toEqual(['Personal', 'Alpha', 'Beta'])
  })

  it("marks the actor's personal plan card with the personal badge", () => {
    render(<MyPlansGrid plans={[personal, teamA]} actorId={actorId} />)
    // exactly one badge — on the personal card
    expect(screen.getAllByTestId('personal-plan-badge')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/web-planner/src/components/my-plans/my-plans-grid.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```tsx
// my-plans-grid.tsx
import { PlanCard, type PlanCardData } from './plan-card'
import type { PersonalPlanSummary } from '../../lib/hooks/use-personal-plans'

export interface MyPlansGridProps {
  plans: PersonalPlanSummary[]
  actorId: string
}

export function MyPlansGrid({ plans, actorId }: MyPlansGridProps) {
  const decorated: PlanCardData[] = plans.map((p) => ({
    ...p,
    isPersonal: p.ownerActorId === actorId,
  }))

  const personal = decorated.filter((p) => p.isPersonal)
  const team = decorated.filter((p) => !p.isPersonal).sort((a, b) => a.name.localeCompare(b.name))

  const ordered = [...personal, ...team]

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      data-testid="my-plans-grid"
    >
      {ordered.map((plan) => (
        <PlanCard key={plan.id} plan={plan} />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect pass.**

Run: `bun test apps/web-planner/src/components/my-plans/my-plans-grid.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/components/my-plans/my-plans-grid.tsx apps/web-planner/src/components/my-plans/my-plans-grid.spec.tsx
git commit -m "feat(web-planner): MyPlansGrid component"
```

---

## Task 10 — `/personal/plans` page

**Files:**

- Create: `apps/web-planner/src/app/personal/plans/page.tsx`
- Create: `apps/web-planner/src/app/personal/plans/page.spec.tsx`

- [ ] **Step 1: Write failing page test.**

```tsx
// page.spec.tsx
import { render, screen } from '@testing-library/react'
import MyPlansPage from './page'
import { usePersonalPlans } from '../../../lib/hooks/use-personal-plans'
import { useSession } from '@future/auth'

jest.mock('../../../lib/hooks/use-personal-plans')
jest.mock('@future/auth', () => ({ useSession: jest.fn() }))

describe('/personal/plans page', () => {
  const actorId = 'a1'
  const tenantId = 't1'

  beforeEach(() => {
    ;(useSession as jest.Mock).mockReturnValue({ actorId, tenantId })
  })

  it('renders the grid when plans load', () => {
    ;(usePersonalPlans as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'pp',
          name: 'Personal',
          memberCount: 1,
          myRole: 'owner',
          updatedAt: '',
          ownerActorId: actorId,
        },
        {
          id: 'ta',
          name: 'Alpha',
          memberCount: 3,
          myRole: 'editor',
          updatedAt: '',
          ownerActorId: null,
        },
      ],
      isLoading: false,
    })
    render(<MyPlansPage />)
    expect(screen.getByTestId('my-plans-grid')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
  })

  it('shows the fresh-user empty state when no plans exist', () => {
    ;(usePersonalPlans as jest.Mock).mockReturnValue({ data: [], isLoading: false })
    render(<MyPlansPage />)
    expect(screen.getByTestId('my-plans-empty-fresh')).toBeInTheDocument()
    expect(screen.getByText(/You don't have any plans yet/i)).toBeInTheDocument()
  })

  it("shows the personal-only empty state when only the actor's personal plan exists", () => {
    ;(usePersonalPlans as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'pp',
          name: 'Personal',
          memberCount: 1,
          myRole: 'owner',
          updatedAt: '',
          ownerActorId: actorId,
        },
      ],
      isLoading: false,
    })
    render(<MyPlansPage />)
    expect(screen.getByTestId('my-plans-empty-personal-only')).toBeInTheDocument()
    expect(screen.getByText(/personal workspace/i)).toBeInTheDocument()
    // grid is still rendered alongside the copy
    expect(screen.getByTestId('my-plans-grid')).toBeInTheDocument()
  })

  it('renders a skeleton while loading', () => {
    ;(usePersonalPlans as jest.Mock).mockReturnValue({ data: undefined, isLoading: true })
    render(<MyPlansPage />)
    expect(screen.getByTestId('my-plans-loading-skeleton')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/web-planner/src/app/personal/plans/page.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the page.**

```tsx
// page.tsx
'use client'

import { useSession } from '@future/auth'
import { Skeleton } from '@future/ui'
import { Folder } from 'lucide-react'
import { usePersonalPlans } from '../../../lib/hooks/use-personal-plans'
import { MyPlansGrid } from '../../../components/my-plans/my-plans-grid'

function LoadingSkeleton() {
  return (
    <main className="p-8" data-testid="my-plans-loading-skeleton" aria-label="Loading plans">
      <Skeleton className="h-6 w-32 rounded mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" style={{ opacity: 1 - (i - 1) * 0.2 }} />
        ))}
      </div>
    </main>
  )
}

function EmptyFresh() {
  return (
    <div
      data-testid="my-plans-empty-fresh"
      className="flex flex-col items-center justify-center py-32 text-center"
    >
      <Folder size={32} className="text-fg-subtle mb-4 opacity-40" />
      <p className="text-fg-muted text-sm font-510">You don't have any plans yet.</p>
      <p className="text-fg-subtle text-xs mt-1 max-w-md">
        Create a task to get started — we'll set up your personal workspace automatically.
      </p>
    </div>
  )
}

function PersonalOnlyCopy() {
  return (
    <div
      data-testid="my-plans-empty-personal-only"
      className="mb-6 rounded-lg border border-border-subtle bg-surface-muted p-4"
    >
      <p className="text-sm font-510 text-fg-primary">This is your personal workspace.</p>
      <p className="text-xs text-fg-muted mt-1">
        Create tasks here for work that doesn't belong to a team plan. Ask a team lead to add you to
        a plan to see team work.
      </p>
    </div>
  )
}

export default function MyPlansPage() {
  const session = useSession()
  const { data, isLoading } = usePersonalPlans()

  if (!session || isLoading || !data) {
    return <LoadingSkeleton />
  }

  if (data.length === 0) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-normal tracking-h2 text-fg-primary mb-6">My Plans</h1>
        <EmptyFresh />
      </main>
    )
  }

  const onlyPersonal = data.length === 1 && data[0].ownerActorId === session.actorId

  return (
    <main className="p-8">
      <h1 className="text-2xl font-normal tracking-h2 text-fg-primary mb-6">My Plans</h1>
      {onlyPersonal && <PersonalOnlyCopy />}
      <MyPlansGrid plans={data} actorId={session.actorId} />
    </main>
  )
}
```

- [ ] **Step 4: Run tests — expect pass.**

Run: `bun test apps/web-planner/src/app/personal/plans/page.spec.tsx`
Expected: PASS on all four cases.

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/app/personal/plans/page.tsx apps/web-planner/src/app/personal/plans/page.spec.tsx
git commit -m "feat(web-planner): /personal/plans route with card grid and empty states"
```

---

## Task 11 — `PlannerSidebarPlansGroup` dynamic sidebar component

**Files:**

- Create: `apps/web-planner/src/components/sidebar/planner-sidebar-plans-group.tsx`
- Create: `apps/web-planner/src/components/sidebar/planner-sidebar-plans-group.spec.tsx`

- [ ] **Step 1: Write failing tests.**

```tsx
// planner-sidebar-plans-group.spec.tsx
import { render, screen, within } from '@testing-library/react'
import { SidebarProvider } from '@future/ui'
import { PlannerSidebarPlansGroup } from './planner-sidebar-plans-group'
import { usePersonalPlans } from '../../lib/hooks/use-personal-plans'
import { useSession } from '@future/auth'

jest.mock('../../lib/hooks/use-personal-plans')
jest.mock('@future/auth', () => ({ useSession: jest.fn() }))
jest.mock('next/navigation', () => ({ usePathname: () => '/plans/ta/board' }))

function renderIn(ui: React.ReactElement) {
  return render(<SidebarProvider>{ui}</SidebarProvider>)
}

describe('PlannerSidebarPlansGroup', () => {
  const actorId = 'a1'

  beforeEach(() => {
    ;(useSession as jest.Mock).mockReturnValue({ actorId, tenantId: 't1' })
  })

  it('renders a skeleton while loading', () => {
    ;(usePersonalPlans as jest.Mock).mockReturnValue({ data: undefined, isLoading: true })
    renderIn(<PlannerSidebarPlansGroup />)
    expect(screen.getByTestId('sidebar-plans-skeleton')).toBeInTheDocument()
  })

  it('renders personal plan first with User icon, team plans alphabetically with Folder icon', () => {
    ;(usePersonalPlans as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'tb',
          name: 'Beta',
          memberCount: 2,
          myRole: 'viewer',
          updatedAt: '',
          ownerActorId: null,
        },
        {
          id: 'ta',
          name: 'Alpha',
          memberCount: 3,
          myRole: 'editor',
          updatedAt: '',
          ownerActorId: null,
        },
        {
          id: 'pp',
          name: 'Personal',
          memberCount: 1,
          myRole: 'owner',
          updatedAt: '',
          ownerActorId: actorId,
        },
      ],
      isLoading: false,
    })
    renderIn(<PlannerSidebarPlansGroup />)
    const items = screen.getAllByRole('link')
    expect(items.map((a) => a.textContent)).toEqual(['Personal', 'Alpha', 'Beta'])
    expect(items[0]).toHaveAttribute('href', '/plans/pp/board')
    expect(items[1]).toHaveAttribute('href', '/plans/ta/board')
  })

  it('marks the active plan via aria-current based on pathname', () => {
    ;(usePersonalPlans as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'ta',
          name: 'Alpha',
          memberCount: 3,
          myRole: 'editor',
          updatedAt: '',
          ownerActorId: null,
        },
      ],
      isLoading: false,
    })
    renderIn(<PlannerSidebarPlansGroup />)
    const active = screen.getByRole('link', { name: /Alpha/ })
    expect(active).toHaveAttribute('aria-current', 'page')
  })

  it('renders an empty-hint when no plans returned', () => {
    ;(usePersonalPlans as jest.Mock).mockReturnValue({ data: [], isLoading: false })
    renderIn(<PlannerSidebarPlansGroup />)
    expect(screen.getByTestId('sidebar-plans-empty')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect failure.**

Run: `bun test apps/web-planner/src/components/sidebar/planner-sidebar-plans-group.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```tsx
// planner-sidebar-plans-group.tsx
'use client'

import { usePathname } from 'next/navigation'
import { Folder, User } from 'lucide-react'
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSkeleton } from '@future/ui'
import { useSession } from '@future/auth'
import { usePersonalPlans, type PersonalPlanSummary } from '../../lib/hooks/use-personal-plans'

interface OrderedPlan extends PersonalPlanSummary {
  isPersonal: boolean
}

function orderPlans(plans: PersonalPlanSummary[], actorId: string): OrderedPlan[] {
  const decorated = plans.map((p) => ({ ...p, isPersonal: p.ownerActorId === actorId }))
  const personal = decorated.filter((p) => p.isPersonal)
  const team = decorated.filter((p) => !p.isPersonal).sort((a, b) => a.name.localeCompare(b.name))
  return [...personal, ...team]
}

export function PlannerSidebarPlansGroup() {
  const session = useSession()
  const pathname = usePathname()
  const { data, isLoading } = usePersonalPlans()

  if (!session || isLoading || !data) {
    return (
      <div data-testid="sidebar-plans-skeleton">
        <SidebarMenu>
          {[0, 1, 2].map((i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <p data-testid="sidebar-plans-empty" className="px-2 py-1 text-xs text-fg-subtle">
        No plans yet.
      </p>
    )
  }

  const ordered = orderPlans(data, session.actorId)

  return (
    <SidebarMenu>
      {ordered.map((plan) => {
        const href = `/plans/${plan.id}/board`
        const isActive = pathname === href || pathname.startsWith(href + '/')
        const Icon = plan.isPersonal ? User : Folder
        return (
          <SidebarMenuItem key={plan.id}>
            <SidebarMenuButton isActive={isActive} tooltip={plan.name} asChild>
              <a href={href} aria-current={isActive ? 'page' : undefined}>
                <Icon />
                <span>{plan.name}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
```

- [ ] **Step 4: Run tests — expect pass.**

Run: `bun test apps/web-planner/src/components/sidebar/planner-sidebar-plans-group.spec.tsx`
Expected: PASS on all four cases.

- [ ] **Step 5: Commit.**

```bash
git add apps/web-planner/src/components/sidebar/
git commit -m "feat(web-planner): PlannerSidebarPlansGroup dynamic sidebar component"
```

---

## Task 12 — Rewrite `navigation.ts`

**Files:**

- Modify: `apps/web-planner/src/navigation.ts`

- [ ] **Step 1: Replace the file contents.**

```tsx
// apps/web-planner/src/navigation.ts
import { Sun, ListChecks, Folder, ListTodo } from 'lucide-react'
import type { NavigationConfig } from '@future/app-layout'
import { PlannerSidebarPlansGroup } from './components/sidebar/planner-sidebar-plans-group'

export const plannerNavConfig: NavigationConfig = {
  navbar: { title: 'Planner', icon: ListTodo },
  sidebar: [
    {
      items: [
        {
          label: 'My Day',
          icon: Sun,
          href: '/personal/today/board',
          permission: 'planner:personal:read',
        },
        {
          label: 'My Tasks',
          icon: ListChecks,
          href: '/personal/tasks/board',
          permission: 'planner:personal:read',
        },
        {
          label: 'My Plans',
          icon: Folder,
          href: '/personal/plans',
          permission: 'planner:personal:read',
        },
      ],
    },
    {
      label: 'Plans',
      render: () => <PlannerSidebarPlansGroup />,
    },
  ],
}
```

Removed entirely: `Tasks`, `Reminders`, `KPI Linkage` stubs. These were placeholders with no routes behind them; Sub-project #5 will reintroduce them in their proper context.

- [ ] **Step 2: Update the navigation spec if one exists.**

Grep first: `grep -l "plannerNavConfig" apps/web-planner/src`. If a test exists (e.g. `navigation.spec.ts`), update it to assert the three Personal Hubs items plus the dynamic `render` group.

If no test exists, create `apps/web-planner/src/navigation.spec.tsx`:

```tsx
// navigation.spec.tsx
import { plannerNavConfig } from './navigation'

describe('plannerNavConfig', () => {
  it('has the three Personal Hubs items in the first group', () => {
    const first = plannerNavConfig.sidebar[0]
    if ('render' in first) throw new Error('expected first group to be static')
    expect(first.items.map((i) => i.label)).toEqual(['My Day', 'My Tasks', 'My Plans'])
    for (const item of first.items) {
      expect(item.permission).toBe('planner:personal:read')
    }
  })

  it('has a dynamic Plans group backed by a render function', () => {
    const second = plannerNavConfig.sidebar[1]
    expect('render' in second).toBe(true)
    if ('render' in second) {
      expect(second.label).toBe('Plans')
      expect(typeof second.render).toBe('function')
    }
  })

  it('does not contain the removed Tasks/Reminders/KPI stubs', () => {
    const labels = plannerNavConfig.sidebar.flatMap((g) =>
      'items' in g ? g.items.map((i) => i.label) : [],
    )
    expect(labels).not.toContain('Tasks')
    expect(labels).not.toContain('Reminders')
    expect(labels).not.toContain('KPI Linkage')
  })
})
```

- [ ] **Step 3: Run tests — expect pass.**

Run: `bun test apps/web-planner/src/navigation.spec.tsx`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/web-planner/src/navigation.ts apps/web-planner/src/navigation.spec.tsx
git commit -m "feat(web-planner): rewire planner nav — Personal Hubs + dynamic Plans group"
```

---

## Task 13 — Zone default landing route

**Files:**

- Modify: `apps/web-planner/src/app/page.tsx`

- [ ] **Step 1: Replace with the spec-mandated redirect.**

```tsx
// apps/web-planner/src/app/page.tsx
import { redirect } from 'next/navigation'

export default function PlannerPage() {
  redirect('/personal/tasks/board')
}
```

- [ ] **Step 2: Confirm by grep that no other route references `/plans` as landing.**

```bash
grep -rn "redirect('/plans')" apps/web-planner/src
```

Expected: no matches (existing `/plans/...` deep links are unrelated).

- [ ] **Step 3: Commit.**

```bash
git add apps/web-planner/src/app/page.tsx
git commit -m "feat(web-planner): zone default landing redirects to /personal/tasks/board"
```

---

## Task 14 — Placeholders for 3.3 and 3.4 targets

The planner zone's new default landing is `/personal/tasks/board`, but the real implementation ships in Plan 3.3. Add a placeholder at `/personal/tasks` (not the deeper `board` path — the placeholder is deliberately above the view routes). Same for `/personal/today`. Both redirect to `/personal/plans` so users who land on an unimplemented surface aren't stuck.

**Files:**

- Create: `apps/web-planner/src/app/personal/tasks/page.tsx`
- Create: `apps/web-planner/src/app/personal/today/page.tsx`

- [ ] **Step 1: Create the My Tasks placeholder.**

```tsx
// apps/web-planner/src/app/personal/tasks/page.tsx
import { redirect } from 'next/navigation'

/**
 * Placeholder landing for /personal/tasks until Plan 3.3 ships the
 * board/grid/schedule/charts routes. The sidebar link `/personal/tasks/board`
 * will 404 until 3.3 — that is intentional and the zone default redirect on
 * `/` also points to `/personal/tasks/board`; users reaching `/personal/tasks`
 * (no view suffix) fall through here instead of seeing an empty directory.
 */
export default function MyTasksPlaceholderPage() {
  redirect('/personal/plans')
}
```

- [ ] **Step 2: Create the My Day placeholder.**

```tsx
// apps/web-planner/src/app/personal/today/page.tsx
import { redirect } from 'next/navigation'

/**
 * Placeholder landing for /personal/today until Plan 3.4 ships the My Day views.
 */
export default function MyDayPlaceholderPage() {
  redirect('/personal/plans')
}
```

> **Why not route `/personal/tasks/board` straight to the placeholder?** The sidebar + zone-landing redirect both aim at the real Plan 3.3 destination. We want the 404 to remain visible in development until Plan 3.3 wires the real pages — so the failure mode stays obvious, not papered over. Casual navigation to `/personal/tasks` without a view suffix falls through gracefully.

- [ ] **Step 3: Commit.**

```bash
git add apps/web-planner/src/app/personal/tasks/page.tsx apps/web-planner/src/app/personal/today/page.tsx
git commit -m "feat(web-planner): placeholder redirects for /personal/tasks and /personal/today"
```

---

## Task 15 — End-to-end typecheck + unit-suite

- [ ] **Step 1: Rebuild workspace packages.**

```bash
bun run --filter "@future/*" build
```

Expected: all packages build. If `@future/app-layout` fails to resolve `@future/ui`, re-run to pick up Plan 3.1 changes.

- [ ] **Step 2: Full typecheck.**

```bash
bun run typecheck
```

Expected: no errors. If `web-admin` or other zones complain about `NavGroup`, Plan 3.1's union refactor is missing — stop and reconcile.

- [ ] **Step 3: Full unit suite.**

```bash
bun run test:unit
```

Expected: PASS. Coverage on the new files is ≥70%. Specifically verify the coverage report shows:

- `apps/web-planner/src/components/sidebar/planner-sidebar-plans-group.tsx`
- `apps/web-planner/src/components/my-plans/*.tsx`
- `apps/web-planner/src/components/personal-plan-badge.tsx`
- `apps/web-planner/src/app/personal/plans/page.tsx`
- `apps/web-planner/src/lib/hooks/use-personal-plans.ts`
- `apps/web-planner/src/lib/hooks/use-tenant-timezone.ts`
- `apps/api/src/modules/planner/interface/trpc/personal.router.ts`

- [ ] **Step 4: Integration suite (real Postgres).**

```bash
bun run db:up
bun run db:migrate
bun test apps/api/src/modules/planner/interface/trpc/personal-feature-flag.integration.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Manual smoke — keep the flag OFF first.**

```bash
bun run dev
```

As a non-admin user in a tenant where `planner_personal_enabled = false`:

- Zone landing (`/`) still redirects — now to `/personal/tasks/board` which 404s. Expected; 3.3 fills this.
- `/personal/plans` renders — but `personal.listPlans` returns FORBIDDEN. The page shows the loading skeleton indefinitely until React Query surfaces the error. Confirm in devtools Network tab that the tRPC call returns 403 with the FORBIDDEN code. This is the intended flag-off behavior; 3.2's user-visible surface is gated by the flag flip in Task 16.
- Sidebar: the three Personal Hubs nav items are hidden because the user lacks `planner:personal:read` in tenants where the flag is off (the permission is role-granted but the spec's feature-flag hierarchy models that read permission as off-when-flag-off; this is already handled by the permission filter in `SidebarRenderer`, given that Plan 3.1 grants the permission to the employee role only in flag-enabled tenants via the kernel grant logic).

> **Clarification:** the spec section 8.9 says "sidebar Personal Hubs items hidden (permission filter denies `planner:personal:read`)." Plan 3.1 already handles the gating mechanism — this plan does not need to add new filter logic. If Plan 3.1's implementation granted `planner:personal:read` unconditionally to `employee` regardless of the flag, add a follow-up adjustment here: wrap the sidebar nav-item filter check with a call to `plannerViewFlags.personalEnabled`. Ask before implementing if you encounter this ambiguity.

- [ ] **Step 6: Commit any lint/typecheck fixups.**

```bash
git status
# if clean, skip; else:
git commit -am "chore: typecheck + lint housekeeping for Plan 3.2"
```

---

## Task 16 — Feature-flag flip for SETA tenant

**Files:**

- Create: `packages/db/seeds/planner-personal-flag.sql`

- [ ] **Step 1: Locate the SETA tenant id.**

Run once against the target environment:

```sql
SELECT id FROM core.tenant WHERE slug = 'seta' OR name ILIKE '%SETA%';
```

Capture the uuid. If the SETA tenant uses a different slug in this environment, use `SELECT id, name, slug FROM core.tenant ORDER BY created_at ASC LIMIT 5;` and pick the internal tenant — then document your choice below.

- [ ] **Step 2: Write the seed.**

```sql
-- packages/db/seeds/planner-personal-flag.sql
--
-- Flips planner.personal.enabled = true for the SETA internal tenant.
-- Idempotent — re-runnable without effect once applied.
--
-- Resolution of the SETA tenant uses the canonical slug `seta`. If your
-- deployment uses a different slug, replace the WHERE clause accordingly.

INSERT INTO admin.tenant_settings (tenant_id, planner_personal_enabled, timezone)
SELECT t.id, true, 'Asia/Ho_Chi_Minh'
FROM core.tenant t
WHERE t.slug = 'seta'
ON CONFLICT (tenant_id) DO UPDATE
  SET planner_personal_enabled = true;
```

- [ ] **Step 3: Apply locally.**

```bash
psql "$DATABASE_URL" -f packages/db/seeds/planner-personal-flag.sql
```

Expected: `INSERT 0 1` or `UPDATE 1`. Verify:

```sql
SELECT tenant_id, planner_personal_enabled, timezone
FROM admin.tenant_settings
WHERE tenant_id = (SELECT id FROM core.tenant WHERE slug = 'seta');
```

Expected: `planner_personal_enabled = true`.

- [ ] **Step 4: Manual smoke — flag ON.**

Restart the dev server. Logged in as a SETA user:

- Sidebar shows **My Day**, **My Tasks**, **My Plans** in the first group.
- Sidebar shows the **Plans** section with the user's personal plan pinned first (icon `<User />`), team plans alphabetically (`<Folder />`), active plan highlighted when on `/plans/:id/board`.
- `/personal/plans` renders the card grid. Personal plan card shows the `<User />` + "Personal" badge; team plans alphabetical.
- Fresh tenant user (no plan membership, no personal plan) sees the "You don't have any plans yet" empty state.
- User with only a personal plan sees the "This is your personal workspace." copy plus the single card.

- [ ] **Step 5: Apply to staging/production via the normal seed deployment pipeline.**

Document the rollout procedure alongside the seed file:

```bash
# staging
psql "$STAGING_DATABASE_URL" -f packages/db/seeds/planner-personal-flag.sql
# production (coordinated with ops)
psql "$PROD_DATABASE_URL" -f packages/db/seeds/planner-personal-flag.sql
```

If the team uses a migration-based mechanism instead of a one-off seed script, convert the seed into a migration file — but the content is identical. Do not hardcode tenant uuids; the slug lookup is portable.

- [ ] **Step 6: Commit.**

```bash
git add packages/db/seeds/planner-personal-flag.sql
git commit -m "chore(db): seed planner.personal.enabled = true for SETA tenant"
```

---

## Task 17 — Open PR

- [ ] **Step 1: Verify everything.**

```bash
bun run typecheck
bun run test:unit
bun test apps/api/src/modules/planner/interface/trpc/
```

Expected: all green.

- [ ] **Step 2: Open PR.**

Title: `feat(planner): Plan 3.2 — My Plans + sidebar wiring`

Body: link to the spec, summary of what landed:

- `personal.listPlans` tRPC procedure + `assertPersonalEnabled` gate.
- `PlanSummary` now carries `ownerActorId`.
- `PlannerSidebarPlansGroup` dynamic sidebar component.
- `/personal/plans` page with card grid and two empty states.
- Planner nav rewired: Personal Hubs items; `Tasks` / `Reminders` / `KPI Linkage` stubs removed.
- Zone default landing → `/personal/tasks/board`.
- Placeholder redirects at `/personal/tasks` and `/personal/today` so users aren't stuck before Plan 3.3/3.4 ship those views.
- `usePersonalPlans` + `useTenantTimezone` hooks.
- Feature-flag flip seed for the SETA tenant.

Note: with this PR merged, the flag flip script must be applied in staging/production for the user-visible surface to appear.

---

## Self-review checklist before requesting PR review

- [ ] Every file in the File Map has been touched (created/modified per plan).
- [ ] TDD order preserved — failing test, then implementation, for every piece of new logic.
- [ ] Coverage ≥70% on every changed file (Vitest summary output).
- [ ] No `__tests__/` directory created anywhere.
- [ ] No `.js` extension on any relative import.
- [ ] No manual edits to `package.json` / `bun.lock` — no dependencies added in this plan.
- [ ] `plannerRouter.personal.listPlans` returns `FORBIDDEN` when `planner.personal.enabled` is off (integration test in place).
- [ ] `/personal/plans` renders the correct empty state in all three cases (no data, only personal, mixed).
- [ ] `PlannerSidebarPlansGroup` correctly pins personal plan first with `<User />`, team plans alphabetical with `<Folder />`, active plan highlighted.
- [ ] `navigation.ts` contains exactly three Personal Hubs items in the static group and one dynamic `Plans` group; the old `Tasks` / `Reminders` / `KPI Linkage` stubs are gone.
- [ ] Zone landing (`/`) redirects to `/personal/tasks/board`.
- [ ] Placeholder pages at `/personal/tasks` and `/personal/today` exist and redirect to `/personal/plans`.
- [ ] Seed file for SETA tenant flag-flip is idempotent; documented rollout procedure in the PR body.
- [ ] No `Promise.all` introduced in any DB-bound handler path.
- [ ] Only `@future/ui` primitives used for interactive surfaces; icons via `lucide-react`; no raw `<button>` / `<input>` / `<textarea>`.
- [ ] `<SidebarMenuSkeleton />` used for the sidebar loading state; `<Skeleton />` for page-level loading.

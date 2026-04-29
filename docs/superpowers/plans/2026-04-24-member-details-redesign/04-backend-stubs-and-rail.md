# Member Details Redesign — Plan 04: Backend Stubs + SideRail

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create two stub backend query handlers (`getDirectReports`, `getActivityFeed`), register them in the tRPC router and NestJS module, then build the `SideRail` component that calls them.

**Architecture:** Both backend handlers follow the CQRS pattern used throughout the people module — a query class + a `@QueryHandler`-decorated handler class. Both return hardcoded data and are marked with TODO comments for future wiring. The frontend `SideRail` uses `trpc as any` to call these endpoints and assembles four `SideCard` widgets.

**Tech Stack:** NestJS CQRS, tRPC (Zod schema), React, @future/ui (Skeleton), Vitest + @testing-library/react

---

## Files

| Action | Path                                                                            |
| ------ | ------------------------------------------------------------------------------- |
| Create | `apps/api/src/modules/people/application/queries/get-direct-reports.query.ts`   |
| Create | `apps/api/src/modules/people/application/queries/get-direct-reports.handler.ts` |
| Create | `apps/api/src/modules/people/application/queries/get-activity-feed.query.ts`    |
| Create | `apps/api/src/modules/people/application/queries/get-activity-feed.handler.ts`  |
| Modify | `apps/api/src/modules/people/interface/trpc/people.router.ts`                   |
| Modify | `apps/api/src/modules/people/people.module.ts`                                  |
| Create | `apps/web-people/src/components/profile/rail/SideRail.tsx`                      |
| Create | `apps/web-people/src/components/profile/rail/SideRail.spec.tsx`                 |

**Prerequisite:** Plans 01–03 complete.

---

### Task 1: GetDirectReports backend stub

**Files:**

- Create: `apps/api/src/modules/people/application/queries/get-direct-reports.query.ts`
- Create: `apps/api/src/modules/people/application/queries/get-direct-reports.handler.ts`

- [ ] **Step 1: Create the query class**

Create `apps/api/src/modules/people/application/queries/get-direct-reports.query.ts`:

```ts
export class GetDirectReportsQuery {
  constructor(
    public readonly employmentId: string,
    public readonly tenantId: string,
  ) {}
}
```

- [ ] **Step 2: Create the stub handler**

Create `apps/api/src/modules/people/application/queries/get-direct-reports.handler.ts`:

```ts
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { GetDirectReportsQuery } from './get-direct-reports.query'

export type DirectReportResult = {
  employmentId: string
  fullName: string
  jobTitle: string | null
  avatarUrl: string | null
}

// TODO: replace with real job_assignment query once activity logging is wired
@QueryHandler(GetDirectReportsQuery)
export class GetDirectReportsHandler implements IQueryHandler<
  GetDirectReportsQuery,
  DirectReportResult[]
> {
  async execute(_query: GetDirectReportsQuery): Promise<DirectReportResult[]> {
    return []
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/application/queries/get-direct-reports.query.ts \
        apps/api/src/modules/people/application/queries/get-direct-reports.handler.ts
git commit -m "feat(api): add GetDirectReports stub query handler"
```

---

### Task 2: GetActivityFeed backend stub

**Files:**

- Create: `apps/api/src/modules/people/application/queries/get-activity-feed.query.ts`
- Create: `apps/api/src/modules/people/application/queries/get-activity-feed.handler.ts`

- [ ] **Step 1: Create the query class**

Create `apps/api/src/modules/people/application/queries/get-activity-feed.query.ts`:

```ts
export class GetActivityFeedQuery {
  constructor(
    public readonly employmentId: string,
    public readonly tenantId: string,
    public readonly limit: number,
    public readonly cursor: string | undefined,
  ) {}
}
```

- [ ] **Step 2: Create the stub handler**

Create `apps/api/src/modules/people/application/queries/get-activity-feed.handler.ts`:

```ts
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { GetActivityFeedQuery } from './get-activity-feed.query'

export type ActivityFeedResult = {
  events: ActivityEventResult[]
  nextCursor: string | null
}

export type ActivityEventResult = {
  id: string
  eventType: string
  description: string
  actorName: string
  occurredAt: string
}

// TODO: replace with real outbox_event query once activity logging is wired
@QueryHandler(GetActivityFeedQuery)
export class GetActivityFeedHandler implements IQueryHandler<
  GetActivityFeedQuery,
  ActivityFeedResult
> {
  async execute(_query: GetActivityFeedQuery): Promise<ActivityFeedResult> {
    return {
      events: [
        {
          id: 'evt-1',
          eventType: 'promotion',
          description: 'Promoted to Staff Engineer · L6',
          actorName: 'Mei Chen',
          occurredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'evt-2',
          eventType: 'document',
          description: 'Document uploaded: Tax 2025',
          actorName: 'Diego Ribeiro',
          occurredAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'evt-3',
          eventType: 'org_change',
          description: 'Manager changed to Mei Chen',
          actorName: 'Ana Silva',
          occurredAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
      nextCursor: null,
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/people/application/queries/get-activity-feed.query.ts \
        apps/api/src/modules/people/application/queries/get-activity-feed.handler.ts
git commit -m "feat(api): add GetActivityFeed stub query handler"
```

---

### Task 3: Register handlers in router and module

**Files:**

- Modify: `apps/api/src/modules/people/interface/trpc/people.router.ts`
- Modify: `apps/api/src/modules/people/people.module.ts`

- [ ] **Step 1: Add imports and routes to people.router.ts**

At the top of `apps/api/src/modules/people/interface/trpc/people.router.ts`, add these imports after the existing query imports:

```ts
import { GetDirectReportsQuery } from '../../application/queries/get-direct-reports.query'
import { GetActivityFeedQuery } from '../../application/queries/get-activity-feed.query'
```

Inside `createPeopleRouter`, add these two routes after the `getJobHistory` route:

```ts
    getDirectReports: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(z.object({ employmentId: z.string().uuid() }))
      .query(async ({ ctx, input }: { ctx: AuthContext; input: { employmentId: string } }) => {
        return svc().query(new GetDirectReportsQuery(input.employmentId, ctx.tenantId))
      }),

    getActivityFeed: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(
        z.object({
          employmentId: z.string().uuid(),
          limit: z.number().int().min(1).max(50).default(20),
          cursor: z.string().optional(),
        }),
      )
      .query(
        async ({
          ctx,
          input,
        }: {
          ctx: AuthContext
          input: { employmentId: string; limit: number; cursor?: string }
        }) => {
          return svc().query(
            new GetActivityFeedQuery(input.employmentId, ctx.tenantId, input.limit, input.cursor),
          )
        },
      ),
```

- [ ] **Step 2: Register handlers in people.module.ts**

In `apps/api/src/modules/people/people.module.ts`, add these two imports near the other query handler imports:

```ts
import { GetDirectReportsHandler } from './application/queries/get-direct-reports.handler'
import { GetActivityFeedHandler } from './application/queries/get-activity-feed.handler'
```

In the `providers` array, add them alongside the other new query handlers (near `GetJobHistoryHandler`):

```ts
    GetDirectReportsHandler,
    GetActivityFeedHandler,
```

- [ ] **Step 3: Typecheck the API**

```bash
cd apps/api && bun run typecheck
```

Expected: no errors related to the new handlers or routes.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/people/interface/trpc/people.router.ts \
        apps/api/src/modules/people/people.module.ts
git commit -m "feat(api): register getDirectReports and getActivityFeed stub endpoints"
```

---

### Task 4: SideRail component

**Files:**

- Create: `apps/web-people/src/components/profile/rail/SideRail.spec.tsx`
- Create: `apps/web-people/src/components/profile/rail/SideRail.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web-people/src/components/profile/rail/SideRail.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { SideRail } from './SideRail'
import type { EmployeeProfile } from '../../../lib/types'

const { mockGetDirectReports, mockGetActivityFeed } = vi.hoisted(() => ({
  mockGetDirectReports: vi.fn().mockResolvedValue([]),
  mockGetActivityFeed: vi.fn().mockResolvedValue({ events: [], nextCursor: null }),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    people: {
      getDirectReports: { query: mockGetDirectReports },
      getActivityFeed: { query: mockGetActivityFeed },
    },
  },
}))

vi.mock('../cards/SideCard', () => ({
  SideCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid={`side-card-${title.toLowerCase().replace(' ', '-')}`}>{children}</div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const baseProfile: EmployeeProfile = {
  personProfile: {
    id: 'pp-1',
    actorId: 'actor-1',
    familyName: 'Johnson',
    givenName: 'Alice',
    middleName: null,
    fullName: 'Alice Johnson',
    preferredName: null,
    nameDisplayOrder: 'given_first',
    dateOfBirth: null,
    gender: null,
    nationality: null,
    maritalStatus: null,
    photoUrl: null,
  },
  employment: {
    id: 'emp-1',
    employeeCode: 'E-001',
    companyEmail: 'alice@co.com',
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'SG',
    employmentStatus: 'active',
    hireDate: '2023-01-15',
    terminationDate: null,
    terminationReason: null,
    workArrangement: null,
  },
  currentJob: {
    id: 'job-1',
    jobProfileId: 'jp-1',
    jobTitle: 'Senior Engineer',
    jobLevel: 'L5',
    jobFamilyName: 'Engineering',
    departmentId: 'dept-1',
    departmentName: 'Engineering',
    locationId: null,
    locationName: null,
    costCenter: null,
    managerId: 'mgr-1',
    managerName: 'Bob Smith',
    effectiveDate: '2023-01-15',
  },
  emergencyContacts: [],
  addresses: [],
  countryFields: [],
  customFields: [],
  bankDetails: null,
  probation: null,
  completenessScore: 82,
  completenessMissing: ['dateOfBirth', 'address'],
}

describe('SideRail', () => {
  it('renders Completeness widget with score', () => {
    render(<SideRail profile={baseProfile} employmentId="emp-1" onViewAll={() => {}} />)
    expect(screen.getByText('82')).toBeTruthy()
  })

  it('renders Reports to widget with manager name', () => {
    render(<SideRail profile={baseProfile} employmentId="emp-1" onViewAll={() => {}} />)
    expect(screen.getByText('Bob Smith')).toBeTruthy()
  })

  it('calls getDirectReports with employmentId', async () => {
    render(<SideRail profile={baseProfile} employmentId="emp-1" onViewAll={() => {}} />)
    await waitFor(() =>
      expect(mockGetDirectReports).toHaveBeenCalledWith({ employmentId: 'emp-1' }),
    )
  })

  it('calls getActivityFeed with employmentId and limit 3', async () => {
    render(<SideRail profile={baseProfile} employmentId="emp-1" onViewAll={() => {}} />)
    await waitFor(() =>
      expect(mockGetActivityFeed).toHaveBeenCalledWith({
        employmentId: 'emp-1',
        limit: 3,
      }),
    )
  })

  it('shows direct reports when loaded', async () => {
    mockGetDirectReports.mockResolvedValueOnce([
      { employmentId: 'emp-2', fullName: 'Jane Doe', jobTitle: 'Engineer', avatarUrl: null },
    ])
    render(<SideRail profile={baseProfile} employmentId="emp-1" onViewAll={() => {}} />)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "SideRail"
```

Expected: FAIL with "Cannot find module './SideRail'".

- [ ] **Step 3: Create SideRail.tsx**

Create `apps/web-people/src/components/profile/rail/SideRail.tsx`:

```tsx
'use client'

import * as React from 'react'
import { Skeleton } from '@future/ui'
import { SideCard } from '../cards/SideCard'
import type { EmployeeProfile, DirectReport, ActivityEvent } from '../../../lib/types'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface SideRailProps {
  profile: EmployeeProfile
  employmentId: string
  onViewAll: () => void
}

export function SideRail({ profile, employmentId, onViewAll }: SideRailProps) {
  const { completenessScore, completenessMissing, currentJob } = profile

  const [directReports, setDirectReports] = React.useState<DirectReport[]>([])
  const [reportsLoading, setReportsLoading] = React.useState(true)
  const [activityEvents, setActivityEvents] = React.useState<ActivityEvent[]>([])

  React.useEffect(() => {
    void (async () => {
      setReportsLoading(true)
      try {
        const result = await anyTrpc.people.getDirectReports.query({ employmentId })
        setDirectReports(result ?? [])
      } finally {
        setReportsLoading(false)
      }
    })()
  }, [employmentId])

  React.useEffect(() => {
    void (async () => {
      const result = await anyTrpc.people.getActivityFeed.query({
        employmentId,
        limit: 3,
      })
      setActivityEvents(result?.events ?? [])
    })()
  }, [employmentId])

  function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return '1 day ago'
    if (days < 7) return `${days} days ago`
    const weeks = Math.floor(days / 7)
    if (weeks === 1) return '1 week ago'
    return `${weeks} weeks ago`
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Completeness */}
      <SideCard title="Completeness">
        <div className="mb-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-510 tracking-tight text-foreground">
            {completenessScore}
          </span>
          <span className="text-sm text-muted-foreground">%</span>
          {completenessMissing.length > 0 && (
            <span className="ml-auto rounded-sm bg-accent/10 px-1.5 py-0.5 text-[10px] font-510 text-accent">
              {completenessMissing.length} missing
            </span>
          )}
        </div>
        <div className="mb-2 h-1 overflow-hidden rounded-full bg-secondary/30">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent/70 to-accent"
            style={{ width: `${completenessScore}%` }}
          />
        </div>
        {completenessMissing.map((field) => (
          <div
            key={field}
            className="flex items-center gap-1.5 py-0.5 text-[11px] text-muted-foreground"
          >
            <span className="h-1 w-1 rounded-full bg-amber-500" />
            {field}
          </div>
        ))}
      </SideCard>

      {/* Reports to */}
      {currentJob?.managerName && (
        <SideCard title="Reports to">
          <div className="flex items-center gap-2 py-1">
            <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-secondary/50 text-[10px] font-510 text-secondary-foreground">
              {currentJob.managerName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-510 text-foreground">{currentJob.managerName}</p>
            </div>
          </div>
        </SideCard>
      )}

      {/* Direct reports */}
      <SideCard title="Direct reports" count={reportsLoading ? undefined : directReports.length}>
        {reportsLoading ? (
          <Skeleton className="h-6 w-full" />
        ) : directReports.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No direct reports.</p>
        ) : (
          directReports.map((r) => (
            <div key={r.employmentId} className="flex items-center gap-2 py-1">
              <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-secondary/50 text-[9px] font-510 text-secondary-foreground">
                {r.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-secondary-foreground">{r.fullName}</p>
                {r.jobTitle && (
                  <p className="truncate text-[10px] text-muted-foreground">{r.jobTitle}</p>
                )}
              </div>
            </div>
          ))
        )}
      </SideCard>

      {/* Recent activity */}
      <SideCard title="Recent activity">
        {activityEvents.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No recent activity.</p>
        ) : (
          <>
            {activityEvents.map((evt, i) => (
              <div key={evt.id} className={`py-1.5 ${i > 0 ? 'border-t border-border/40' : ''}`}>
                <p className="text-[11px] text-secondary-foreground">{evt.description}</p>
                <p className="text-[10px] text-muted-foreground">{relativeTime(evt.occurredAt)}</p>
              </div>
            ))}
            <button onClick={onViewAll} className="mt-1 text-[11px] text-accent hover:underline">
              View all
            </button>
          </>
        )}
      </SideCard>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 5 "SideRail"
```

Expected: all SideRail tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd apps/web-people && bun run test:unit
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web-people/src/components/profile/rail/
git commit -m "feat(web-people): add SideRail with completeness, reports-to, direct reports, activity widgets"
```

# Member Details Redesign — Plan 08: TabCompensation + Stub Tabs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `TabCompensation` (3-col current block + history timeline, replaces TabContracts), then build two UI stubs — `TabChangeRequests` (list + detail panel with hardcoded mock data) and `TabActivity` (event list stub). Delete old root-level tab files.

**Architecture:** `TabCompensation` fetches from the existing `people.listContractVersions` endpoint. `TabChangeRequests` and `TabActivity` use no backend — all data is hardcoded in the component. Both stubs have `// TODO` markers for future wiring.

**Tech Stack:** React, TypeScript, `ProfileCard` from `../cards/ProfileCard`, @future/ui (Button, Badge, Skeleton), @future/ui/icons (Edit, Plus, Check, X, FileText, Pencil, Users, File), Vitest + @testing-library/react

---

## Files

| Action | Path                                                                     |
| ------ | ------------------------------------------------------------------------ |
| Create | `apps/web-people/src/components/profile/tabs/TabCompensation.tsx`        |
| Create | `apps/web-people/src/components/profile/tabs/TabCompensation.spec.tsx`   |
| Create | `apps/web-people/src/components/profile/tabs/TabChangeRequests.tsx`      |
| Create | `apps/web-people/src/components/profile/tabs/TabChangeRequests.spec.tsx` |
| Create | `apps/web-people/src/components/profile/tabs/TabActivity.tsx`            |
| Create | `apps/web-people/src/components/profile/tabs/TabActivity.spec.tsx`       |
| Delete | `apps/web-people/src/components/profile/TabChangeRequests.tsx`           |

**Prerequisite:** Plans 01, 03 complete.

---

### Task 1: TabCompensation

**Files:**

- Create: `apps/web-people/src/components/profile/tabs/TabCompensation.spec.tsx`
- Create: `apps/web-people/src/components/profile/tabs/TabCompensation.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web-people/src/components/profile/tabs/TabCompensation.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { TabCompensation } from './TabCompensation'
import type { ContractVersion } from '../../../lib/types'

const { mockListContracts } = vi.hoisted(() => ({
  mockListContracts: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: { people: { listContractVersions: { query: mockListContracts } } },
}))

vi.mock('../cards/ProfileCard', () => ({
  ProfileCard: ({
    title,
    locked,
    children,
  }: {
    title: string
    locked?: boolean
    children: React.ReactNode
  }) => (
    <div data-testid={`card-${title.toLowerCase()}`}>
      {locked && <span data-testid="locked" />}
      {children}
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const activeContract: ContractVersion = {
  id: 'cv-1',
  contractType: 'indefinite',
  status: 'active',
  startDate: '2023-07-15',
  endDate: null,
  baseSalary: 168000,
  currency: 'USD',
  signedDate: '2023-07-10',
  documentId: null,
}

describe('TabCompensation', () => {
  it('shows lock placeholder when canViewSalary is false', async () => {
    mockListContracts.mockResolvedValueOnce([activeContract])
    render(
      <TabCompensation
        employmentId="emp-1"
        canViewSalary={false}
        canCreateContract={false}
        canEdit={false}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('locked')).toBeTruthy())
  })

  it('shows salary amount when canViewSalary is true', async () => {
    mockListContracts.mockResolvedValueOnce([activeContract])
    render(
      <TabCompensation
        employmentId="emp-1"
        canViewSalary={true}
        canCreateContract={false}
        canEdit={false}
      />,
    )
    await waitFor(() => expect(screen.getByText('168,000')).toBeTruthy())
  })

  it('renders contract history section', async () => {
    mockListContracts.mockResolvedValueOnce([activeContract])
    render(
      <TabCompensation
        employmentId="emp-1"
        canViewSalary={false}
        canCreateContract={false}
        canEdit={false}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('card-history')).toBeTruthy())
  })

  it('shows Add contract button when canCreateContract is true', async () => {
    mockListContracts.mockResolvedValueOnce([])
    render(
      <TabCompensation
        employmentId="emp-1"
        canViewSalary={false}
        canCreateContract={true}
        canEdit={false}
      />,
    )
    await waitFor(() => expect(screen.getByText('Add contract')).toBeTruthy())
  })

  it('hides Add contract button when canCreateContract is false', async () => {
    mockListContracts.mockResolvedValueOnce([])
    render(
      <TabCompensation
        employmentId="emp-1"
        canViewSalary={false}
        canCreateContract={false}
        canEdit={false}
      />,
    )
    await waitFor(() => expect(screen.queryByText('Add contract')).toBeNull())
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "TabCompensation"
```

Expected: FAIL with "Cannot find module './TabCompensation'".

- [ ] **Step 3: Create tabs/TabCompensation.tsx**

Create `apps/web-people/src/components/profile/tabs/TabCompensation.tsx`:

```tsx
'use client'

import * as React from 'react'
import { Button, Badge, Skeleton } from '@future/ui'
import { Edit, Plus, FileText } from '@future/ui/icons'
import { ProfileCard } from '../cards/ProfileCard'
import type { ContractVersion } from '../../../lib/types'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface TabCompensationProps {
  employmentId: string
  canViewSalary: boolean
  canCreateContract: boolean
  canEdit: boolean
}

const CONTRACT_STATUS_VARIANT: Record<
  string,
  'default' | 'subtle' | 'info' | 'warning' | 'destructive'
> = {
  active: 'default',
  expired: 'subtle',
  superseded: 'subtle',
  draft: 'info',
}

export function TabCompensation({
  employmentId,
  canViewSalary,
  canCreateContract,
  canEdit,
}: TabCompensationProps) {
  const [contracts, setContracts] = React.useState<ContractVersion[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await anyTrpc.people.listContractVersions.query({ employmentId })
        setContracts(Array.isArray(result) ? result : [])
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  if (isLoading) {
    return (
      <div className="grid grid-cols-[1fr_300px] gap-8 p-6">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )
  }

  const activeContract = contracts.find((c) => c.status === 'active')
  const history = [...contracts].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  )

  return (
    <div className="grid grid-cols-[1fr_300px] gap-8 p-6">
      {/* Main column */}
      <div className="flex flex-col gap-5">
        {/* Current */}
        <ProfileCard
          title="Current"
          locked={!canViewSalary}
          action={canViewSalary && canEdit ? { label: 'Adjust', onClick: () => {} } : undefined}
        >
          {!canViewSalary ? (
            <p className="py-1.5 text-xs text-muted-foreground">
              Restricted. You can view salary with{' '}
              <code className="font-mono text-secondary-foreground">people:salary:read</code>{' '}
              permission.
            </p>
          ) : activeContract ? (
            <div className="grid grid-cols-3 gap-4 py-2">
              <div>
                <p className="mb-1 text-[10px] font-510 uppercase tracking-widest text-muted-foreground">
                  Base salary
                </p>
                <p className="text-xl font-510 tracking-tight text-foreground">
                  {activeContract.baseSalary?.toLocaleString() ?? '—'}
                </p>
                {activeContract.currency && (
                  <p className="text-[11px] text-muted-foreground">{activeContract.currency}</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-[10px] font-510 uppercase tracking-widest text-muted-foreground">
                  Type
                </p>
                <p className="text-xl font-510 tracking-tight text-foreground capitalize">
                  {activeContract.contractType.replace('_', ' ')}
                </p>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-510 uppercase tracking-widest text-muted-foreground">
                  Signed
                </p>
                <p className="text-sm text-secondary-foreground">
                  {activeContract.signedDate
                    ? new Date(activeContract.signedDate).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—'}
                </p>
              </div>
            </div>
          ) : (
            <p className="py-1.5 text-xs text-muted-foreground">No active contract.</p>
          )}
        </ProfileCard>

        {/* History */}
        <ProfileCard title="History">
          {history.length === 0 ? (
            <p className="py-1.5 text-xs text-muted-foreground">No contract history.</p>
          ) : (
            <div className="space-y-0">
              {history.map((contract, i) => (
                <div
                  key={contract.id}
                  className={`flex items-start justify-between py-3 ${
                    i > 0 ? 'border-t border-border/40' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="subtle" className="text-[10px]">
                        {contract.contractType.replace('_', ' ')}
                      </Badge>
                      <Badge
                        variant={CONTRACT_STATUS_VARIANT[contract.status] ?? 'subtle'}
                        className="text-[10px]"
                      >
                        {contract.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-secondary-foreground">
                      {new Date(contract.startDate).toLocaleDateString('en-GB')}
                      {contract.endDate
                        ? ` – ${new Date(contract.endDate).toLocaleDateString('en-GB')}`
                        : ' – Indefinite'}
                    </p>
                    {canViewSalary && contract.baseSalary != null && (
                      <p className="text-xs text-muted-foreground">
                        {contract.currency} {contract.baseSalary.toLocaleString()}
                      </p>
                    )}
                  </div>
                  {contract.documentId && (
                    <Button variant="ghost" size="sm" className="gap-1.5 h-7">
                      <FileText className="h-3 w-3" />
                      View
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ProfileCard>

        {canCreateContract && (
          <Button variant="outline" size="sm" className="w-fit gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add contract
          </Button>
        )}
      </div>

      {/* Right side rail */}
      <div className="flex flex-col gap-4">
        {canViewSalary && activeContract?.baseSalary != null && (
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="mb-1 text-[10px] font-510 uppercase tracking-widest text-muted-foreground">
              Total comp
            </p>
            <p className="text-2xl font-510 tracking-tight text-foreground">
              {activeContract.baseSalary.toLocaleString()}
            </p>
            <p className="text-[11px] text-muted-foreground">{activeContract.currency} / year</p>
          </div>
        )}
        {activeContract && (
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="mb-1.5 text-[10px] font-510 uppercase tracking-widest text-muted-foreground">
              Contract
            </p>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-[10px]">
                Active
              </Badge>
              <span className="text-xs text-muted-foreground capitalize">
                {activeContract.contractType.replace('_', ' ')}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Since {new Date(activeContract.startDate).toLocaleDateString('en-GB')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 5 "TabCompensation"
```

Expected: all TabCompensation tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web-people/src/components/profile/tabs/TabCompensation.tsx \
        apps/web-people/src/components/profile/tabs/TabCompensation.spec.tsx
git commit -m "feat(web-people): add TabCompensation with 3-col current block and history"
```

---

### Task 2: TabChangeRequests (UI stub)

**Files:**

- Create: `apps/web-people/src/components/profile/tabs/TabChangeRequests.spec.tsx`
- Create: `apps/web-people/src/components/profile/tabs/TabChangeRequests.tsx`
- Delete: `apps/web-people/src/components/profile/TabChangeRequests.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web-people/src/components/profile/tabs/TabChangeRequests.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabChangeRequests } from './TabChangeRequests'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TabChangeRequests', () => {
  it('renders filter pills: Pending, Approved, Rejected, All', () => {
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('Approved')).toBeTruthy()
    expect(screen.getByText('Rejected')).toBeTruthy()
    expect(screen.getByText('All')).toBeTruthy()
  })

  it('renders mock change request rows', () => {
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    // At least one row must be visible (from hardcoded data)
    expect(screen.getByText('Job title')).toBeTruthy()
  })

  it('shows detail panel on row click', async () => {
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    const rows = screen.getAllByRole('button', { name: /row/i })
    // Click the first request row (first interactive row item)
    const firstRow = document.querySelector('[data-testid="cr-row"]') as HTMLElement
    if (firstRow) await userEvent.click(firstRow)
    expect(screen.getByText('Request detail')).toBeTruthy()
  })

  it('shows Approve and Reject buttons when canApprove is true', () => {
    render(<TabChangeRequests employmentId="emp-1" canApprove={true} />)
    expect(screen.getByText('Approve')).toBeTruthy()
    expect(screen.getByText('Reject')).toBeTruthy()
  })

  it('hides Approve and Reject buttons when canApprove is false', () => {
    render(<TabChangeRequests employmentId="emp-1" canApprove={false} />)
    expect(screen.queryByText('Approve')).toBeNull()
    expect(screen.queryByText('Reject')).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "tabs/TabChangeRequests"
```

Expected: FAIL with "Cannot find module './TabChangeRequests'".

- [ ] **Step 3: Create tabs/TabChangeRequests.tsx**

Create `apps/web-people/src/components/profile/tabs/TabChangeRequests.tsx`:

```tsx
'use client'

import * as React from 'react'
import { Button, Badge } from '@future/ui'
import { Check, X } from '@future/ui/icons'

// TODO: replace with real people.listChangeRequests query once backend is wired

interface MockChangeRequest {
  id: string
  field: string
  from: string
  to: string
  submitterName: string
  reason: string
  age: string
  priority: 'high' | 'normal'
  status: 'pending' | 'approved' | 'rejected'
}

const MOCK_REQUESTS: MockChangeRequest[] = [
  {
    id: 'cr-001',
    field: 'Job title',
    from: 'Senior Engineer',
    to: 'Staff Engineer',
    submitterName: 'Alice Johnson',
    reason: 'Post-promotion title alignment.',
    age: '2 days',
    priority: 'high',
    status: 'pending',
  },
  {
    id: 'cr-002',
    field: 'Work arrangement',
    from: 'On-site',
    to: 'Hybrid — 3 days',
    submitterName: 'Alice Johnson',
    reason: 'Agreed with manager in Q1 review.',
    age: '5 days',
    priority: 'normal',
    status: 'pending',
  },
  {
    id: 'cr-003',
    field: 'Department',
    from: 'Infrastructure',
    to: 'Platform',
    submitterName: 'Kai Tanaka',
    reason: 'Internal transfer.',
    age: '2 weeks',
    priority: 'normal',
    status: 'approved',
  },
]

type FilterType = 'pending' | 'approved' | 'rejected' | 'all'

const FILTER_COUNTS: Record<FilterType, number> = {
  pending: 2,
  approved: 1,
  rejected: 0,
  all: 3,
}

interface TabChangeRequestsProps {
  employmentId: string
  canApprove: boolean
}

export function TabChangeRequests({ canApprove }: TabChangeRequestsProps) {
  const [filter, setFilter] = React.useState<FilterType>('pending')
  const [selectedId, setSelectedId] = React.useState<string>(MOCK_REQUESTS[0]!.id)

  const filtered = MOCK_REQUESTS.filter((r) => filter === 'all' || r.status === filter)
  const active = MOCK_REQUESTS.find((r) => r.id === selectedId) ?? MOCK_REQUESTS[0]!

  return (
    <div className="grid h-full grid-cols-[1fr_420px]">
      {/* List panel */}
      <div>
        {/* Filter pills */}
        <div className="flex gap-1.5 border-b border-border px-4 py-2.5">
          {(['pending', 'approved', 'rejected', 'all'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-xs font-510 transition-colors ${
                filter === f
                  ? 'border border-border bg-secondary/40 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1.5 text-[10px] text-muted-foreground">{FILTER_COUNTS[f]}</span>
            </button>
          ))}
        </div>

        {/* Request rows */}
        <div>
          {filtered.map((req) => (
            <div
              key={req.id}
              data-testid="cr-row"
              onClick={() => setSelectedId(req.id)}
              className={`cursor-pointer border-b border-border/60 px-4 py-3 transition-colors ${
                selectedId === req.id
                  ? 'border-l-2 border-l-accent bg-accent/5'
                  : 'border-l-2 border-l-transparent hover:bg-secondary/10'
              }`}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-510 text-foreground">{req.submitterName}</p>
                </div>
                {req.priority === 'high' && (
                  <Badge variant="warning" className="text-[10px]">
                    High
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground">{req.age}</span>
              </div>
              <p className="text-xs text-secondary-foreground">
                <span className="text-muted-foreground">{req.field}:</span>{' '}
                <span className="text-muted-foreground line-through">{req.from}</span>{' '}
                <span className="text-muted-foreground">→</span>{' '}
                <span className="font-510 text-foreground">{req.to}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{req.reason}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <aside className="border-l border-border bg-card/50 p-5 overflow-auto">
        <p className="mb-3 text-[10px] font-510 uppercase tracking-widest text-muted-foreground">
          Request detail
        </p>

        <div className="mb-4">
          <p className="text-sm font-510 text-foreground">{active.submitterName}</p>
          <p className="text-[11px] text-muted-foreground">ID: {active.id.toUpperCase()}</p>
        </div>

        {/* FROM / TO */}
        <div className="mb-4 rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-[10px] font-510 uppercase tracking-widest text-muted-foreground">
            {active.field}
          </p>
          <div className="space-y-2">
            <div className="rounded border border-red-500/15 bg-red-500/5 p-2">
              <p className="mb-0.5 text-[9px] font-510 text-red-400">FROM</p>
              <p className="text-xs text-secondary-foreground line-through">{active.from}</p>
            </div>
            <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2">
              <p className="mb-0.5 text-[9px] font-510 text-emerald-400">TO</p>
              <p className="text-xs font-510 text-foreground">{active.to}</p>
            </div>
          </div>
        </div>

        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted-foreground">Requested by</span>
          <span className="text-secondary-foreground">{active.submitterName}</span>
        </div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted-foreground">Reason</span>
          <span className="text-secondary-foreground">{active.reason}</span>
        </div>
        <div className="mb-4 flex justify-between text-xs">
          <span className="text-muted-foreground">Submitted</span>
          <span className="text-secondary-foreground">{active.age} ago</span>
        </div>

        {canApprove && (
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => console.log('Approve', active.id)}
            >
              <Check className="h-3.5 w-3.5" />
              Approve
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => console.log('Reject', active.id)}
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </Button>
          </div>
        )}
      </aside>
    </div>
  )
}
```

- [ ] **Step 4: Delete old root-level TabChangeRequests**

```bash
rm apps/web-people/src/components/profile/TabChangeRequests.tsx
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 5 "TabChangeRequests"
```

Expected: all TabChangeRequests tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web-people/src/components/profile/tabs/TabChangeRequests.tsx \
        apps/web-people/src/components/profile/tabs/TabChangeRequests.spec.tsx
git add -u apps/web-people/src/components/profile/TabChangeRequests.tsx
git commit -m "feat(web-people): rewrite TabChangeRequests as UI stub with list+detail panel"
```

---

### Task 3: TabActivity (UI stub)

**Files:**

- Create: `apps/web-people/src/components/profile/tabs/TabActivity.spec.tsx`
- Create: `apps/web-people/src/components/profile/tabs/TabActivity.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web-people/src/components/profile/tabs/TabActivity.spec.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TabActivity } from './TabActivity'

afterEach(() => {
  cleanup()
})

describe('TabActivity', () => {
  it('renders 5 mock activity events', () => {
    render(<TabActivity employmentId="emp-1" />)
    const events = document.querySelectorAll('[data-testid="activity-event"]')
    expect(events.length).toBe(5)
  })

  it('renders a disabled Load more button', () => {
    render(<TabActivity employmentId="emp-1" />)
    const btn = screen.getByText('No more events')
    expect(btn).toBeTruthy()
    // It should be a disabled button
    const button = btn.closest('button')
    expect(button?.disabled).toBe(true)
  })

  it('renders event descriptions', () => {
    render(<TabActivity employmentId="emp-1" />)
    expect(screen.getByText(/Promoted to Staff Engineer/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "TabActivity"
```

Expected: FAIL with "Cannot find module './TabActivity'".

- [ ] **Step 3: Create tabs/TabActivity.tsx**

Create `apps/web-people/src/components/profile/tabs/TabActivity.tsx`:

```tsx
'use client'

import { Pencil, Check, File, Users, FileText } from '@future/ui/icons'

// TODO: replace with real people.getActivityFeed query once backend is wired

interface MockActivityEvent {
  id: string
  eventType: 'edit' | 'approval' | 'document' | 'org_change' | 'contract'
  description: string
  actorName: string
  occurredAt: string
}

const MOCK_EVENTS: MockActivityEvent[] = [
  {
    id: 'evt-1',
    eventType: 'org_change',
    description: 'Promoted to Staff Engineer · L6',
    actorName: 'Mei Chen',
    occurredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-2',
    eventType: 'document',
    description: 'Document uploaded: Tax 2025.pdf',
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
  {
    id: 'evt-4',
    eventType: 'edit',
    description: 'Work arrangement updated to Hybrid',
    actorName: 'Diego Ribeiro',
    occurredAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-5',
    eventType: 'contract',
    description: 'Contract signed: indefinite · USD 168,000',
    actorName: 'HR Team',
    occurredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

const EVENT_ICON: Record<string, React.ElementType> = {
  edit: Pencil,
  approval: Check,
  document: File,
  org_change: Users,
  contract: FileText,
}

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

interface TabActivityProps {
  employmentId: string
}

export function TabActivity({ employmentId: _ }: TabActivityProps) {
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-510 text-foreground">Activity</span>
        <span className="text-xs text-muted-foreground">{MOCK_EVENTS.length} events</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        {MOCK_EVENTS.map((evt, i) => {
          const Icon = EVENT_ICON[evt.eventType] ?? Pencil
          return (
            <div
              key={evt.id}
              data-testid="activity-event"
              className={`flex items-start gap-3 px-4 py-3 ${
                i > 0 ? 'border-t border-border/60' : ''
              }`}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/40">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-secondary-foreground">{evt.description}</p>
                <p className="text-[10px] text-muted-foreground">
                  by {evt.actorName} · {relativeTime(evt.occurredAt)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex justify-center">
        <button
          disabled
          className="text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          No more events
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 5 "TabActivity"
```

Expected: all TabActivity tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd apps/web-people && bun run test:unit
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web-people/src/components/profile/tabs/TabActivity.tsx \
        apps/web-people/src/components/profile/tabs/TabActivity.spec.tsx
git commit -m "feat(web-people): add TabActivity UI stub with 5 mock events"
```

---

### Task 4: Final cleanup and typecheck

- [ ] **Step 1: Verify there are no remaining imports of deleted files**

```bash
grep -r "TabContracts\|TabSections\|TabProbation\|ProfileHeader\|ProfileTabs\|InfoCard" \
  apps/web-people/src --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Step 2: Run typecheck**

```bash
cd apps/web-people && bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
cd apps/web-people && bun run test:unit
```

Expected: all tests pass, ≥70% coverage.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(web-people): final cleanup after member details redesign"
```

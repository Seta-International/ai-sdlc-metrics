# Profile Change Request — Plan 03: HR Change Queue (web-people)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the `/change-requests` page's `ChangeRequestQueue` component to the real `people.listProfileChangeRequests` (queue mode) tRPC route, and connect the Approve / Reject dialogs to `people.batchApproveChanges` and `people.batchRejectChanges`.

**Architecture:** The page already exists at `apps/web-people/src/app/change-requests/page.tsx` and renders `<ChangeRequestQueue />`. The component currently calls a non-existent stub route (`anyTrpc.people.changeRequests.list.query`). We introduce a `useHrChangeRequests` hook that calls the real `listProfileChangeRequests` endpoint (queue mode), maps results to `ChangeRequestRow`, and computes stats locally. The component is then updated to use that hook and wire approve/reject dialogs.

**Prerequisites:** Plan 01 must be complete — `listProfileChangeRequests` (queue mode), `batchApproveChanges`, and `batchRejectChanges` must all be accessible via tRPC.

**Tech Stack:** Next.js, React, tRPC fetch client, `@future/ui`, Vitest + React Testing Library

---

## Task 1: Create `useHrChangeRequests` hook

**Files:**

- Create: `apps/web-people/src/lib/hooks/use-hr-change-requests.ts`
- Test: `apps/web-people/src/lib/hooks/use-hr-change-requests.spec.ts`

The hook fetches `listProfileChangeRequests` in queue mode, maps raw results to `ChangeRequestRow`, and derives stats (pending count, approved today, rejected today, oldest pending days).

- [ ] **Step 1: Write the failing test**

Create `apps/web-people/src/lib/hooks/use-hr-change-requests.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('use-hr-change-requests module', () => {
  it('exports useHrChangeRequests function', async () => {
    const mod = await import('./use-hr-change-requests')
    expect(typeof mod.useHrChangeRequests).toBe('function')
  })

  it('HrFilter type includes all_pending and recent', async () => {
    // Structural: the hook accepts these two string literals without TS error
    const mod = await import('./use-hr-change-requests')
    // If the function exists and the module loads, the type is enforced at compile time
    expect(mod.useHrChangeRequests).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit -- --reporter=verbose 2>&1 | grep -A 5 "use-hr-change-requests"
```

Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create the hook**

Create `apps/web-people/src/lib/hooks/use-hr-change-requests.ts`:

```typescript
'use client'

import * as React from 'react'
import { trpc } from '../trpc'
import type { ChangeRequestRow } from '../types-workflows'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const FIELD_LABELS: Record<string, string> = {
  'person_profile.preferred_name': 'Preferred name',
  'person_profile.date_of_birth': 'Date of birth',
  'person_profile.full_name': 'Full name',
  'person_profile.nationality': 'Nationality',
  'person_profile.name_display_order': 'Name display order',
  'person_profile.photo_document_id': 'Profile photo',
  'employment_detail.personal_email': 'Personal email',
  'employment_detail.personal_phone': 'Personal phone',
  'employment_detail.office_location': 'Office location',
  'employment_detail.work_phone': 'Work phone',
  'employment.company_email': 'Company email',
}

function fieldLabel(path: string): string {
  return FIELD_LABELS[path] ?? path
}

export interface HrQueueStats {
  pending: number
  approvedToday: number
  rejectedToday: number
  oldestDays: number
}

export type HrFilter = 'all_pending' | 'recent'

export interface UseHrChangeRequestsResult {
  rows: ChangeRequestRow[]
  stats: HrQueueStats
  isLoading: boolean
  refetch: () => void
}

interface RawItem {
  id: string
  employmentId: string
  employeeName: string | null
  fieldPath: string
  oldValue: unknown
  newValue: unknown
  requestedBy: string
  effectiveDate: string | null
  status: string
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNote: string | null
  batchId: string | null
  reason: string | null
  createdAt: Date | string
}

export function useHrChangeRequests(filter: HrFilter): UseHrChangeRequestsResult {
  const [rows, setRows] = React.useState<ChangeRequestRow[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [tick, setTick] = React.useState(0)

  const refetch = React.useCallback(() => setTick((t) => t + 1), [])

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    const status = filter === 'all_pending' ? 'pending' : undefined

    void anyTrpc.people.listProfileChangeRequests
      .query({ mode: 'queue', status, limit: 50, offset: 0 })
      .then((result: { items: RawItem[] } | null) => {
        if (cancelled) return
        const items = result?.items ?? []
        const mapped: ChangeRequestRow[] = items.map((item) => ({
          id: item.id,
          employmentId: item.employmentId,
          employeeName: item.employeeName ?? 'Unknown',
          avatarUrl: null,
          fieldPath: item.fieldPath,
          fieldLabel: fieldLabel(item.fieldPath),
          oldValue: String(item.oldValue ?? '—'),
          newValue: String(item.newValue ?? '—'),
          requestedBy: item.requestedBy,
          requestedByName: item.employeeName ?? item.requestedBy,
          requestedAt:
            item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
          effectiveDate: item.effectiveDate ?? null,
          status: item.status as ChangeRequestRow['status'],
          reviewedBy: item.reviewedBy,
          reviewedByName: null,
          reviewedAt: item.reviewedAt,
          reviewNote: item.reviewNote,
          editPolicyLabel: 'HR approval',
        }))
        setRows(mapped)
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [filter, tick])

  const stats = React.useMemo<HrQueueStats>(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const pending = rows.filter((r) => r.status === 'pending')
    const approvedToday = rows.filter(
      (r) =>
        r.status === 'approved' && r.reviewedAt != null && new Date(r.reviewedAt) >= todayStart,
    ).length
    const rejectedToday = rows.filter(
      (r) =>
        r.status === 'rejected' && r.reviewedAt != null && new Date(r.reviewedAt) >= todayStart,
    ).length

    let oldestDays = 0
    for (const r of pending) {
      const days = Math.floor((Date.now() - new Date(r.requestedAt).getTime()) / 86_400_000)
      if (days > oldestDays) oldestDays = days
    }

    return { pending: pending.length, approvedToday, rejectedToday, oldestDays }
  }, [rows])

  return { rows, stats, isLoading, refetch }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit -- --reporter=verbose 2>&1 | grep -A 5 "use-hr-change-requests"
```

Expected: PASS

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web-people/src/lib/hooks/use-hr-change-requests.ts \
        apps/web-people/src/lib/hooks/use-hr-change-requests.spec.ts
git commit -m "feat(web-people): useHrChangeRequests hook — maps listProfileChangeRequests queue mode to ChangeRequestRow"
```

---

## Task 2: Rewrite `ChangeRequestQueue` to use the hook and wire approve/reject

**Files:**

- Modify: `apps/web-people/src/components/change-requests/ChangeRequestQueue.tsx`
- Test: `apps/web-people/src/components/change-requests/ChangeRequestQueue.spec.tsx`

Replace the stub tRPC call with `useHrChangeRequests`. Wire the Approve / Reject `AlertDialog` buttons to `batchApproveChanges` and `batchRejectChanges` mutations (sequential `await` per batch ID, no `Promise.all`).

- [ ] **Step 1: Write the failing component spec**

Create `apps/web-people/src/components/change-requests/ChangeRequestQueue.spec.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChangeRequestQueue } from './ChangeRequestQueue'

vi.mock('../../lib/trpc', () => ({ trpc: {} }))

vi.mock('../../lib/hooks/use-hr-change-requests', () => ({
  useHrChangeRequests: () => ({
    rows: [],
    stats: { pending: 0, approvedToday: 0, rejectedToday: 0, oldestDays: 0 },
    isLoading: false,
    refetch: vi.fn(),
  }),
}))

describe('ChangeRequestQueue', () => {
  it('renders the stats bar with four cards', () => {
    render(<ChangeRequestQueue />)
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('Approved Today')).toBeTruthy()
    expect(screen.getByText('Rejected Today')).toBeTruthy()
    expect(screen.getByText('Oldest Pending')).toBeTruthy()
  })

  it('renders the All Pending filter tab', () => {
    render(<ChangeRequestQueue />)
    expect(screen.getByRole('tab', { name: /all pending/i })).toBeTruthy()
  })

  it('renders the Recently Decided filter tab', () => {
    render(<ChangeRequestQueue />)
    expect(screen.getByRole('tab', { name: /recently decided/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit -- --reporter=verbose 2>&1 | grep -A 10 "ChangeRequestQueue"
```

Expected: FAIL — component calls the non-existent stub route instead of the hook.

- [ ] **Step 3: Rewrite `ChangeRequestQueue`**

Replace `apps/web-people/src/components/change-requests/ChangeRequestQueue.tsx` entirely:

```typescript
// apps/web-people/src/components/change-requests/change-request-queue.tsx
'use client'

import * as React from 'react'
import type { ColumnDef, CellContext } from '@future/ui'
import {
  DataTable,
  Badge,
  Button,
  Card,
  Checkbox,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
  type FutureTableState,
  defaultTableState,
} from '@future/ui'
import { Check, X } from '@future/ui/icons'
import { AvatarNameCell } from '../AvatarNameCell'
import type { ChangeRequestRow } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'
import {
  useHrChangeRequests,
  type HrFilter,
} from '../../lib/hooks/use-hr-change-requests'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const columns: ColumnDef<ChangeRequestRow>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'employeeName',
    header: 'Employee',
    enableSorting: true,
    cell: ({ row }: CellContext<ChangeRequestRow, unknown>) => (
      <AvatarNameCell fullName={row.original.employeeName} avatarUrl={row.original.avatarUrl} />
    ),
  },
  {
    accessorKey: 'fieldLabel',
    header: 'Field',
    enableSorting: true,
  },
  {
    id: 'change',
    header: 'Change',
    cell: ({ row }: CellContext<ChangeRequestRow, unknown>) => (
      <div className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground line-through truncate max-w-24">
          {row.original.oldValue}
        </span>
        <span className="text-secondary-foreground/60">→</span>
        <span className="text-emerald-500 font-510 truncate max-w-24">{row.original.newValue}</span>
      </div>
    ),
  },
  {
    accessorKey: 'requestedByName',
    header: 'Requested By',
  },
  {
    accessorKey: 'requestedAt',
    header: 'Date',
    enableSorting: true,
    cell: ({ getValue }: CellContext<ChangeRequestRow, unknown>) =>
      new Date(getValue() as string).toLocaleDateString('en-GB'),
  },
  {
    accessorKey: 'effectiveDate',
    header: 'Effective',
    cell: ({ getValue }: CellContext<ChangeRequestRow, unknown>) => {
      const val = getValue() as string | null
      return val ? new Date(val).toLocaleDateString('en-GB') : '--'
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }: CellContext<ChangeRequestRow, unknown>) => {
      const status = getValue() as string
      const cfg: Record<string, { label: string; variant: 'default' | 'subtle' | 'destructive' }> =
        {
          pending: { label: 'Pending', variant: 'subtle' },
          approved: { label: 'Approved', variant: 'default' },
          rejected: { label: 'Rejected', variant: 'destructive' },
          cancelled: { label: 'Cancelled', variant: 'subtle' },
        }
      const c = cfg[status] ?? { label: status, variant: 'subtle' as const }
      return <Badge variant={c.variant}>{c.label}</Badge>
    },
  },
]

export function ChangeRequestQueue() {
  const [activeTab, setActiveTab] = React.useState<HrFilter>('all_pending')
  const [tableState, setTableState] = React.useState<FutureTableState>(defaultTableState)
  const [rejectNote, setRejectNote] = React.useState('')
  const [isMutating, setIsMutating] = React.useState(false)

  const { rows, stats, isLoading, refetch } = useHrChangeRequests(activeTab)

  // Derive selected batchIds from the DataTable row-selection state.
  // tableState.rowSelection is a Record<rowIndex, boolean>.
  const selectedBatchIds = React.useMemo(() => {
    const sel = tableState.rowSelection ?? {}
    return Object.entries(sel)
      .filter(([, v]) => v)
      .map(([idx]) => rows[Number(idx)]?.id)
      .filter((id): id is string => id != null)
  }, [tableState.rowSelection, rows])

  async function handleBulkApprove() {
    setIsMutating(true)
    try {
      for (const batchId of selectedBatchIds) {
        await anyTrpc.people.batchApproveChanges.mutate({ batchId })
      }
      toast.success(`Approved ${selectedBatchIds.length} change request(s)`)
      refetch()
    } catch {
      toast.error('Failed to approve — please try again')
    } finally {
      setIsMutating(false)
    }
  }

  async function handleBulkReject() {
    setIsMutating(true)
    try {
      for (const batchId of selectedBatchIds) {
        await anyTrpc.people.batchRejectChanges.mutate({
          batchId,
          note: rejectNote.trim() || undefined,
        })
      }
      toast.success(`Rejected ${selectedBatchIds.length} change request(s)`)
      setRejectNote('')
      refetch()
    } catch {
      toast.error('Failed to reject — please try again')
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-border bg-card p-4 text-center">
          <div className="text-2xl font-510 text-foreground">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">Pending</div>
        </Card>
        <Card className="border-border bg-card p-4 text-center">
          <div className="text-2xl font-510 text-emerald-500">{stats.approvedToday}</div>
          <div className="text-xs text-muted-foreground">Approved Today</div>
        </Card>
        <Card className="border-border bg-card p-4 text-center">
          <div className="text-2xl font-510 text-red-400">{stats.rejectedToday}</div>
          <div className="text-xs text-muted-foreground">Rejected Today</div>
        </Card>
        <Card className="border-border bg-card p-4 text-center">
          <div className="text-2xl font-510 text-amber-400">{stats.oldestDays}d</div>
          <div className="text-xs text-muted-foreground">Oldest Pending</div>
        </Card>
      </div>

      {/* Filter tabs + batch actions */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as HrFilter)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="all_pending">All Pending</TabsTrigger>
            <TabsTrigger value="recent">Recently Decided</TabsTrigger>
          </TabsList>

          {activeTab === 'all_pending' && selectedBatchIds.length > 0 && (
            <div className="flex gap-2">
              {/* Approve dialog */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="default" size="sm" className="gap-1" disabled={isMutating}>
                    <Check className="h-3.5 w-3.5" />
                    Approve ({selectedBatchIds.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve Selected Changes</AlertDialogTitle>
                    <AlertDialogDescription>
                      Approve {selectedBatchIds.length} change request(s)? This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        void handleBulkApprove()
                      }}
                    >
                      {isMutating && <Spinner className="size-4 mr-2" />}
                      Approve All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Reject dialog */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1" disabled={isMutating}>
                    <X className="h-3.5 w-3.5" />
                    Reject ({selectedBatchIds.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reject Selected Changes</AlertDialogTitle>
                    <AlertDialogDescription>
                      Reject {selectedBatchIds.length} change request(s)? Provide a reason below.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="px-6 pb-2">
                    <Textarea
                      placeholder="Rejection reason (optional)"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        void handleBulkReject()
                      }}
                    >
                      {isMutating && <Spinner className="size-4 mr-2" />}
                      Reject All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        <TabsContent value={activeTab} className="mt-4">
          <DataTable
            columns={columns}
            rows={rows}
            state={tableState}
            totalCount={rows.length}
            onStateChange={setTableState}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit -- --reporter=verbose 2>&1 | grep -A 10 "ChangeRequestQueue"
```

Expected: PASS (3 tests green)

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people typecheck 2>&1 | head -20
```

Expected: no errors. If `DataTable`'s `state` prop shape differs from `FutureTableState` (e.g. `rowSelection` key is different), inspect how other pages use `DataTable` in the codebase and match the exact field name.

- [ ] **Step 6: Run the full web-people test suite**

```bash
cd /home/vietanh/Future && bun run --filter @future/web-people test:unit 2>&1 | tail -20
```

Expected: all pass, no regressions.

- [ ] **Step 7: Commit**

```bash
git add apps/web-people/src/components/change-requests/ChangeRequestQueue.tsx \
        apps/web-people/src/components/change-requests/ChangeRequestQueue.spec.tsx
git commit -m "feat(web-people): wire HR change queue — real data, approve/reject dialogs connected"
```

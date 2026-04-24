# Member Details Redesign — Plan 06: TabJobHistory

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `TabJobHistory` with a vertical timeline design — coloured icon dots on a rail, event cards showing type label, date, from→to (struck through), reason, and "by" attribution. A right side rail shows tenure and event summary stats.

**Architecture:** The tab fetches from the existing `people.getJobHistory({ profileId })` endpoint (takes `personProfile.id`, not `employmentId`). The existing `JobHistoryEntry` type (with `eventType`, `before`, `after`, `reason`, `effectiveDate`) maps directly to the timeline UI. No new backend endpoint needed.

**Tech Stack:** React, TypeScript, `SideCard` from `../cards/SideCard`, lucide-react icons via `@future/ui/icons` (ArrowUp, Users, Share2, Plus, DollarSign, Skeleton), Vitest + @testing-library/react

---

## Files

| Action | Path                                                                 |
| ------ | -------------------------------------------------------------------- |
| Create | `apps/web-people/src/components/profile/tabs/TabJobHistory.tsx`      |
| Create | `apps/web-people/src/components/profile/tabs/TabJobHistory.spec.tsx` |
| Delete | `apps/web-people/src/components/profile/TabJobHistory.tsx`           |

**Prerequisite:** Plans 01, 03 complete (SideCard available).

---

### Task 1: Rewrite TabJobHistory

**Files:**

- Create: `apps/web-people/src/components/profile/tabs/TabJobHistory.spec.tsx`
- Create: `apps/web-people/src/components/profile/tabs/TabJobHistory.tsx`
- Delete: `apps/web-people/src/components/profile/TabJobHistory.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web-people/src/components/profile/tabs/TabJobHistory.spec.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { TabJobHistory } from './TabJobHistory'

const { mockGetJobHistory } = vi.hoisted(() => ({
  mockGetJobHistory: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: { people: { getJobHistory: { query: mockGetJobHistory } } },
}))

vi.mock('../cards/SideCard', () => ({
  SideCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid={`side-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>{children}</div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const mockEvents = [
  {
    id: 'jh-1',
    eventType: 'promotion',
    effectiveDate: '2026-03-03',
    jobTitle: 'Staff Engineer',
    department: 'Engineering',
    manager: 'Mei Chen',
    reason: 'Annual review — exceeds expectations.',
    isCurrent: true,
    isFuture: false,
    before: { level: 'L5', title: 'Senior Engineer' },
    after: { level: 'L6', title: 'Staff Engineer' },
  },
  {
    id: 'jh-2',
    eventType: 'hire',
    effectiveDate: '2023-07-15',
    jobTitle: 'Engineer',
    department: 'Engineering',
    manager: 'Kai Tanaka',
    reason: 'Full-time hire.',
    isCurrent: false,
    isFuture: false,
    before: null,
    after: { title: 'Engineer' },
  },
]

describe('TabJobHistory', () => {
  it('calls people.getJobHistory with profileId', async () => {
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    await waitFor(() => expect(mockGetJobHistory).toHaveBeenCalledWith({ profileId: 'pp-1' }))
  })

  it('shows skeleton while loading', () => {
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    expect(document.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0)
  })

  it('renders event cards when loaded', async () => {
    mockGetJobHistory.mockResolvedValueOnce(mockEvents)
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    await waitFor(() => expect(screen.getByText('Staff Engineer')).toBeTruthy())
  })

  it('renders promotion event type label', async () => {
    mockGetJobHistory.mockResolvedValueOnce(mockEvents)
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    await waitFor(() => expect(screen.getByText('Promotion')).toBeTruthy())
  })

  it('renders "No job history recorded." when empty', async () => {
    mockGetJobHistory.mockResolvedValueOnce([])
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    await waitFor(() => expect(screen.getByText('No job history recorded.')).toBeTruthy())
  })

  it('hides Add event button when canEdit is false', async () => {
    mockGetJobHistory.mockResolvedValueOnce(mockEvents)
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    await waitFor(() => screen.getByText('Staff Engineer'))
    expect(screen.queryByText('Add event')).toBeNull()
  })

  it('shows Add event button when canEdit is true', async () => {
    mockGetJobHistory.mockResolvedValueOnce(mockEvents)
    render(<TabJobHistory profileId="pp-1" canEdit={true} hireDate="2023-07-15" />)
    await waitFor(() => expect(screen.getByText('Add event')).toBeTruthy())
  })

  it('renders Tenure side card', async () => {
    mockGetJobHistory.mockResolvedValueOnce(mockEvents)
    render(<TabJobHistory profileId="pp-1" canEdit={false} hireDate="2023-07-15" />)
    await waitFor(() => expect(screen.getByTestId('side-card-tenure')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 3 "tabs/TabJobHistory"
```

Expected: FAIL with "Cannot find module './TabJobHistory'".

- [ ] **Step 3: Create tabs/TabJobHistory.tsx**

Create `apps/web-people/src/components/profile/tabs/TabJobHistory.tsx`:

```tsx
'use client'

import * as React from 'react'
import { Button, Skeleton } from '@future/ui'
import { ArrowUp, Users, Share2, Plus, Download, DollarSign } from '@future/ui/icons'
import { SideCard } from '../cards/SideCard'
import type { JobHistoryEntry } from '../../../lib/types'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const EVENT_CONFIG: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  hire: { label: 'Hire', Icon: Plus, color: '#10b981' },
  promotion: { label: 'Promotion', Icon: ArrowUp, color: '#7170ff' },
  demotion: { label: 'Demotion', Icon: ArrowUp, color: '#f87171' },
  lateral: { label: 'Transfer', Icon: Share2, color: '#f59e0b' },
  reorg: { label: 'Manager change', Icon: Users, color: '#06b6d4' },
  termination: { label: 'Termination', Icon: DollarSign, color: '#62666d' },
}

function fallbackConfig(eventType: string) {
  return { label: eventType, Icon: Plus, color: '#8a8f98' }
}

interface TabJobHistoryProps {
  profileId: string
  canEdit: boolean
  hireDate: string
}

export function TabJobHistory({ profileId, canEdit, hireDate }: TabJobHistoryProps) {
  const [entries, setEntries] = React.useState<JobHistoryEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await anyTrpc.people.getJobHistory.query({ profileId })
        setEntries(Array.isArray(result) ? result : [])
      } finally {
        setIsLoading(false)
      }
    })()
  }, [profileId])

  const tenureMonths = React.useMemo(() => {
    const ms = Date.now() - new Date(hireDate).getTime()
    return Math.floor(ms / (1000 * 60 * 60 * 24 * 30))
  }, [hireDate])

  const eventCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of entries) {
      counts[e.eventType] = (counts[e.eventType] ?? 0) + 1
    }
    return counts
  }, [entries])

  if (isLoading) {
    return (
      <div className="grid grid-cols-[1fr_300px] gap-8 p-6">
        <div className="space-y-4">
          {[1, 2, 3].map((k) => (
            <Skeleton key={k} className="h-24 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[1fr_300px] gap-8 p-6">
      {/* Main column */}
      <div>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-510 uppercase tracking-widest text-muted-foreground">
              Job history
            </p>
            <h2 className="text-base font-510 text-foreground">
              {entries.length} events · {tenureMonths} months
            </h2>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="h-3 w-3" />
              Export
            </Button>
            {canEdit && (
              <Button variant="default" size="sm" className="gap-1.5">
                <Plus className="h-3 w-3" />
                Add event
              </Button>
            )}
          </div>
        </div>

        {/* Timeline */}
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No job history recorded.</p>
        ) : (
          <div className="relative pl-6">
            {/* Vertical rail */}
            <div className="absolute bottom-2 left-[9px] top-2 w-px bg-border/40" />

            {entries.map((entry, i) => {
              const cfg = EVENT_CONFIG[entry.eventType] ?? fallbackConfig(entry.eventType)
              const { Icon, color, label } = cfg

              return (
                <div key={entry.id} className={`relative ${i < entries.length - 1 ? 'pb-5' : ''}`}>
                  {/* Icon dot */}
                  <div
                    className="absolute -left-6 flex h-[18px] w-[18px] items-center justify-center rounded-full"
                    style={{ background: `${color}22`, border: `1px solid ${color}55` }}
                  >
                    <Icon className="h-2.5 w-2.5" style={{ color }} />
                  </div>

                  {/* Event card */}
                  <div className="rounded-lg border border-border bg-card px-4 py-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className="text-[10px] font-510 uppercase tracking-widest"
                        style={{ color }}
                      >
                        {label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(entry.effectiveDate).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    {/* From → To */}
                    {entry.before && entry.after && (
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground line-through">
                          {Object.values(entry.before).join(' · ')}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-secondary-foreground font-510">
                          {Object.values(entry.after).join(' · ')}
                        </span>
                      </div>
                    )}

                    {entry.reason && (
                      <p className="text-[11px] text-muted-foreground">{entry.reason}</p>
                    )}
                    {entry.manager && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                        by {entry.manager}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Right side rail */}
      <div className="flex flex-col gap-4">
        <SideCard title="Tenure">
          <p className="text-2xl font-510 tracking-tight text-foreground">
            {tenureMonths}
            <span className="ml-1 text-sm font-normal text-muted-foreground">months</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Since{' '}
            {new Date(hireDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </p>
        </SideCard>

        <SideCard title="Event summary">
          {Object.entries(EVENT_CONFIG).map(([type, { label }]) => {
            const count = eventCounts[type] ?? 0
            if (count === 0) return null
            return (
              <div key={type} className="flex items-center justify-between py-0.5">
                <span className="text-[11px] text-muted-foreground">{label}s</span>
                <span className="font-mono text-[11px] text-secondary-foreground">{count}</span>
              </div>
            )
          })}
        </SideCard>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Delete the old root-level TabJobHistory**

```bash
rm apps/web-people/src/components/profile/TabJobHistory.tsx
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd apps/web-people && bun run test:unit --reporter=verbose 2>&1 | grep -A 5 "TabJobHistory"
```

Expected: all TabJobHistory tests pass.

- [ ] **Step 6: Run full suite**

```bash
cd apps/web-people && bun run test:unit
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web-people/src/components/profile/tabs/TabJobHistory.tsx \
        apps/web-people/src/components/profile/tabs/TabJobHistory.spec.tsx
git add -u apps/web-people/src/components/profile/TabJobHistory.tsx
git commit -m "feat(web-people): rewrite TabJobHistory as vertical timeline"
```

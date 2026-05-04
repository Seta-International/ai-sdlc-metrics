# Plan 4 — Frontend: OnboardingKanban Component

**Spec:** `docs/superpowers/specs/2026-05-04-onboarding-design.md`
**Depends on:** Plan 2 (`listCases` tRPC endpoint must exist)
**Blocks:** Plan 5 (page imports `OnboardingKanban`)

---

## Goal

Build the Kanban board component that fetches all active onboarding cases and displays them in
4 stage columns. Each card shows avatar, name, job title, start date, progress bar, task count,
and a blocker badge.

---

## Steps

### 4.1 — Update `types-workflows.ts`

**File:** `apps/web-people/src/lib/types-workflows.ts`

Add two fields to the `OnboardingCase` type:

```ts
stage: 'offer_accepted' | 'paperwork' | 'equipment' | 'first_day_ready'
blockers: number
```

---

### 4.2 — Create `OnboardingKanban.tsx`

**File:** `apps/web-people/src/components/onboarding/OnboardingKanban.tsx`

Mark `'use client'` at top.

**Imports required:**

```ts
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Progress, Skeleton, Button } from '@future/ui'
import { Calendar, AlertTriangle, Plus } from '@future/ui/icons'
import { AvatarNameCell } from '../AvatarNameCell'
import type { OnboardingCase } from '../../lib/types-workflows'
import { trpc } from '../../lib/trpc'
```

**Column config constant** (outside component — stable reference):

```ts
const STAGE_COLUMNS = [
  { key: 'offer_accepted', label: 'Offer accepted', color: '#7170ff' },
  { key: 'paperwork', label: 'Paperwork', color: '#06b6d4' },
  { key: 'equipment', label: 'Equipment', color: '#f59e0b' },
  { key: 'first_day_ready', label: 'First day ready', color: '#10b981' },
] as const
```

**`OnboardingCaseCard` sub-component** (defined in same file, not exported):

```tsx
function OnboardingCaseCard({ c, onClick }: { c: OnboardingCase; onClick: () => void }) {
  const pct = c.tasksTotal > 0 ? Math.round((c.tasksCompleted / c.tasksTotal) * 100) : 0
  return (
    <div
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-border/60 transition-colors"
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <AvatarNameCell fullName={c.employeeName} avatarUrl={c.avatarUrl} subtitle={c.jobTitle} />
      <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
        <Calendar className="size-3" />
        <span>{c.startDate}</span>
      </div>
      <Progress value={pct} className="h-1 mt-2" />
      <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
        <span>
          {c.tasksCompleted}/{c.tasksTotal} tasks
        </span>
        {c.blockers > 0 && (
          <span className="flex items-center gap-1 text-amber-400">
            <AlertTriangle className="size-3" />
            {c.blockers}
          </span>
        )}
      </div>
    </div>
  )
}
```

**`OnboardingKanban` main export:**

```tsx
interface OnboardingKanbanProps {
  onAddClick: () => void
}

export function OnboardingKanban({ onAddClick }: OnboardingKanbanProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyTrpc = trpc as any
  const router = useRouter()
  const [cases, setCases] = React.useState<OnboardingCase[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        // tenantId: follow the same pattern used in WorkflowCasesTable / other components
        // (likely read from session cookie or passed via context)
        const result = await (anyTrpc.people.onboarding.listCases.query({
          tenantId: /* session tenantId */,
        }) as Promise<OnboardingCase[]>)
        setCases(result)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  const byStage = React.useMemo(() => {
    const map = new Map<string, OnboardingCase[]>()
    for (const col of STAGE_COLUMNS) map.set(col.key, [])
    for (const c of cases) map.get(c.stage)?.push(c)
    return map
  }, [cases])

  return (
    <div className="grid grid-cols-4 gap-2.5 p-4 flex-1 min-h-0 overflow-auto">
      {STAGE_COLUMNS.map((col) => {
        const colCases = byStage.get(col.key) ?? []
        return (
          <div key={col.key} className="flex flex-col gap-2 min-h-0">
            {/* Column header */}
            <div className="flex items-center gap-2 px-2 py-1">
              <span
                className="size-1.5 rounded-full shrink-0"
                style={{ background: col.color }}
              />
              <span className="text-xs font-510 text-fg-primary">{col.label}</span>
              <span className="text-xs text-muted-foreground">{colCases.length}</span>
            </div>
            {/* Cards or skeletons */}
            {isLoading
              ? Array.from({ length: 2 }, (_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-lg" />
                ))
              : colCases.map((c) => (
                  <OnboardingCaseCard
                    key={c.id}
                    c={c}
                    onClick={() => router.push(`/onboarding/${c.id}`)}
                  />
                ))}
            {/* Add button */}
            <Button
              variant="outline"
              size="sm"
              className="border-dashed text-muted-foreground gap-1.5 mt-1"
              onClick={onAddClick}
            >
              <Plus className="size-3" /> Add
            </Button>
          </div>
        )
      })}
    </div>
  )
}
```

> **tenantId source:** Check how `WorkflowCasesTable` and similar components obtain `tenantId`
> from the session — likely via a `useSession` hook or a server-side prop passed down from the
> layout. Follow that exact pattern rather than inventing a new one.

---

### 4.3 — Spec

**File:** `apps/web-people/src/components/onboarding/OnboardingKanban.spec.tsx`

Mock `trpc` with `vi.mock('../../lib/trpc', ...)` using the pattern from
`WorkflowCasesTable.spec.tsx`.

Define a factory:

```ts
function makeCase(overrides: Partial<OnboardingCase> = {}): OnboardingCase {
  return {
    id: 'case-1',
    employmentId: 'emp-1',
    employeeName: 'Alice Nguyen',
    jobTitle: 'Engineer',
    department: 'Engineering',
    avatarUrl: null,
    startDate: '2026-05-10',
    stage: 'offer_accepted',
    tasksTotal: 5,
    tasksCompleted: 2,
    blockers: 0,
    ...overrides,
  }
}
```

Tests:

- **Test 1** — `renders 4 column labels`:
  Mock returns `[]`. Assert all four label texts visible: "Offer accepted", "Paperwork",
  "Equipment", "First day ready".

- **Test 2** — `places card in correct column`:
  Mock returns `[makeCase({ stage: 'paperwork', employeeName: 'Bob' })]`.
  Assert "Bob" appears under the "Paperwork" column, not under the others.

- **Test 3** — `shows blocker badge when blockers > 0`:
  `makeCase({ blockers: 2 })`. Assert amber badge with text "2" is visible.

- **Test 4** — `hides blocker badge when blockers === 0`:
  `makeCase({ blockers: 0 })`. Assert no `AlertTriangle` in the DOM.

- **Test 5** — `navigates to /onboarding/:id on card click`:
  Mock `useRouter`, click card, assert `router.push('/onboarding/case-1')` called.

- **Test 6** — `renders skeletons while loading`:
  Mock query that never resolves (returns a pending `Promise`). Assert `Skeleton` elements
  rendered (or check absence of employee names).

---

## Risks

- Icon names `Calendar`, `AlertTriangle`, `Plus` — verify they are exported from
  `@future/ui/icons` before implementing. Substitute with correct names if different.
- `tenantId` sourcing must match the existing session pattern — do not hardcode or guess.

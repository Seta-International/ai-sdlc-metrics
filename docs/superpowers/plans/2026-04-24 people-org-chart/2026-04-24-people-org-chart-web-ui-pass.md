# People Org Chart UI/UX Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Org Chart frontend to the approved mockup by extracting `OrgChartToolbar` and `OrgChartZoomControls` as new components, adding compact mode to `OrgChartNode`, fixing the horizontal connector rail, and adding PNG export via `html2canvas`.

**Architecture:** Approach 2 — component extraction. `OrgChartTree` becomes a thin orchestrator wiring three focused sub-components (`OrgChartToolbar`, `OrgChartZoomControls`, `OrgChartNodeComponent`) and owning the zoom/pan/compact/export state. All connector logic stays inside `OrgChartNodeComponent`.

**Tech Stack:** React (Next.js `'use client'`), `@future/ui` (Button, Badge, Card, Popover, Command, Spinner, toast), `@future/ui/icons` (Download, LayoutGrid, X, Minus, Plus, Maximize2), `html2canvas`, Vitest + Testing Library, Playwright E2E

---

## File Structure

| File                                                           | Action     | Responsibility                                                                                 |
| -------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `apps/web-people/src/components/OrgChartToolbar.tsx`           | **Create** | Filter chips (Team dismissible, Location static), compact toggle, export button                |
| `apps/web-people/src/components/OrgChartToolbar.spec.tsx`      | **Create** | Unit tests for toolbar                                                                         |
| `apps/web-people/src/components/OrgChartZoomControls.tsx`      | **Create** | Floating zoom pill (absolute bottom-right of canvas)                                           |
| `apps/web-people/src/components/OrgChartZoomControls.spec.tsx` | **Create** | Unit tests for zoom controls                                                                   |
| `apps/web-people/src/components/OrgChartNode.tsx`              | **Modify** | Add `compact` prop — pill render branch + connector rail fix                                   |
| `apps/web-people/src/components/OrgChartNode.spec.tsx`         | **Modify** | Add compact mode + connector tests                                                             |
| `apps/web-people/src/components/OrgChartTree.tsx`              | **Modify** | Wire toolbar + zoom controls, add `isCompact`/`isExporting` state, `canvasRef`, export handler |
| `apps/web-people/src/components/OrgChartTree.spec.tsx`         | **Modify** | Update stale assertions, add compact toggle test                                               |
| `apps/e2e/tests/people-org-chart.spec.ts`                      | **Modify** | Remove removed-element assertions, add export/compact assertions                               |

---

## Task 1: Install html2canvas

**Files:**

- Modify: `apps/web-people/package.json` (via CLI — do not edit manually)

- [ ] **Step 1: Add html2canvas dependency**

Run from the repo root:

```bash
bun add --cwd apps/web-people html2canvas
```

- [ ] **Step 2: Verify installation**

Run:

```bash
grep html2canvas apps/web-people/package.json
```

Expected: `"html2canvas": "^1.x.x"` appears in `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add apps/web-people/package.json bun.lock
git commit -m "chore(web-people): add html2canvas for org chart PNG export"
```

---

## Task 2: Create OrgChartToolbar (TDD)

**Files:**

- Create: `apps/web-people/src/components/OrgChartToolbar.spec.tsx`
- Create: `apps/web-people/src/components/OrgChartToolbar.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web-people/src/components/OrgChartToolbar.spec.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrgChartToolbar } from './OrgChartToolbar'

const teams = [
  { id: 'team-1', name: 'Engineering' },
  { id: 'team-2', name: 'Product' },
]

const defaults = {
  teams,
  selectedTeamId: null as string | null,
  isCompact: false,
  isExporting: false,
  onTeamChange: vi.fn(),
  onCompactToggle: vi.fn(),
  onExport: vi.fn(),
}

describe('OrgChartToolbar', () => {
  afterEach(cleanup)

  it('renders ghost Team chip when no team is selected', () => {
    render(<OrgChartToolbar {...defaults} />)
    expect(screen.getByRole('button', { name: /team filter/i })).toBeTruthy()
  })

  it('renders active Team chip with name and dismiss button when team is selected', () => {
    render(<OrgChartToolbar {...defaults} selectedTeamId="team-1" />)
    expect(screen.getByText('Engineering')).toBeTruthy()
    expect(screen.getByRole('button', { name: /clear team filter/i })).toBeTruthy()
  })

  it('calls onTeamChange(null) when dismiss button is clicked', () => {
    const onTeamChange = vi.fn()
    render(<OrgChartToolbar {...defaults} selectedTeamId="team-1" onTeamChange={onTeamChange} />)
    fireEvent.click(screen.getByRole('button', { name: /clear team filter/i }))
    expect(onTeamChange).toHaveBeenCalledWith(null)
  })

  it('renders Location chip as non-interactive text', () => {
    render(<OrgChartToolbar {...defaults} />)
    expect(screen.getByText('Location')).toBeTruthy()
  })

  it('calls onCompactToggle when compact view button is clicked', () => {
    const onCompactToggle = vi.fn()
    render(<OrgChartToolbar {...defaults} onCompactToggle={onCompactToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /compact view/i }))
    expect(onCompactToggle).toHaveBeenCalledTimes(1)
  })

  it('marks compact view button aria-pressed=true when isCompact is true', () => {
    render(<OrgChartToolbar {...defaults} isCompact={true} />)
    expect(screen.getByRole('button', { name: /compact view/i }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('shows spinner and disables export button when isExporting is true', () => {
    render(<OrgChartToolbar {...defaults} isExporting={true} />)
    const btn = screen.getByRole('button', { name: /export org chart/i })
    expect(btn.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('calls onExport when export button is clicked', () => {
    const onExport = vi.fn()
    render(<OrgChartToolbar {...defaults} onExport={onExport} />)
    fireEvent.click(screen.getByRole('button', { name: /export org chart/i }))
    expect(onExport).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartToolbar.spec.tsx
```

Expected: FAIL — `OrgChartToolbar` not found.

- [ ] **Step 3: Write the implementation**

Create `apps/web-people/src/components/OrgChartToolbar.tsx`:

```tsx
'use client'

import * as React from 'react'
import {
  Button,
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
} from '@future/ui'
import { Download, LayoutGrid, X } from '@future/ui/icons'

type Team = { id: string; name: string }

export type OrgChartToolbarProps = {
  teams: Team[]
  selectedTeamId: string | null
  isCompact: boolean
  isExporting: boolean
  onTeamChange: (teamId: string | null) => void
  onCompactToggle: () => void
  onExport: () => void
}

export function OrgChartToolbar({
  teams,
  selectedTeamId,
  isCompact,
  isExporting,
  onTeamChange,
  onCompactToggle,
  onExport,
}: OrgChartToolbarProps) {
  const [teamOpen, setTeamOpen] = React.useState(false)
  const selectedTeam = teams.find((t) => t.id === selectedTeamId)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {selectedTeam ? (
          <div className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs">
            <span className="text-fg-subtle">Team</span>
            <span className="font-510 text-fg-primary">{selectedTeam.name}</span>
            <button
              type="button"
              aria-label="Clear team filter"
              onClick={() => onTeamChange(null)}
              className="ml-1 rounded-full p-0.5 text-fg-muted hover:text-fg-primary"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <Popover open={teamOpen} onOpenChange={setTeamOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Team filter"
                className="flex items-center gap-1 rounded-full border border-sidebar-border bg-transparent px-3 py-1 text-xs text-fg-subtle hover:text-fg-primary"
              >
                Team
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search team…" />
                <CommandList>
                  <CommandGroup>
                    {teams.map((team) => (
                      <CommandItem
                        key={team.id}
                        value={team.name}
                        onSelect={() => {
                          onTeamChange(team.id)
                          setTeamOpen(false)
                        }}
                      >
                        {team.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}

        <div className="flex items-center rounded-full border border-sidebar-border px-3 py-1 text-xs text-fg-subtle">
          Location
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={isCompact ? 'secondary' : 'outline'}
          size="sm"
          onClick={onCompactToggle}
          aria-label="Compact view"
          aria-pressed={isCompact}
        >
          <LayoutGrid className="size-3.5" />
          Compact view
        </Button>

        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onExport}
          disabled={isExporting}
          aria-label="Export org chart"
        >
          {isExporting ? (
            <>
              <Spinner className="size-3.5" />
              Exporting…
            </>
          ) : (
            <>
              <Download className="size-3.5" />
              Export
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartToolbar.spec.tsx
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-people/src/components/OrgChartToolbar.tsx \
        apps/web-people/src/components/OrgChartToolbar.spec.tsx
git commit -m "feat(web-people): add OrgChartToolbar with filter chips and export button"
```

---

## Task 3: Create OrgChartZoomControls (TDD)

**Files:**

- Create: `apps/web-people/src/components/OrgChartZoomControls.spec.tsx`
- Create: `apps/web-people/src/components/OrgChartZoomControls.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web-people/src/components/OrgChartZoomControls.spec.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrgChartZoomControls } from './OrgChartZoomControls'

const defaults = {
  zoom: 1,
  canZoomIn: true,
  canZoomOut: true,
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onReset: vi.fn(),
}

describe('OrgChartZoomControls', () => {
  afterEach(cleanup)

  it('displays zoom as rounded integer percentage', () => {
    render(<OrgChartZoomControls {...defaults} zoom={1.1} />)
    expect(screen.getByText('110%')).toBeTruthy()
  })

  it('disables zoom-in button when canZoomIn is false', () => {
    render(<OrgChartZoomControls {...defaults} canZoomIn={false} />)
    expect(screen.getByRole('button', { name: /zoom in/i }).hasAttribute('disabled')).toBe(true)
  })

  it('disables zoom-out button when canZoomOut is false', () => {
    render(<OrgChartZoomControls {...defaults} canZoomOut={false} />)
    expect(screen.getByRole('button', { name: /zoom out/i }).hasAttribute('disabled')).toBe(true)
  })

  it('calls onZoomIn when zoom-in button is clicked', () => {
    const onZoomIn = vi.fn()
    render(<OrgChartZoomControls {...defaults} onZoomIn={onZoomIn} />)
    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }))
    expect(onZoomIn).toHaveBeenCalledTimes(1)
  })

  it('calls onZoomOut when zoom-out button is clicked', () => {
    const onZoomOut = vi.fn()
    render(<OrgChartZoomControls {...defaults} onZoomOut={onZoomOut} />)
    fireEvent.click(screen.getByRole('button', { name: /zoom out/i }))
    expect(onZoomOut).toHaveBeenCalledTimes(1)
  })

  it('calls onReset when reset view button is clicked', () => {
    const onReset = vi.fn()
    render(<OrgChartZoomControls {...defaults} onReset={onReset} />)
    fireEvent.click(screen.getByRole('button', { name: /reset view/i }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartZoomControls.spec.tsx
```

Expected: FAIL — `OrgChartZoomControls` not found.

- [ ] **Step 3: Write the implementation**

Create `apps/web-people/src/components/OrgChartZoomControls.tsx`:

```tsx
'use client'

import { Button } from '@future/ui'
import { Maximize2, Minus, Plus } from '@future/ui/icons'

export type OrgChartZoomControlsProps = {
  zoom: number
  canZoomIn: boolean
  canZoomOut: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export function OrgChartZoomControls({
  zoom,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onReset,
}: OrgChartZoomControlsProps) {
  return (
    <div className="absolute bottom-3.5 right-3.5 flex items-center gap-1 rounded-full border border-sidebar-border bg-background/80 px-2.5 py-1.5 backdrop-blur-sm">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        aria-label="Zoom out"
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="w-10 text-center text-xs font-510 tabular-nums text-fg-muted">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
      >
        <Plus className="size-3.5" />
      </Button>
      <div className="mx-1 h-4 w-px bg-sidebar-border" />
      <Button type="button" variant="ghost" size="sm" onClick={onReset} aria-label="Reset view">
        <Maximize2 className="size-3.5" />
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartZoomControls.spec.tsx
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-people/src/components/OrgChartZoomControls.tsx \
        apps/web-people/src/components/OrgChartZoomControls.spec.tsx
git commit -m "feat(web-people): add OrgChartZoomControls floating pill"
```

---

## Task 4: Add compact mode + connector rail to OrgChartNode (TDD)

**Files:**

- Modify: `apps/web-people/src/components/OrgChartNode.spec.tsx`
- Modify: `apps/web-people/src/components/OrgChartNode.tsx`

- [ ] **Step 1: Write the failing tests**

Append these cases to the `describe('OrgChartNodeComponent')` block in `apps/web-people/src/components/OrgChartNode.spec.tsx`:

```tsx
it('renders compact pill with name only — no title, no card, no profile button', () => {
  render(
    <OrgChartNodeComponent
      node={self}
      nodesById={new Map([['self-1', self]])}
      childrenByParentId={new Map()}
      expandedIds={new Set()}
      childLoadingIds={new Set()}
      childErrorsById={new Map()}
      compact={true}
      onExpand={vi.fn()}
      onCollapse={vi.fn()}
      onRetry={vi.fn()}
      onViewProfile={vi.fn()}
    />,
  )
  expect(screen.getByText('Sam Self')).toBeTruthy()
  expect(screen.queryByText('Senior Engineer')).toBeNull()
  expect(screen.queryByRole('button', { name: /view profile/i })).toBeNull()
  expect(screen.queryByTestId('org-card')).toBeNull()
})

it('shows You badge on compact pill for self node', () => {
  render(
    <OrgChartNodeComponent
      node={self}
      nodesById={new Map([['self-1', self]])}
      childrenByParentId={new Map()}
      expandedIds={new Set()}
      childLoadingIds={new Set()}
      childErrorsById={new Map()}
      compact={true}
      onExpand={vi.fn()}
      onCollapse={vi.fn()}
      onRetry={vi.fn()}
      onViewProfile={vi.fn()}
    />,
  )
  expect(screen.getByText('You')).toBeTruthy()
})

it('calls onExpand when compact pill button is clicked while collapsed', () => {
  const onExpand = vi.fn()
  render(
    <OrgChartNodeComponent
      node={self}
      nodesById={new Map([['self-1', self]])}
      childrenByParentId={new Map()}
      expandedIds={new Set()}
      childLoadingIds={new Set()}
      childErrorsById={new Map()}
      compact={true}
      onExpand={onExpand}
      onCollapse={vi.fn()}
      onRetry={vi.fn()}
      onViewProfile={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /expand direct reports for Sam Self/i }))
  expect(onExpand).toHaveBeenCalledWith('self-1')
})

it('renders connector elements for expanded children', () => {
  const report1: OrgChartNode = {
    ...self,
    employmentId: 'r-1',
    fullName: 'Alice A',
    managerEmploymentId: 'self-1',
  }
  const report2: OrgChartNode = {
    ...self,
    employmentId: 'r-2',
    fullName: 'Bob B',
    managerEmploymentId: 'self-1',
  }
  render(
    <OrgChartNodeComponent
      node={self}
      nodesById={
        new Map([
          ['self-1', self],
          ['r-1', report1],
          ['r-2', report2],
        ])
      }
      childrenByParentId={new Map([['self-1', ['r-1', 'r-2']]])}
      expandedIds={new Set(['self-1'])}
      childLoadingIds={new Set()}
      childErrorsById={new Map()}
      onExpand={vi.fn()}
      onCollapse={vi.fn()}
      onRetry={vi.fn()}
      onViewProfile={vi.fn()}
    />,
  )
  expect(screen.getAllByTestId('org-connector').length).toBeGreaterThan(0)
  expect(screen.getByText('Alice A')).toBeTruthy()
  expect(screen.getByText('Bob B')).toBeTruthy()
})
```

Also add the import for `OrgChartNode` type at the top of the spec file (it is already imported via `'../lib/types'` — check this; if missing, add):

```tsx
import type { OrgChartNode } from '../lib/types'
```

- [ ] **Step 2: Run tests to verify the new tests fail**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartNode.spec.tsx
```

Expected: The 4 new tests FAIL (compact prop does not exist yet); existing 5 tests PASS.

- [ ] **Step 3: Write the updated implementation**

Replace the full contents of `apps/web-people/src/components/OrgChartNode.tsx`:

```tsx
'use client'

import * as React from 'react'
import Image from 'next/image'
import { Alert, AlertDescription, Badge, Button, Card, CardContent, Skeleton } from '@future/ui'
import { ArrowUpCircle, ChevronDown, ChevronRight, UserIcon, Users } from '@future/ui/icons'
import type { OrgChartNode } from '../lib/types'

type OrgChartNodeProps = {
  node: OrgChartNode
  nodesById: Map<string, OrgChartNode>
  childrenByParentId: Map<string, string[]>
  expandedIds: Set<string>
  childLoadingIds: Set<string>
  childErrorsById: Map<string, string>
  compact?: boolean
  onExpand: (employmentId: string) => void
  onCollapse: (employmentId: string) => void
  onRetry: (employmentId: string) => void
  onViewProfile: (employmentId: string) => void
}

export function OrgChartNodeComponent(props: OrgChartNodeProps) {
  const {
    node,
    nodesById,
    childrenByParentId,
    expandedIds,
    childLoadingIds,
    childErrorsById,
    compact,
    onExpand,
    onCollapse,
    onRetry,
    onViewProfile,
  } = props
  const isExpanded = expandedIds.has(node.employmentId)
  const childIds = childrenByParentId.get(node.employmentId) ?? []
  const isLoadingChildren = childLoadingIds.has(node.employmentId)
  const childError = childErrorsById.get(node.employmentId)
  const initials = node.fullName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex flex-col items-center">
      {compact ? (
        <button
          type="button"
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} direct reports for ${node.fullName}`}
          onClick={() => (isExpanded ? onCollapse(node.employmentId) : onExpand(node.employmentId))}
          className={[
            'flex items-center gap-2 rounded-full border px-3 py-1.5',
            node.relationshipToViewer === 'self'
              ? 'border-primary/50 ring-1 ring-primary/20'
              : 'border-sidebar-border',
          ].join(' ')}
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent/30 text-xs font-510 text-fg-primary">
            {node.avatarUrl ? (
              <Image
                src={node.avatarUrl}
                alt={node.fullName}
                width={28}
                height={28}
                className="size-full rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <span className="text-sm font-510 text-fg-primary">{node.fullName}</span>
          {node.relationshipToViewer === 'self' && <Badge variant="subtle">You</Badge>}
        </button>
      ) : (
        <Card
          data-testid="org-card"
          className={[
            'w-64 border-sidebar-border bg-overlay/2 shadow-sm',
            node.relationshipToViewer === 'self' ? 'border-primary/50 ring-1 ring-primary/20' : '',
          ].join(' ')}
        >
          <CardContent className="p-3">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent/30 text-sm font-510 text-fg-primary">
                {node.avatarUrl ? (
                  <Image
                    src={node.avatarUrl}
                    alt={node.fullName}
                    width={40}
                    height={40}
                    className="size-full rounded-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-510 text-fg-primary">{node.fullName}</p>
                  {node.relationshipToViewer === 'self' && <Badge variant="subtle">You</Badge>}
                </div>
                <p className="truncate text-xs text-fg-muted">{node.jobTitle ?? 'Unknown title'}</p>
                <p className="truncate text-xs text-fg-subtle">
                  {[node.departmentName, node.locationName].filter(Boolean).join(' · ') ||
                    'Unknown org'}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Badge variant="subtle" className="gap-1">
                <Users className="size-3" />
                {node.directReportCount}
              </Badge>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewProfile(node.employmentId)}
                  aria-label={`View profile for ${node.fullName}`}
                >
                  <UserIcon className="size-3.5" />
                </Button>
                {node.hasDirectReports && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      isExpanded ? onCollapse(node.employmentId) : onExpand(node.employmentId)
                    }
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} direct reports for ${node.fullName}`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoadingChildren && <Skeleton className="mt-3 h-6 w-32" />}
      {childError && (
        <Alert variant="destructive" className="mt-3 w-64">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>{childError}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRetry(node.employmentId)}
              aria-label={`Retry direct reports for ${node.employmentId}`}
            >
              <ArrowUpCircle className="size-3.5" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isExpanded && childIds.length > 0 && (
        <div className="mt-4 flex flex-col items-center">
          <div data-testid="org-connector" className="h-4 w-px bg-sidebar-border" />
          <div className="flex gap-6 border-t border-sidebar-border">
            {childIds.map((childId) => {
              const child = nodesById.get(childId)
              if (!child) return null
              return (
                <div key={childId} className="flex flex-col items-center">
                  <div data-testid="org-connector" className="h-4 w-px bg-sidebar-border" />
                  <OrgChartNodeComponent {...props} node={child} compact={compact} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

**Important:** Note that the `aria-label` on the retry button changed from `` `Retry direct reports for ${node.fullName}` `` to `` `Retry direct reports for ${node.employmentId}` ``. Update the existing spec test `'renders node-local retry UI...'` to match:

In `OrgChartNode.spec.tsx`, update this line:

```tsx
// before
expect(screen.getByRole('button', { name: /retry direct reports for Sam Self/i })).toBeTruthy()
// after
expect(screen.getByRole('button', { name: /retry direct reports for self-1/i })).toBeTruthy()
```

Wait — actually keep the aria-label using `node.fullName` to avoid breaking that test. Leave the retry button as:

```tsx
aria-label={`Retry direct reports for ${node.fullName}`}
```

- [ ] **Step 4: Run all OrgChartNode tests to verify they pass**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartNode.spec.tsx
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-people/src/components/OrgChartNode.tsx \
        apps/web-people/src/components/OrgChartNode.spec.tsx
git commit -m "feat(web-people): add compact mode and horizontal connector rail to OrgChartNode"
```

---

## Task 5: Wire OrgChartTree + update existing tests (TDD)

**Files:**

- Modify: `apps/web-people/src/components/OrgChartTree.spec.tsx`
- Modify: `apps/web-people/src/components/OrgChartTree.tsx`

- [ ] **Step 1: Update the stale test and add new tests**

In `apps/web-people/src/components/OrgChartTree.spec.tsx`:

**a) Replace the existing `'renders a V1 read-only toolbar...'` test** (it asserts `export` is absent — now incorrect):

```tsx
// REMOVE this test entirely:
it('renders a V1 read-only toolbar without search, alternate modes, bulk actions, or export', () => { ... })

// REPLACE with:
it('renders toolbar with zoom controls, filter chips, compact toggle, and export button', () => {
  render(<OrgChartTree />)

  expect(screen.getByRole('button', { name: /zoom out/i })).toBeTruthy()
  expect(screen.getByRole('button', { name: /zoom in/i })).toBeTruthy()
  expect(screen.getByRole('button', { name: /reset view/i })).toBeTruthy()
  expect(screen.getByRole('button', { name: /export org chart/i })).toBeTruthy()
  expect(screen.getByRole('button', { name: /compact view/i })).toBeTruthy()
  expect(screen.queryByPlaceholderText(/find person/i)).toBeNull()
  expect(screen.queryByText(/expand all/i)).toBeNull()
  expect(screen.queryByText(/collapse all/i)).toBeNull()
})
```

**b) Add compact toggle test** at the end of the `describe` block:

```tsx
it('toggles compact mode when compact view button is clicked', () => {
  render(<OrgChartTree />)

  const btn = screen.getByRole('button', { name: /compact view/i })
  expect(btn.getAttribute('aria-pressed')).toBe('false')

  fireEvent.click(btn)
  expect(btn.getAttribute('aria-pressed')).toBe('true')
})
```

- [ ] **Step 2: Run the spec to see which tests now fail**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartTree.spec.tsx
```

Expected: The renamed toolbar test and the compact toggle test FAIL; others PASS.

- [ ] **Step 3: Rewrite OrgChartTree.tsx**

Replace the full contents of `apps/web-people/src/components/OrgChartTree.tsx`:

```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Alert, AlertDescription, Button, Skeleton, toast } from '@future/ui'
import { ArrowUpCircle } from '@future/ui/icons'
import html2canvas from 'html2canvas'
import { OrgChartNodeComponent } from './OrgChartNode'
import { OrgChartToolbar } from './OrgChartToolbar'
import { OrgChartZoomControls } from './OrgChartZoomControls'
import { useOrgChart } from '../lib/hooks/use-org-chart'
import type { OrgChartNode } from '../lib/types'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 1.5
const ZOOM_STEP = 0.1

type PanState = { x: number; y: number }

export function OrgChartTree() {
  const router = useRouter()
  const chart = useOrgChart()
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState<PanState>({ x: 0, y: 0 })
  const [isCompact, setIsCompact] = React.useState(false)
  const [isExporting, setIsExporting] = React.useState(false)
  const canvasRef = React.useRef<HTMLDivElement>(null)
  const dragStartRef = React.useRef<{
    pointerId: number
    x: number
    y: number
    pan: PanState
  } | null>(null)

  const rootNodes = React.useMemo(
    () =>
      chart.rootEmploymentIds
        .map((id) => chart.nodesById.get(id))
        .filter((node): node is OrgChartNode => Boolean(node)),
    [chart.nodesById, chart.rootEmploymentIds],
  )

  function zoomBy(delta: number) {
    setZoom((prev) => clampZoom(roundZoom(prev + delta)))
  }

  function resetView() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  async function handleExport() {
    if (!canvasRef.current || isExporting) return
    setIsExporting(true)
    const prevZoom = zoom
    const prevPan = pan
    setZoom(1)
    setPan({ x: 0, y: 0 })
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      const canvas = await html2canvas(canvasRef.current, { scale: 2 })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = 'org-chart.png'
      a.click()
    } catch {
      toast.error('Export failed — try again.')
    } finally {
      setZoom(prevZoom)
      setPan(prevPan)
      setIsExporting(false)
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, textarea, select, [role="button"]')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pan,
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStartRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPan({ x: drag.pan.x + event.clientX - drag.x, y: drag.pan.y + event.clientY - drag.y })
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStartRef.current
    if (drag?.pointerId !== event.pointerId) return
    dragStartRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <section className="space-y-3" aria-label="Org chart canvas">
      <OrgChartToolbar
        teams={chart.availableTeams}
        selectedTeamId={chart.selectedTeamId}
        isCompact={isCompact}
        isExporting={isExporting}
        onTeamChange={chart.setSelectedTeamId}
        onCompactToggle={() => setIsCompact((prev) => !prev)}
        onExport={handleExport}
      />

      <div
        className="relative min-h-content-lg overflow-hidden rounded-xl border border-sidebar-border bg-overlay/2 p-4"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div
          ref={canvasRef}
          className="flex min-h-content-lg items-center justify-center pt-10"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center',
          }}
        >
          <OrgChartCanvasContent
            chart={chart}
            rootNodes={rootNodes}
            compact={isCompact}
            onResetView={resetView}
            onViewProfile={(id) => router.push(`/profile/${id}`)}
          />
        </div>

        <OrgChartZoomControls
          zoom={zoom}
          canZoomIn={zoom < MAX_ZOOM}
          canZoomOut={zoom > MIN_ZOOM}
          onZoomIn={() => zoomBy(ZOOM_STEP)}
          onZoomOut={() => zoomBy(-ZOOM_STEP)}
          onReset={resetView}
        />
      </div>
    </section>
  )
}

type OrgChartCanvasContentProps = {
  chart: ReturnType<typeof useOrgChart>
  rootNodes: OrgChartNode[]
  compact: boolean
  onResetView: () => void
  onViewProfile: (employmentId: string) => void
}

function OrgChartCanvasContent({
  chart,
  rootNodes,
  compact,
  onResetView,
  onViewProfile,
}: OrgChartCanvasContentProps) {
  if (chart.isLoadingContext) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-24 w-64" />
        <Skeleton className="h-16 w-48" />
      </div>
    )
  }

  if (chart.contextError) {
    return (
      <Alert variant="destructive" className="max-w-md">
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{chart.contextError}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={chart.retryContext}
            aria-label="Retry org chart context"
          >
            <ArrowUpCircle className="size-3.5" />
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (rootNodes.length === 0) {
    return (
      <div className="max-w-sm rounded-lg border border-sidebar-border bg-overlay/2 p-5 text-center">
        <p className="text-sm font-510 text-fg-primary">No org placement found</p>
        <p className="mt-1 text-xs text-fg-subtle">
          We could not find an org chart position to display.
        </p>
        <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={onResetView}>
          Reset view
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-start justify-center gap-8">
      {rootNodes.map((node) => (
        <OrgChartNodeComponent
          key={node.employmentId}
          node={node}
          nodesById={chart.nodesById}
          childrenByParentId={chart.childrenByParentId}
          expandedIds={chart.expandedIds}
          childLoadingIds={chart.childLoadingIds}
          childErrorsById={chart.childErrorsById}
          compact={compact}
          onExpand={chart.expandNode}
          onCollapse={chart.collapseNode}
          onRetry={chart.retryChildren}
          onViewProfile={onViewProfile}
        />
      ))}
    </div>
  )
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function roundZoom(value: number) {
  return Math.round(value * 10) / 10
}
```

- [ ] **Step 4: Run all OrgChartTree tests to verify they pass**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartTree.spec.tsx
```

Expected: All tests PASS. Pay attention to:

- `'renders toolbar with zoom controls, filter chips, compact toggle, and export button'` — PASS
- `'controls zoom locally and shows the current percentage'` — PASS (zoom controls still rendered)
- `'renders Team filter and visual-only Location chip in toolbar'` — PASS
- `'toggles compact mode when compact view button is clicked'` — PASS

- [ ] **Step 5: Run the full web-people unit suite**

Run:

```bash
bun run --cwd apps/web-people test:unit
```

Expected: All tests PASS with no regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/web-people/src/components/OrgChartTree.tsx \
        apps/web-people/src/components/OrgChartTree.spec.tsx
git commit -m "feat(web-people): wire OrgChartTree with toolbar, zoom controls, compact mode, and export"
```

---

## Task 6: Update E2E tests

**Files:**

- Modify: `apps/e2e/tests/people-org-chart.spec.ts`

- [ ] **Step 1: Update the E2E spec**

Replace the full contents of `apps/e2e/tests/people-org-chart.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.describe('People org chart', () => {
  test('opens context, verifies toolbar, expands a node, and navigates to profile', async ({
    page,
    request,
  }) => {
    const loginResponse = await request.post('http://localhost:4000/trpc/identity.devLogin', {
      data: { email: 'canh.ta@setafuture.onmicrosoft.com' },
    })
    expect(loginResponse.ok()).toBe(true)
    const loginBody = (await loginResponse.json()) as {
      result?: { data?: { token?: string } }
    }
    const token = loginBody.result?.data?.token
    expect(token).toBeTruthy()

    await page.context().addCookies([
      {
        name: '_future_session',
        value: token as string,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ])

    await page.goto('/org-chart')

    await expect(page.getByRole('heading', { name: 'Org chart' })).toBeVisible()

    // No stale fallback text from old implementation
    await expect(page.getByText(/Unnamed employee/i)).toHaveCount(0)
    await expect(page.getByText(/No title/i)).toHaveCount(0)

    // Toolbar: filter chips, compact toggle, export button
    await expect(page.getByLabel('Team filter')).toBeVisible()
    await expect(page.getByText('Location')).toBeVisible()
    await expect(page.getByRole('button', { name: /compact view/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /export org chart/i })).toBeVisible()

    // Zoom controls (floating)
    await expect(page.getByRole('button', { name: /zoom in/i })).toBeVisible()

    // Org cards render from the preloaded tree
    const cardCount = await page.locator('[data-testid="org-card"]').count()
    expect(cardCount).toBeGreaterThan(0)

    // Compact view toggles cards to pills
    await page.getByRole('button', { name: /compact view/i }).click()
    await expect(page.locator('[data-testid="org-card"]')).toHaveCount(0)
    await page.getByRole('button', { name: /compact view/i }).click()
    await expect(page.locator('[data-testid="org-card"]').first()).toBeVisible()

    // Expand a node if possible
    const expandButtons = page.getByRole('button', { name: /expand direct reports/i })
    if ((await expandButtons.count()) > 0) {
      await expandButtons.first().click()
    }

    // Navigate to profile
    const viewProfileButton = page.getByRole('button', { name: /view profile/i }).first()
    await expect(viewProfileButton).toBeVisible()
    await viewProfileButton.click()

    await expect(page).toHaveURL(/\/profile\//)
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add apps/e2e/tests/people-org-chart.spec.ts
git commit -m "test(e2e): update org chart E2E for new toolbar and compact mode"
```

---

## Self-Review Notes

- All types (`OrgChartToolbarProps`, `OrgChartZoomControlsProps`) defined in their own files and referenced correctly in tests.
- `OrgChartNodeComponent` compact pill `aria-label` matches the test query `expand direct reports for Sam Self`.
- The retry button `aria-label` remains `Retry direct reports for ${node.fullName}` — matches the existing spec test `retry direct reports for Sam Self`.
- `html2canvas` is a static import — Next.js `'use client'` boundary means no SSR conflict.
- `toast` imported from `@future/ui` which re-exports from `sonner` — consistent with the pattern in the codebase.
- Zoom controls are rendered _inside_ the canvas wrapper div but _outside_ the `canvasRef` div — the `canvasRef` is on the inner transform div, so the zoom controls are excluded from the `html2canvas` capture automatically.
- The `OrgChartTree.spec.tsx` mock (`mockChart`) includes `availableTeams: []` — the toolbar renders the ghost Team chip when `selectedTeamId: null` and `teams: []`, which is fine for tests.

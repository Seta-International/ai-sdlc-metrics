# OrgChartNode Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `compact` prop to `OrgChartNodeComponent` that renders a 1-line avatar + name pill instead of the dense card, and fix the connector structure by adding a horizontal rail (`border-t`) across the children row.

**Architecture:** Two changes in one file. (1) Compact branch: when `compact=true`, the `<Card>` is replaced by a `<button>` pill showing avatar, name, and You badge — clicking expands/collapses. (2) Connector fix: add `border-t border-sidebar-border` to the children flex wrapper so siblings share a horizontal rail instead of floating independently. Both changes are isolated to `OrgChartNode.tsx`; no other files change in this plan.

**Tech Stack:** React (`'use client'`), `next/image`, `@future/ui` (Alert, AlertDescription, Badge, Button, Card, CardContent, Skeleton), `@future/ui/icons` (ArrowUpCircle, ChevronDown, ChevronRight, UserIcon, Users), Vitest + Testing Library

---

## File Structure

| File                                                   | Action     | Responsibility                                           |
| ------------------------------------------------------ | ---------- | -------------------------------------------------------- |
| `apps/web-people/src/components/OrgChartNode.spec.tsx` | **Modify** | Add compact mode + connector tests                       |
| `apps/web-people/src/components/OrgChartNode.tsx`      | **Modify** | Add `compact` prop + pill render branch + connector rail |

---

## Task 1: Add failing tests for compact mode and connector rail

**Files:**

- Modify: `apps/web-people/src/components/OrgChartNode.spec.tsx`

- [ ] **Step 1: Add 4 new test cases**

Open `apps/web-people/src/components/OrgChartNode.spec.tsx`. Add the import for `OrgChartNode` type if it is not already present at the top:

```tsx
import type { OrgChartNode } from '../lib/types'
```

Then append the following 4 tests inside the existing `describe('OrgChartNodeComponent')` block, before the closing `})`:

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

- [ ] **Step 2: Run tests to verify the new cases fail**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartNode.spec.tsx
```

Expected: The 4 new tests FAIL (compact prop does not exist yet). The existing 5 tests PASS.

---

## Task 2: Update OrgChartNode implementation

**Files:**

- Modify: `apps/web-people/src/components/OrgChartNode.tsx`

- [ ] **Step 1: Replace the full file contents**

Replace `apps/web-people/src/components/OrgChartNode.tsx` with:

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
              aria-label={`Retry direct reports for ${node.fullName}`}
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

- [ ] **Step 2: Run all OrgChartNode tests to verify they pass**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartNode.spec.tsx
```

Expected: All 9 tests PASS (5 existing + 4 new).

- [ ] **Step 3: Commit**

```bash
git add apps/web-people/src/components/OrgChartNode.tsx \
        apps/web-people/src/components/OrgChartNode.spec.tsx
git commit -m "feat(web-people): add compact mode and horizontal connector rail to OrgChartNode"
```

# OrgChartTree Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install `html2canvas`, rewrite `OrgChartTree` to wire `OrgChartToolbar`, `OrgChartZoomControls`, and the updated `OrgChartNodeComponent` together with compact/export state, then update the unit and E2E tests.

**Architecture:** `OrgChartTree` owns all mutable state (`zoom`, `pan`, `isCompact`, `isExporting`) and a `canvasRef` for PNG capture. The "Reporting context" panel, the "Drag canvas to pan" hint, and the top-panel zoom buttons are removed. `OrgChartCanvasContent` gains a `compact` prop threaded down to every node.

**Prerequisites:** Plans A (`OrgChartToolbar`), B (`OrgChartZoomControls`), and C (`OrgChartNode` updates) must all be merged before executing this plan.

**Tech Stack:** React (`'use client'`), `html2canvas`, `@future/ui` (Alert, AlertDescription, Button, Skeleton, toast), `@future/ui/icons` (ArrowUpCircle), Vitest + Testing Library, Playwright E2E

---

## File Structure

| File                                                   | Action               | Responsibility                                                   |
| ------------------------------------------------------ | -------------------- | ---------------------------------------------------------------- |
| `apps/web-people/package.json`                         | **Modify** (via CLI) | Add `html2canvas` dependency                                     |
| `apps/web-people/src/components/OrgChartTree.spec.tsx` | **Modify**           | Update stale assertions, add compact toggle test                 |
| `apps/web-people/src/components/OrgChartTree.tsx`      | **Modify**           | Full rewrite — wire all sub-components + export                  |
| `apps/e2e/tests/people-org-chart.spec.ts`              | **Modify**           | Remove removed-element assertions, add export/compact assertions |

---

## Task 1: Install html2canvas

**Files:**

- Modify: `apps/web-people/package.json` (via CLI)

- [ ] **Step 1: Add the dependency**

Run from the repo root:

```bash
bun add --cwd apps/web-people html2canvas
```

- [ ] **Step 2: Verify**

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

## Task 2: Update OrgChartTree unit tests

**Files:**

- Modify: `apps/web-people/src/components/OrgChartTree.spec.tsx`

The current spec has one test that asserts export is **absent** — that assertion is now wrong. It also lacks a compact toggle test. This task fixes both before the implementation lands.

- [ ] **Step 1: Replace the stale toolbar test and add the compact toggle test**

In `apps/web-people/src/components/OrgChartTree.spec.tsx`:

**a) Remove this test entirely:**

```tsx
it('renders a V1 read-only toolbar without search, alternate modes, bulk actions, or export', () => {
  render(<OrgChartTree />)

  expect(screen.getByRole('button', { name: /zoom out/i })).toBeTruthy()
  expect(screen.getByRole('button', { name: /zoom in/i })).toBeTruthy()
  expect(screen.getByRole('button', { name: /reset view/i })).toBeTruthy()
  expect(screen.queryByPlaceholderText(/find person/i)).toBeNull()
  expect(screen.queryByText(/department/i)).toBeNull()
  expect(screen.queryByText(/expand all/i)).toBeNull()
  expect(screen.queryByText(/collapse all/i)).toBeNull()
  expect(screen.queryByText(/export/i)).toBeNull()
})
```

**b) Insert this replacement in its place:**

```tsx
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

**c) Append this test at the end of the `describe` block (before the closing `})`):**

```tsx
it('toggles compact mode when compact view button is clicked', () => {
  render(<OrgChartTree />)

  const btn = screen.getByRole('button', { name: /compact view/i })
  expect(btn.getAttribute('aria-pressed')).toBe('false')

  fireEvent.click(btn)
  expect(btn.getAttribute('aria-pressed')).toBe('true')
})
```

- [ ] **Step 2: Run the spec to confirm the updated tests fail**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartTree.spec.tsx
```

Expected: The renamed toolbar test and the compact toggle test FAIL (new buttons not yet in the tree). All other existing tests PASS.

---

## Task 3: Rewrite OrgChartTree

**Files:**

- Modify: `apps/web-people/src/components/OrgChartTree.tsx`

- [ ] **Step 1: Replace the full file contents**

Replace `apps/web-people/src/components/OrgChartTree.tsx` with:

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

- [ ] **Step 2: Run all OrgChartTree tests**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartTree.spec.tsx
```

Expected: All tests PASS. Verify these specifically:

- `renders toolbar with zoom controls, filter chips, compact toggle, and export button` — PASS
- `controls zoom locally and shows the current percentage` — PASS (zoom controls still rendered by `OrgChartZoomControls` inside the tree)
- `renders Team filter and visual-only Location chip in toolbar` — PASS (`getByLabelText(/team filter/i)` matches the ghost chip `aria-label`)
- `toggles compact mode when compact view button is clicked` — PASS

- [ ] **Step 3: Run the full web-people unit suite to catch regressions**

Run:

```bash
bun run --cwd apps/web-people test:unit
```

Expected: All tests PASS with zero failures.

- [ ] **Step 4: Commit**

```bash
git add apps/web-people/src/components/OrgChartTree.tsx \
        apps/web-people/src/components/OrgChartTree.spec.tsx
git commit -m "feat(web-people): wire OrgChartTree with toolbar, zoom controls, compact mode, and export"
```

---

## Task 4: Update E2E tests

**Files:**

- Modify: `apps/e2e/tests/people-org-chart.spec.ts`

- [ ] **Step 1: Replace the full file contents**

Replace `apps/e2e/tests/people-org-chart.spec.ts` with:

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

    // Zoom controls (floating pill)
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

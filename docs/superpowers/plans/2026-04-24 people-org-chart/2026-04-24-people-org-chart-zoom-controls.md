# OrgChartZoomControls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `OrgChartZoomControls` — a floating pill anchored to the bottom-right of the canvas that houses zoom in/out, percentage display, and reset view controls.

**Architecture:** Pure presentational component positioned `absolute bottom-3.5 right-3.5` inside the canvas `div`. Receives all state and callbacks from `OrgChartTree`. The canvas `handlePointerDown` already bails out on `button` clicks so no CSS pointer-event workaround is needed.

**Tech Stack:** React (`'use client'`), `@future/ui` (Button), `@future/ui/icons` (Maximize2, Minus, Plus), Vitest + Testing Library

---

## File Structure

| File                                                           | Action     | Responsibility           |
| -------------------------------------------------------------- | ---------- | ------------------------ |
| `apps/web-people/src/components/OrgChartZoomControls.spec.tsx` | **Create** | Unit tests               |
| `apps/web-people/src/components/OrgChartZoomControls.tsx`      | **Create** | Component implementation |

---

## Task 1: Write failing tests

**Files:**

- Create: `apps/web-people/src/components/OrgChartZoomControls.spec.tsx`

- [ ] **Step 1: Create the spec file**

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

---

## Task 2: Implement OrgChartZoomControls

**Files:**

- Create: `apps/web-people/src/components/OrgChartZoomControls.tsx`

- [ ] **Step 1: Create the component**

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

- [ ] **Step 2: Run tests to verify they pass**

Run:

```bash
bun run --cwd apps/web-people test:unit src/components/OrgChartZoomControls.spec.tsx
```

Expected: All 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web-people/src/components/OrgChartZoomControls.tsx \
        apps/web-people/src/components/OrgChartZoomControls.spec.tsx
git commit -m "feat(web-people): add OrgChartZoomControls floating pill"
```

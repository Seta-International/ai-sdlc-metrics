# Planner Board Polish — Plan 02: Visual Primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `ProgressIcon` and `PriorityIcon` to match the design spec — distinct shapes per state, hardcoded colors instead of Tailwind tokens, semantically distinct SVG per priority level.

**Architecture:** Both components are pure presentational SVG renderers with no side effects. Tests use `@testing-library/react` to render and inspect SVG attributes. No tRPC, no React Query, no mocks needed.

**Tech Stack:** React, Vitest + `@testing-library/react`, inline SVG (no third-party icon library)

**Spec source:** `docs/superpowers/specs/2026-05-04-planner-board-polish-design.md` §2.2 and §2.3

---

**Exit criteria:**

- `ProgressIcon` renders a dashed stroke for `progress=0`, amber fill for `progress=50`, `#10b981` fill with `#0a0a0b` checkmark for `progress=100`. No Tailwind color token classes on `<svg>` elements.
- `PriorityIcon` renders four semantically different SVG shapes — horizontal dash (Normal/3), 3-bar chart with dim top bar (Low/1), 3 fully-filled bars (Important/5), amber rect with `!` (Urgent/9). No Tailwind color token classes.
- Both spec files pass: `bun run --filter @future/web-planner test:unit -- --reporter=verbose ProgressIcon PriorityIcon`.
- No regressions in `TaskCard.spec.tsx` (which uses both icons).

---

### Task 1: `ProgressIcon` — unit tests first

**Files:**

- Create: `apps/web-planner/src/components/primitives/ProgressIcon.spec.tsx`

- [ ] **Step 1: Write the failing tests**

  Create `ProgressIcon.spec.tsx`:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import React from 'react'
  import { ProgressIcon } from './ProgressIcon'

  describe('ProgressIcon', () => {
    describe('progress=0 (Not started)', () => {
      it('has aria-label "Not started"', () => {
        render(<ProgressIcon progress={0} />)
        expect(screen.getByRole('img', { name: 'Not started' })).toBeDefined()
      })

      it('renders a dashed stroke circle (strokeDasharray="2 2")', () => {
        const { container } = render(<ProgressIcon progress={0} />)
        const circle = container.querySelector('circle')
        expect(circle?.getAttribute('stroke-dasharray')).toBe('2 2')
      })

      it('uses hardcoded color #62666d, not a Tailwind class', () => {
        const { container } = render(<ProgressIcon progress={0} />)
        const svg = container.querySelector('svg')
        expect(svg?.className).not.toContain('text-fg-muted')
        const circle = container.querySelector('circle')
        expect(circle?.getAttribute('stroke')).toBe('#62666d')
      })
    })

    describe('progress=50 (In progress)', () => {
      it('has aria-label "In progress"', () => {
        render(<ProgressIcon progress={50} />)
        expect(screen.getByRole('img', { name: 'In progress' })).toBeDefined()
      })

      it('uses amber fill #f59e0b, not text-brand class', () => {
        const { container } = render(<ProgressIcon progress={50} />)
        const svg = container.querySelector('svg')
        expect(svg?.className).not.toContain('text-brand')
        // The half-fill path uses fill="currentColor" — verify the svg has no color class
        // that could be purple/brand. Instead color is set inline on path/circle.
        const path = container.querySelector('path')
        expect(path?.getAttribute('fill')).toBe('#f59e0b')
      })
    })

    describe('progress=100 (Complete)', () => {
      it('has aria-label "Complete"', () => {
        render(<ProgressIcon progress={100} />)
        expect(screen.getByRole('img', { name: 'Complete' })).toBeDefined()
      })

      it('uses emerald fill #10b981 for circle', () => {
        const { container } = render(<ProgressIcon progress={100} />)
        const circle = container.querySelector('circle')
        expect(circle?.getAttribute('fill')).toBe('#10b981')
      })

      it('uses dark stroke #0a0a0b for checkmark path, not white', () => {
        const { container } = render(<ProgressIcon progress={100} />)
        const path = container.querySelector('path')
        expect(path?.getAttribute('stroke')).toBe('#0a0a0b')
      })
    })
  })
  ```

- [ ] **Step 2: Run to verify failure**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose ProgressIcon.spec
  ```

  Expected: FAIL — current icon uses Tailwind classes, no `strokeDasharray`, wrong colors.

---

### Task 2: `ProgressIcon` — implement the redesign

**Files:**

- Modify: `apps/web-planner/src/components/primitives/ProgressIcon.tsx`

- [ ] **Step 3: Replace the component**

  Replace the entire file with:

  ```tsx
  export type Progress = 0 | 50 | 100

  interface ProgressIconProps {
    progress: Progress
    className?: string
  }

  export function ProgressIcon({ progress, className = 'size-3.5' }: ProgressIconProps) {
    if (progress === 100) {
      return (
        <svg
          viewBox="0 0 14 14"
          fill="none"
          role="img"
          aria-label="Complete"
          className={`${className} flex-shrink-0`}
        >
          <circle cx={7} cy={7} r={6} fill="#10b981" />
          <path
            d="M4.5 7l2 2 3-3"
            stroke="#0a0a0b"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    }

    if (progress === 50) {
      return (
        <svg
          viewBox="0 0 14 14"
          fill="none"
          role="img"
          aria-label="In progress"
          className={`${className} flex-shrink-0`}
        >
          <circle cx={7} cy={7} r={6} stroke="#f59e0b" strokeWidth={1.5} />
          <path d="M7 1 A6 6 0 0 1 7 13 Z" fill="#f59e0b" />
        </svg>
      )
    }

    // progress === 0 — dashed circle, always visible
    return (
      <svg
        viewBox="0 0 14 14"
        fill="none"
        role="img"
        aria-label="Not started"
        className={`${className} flex-shrink-0`}
      >
        <circle cx={7} cy={7} r={6} stroke="#62666d" strokeWidth={1.5} strokeDasharray="2 2" />
      </svg>
    )
  }
  ```

- [ ] **Step 4: Run to verify tests pass**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose ProgressIcon.spec
  ```

  Expected: PASS — all 7 tests green.

- [ ] **Step 5: Verify no regressions in TaskCard**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose TaskCard.spec
  ```

  Expected: PASS — `TaskCard` renders `ProgressIcon`; existing tests still pass.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web-planner/src/components/primitives/ProgressIcon.tsx \
          apps/web-planner/src/components/primitives/ProgressIcon.spec.tsx
  git commit -m "feat(web-planner): redesign ProgressIcon — dashed/amber/dark-checkmark"
  ```

---

### Task 3: `PriorityIcon` — unit tests first

**Files:**

- Create: `apps/web-planner/src/components/primitives/PriorityIcon.spec.tsx`

- [ ] **Step 7: Write the failing tests**

  Create `PriorityIcon.spec.tsx`:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import React from 'react'
  import { PriorityIcon } from './PriorityIcon'

  describe('PriorityIcon', () => {
    describe('priority=1 (Low)', () => {
      it('has aria-label "Low"', () => {
        render(<PriorityIcon priority={1} />)
        expect(screen.getByRole('img', { name: 'Low' })).toBeDefined()
      })

      it('renders exactly 3 rect bars', () => {
        const { container } = render(<PriorityIcon priority={1} />)
        const rects = container.querySelectorAll('rect')
        expect(rects).toHaveLength(3)
      })

      it('renders the tallest bar (index 2) with dim fill rgba(138,143,152,0.25)', () => {
        const { container } = render(<PriorityIcon priority={1} />)
        const rects = Array.from(container.querySelectorAll('rect'))
        // The dim bar is the rightmost/tallest one (index 2 in the render order)
        const dimBar = rects.find((r) => r.getAttribute('fill') === 'rgba(138,143,152,0.25)')
        expect(dimBar).toBeDefined()
      })

      it('renders 2 filled bars with color #62666d', () => {
        const { container } = render(<PriorityIcon priority={1} />)
        const rects = Array.from(container.querySelectorAll('rect'))
        const filledBars = rects.filter((r) => r.getAttribute('fill') === '#62666d')
        expect(filledBars).toHaveLength(2)
      })

      it('has no Tailwind color token class on svg', () => {
        const { container } = render(<PriorityIcon priority={1} />)
        const svg = container.querySelector('svg')
        expect(svg?.className).not.toContain('text-')
      })
    })

    describe('priority=3 (Normal)', () => {
      it('has aria-label "Normal"', () => {
        render(<PriorityIcon priority={3} />)
        expect(screen.getByRole('img', { name: 'Normal' })).toBeDefined()
      })

      it('renders a horizontal line element (not bars)', () => {
        const { container } = render(<PriorityIcon priority={3} />)
        const line = container.querySelector('line')
        expect(line).not.toBeNull()
        expect(container.querySelectorAll('rect')).toHaveLength(0)
      })

      it('uses stroke color #8a8f98', () => {
        const { container } = render(<PriorityIcon priority={3} />)
        const line = container.querySelector('line')
        expect(line?.getAttribute('stroke')).toBe('#8a8f98')
      })
    })

    describe('priority=5 (Important)', () => {
      it('has aria-label "Important"', () => {
        render(<PriorityIcon priority={5} />)
        expect(screen.getByRole('img', { name: 'Important' })).toBeDefined()
      })

      it('renders exactly 3 bars all filled with #d0d6e0', () => {
        const { container } = render(<PriorityIcon priority={5} />)
        const rects = Array.from(container.querySelectorAll('rect'))
        expect(rects).toHaveLength(3)
        expect(rects.every((r) => r.getAttribute('fill') === '#d0d6e0')).toBe(true)
      })
    })

    describe('priority=9 (Urgent)', () => {
      it('has aria-label "Urgent"', () => {
        render(<PriorityIcon priority={9} />)
        expect(screen.getByRole('img', { name: 'Urgent' })).toBeDefined()
      })

      it('renders an amber filled rect (the square background)', () => {
        const { container } = render(<PriorityIcon priority={9} />)
        const rect = container.querySelector('rect')
        expect(rect?.getAttribute('fill')).toBe('#f59e0b')
        expect(rect?.getAttribute('rx')).toBe('2')
      })

      it('renders a path for the ! mark with dark stroke', () => {
        const { container } = render(<PriorityIcon priority={9} />)
        const path = container.querySelector('path')
        expect(path?.getAttribute('stroke')).toBe('#0a0a0b')
      })
    })
  })
  ```

- [ ] **Step 8: Run to verify failure**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose PriorityIcon.spec
  ```

  Expected: FAIL — current icon has 4 bars, uses Tailwind color classes, aria-labels differ.

---

### Task 4: `PriorityIcon` — implement the redesign

**Files:**

- Modify: `apps/web-planner/src/components/primitives/PriorityIcon.tsx`

- [ ] **Step 9: Replace the component**

  Replace the entire file with:

  ```tsx
  export type Priority = 1 | 3 | 5 | 9

  interface PriorityIconProps {
    priority: Priority
    className?: string
  }

  export function PriorityIcon({ priority, className = 'size-3.5' }: PriorityIconProps) {
    // Low: 2 filled bars + 1 dim bar (3-bar ascending chart)
    if (priority === 1) {
      return (
        <svg
          viewBox="0 0 12 12"
          fill="none"
          role="img"
          aria-label="Low"
          className={`${className} flex-shrink-0`}
        >
          <rect x={1} y={8} width={2} height={3} rx={0.5} fill="#62666d" />
          <rect x={5} y={5} width={2} height={6} rx={0.5} fill="#62666d" />
          <rect x={9} y={2} width={2} height={9} rx={0.5} fill="rgba(138,143,152,0.25)" />
        </svg>
      )
    }

    // Normal: horizontal dash line
    if (priority === 3) {
      return (
        <svg
          viewBox="0 0 12 12"
          fill="none"
          role="img"
          aria-label="Normal"
          className={`${className} flex-shrink-0`}
        >
          <line
            x1={2}
            y1={6}
            x2={10}
            y2={6}
            stroke="#8a8f98"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
      )
    }

    // Important: 3 bars all fully filled
    if (priority === 5) {
      return (
        <svg
          viewBox="0 0 12 12"
          fill="none"
          role="img"
          aria-label="Important"
          className={`${className} flex-shrink-0`}
        >
          <rect x={1} y={8} width={2} height={3} rx={0.5} fill="#d0d6e0" />
          <rect x={5} y={5} width={2} height={6} rx={0.5} fill="#d0d6e0" />
          <rect x={9} y={2} width={2} height={9} rx={0.5} fill="#d0d6e0" />
        </svg>
      )
    }

    // Urgent (9): amber square + ! path
    return (
      <svg
        viewBox="0 0 12 12"
        fill="none"
        role="img"
        aria-label="Urgent"
        className={`${className} flex-shrink-0`}
      >
        <rect x={1} y={1} width={10} height={10} rx={2} fill="#f59e0b" />
        <path d="M6 3.5v3.5M6 9v.5" stroke="#0a0a0b" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    )
  }
  ```

- [ ] **Step 10: Run to verify tests pass**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose PriorityIcon.spec
  ```

  Expected: PASS — all 14 tests green.

- [ ] **Step 11: Verify no regressions in TaskCard**

  ```bash
  bun run --filter @future/web-planner test:unit -- --reporter=verbose TaskCard.spec
  ```

  Expected: PASS.

- [ ] **Step 12: Commit**

  ```bash
  git add apps/web-planner/src/components/primitives/PriorityIcon.tsx \
          apps/web-planner/src/components/primitives/PriorityIcon.spec.tsx
  git commit -m "feat(web-planner): redesign PriorityIcon — 4 distinct shapes per level"
  ```

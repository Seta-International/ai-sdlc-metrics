# Embedded Agent — Plan 04: Inline & Ambient Surfaces

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the inline contextual action components (`AgentInlineAction`, `AgentInlineResponse`) and ambient insight components (`AgentStrip`, `AgentBadge`, `AgentBanner`). These are the two non-panel surfaces that make agents visible across all zones.

**Architecture:** Inline actions render on entity pages — users click to trigger an agent action scoped to the current entity context. Ambient components surface proactive insights globally (AgentStrip in GlobalNav) and locally (AgentBadge/AgentBanner on entity pages).

**Tech Stack:** React 19, TypeScript, Vitest, `lucide-react`

**Spec Reference:** `docs/superpowers/specs/2026-04-15-agent-embedded-design.md` — Inline Actions Flow, Ambient Insights Flow

**Depends On:** Plan 01 (types, providers, hooks), Plan 02 (backend routes)

---

## File Structure

### Files to CREATE

```
packages/agent/src/inline/agent-inline-action.tsx
packages/agent/src/inline/agent-inline-action.spec.tsx
packages/agent/src/inline/agent-inline-response.tsx
packages/agent/src/ambient/agent-strip.tsx
packages/agent/src/ambient/agent-strip.spec.tsx
packages/agent/src/ambient/agent-badge.tsx
packages/agent/src/ambient/agent-badge.spec.tsx
packages/agent/src/ambient/agent-banner.tsx
packages/agent/src/ambient/agent-banner.spec.tsx
```

### Files to MODIFY

```
packages/agent/src/index.ts → export new components
```

---

### Task 1: AgentInlineAction component

**Files:**

- Create: `packages/agent/src/inline/agent-inline-action.tsx`
- Create: `packages/agent/src/inline/agent-inline-action.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/src/inline/agent-inline-action.spec.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { AgentInlineAction } from './agent-inline-action'
import { AgentContextProvider } from '../context/agent-context-provider'
import { AgentStateProvider } from '../hooks/use-agent-state'

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    AgentStateProvider,
    null,
    createElement(
      AgentContextProvider,
      { module: 'people', entity: 'employee', id: 'emp-1' },
      children,
    ),
  )
}

describe('AgentInlineAction', () => {
  const actions = [
    { key: 'summarize', label: 'Summarize' },
    { key: 'draft-offboarding', label: 'Draft Offboarding' },
  ]

  it('renders action buttons', () => {
    render(<AgentInlineAction actions={actions} />, { wrapper })
    expect(screen.getByText('Summarize')).toBeDefined()
    expect(screen.getByText('Draft Offboarding')).toBeDefined()
  })

  it('calls onAction when an action is clicked', () => {
    const onAction = vi.fn()
    render(<AgentInlineAction actions={actions} onAction={onAction} />, { wrapper })
    fireEvent.click(screen.getByText('Summarize'))
    expect(onAction).toHaveBeenCalledWith('summarize', {
      module: 'people',
      entity: 'employee',
      id: 'emp-1',
      metadata: undefined,
    })
  })

  it('renders nothing when no actions provided', () => {
    const { container } = render(<AgentInlineAction actions={[]} />, { wrapper })
    expect(container.firstElementChild?.children.length ?? 0).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/inline/agent-inline-action.spec.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement AgentInlineAction**

Create `packages/agent/src/inline/agent-inline-action.tsx`:

```tsx
import { Sparkles } from 'lucide-react'
import type { AgentInlineActionConfig, AgentContext } from '../types'
import { useAgentContext } from '../context/use-agent-context'

export interface AgentInlineActionProps {
  actions: AgentInlineActionConfig[]
  onAction?: (actionKey: string, context: AgentContext) => void
}

export function AgentInlineAction({ actions, onAction }: AgentInlineActionProps) {
  const ctx = useAgentContext()

  if (actions.length === 0) return <div />

  const handleClick = (actionKey: string) => {
    if (ctx && onAction) {
      onAction(actionKey, ctx)
    }
  }

  return (
    <div className="flex items-center gap-1">
      {actions.map((action) => {
        const Icon = action.icon ?? Sparkles
        return (
          <button
            key={action.key}
            onClick={() => handleClick(action.key)}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon className="h-3.5 w-3.5" />
            {action.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/inline/agent-inline-action.spec.tsx
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/inline/agent-inline-action.tsx packages/agent/src/inline/agent-inline-action.spec.tsx
git commit -m "feat(agent): add AgentInlineAction component"
```

---

### Task 2: AgentInlineResponse component

**Files:**

- Create: `packages/agent/src/inline/agent-inline-response.tsx`

- [ ] **Step 1: Implement AgentInlineResponse**

Create `packages/agent/src/inline/agent-inline-response.tsx`:

```tsx
import { X } from 'lucide-react'

export interface AgentInlineResponseProps {
  content: string
  isStreaming?: boolean
  onDismiss: () => void
  onContinueInPanel?: () => void
}

export function AgentInlineResponse({
  content,
  isStreaming,
  onDismiss,
  onContinueInPanel,
}: AgentInlineResponseProps) {
  return (
    <div className="mt-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 text-sm">
          {content}
          {isStreaming && (
            <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-foreground" />
          )}
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {onContinueInPanel && !isStreaming && (
        <button onClick={onContinueInPanel} className="mt-2 text-xs text-primary hover:underline">
          Continue in panel →
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
bun run --filter @future/agent build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/inline/agent-inline-response.tsx
git commit -m "feat(agent): add AgentInlineResponse component"
```

---

### Task 3: AgentStrip component

**Files:**

- Create: `packages/agent/src/ambient/agent-strip.tsx`
- Create: `packages/agent/src/ambient/agent-strip.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/src/ambient/agent-strip.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { AgentStrip } from './agent-strip'
import { AgentStateProvider, useAgentState } from '../hooks/use-agent-state'
import type { AgentInsight } from '../types'
import { renderHook, act } from '@testing-library/react'

const mockInsights: AgentInsight[] = [
  {
    id: '1',
    module: 'people',
    entity: 'employee',
    entityId: 'emp-1',
    severity: 'warning',
    title: 'Visa expiring',
    description: 'Visa expires in 30 days',
    createdAt: new Date(),
  },
  {
    id: '2',
    module: 'people',
    entity: 'employee',
    entityId: 'emp-2',
    severity: 'critical',
    title: 'Contract expired',
    description: 'Contract expired yesterday',
    createdAt: new Date(),
  },
  {
    id: '3',
    module: 'projects',
    entity: 'project',
    entityId: 'proj-1',
    severity: 'info',
    title: 'Staffing gap',
    description: 'Project understaffed',
    createdAt: new Date(),
  },
]

function InsightSeeder({ insights, children }: { insights: AgentInsight[]; children: ReactNode }) {
  const { setInsights } = useAgentState()
  setInsights(insights)
  return <>{children}</>
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    AgentStateProvider,
    null,
    createElement(InsightSeeder, { insights: mockInsights }, children),
  )
}

function emptyWrapper({ children }: { children: ReactNode }) {
  return createElement(AgentStateProvider, null, children)
}

describe('AgentStrip', () => {
  it('shows total insight count', () => {
    render(<AgentStrip />, { wrapper })
    expect(screen.getByText(/3 insights/)).toBeDefined()
  })

  it('groups insights by module', () => {
    render(<AgentStrip />, { wrapper })
    expect(screen.getByText(/People/)).toBeDefined()
    expect(screen.getByText(/Projects/)).toBeDefined()
  })

  it('renders nothing when no insights', () => {
    const { container } = render(<AgentStrip />, { wrapper: emptyWrapper })
    expect(container.firstElementChild?.textContent ?? '').toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/ambient/agent-strip.spec.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement AgentStrip**

Create `packages/agent/src/ambient/agent-strip.tsx`:

```tsx
import { Sparkles } from 'lucide-react'
import { useAgentState } from '../hooks/use-agent-state'

const MODULE_LABELS: Record<string, string> = {
  people: 'People',
  time: 'Time',
  hiring: 'Hiring',
  performance: 'Performance',
  projects: 'Projects',
  finance: 'Finance',
  goals: 'Goals',
  insights: 'Insights',
  planner: 'Planner',
  admin: 'Admin',
  kernel: 'Kernel',
}

export function AgentStrip() {
  const { insights } = useAgentState()

  if (insights.length === 0) return <div />

  const grouped = insights.reduce<Record<string, number>>((acc, insight) => {
    acc[insight.module] = (acc[insight.module] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-b bg-muted/30 px-4 text-xs text-muted-foreground">
      <Sparkles className="h-3 w-3" />
      <span>
        {insights.length} insight{insights.length !== 1 ? 's' : ''}
      </span>
      <span className="text-border">·</span>
      {Object.entries(grouped).map(([mod, count]) => (
        <span key={mod}>
          {MODULE_LABELS[mod] ?? mod} ({count})
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/ambient/agent-strip.spec.tsx
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/ambient/agent-strip.tsx packages/agent/src/ambient/agent-strip.spec.tsx
git commit -m "feat(agent): add AgentStrip ambient component"
```

---

### Task 4: AgentBadge component

**Files:**

- Create: `packages/agent/src/ambient/agent-badge.tsx`
- Create: `packages/agent/src/ambient/agent-badge.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/src/ambient/agent-badge.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { AgentBadge } from './agent-badge'
import { AgentStateProvider, useAgentState } from '../hooks/use-agent-state'
import { AgentContextProvider } from '../context/agent-context-provider'
import type { AgentInsight } from '../types'

const insights: AgentInsight[] = [
  {
    id: '1',
    module: 'people',
    entity: 'employee',
    entityId: 'emp-1',
    severity: 'warning',
    title: 'Visa expiring',
    description: 'Visa expires in 30 days',
    createdAt: new Date(),
  },
  {
    id: '2',
    module: 'people',
    entity: 'employee',
    entityId: 'emp-2',
    severity: 'critical',
    title: 'Other employee issue',
    description: 'Not this entity',
    createdAt: new Date(),
  },
]

function InsightSeeder({ children }: { children: ReactNode }) {
  const { setInsights } = useAgentState()
  setInsights(insights)
  return <>{children}</>
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    AgentStateProvider,
    null,
    createElement(
      InsightSeeder,
      null,
      createElement(
        AgentContextProvider,
        { module: 'people', entity: 'employee', id: 'emp-1' },
        children,
      ),
    ),
  )
}

function noMatchWrapper({ children }: { children: ReactNode }) {
  return createElement(
    AgentStateProvider,
    null,
    createElement(
      InsightSeeder,
      null,
      createElement(
        AgentContextProvider,
        { module: 'time', entity: 'leave-request', id: 'lr-1' },
        children,
      ),
    ),
  )
}

describe('AgentBadge', () => {
  it('shows count for matching entity insights', () => {
    render(<AgentBadge />, { wrapper })
    expect(screen.getByText('1')).toBeDefined()
  })

  it('renders nothing when no matching insights', () => {
    const { container } = render(<AgentBadge />, { wrapper: noMatchWrapper })
    expect(container.textContent).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/ambient/agent-badge.spec.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement AgentBadge**

Create `packages/agent/src/ambient/agent-badge.tsx`:

```tsx
import { Sparkles } from 'lucide-react'
import { useAgentState } from '../hooks/use-agent-state'
import { useAgentContext } from '../context/use-agent-context'

export function AgentBadge() {
  const { insights } = useAgentState()
  const ctx = useAgentContext()

  if (!ctx) return null

  const matching = insights.filter(
    (i) => i.module === ctx.module && i.entity === ctx.entity && i.entityId === ctx.id,
  )

  if (matching.length === 0) return null

  const hasCritical = matching.some((i) => i.severity === 'critical')
  const hasWarning = matching.some((i) => i.severity === 'warning')

  const colorClass = hasCritical
    ? 'bg-destructive text-destructive-foreground'
    : hasWarning
      ? 'bg-yellow-500 text-white'
      : 'bg-muted text-muted-foreground'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
    >
      <Sparkles className="h-3 w-3" />
      {matching.length}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/ambient/agent-badge.spec.tsx
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/ambient/agent-badge.tsx packages/agent/src/ambient/agent-badge.spec.tsx
git commit -m "feat(agent): add AgentBadge component"
```

---

### Task 5: AgentBanner component

**Files:**

- Create: `packages/agent/src/ambient/agent-banner.tsx`
- Create: `packages/agent/src/ambient/agent-banner.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/src/ambient/agent-banner.spec.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { AgentBanner } from './agent-banner'
import { AgentStateProvider, useAgentState } from '../hooks/use-agent-state'
import { AgentContextProvider } from '../context/agent-context-provider'
import type { AgentInsight } from '../types'

const insights: AgentInsight[] = [
  {
    id: '1',
    module: 'people',
    entity: 'employee',
    entityId: 'emp-1',
    severity: 'warning',
    title: 'Visa expiring soon',
    description: 'Employee visa expires in 30 days. Consider starting renewal.',
    actionLabel: 'Draft renewal',
    actionHref: '/employees/emp-1/visa',
    createdAt: new Date(),
  },
]

function InsightSeeder({ children }: { children: ReactNode }) {
  const { setInsights } = useAgentState()
  setInsights(insights)
  return <>{children}</>
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    AgentStateProvider,
    null,
    createElement(
      InsightSeeder,
      null,
      createElement(
        AgentContextProvider,
        { module: 'people', entity: 'employee', id: 'emp-1' },
        children,
      ),
    ),
  )
}

describe('AgentBanner', () => {
  it('shows the highest severity insight for current entity', () => {
    render(<AgentBanner />, { wrapper })
    expect(screen.getByText('Visa expiring soon')).toBeDefined()
    expect(screen.getByText(/visa expires in 30 days/i)).toBeDefined()
  })

  it('shows action link when available', () => {
    render(<AgentBanner />, { wrapper })
    expect(screen.getByText('Draft renewal')).toBeDefined()
  })

  it('can be dismissed', () => {
    render(<AgentBanner />, { wrapper })
    const dismissButton = screen.getByRole('button')
    fireEvent.click(dismissButton)
    expect(screen.queryByText('Visa expiring soon')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/ambient/agent-banner.spec.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement AgentBanner**

Create `packages/agent/src/ambient/agent-banner.tsx`:

```tsx
import { useState } from 'react'
import { AlertTriangle, Info, AlertCircle, X } from 'lucide-react'
import { useAgentState } from '../hooks/use-agent-state'
import { useAgentContext } from '../context/use-agent-context'

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const
const SEVERITY_ICONS = { critical: AlertCircle, warning: AlertTriangle, info: Info } as const
const SEVERITY_STYLES = {
  critical: 'border-destructive/50 bg-destructive/10 text-destructive',
  warning: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  info: 'border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-400',
} as const

export function AgentBanner() {
  const { insights } = useAgentState()
  const ctx = useAgentContext()
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  if (!ctx) return null

  const matching = insights
    .filter(
      (i) =>
        i.module === ctx.module &&
        i.entity === ctx.entity &&
        i.entityId === ctx.id &&
        !dismissedIds.has(i.id),
    )
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  const top = matching[0]
  if (!top) return null

  const Icon = SEVERITY_ICONS[top.severity]

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 ${SEVERITY_STYLES[top.severity]}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 text-sm">
        <div className="font-medium">{top.title}</div>
        <div className="mt-0.5 opacity-80">{top.description}</div>
        {top.actionLabel && top.actionHref && (
          <a href={top.actionHref} className="mt-1.5 inline-block text-xs font-medium underline">
            {top.actionLabel}
          </a>
        )}
      </div>
      <button
        onClick={() => setDismissedIds((prev) => new Set([...prev, top.id]))}
        className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/ambient/agent-banner.spec.tsx
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/ambient/agent-banner.tsx packages/agent/src/ambient/agent-banner.spec.tsx
git commit -m "feat(agent): add AgentBanner component"
```

---

### Task 6: Export all new components

**Files:**

- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Add exports**

Add to `packages/agent/src/index.ts`:

```typescript
// Inline
export { AgentInlineAction } from './inline/agent-inline-action'
export type { AgentInlineActionProps } from './inline/agent-inline-action'
export { AgentInlineResponse } from './inline/agent-inline-response'
export type { AgentInlineResponseProps } from './inline/agent-inline-response'

// Ambient
export { AgentStrip } from './ambient/agent-strip'
export { AgentBadge } from './ambient/agent-badge'
export { AgentBanner } from './ambient/agent-banner'
```

- [ ] **Step 2: Run all tests**

```bash
bun vitest run --config packages/agent/vitest.config.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Verify build**

```bash
bun run --filter @future/agent build
```

Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/index.ts
git commit -m "feat(agent): export inline and ambient components from index"
```

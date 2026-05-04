# Agent UX Refactor — Plan 6: Iteration view + collapsed rail + ambient/inline restyle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three independent UI-only sub-tasks bundled as the cleanup plan: (1) iteration grouping in the thread, (2) collapsed `AIChatRail` with localStorage persistence, (3) restyle `AgentStrip`, `AgentBadge`, `AgentBanner`, `AgentInlineAction`, `AgentInlineResponse` with Plan 1 primitives.

**Architecture:** No backend changes. All work in `packages/agent/src/`. Ambient/inline restyle replaces ad-hoc Tailwind with `Tag`/`Mono`/`TinyBtn`/accent tokens for visual coherence with the panel.

**Tech Stack:** React 19 · `@assistant-ui/react` · Vitest · `useSyncExternalStore` (per CLAUDE.md SSR rule).

**Spec:** `docs/superpowers/specs/2026-04-30-agent-module-ux-refactor-design.md` §9

**Depends on:** Plans 1, 2, 5 (`Tag`, `Mono`, `TinyBtn`, `IterationStep`, `ActionFooter`, `AnswerBubble`).

---

## Task 1: Pre-flight + branch

```bash
git checkout main && git pull
git checkout -b feat/agent-ux-plan-6-iteration-rail-ambient
```

---

## Task 2: `IterationGroup` + `IterationHeader`

Group consecutive iteration parts (`agent.iteration` tool calls) under a single header. The turn-store + Plan 2 already produce one part per `iteration.*` chain — this plan adds visual grouping.

**Files:**

- Create: `packages/agent/src/thread/iteration/iteration-header.tsx`
- Create: `packages/agent/src/thread/iteration/iteration-header.spec.tsx`
- Create: `packages/agent/src/thread/iteration/iteration-group.tsx`
- Create: `packages/agent/src/thread/iteration/iteration-group.spec.tsx`

- [ ] **Step 1: `IterationHeader` test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { IterationHeader } from './iteration-header'

describe('IterationHeader', () => {
  it('shows iter N of M with loop icon', () => {
    render(<IterationHeader current={2} total={3} />)
    expect(screen.getByText(/iter 2 of 3/i)).toBeTruthy()
  })

  it('hides total when only one iteration', () => {
    render(<IterationHeader current={1} total={1} />)
    expect(screen.getByText(/iter 1/)).toBeTruthy()
    expect(screen.queryByText(/of 1/)).toBeNull()
  })
})
```

- [ ] **Step 2: Implement**

```tsx
import { Repeat } from 'lucide-react'

export interface IterationHeaderProps {
  current: number
  total: number
}

export function IterationHeader({ current, total }: IterationHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-accent">
      <Repeat className="h-2.5 w-2.5" />
      iter {current}
      {total > 1 && <span className="text-muted-foreground/70"> of {total}</span>}
    </div>
  )
}
```

- [ ] **Step 3: `IterationGroup` test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { IterationGroup } from './iteration-group'

describe('IterationGroup', () => {
  const iterations = [
    { n: 1, summary: 'first attempt summary' },
    { n: 2, summary: 'second attempt summary' },
    { n: 3, summary: 'final answer summary' },
  ]

  it('shows header iter N of M', () => {
    render(
      <IterationGroup iterations={iterations}>
        {(iter) => <div key={iter.n}>{iter.summary}</div>}
      </IterationGroup>,
    )
    expect(screen.getByText(/iter 3 of 3/i)).toBeTruthy()
  })

  it('renders only the latest iteration body expanded', () => {
    render(
      <IterationGroup iterations={iterations}>
        {(iter, expanded) => (expanded ? <div>{iter.summary}</div> : null)}
      </IterationGroup>,
    )
    expect(screen.queryByText('first attempt summary')).toBeNull()
    expect(screen.queryByText('second attempt summary')).toBeNull()
    expect(screen.getByText('final answer summary')).toBeTruthy()
  })

  it('expands a prior iteration when its summary row is clicked', () => {
    render(
      <IterationGroup iterations={iterations}>
        {(iter, expanded) => (expanded ? <div>{iter.summary}</div> : null)}
      </IterationGroup>,
    )
    fireEvent.click(screen.getByText(/first attempt summary/i, { selector: 'button *' }))
    expect(screen.getByText('first attempt summary')).toBeTruthy()
  })
})
```

- [ ] **Step 4: Implement**

```tsx
'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { IterationHeader } from './iteration-header'

export interface IterationGroupItem {
  n: number
  summary: string
}

export interface IterationGroupProps<T extends IterationGroupItem> {
  iterations: T[]
  children: (iteration: T, expanded: boolean) => ReactNode
}

export function IterationGroup<T extends IterationGroupItem>({
  iterations,
  children,
}: IterationGroupProps<T>) {
  const total = iterations.length
  const lastN = iterations[total - 1]?.n ?? 1
  const [expandedNs, setExpandedNs] = useState<Set<number>>(new Set([lastN]))

  const toggle = (n: number) =>
    setExpandedNs((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })

  return (
    <div className="flex flex-col gap-1">
      <IterationHeader current={lastN} total={total} />
      {iterations.map((iter) => {
        const expanded = expandedNs.has(iter.n)
        const isLast = iter.n === lastN
        if (expanded) {
          return (
            <div key={iter.n} className="rounded-md border border-white/[0.05] p-2">
              {children(iter, true)}
            </div>
          )
        }
        return (
          <button
            type="button"
            key={iter.n}
            onClick={() => toggle(iter.n)}
            className="flex w-full items-center gap-1.5 rounded-md border border-white/[0.04] bg-white/[0.01] px-2 py-1 text-left hover:bg-white/[0.02]"
          >
            <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/70" />
            <span className="font-mono text-[10px] text-muted-foreground/70">iter {iter.n}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {iter.summary.slice(0, 80)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Run tests + commit**

```bash
bun run --filter @future/agent test:unit -- iteration
git add packages/agent/src/thread/iteration
git commit -m "feat(agent): IterationGroup + IterationHeader"
```

---

## Task 3: Wire iteration grouping into the thread

The current `AgentThread` (Plans 2 + 5) emits `agent.iteration` parts inline. Wrap them in an `IterationGroup` when there's more than one.

**Files:**

- Modify: `packages/agent/src/thread/agent-thread.tsx`

- [ ] **Step 1: Adjust the assistant message renderer**

Replace `AgentAssistantMessage` to scan content parts and group iteration parts. Add this helper above the component:

```tsx
import type { IterationPartArgs } from '../runtime/agent-message-parts'
import { IterationGroup } from './iteration/iteration-group'
import { IterationStep } from './cards/iteration-step'

interface IterationPartLike {
  toolName: string
  args: IterationPartArgs
}

function partitionIterationParts(
  parts: ReadonlyArray<{ type: string; toolName?: string; args?: unknown }>,
) {
  const iterations: IterationPartArgs[] = []
  const others: typeof parts = [] as never
  for (const p of parts) {
    if (p.type === 'tool-call' && p.toolName === 'agent.iteration' && p.args) {
      iterations.push(p.args as IterationPartArgs)
    } else {
      ;(others as unknown as Array<typeof p>).push(p)
    }
  }
  return { iterations, others }
}
```

Then update `AgentAssistantMessage` to render iterations as a single group:

```tsx
function AgentAssistantMessage() {
  const message = useMessage() // adapt to actual hook name
  const { iterations, others } = partitionIterationParts(message.content as never)

  return (
    <MessagePrimitive.Root className="flex flex-col gap-2 px-3 py-1">
      {iterations.length > 0 && (
        <IterationGroup
          iterations={iterations.map((it) => ({
            n: it.n,
            summary: `${it.subAgentDomain} — ${it.selectionReason}`,
            data: it,
          }))}
        >
          {(item) => (
            <IterationStep
              {...(item as unknown as IterationGroupItem & { data: IterationPartArgs }).data}
            />
          )}
        </IterationGroup>
      )}
      <MessagePrimitive.Content
        components={{
          Text: ({ part }) => <AnswerBubble>{part.text}</AnswerBubble>,
        }}
      />
      {/* ActionFooter wiring from Plan 5 unchanged */}
    </MessagePrimitive.Root>
  )
}
```

> **Implementation note:** the assistant-ui slot for "all the parts of this message in render order" varies. If using `MessagePrimitive.Content` for everything was sufficient before, we may need to drop down to a manual loop over `useMessage().content` and render parts via the registered tool UIs. The semantic is: when ≥2 iteration parts are present, group them visually under one header; the synthesizer text continues to render below.

- [ ] **Step 2: Test the grouping with a fixture**

Add to `agent-thread.spec.tsx`:

```tsx
it('groups multiple iteration parts under one header', () => {
  // Construct a Runtime that yields a message with three agent.iteration tool-call parts.
  // Mount AgentThread, expect: one IterationHeader showing "iter 3 of 3".
  // Assert two prior iteration rows are collapsed (only summary visible),
  // last iteration is expanded (full IterationStep body visible).
})
```

- [ ] **Step 3: Build + test + commit**

```bash
bun run --filter @future/agent test:unit
git add packages/agent/src/thread/agent-thread.tsx packages/agent/src/thread/agent-thread.spec.tsx
git commit -m "feat(agent): group iteration parts under IterationGroup in thread"
```

---

## Task 4: SSR-safe collapsed-state hook

Persist `collapsed` per-surface in localStorage, SSR-safe per CLAUDE.md.

**Files:**

- Create: `packages/agent/src/panel/rail/use-collapsed-state.ts`
- Create: `packages/agent/src/panel/rail/use-collapsed-state.spec.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCollapsedState } from './use-collapsed-state'

describe('useCollapsedState', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to false when no entry in localStorage', () => {
    const { result } = renderHook(() => useCollapsedState('planner'))
    expect(result.current[0]).toBe(false)
  })

  it('reads true from localStorage', () => {
    localStorage.setItem('agent-panel-collapsed:planner', '1')
    const { result } = renderHook(() => useCollapsedState('planner'))
    expect(result.current[0]).toBe(true)
  })

  it('writes to localStorage on setCollapsed(true)', () => {
    const { result } = renderHook(() => useCollapsedState('planner'))
    act(() => result.current[1](true))
    expect(localStorage.getItem('agent-panel-collapsed:planner')).toBe('1')
  })

  it('removes from localStorage on setCollapsed(false)', () => {
    localStorage.setItem('agent-panel-collapsed:planner', '1')
    const { result } = renderHook(() => useCollapsedState('planner'))
    act(() => result.current[1](false))
    expect(localStorage.getItem('agent-panel-collapsed:planner')).toBeNull()
  })

  it('isolates surfaces — planner key does not affect people key', () => {
    const { result: planner } = renderHook(() => useCollapsedState('planner'))
    const { result: people } = renderHook(() => useCollapsedState('people'))
    act(() => planner.current[1](true))
    expect(people.current[0]).toBe(false)
  })
})
```

- [ ] **Step 2: Implement**

```ts
'use client'

import { useCallback, useSyncExternalStore } from 'react'

const KEY = (surface: string) => `agent-panel-collapsed:${surface}`

const subscribe = (cb: () => void) => {
  if (typeof window === 'undefined') return () => {}
  const handler = () => cb()
  window.addEventListener('storage', handler)
  window.addEventListener('agent-collapsed-change', handler)
  return () => {
    window.removeEventListener('storage', handler)
    window.removeEventListener('agent-collapsed-change', handler)
  }
}

export function useCollapsedState(surface: string): readonly [boolean, (next: boolean) => void] {
  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(KEY(surface)) === '1'
  }, [surface])

  const getServerSnapshot = useCallback(() => false, [])

  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setCollapsed = useCallback(
    (next: boolean) => {
      if (typeof window === 'undefined') return
      if (next) window.localStorage.setItem(KEY(surface), '1')
      else window.localStorage.removeItem(KEY(surface))
      window.dispatchEvent(new Event('agent-collapsed-change'))
    },
    [surface],
  )

  return [collapsed, setCollapsed] as const
}
```

- [ ] **Step 3: Test + commit**

```bash
bun run --filter @future/agent test:unit -- use-collapsed-state
git add packages/agent/src/panel/rail
git commit -m "feat(agent): SSR-safe useCollapsedState hook"
```

---

## Task 5: `AIChatRail` (collapsed strip)

**Files:**

- Create: `packages/agent/src/panel/rail/agent-chat-rail.tsx`
- Create: `packages/agent/src/panel/rail/agent-chat-rail.spec.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AgentChatRail } from './agent-chat-rail'

describe('AgentChatRail', () => {
  it('renders the spark icon and an expand button', () => {
    render(<AgentChatRail onExpand={() => {}} />)
    expect(screen.getByRole('button', { name: 'Expand panel' })).toBeTruthy()
  })

  it('fires onExpand when clicked', () => {
    const onExpand = vi.fn()
    render(<AgentChatRail onExpand={onExpand} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }))
    expect(onExpand).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Implement**

```tsx
'use client'

import { Sparkles, PanelRightOpen } from 'lucide-react'
import { IconBtn } from '../../primitives/icon-btn'

export interface AgentChatRailProps {
  onExpand: () => void
}

export function AgentChatRail({ onExpand }: AgentChatRailProps) {
  return (
    <aside
      data-testid="agent-chat-rail"
      className="dark flex h-full w-11 flex-shrink-0 flex-col items-center gap-2 border-l border-white/[0.05] bg-sidebar py-2"
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-gradient-to-br from-accent to-accent/60 text-white">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <IconBtn aria-label="Expand panel" title="Expand" onClick={onExpand}>
        <PanelRightOpen className="h-3.5 w-3.5" />
      </IconBtn>
    </aside>
  )
}
```

- [ ] **Step 3: Test + commit**

```bash
bun run --filter @future/agent test:unit -- agent-chat-rail
git add packages/agent/src/panel/rail
git commit -m "feat(agent): AIChatRail collapsed strip"
```

---

## Task 6: Hook `AIChatRail` + `useCollapsedState` into `AgentPanel`

**Files:**

- Modify: `packages/agent/src/panel/agent-panel.tsx`

- [ ] **Step 1: Replace the placeholder rail slot**

```tsx
import { AgentChatRail } from './rail/agent-chat-rail'
import { useCollapsedState } from './rail/use-collapsed-state'

export function AgentPanel({ endpoint = '/api/agent/turn' }: AgentPanelProps) {
  const ctx = useAgentContext()
  const [collapsed, setCollapsed] = useCollapsedState(ctx?.module ?? 'unknown')
  // ... rest unchanged ...

  if (collapsed) {
    return <AgentChatRail onExpand={() => setCollapsed(false)} />
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="dark h-full w-96 ...">
        <AgentPanelHeader
          // ...
          onCollapse={() => setCollapsed(true)}
        />
        {/* ... */}
      </div>
    </AssistantRuntimeProvider>
  )
}
```

Remove the now-unused `useAgentState().collapsed` reference.

- [ ] **Step 2: Update `agent-panel.spec.tsx` collapsed test**

The previous test (Plan 1) used `useAgentState`'s in-memory `collapsed`. Update to use `useCollapsedState`:

```tsx
it('shows the rail when localStorage indicates collapsed', () => {
  localStorage.setItem('agent-panel-collapsed:planner', '1')
  render(wrap(<AgentPanel />))
  expect(screen.getByTestId('agent-chat-rail')).toBeTruthy()
})

it('expand button toggles localStorage and shows full panel', () => {
  localStorage.setItem('agent-panel-collapsed:planner', '1')
  render(wrap(<AgentPanel />))
  fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }))
  expect(localStorage.getItem('agent-panel-collapsed:planner')).toBeNull()
  expect(screen.getByText('Action Intelligence')).toBeTruthy()
})
```

- [ ] **Step 3: Decide on `useAgentState.collapsed`**

Either:

- (a) Remove the `collapsed`/`setCollapsed` fields from `useAgentState` (Plan 1 added them as a stub). The rail is now driven entirely by `useCollapsedState`. Update the use-agent-state spec accordingly.
- (b) Keep the in-memory state for non-panel callers (e.g. tests, non-zone callers without localStorage).

**Recommended: (a)** — single source of truth, no duplicate state. Per "no backward compat".

- [ ] **Step 4: Build + test + commit**

```bash
bun run --filter @future/agent test:unit
git add packages/agent/src/panel packages/agent/src/hooks/use-agent-state.tsx packages/agent/src/hooks/use-agent-state.spec.ts
git commit -m "feat(agent): drive rail via useCollapsedState; drop in-memory collapsed"
```

---

## Task 7: Restyle `AgentStrip`

**Files:**

- Modify: `packages/agent/src/ambient/agent-strip.tsx`
- Modify: `packages/agent/src/ambient/agent-strip.spec.tsx`

- [ ] **Step 1: Update the existing test** (snapshot or class assertions) to expect new tokens

```tsx
it('uses dark surface tokens', () => {
  const { container } = render(<AgentStrip />)
  // assume insights are seeded — expect bg-sidebar / border-white tokens, not bg-muted
  expect(container.firstChild?.className).toMatch(/bg-sidebar|border-white/)
})
```

- [ ] **Step 2: Rewrite component using primitives**

```tsx
'use client'

import { Sparkles } from 'lucide-react'
import { useAgentState } from '../hooks/use-agent-state'
import { Tag } from '../primitives/tag'
import { Mono } from '../primitives/mono'

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
  if (insights.length === 0) return null

  const grouped = insights.reduce<Record<string, number>>((acc, insight) => {
    acc[insight.module] = (acc[insight.module] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="dark flex h-7 flex-shrink-0 items-center gap-2 border-b border-white/[0.05] bg-sidebar px-3 text-muted-foreground">
      <Sparkles className="h-3 w-3 text-accent" />
      <Mono className="text-foreground">
        {insights.length} insight{insights.length !== 1 ? 's' : ''}
      </Mono>
      <span className="text-muted-foreground/50">·</span>
      {Object.entries(grouped).map(([mod, count]) => (
        <Tag key={mod}>
          {MODULE_LABELS[mod] ?? mod} ({count})
        </Tag>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Test + commit**

```bash
bun run --filter @future/agent test:unit -- agent-strip
git add packages/agent/src/ambient/agent-strip.tsx packages/agent/src/ambient/agent-strip.spec.tsx
git commit -m "feat(agent): restyle AgentStrip with design tokens"
```

---

## Task 8: Restyle `AgentBadge`

**Files:**

- Modify: `packages/agent/src/ambient/agent-badge.tsx`
- Modify: `packages/agent/src/ambient/agent-badge.spec.tsx`

- [ ] **Step 1: Rewrite using `Tag`**

```tsx
'use client'

import { Sparkles } from 'lucide-react'
import { useAgentState } from '../hooks/use-agent-state'
import { useAgentContext } from '../context/use-agent-context'
import { Tag } from '../primitives/tag'

export function AgentBadge() {
  const { insights } = useAgentState()
  const ctx = useAgentContext()

  if (!ctx) return null
  const matching = insights.filter(
    (i) => i.module === ctx.module && i.entity === ctx.entity && i.entityId === ctx.id,
  )
  if (matching.length === 0) return null

  const variant = matching.some((i) => i.severity === 'critical')
    ? 'danger'
    : matching.some((i) => i.severity === 'warning')
      ? 'warning'
      : 'accent'

  return (
    <Tag variant={variant}>
      <Sparkles className="mr-0.5 h-2.5 w-2.5" />
      {matching.length}
    </Tag>
  )
}
```

- [ ] **Step 2: Update tests** — assert correct `Tag` variant per severity.

- [ ] **Step 3: Commit**

```bash
bun run --filter @future/agent test:unit -- agent-badge
git add packages/agent/src/ambient/agent-badge.tsx packages/agent/src/ambient/agent-badge.spec.tsx
git commit -m "feat(agent): restyle AgentBadge with Tag primitive"
```

---

## Task 9: Restyle `AgentBanner`

**Files:**

- Modify: `packages/agent/src/ambient/agent-banner.tsx`
- Modify: `packages/agent/src/ambient/agent-banner.spec.tsx`

- [ ] **Step 1: Replace severity styles with token-based equivalents**

Map old severity styles to new dark-surface equivalents:

```ts
const SEVERITY_STYLES = {
  critical: 'border-red-400/30 bg-red-400/[0.06] text-red-300',
  warning: 'border-amber-400/30 bg-amber-400/[0.06] text-amber-300',
  info: 'border-accent/30 bg-accent/[0.06] text-accent',
} as const
```

Replace the dismiss `<button>` with `IconBtn`. Use `Tag` for the severity label and `TinyBtn` for any CTA.

- [ ] **Step 2: Tests + commit**

```bash
bun run --filter @future/agent test:unit -- agent-banner
git add packages/agent/src/ambient/agent-banner.tsx packages/agent/src/ambient/agent-banner.spec.tsx
git commit -m "feat(agent): restyle AgentBanner with design tokens"
```

---

## Task 10: Restyle `AgentInlineAction`

**Files:**

- Modify: `packages/agent/src/inline/agent-inline-action.tsx`
- Modify: `packages/agent/src/inline/agent-inline-action.spec.tsx`

- [ ] **Step 1: Replace raw `<button>` with `TinyBtn`**

```tsx
'use client'

import { Sparkles } from 'lucide-react'
import type { AgentInlineActionConfig, AgentContext } from '../types'
import { useAgentContext } from '../context/use-agent-context'
import { TinyBtn } from '../primitives/tiny-btn'

export interface AgentInlineActionProps {
  actions: AgentInlineActionConfig[]
  onAction?: (actionKey: string, context: AgentContext) => void
}

export function AgentInlineAction({ actions, onAction }: AgentInlineActionProps) {
  const ctx = useAgentContext()
  if (actions.length === 0) return null

  return (
    <div className="flex items-center gap-1">
      {actions.map((action) => {
        const Icon = action.icon ?? Sparkles
        return (
          <TinyBtn key={action.key} onClick={() => ctx && onAction?.(action.key, ctx)}>
            <Icon className="mr-1 h-2.5 w-2.5 text-accent" />
            {action.label}
          </TinyBtn>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Update tests** — query by role: `getByRole('button', { name: action.label })` still works since `TinyBtn` renders a `<button>`.

- [ ] **Step 3: Commit**

```bash
bun run --filter @future/agent test:unit -- agent-inline-action
git add packages/agent/src/inline/agent-inline-action.tsx packages/agent/src/inline/agent-inline-action.spec.tsx
git commit -m "feat(agent): restyle AgentInlineAction with TinyBtn"
```

---

## Task 11: Restyle `AgentInlineResponse` to use shared primitives

**Files:**

- Modify: `packages/agent/src/inline/agent-inline-response.tsx`
- Modify: `packages/agent/src/inline/agent-inline-response.spec.tsx`

- [ ] **Step 1: Inspect the current implementation**

```bash
cat packages/agent/src/inline/agent-inline-response.tsx
```

- [ ] **Step 2: Wrap response text in `AnswerBubble` and append a compact `ActionFooter`**

The inline response should:

- Render the assistant text via `AnswerBubble` for visual coherence
- Append `ActionFooter` (compact: hide Iterate which only makes sense in the panel)

Add an optional `compact` prop to `ActionFooter` (`packages/agent/src/thread/footer/action-footer.tsx`) that hides the Iterate button. Update its tests.

`agent-inline-response.tsx` skeleton:

```tsx
'use client'

import { AnswerBubble } from '../thread/cards/answer-bubble'
import { ActionFooter } from '../thread/footer/action-footer'

export interface AgentInlineResponseProps {
  messageId: string
  sessionId: string
  text: string
}

export function AgentInlineResponse({ messageId, sessionId, text }: AgentInlineResponseProps) {
  return (
    <div className="dark flex flex-col gap-1 rounded-md border border-white/[0.05] bg-sidebar p-2">
      <AnswerBubble>{text}</AnswerBubble>
      <ActionFooter
        messageId={messageId}
        sessionId={sessionId}
        text={text}
        isLastAssistantTurn
        onIterate={() => {}}
        compact
      />
    </div>
  )
}
```

- [ ] **Step 3: Tests + commit**

```bash
bun run --filter @future/agent test:unit -- agent-inline-response action-footer
git add packages/agent/src/inline/agent-inline-response.tsx packages/agent/src/inline/agent-inline-response.spec.tsx packages/agent/src/thread/footer/action-footer.tsx packages/agent/src/thread/footer/action-footer.spec.tsx
git commit -m "feat(agent): inline response uses AnswerBubble + compact ActionFooter"
```

---

## Task 12: Export new modules + verify consumers

**Files:**

- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Add exports**

```ts
export { IterationGroup } from './thread/iteration/iteration-group'
export type { IterationGroupProps, IterationGroupItem } from './thread/iteration/iteration-group'
export { IterationHeader } from './thread/iteration/iteration-header'
export type { IterationHeaderProps } from './thread/iteration/iteration-header'
export { AgentChatRail } from './panel/rail/agent-chat-rail'
export type { AgentChatRailProps } from './panel/rail/agent-chat-rail'
export { useCollapsedState } from './panel/rail/use-collapsed-state'
```

- [ ] **Step 2: Build the world**

```bash
bun run --filter "@future/*" build
bun run --filter "@future/*" test:unit
```

Expected: green. If any zone breaks because it referenced the old `useAgentState().collapsed` shape, fix that consumer in this same PR.

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/index.ts
git commit -m "feat(agent): export iteration + rail surface"
```

---

## Task 13: PR

```bash
git push -u origin feat/agent-ux-plan-6-iteration-rail-ambient
gh pr create --title "feat(agent): UX refactor plan 6 — iteration view + rail + ambient/inline restyle" --body "$(cat <<'EOF'
## Summary

- `IterationGroup` + `IterationHeader`: groups consecutive `agent.iteration` parts under a single "iter N of M" header; prior iterations collapse to one-line summary, current expands
- `AIChatRail` + `useCollapsedState`: 44px vertical strip with spark logo + expand button; collapsed flag persisted per-surface in localStorage via `useSyncExternalStore` (SSR-safe)
- Ambient restyle: `AgentStrip`, `AgentBadge`, `AgentBanner` use `Tag`/`Mono`/accent tokens and dark surfaces
- Inline restyle: `AgentInlineAction` uses `TinyBtn`; `AgentInlineResponse` wraps text in `AnswerBubble` + compact `ActionFooter`
- `useAgentState.collapsed` removed (replaced by `useCollapsedState` — single source of truth)

Plan 6 of 6. Spec §9. **This is the final plan; ships the agent module UX refactor.**

## Test plan

- [ ] CI green
- [ ] Manual: iterative agent run → `iter 3 of 3` header, click prior iteration → expands
- [ ] Manual: collapse panel → rail appears; reload → still collapsed (localStorage)
- [ ] Manual: switch zones (planner ↔ people) → collapsed state isolated per zone
- [ ] Manual: AgentBadge shows on entity → correct severity color (red / amber / accent)
- [ ] Manual: AgentInlineResponse below an inline-action → matches panel visual style

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

- [ ] No `__tests__/` dirs
- [ ] `useCollapsedState` SSR-safe — `getServerSnapshot` returns `false` (not `undefined`)
- [ ] localStorage write dispatches `agent-collapsed-change` event so other tabs/components in same tab re-render
- [ ] `useAgentState.collapsed` field fully removed; no callers reference the old shape
- [ ] Ambient/inline components no longer reference `bg-muted`, `bg-card`, `text-destructive` etc. — only design-system tokens
- [ ] `ActionFooter compact` mode hides Iterate cleanly (no layout breakage)

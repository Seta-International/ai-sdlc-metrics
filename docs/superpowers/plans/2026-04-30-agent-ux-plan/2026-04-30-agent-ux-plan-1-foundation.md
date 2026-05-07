# Agent UX Refactor — Plan 1: Foundation (primitives + panel chrome)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare `AgentPanel` with a three-row dark-themed shell (header + meta strip + scroll region + composer) and ship the shared primitives (`Tag`, `Mono`, `TinyBtn`, `IconBtn`, `ToolCallShell`) that Plans 2/3/6 consume. Extend `agent-turn-store` with `streaming` + `usage`. Extend `useAgentState` with `collapsed`.

**Architecture:** All new files live in `packages/agent/src/`. No backend changes. Plan 1 is sequential — every later plan depends on these primitives. Component tests with `@testing-library/react` + `vitest`. Co-located specs (`foo.tsx` + `foo.spec.tsx`), no `__tests__/` dirs (banned per CLAUDE.md).

**Tech Stack:** React 19 · TypeScript · Tailwind CSS (via `@future/ui` tokens) · zustand · `@assistant-ui/react` 0.12 · Vitest · jsdom · `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-04-30-agent-module-ux-refactor-design.md` §4

---

## Task 1: Pre-flight baseline

**Files:** none.

- [ ] **Step 1: Verify package builds and tests pass on `main`**

```bash
bun run --filter @future/agent build
bun run --filter @future/agent test:unit
```

Expected: build succeeds, all tests pass.

- [ ] **Step 2: Branch off main**

```bash
git checkout main
git pull
git checkout -b feat/agent-ux-plan-1-foundation
```

---

## Task 2: Add `streaming` + `usage` to `agent-turn-store`

**Files:**

- Modify: `packages/agent/src/runtime/agent-turn-store.ts`
- Modify: `packages/agent/src/runtime/agent-turn-store.spec.ts`

- [ ] **Step 1: Write failing tests for new fields**

Append to `packages/agent/src/runtime/agent-turn-store.spec.ts`:

```ts
describe('streaming flag', () => {
  it('is false initially', () => {
    const store = createAgentTurnStore()
    expect(store.getState().streaming).toBe(false)
  })

  it('flips true on turn.started and false on turn.ended', () => {
    const store = createAgentTurnStore()
    store.getState().dispatch({
      seq: 1,
      type: 'turn.started',
      payload: { trace_id: 't1', conversation_id: null, topology: 'bounded' },
    })
    expect(store.getState().streaming).toBe(true)
    store.getState().dispatch({
      seq: 9,
      type: 'turn.ended',
      payload: {
        reason: 'completed',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        },
      },
    })
    expect(store.getState().streaming).toBe(false)
  })

  it('flips false on refusal.started', () => {
    const store = createAgentTurnStore()
    store.getState().dispatch({
      seq: 1,
      type: 'turn.started',
      payload: { trace_id: 't1', conversation_id: null, topology: 'bounded' },
    })
    store.getState().dispatch({
      seq: 2,
      type: 'refusal.started',
      payload: { reason: 'rate_limit', retry_allowed: false },
    })
    expect(store.getState().streaming).toBe(false)
  })

  it('reset() returns streaming to false', () => {
    const store = createAgentTurnStore()
    store.getState().dispatch({
      seq: 1,
      type: 'turn.started',
      payload: { trace_id: 't1', conversation_id: null, topology: 'bounded' },
    })
    store.getState().reset()
    expect(store.getState().streaming).toBe(false)
  })
})

describe('usage snapshot', () => {
  it('captures last usage from iteration.ended', () => {
    const store = createAgentTurnStore()
    store.getState().dispatch({
      seq: 5,
      type: 'iteration.ended',
      payload: {
        n: 1,
        is_complete: true,
        usage: {
          input_tokens: 20,
          output_tokens: 8,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        },
      },
    })
    expect(store.getState().usage).toEqual({
      input_tokens: 20,
      output_tokens: 8,
      input_cached_read: 0,
      input_cached_write: 0,
      output_reasoning: 0,
    })
  })

  it('overwrites usage on later turn.ended', () => {
    const store = createAgentTurnStore()
    store.getState().dispatch({
      seq: 5,
      type: 'iteration.ended',
      payload: {
        n: 1,
        is_complete: false,
        usage: {
          input_tokens: 20,
          output_tokens: 8,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        },
      },
    })
    store.getState().dispatch({
      seq: 9,
      type: 'turn.ended',
      payload: {
        reason: 'completed',
        usage: {
          input_tokens: 30,
          output_tokens: 12,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        },
      },
    })
    expect(store.getState().usage?.input_tokens).toBe(30)
    expect(store.getState().usage?.output_tokens).toBe(12)
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
bun run --filter @future/agent test:unit -- agent-turn-store
```

Expected: 6 new failures (`streaming` undefined, `usage` undefined).

- [ ] **Step 3: Implement the new fields**

Modify `packages/agent/src/runtime/agent-turn-store.ts`. Replace the `AgentTurnState` interface and `initialState` constant:

```ts
import { createStore } from 'zustand/vanilla'
import type {
  SseEvent,
  DraftPayload,
  TurnEndReason,
  RefusalReason,
  UsageSnapshot,
} from './sse-event-schema'

export interface AgentTurnState {
  traceId: string | null
  topology: 'bounded' | 'iterative' | null
  phase: 1 | 2 | null
  activeSubAgents: string[]
  shape: string | null
  drafts: DraftPayload[]
  isRefused: boolean
  refusalReason: RefusalReason | null
  isEnded: boolean
  endReason: TurnEndReason | null
  streaming: boolean
  usage: UsageSnapshot | null
  dispatch: (event: SseEvent) => void
  reset: () => void
}

const initialState = {
  traceId: null as string | null,
  topology: null as 'bounded' | 'iterative' | null,
  phase: null as 1 | 2 | null,
  activeSubAgents: [] as string[],
  shape: null as string | null,
  drafts: [] as DraftPayload[],
  isRefused: false,
  refusalReason: null as RefusalReason | null,
  isEnded: false,
  endReason: null as TurnEndReason | null,
  streaming: false,
  usage: null as UsageSnapshot | null,
}
```

Update the `dispatch` switch — add `streaming`/`usage` updates to the relevant cases:

```ts
case 'turn.started':
  set({ traceId: event.payload.trace_id, topology: event.payload.topology, streaming: true })
  break
case 'iteration.ended':
  set({ usage: event.payload.usage })
  break
case 'refusal.started':
  set({ isRefused: true, refusalReason: event.payload.reason, streaming: false })
  break
case 'turn.ended':
  set({ isEnded: true, endReason: event.payload.reason, streaming: false, usage: event.payload.usage })
  break
```

- [ ] **Step 4: Run tests — verify pass**

```bash
bun run --filter @future/agent test:unit -- agent-turn-store
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/runtime/agent-turn-store.ts packages/agent/src/runtime/agent-turn-store.spec.ts
git commit -m "feat(agent): add streaming + usage to agent-turn-store"
```

---

## Task 3: Add `collapsed` to `useAgentState`

**Files:**

- Modify: `packages/agent/src/hooks/use-agent-state.tsx`
- Modify: `packages/agent/src/hooks/use-agent-state.spec.ts`

- [ ] **Step 1: Write failing test**

Append to `packages/agent/src/hooks/use-agent-state.spec.ts`:

```ts
import { renderHook, act } from '@testing-library/react'
import { AgentStateProvider, useAgentState } from './use-agent-state'

describe('collapsed', () => {
  it('defaults to false', () => {
    const { result } = renderHook(() => useAgentState(), {
      wrapper: AgentStateProvider,
    })
    expect(result.current.collapsed).toBe(false)
  })

  it('setCollapsed flips it', () => {
    const { result } = renderHook(() => useAgentState(), {
      wrapper: AgentStateProvider,
    })
    act(() => {
      result.current.setCollapsed(true)
    })
    expect(result.current.collapsed).toBe(true)
    act(() => {
      result.current.setCollapsed(false)
    })
    expect(result.current.collapsed).toBe(false)
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
bun run --filter @future/agent test:unit -- use-agent-state
```

Expected: 2 new failures.

- [ ] **Step 3: Implement**

Modify `packages/agent/src/hooks/use-agent-state.tsx`. Add `collapsed`/`setCollapsed` to the context value:

```ts
export interface AgentStateContextValue {
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void
  insights: AgentInsight[]
  setInsights: (insights: AgentInsight[]) => void
  addInsight: (insight: AgentInsight) => void
  dismissInsight: (id: string) => void
}
```

Inside `AgentStateProvider`, add a `useState`:

```ts
const [collapsed, setCollapsed] = useState(false)
```

Pass it through the provider value.

- [ ] **Step 4: Run tests — verify pass**

```bash
bun run --filter @future/agent test:unit -- use-agent-state
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/hooks/use-agent-state.tsx packages/agent/src/hooks/use-agent-state.spec.ts
git commit -m "feat(agent): add collapsed flag to useAgentState"
```

---

## Task 4: `Tag` primitive

**Files:**

- Create: `packages/agent/src/primitives/tag.tsx`
- Create: `packages/agent/src/primitives/tag.spec.tsx`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/primitives/tag.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Tag } from './tag'

describe('Tag', () => {
  it('renders children inside an uppercase pill', () => {
    render(<Tag>live</Tag>)
    const el = screen.getByText('live')
    expect(el).toBeTruthy()
    expect(el.className).toMatch(/uppercase/)
  })

  it('applies the variant class for "success"', () => {
    render(<Tag variant="success">ok</Tag>)
    const el = screen.getByText('ok')
    expect(el.className).toMatch(/text-emerald|text-green/)
  })

  it('applies the variant class for "warning"', () => {
    render(<Tag variant="warning">warn</Tag>)
    const el = screen.getByText('warn')
    expect(el.className).toMatch(/text-amber|text-yellow/)
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
bun run --filter @future/agent test:unit -- tag
```

Expected: 3 failures (module not found).

- [ ] **Step 3: Implement**

Create `packages/agent/src/primitives/tag.tsx`:

```tsx
import { cn } from '@future/ui'
import type { ReactNode } from 'react'

type Variant = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const variantClasses: Record<Variant, string> = {
  default: 'text-muted-foreground bg-white/[0.04] border-white/[0.06]',
  accent: 'text-accent bg-accent/[0.08] border-accent/20',
  success: 'text-emerald-400 bg-emerald-400/[0.08] border-emerald-400/20',
  warning: 'text-amber-400 bg-amber-400/[0.08] border-amber-400/20',
  danger: 'text-red-400 bg-red-400/[0.08] border-red-400/20',
}

export interface TagProps {
  children: ReactNode
  variant?: Variant
  className?: string
}

export function Tag({ children, variant = 'default', className }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[3px] rounded-[3px] border px-[5px] py-[1.5px]',
        'font-mono text-[9.5px] font-semibold uppercase tracking-[0.02em]',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
bun run --filter @future/agent test:unit -- tag
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/primitives/tag.tsx packages/agent/src/primitives/tag.spec.tsx
git commit -m "feat(agent): add Tag primitive"
```

---

## Task 5: `Mono` primitive

**Files:**

- Create: `packages/agent/src/primitives/mono.tsx`
- Create: `packages/agent/src/primitives/mono.spec.tsx`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/primitives/mono.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Mono } from './mono'

describe('Mono', () => {
  it('renders children with mono font and small size', () => {
    render(<Mono>flow_abc</Mono>)
    const el = screen.getByText('flow_abc')
    expect(el.className).toMatch(/font-mono/)
    expect(el.className).toMatch(/text-/)
  })

  it('passes through className', () => {
    render(<Mono className="text-accent">x</Mono>)
    const el = screen.getByText('x')
    expect(el.className).toMatch(/text-accent/)
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
bun run --filter @future/agent test:unit -- mono
```

Expected: failures (module not found).

- [ ] **Step 3: Implement**

Create `packages/agent/src/primitives/mono.tsx`:

```tsx
import { cn } from '@future/ui'
import type { ReactNode } from 'react'

export interface MonoProps {
  children: ReactNode
  className?: string
}

export function Mono({ children, className }: MonoProps) {
  return (
    <span className={cn('font-mono text-[10px] text-muted-foreground', className)}>{children}</span>
  )
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
bun run --filter @future/agent test:unit -- mono
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/primitives/mono.tsx packages/agent/src/primitives/mono.spec.tsx
git commit -m "feat(agent): add Mono primitive"
```

---

## Task 6: `TinyBtn` primitive

**Files:**

- Create: `packages/agent/src/primitives/tiny-btn.tsx`
- Create: `packages/agent/src/primitives/tiny-btn.spec.tsx`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/primitives/tiny-btn.spec.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TinyBtn } from './tiny-btn'

describe('TinyBtn', () => {
  it('renders children and fires onClick', () => {
    const onClick = vi.fn()
    render(<TinyBtn onClick={onClick}>Send</TinyBtn>)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows active state', () => {
    render(<TinyBtn active>x</TinyBtn>)
    const btn = screen.getByRole('button', { name: 'x' })
    expect(btn.className).toMatch(/bg-white/)
  })

  it('shows danger style', () => {
    render(<TinyBtn danger>delete</TinyBtn>)
    const btn = screen.getByRole('button', { name: 'delete' })
    expect(btn.className).toMatch(/text-red/)
  })

  it('disabled prevents click', () => {
    const onClick = vi.fn()
    render(
      <TinyBtn onClick={onClick} disabled>
        nope
      </TinyBtn>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'nope' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
bun run --filter @future/agent test:unit -- tiny-btn
```

Expected: failures.

- [ ] **Step 3: Implement**

Create `packages/agent/src/primitives/tiny-btn.tsx`:

```tsx
import { cn } from '@future/ui'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface TinyBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  active?: boolean
  danger?: boolean
}

export function TinyBtn({ children, active, danger, className, ...rest }: TinyBtnProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-[5px] border border-white/[0.07] px-[7px]',
        'font-medium text-[11px] transition-colors',
        active ? 'bg-white/[0.06] text-foreground' : 'bg-transparent text-muted-foreground',
        danger && 'text-red-400 hover:text-red-300',
        'disabled:opacity-50 disabled:pointer-events-none',
        className,
      )}
    >
      {children}
    </button>
  )
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
bun run --filter @future/agent test:unit -- tiny-btn
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/primitives/tiny-btn.tsx packages/agent/src/primitives/tiny-btn.spec.tsx
git commit -m "feat(agent): add TinyBtn primitive"
```

---

## Task 7: `IconBtn` primitive

**Files:**

- Create: `packages/agent/src/primitives/icon-btn.tsx`
- Create: `packages/agent/src/primitives/icon-btn.spec.tsx`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/primitives/icon-btn.spec.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Plus } from 'lucide-react'
import { IconBtn } from './icon-btn'

describe('IconBtn', () => {
  it('renders icon and fires onClick', () => {
    const onClick = vi.fn()
    render(
      <IconBtn aria-label="add" onClick={onClick}>
        <Plus />
      </IconBtn>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'add' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders 24×24 by default', () => {
    render(
      <IconBtn aria-label="x">
        <Plus />
      </IconBtn>,
    )
    const btn = screen.getByRole('button', { name: 'x' })
    expect(btn.className).toMatch(/h-6/)
    expect(btn.className).toMatch(/w-6/)
  })

  it('forwards title attribute for tooltip', () => {
    render(
      <IconBtn aria-label="x" title="Add task">
        <Plus />
      </IconBtn>,
    )
    expect(screen.getByRole('button', { name: 'x' }).getAttribute('title')).toBe('Add task')
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
bun run --filter @future/agent test:unit -- icon-btn
```

Expected: failures.

- [ ] **Step 3: Implement**

Create `packages/agent/src/primitives/icon-btn.tsx`:

```tsx
import { cn } from '@future/ui'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface IconBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  'aria-label': string
}

export function IconBtn({ children, className, ...rest }: IconBtnProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-md',
        'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
        'transition-colors',
        'disabled:opacity-50 disabled:pointer-events-none',
        className,
      )}
    >
      {children}
    </button>
  )
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
bun run --filter @future/agent test:unit -- icon-btn
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/primitives/icon-btn.tsx packages/agent/src/primitives/icon-btn.spec.tsx
git commit -m "feat(agent): add IconBtn primitive"
```

---

## Task 8: `ToolCallShell` primitive (consumed by Plans 2 + 3)

**Files:**

- Create: `packages/agent/src/primitives/tool-call-shell.tsx`
- Create: `packages/agent/src/primitives/tool-call-shell.spec.tsx`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/primitives/tool-call-shell.spec.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ToolCallShell } from './tool-call-shell'

describe('ToolCallShell', () => {
  it('renders header but hides body when not open', () => {
    render(
      <ToolCallShell header={<span>HDR</span>} status="done">
        <div data-testid="body">BODY</div>
      </ToolCallShell>,
    )
    expect(screen.getByText('HDR')).toBeTruthy()
    expect(screen.queryByTestId('body')).toBeNull()
  })

  it('expands body when header is clicked', () => {
    render(
      <ToolCallShell header={<span>HDR</span>} status="done">
        <div data-testid="body">BODY</div>
      </ToolCallShell>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByTestId('body')).toBeTruthy()
  })

  it('starts open when defaultOpen is true', () => {
    render(
      <ToolCallShell header={<span>HDR</span>} status="running" defaultOpen>
        <div data-testid="body">BODY</div>
      </ToolCallShell>,
    )
    expect(screen.getByTestId('body')).toBeTruthy()
  })

  it('exposes aria-expanded on the header button', () => {
    render(
      <ToolCallShell header={<span>HDR</span>} status="done">
        <div>BODY</div>
      </ToolCallShell>,
    )
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false')
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
bun run --filter @future/agent test:unit -- tool-call-shell
```

Expected: failures.

- [ ] **Step 3: Implement**

Create `packages/agent/src/primitives/tool-call-shell.tsx`:

```tsx
import { cn } from '@future/ui'
import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Check, Loader, AlertTriangle } from 'lucide-react'

export type ToolCallStatus = 'running' | 'done' | 'error'

const statusConfig: Record<ToolCallStatus, { icon: ReactNode; color: string }> = {
  running: { icon: <Loader className="h-3 w-3 animate-spin" />, color: 'text-accent' },
  done: { icon: <Check className="h-3 w-3" />, color: 'text-emerald-400' },
  error: { icon: <AlertTriangle className="h-3 w-3" />, color: 'text-red-400' },
}

export interface ToolCallShellProps {
  header: ReactNode
  status: ToolCallStatus
  defaultOpen?: boolean
  children?: ReactNode
}

export function ToolCallShell({
  header,
  status,
  defaultOpen = false,
  children,
}: ToolCallShellProps) {
  const [open, setOpen] = useState(defaultOpen)
  const cfg = statusConfig[status]
  return (
    <div className="overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-white/[0.02]"
      >
        <span className="text-muted-foreground/70">
          {open ? (
            <ChevronDown className="h-2.5 w-2.5" />
          ) : (
            <ChevronRight className="h-2.5 w-2.5" />
          )}
        </span>
        <span className={cn('inline-flex', cfg.color)}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">{header}</div>
      </button>
      {open && children && (
        <div className="border-t border-white/[0.06] p-2 flex flex-col gap-1.5">{children}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
bun run --filter @future/agent test:unit -- tool-call-shell
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/primitives/tool-call-shell.tsx packages/agent/src/primitives/tool-call-shell.spec.tsx
git commit -m "feat(agent): add ToolCallShell primitive"
```

---

## Task 9: Export primitives from package index

**Files:**

- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Add primitives exports**

Append to `packages/agent/src/index.ts` (place under existing groups):

```ts
// Primitives
export { Tag } from './primitives/tag'
export type { TagProps } from './primitives/tag'
export { Mono } from './primitives/mono'
export type { MonoProps } from './primitives/mono'
export { TinyBtn } from './primitives/tiny-btn'
export type { TinyBtnProps } from './primitives/tiny-btn'
export { IconBtn } from './primitives/icon-btn'
export type { IconBtnProps } from './primitives/icon-btn'
export { ToolCallShell } from './primitives/tool-call-shell'
export type { ToolCallShellProps, ToolCallStatus } from './primitives/tool-call-shell'
```

- [ ] **Step 2: Build and verify exports**

```bash
bun run --filter @future/agent build
```

Expected: build succeeds, no TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/index.ts
git commit -m "feat(agent): export primitives from package index"
```

---

## Task 10: `AgentPanelHeader` component

**Files:**

- Create: `packages/agent/src/panel/agent-panel-header.tsx`
- Create: `packages/agent/src/panel/agent-panel-header.spec.tsx`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/panel/agent-panel-header.spec.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AgentPanelHeader } from './agent-panel-header'

describe('AgentPanelHeader', () => {
  it('renders the title and live badge when streaming', () => {
    render(
      <AgentPanelHeader
        streaming
        taskContext={null}
        onCollapse={() => {}}
        onNewThread={() => {}}
      />,
    )
    expect(screen.getByText('Action Intelligence')).toBeTruthy()
    expect(screen.getByText('live')).toBeTruthy()
  })

  it('hides live badge when not streaming and not ended', () => {
    render(
      <AgentPanelHeader
        streaming={false}
        taskContext={null}
        onCollapse={() => {}}
        onNewThread={() => {}}
      />,
    )
    expect(screen.queryByText('live')).toBeNull()
  })

  it('shows task context line when provided', () => {
    render(
      <AgentPanelHeader
        streaming
        taskContext="Refactor token export pipeline"
        onCollapse={() => {}}
        onNewThread={() => {}}
      />,
    )
    expect(screen.getByText(/Refactor token export pipeline/)).toBeTruthy()
  })

  it('hides task context line when null', () => {
    const { container } = render(
      <AgentPanelHeader
        streaming
        taskContext={null}
        onCollapse={() => {}}
        onNewThread={() => {}}
      />,
    )
    expect(container.textContent).not.toContain('on ·')
  })

  it('fires onNewThread when the + button is clicked', () => {
    const onNewThread = vi.fn()
    render(
      <AgentPanelHeader
        streaming
        taskContext={null}
        onCollapse={() => {}}
        onNewThread={onNewThread}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'New thread' }))
    expect(onNewThread).toHaveBeenCalledOnce()
  })

  it('fires onCollapse when collapse button is clicked', () => {
    const onCollapse = vi.fn()
    render(
      <AgentPanelHeader
        streaming
        taskContext={null}
        onCollapse={onCollapse}
        onNewThread={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Collapse panel' }))
    expect(onCollapse).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
bun run --filter @future/agent test:unit -- agent-panel-header
```

Expected: failures.

- [ ] **Step 3: Implement**

Create `packages/agent/src/panel/agent-panel-header.tsx`:

```tsx
import { Sparkles, Plus, PanelRightClose } from 'lucide-react'
import { Tag } from '../primitives/tag'
import { IconBtn } from '../primitives/icon-btn'

export interface AgentPanelHeaderProps {
  streaming: boolean
  taskContext: string | null
  onCollapse: () => void
  onNewThread: () => void
}

export function AgentPanelHeader({
  streaming,
  taskContext,
  onCollapse,
  onNewThread,
}: AgentPanelHeaderProps) {
  return (
    <div className="flex h-11 items-center gap-1.5 border-b border-white/[0.05] px-2.5">
      <div className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] bg-gradient-to-br from-accent to-accent/60 text-white">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          Action Intelligence
          {streaming && <Tag variant="success">live</Tag>}
        </div>
        {taskContext && (
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-muted-foreground/70">
            on · {taskContext}
          </div>
        )}
      </div>
      <IconBtn aria-label="New thread" title="New thread" onClick={onNewThread}>
        <Plus className="h-3 w-3" />
      </IconBtn>
      <IconBtn aria-label="Collapse panel" title="Collapse" onClick={onCollapse}>
        <PanelRightClose className="h-3.5 w-3.5" />
      </IconBtn>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
bun run --filter @future/agent test:unit -- agent-panel-header
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/panel/agent-panel-header.tsx packages/agent/src/panel/agent-panel-header.spec.tsx
git commit -m "feat(agent): add AgentPanelHeader"
```

---

## Task 11: `AgentPanelMetaStrip` component

**Files:**

- Create: `packages/agent/src/panel/agent-panel-meta-strip.tsx`
- Create: `packages/agent/src/panel/agent-panel-meta-strip.spec.tsx`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/panel/agent-panel-meta-strip.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AgentPanelMetaStrip } from './agent-panel-meta-strip'

describe('AgentPanelMetaStrip', () => {
  it('renders dashes when there is no flow yet', () => {
    render(<AgentPanelMetaStrip traceId={null} model={null} usage={null} />)
    expect(screen.getByText('flow_—')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('shows flow as flow_<first8>… when traceId is set', () => {
    render(<AgentPanelMetaStrip traceId="abcdef0123456789" model={null} usage={null} />)
    expect(screen.getByText(/flow_abcdef01…/)).toBeTruthy()
  })

  it('shows tokens as input + output sum', () => {
    render(
      <AgentPanelMetaStrip
        traceId={null}
        model="claude-sonnet-4.5"
        usage={{
          input_tokens: 1000,
          output_tokens: 200,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        }}
      />,
    )
    expect(screen.getByText(/1\.2k|1200/)).toBeTruthy()
  })

  it('shows the model label when provided', () => {
    render(<AgentPanelMetaStrip traceId={null} model="claude-sonnet-4.5" usage={null} />)
    expect(screen.getByText('claude-sonnet-4.5')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
bun run --filter @future/agent test:unit -- agent-panel-meta-strip
```

Expected: failures.

- [ ] **Step 3: Implement**

Create `packages/agent/src/panel/agent-panel-meta-strip.tsx`:

```tsx
import { Workflow, Coins, DollarSign } from 'lucide-react'
import { Mono } from '../primitives/mono'
import type { UsageSnapshot } from '../runtime/sse-event-schema'

export interface AgentPanelMetaStripProps {
  traceId: string | null
  model: string | null
  usage: UsageSnapshot | null
}

function abbreviateFlow(traceId: string | null): string {
  if (!traceId) return 'flow_—'
  return `flow_${traceId.slice(0, 8)}…`
}

function formatTokens(usage: UsageSnapshot | null): string {
  if (!usage) return '—'
  const total = usage.input_tokens + usage.output_tokens
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`
  return total.toString()
}

export function AgentPanelMetaStrip({ traceId, model, usage }: AgentPanelMetaStripProps) {
  return (
    <div className="flex h-[26px] items-center gap-1.5 border-b border-white/[0.05] bg-white/[0.01] px-2.5">
      <Workflow className="h-2.5 w-2.5 text-muted-foreground/70" />
      <Mono>{abbreviateFlow(traceId)}</Mono>
      <span className="text-muted-foreground/70">·</span>
      <Mono className="text-foreground/80">{model ?? '—'}</Mono>
      <div className="flex-1" />
      <Coins className="h-2.5 w-2.5 text-muted-foreground/70" />
      <Mono>{formatTokens(usage)}</Mono>
      <DollarSign className="h-2.5 w-2.5 text-muted-foreground/70" />
      <Mono>—</Mono>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
bun run --filter @future/agent test:unit -- agent-panel-meta-strip
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/panel/agent-panel-meta-strip.tsx packages/agent/src/panel/agent-panel-meta-strip.spec.tsx
git commit -m "feat(agent): add AgentPanelMetaStrip"
```

---

## Task 12: Rewrite `AgentPanel` to compose the new chrome

**Files:**

- Modify: `packages/agent/src/panel/agent-panel.tsx`
- Modify: `packages/agent/src/panel/agent-panel.spec.tsx`
- Delete: `packages/agent/src/panel/agent-context-pills.tsx`
- Delete: `packages/agent/src/panel/agent-context-pills.spec.tsx` (if exists)

- [ ] **Step 1: Delete the obsolete context-pills file**

```bash
git rm packages/agent/src/panel/agent-context-pills.tsx
```

If a spec file exists, delete it too:

```bash
git rm packages/agent/src/panel/agent-context-pills.spec.tsx 2>/dev/null || true
```

- [ ] **Step 2: Write failing test for new panel composition**

Replace `packages/agent/src/panel/agent-panel.spec.tsx` entirely:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentStateProvider } from '../hooks/use-agent-state'
import { AgentContextProvider } from '../context/agent-context-provider'
import { AgentPanel } from './agent-panel'

vi.mock('@future/api-client', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return real
})

const mockMutateAsync = vi.fn()

vi.mock('../runtime/agent-chat-adapter', () => ({
  createAgentChatAdapter: () => ({ async *run() {} }),
}))

vi.mock('@assistant-ui/react', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return {
    ...real,
    useLocalRuntime: () => ({ unstable_synchronizer: () => () => {} }),
    AssistantRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

const wrap = (children: React.ReactNode) => (
  <AgentStateProvider>
    <AgentContextProvider module="planner" entity="Refactor token export pipeline" id="t1">
      {children}
    </AgentContextProvider>
  </AgentStateProvider>
)

describe('AgentPanel', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset()
  })

  it('renders header, meta strip, and composer', () => {
    render(wrap(<AgentPanel />))
    expect(screen.getByText('Action Intelligence')).toBeTruthy()
    expect(screen.getByText(/flow_/)).toBeTruthy()
  })

  it('shows task context from AgentContext.entity', () => {
    render(wrap(<AgentPanel />))
    expect(screen.getByText(/Refactor token export pipeline/)).toBeTruthy()
  })

  it('renders an empty placeholder when collapsed (rail slot)', () => {
    function Toggle() {
      const { useAgentState } =
        require('../hooks/use-agent-state') as typeof import('../hooks/use-agent-state')
      const s = useAgentState()
      return <button onClick={() => s.setCollapsed(true)}>collapse</button>
    }
    render(
      wrap(
        <>
          <Toggle />
          <AgentPanel />
        </>,
      ),
    )
    fireEvent.click(screen.getByText('collapse'))
    // header hidden after collapse
    expect(screen.queryByText('Action Intelligence')).toBeNull()
    // rail placeholder still mounted
    expect(screen.getByTestId('agent-panel-rail-slot')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run failing tests**

```bash
bun run --filter @future/agent test:unit -- agent-panel
```

Expected: failures.

- [ ] **Step 4: Rewrite `agent-panel.tsx`**

Replace `packages/agent/src/panel/agent-panel.tsx` entirely:

```tsx
'use client'

import { useMemo } from 'react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import { useStore } from 'zustand'
import { useAgentState } from '../hooks/use-agent-state'
import { useAgentContext } from '../context/use-agent-context'
import { AgentThread } from '../thread/agent-thread'
import { AgentComposer } from '../thread/agent-composer'
import { createAgentChatAdapter } from '../runtime/agent-chat-adapter'
import { createAgentTurnStore } from '../runtime/agent-turn-store'
import { AgentPanelHeader } from './agent-panel-header'
import { AgentPanelMetaStrip } from './agent-panel-meta-strip'

export interface AgentPanelProps {
  endpoint?: string
}

export function AgentPanel({ endpoint = '/api/agent/turn' }: AgentPanelProps) {
  const { collapsed, setCollapsed } = useAgentState()
  const ctx = useAgentContext()

  const store = useMemo(() => createAgentTurnStore(), [])
  const traceId = useStore(store, (s) => s.traceId)
  const streaming = useStore(store, (s) => s.streaming)
  const usage = useStore(store, (s) => s.usage)

  const adapter = useMemo(
    () =>
      createAgentChatAdapter({
        endpoint,
        surface: 'panel',
        store,
        context: ctx ?? undefined,
      }),
    [endpoint, store, ctx],
  )
  const runtime = useLocalRuntime(adapter)

  if (collapsed) {
    return (
      <div
        data-testid="agent-panel-rail-slot"
        className="dark h-full w-11 flex-shrink-0 border-l border-white/[0.05] bg-sidebar"
      />
    )
  }

  const handleNewThread = () => {
    store.getState().reset()
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        data-testid="agent-panel"
        className="dark h-full w-96 flex-shrink-0 border-l border-white/[0.05] bg-sidebar"
      >
        <div className="flex h-full min-h-0 flex-col">
          <AgentPanelHeader
            streaming={streaming}
            taskContext={ctx?.entity ?? null}
            onCollapse={() => setCollapsed(true)}
            onNewThread={handleNewThread}
          />
          <AgentPanelMetaStrip traceId={traceId} model={null} usage={usage} />
          <div className="flex-1 min-h-0 overflow-auto">
            <AgentThread />
          </div>
          <AgentComposer />
        </div>
      </div>
    </AssistantRuntimeProvider>
  )
}
```

- [ ] **Step 5: Run tests — verify pass**

```bash
bun run --filter @future/agent test:unit -- agent-panel
```

Expected: pass.

- [ ] **Step 6: Update `index.ts` to remove the deleted context-pills export**

Modify `packages/agent/src/index.ts` — delete any export referencing `agent-context-pills`. If `AgentPanel` props or sub-types changed, update those too.

```bash
grep -n agent-context-pills packages/agent/src/index.ts || echo "no reference"
```

If a reference exists, delete that line.

- [ ] **Step 7: Build the package and any consumers**

```bash
bun run --filter "@future/*" build
```

Expected: all packages build cleanly.

- [ ] **Step 8: Run full agent test suite**

```bash
bun run --filter @future/agent test:unit
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/agent/src/panel/agent-panel.tsx packages/agent/src/panel/agent-panel.spec.tsx packages/agent/src/index.ts
git add -u  # picks up the deletions
git commit -m "feat(agent): rewrite AgentPanel with header + meta strip + rail slot"
```

---

## Task 13: Smoke check the consumers

**Files:**

- Touch nothing. Read-only verification.

- [ ] **Step 1: Find which zones mount `<AgentPanel>`**

```bash
rg -l 'AgentPanel|AgentProvider' apps/ packages/
```

Expected: a list of zone files.

- [ ] **Step 2: Build each zone that imports `@future/agent`**

```bash
for app in $(rg -l '@future/agent' apps/ -g 'package.json' | xargs -n1 dirname | sort -u); do
  pkg=$(node -p "require('./$app/package.json').name" 2>/dev/null) || continue
  echo ">> $pkg"
  bun run --filter "$pkg" build 2>&1 | tail -10
done
```

Expected: every consumer builds. If any fail, the failure points to a consumer that imported a now-deleted symbol (likely `AgentContextPills`); fix the consumer in this same plan before opening the PR.

- [ ] **Step 3: Type-check the API**

```bash
bun run --filter @future/api typecheck
```

Expected: pass.

---

## Task 14: PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/agent-ux-plan-1-foundation
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(agent): UX refactor plan 1 — foundation primitives + panel chrome" --body "$(cat <<'EOF'
## Summary

- Add `Tag`, `Mono`, `TinyBtn`, `IconBtn`, `ToolCallShell` primitives to `@future/agent`
- Rebuild `AgentPanel` shell: dark surface, header (logo + Action Intelligence + live badge + task context + new-thread + collapse), meta strip (flow_id · model · tokens · cost placeholder), scroll region, composer
- Extend `agent-turn-store` with `streaming` and `usage` selectors driven by `turn.started`/`iteration.ended`/`refusal.started`/`turn.ended`
- Extend `useAgentState` with `collapsed` + `setCollapsed`
- Delete `agent-context-pills` (task context now lives in the header)

Plan 1 of 6 in the agent module UX refactor. Spec: `docs/superpowers/specs/2026-04-30-agent-module-ux-refactor-design.md`.

## Test plan

- [ ] CI green
- [ ] All zones consuming `@future/agent` still build
- [ ] Manual: open the panel in `web-planner`, confirm new chrome renders
- [ ] Manual: collapse the panel — rail slot replaces full panel
- [ ] Manual: trigger a turn — `live` badge appears, flow_id populates

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Print the PR URL.

---

## Self-Review Checklist (run before opening PR)

- [ ] No `__tests__/` directories created (CLAUDE.md ban)
- [ ] No `.js` extensions in relative imports
- [ ] All new buttons use either `Button` from `@future/ui` or the new `TinyBtn`/`IconBtn` primitives — no raw `<button>` outside the primitive files themselves
- [ ] `AgentPanel` reads `useAgentContext()?.entity` (not `.contextEntity`)
- [ ] No mock SSE events committed; only schema-typed event objects in tests
- [ ] `bun run --filter @future/agent test:unit` shows ≥70% coverage on new files

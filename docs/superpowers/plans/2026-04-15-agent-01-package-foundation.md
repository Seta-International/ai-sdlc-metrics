# Embedded Agent — Plan 01: Package Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `packages/agent/` workspace package with core types, `AgentProvider`, `AgentContextProvider`, and hooks that all three surfaces depend on.

**Architecture:** React context-based provider pattern. `AgentProvider` manages WebSocket connection, session state, panel toggle, and insight subscription. `AgentContextProvider` passes per-page entity context. All state is context-only — no rendering in providers.

**Tech Stack:** React 19, TypeScript, Vitest, `socket.io-client`, `@future/api-client` (tRPC)

**Spec Reference:** `docs/superpowers/specs/2026-04-15-agent-embedded-design.md` — Type Contracts, AgentProvider Responsibilities, Context Flow

---

## File Structure

### Files to CREATE

```
packages/agent/package.json
packages/agent/tsconfig.json
packages/agent/src/index.ts
packages/agent/src/types.ts
packages/agent/src/agent-provider.tsx
packages/agent/src/context/agent-context-provider.tsx
packages/agent/src/context/use-agent-context.ts
packages/agent/src/hooks/use-agent-state.ts
packages/agent/src/hooks/use-agent-session.ts
packages/agent/src/hooks/use-agent-insights.ts
packages/agent/src/hooks/use-agent-websocket.ts

# Tests (co-located)
packages/agent/src/types.spec.ts
packages/agent/src/agent-provider.spec.tsx
packages/agent/src/context/agent-context-provider.spec.tsx
packages/agent/src/hooks/use-agent-state.spec.ts
packages/agent/src/hooks/use-agent-session.spec.ts
packages/agent/src/hooks/use-agent-insights.spec.ts
```

---

### Task 1: Scaffold workspace package

**Files:**

- Create: `packages/agent/package.json`
- Create: `packages/agent/tsconfig.json`
- Create: `packages/agent/src/index.ts`

- [ ] **Step 1: Generate workspace**

```bash
cd /Users/canh/Projects/Seta/future
bunx turbo gen workspace --name agent --type package
```

If the generator prompts for a directory, choose `packages/`.

- [ ] **Step 2: Set up package.json**

Replace the generated `packages/agent/package.json` with:

```json
{
  "name": "@future/agent",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test:unit": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@future/api-client": "workspace:*",
    "@future/core": "workspace:*",
    "lucide-react": "^1.8.0"
  },
  "devDependencies": {
    "@future/tsconfig": "workspace:*",
    "@testing-library/react": "^16.3.0",
    "jsdom": "^26.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.1"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 3: Set up tsconfig.json**

Create `packages/agent/tsconfig.json`:

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules", "**/*.spec.ts", "**/*.spec.tsx"]
}
```

- [ ] **Step 4: Create empty index.ts**

Create `packages/agent/src/index.ts`:

```typescript
// @future/agent — embedded agent package
// Exports added as components are implemented
```

- [ ] **Step 5: Install dependencies**

```bash
bun install
```

- [ ] **Step 6: Verify build**

```bash
bun run --filter @future/agent build
```

Expected: Successful build with `dist/index.js` and `dist/index.d.ts` created.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/
git commit -m "feat(agent): scaffold @future/agent workspace package"
```

---

### Task 2: Core types

**Files:**

- Create: `packages/agent/src/types.ts`
- Create: `packages/agent/src/types.spec.ts`
- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/src/types.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type {
  ModuleKey,
  AgentContext,
  AgentInsight,
  AgentInlineActionConfig,
  AgentSessionStatus,
  AgentMessageRole,
  AgentMessage,
  AgentSession,
  AgentPanelState,
} from './types'

describe('Agent types', () => {
  it('AgentContext accepts valid module keys', () => {
    const ctx: AgentContext = {
      module: 'people',
      entity: 'employee',
      id: '018f1a2b-3c4d-7000-8000-000000000001',
    }
    expect(ctx.module).toBe('people')
    expect(ctx.entity).toBe('employee')
    expect(ctx.id).toBe('018f1a2b-3c4d-7000-8000-000000000001')
  })

  it('AgentContext accepts optional metadata', () => {
    const ctx: AgentContext = {
      module: 'time',
      entity: 'leave-request',
      id: '018f1a2b-3c4d-7000-8000-000000000002',
      metadata: { department: 'Engineering', status: 'pending' },
    }
    expect(ctx.metadata).toEqual({ department: 'Engineering', status: 'pending' })
  })

  it('AgentInsight has required fields', () => {
    const insight: AgentInsight = {
      id: '018f1a2b-3c4d-7000-8000-000000000003',
      module: 'people',
      entity: 'employee',
      entityId: '018f1a2b-3c4d-7000-8000-000000000001',
      severity: 'warning',
      title: 'Visa expires Jun 15',
      description: 'Employee visa expires in 30 days.',
      createdAt: new Date('2026-04-15'),
    }
    expect(insight.severity).toBe('warning')
    expect(insight.actionLabel).toBeUndefined()
  })

  it('AgentInsight accepts optional action fields', () => {
    const insight: AgentInsight = {
      id: '018f1a2b-3c4d-7000-8000-000000000004',
      module: 'people',
      entity: 'employee',
      entityId: '018f1a2b-3c4d-7000-8000-000000000001',
      severity: 'critical',
      title: 'Contract expired',
      description: 'Employment contract expired yesterday.',
      actionLabel: 'Draft renewal',
      actionHref: '/employees/018f1a2b-3c4d-7000-8000-000000000001',
      createdAt: new Date('2026-04-15'),
    }
    expect(insight.actionLabel).toBe('Draft renewal')
    expect(insight.actionHref).toBe('/employees/018f1a2b-3c4d-7000-8000-000000000001')
  })

  it('AgentInlineActionConfig has required fields', () => {
    const action: AgentInlineActionConfig = {
      key: 'summarize',
      label: 'Summarize',
    }
    expect(action.key).toBe('summarize')
    expect(action.permission).toBeUndefined()
  })

  it('AgentMessage has required fields', () => {
    const msg: AgentMessage = {
      id: '018f1a2b-3c4d-7000-8000-000000000005',
      sessionId: '018f1a2b-3c4d-7000-8000-000000000006',
      role: 'assistant',
      content: 'Here is the summary.',
      createdAt: new Date('2026-04-15'),
    }
    expect(msg.role).toBe('assistant')
    expect(msg.toolName).toBeUndefined()
  })

  it('AgentSession has required fields', () => {
    const session: AgentSession = {
      id: '018f1a2b-3c4d-7000-8000-000000000006',
      status: 'active',
      messages: [],
      createdAt: new Date('2026-04-15'),
    }
    expect(session.status).toBe('active')
  })

  it('AgentPanelState tracks open/closed', () => {
    const state: AgentPanelState = {
      isOpen: false,
      activeSessionId: null,
    }
    expect(state.isOpen).toBe(false)
    expect(state.activeSessionId).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/agent build
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/types.spec.ts
```

Expected: FAIL — types not found.

Note: if vitest.config.ts doesn't exist yet, create it first (see step 3).

- [ ] **Step 3: Create vitest config**

Create `packages/agent/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.spec.{ts,tsx}'],
  },
})
```

- [ ] **Step 4: Write types implementation**

Create `packages/agent/src/types.ts`:

```typescript
import type { LucideIcon } from 'lucide-react'

export type ModuleKey =
  | 'people'
  | 'time'
  | 'hiring'
  | 'performance'
  | 'projects'
  | 'finance'
  | 'goals'
  | 'insights'
  | 'planner'
  | 'admin'
  | 'kernel'

export interface AgentContext {
  module: ModuleKey
  entity: string
  id: string
  metadata?: Record<string, unknown>
}

export interface AgentInsight {
  id: string
  module: ModuleKey
  entity: string
  entityId: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  createdAt: Date
}

export interface AgentInlineActionConfig {
  key: string
  label: string
  icon?: LucideIcon
  permission?: string
}

export type AgentSessionStatus = 'active' | 'completed' | 'escalated' | 'expired' | 'error'

export type AgentMessageRole = 'user' | 'assistant' | 'tool_call' | 'tool_result'

export interface AgentMessage {
  id: string
  sessionId: string
  role: AgentMessageRole
  content: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  isError?: boolean
  createdAt: Date
}

export interface AgentSession {
  id: string
  status: AgentSessionStatus
  messages: AgentMessage[]
  context?: AgentContext
  createdAt: Date
  endedAt?: Date
}

export interface AgentPanelState {
  isOpen: boolean
  activeSessionId: string | null
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/types.spec.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 6: Export types from index.ts**

Update `packages/agent/src/index.ts`:

```typescript
// Types
export type {
  ModuleKey,
  AgentContext,
  AgentInsight,
  AgentInlineActionConfig,
  AgentSessionStatus,
  AgentMessageRole,
  AgentMessage,
  AgentSession,
  AgentPanelState,
} from './types'
```

- [ ] **Step 7: Verify build**

```bash
bun run --filter @future/agent build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add packages/agent/src/types.ts packages/agent/src/types.spec.ts packages/agent/src/index.ts packages/agent/vitest.config.ts
git commit -m "feat(agent): add core type contracts"
```

---

### Task 3: AgentContextProvider

**Files:**

- Create: `packages/agent/src/context/agent-context-provider.tsx`
- Create: `packages/agent/src/context/use-agent-context.ts`
- Create: `packages/agent/src/context/agent-context-provider.spec.tsx`
- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/src/context/agent-context-provider.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentContextProvider } from './agent-context-provider'
import { useAgentContext } from './use-agent-context'

function ContextReader() {
  const ctx = useAgentContext()
  if (!ctx) return <div>no context</div>
  return (
    <div>
      <span data-testid="module">{ctx.module}</span>
      <span data-testid="entity">{ctx.entity}</span>
      <span data-testid="id">{ctx.id}</span>
      <span data-testid="metadata">{JSON.stringify(ctx.metadata)}</span>
    </div>
  )
}

describe('AgentContextProvider', () => {
  it('provides context to children', () => {
    render(
      <AgentContextProvider module="people" entity="employee" id="abc-123">
        <ContextReader />
      </AgentContextProvider>,
    )
    expect(screen.getByTestId('module').textContent).toBe('people')
    expect(screen.getByTestId('entity').textContent).toBe('employee')
    expect(screen.getByTestId('id').textContent).toBe('abc-123')
  })

  it('passes metadata to context', () => {
    render(
      <AgentContextProvider
        module="time"
        entity="leave-request"
        id="def-456"
        metadata={{ department: 'Engineering' }}
      >
        <ContextReader />
      </AgentContextProvider>,
    )
    expect(screen.getByTestId('metadata').textContent).toBe('{"department":"Engineering"}')
  })

  it('returns null when no provider is present', () => {
    render(<ContextReader />)
    expect(screen.getByText('no context')).toBeDefined()
  })

  it('nearest provider wins when nested', () => {
    render(
      <AgentContextProvider module="people" entity="employee" id="outer">
        <AgentContextProvider module="time" entity="leave-request" id="inner">
          <ContextReader />
        </AgentContextProvider>
      </AgentContextProvider>,
    )
    expect(screen.getByTestId('module').textContent).toBe('time')
    expect(screen.getByTestId('id').textContent).toBe('inner')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/context/agent-context-provider.spec.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement AgentContextProvider**

Create `packages/agent/src/context/use-agent-context.ts`:

```typescript
import { createContext, useContext } from 'react'
import type { AgentContext } from '../types'

export const AgentContextContext = createContext<AgentContext | null>(null)

export function useAgentContext(): AgentContext | null {
  return useContext(AgentContextContext)
}
```

Create `packages/agent/src/context/agent-context-provider.tsx`:

```tsx
import type { ReactNode } from 'react'
import type { AgentContext, ModuleKey } from '../types'
import { AgentContextContext } from './use-agent-context'

export interface AgentContextProviderProps {
  module: ModuleKey
  entity: string
  id: string
  metadata?: Record<string, unknown>
  children: ReactNode
}

export function AgentContextProvider({
  module,
  entity,
  id,
  metadata,
  children,
}: AgentContextProviderProps) {
  const value: AgentContext = { module, entity, id, metadata }

  return <AgentContextContext.Provider value={value}>{children}</AgentContextContext.Provider>
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/context/agent-context-provider.spec.tsx
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Export from index.ts**

Add to `packages/agent/src/index.ts`:

```typescript
// Context
export { AgentContextProvider } from './context/agent-context-provider'
export type { AgentContextProviderProps } from './context/agent-context-provider'
export { useAgentContext } from './context/use-agent-context'
```

- [ ] **Step 6: Verify build**

```bash
bun run --filter @future/agent build
```

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/context/
git commit -m "feat(agent): add AgentContextProvider and useAgentContext hook"
```

---

### Task 4: Agent state context and useAgentState hook

**Files:**

- Create: `packages/agent/src/hooks/use-agent-state.ts`
- Create: `packages/agent/src/hooks/use-agent-state.spec.ts`
- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/src/hooks/use-agent-state.spec.ts`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { AgentStateProvider, useAgentState } from './use-agent-state'

function wrapper({ children }: { children: ReactNode }) {
  return createElement(AgentStateProvider, null, children)
}

describe('useAgentState', () => {
  it('starts with panel closed', () => {
    const { result } = renderHook(() => useAgentState(), { wrapper })
    expect(result.current.panelOpen).toBe(false)
  })

  it('toggles panel open/closed', () => {
    const { result } = renderHook(() => useAgentState(), { wrapper })

    act(() => result.current.togglePanel())
    expect(result.current.panelOpen).toBe(true)

    act(() => result.current.togglePanel())
    expect(result.current.panelOpen).toBe(false)
  })

  it('sets panel state explicitly', () => {
    const { result } = renderHook(() => useAgentState(), { wrapper })

    act(() => result.current.setPanelOpen(true))
    expect(result.current.panelOpen).toBe(true)

    act(() => result.current.setPanelOpen(false))
    expect(result.current.panelOpen).toBe(false)
  })

  it('tracks active session id', () => {
    const { result } = renderHook(() => useAgentState(), { wrapper })
    expect(result.current.activeSessionId).toBeNull()

    act(() => result.current.setActiveSessionId('session-123'))
    expect(result.current.activeSessionId).toBe('session-123')
  })

  it('stores insights', () => {
    const { result } = renderHook(() => useAgentState(), { wrapper })
    expect(result.current.insights).toEqual([])
  })

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useAgentState())
    }).toThrow('useAgentState must be used within AgentStateProvider')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/hooks/use-agent-state.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement useAgentState**

Create `packages/agent/src/hooks/use-agent-state.ts`:

```tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { AgentInsight } from '../types'

export interface AgentStateContextValue {
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void
  insights: AgentInsight[]
  setInsights: (insights: AgentInsight[]) => void
  addInsight: (insight: AgentInsight) => void
  dismissInsight: (id: string) => void
}

const AgentStateContext = createContext<AgentStateContextValue | null>(null)

export function AgentStateProvider({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [insights, setInsights] = useState<AgentInsight[]>([])

  const togglePanel = useCallback(() => setPanelOpen((prev) => !prev), [])
  const addInsight = useCallback(
    (insight: AgentInsight) => setInsights((prev) => [insight, ...prev]),
    [],
  )
  const dismissInsight = useCallback(
    (id: string) => setInsights((prev) => prev.filter((i) => i.id !== id)),
    [],
  )

  return (
    <AgentStateContext.Provider
      value={{
        panelOpen,
        setPanelOpen,
        togglePanel,
        activeSessionId,
        setActiveSessionId,
        insights,
        setInsights,
        addInsight,
        dismissInsight,
      }}
    >
      {children}
    </AgentStateContext.Provider>
  )
}

export function useAgentState(): AgentStateContextValue {
  const ctx = useContext(AgentStateContext)
  if (!ctx) throw new Error('useAgentState must be used within AgentStateProvider')
  return ctx
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/hooks/use-agent-state.spec.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Export from index.ts**

Add to `packages/agent/src/index.ts`:

```typescript
// State
export { AgentStateProvider, useAgentState } from './hooks/use-agent-state'
export type { AgentStateContextValue } from './hooks/use-agent-state'
```

- [ ] **Step 6: Verify build**

```bash
bun run --filter @future/agent build
```

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/hooks/use-agent-state.ts packages/agent/src/hooks/use-agent-state.spec.ts packages/agent/src/index.ts
git commit -m "feat(agent): add AgentStateProvider and useAgentState hook"
```

---

### Task 5: AgentProvider (root provider)

**Files:**

- Create: `packages/agent/src/agent-provider.tsx`
- Create: `packages/agent/src/agent-provider.spec.tsx`
- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/src/agent-provider.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentProvider } from './agent-provider'
import { useAgentState } from './hooks/use-agent-state'

function StateReader() {
  const state = useAgentState()
  return (
    <div>
      <span data-testid="panel-open">{String(state.panelOpen)}</span>
      <span data-testid="session-id">{String(state.activeSessionId)}</span>
      <span data-testid="insights-count">{state.insights.length}</span>
    </div>
  )
}

describe('AgentProvider', () => {
  it('provides AgentStateProvider to children', () => {
    render(
      <AgentProvider>
        <StateReader />
      </AgentProvider>,
    )
    expect(screen.getByTestId('panel-open').textContent).toBe('false')
    expect(screen.getByTestId('session-id').textContent).toBe('null')
    expect(screen.getByTestId('insights-count').textContent).toBe('0')
  })

  it('renders children', () => {
    render(
      <AgentProvider>
        <div data-testid="child">Hello</div>
      </AgentProvider>,
    )
    expect(screen.getByTestId('child').textContent).toBe('Hello')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/agent-provider.spec.tsx
```

Expected: FAIL — `AgentProvider` not found.

- [ ] **Step 3: Implement AgentProvider**

Create `packages/agent/src/agent-provider.tsx`:

```tsx
import type { ReactNode } from 'react'
import { AgentStateProvider } from './hooks/use-agent-state'

export interface AgentProviderProps {
  children: ReactNode
}

export function AgentProvider({ children }: AgentProviderProps) {
  return <AgentStateProvider>{children}</AgentStateProvider>
}
```

Note: WebSocket connection and insight subscription will be added in Plan 02 (backend) and Plan 03 (panel) once the backend routes exist. For now, `AgentProvider` is a thin wrapper that composes the state provider. This keeps the package buildable and testable before the backend is ready.

- [ ] **Step 4: Run test to verify it passes**

```bash
bun vitest run --config packages/agent/vitest.config.ts packages/agent/src/agent-provider.spec.tsx
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Export from index.ts**

Add to `packages/agent/src/index.ts`:

```typescript
// Provider
export { AgentProvider } from './agent-provider'
export type { AgentProviderProps } from './agent-provider'
```

- [ ] **Step 6: Run all tests**

```bash
bun vitest run --config packages/agent/vitest.config.ts
```

Expected: All tests PASS (types + context + state + provider).

- [ ] **Step 7: Verify build**

```bash
bun run --filter @future/agent build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add packages/agent/src/agent-provider.tsx packages/agent/src/agent-provider.spec.tsx packages/agent/src/index.ts
git commit -m "feat(agent): add AgentProvider root provider"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

```bash
bun vitest run --config packages/agent/vitest.config.ts
```

Expected: All tests PASS.

- [ ] **Step 2: Verify build**

```bash
bun run --filter @future/agent build
```

Expected: Clean build with no errors.

- [ ] **Step 3: Verify exports**

Check that `packages/agent/dist/index.d.ts` exports all expected types and components:

```bash
cat packages/agent/dist/index.d.ts
```

Expected exports:

- Types: `ModuleKey`, `AgentContext`, `AgentInsight`, `AgentInlineActionConfig`, `AgentSessionStatus`, `AgentMessageRole`, `AgentMessage`, `AgentSession`, `AgentPanelState`
- Components: `AgentProvider`, `AgentContextProvider`
- Hooks: `useAgentContext`, `useAgentState`
- Provider: `AgentStateProvider`

- [ ] **Step 4: Verify turborepo integration**

```bash
bun run --filter @future/agent... build
```

Expected: Builds `@future/agent` and all its workspace dependencies successfully.

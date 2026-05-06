# Chat Surface Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add execution-mode dropdown to the agent composer, wire `execution_mode` through the turn HTTP pipeline, add `WRITE_PREVIEW`/`WRITE_CONFIRM` SSE events to the schema, and render KB citations in the agent thread.

**Architecture:** The execution-mode field lives in `useAgentState` (client state) and travels to the server as a JSON body field on the SSE turn POST. Server reads it once per turn and stamps it onto `PhaseExecutorTurnState`; it cannot change mid-turn. Two new typed SSE events (`write.preview` / `write.confirm`) are added to `sse-event-schema.ts` so the synthesizer and turn controller can emit observable spans. KB citations come from the existing `answer.complete` event's `citations` array and are rendered as a collapsible `<details>` block in `AgentAssistantMessage`.

**Tech Stack:** React, `@assistant-ui/react`, `@future/ui`, Zod, NestJS, Playwright

---

## File Map

| File                                                                           | Action | Purpose                                         |
| ------------------------------------------------------------------------------ | ------ | ----------------------------------------------- |
| `packages/agent/src/hooks/use-agent-state.tsx`                                 | Modify | Add `executionMode` state field                 |
| `packages/agent/src/hooks/use-agent-state.spec.ts`                             | Modify | Add tests for `executionMode`                   |
| `packages/agent/src/thread/agent-composer.tsx`                                 | Modify | Add execution-mode `<Select>`                   |
| `packages/agent/src/thread/agent-composer.spec.tsx`                            | Modify | Test select renders + changes state             |
| `packages/agent/src/runtime/agent-chat-adapter.ts`                             | Modify | Include `execution_mode` in POST body           |
| `packages/agent/src/runtime/agent-chat-adapter.spec.ts`                        | Modify | Assert `execution_mode` in outgoing body        |
| `packages/agent/src/runtime/sse-event-schema.ts`                               | Modify | Add `write.preview` and `write.confirm` events  |
| `packages/agent/src/runtime/sse-event-schema.spec.ts`                          | Modify | Test new event parsing                          |
| `packages/agent/src/thread/agent-thread.tsx`                                   | Modify | Render KB citations from `answer.complete`      |
| `packages/agent/src/thread/agent-thread.spec.tsx`                              | Modify | Test citation block renders                     |
| `apps/api/src/modules/agents/interface/http/agent-turn-controller.ts`          | Modify | Accept `execution_mode` in `TurnRequestBody`    |
| `apps/api/src/modules/agents/application/services/phase-executor-contracts.ts` | Modify | Add `executionMode` to `PhaseExecutorTurnState` |
| `apps/web-planner/e2e/agent-smoke.spec.ts`                                     | Create | Playwright smoke test                           |

---

## Task 1: Add `executionMode` to `useAgentState`

**Files:**

- Modify: `packages/agent/src/hooks/use-agent-state.tsx`
- Modify: `packages/agent/src/hooks/use-agent-state.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe('useAgentState', ...)` block in `packages/agent/src/hooks/use-agent-state.spec.ts`:

```typescript
it('defaults executionMode to default', () => {
  const { result } = renderHook(() => useAgentState(), { wrapper })
  expect(result.current.executionMode).toBe('default')
})

it('sets executionMode to bypass', () => {
  const { result } = renderHook(() => useAgentState(), { wrapper })
  act(() => result.current.setExecutionMode('bypass'))
  expect(result.current.executionMode).toBe('bypass')
})

it('sets executionMode back to default', () => {
  const { result } = renderHook(() => useAgentState(), { wrapper })
  act(() => result.current.setExecutionMode('bypass'))
  act(() => result.current.setExecutionMode('default'))
  expect(result.current.executionMode).toBe('default')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/vietanh/Future
bun run --filter @future/agent test packages/agent/src/hooks/use-agent-state.spec.ts
```

Expected: FAIL — `result.current.executionMode` is undefined, `setExecutionMode` is not a function.

- [ ] **Step 3: Implement `executionMode` in `use-agent-state.tsx`**

Replace the full file `packages/agent/src/hooks/use-agent-state.tsx` with:

```typescript
'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { AgentInsight } from '../types'

export type ExecutionMode = 'default' | 'bypass'

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
  executionMode: ExecutionMode
  setExecutionMode: (mode: ExecutionMode) => void
}

const AgentStateContext = createContext<AgentStateContextValue | null>(null)

export function AgentStateProvider({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [insights, setInsights] = useState<AgentInsight[]>([])
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('default')

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
        executionMode,
        setExecutionMode,
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

export function useOptionalAgentState(): AgentStateContextValue | null {
  return useContext(AgentStateContext)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run --filter @future/agent test packages/agent/src/hooks/use-agent-state.spec.ts
```

Expected: PASS — all existing tests plus the 3 new ones green.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/hooks/use-agent-state.tsx packages/agent/src/hooks/use-agent-state.spec.ts
git commit -m "feat(agent): add executionMode field to useAgentState"
```

---

## Task 2: Add execution-mode `<Select>` to `AgentComposer`

**Files:**

- Modify: `packages/agent/src/thread/agent-composer.tsx`
- Modify: `packages/agent/src/thread/agent-composer.spec.tsx`

- [ ] **Step 1: Check which Select components `@future/ui` exports**

```bash
grep -r "Select" /home/vietanh/Future/packages/ui/src/index.ts | head -10
```

- [ ] **Step 2: Write the failing tests**

In `packages/agent/src/thread/agent-composer.spec.tsx`, add a `FullWrapper` that includes `AgentStateProvider` (the existing `RuntimeWrapper` doesn't) and two new tests:

```typescript
import { AgentStateProvider } from '../hooks/use-agent-state'

function FullWrapper({ children }: { children: React.ReactNode }) {
  const runtime = useLocalRuntime(noopAdapter)
  return (
    <AgentStateProvider>
      <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
    </AgentStateProvider>
  )
}

it('renders execution mode combobox', () => {
  render(<AgentComposer />, { wrapper: FullWrapper })
  expect(screen.getByRole('combobox')).toBeDefined()
})

it('shows Default approvals label initially', () => {
  render(<AgentComposer />, { wrapper: FullWrapper })
  expect(screen.getByText('Default approvals')).toBeDefined()
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run --filter @future/agent test packages/agent/src/thread/agent-composer.spec.tsx
```

Expected: FAIL — no combobox or "Default approvals" text in rendered output.

- [ ] **Step 4: Implement the execution-mode select in `agent-composer.tsx`**

Replace the full file `packages/agent/src/thread/agent-composer.tsx` with:

```typescript
'use client'

import { Send, Square } from 'lucide-react'
import { ComposerPrimitive, ThreadPrimitive } from '@assistant-ui/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@future/ui'
import { useAgentState, type ExecutionMode } from '../hooks/use-agent-state'

export function AgentComposer() {
  const { executionMode, setExecutionMode } = useAgentState()

  return (
    <ComposerPrimitive.Root className="flex flex-col gap-1 border-t border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <Select
          value={executionMode}
          onValueChange={(v) => setExecutionMode(v as ExecutionMode)}
        >
          <SelectTrigger className="h-7 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default approvals</SelectItem>
            <SelectItem value="bypass">Bypass approvals</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end gap-2">
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder="Ask the agent..."
          className="flex-1 resize-none rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
        />
        <ThreadPrimitive.If running={false}>
          <ComposerPrimitive.Send
            aria-label="Send"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary/50 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </ComposerPrimitive.Send>
        </ThreadPrimitive.If>
        <ThreadPrimitive.If running>
          <ComposerPrimitive.Cancel
            aria-label="Cancel"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary/50"
          >
            <Square className="h-4 w-4" />
          </ComposerPrimitive.Cancel>
        </ThreadPrimitive.If>
      </div>
    </ComposerPrimitive.Root>
  )
}
```

`AgentComposer` now requires `AgentStateProvider` in the tree. `AgentStateProvider` is already mounted inside `AgentProvider` (the package root provider rendered by all zones), so no zone-level changes are needed.

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun run --filter @future/agent test packages/agent/src/thread/agent-composer.spec.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/thread/agent-composer.tsx packages/agent/src/thread/agent-composer.spec.tsx
git commit -m "feat(agent): add execution-mode select to AgentComposer"
```

---

## Task 3: Pass `execution_mode` in the turn POST body

**Files:**

- Modify: `packages/agent/src/runtime/agent-chat-adapter.ts`
- Modify: `packages/agent/src/runtime/agent-chat-adapter.spec.ts`
- Modify: `packages/agent/src/agent-provider.tsx`

`createAgentChatAdapter` is a plain factory — not a React component. We add a `getExecutionMode` getter so the adapter reads the current value at turn-start, not at factory time.

- [ ] **Step 1: Read `agent-provider.tsx` to understand how the adapter is created**

```bash
cat -n packages/agent/src/agent-provider.tsx
```

- [ ] **Step 2: Write the failing test**

In `packages/agent/src/runtime/agent-chat-adapter.spec.ts`, add a test asserting `execution_mode` appears in the POST body. Read the existing spec first to understand the mock pattern used for `fetchEventSource`:

```bash
cat -n packages/agent/src/runtime/agent-chat-adapter.spec.ts
```

Then add:

```typescript
it('includes execution_mode in POST body', async () => {
  const bodies: string[] = []
  vi.mock('@microsoft/fetch-event-source', () => ({
    fetchEventSource: (_url: string, opts: { body: string }) => {
      bodies.push(opts.body)
      return Promise.resolve()
    },
  }))

  const store = createAgentTurnStore()
  const adapter = createAgentChatAdapter({
    endpoint: '/api/agent/turn',
    surface: 'panel',
    store,
    getExecutionMode: () => 'bypass',
  })

  const gen = adapter.run({ messages: [], abortSignal: new AbortController().signal })
  for await (const _ of gen) {
    /* drain */
  }

  const parsed = JSON.parse(bodies[0] ?? '{}')
  expect(parsed.execution_mode).toBe('bypass')
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run --filter @future/agent test packages/agent/src/runtime/agent-chat-adapter.spec.ts
```

Expected: FAIL — `AgentChatAdapterOptions` has no `getExecutionMode` field.

- [ ] **Step 4: Update `agent-chat-adapter.ts`**

Replace the full file `packages/agent/src/runtime/agent-chat-adapter.ts` with:

```typescript
import { fetchEventSource } from '@microsoft/fetch-event-source'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { sseEventSchema } from './sse-event-schema'
import type { AgentTurnStore } from './agent-turn-store'
import type { AgentContext } from '../types'
import type { ExecutionMode } from '../hooks/use-agent-state'

export interface AgentChatAdapterOptions {
  endpoint: string
  surface: 'panel' | 'inline'
  store: AgentTurnStore
  context?: AgentContext
  /** Called at turn-start to read the current execution mode from React state. */
  getExecutionMode: () => ExecutionMode
}

export function createAgentChatAdapter(opts: AgentChatAdapterOptions): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      opts.store.getState().reset()

      let accumulatedText = ''
      const chunks: Array<{ content: [{ type: 'text'; text: string }] }> = []
      let resolveChunk: (() => void) | null = null
      let done = false
      let capturedError: unknown = null

      const body = JSON.stringify({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        surface: opts.surface,
        context: opts.context ?? null,
        execution_mode: opts.getExecutionMode(),
      })

      fetchEventSource(opts.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: abortSignal,
        onmessage(ev) {
          let raw: unknown
          try {
            raw = JSON.parse(ev.data)
          } catch {
            return
          }
          const parsed = sseEventSchema.safeParse(raw)
          if (!parsed.success) return

          const event = parsed.data

          if (event.type === 'answer.token') {
            accumulatedText += event.payload.text
            chunks.push({ content: [{ type: 'text', text: accumulatedText }] })
          } else {
            opts.store.getState().dispatch(event)
          }

          if (event.type === 'turn.ended') {
            done = true
          }

          resolveChunk?.()
          resolveChunk = null
        },
        onerror(err) {
          capturedError = err
          done = true
          resolveChunk?.()
          resolveChunk = null
          throw err
        },
      })
        .then(() => {
          done = true
          resolveChunk?.()
          resolveChunk = null
        })
        .catch(() => {
          // onerror already set capturedError and done; .catch() prevents unhandled rejection
        })

      while (!done || chunks.length > 0) {
        if (chunks.length === 0) {
          await new Promise<void>((resolve) => {
            resolveChunk = resolve
          })
        }
        while (chunks.length > 0) {
          yield chunks.shift()!
        }
      }

      if (capturedError) throw capturedError
    },
  }
}
```

- [ ] **Step 5: Update `agent-provider.tsx` to pass `getExecutionMode`**

Read `packages/agent/src/agent-provider.tsx` first, then find the `createAgentChatAdapter(...)` call. Add `getExecutionMode` to the options object. The `useAgentState()` hook must be called in the same component body where the adapter is created. Make a surgical edit — do not rewrite the file.

The edit should look like:

```typescript
// Add before the createAgentChatAdapter call:
const { executionMode } = useAgentState()

// Then add to the options object:
getExecutionMode: () => executionMode,
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
bun run --filter @future/agent test packages/agent/src/runtime/agent-chat-adapter.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  packages/agent/src/runtime/agent-chat-adapter.ts \
  packages/agent/src/runtime/agent-chat-adapter.spec.ts \
  packages/agent/src/agent-provider.tsx
git commit -m "feat(agent): pass execution_mode in turn POST body"
```

---

## Task 4: Accept `execution_mode` server-side and thread to `PhaseExecutorTurnState`

**Files:**

- Modify: `apps/api/src/modules/agents/interface/http/agent-turn-controller.ts`
- Modify: `apps/api/src/modules/agents/application/services/phase-executor-contracts.ts`
- Modify: `apps/api/src/modules/agents/interface/http/agent-turn-controller.spec.ts`

- [ ] **Step 1: Read the existing controller spec to understand mock patterns**

```bash
grep -n "TurnPipelineRunner\|mockRun\|turnState\|PhaseExecutorTurnState" \
  apps/api/src/modules/agents/interface/http/agent-turn-controller.spec.ts | head -30
```

- [ ] **Step 2: Write the failing test**

Add to `agent-turn-controller.spec.ts`:

```typescript
it('passes execution_mode bypass from body to PhaseExecutorTurnState', async () => {
  let capturedTurnState: PhaseExecutorTurnState | undefined
  mockTurnPipelineRunner.run.mockImplementation(async (opts: TurnPipelineRunOpts) => {
    capturedTurnState = opts.turnState
    return defaultPipelineResult
  })

  await request(app.getHttpServer())
    .post('/api/agent/turn')
    .set('Cookie', validSessionCookie)
    .send({ user_utterance: 'hello', surface: 'panel', execution_mode: 'bypass' })

  expect(capturedTurnState?.executionMode).toBe('bypass')
})

it('defaults executionMode to default when field is absent', async () => {
  let capturedTurnState: PhaseExecutorTurnState | undefined
  mockTurnPipelineRunner.run.mockImplementation(async (opts: TurnPipelineRunOpts) => {
    capturedTurnState = opts.turnState
    return defaultPipelineResult
  })

  await request(app.getHttpServer())
    .post('/api/agent/turn')
    .set('Cookie', validSessionCookie)
    .send({ user_utterance: 'hello', surface: 'panel' })

  expect(capturedTurnState?.executionMode).toBe('default')
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run --filter @future/api test apps/api/src/modules/agents/interface/http/agent-turn-controller.spec.ts
```

Expected: FAIL — `capturedTurnState?.executionMode` is undefined.

- [ ] **Step 4: Add `executionMode` to `PhaseExecutorTurnState`**

In `apps/api/src/modules/agents/application/services/phase-executor-contracts.ts`, add after the `tainted` field (line ~210):

```typescript
/** Execution mode — read once at turn start; cannot change mid-turn. */
readonly executionMode: 'default' | 'bypass'
```

- [ ] **Step 5: Update `TurnRequestBody` and `turnState` construction in the controller**

In `apps/api/src/modules/agents/interface/http/agent-turn-controller.ts`:

**Update `TurnRequestBody`** (around line 43):

```typescript
interface TurnRequestBody {
  surface: string
  conversation_id?: string
  user_utterance: string
  context: { current_screen: string; selection?: unknown }
  execution_mode?: 'default' | 'bypass'
}
```

**Update the `turnState` construction** (around line 218, inside `streamTurn`):

```typescript
const turnState: PhaseExecutorTurnState = {
  traceId,
  tenantId,
  userId,
  conversationId: conversationId ?? '',
  sessionId: '',
  surface: surface as 'global-chat' | 'inline' | 'async',
  tainted: { value: false },
  routerReplanCount: 0,
  executionMode: body?.execution_mode === 'bypass' ? 'bypass' : 'default',
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
bun run --filter @future/api test apps/api/src/modules/agents/interface/http/agent-turn-controller.spec.ts
```

Expected: PASS — both new tests and all existing tests green.

- [ ] **Step 7: Commit**

```bash
git add \
  apps/api/src/modules/agents/interface/http/agent-turn-controller.ts \
  apps/api/src/modules/agents/interface/http/agent-turn-controller.spec.ts \
  apps/api/src/modules/agents/application/services/phase-executor-contracts.ts
git commit -m "feat(agents): thread execution_mode from HTTP body to PhaseExecutorTurnState"
```

---

## Task 5: Add `write.preview` and `write.confirm` SSE events

**Files:**

- Modify: `packages/agent/src/runtime/sse-event-schema.ts`
- Modify: `packages/agent/src/runtime/sse-event-schema.spec.ts`

SAD Appendix E requires `WRITE_PREVIEW` (emitted by Synthesizer before showing the inline approval UI) and `WRITE_CONFIRM` (emitted by the turn controller after the user confirms). Adding them as typed discriminated-union variants ensures the client can act on them.

- [ ] **Step 1: Write the failing tests**

In `packages/agent/src/runtime/sse-event-schema.spec.ts`, add:

```typescript
describe('write.preview event', () => {
  it('parses a valid write.preview event', () => {
    const raw = {
      seq: 10,
      type: 'write.preview',
      payload: {
        tool_name: 'planner.create-task',
        args_hash: 'abc123',
        bypassable: true,
        taint_state: false,
        summary: 'Create task "Fix login bug" in Project Alpha',
      },
    }
    const result = sseEventSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('write.preview')
      expect(result.data.payload.tool_name).toBe('planner.create-task')
    }
  })

  it('rejects write.preview missing required fields', () => {
    const raw = { seq: 10, type: 'write.preview', payload: { tool_name: 'x' } }
    expect(sseEventSchema.safeParse(raw).success).toBe(false)
  })
})

describe('write.confirm event', () => {
  it('parses a valid write.confirm event', () => {
    const raw = {
      seq: 11,
      type: 'write.confirm',
      payload: {
        tool_name: 'planner.create-task',
        idempotency_key: 'sha256abc',
        confirmed_at: '2026-05-06T12:00:00.000Z',
        mode: 'default',
      },
    }
    const result = sseEventSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('write.confirm')
      expect(result.data.payload.mode).toBe('default')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run --filter @future/agent test packages/agent/src/runtime/sse-event-schema.spec.ts
```

Expected: FAIL — discriminated union does not recognise `write.preview` or `write.confirm`.

- [ ] **Step 3: Add the two new event schemas to `sse-event-schema.ts`**

After the existing `draftProposedEvent` definition (around line 168), add:

```typescript
const writePreviewEvent = z.object({
  seq: z.number(),
  type: z.literal('write.preview'),
  payload: z.object({
    tool_name: z.string(),
    args_hash: z.string(),
    bypassable: z.boolean(),
    taint_state: z.boolean(),
    summary: z.string(),
  }),
  metadata: metadataSchema,
})

const writeConfirmEvent = z.object({
  seq: z.number(),
  type: z.literal('write.confirm'),
  payload: z.object({
    tool_name: z.string(),
    idempotency_key: z.string(),
    confirmed_at: z.string(),
    mode: z.enum(['default', 'bypass']),
  }),
  metadata: metadataSchema,
})
```

Then update the `sseEventSchema` discriminated union to include both new events (add before `turnEndedEvent`):

```typescript
export const sseEventSchema = z.discriminatedUnion('type', [
  turnStartedEvent,
  phaseStartedEvent,
  iterationStartedEvent,
  iterationValidatedEvent,
  iterationEndedEvent,
  progressEvent,
  refusalStartedEvent,
  answerShapeDeclaredEvent,
  answerTokenEvent,
  answerCompleteEvent,
  draftProposedEvent,
  writePreviewEvent,
  writeConfirmEvent,
  turnEndedEvent,
])
```

Add derived type exports at the bottom of the file:

```typescript
export type WritePreviewPayload = z.infer<typeof writePreviewEvent>['payload']
export type WriteConfirmPayload = z.infer<typeof writeConfirmEvent>['payload']
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run --filter @future/agent test packages/agent/src/runtime/sse-event-schema.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/runtime/sse-event-schema.ts packages/agent/src/runtime/sse-event-schema.spec.ts
git commit -m "feat(agent): add write.preview and write.confirm typed SSE events"
```

---

## Task 6: Render KB citations in `AgentThread`

**Files:**

- Modify: `packages/agent/src/thread/agent-thread.tsx`
- Modify: `packages/agent/src/thread/agent-thread.spec.tsx`
- Modify: `packages/agent/src/runtime/agent-turn-store.ts` (if `citations` not yet stored)

Citations arrive via the `answer.complete` SSE event (`citations: z.array(z.unknown())` — see `sse-event-schema.ts`). The turn store must persist them so `AgentAssistantMessage` can read them.

- [ ] **Step 1: Check whether the turn store already surfaces citations**

```bash
grep -n "citations\|answer.complete" packages/agent/src/runtime/agent-turn-store.ts | head -20
```

- [ ] **Step 2: Add `citations` to the turn store (if not already present)**

If `answer.complete` handler does not store citations, add a `citations` field. Read the full file first:

```bash
cat -n packages/agent/src/runtime/agent-turn-store.ts
```

Then add:

```typescript
// In state shape:
citations: Array<{ documentTitle: string; excerpt: string }>

// In initial / reset state:
citations: []

// In 'answer.complete' dispatch case:
case 'answer.complete': {
  const rawCitations = (event.payload.citations ?? []) as Array<{
    documentTitle?: string
    excerpt?: string
  }>
  return {
    ...state,
    citations: rawCitations.map((c) => ({
      documentTitle: c.documentTitle ?? '',
      excerpt: c.excerpt ?? '',
    })),
  }
}
```

- [ ] **Step 3: Write the failing test for citation rendering**

In `packages/agent/src/thread/agent-thread.spec.tsx`, add:

```typescript
import { useAgentTurnStore } from '../runtime/agent-turn-store'
import { act } from '@testing-library/react'

it('renders citation block when citations are present', () => {
  // Render with a wrapper that seeds the store
  function CitationWrapper({ children }: { children: React.ReactNode }) {
    const runtime = useLocalRuntime(noopAdapter)
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <AgentTurnStoreProvider>{children}</AgentTurnStoreProvider>
      </AssistantRuntimeProvider>
    )
  }

  const { rerender } = render(<AgentThread />, { wrapper: CitationWrapper })

  // Dispatch answer.complete with citations into the store
  act(() => {
    useAgentTurnStore.getState().dispatch({
      seq: 1,
      type: 'answer.complete',
      payload: {
        shape: 'short-answer',
        content: 'Employees get 15 days.',
        citations: [
          { documentTitle: 'Annual Leave Policy', excerpt: 'Employees accrue 15 days annually.' },
        ],
      },
    })
  })

  rerender(<AgentThread />)

  expect(screen.getByText('Sources (1)')).toBeDefined()
  expect(screen.getByText('Annual Leave Policy')).toBeDefined()
  expect(screen.getByText('Employees accrue 15 days annually.')).toBeDefined()
})

it('does not render citation block when citations are empty', () => {
  render(<AgentThread />, { wrapper: RuntimeWrapper })
  expect(screen.queryByText(/Sources/)).toBeNull()
})
```

Adapt the store-seeding approach to match how `agent-turn-store.spec.ts` seeds state — read the spec first for the exact pattern used.

- [ ] **Step 4: Run test to verify it fails**

```bash
bun run --filter @future/agent test packages/agent/src/thread/agent-thread.spec.tsx
```

Expected: FAIL — no "Sources" block rendered.

- [ ] **Step 5: Implement citation rendering in `AgentThread`**

Replace the full file `packages/agent/src/thread/agent-thread.tsx` with:

```typescript
'use client'

import { ThreadPrimitive, MessagePrimitive } from '@assistant-ui/react'
import { useAgentTurnStore } from '../runtime/agent-turn-store'

export function AgentThread() {
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto py-2">
        <ThreadPrimitive.Empty>
          <div
            data-testid="agent-thread-empty"
            className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"
          >
            <p className="text-sm">Start a conversation</p>
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage: AgentUserMessage,
            AssistantMessage: AgentAssistantMessage,
          }}
        />
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

function AgentUserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end px-3 py-1">
      <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

function AgentAssistantMessage() {
  const citations = useAgentTurnStore((s) => s.citations)

  return (
    <MessagePrimitive.Root className="flex justify-start px-3 py-1">
      <div className="max-w-[85%] space-y-2">
        <div className="rounded-lg bg-secondary/50 px-3 py-2 text-sm text-foreground">
          <MessagePrimitive.Content />
        </div>
        {citations.length > 0 && (
          <details className="rounded-lg border border-border px-3 py-2 text-xs">
            <summary className="cursor-pointer select-none font-medium text-muted-foreground">
              Sources ({citations.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {citations.map((c, i) => (
                <li key={i}>
                  <p className="font-semibold text-foreground">{c.documentTitle}</p>
                  <blockquote className="mt-0.5 border-l-2 border-border pl-2 text-muted-foreground">
                    {c.excerpt}
                  </blockquote>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </MessagePrimitive.Root>
  )
}
```

`useAgentTurnStore` must already be exported from `agent-turn-store.ts`. Verify with `grep -n "export.*useAgentTurnStore" packages/agent/src/runtime/agent-turn-store.ts`.

- [ ] **Step 6: Run tests to verify they pass**

```bash
bun run --filter @future/agent test packages/agent/src/thread/agent-thread.spec.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  packages/agent/src/thread/agent-thread.tsx \
  packages/agent/src/thread/agent-thread.spec.tsx \
  packages/agent/src/runtime/agent-turn-store.ts
git commit -m "feat(agent): render KB citation block in AgentAssistantMessage"
```

---

## Task 7: Playwright E2E smoke test

**Files:**

- Create: `apps/web-planner/e2e/agent-smoke.spec.ts`

- [ ] **Step 1: Check for existing Playwright config in web-planner**

```bash
ls apps/web-planner/e2e/ 2>/dev/null || echo "no e2e dir"
cat apps/web-planner/playwright.config.ts 2>/dev/null || echo "no playwright config"
```

If no Playwright config exists, check another zone that has one:

```bash
ls apps/web-shell/e2e/ 2>/dev/null
cat apps/web-shell/playwright.config.ts 2>/dev/null | head -30
```

Copy the config pattern from an existing zone if `web-planner` does not have one yet.

- [ ] **Step 2: Check the web-planner dev port**

```bash
grep -r '"dev"\|port\|PORT' apps/web-planner/package.json | head -5
```

- [ ] **Step 3: Write the Playwright spec**

Create `apps/web-planner/e2e/agent-smoke.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

const BASE_URL = process.env.WEB_PLANNER_URL ?? 'http://localhost:3005'

test.describe('Agent panel smoke', () => {
  test('panel opens when agent toggle is clicked', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.getByRole('button', { name: /agent/i }).click()
    await expect(page.getByTestId('agent-thread-empty')).toBeVisible()
  })

  test('execution-mode select is visible in composer', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.getByRole('button', { name: /agent/i }).click()
    const select = page.getByRole('combobox')
    await expect(select).toBeVisible()
    await expect(select).toContainText('Default approvals')
  })

  test('execution_mode bypass is sent in turn POST body', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.getByRole('button', { name: /agent/i }).click()

    let capturedBody: Record<string, unknown> = {}
    await page.route('**/api/agent/turn', async (route) => {
      const request = route.request()
      capturedBody = JSON.parse(request.postData() ?? '{}')
      await route.abort()
    })

    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Bypass approvals' }).click()
    await page.getByPlaceholder('Ask the agent...').fill('test')
    await page.getByRole('button', { name: /send/i }).click()

    expect(capturedBody.execution_mode).toBe('bypass')
  })
})
```

- [ ] **Step 4: Run the E2E test (requires dev server)**

```bash
# Assumes web-planner dev server is already running on :3005
bun run --filter web-planner test:e2e -- e2e/agent-smoke.spec.ts
```

Expected: all 3 tests pass. A "connection refused" failure means the dev server is not running — start it first.

- [ ] **Step 5: Commit**

```bash
git add apps/web-planner/e2e/agent-smoke.spec.ts
git commit -m "test(web-planner): add agent panel E2E smoke tests"
```

---

## Task 8: Full package test pass

- [ ] **Step 1: Build workspace packages**

```bash
bun run --filter "@future/*" build
```

- [ ] **Step 2: Run all modified package unit tests**

```bash
bun run --filter @future/agent test
bun run --filter @future/api test apps/api/src/modules/agents/interface/http/agent-turn-controller.spec.ts
```

Expected: all tests green, coverage ≥ 70% on modified files.

- [ ] **Step 3: TypeScript type check**

```bash
bun run --filter @future/agent typecheck
bun run --filter @future/api typecheck
```

Expected: zero type errors.

- [ ] **Step 4: Final commit if any lint fixes are needed**

```bash
git add -p
git commit -m "chore(agent): fix lint issues from chat surface integration"
```

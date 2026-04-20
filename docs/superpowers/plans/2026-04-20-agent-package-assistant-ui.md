# `packages/agent` — assistant-ui Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the weak custom chat UI in `packages/agent` with `@assistant-ui/react` primitives, giving streaming, markdown, and consistent component quality — all maintained as one reusable package consumed by every zone.

**Architecture:** `AgentChatAdapter` (implements `ChatModelAdapter`) wires `@microsoft/fetch-event-source` to the §15.3 SSE schema inside an async generator `run()`. `AgentPanel` wraps `AssistantRuntimeProvider` + `useLocalRuntime(adapter)`. `AgentThread` and `AgentComposer` are DESIGN.md-styled wrappers over `@assistant-ui/react` Thread and Composer primitives. `AgentMessage`, `AgentMessageInput`, and `AgentToolTrace` are deleted.

**Tech Stack:** `@assistant-ui/react`, `@microsoft/fetch-event-source`, `zustand`, vitest, @testing-library/react, zod (already in repo via `@future/ui`)

---

## File Map

**Create:**

- `packages/agent/src/runtime/sse-event-schema.ts` — zod discriminated union for all §15.3 SSE event types
- `packages/agent/src/runtime/sse-event-schema.spec.ts`
- `packages/agent/src/runtime/agent-turn-store.ts` — zustand store for phase/draft/ended side-channel state
- `packages/agent/src/runtime/agent-turn-store.spec.ts`
- `packages/agent/src/runtime/agent-chat-adapter.ts` — `ChatModelAdapter` implementation
- `packages/agent/src/runtime/agent-chat-adapter.spec.ts`
- `packages/agent/src/thread/agent-thread.tsx` — DESIGN.md-styled Thread wrapper
- `packages/agent/src/thread/agent-thread.spec.tsx`
- `packages/agent/src/thread/agent-composer.tsx` — DESIGN.md-styled Composer wrapper
- `packages/agent/src/thread/agent-composer.spec.tsx`

**Modify:**

- `packages/agent/package.json` — add dependencies (via CLI, not manual)
- `packages/agent/src/panel/agent-panel.tsx` — use `AssistantRuntimeProvider` + `AgentThread` + `AgentComposer`
- `packages/agent/src/panel/agent-panel.spec.tsx` — update tests
- `packages/agent/src/inline/agent-inline-response.tsx` — fix CLAUDE.md violations (raw `<button>`)
- `packages/agent/src/inline/agent-inline-response.spec.tsx` — update cursor test
- `packages/agent/src/index.ts` — add new exports, remove deleted ones

**Delete:**

- `packages/agent/src/panel/agent-message.tsx`
- `packages/agent/src/panel/agent-message.spec.tsx`
- `packages/agent/src/panel/agent-message-input.tsx`
- `packages/agent/src/panel/agent-message-input.spec.tsx`
- `packages/agent/src/panel/agent-tool-trace.tsx`

---

## Task 1: Install dependencies

- [ ] **Step 1: Add runtime deps to `packages/agent`**

Run from repo root (NOT manual package.json edit — CLAUDE.md rule):

```bash
bun add @assistant-ui/react @microsoft/fetch-event-source zustand --filter @future/agent
```

- [ ] **Step 2: Verify install**

```bash
bun run --filter @future/agent build
```

Expected: build passes with no missing-module errors.

- [ ] **Step 3: Commit**

```bash
git add packages/agent/package.json bun.lock
git commit -m "chore(agent): add @assistant-ui/react, fetch-event-source, zustand"
```

---

## Task 2: SSE event schema

**Files:**

- Create: `packages/agent/src/runtime/sse-event-schema.ts`
- Create: `packages/agent/src/runtime/sse-event-schema.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/agent/src/runtime/sse-event-schema.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sseEventSchema } from './sse-event-schema'

describe('sseEventSchema', () => {
  it('parses answer.delta', () => {
    const result = sseEventSchema.parse({ type: 'answer.delta', text: 'Hello' })
    expect(result).toEqual({ type: 'answer.delta', text: 'Hello' })
  })

  it('parses answer.complete', () => {
    const result = sseEventSchema.parse({ type: 'answer.complete' })
    expect(result).toEqual({ type: 'answer.complete' })
  })

  it('parses answer.shape_declared', () => {
    const result = sseEventSchema.parse({ type: 'answer.shape_declared', shape: 'table' })
    expect(result).toEqual({ type: 'answer.shape_declared', shape: 'table' })
  })

  it('parses phase.started', () => {
    const result = sseEventSchema.parse({
      type: 'phase.started',
      phase: 1,
      subAgents: ['planner', 'people'],
    })
    expect(result).toEqual({ type: 'phase.started', phase: 1, subAgents: ['planner', 'people'] })
  })

  it('parses refusal', () => {
    const result = sseEventSchema.parse({ type: 'refusal', reason: 'insufficient permissions' })
    expect(result).toEqual({ type: 'refusal', reason: 'insufficient permissions' })
  })

  it('parses draft.proposed', () => {
    const result = sseEventSchema.parse({
      type: 'draft.proposed',
      draftId: 'draft-123',
      commandType: 'tasks.create',
      payload: { title: 'New task' },
    })
    expect(result.type).toBe('draft.proposed')
    expect(result.draftId).toBe('draft-123')
  })

  it('parses turn.ended with each valid reason', () => {
    for (const reason of [
      'completed',
      'refused',
      'budget',
      'moderation',
      'cancelled',
      'ceiling',
    ] as const) {
      const result = sseEventSchema.parse({ type: 'turn.ended', reason })
      expect(result).toEqual({ type: 'turn.ended', reason })
    }
  })

  it('rejects unknown event type', () => {
    expect(() => sseEventSchema.parse({ type: 'unknown.event' })).toThrow()
  })

  it('rejects turn.ended with unknown reason', () => {
    expect(() => sseEventSchema.parse({ type: 'turn.ended', reason: 'flying' })).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run --filter @future/agent test:unit src/runtime/sse-event-schema.spec.ts
```

Expected: FAIL — `Cannot find module './sse-event-schema'`

- [ ] **Step 3: Implement**

Create `packages/agent/src/runtime/sse-event-schema.ts`:

```ts
import { z } from 'zod'

const answerDeltaEvent = z.object({
  type: z.literal('answer.delta'),
  text: z.string(),
})

const answerCompleteEvent = z.object({
  type: z.literal('answer.complete'),
})

const answerShapeDeclaredEvent = z.object({
  type: z.literal('answer.shape_declared'),
  shape: z.string(),
})

const phaseStartedEvent = z.object({
  type: z.literal('phase.started'),
  phase: z.union([z.literal(1), z.literal(2)]),
  subAgents: z.array(z.string()),
})

const refusalEvent = z.object({
  type: z.literal('refusal'),
  reason: z.string(),
})

const draftProposedEvent = z.object({
  type: z.literal('draft.proposed'),
  draftId: z.string(),
  commandType: z.string(),
  payload: z.unknown(),
})

const turnEndedEvent = z.object({
  type: z.literal('turn.ended'),
  reason: z.enum(['completed', 'refused', 'budget', 'moderation', 'cancelled', 'ceiling']),
})

export const sseEventSchema = z.discriminatedUnion('type', [
  answerDeltaEvent,
  answerCompleteEvent,
  answerShapeDeclaredEvent,
  phaseStartedEvent,
  refusalEvent,
  draftProposedEvent,
  turnEndedEvent,
])

export type SseEvent = z.infer<typeof sseEventSchema>
export type TurnEndReason = z.infer<typeof turnEndedEvent>['reason']

export type DraftPayload = {
  draftId: string
  commandType: string
  payload: unknown
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run --filter @future/agent test:unit src/runtime/sse-event-schema.spec.ts
```

Expected: all 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/runtime/
git commit -m "feat(agent): SSE event schema for §15.3 event types"
```

---

## Task 3: Agent turn Zustand store

**Files:**

- Create: `packages/agent/src/runtime/agent-turn-store.ts`
- Create: `packages/agent/src/runtime/agent-turn-store.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/agent/src/runtime/agent-turn-store.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createAgentTurnStore } from './agent-turn-store'

describe('agentTurnStore', () => {
  let store: ReturnType<typeof createAgentTurnStore>

  beforeEach(() => {
    store = createAgentTurnStore()
  })

  it('has correct initial state', () => {
    const state = store.getState()
    expect(state.phase).toBeNull()
    expect(state.activeSubAgents).toEqual([])
    expect(state.shape).toBeNull()
    expect(state.drafts).toEqual([])
    expect(state.isRefused).toBe(false)
    expect(state.refusalReason).toBeNull()
    expect(state.isEnded).toBe(false)
    expect(state.endReason).toBeNull()
  })

  it('dispatches phase.started', () => {
    store.getState().dispatch({ type: 'phase.started', phase: 1, subAgents: ['planner'] })
    expect(store.getState().phase).toBe(1)
    expect(store.getState().activeSubAgents).toEqual(['planner'])
  })

  it('dispatches answer.shape_declared', () => {
    store.getState().dispatch({ type: 'answer.shape_declared', shape: 'table' })
    expect(store.getState().shape).toBe('table')
  })

  it('dispatches draft.proposed and appends to drafts', () => {
    store.getState().dispatch({
      type: 'draft.proposed',
      draftId: 'draft-1',
      commandType: 'tasks.create',
      payload: { title: 'Task A' },
    })
    store.getState().dispatch({
      type: 'draft.proposed',
      draftId: 'draft-2',
      commandType: 'tasks.update',
      payload: { id: 'task-99' },
    })
    expect(store.getState().drafts).toHaveLength(2)
    expect(store.getState().drafts[0].draftId).toBe('draft-1')
    expect(store.getState().drafts[1].draftId).toBe('draft-2')
  })

  it('dispatches refusal', () => {
    store.getState().dispatch({ type: 'refusal', reason: 'no permission' })
    expect(store.getState().isRefused).toBe(true)
    expect(store.getState().refusalReason).toBe('no permission')
  })

  it('dispatches turn.ended', () => {
    store.getState().dispatch({ type: 'turn.ended', reason: 'budget' })
    expect(store.getState().isEnded).toBe(true)
    expect(store.getState().endReason).toBe('budget')
  })

  it('reset clears all state', () => {
    store.getState().dispatch({ type: 'phase.started', phase: 2, subAgents: ['people'] })
    store.getState().dispatch({ type: 'refusal', reason: 'moderation' })
    store.getState().reset()
    const state = store.getState()
    expect(state.phase).toBeNull()
    expect(state.isRefused).toBe(false)
    expect(state.activeSubAgents).toEqual([])
  })

  it('ignores answer.delta and answer.complete (text events belong to adapter)', () => {
    // These events are yielded by the adapter — the store does not mutate for them
    store.getState().dispatch({ type: 'answer.delta', text: 'hello' })
    store.getState().dispatch({ type: 'answer.complete' })
    // No state change expected
    const state = store.getState()
    expect(state.phase).toBeNull()
    expect(state.drafts).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run --filter @future/agent test:unit src/runtime/agent-turn-store.spec.ts
```

Expected: FAIL — `Cannot find module './agent-turn-store'`

- [ ] **Step 3: Implement**

Create `packages/agent/src/runtime/agent-turn-store.ts`:

```ts
import { createStore } from 'zustand/vanilla'
import type { SseEvent, DraftPayload, TurnEndReason } from './sse-event-schema'

export interface AgentTurnState {
  phase: 1 | 2 | null
  activeSubAgents: string[]
  shape: string | null
  drafts: DraftPayload[]
  isRefused: boolean
  refusalReason: string | null
  isEnded: boolean
  endReason: TurnEndReason | null
  dispatch: (event: SseEvent) => void
  reset: () => void
}

const initialState = {
  phase: null as 1 | 2 | null,
  activeSubAgents: [] as string[],
  shape: null as string | null,
  drafts: [] as DraftPayload[],
  isRefused: false,
  refusalReason: null as string | null,
  isEnded: false,
  endReason: null as TurnEndReason | null,
}

export function createAgentTurnStore() {
  return createStore<AgentTurnState>((set) => ({
    ...initialState,
    dispatch(event: SseEvent) {
      switch (event.type) {
        case 'phase.started':
          set({ phase: event.phase, activeSubAgents: event.subAgents })
          break
        case 'answer.shape_declared':
          set({ shape: event.shape })
          break
        case 'draft.proposed':
          set((s) => ({
            drafts: [
              ...s.drafts,
              { draftId: event.draftId, commandType: event.commandType, payload: event.payload },
            ],
          }))
          break
        case 'refusal':
          set({ isRefused: true, refusalReason: event.reason })
          break
        case 'turn.ended':
          set({ isEnded: true, endReason: event.reason })
          break
        // answer.delta and answer.complete are handled by the adapter's generator — no store mutation
      }
    },
    reset() {
      set({ ...initialState })
    },
  }))
}

export type AgentTurnStore = ReturnType<typeof createAgentTurnStore>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run --filter @future/agent test:unit src/runtime/agent-turn-store.spec.ts
```

Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/runtime/agent-turn-store.ts packages/agent/src/runtime/agent-turn-store.spec.ts
git commit -m "feat(agent): Zustand side-channel store for §15.3 SSE phase/draft/ended events"
```

---

## Task 4: AgentChatAdapter

**Files:**

- Create: `packages/agent/src/runtime/agent-chat-adapter.ts`
- Create: `packages/agent/src/runtime/agent-chat-adapter.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/agent/src/runtime/agent-chat-adapter.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAgentChatAdapter } from './agent-chat-adapter'
import { createAgentTurnStore } from './agent-turn-store'

// Mock @microsoft/fetch-event-source
vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(),
}))

import { fetchEventSource } from '@microsoft/fetch-event-source'

const mockFetchEventSource = vi.mocked(fetchEventSource)

describe('AgentChatAdapter', () => {
  let store: ReturnType<typeof createAgentTurnStore>

  beforeEach(() => {
    store = createAgentTurnStore()
    vi.clearAllMocks()
  })

  it('calls POST /agent/turn with correct payload', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'turn.ended', reason: 'completed' }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({ endpoint: '/agent/turn', surface: 'panel', store })
    const gen = adapter.run({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
    })

    // Drain the generator
    const results = []
    for await (const chunk of gen as AsyncGenerator<any>) {
      results.push(chunk)
    }

    expect(mockFetchEventSource).toHaveBeenCalledWith(
      '/agent/turn',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: expect.stringContaining('"surface":"panel"'),
      }),
    )
  })

  it('yields accumulated text for answer.delta events', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'answer.delta', text: 'Hello' }),
        event: '',
        id: '',
        retry: undefined,
      })
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'answer.delta', text: ' world' }),
        event: '',
        id: '',
        retry: undefined,
      })
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'turn.ended', reason: 'completed' }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({ endpoint: '/agent/turn', surface: 'panel', store })
    const gen = adapter.run({
      messages: [] as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
    })

    const results: any[] = []
    for await (const chunk of gen as AsyncGenerator<any>) {
      results.push(chunk)
    }

    expect(results).toHaveLength(2)
    expect(results[0].content[0]).toEqual({ type: 'text', text: 'Hello' })
    expect(results[1].content[0]).toEqual({ type: 'text', text: 'Hello world' })
  })

  it('dispatches phase.started to the store', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'phase.started', phase: 1, subAgents: ['planner'] }),
        event: '',
        id: '',
        retry: undefined,
      })
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'turn.ended', reason: 'completed' }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({ endpoint: '/agent/turn', surface: 'panel', store })
    const gen = adapter.run({
      messages: [] as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
    })
    for await (const _ of gen as AsyncGenerator<any>) {
      /* drain */
    }

    expect(store.getState().phase).toBe(1)
    expect(store.getState().activeSubAgents).toEqual(['planner'])
  })

  it('dispatches draft.proposed to the store', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({
          type: 'draft.proposed',
          draftId: 'dr-1',
          commandType: 'tasks.create',
          payload: {},
        }),
        event: '',
        id: '',
        retry: undefined,
      })
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'turn.ended', reason: 'completed' }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({ endpoint: '/agent/turn', surface: 'panel', store })
    const gen = adapter.run({
      messages: [] as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
    })
    for await (const _ of gen as AsyncGenerator<any>) {
      /* drain */
    }

    expect(store.getState().drafts).toHaveLength(1)
    expect(store.getState().drafts[0].draftId).toBe('dr-1')
  })

  it('resets store at start of each run', async () => {
    // Put some state in the store first
    store.getState().dispatch({ type: 'phase.started', phase: 2, subAgents: ['old'] })

    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'turn.ended', reason: 'completed' }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const adapter = createAgentChatAdapter({ endpoint: '/agent/turn', surface: 'panel', store })
    const gen = adapter.run({
      messages: [] as any,
      abortSignal: new AbortController().signal,
      context: {} as any,
    })
    for await (const _ of gen as AsyncGenerator<any>) {
      /* drain */
    }

    // Should have been reset at start of run
    expect(store.getState().activeSubAgents).toEqual([])
  })

  it('passes abortSignal to fetchEventSource', async () => {
    mockFetchEventSource.mockImplementation(async (_url, opts) => {
      opts?.onmessage?.({
        data: JSON.stringify({ type: 'turn.ended', reason: 'cancelled' }),
        event: '',
        id: '',
        retry: undefined,
      })
    })

    const controller = new AbortController()
    const adapter = createAgentChatAdapter({ endpoint: '/agent/turn', surface: 'panel', store })
    const gen = adapter.run({
      messages: [] as any,
      abortSignal: controller.signal,
      context: {} as any,
    })
    for await (const _ of gen as AsyncGenerator<any>) {
      /* drain */
    }

    expect(mockFetchEventSource).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run --filter @future/agent test:unit src/runtime/agent-chat-adapter.spec.ts
```

Expected: FAIL — `Cannot find module './agent-chat-adapter'`

- [ ] **Step 3: Implement**

Create `packages/agent/src/runtime/agent-chat-adapter.ts`:

```ts
import { fetchEventSource } from '@microsoft/fetch-event-source'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { sseEventSchema } from './sse-event-schema'
import type { AgentTurnStore } from './agent-turn-store'
import type { AgentContext } from '../types'

export interface AgentChatAdapterOptions {
  endpoint: string
  surface: 'panel' | 'inline'
  store: AgentTurnStore
  context?: AgentContext
}

export function createAgentChatAdapter(opts: AgentChatAdapterOptions): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      opts.store.getState().reset()

      let accumulatedText = ''
      const chunks: Array<{ content: [{ type: 'text'; text: string }] }> = []
      let resolveChunk: (() => void) | null = null
      let done = false

      const body = JSON.stringify({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        surface: opts.surface,
        context: opts.context ?? null,
      })

      fetchEventSource(opts.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: abortSignal,
        onmessage(ev) {
          const parsed = sseEventSchema.safeParse(JSON.parse(ev.data))
          if (!parsed.success) return

          const event = parsed.data

          if (event.type === 'answer.delta') {
            accumulatedText += event.text
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
          done = true
          resolveChunk?.()
          resolveChunk = null
          throw err
        },
      }).then(() => {
        done = true
        resolveChunk?.()
        resolveChunk = null
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
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run --filter @future/agent test:unit src/runtime/agent-chat-adapter.spec.ts
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/runtime/agent-chat-adapter.ts packages/agent/src/runtime/agent-chat-adapter.spec.ts
git commit -m "feat(agent): AgentChatAdapter — ChatModelAdapter wrapping fetch-event-source for §15.3 SSE"
```

---

## Task 5: AgentThread

**Files:**

- Create: `packages/agent/src/thread/agent-thread.tsx`
- Create: `packages/agent/src/thread/agent-thread.spec.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/agent/src/thread/agent-thread.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { AgentThread } from './agent-thread'

const noopAdapter: ChatModelAdapter = {
  async *run() {
    /* no-op for tests */
  },
}

function RuntimeWrapper({ children }: { children: React.ReactNode }) {
  const runtime = useLocalRuntime(noopAdapter)
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}

describe('AgentThread', () => {
  it('renders the thread container', () => {
    const { container } = render(<AgentThread />, { wrapper: RuntimeWrapper })
    expect(container.firstChild).toBeTruthy()
  })

  it('shows empty state when no messages', () => {
    render(<AgentThread />, { wrapper: RuntimeWrapper })
    expect(screen.getByTestId('agent-thread-empty')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run --filter @future/agent test:unit src/thread/agent-thread.spec.tsx
```

Expected: FAIL — `Cannot find module './agent-thread'`

- [ ] **Step 3: Implement**

Create `packages/agent/src/thread/agent-thread.tsx`:

```tsx
'use client'

import {
  ThreadPrimitive,
  MessagePrimitive,
  UserMessagePrimitive,
  AssistantMessagePrimitive,
} from '@assistant-ui/react'

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
        <UserMessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

function AgentAssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start px-3 py-1">
      <div className="max-w-[85%] rounded-lg bg-secondary/50 px-3 py-2 text-sm text-foreground">
        <AssistantMessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run --filter @future/agent test:unit src/thread/agent-thread.spec.tsx
```

Expected: both tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/thread/agent-thread.tsx packages/agent/src/thread/agent-thread.spec.tsx
git commit -m "feat(agent): AgentThread — DESIGN.md-styled Thread wrapper on @assistant-ui/react primitives"
```

---

## Task 6: AgentComposer

**Files:**

- Create: `packages/agent/src/thread/agent-composer.tsx`
- Create: `packages/agent/src/thread/agent-composer.spec.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/agent/src/thread/agent-composer.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { AgentComposer } from './agent-composer'

const noopAdapter: ChatModelAdapter = { async *run() {} }

function RuntimeWrapper({ children }: { children: React.ReactNode }) {
  const runtime = useLocalRuntime(noopAdapter)
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}

describe('AgentComposer', () => {
  it('renders textarea input', () => {
    render(<AgentComposer />, { wrapper: RuntimeWrapper })
    expect(screen.getByRole('textbox')).toBeDefined()
  })

  it('renders send button', () => {
    render(<AgentComposer />, { wrapper: RuntimeWrapper })
    expect(screen.getByRole('button', { name: /send/i })).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run --filter @future/agent test:unit src/thread/agent-composer.spec.tsx
```

Expected: FAIL — `Cannot find module './agent-composer'`

- [ ] **Step 3: Implement**

Create `packages/agent/src/thread/agent-composer.tsx`:

```tsx
'use client'

import { Send, Square } from 'lucide-react'
import { ComposerPrimitive, ThreadPrimitive } from '@assistant-ui/react'

export function AgentComposer() {
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 border-t border-border px-3 py-2">
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
        <ComposerPrimitive.Stop
          aria-label="Stop"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary/50"
        >
          <Square className="h-4 w-4" />
        </ComposerPrimitive.Stop>
      </ThreadPrimitive.If>
    </ComposerPrimitive.Root>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run --filter @future/agent test:unit src/thread/agent-composer.spec.tsx
```

Expected: both tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/thread/agent-composer.tsx packages/agent/src/thread/agent-composer.spec.tsx
git commit -m "feat(agent): AgentComposer — auto-resize textarea + send/stop via @assistant-ui/react primitives"
```

---

## Task 7: Refactor AgentPanel

**Files:**

- Modify: `packages/agent/src/panel/agent-panel.tsx`
- Modify: `packages/agent/src/panel/agent-panel.spec.tsx`

- [ ] **Step 1: Rewrite the tests first**

Replace `packages/agent/src/panel/agent-panel.spec.tsx` with:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { AgentPanel } from './agent-panel'
import { AgentStateProvider } from '../hooks/use-agent-state'

function wrapper({ children }: { children: ReactNode }) {
  return createElement(AgentStateProvider, null, children)
}

describe('AgentPanel', () => {
  it('renders panel container', () => {
    const { container } = render(<AgentPanel />, { wrapper })
    expect(container.querySelector('[data-testid="agent-panel"]')).toBeDefined()
  })

  it('renders the composer textarea', () => {
    render(<AgentPanel />, { wrapper })
    expect(screen.getByRole('textbox')).toBeDefined()
  })

  it('renders the send button', () => {
    render(<AgentPanel />, { wrapper })
    expect(screen.getByRole('button', { name: /send/i })).toBeDefined()
  })

  it('shows empty state when no messages', () => {
    render(<AgentPanel />, { wrapper })
    expect(screen.getByTestId('agent-thread-empty')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun run --filter @future/agent test:unit src/panel/agent-panel.spec.tsx
```

Expected: FAIL — tests reference `agent-thread-empty` which doesn't render yet

- [ ] **Step 3: Rewrite AgentPanel**

Replace `packages/agent/src/panel/agent-panel.tsx` with:

```tsx
'use client'

import type { ReactNode } from 'react'
import { X, MessageSquare } from 'lucide-react'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import { useAgentState } from '../hooks/use-agent-state'
import { useAgentContext } from '../context/use-agent-context'
import { AgentContextPills } from './agent-context-pills'
import { AgentThread } from '../thread/agent-thread'
import { AgentComposer } from '../thread/agent-composer'
import { createAgentChatAdapter } from '../runtime/agent-chat-adapter'
import { createAgentTurnStore } from '../runtime/agent-turn-store'
import { useMemo } from 'react'

export interface AgentPanelProps {
  endpoint?: string
}

export function AgentPanel({ endpoint = '/api/agent/turn' }: AgentPanelProps) {
  const { setPanelOpen } = useAgentState()
  const ctx = useAgentContext()

  const store = useMemo(() => createAgentTurnStore(), [])
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

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div data-testid="agent-panel" className="h-full w-96 flex-shrink-0 border-l border-border">
        <div className="dark flex h-full min-h-0 flex-col bg-sidebar shadow-lg">
          <PanelHeader onClose={() => setPanelOpen(false)} />
          <AgentContextPills />
          <AgentThread />
          <AgentComposer />
        </div>
      </div>
    </AssistantRuntimeProvider>
  )
}

function PanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-sidebar-border px-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-510">Agent</span>
      </div>
      <button
        onClick={onClose}
        aria-label="Close agent panel"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-all hover:border-border hover:bg-(--btn-ghost-bg) hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run --filter @future/agent test:unit src/panel/agent-panel.spec.tsx
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/panel/agent-panel.tsx packages/agent/src/panel/agent-panel.spec.tsx
git commit -m "feat(agent): refactor AgentPanel to use AssistantRuntimeProvider + AgentThread + AgentComposer"
```

---

## Task 8: Fix AgentInlineResponse CLAUDE.md violation

**Files:**

- Modify: `packages/agent/src/inline/agent-inline-response.tsx`
- Modify: `packages/agent/src/inline/agent-inline-response.spec.tsx`

The existing component uses a raw `<button>` (CLAUDE.md violation) and an `animate-pulse` `<span>` for the streaming cursor. Fix the button; keep the cursor span (it is a text cursor, not a skeleton placeholder — the CLAUDE.md rule targets loading skeleton divs).

- [ ] **Step 1: Update the test to use aria-label for button**

In `packages/agent/src/inline/agent-inline-response.spec.tsx`, the dismiss button test uses `screen.getByRole('button')`. Add a `name` assertion to make the test robust after adding `aria-label`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentInlineResponse } from './agent-inline-response'

describe('AgentInlineResponse', () => {
  it('renders the content', () => {
    render(<AgentInlineResponse content="Agent response here" onDismiss={vi.fn()} />)
    expect(screen.getByText('Agent response here')).toBeDefined()
  })

  it('shows streaming cursor when isStreaming is true', () => {
    const { container } = render(
      <AgentInlineResponse content="Loading..." isStreaming onDismiss={vi.fn()} />,
    )
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('does not show streaming cursor when isStreaming is false', () => {
    const { container } = render(
      <AgentInlineResponse content="Done" isStreaming={false} onDismiss={vi.fn()} />,
    )
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<AgentInlineResponse content="Hello" onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('shows Continue in panel button when onContinueInPanel is provided and not streaming', () => {
    const onContinueInPanel = vi.fn()
    render(
      <AgentInlineResponse
        content="Done"
        onDismiss={vi.fn()}
        onContinueInPanel={onContinueInPanel}
      />,
    )
    const continueBtn = screen.getByText(/continue in panel/i)
    expect(continueBtn).toBeDefined()
    fireEvent.click(continueBtn)
    expect(onContinueInPanel).toHaveBeenCalledOnce()
  })

  it('hides Continue in panel button when isStreaming is true', () => {
    render(
      <AgentInlineResponse
        content="Loading..."
        isStreaming
        onDismiss={vi.fn()}
        onContinueInPanel={vi.fn()}
      />,
    )
    expect(screen.queryByText(/continue in panel/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify the aria-label test fails**

```bash
bun run --filter @future/agent test:unit src/inline/agent-inline-response.spec.tsx
```

Expected: FAIL on `getByRole('button', { name: /dismiss/i })` — no aria-label yet

- [ ] **Step 3: Fix the component**

Replace `packages/agent/src/inline/agent-inline-response.tsx` with:

```tsx
'use client'

import { X } from 'lucide-react'
import { Button } from '@future/ui'

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
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="h-6 w-6 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {onContinueInPanel && !isStreaming && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onContinueInPanel}
          className="mt-2 h-auto p-0 text-xs text-primary hover:underline"
        >
          Continue in panel →
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run --filter @future/agent test:unit src/inline/agent-inline-response.spec.tsx
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/inline/agent-inline-response.tsx packages/agent/src/inline/agent-inline-response.spec.tsx
git commit -m "fix(agent): replace raw <button> with <Button> in AgentInlineResponse — CLAUDE.md compliance"
```

---

## Task 9: Delete obsolete files

- [ ] **Step 1: Delete the files**

```bash
rm packages/agent/src/panel/agent-message.tsx
rm packages/agent/src/panel/agent-message.spec.tsx
rm packages/agent/src/panel/agent-message-input.tsx
rm packages/agent/src/panel/agent-message-input.spec.tsx
rm packages/agent/src/panel/agent-tool-trace.tsx
```

- [ ] **Step 2: Run full test suite to confirm nothing else imports them**

```bash
bun run --filter @future/agent test:unit
```

Expected: all remaining tests PASS (no import errors)

- [ ] **Step 3: Commit**

```bash
git add -u packages/agent/src/panel/
git commit -m "refactor(agent): delete AgentMessage, AgentMessageInput, AgentToolTrace — replaced by @assistant-ui/react"
```

---

## Task 10: Update index.ts exports

**Files:**

- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Replace the exports file**

Replace `packages/agent/src/index.ts` with:

```ts
// Types
export type {
  ModuleKey,
  AgentContext,
  AgentInsight,
  AgentInlineActionConfig,
  AgentSessionStatus,
  AgentMessageRole,
  AgentSession,
  AgentPanelState,
} from './types'

// Context
export { AgentContextProvider } from './context/agent-context-provider'
export type { AgentContextProviderProps } from './context/agent-context-provider'
export { useAgentContext } from './context/use-agent-context'

// State
export { AgentStateProvider, useAgentState, useOptionalAgentState } from './hooks/use-agent-state'
export type { AgentStateContextValue } from './hooks/use-agent-state'

// Provider
export { AgentProvider } from './agent-provider'
export type { AgentProviderProps } from './agent-provider'

// Runtime
export { createAgentChatAdapter } from './runtime/agent-chat-adapter'
export type { AgentChatAdapterOptions } from './runtime/agent-chat-adapter'
export { createAgentTurnStore } from './runtime/agent-turn-store'
export type { AgentTurnStore, AgentTurnState } from './runtime/agent-turn-store'
export { sseEventSchema } from './runtime/sse-event-schema'
export type { SseEvent, TurnEndReason, DraftPayload } from './runtime/sse-event-schema'

// Thread
export { AgentThread } from './thread/agent-thread'
export { AgentComposer } from './thread/agent-composer'

// Panel
export { AgentPanel } from './panel/agent-panel'
export type { AgentPanelProps } from './panel/agent-panel'

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

- [ ] **Step 2: Build and run all tests**

```bash
bun run --filter @future/agent build && bun run --filter @future/agent test:unit
```

Expected: build passes, all tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/index.ts
git commit -m "feat(agent): update exports — add runtime + thread exports, remove obsolete AgentMessage/Input/ToolTrace"
```

---

## Self-Review

### Spec coverage

| Requirement                                            | Task                                          |
| ------------------------------------------------------ | --------------------------------------------- |
| Replace raw `<input>` with proper Composer             | Task 6 (AgentComposer)                        |
| Replace raw `<button>` in AgentInlineResponse          | Task 8                                        |
| Streaming support via `@assistant-ui/react`            | Task 5 + 6 + 7                                |
| SSE transport inside ChatModelAdapter.run()            | Task 4                                        |
| §15.3 event schema (zod)                               | Task 2                                        |
| Phase/draft/ended side-channel state                   | Task 3                                        |
| Delete AgentMessage, AgentMessageInput, AgentToolTrace | Task 9                                        |
| Single package maintenance point for all zones         | Tasks 5–10 (all components in packages/agent) |
| No raw `<button>` violations                           | Task 8                                        |

### Placeholder check — none found.

### Type consistency check

- `AgentChatAdapterOptions.store` is `AgentTurnStore` (from Task 3) — used in Task 4 ✓
- `createAgentTurnStore()` returns `AgentTurnStore` — used in Task 7 (AgentPanel) ✓
- `AgentThread` / `AgentComposer` imported in `AgentPanel` (Task 7) — defined in Tasks 5/6 ✓
- `DraftPayload` type defined in Task 2 (sse-event-schema), imported in Task 3 (store) ✓

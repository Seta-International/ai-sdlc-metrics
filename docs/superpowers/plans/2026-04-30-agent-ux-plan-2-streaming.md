# Agent UX Refactor — Plan 2: Streaming visualization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `turn.started`/`phase.started` as a `PlanCard`, each `iteration.*` chain as a collapsible `IterationStep`, `answer.token` as a streaming `AnswerBubble`, and `refusal.started` as a refusal block. Adapter emits assistant-ui parts; thread registers tool UIs to render them.

**Architecture:** Extend `agent-chat-adapter` to emit one `text` part for tokens and `tool-call` parts (`agent.plan`, `agent.iteration`, `agent.draft`) for non-token events. `AgentThread` registers tool-UI renderers. PlanCard/IterationStep are thin presentational components consuming the part args. No backend changes.

**Tech Stack:** React 19 · `@assistant-ui/react` 0.12 (`useAssistantToolUI`, `MessagePrimitive`, `ThreadPrimitive`) · zustand · Vitest.

**Spec:** `docs/superpowers/specs/2026-04-30-agent-module-ux-refactor-design.md` §5

**Depends on:** Plan 1 (primitives `Tag`, `Mono`, `ToolCallShell`).

---

## Task 1: Pre-flight baseline + branch

- [ ] **Step 1: Verify Plan 1 has landed**

```bash
git checkout main && git pull
test -f packages/agent/src/primitives/tool-call-shell.tsx || (echo "Plan 1 not landed yet" && exit 1)
bun run --filter @future/agent test:unit
```

Expected: file exists, tests pass.

- [ ] **Step 2: Branch**

```bash
git checkout -b feat/agent-ux-plan-2-streaming
```

---

## Task 2: Define an adapter event-shape contract (types + helper)

We need the adapter to emit assistant-ui parts of a known shape so renderers and tests can assert against the same types.

**Files:**

- Create: `packages/agent/src/runtime/agent-message-parts.ts`
- Create: `packages/agent/src/runtime/agent-message-parts.spec.ts`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/runtime/agent-message-parts.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isPlanArgs, isIterationArgs, isDraftArgs } from './agent-message-parts'

describe('agent message part type guards', () => {
  it('isPlanArgs accepts a well-formed plan part', () => {
    expect(
      isPlanArgs({
        traceId: 'abc',
        conversationId: null,
        topology: 'bounded',
        phase: 1,
        subAgents: [{ domain: 'planner' }],
      }),
    ).toBe(true)
  })

  it('isPlanArgs rejects invalid input', () => {
    expect(isPlanArgs({})).toBe(false)
    expect(isPlanArgs(null)).toBe(false)
  })

  it('isIterationArgs accepts running iteration', () => {
    expect(
      isIterationArgs({
        n: 1,
        subAgentDomain: 'planner',
        selectionReason: 'first match',
        state: 'running',
      }),
    ).toBe(true)
  })

  it('isDraftArgs accepts a well-formed draft part', () => {
    expect(
      isDraftArgs({
        actionId: 'a1',
        summary: 'Approve leave',
        tier: 'high_risk_approval_required',
        requiresApproval: true,
        provenance: { sub_agent_domain: 'people', trace_id: 't1' },
      }),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
bun run --filter @future/agent test:unit -- agent-message-parts
```

Expected: failures.

- [ ] **Step 3: Implement types and guards**

Create `packages/agent/src/runtime/agent-message-parts.ts`:

```ts
import type { ScorerResult, UsageSnapshot, DraftProvenance } from './sse-event-schema'

export interface PlanPartArgs {
  traceId: string
  conversationId: string | null
  topology: 'bounded' | 'iterative'
  phase: 1 | 2 | null
  subAgents: { domain: string; name?: string }[]
  iteration?: number
}

export interface IterationPartArgs {
  n: number
  subAgentDomain: string
  selectionReason: string
  state: 'running' | 'passed' | 'failed'
  scorerResults?: ScorerResult[]
  usage?: UsageSnapshot
  isComplete?: boolean
}

export interface DraftPartArgs {
  actionId: string
  summary: string
  tier: 'low' | 'high' | 'low_risk_auto' | 'high_risk_approval_required'
  requiresApproval: boolean
  provenance: DraftProvenance
}

export const PLAN_TOOL = 'agent.plan' as const
export const ITERATION_TOOL = 'agent.iteration' as const
export const DRAFT_TOOL = 'agent.draft' as const

export function isPlanArgs(v: unknown): v is PlanPartArgs {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.traceId === 'string' &&
    (o.topology === 'bounded' || o.topology === 'iterative') &&
    Array.isArray(o.subAgents)
  )
}

export function isIterationArgs(v: unknown): v is IterationPartArgs {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.n === 'number' &&
    typeof o.subAgentDomain === 'string' &&
    typeof o.selectionReason === 'string' &&
    (o.state === 'running' || o.state === 'passed' || o.state === 'failed')
  )
}

export function isDraftArgs(v: unknown): v is DraftPartArgs {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.actionId === 'string' &&
    typeof o.summary === 'string' &&
    typeof o.requiresApproval === 'boolean' &&
    !!o.provenance
  )
}
```

- [ ] **Step 4: Run tests**

```bash
bun run --filter @future/agent test:unit -- agent-message-parts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/runtime/agent-message-parts.ts packages/agent/src/runtime/agent-message-parts.spec.ts
git commit -m "feat(agent): define assistant-ui part contracts for plan/iteration/draft"
```

---

## Task 3: Rewrite the chat adapter to emit typed parts

The current adapter (`agent-chat-adapter.ts:14-96`) flattens events into a single text part. Rewrite to emit one part per significant SSE event.

**Files:**

- Modify: `packages/agent/src/runtime/agent-chat-adapter.ts`
- Modify: `packages/agent/src/runtime/agent-chat-adapter.spec.ts`

- [ ] **Step 1: Write failing tests**

Replace `packages/agent/src/runtime/agent-chat-adapter.spec.ts` (or add a new describe block — keep existing happy-path test if present). Add:

```ts
import { describe, it, expect } from 'vitest'
import { mapEventToPartUpdate } from './agent-chat-adapter'
import { PLAN_TOOL, ITERATION_TOOL, DRAFT_TOOL } from './agent-message-parts'

describe('mapEventToPartUpdate', () => {
  it('turn.started emits a plan tool-call part', () => {
    const update = mapEventToPartUpdate({
      seq: 1,
      type: 'turn.started',
      payload: { trace_id: 'abc123', conversation_id: null, topology: 'bounded' },
    })
    expect(update).toEqual([
      {
        op: 'upsert',
        partId: 'plan',
        toolName: PLAN_TOOL,
        args: {
          traceId: 'abc123',
          conversationId: null,
          topology: 'bounded',
          phase: null,
          subAgents: [],
        },
      },
    ])
  })

  it('phase.started extends the existing plan part', () => {
    const update = mapEventToPartUpdate({
      seq: 2,
      type: 'phase.started',
      payload: { phase: 1, sub_agents: [{ domain: 'planner' }] },
    })
    expect(update).toEqual([
      {
        op: 'merge',
        partId: 'plan',
        args: { phase: 1, subAgents: [{ domain: 'planner' }] },
      },
    ])
  })

  it('iteration.started appends an iteration tool-call part with state=running', () => {
    const update = mapEventToPartUpdate({
      seq: 3,
      type: 'iteration.started',
      payload: { n: 1, sub_agent_domain: 'planner', selection_reason: 'first match' },
    })
    expect(update).toEqual([
      {
        op: 'upsert',
        partId: 'iter-1',
        toolName: ITERATION_TOOL,
        args: {
          n: 1,
          subAgentDomain: 'planner',
          selectionReason: 'first match',
          state: 'running',
        },
      },
    ])
  })

  it('iteration.validated mutates the matching iteration part', () => {
    const update = mapEventToPartUpdate({
      seq: 4,
      type: 'iteration.validated',
      payload: {
        n: 1,
        passed: true,
        scorer_results: [{ scorer: 'q1', passed: true }],
        max_iterations_reached: false,
      },
    })
    expect(update).toEqual([
      {
        op: 'merge',
        partId: 'iter-1',
        args: { state: 'passed', scorerResults: [{ scorer: 'q1', passed: true }] },
      },
    ])
  })

  it('iteration.validated marks failed when passed=false', () => {
    const update = mapEventToPartUpdate({
      seq: 4,
      type: 'iteration.validated',
      payload: { n: 2, passed: false, scorer_results: [], max_iterations_reached: false },
    })
    expect(update?.[0]?.args).toMatchObject({ state: 'failed' })
  })

  it('iteration.ended writes usage + isComplete', () => {
    const update = mapEventToPartUpdate({
      seq: 5,
      type: 'iteration.ended',
      payload: {
        n: 1,
        is_complete: true,
        usage: {
          input_tokens: 1,
          output_tokens: 2,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        },
      },
    })
    expect(update?.[0]).toMatchObject({
      op: 'merge',
      partId: 'iter-1',
      args: { isComplete: true },
    })
  })

  it('answer.token appends to the streaming text part', () => {
    const update = mapEventToPartUpdate({
      seq: 6,
      type: 'answer.token',
      payload: { text: 'Hello ' },
    })
    expect(update).toEqual([{ op: 'append-text', text: 'Hello ' }])
  })

  it('draft.proposed emits a draft tool-call part', () => {
    const update = mapEventToPartUpdate({
      seq: 7,
      type: 'draft.proposed',
      payload: {
        action_id: 'a1',
        summary: 'Approve leave',
        tier: 'high',
        requires_approval: true,
        provenance: { sub_agent_domain: 'people', trace_id: 't1' },
      },
    })
    expect(update).toEqual([
      {
        op: 'upsert',
        partId: 'draft-a1',
        toolName: DRAFT_TOOL,
        args: {
          actionId: 'a1',
          summary: 'Approve leave',
          tier: 'high',
          requiresApproval: true,
          provenance: { sub_agent_domain: 'people', trace_id: 't1' },
        },
      },
    ])
  })

  it('refusal.started emits a refusal text replacement', () => {
    const update = mapEventToPartUpdate({
      seq: 8,
      type: 'refusal.started',
      payload: { reason: 'rate_limit', retry_allowed: false },
    })
    expect(update).toEqual([{ op: 'replace-text', text: '⚠ Refused: rate_limit' }])
  })

  it('turn.ended returns a finalize signal', () => {
    const update = mapEventToPartUpdate({
      seq: 9,
      type: 'turn.ended',
      payload: {
        reason: 'completed',
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          input_cached_read: 0,
          input_cached_write: 0,
          output_reasoning: 0,
        },
      },
    })
    expect(update).toEqual([{ op: 'finalize', endReason: 'completed' }])
  })

  it('progress and answer.shape_declared return null (no update)', () => {
    expect(
      mapEventToPartUpdate({
        seq: 10,
        type: 'progress',
        payload: { message: 'still here' },
      }),
    ).toBeNull()
    expect(
      mapEventToPartUpdate({
        seq: 11,
        type: 'answer.shape_declared',
        payload: { shape: 'markdown' },
      }),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
bun run --filter @future/agent test:unit -- agent-chat-adapter
```

Expected: failures.

- [ ] **Step 3: Implement `mapEventToPartUpdate`**

Replace `packages/agent/src/runtime/agent-chat-adapter.ts` entirely:

```ts
import { fetchEventSource } from '@microsoft/fetch-event-source'
import type { ChatModelAdapter, ToolCallContentPart, TextContentPart } from '@assistant-ui/react'
import { sseEventSchema } from './sse-event-schema'
import type { SseEvent, TurnEndReason } from './sse-event-schema'
import type { AgentTurnStore } from './agent-turn-store'
import type { AgentContext } from '../types'
import {
  PLAN_TOOL,
  ITERATION_TOOL,
  DRAFT_TOOL,
  type PlanPartArgs,
  type IterationPartArgs,
  type DraftPartArgs,
} from './agent-message-parts'

export type PartUpdate =
  | { op: 'upsert'; partId: string; toolName: string; args: object }
  | { op: 'merge'; partId: string; args: object }
  | { op: 'append-text'; text: string }
  | { op: 'replace-text'; text: string }
  | { op: 'finalize'; endReason: TurnEndReason }

/**
 * Pure function: SSE event → adapter ops. Exported for unit-test isolation.
 */
export function mapEventToPartUpdate(event: SseEvent): PartUpdate[] | null {
  switch (event.type) {
    case 'turn.started':
      return [
        {
          op: 'upsert',
          partId: 'plan',
          toolName: PLAN_TOOL,
          args: {
            traceId: event.payload.trace_id,
            conversationId: event.payload.conversation_id,
            topology: event.payload.topology,
            phase: null,
            subAgents: [],
          } satisfies PlanPartArgs,
        },
      ]
    case 'phase.started':
      return [
        {
          op: 'merge',
          partId: 'plan',
          args: { phase: event.payload.phase, subAgents: event.payload.sub_agents },
        },
      ]
    case 'iteration.started':
      return [
        {
          op: 'upsert',
          partId: `iter-${event.payload.n}`,
          toolName: ITERATION_TOOL,
          args: {
            n: event.payload.n,
            subAgentDomain: event.payload.sub_agent_domain,
            selectionReason: event.payload.selection_reason,
            state: 'running',
          } satisfies IterationPartArgs,
        },
      ]
    case 'iteration.validated':
      return [
        {
          op: 'merge',
          partId: `iter-${event.payload.n}`,
          args: {
            state: event.payload.passed ? 'passed' : 'failed',
            scorerResults: event.payload.scorer_results,
          },
        },
      ]
    case 'iteration.ended':
      return [
        {
          op: 'merge',
          partId: `iter-${event.payload.n}`,
          args: { usage: event.payload.usage, isComplete: event.payload.is_complete },
        },
      ]
    case 'answer.token':
      return [{ op: 'append-text', text: event.payload.text }]
    case 'answer.complete':
      return [{ op: 'replace-text', text: stringifyAnswer(event.payload.content) }]
    case 'draft.proposed':
      return [
        {
          op: 'upsert',
          partId: `draft-${event.payload.action_id}`,
          toolName: DRAFT_TOOL,
          args: {
            actionId: event.payload.action_id,
            summary: event.payload.summary,
            tier: event.payload.tier,
            requiresApproval: event.payload.requires_approval,
            provenance: event.payload.provenance,
          } satisfies DraftPartArgs,
        },
      ]
    case 'refusal.started':
      return [{ op: 'replace-text', text: `⚠ Refused: ${event.payload.reason}` }]
    case 'turn.ended':
      return [{ op: 'finalize', endReason: event.payload.reason }]
    case 'progress':
    case 'answer.shape_declared':
      return null
  }
}

function stringifyAnswer(content: unknown): string {
  if (typeof content === 'string') return content
  return JSON.stringify(content, null, 2)
}

export interface AgentChatAdapterOptions {
  endpoint: string
  surface: 'panel' | 'inline'
  store: AgentTurnStore
  context?: AgentContext
}

type PartState = {
  text: string
  textActive: boolean
  toolParts: Map<string, { toolName: string; args: object }>
}

function buildContent(
  state: PartState,
): Array<TextContentPart | ToolCallContentPart<object, unknown>> {
  const out: Array<TextContentPart | ToolCallContentPart<object, unknown>> = []
  if (state.textActive || state.text) {
    out.push({ type: 'text', text: state.text })
  }
  for (const [partId, part] of state.toolParts) {
    out.push({
      type: 'tool-call',
      toolCallId: partId,
      toolName: part.toolName,
      args: part.args,
      argsText: JSON.stringify(part.args),
    } as ToolCallContentPart<object, unknown>)
  }
  return out
}

export function createAgentChatAdapter(opts: AgentChatAdapterOptions): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      opts.store.getState().reset()

      const state: PartState = { text: '', textActive: false, toolParts: new Map() }
      let resolveChunk: (() => void) | null = null
      let done = false
      let capturedError: unknown = null
      const queue: Array<{ content: ReturnType<typeof buildContent> }> = []

      const apply = (updates: PartUpdate[]) => {
        for (const u of updates) {
          if (u.op === 'append-text') {
            state.text += u.text
            state.textActive = true
          } else if (u.op === 'replace-text') {
            state.text = u.text
            state.textActive = true
          } else if (u.op === 'upsert') {
            state.toolParts.set(u.partId, { toolName: u.toolName, args: u.args })
          } else if (u.op === 'merge') {
            const existing = state.toolParts.get(u.partId)
            if (existing) existing.args = { ...existing.args, ...u.args }
          }
        }
        queue.push({ content: buildContent(state) })
      }

      const body = JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        surface: opts.surface,
        context: opts.context ?? null,
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

          opts.store.getState().dispatch(event)

          const updates = mapEventToPartUpdate(event)
          if (updates) apply(updates)

          if (event.type === 'turn.ended') done = true

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
        .catch(() => {})

      while (!done || queue.length > 0) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolveChunk = r
          })
        }
        while (queue.length > 0) {
          yield queue.shift()!
        }
      }

      if (capturedError) throw capturedError
    },
  }
}
```

- [ ] **Step 4: Run tests**

```bash
bun run --filter @future/agent test:unit -- agent-chat-adapter agent-message-parts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/runtime/agent-chat-adapter.ts packages/agent/src/runtime/agent-chat-adapter.spec.ts
git commit -m "feat(agent): adapter emits typed parts for plan/iteration/draft/answer events"
```

---

## Task 4: `PlanCard` component

**Files:**

- Create: `packages/agent/src/thread/cards/plan-card.tsx`
- Create: `packages/agent/src/thread/cards/plan-card.spec.tsx`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/thread/cards/plan-card.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PlanCard } from './plan-card'

describe('PlanCard', () => {
  it('renders topology and abbreviated traceId', () => {
    render(
      <PlanCard
        traceId="abc1234567890"
        conversationId={null}
        topology="bounded"
        phase={1}
        subAgents={[{ domain: 'planner' }]}
      />,
    )
    expect(screen.getByText('bounded')).toBeTruthy()
    expect(screen.getByText(/abc12345…/)).toBeTruthy()
  })

  it('lists every sub-agent', () => {
    render(
      <PlanCard
        traceId="t"
        conversationId={null}
        topology="iterative"
        phase={1}
        subAgents={[{ domain: 'planner' }, { domain: 'people' }]}
      />,
    )
    expect(screen.getByText('planner')).toBeTruthy()
    expect(screen.getByText('people')).toBeTruthy()
  })

  it('shows iteration tag when iteration is set', () => {
    render(
      <PlanCard
        traceId="t"
        conversationId={null}
        topology="iterative"
        phase={1}
        subAgents={[]}
        iteration={3}
      />,
    )
    expect(screen.getByText(/iter 3/)).toBeTruthy()
  })

  it('hides iteration tag when iteration is undefined', () => {
    render(
      <PlanCard traceId="t" conversationId={null} topology="bounded" phase={1} subAgents={[]} />,
    )
    expect(screen.queryByText(/iter /)).toBeNull()
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
bun run --filter @future/agent test:unit -- plan-card
```

Expected: failures.

- [ ] **Step 3: Implement**

Create `packages/agent/src/thread/cards/plan-card.tsx`:

```tsx
import { Brain, Workflow, Repeat } from 'lucide-react'
import { Tag } from '../../primitives/tag'
import { Mono } from '../../primitives/mono'
import type { PlanPartArgs } from '../../runtime/agent-message-parts'

export type PlanCardProps = PlanPartArgs

export function PlanCard({ traceId, topology, phase, subAgents, iteration }: PlanCardProps) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-gradient-to-b from-accent/[0.05] to-transparent p-2">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex text-accent">
          <Brain className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] font-semibold text-foreground">Plan</span>
        <Tag variant="accent">{topology}</Tag>
        {iteration !== undefined && (
          <Tag variant="warning">
            <Repeat className="mr-0.5 h-2.5 w-2.5" /> iter {iteration}
          </Tag>
        )}
        <div className="flex-1" />
        <Mono>
          <Workflow className="mr-0.5 inline-block h-2.5 w-2.5" />
          {traceId.slice(0, 8)}…
        </Mono>
      </div>
      {phase && (
        <div className="mt-1 text-[10px] text-muted-foreground/70">
          phase: <span className="text-foreground/80">{phase === 1 ? 'router' : 'synthesize'}</span>
        </div>
      )}
      {subAgents.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-muted-foreground/70">route →</span>
          {subAgents.map((a) => (
            <span
              key={a.domain}
              className="inline-flex items-center gap-1 rounded-[4px] border border-white/[0.08] bg-white/[0.05] px-1.5 py-[2px] font-mono text-[11px] text-foreground"
            >
              {a.domain}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
bun run --filter @future/agent test:unit -- plan-card
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/thread/cards/plan-card.tsx packages/agent/src/thread/cards/plan-card.spec.tsx
git commit -m "feat(agent): add PlanCard"
```

---

## Task 5: `IterationStep` component

**Files:**

- Create: `packages/agent/src/thread/cards/iteration-step.tsx`
- Create: `packages/agent/src/thread/cards/iteration-step.spec.tsx`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/thread/cards/iteration-step.spec.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { IterationStep } from './iteration-step'

describe('IterationStep', () => {
  it('shows running state with auto-open body', () => {
    render(
      <IterationStep
        n={1}
        subAgentDomain="planner"
        selectionReason="first match"
        state="running"
      />,
    )
    expect(screen.getByText(/planner/)).toBeTruthy()
    expect(screen.getByText('first match')).toBeTruthy()
  })

  it('starts collapsed when state is passed', () => {
    render(
      <IterationStep n={1} subAgentDomain="planner" selectionReason="first match" state="passed" />,
    )
    // body hidden initially
    expect(screen.queryByText('first match')).toBeNull()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('first match')).toBeTruthy()
  })

  it('renders scorerResults when present', () => {
    render(
      <IterationStep
        n={2}
        subAgentDomain="people"
        selectionReason="r"
        state="passed"
        scorerResults={[{ scorer: 'safety', passed: true }]}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('safety')).toBeTruthy()
  })

  it('keeps body open when state is failed', () => {
    render(<IterationStep n={1} subAgentDomain="planner" selectionReason="r" state="failed" />)
    expect(screen.getByText('r')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
bun run --filter @future/agent test:unit -- iteration-step
```

Expected: failures.

- [ ] **Step 3: Implement**

Create `packages/agent/src/thread/cards/iteration-step.tsx`:

```tsx
import { ToolCallShell, type ToolCallStatus } from '../../primitives/tool-call-shell'
import { Mono } from '../../primitives/mono'
import type { IterationPartArgs } from '../../runtime/agent-message-parts'

const stateToStatus: Record<IterationPartArgs['state'], ToolCallStatus> = {
  running: 'running',
  passed: 'done',
  failed: 'error',
}

export type IterationStepProps = IterationPartArgs

export function IterationStep({
  n,
  subAgentDomain,
  selectionReason,
  state,
  scorerResults,
  usage,
}: IterationStepProps) {
  const defaultOpen = state === 'running' || state === 'failed'
  return (
    <ToolCallShell
      status={stateToStatus[state]}
      defaultOpen={defaultOpen}
      header={
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-foreground">
            <span className="text-muted-foreground/70">{n}.</span> {subAgentDomain}
          </span>
          <div className="flex-1" />
          {usage && <Mono>{usage.input_tokens + usage.output_tokens} tok</Mono>}
        </div>
      }
    >
      <div className="text-[10px] text-muted-foreground/70">selection reason</div>
      <div className="font-mono text-[11px] text-foreground/90">{selectionReason}</div>
      {scorerResults && scorerResults.length > 0 && (
        <>
          <div className="mt-1 text-[10px] text-muted-foreground/70">scorers</div>
          <div className="flex flex-col gap-0.5">
            {scorerResults.map((r) => (
              <div key={r.scorer} className="flex items-center gap-2 font-mono text-[11px]">
                <span className="text-foreground/80">{r.scorer}</span>
                <span className={r.passed ? 'text-emerald-400' : 'text-red-400'}>
                  {r.passed ? 'pass' : 'fail'}
                </span>
                {r.score !== undefined && (
                  <span className="text-muted-foreground/70">{r.score.toFixed(2)}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </ToolCallShell>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
bun run --filter @future/agent test:unit -- iteration-step
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/thread/cards/iteration-step.tsx packages/agent/src/thread/cards/iteration-step.spec.tsx
git commit -m "feat(agent): add IterationStep"
```

---

## Task 6: `AnswerBubble` and `UserTurn` components

**Files:**

- Create: `packages/agent/src/thread/cards/answer-bubble.tsx`
- Create: `packages/agent/src/thread/cards/answer-bubble.spec.tsx`
- Create: `packages/agent/src/thread/cards/user-turn.tsx`
- Create: `packages/agent/src/thread/cards/user-turn.spec.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/agent/src/thread/cards/answer-bubble.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AnswerBubble } from './answer-bubble'

describe('AnswerBubble', () => {
  it('renders text content', () => {
    render(<AnswerBubble>Hello world</AnswerBubble>)
    expect(screen.getByText('Hello world')).toBeTruthy()
  })

  it('renders shape caption when provided', () => {
    render(<AnswerBubble shape="markdown">x</AnswerBubble>)
    expect(screen.getByText('markdown')).toBeTruthy()
  })

  it('omits shape caption when undefined', () => {
    const { container } = render(<AnswerBubble>x</AnswerBubble>)
    expect(container.querySelector('[data-testid="answer-shape"]')).toBeNull()
  })
})
```

Create `packages/agent/src/thread/cards/user-turn.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { UserTurn } from './user-turn'

describe('UserTurn', () => {
  it('renders the user text', () => {
    render(<UserTurn>What is happening?</UserTurn>)
    expect(screen.getByText('What is happening?')).toBeTruthy()
  })

  it('aligns to the right', () => {
    const { container } = render(<UserTurn>x</UserTurn>)
    expect(container.firstChild as HTMLElement).toBeTruthy()
    expect((container.firstChild as HTMLElement).className).toMatch(/justify-end/)
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
bun run --filter @future/agent test:unit -- answer-bubble user-turn
```

Expected: failures.

- [ ] **Step 3: Implement `answer-bubble.tsx`**

```tsx
import { Mono } from '../../primitives/mono'
import type { ReactNode } from 'react'

export interface AnswerBubbleProps {
  children: ReactNode
  shape?: string
}

export function AnswerBubble({ children, shape }: AnswerBubbleProps) {
  return (
    <div className="flex flex-col gap-1">
      {shape && (
        <Mono>
          <span data-testid="answer-shape">{shape}</span>
        </Mono>
      )}
      <div className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `user-turn.tsx`**

```tsx
import type { ReactNode } from 'react'

export interface UserTurnProps {
  children: ReactNode
}

export function UserTurn({ children }: UserTurnProps) {
  return (
    <div className="flex justify-end px-3 py-1">
      <div className="max-w-[85%] rounded-lg bg-white/[0.06] px-3 py-2 text-[13px] text-foreground">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

```bash
bun run --filter @future/agent test:unit -- answer-bubble user-turn
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/thread/cards/answer-bubble.tsx packages/agent/src/thread/cards/answer-bubble.spec.tsx packages/agent/src/thread/cards/user-turn.tsx packages/agent/src/thread/cards/user-turn.spec.tsx
git commit -m "feat(agent): add AnswerBubble and UserTurn"
```

---

## Task 7: Rewrite `AgentThread` to use the new cards

**Files:**

- Modify: `packages/agent/src/thread/agent-thread.tsx`
- Create: `packages/agent/src/thread/agent-thread.spec.tsx`

- [ ] **Step 1: Write failing test**

Create `packages/agent/src/thread/agent-thread.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import { AgentThread } from './agent-thread'

function FakeRuntime({ children }: { children: React.ReactNode }) {
  // Minimal: a runtime that produces no messages — Empty state shows.
  const runtime = useLocalRuntime({ async *run() {} })
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}

describe('AgentThread', () => {
  it('mounts under a runtime provider without errors', () => {
    render(
      <FakeRuntime>
        <AgentThread />
      </FakeRuntime>,
    )
    // Empty placeholder rendered
    expect(screen.getByTestId('agent-thread-empty')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
bun run --filter @future/agent test:unit -- agent-thread
```

Expected: passes the import + mount; or fails if AgentThread shape changed.

- [ ] **Step 3: Rewrite `agent-thread.tsx`**

Replace `packages/agent/src/thread/agent-thread.tsx`:

```tsx
'use client'

import { ThreadPrimitive, MessagePrimitive, useAssistantToolUI } from '@assistant-ui/react'
import { PlanCard } from './cards/plan-card'
import { IterationStep } from './cards/iteration-step'
import { UserTurn } from './cards/user-turn'
import { AnswerBubble } from './cards/answer-bubble'
import {
  PLAN_TOOL,
  ITERATION_TOOL,
  isPlanArgs,
  isIterationArgs,
} from '../runtime/agent-message-parts'

export function AgentThread() {
  useAssistantToolUI({
    toolName: PLAN_TOOL,
    render: ({ args }) => {
      if (!isPlanArgs(args)) return null
      return <PlanCard {...args} />
    },
  })
  useAssistantToolUI({
    toolName: ITERATION_TOOL,
    render: ({ args }) => {
      if (!isIterationArgs(args)) return null
      return <IterationStep {...args} />
    },
  })
  // DRAFT_TOOL is registered by Plan 3 (DraftCard).

  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
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
          components={{ UserMessage: AgentUserMessage, AssistantMessage: AgentAssistantMessage }}
        />
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

function AgentUserMessage() {
  return (
    <MessagePrimitive.Root>
      <UserTurn>
        <MessagePrimitive.Content />
      </UserTurn>
    </MessagePrimitive.Root>
  )
}

function AgentAssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex flex-col gap-2 px-3 py-1">
      <MessagePrimitive.Content
        components={{
          Text: ({ part }) => <AnswerBubble>{part.text}</AnswerBubble>,
        }}
      />
    </MessagePrimitive.Root>
  )
}
```

> **Implementation note for the executor:** `@assistant-ui/react` 0.12 ships several APIs for tool UI registration; `useAssistantToolUI` is the canonical hook. If a method signature differs in the installed version (e.g. `makeAssistantToolUI` returns a component you mount instead), adapt accordingly while keeping the registry from `agent-message-parts.ts` (`PLAN_TOOL`, `ITERATION_TOOL`, `DRAFT_TOOL`) as the single source of truth for tool names.

- [ ] **Step 4: Run tests**

```bash
bun run --filter @future/agent test:unit -- agent-thread
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/thread/agent-thread.tsx packages/agent/src/thread/agent-thread.spec.tsx
git commit -m "feat(agent): rewrite AgentThread to render PlanCard/IterationStep/AnswerBubble"
```

---

## Task 8: Export new components

**Files:**

- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Add exports**

Append to `packages/agent/src/index.ts`:

```ts
// Cards
export { PlanCard } from './thread/cards/plan-card'
export type { PlanCardProps } from './thread/cards/plan-card'
export { IterationStep } from './thread/cards/iteration-step'
export type { IterationStepProps } from './thread/cards/iteration-step'
export { AnswerBubble } from './thread/cards/answer-bubble'
export type { AnswerBubbleProps } from './thread/cards/answer-bubble'
export { UserTurn } from './thread/cards/user-turn'
export type { UserTurnProps } from './thread/cards/user-turn'

// Runtime — part contracts
export {
  PLAN_TOOL,
  ITERATION_TOOL,
  DRAFT_TOOL,
  isPlanArgs,
  isIterationArgs,
  isDraftArgs,
} from './runtime/agent-message-parts'
export type { PlanPartArgs, IterationPartArgs, DraftPartArgs } from './runtime/agent-message-parts'
export { mapEventToPartUpdate } from './runtime/agent-chat-adapter'
export type { PartUpdate } from './runtime/agent-chat-adapter'
```

- [ ] **Step 2: Build**

```bash
bun run --filter @future/agent build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/index.ts
git commit -m "feat(agent): export streaming visualization API"
```

---

## Task 9: PR

- [ ] **Step 1: Push**

```bash
git push -u origin feat/agent-ux-plan-2-streaming
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(agent): UX refactor plan 2 — streaming visualization" --body "$(cat <<'EOF'
## Summary

- Adapter rewrite: `mapEventToPartUpdate` translates each `SseEvent` into one or more typed `PartUpdate` operations
- `PlanCard` (renders `turn.started + phase.started`)
- `IterationStep` (renders `iteration.started/validated/ended` chain — collapsible)
- `AnswerBubble` (renders streaming `answer.token` + finalized `answer.complete`)
- `UserTurn` (right-aligned user message bubble)
- `AgentThread` registers tool UIs for `agent.plan` + `agent.iteration` (`agent.draft` registration ships in Plan 3)

Plan 2 of 6. Spec §5.

## Test plan

- [ ] CI green
- [ ] Unit-test the SSE → part-update mapping for every event type in `sseEventSchema`
- [ ] Manual: kick off a turn in `web-planner`, confirm Plan card appears at start, IterationStep cards appear per iteration, answer streams in
- [ ] Manual: trigger a refusal, confirm `⚠ Refused: <reason>` block

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

- [ ] No `__tests__/` dirs created
- [ ] No `.js` extensions in relative imports
- [ ] All event types in `sseEventSchema` are covered by `mapEventToPartUpdate` (`turn.started`, `phase.started`, `iteration.started/validated/ended`, `progress`, `refusal.started`, `answer.shape_declared/token/complete`, `draft.proposed`, `turn.ended`)
- [ ] PartUpdate ops are exhaustive: `upsert`, `merge`, `append-text`, `replace-text`, `finalize`
- [ ] Tool names referenced from the constants in `agent-message-parts.ts` only — never as bare strings

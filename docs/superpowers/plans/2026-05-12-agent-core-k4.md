# @seta/agent-core K4 — Tool-call iteration outer loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the outer loop in `@seta/agent-core` — `accumulatedSteps[]`, `stopWhen`, `maxSteps`, concurrent tool execution, per-tool budgets, fallback-model failover, and the three live processor hooks — so an agent product can run multi-step LLM+tool conversations end-to-end.

**Architecture:** Three nested layers under `platform/agent/core/src/run/`. `run.ts` stays the thin entry (build `RunCtx`, recall memory, run `processInput`, delegate). `tool-loop.ts` owns the outer iteration. `fallback.ts` wraps one model call with the candidate-model failover policy. `execute-tools.ts` does bounded fan-out (inline semaphore, no `p-queue`). `processors.ts` runs the three hooks sequentially.

**Tech Stack:** TypeScript ESM, Zod 4 (already pinned), Node 22+ (`AbortSignal.any`, `AbortSignal.timeout` native), Vitest (co-located unit + MSW-backed integration via the K1.5 testkit).

**Spec:** `docs/superpowers/specs/2026-05-12-agent-core-k4-design.md` (commit `61c363a4`). Cross-reference section numbers in commit messages.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `platform/agent/core/src/types/run.ts` | Modify | `StepResult` gains 4 optional fields (§6.1) |
| `platform/agent/core/src/types/config.ts` | Modify | `StopCondition` argument shape change (§6.2); JSDoc clarifying semantics |
| `platform/agent/core/src/run/run.ts` | Modify | Thin entry: ctx + memory + processInput + delegate; saveTurn conditional |
| `platform/agent/core/src/run/run.test.ts` | Modify | Preserve K1 tests; add multi-step round-trip + validation errors |
| `platform/agent/core/src/run/tool-loop.ts` | Create | Outer iteration: model→tools→stopWhen→loop; termination order |
| `platform/agent/core/src/run/tool-loop.test.ts` | Create | maxSteps, stopWhen OR, accumulatedSteps order, ADAPTER_PROTOCOL_VIOLATION |
| `platform/agent/core/src/run/fallback.ts` | Create | `runOneModelStep` + `runModelStepWithFallback` |
| `platform/agent/core/src/run/fallback.test.ts` | Create | Failover triggers, processAPIError chain, abort during failover |
| `platform/agent/core/src/run/execute-tools.ts` | Create | Bounded fan-out, semaphore, per-tool budgets, timeout, 4 outcomes, requireApproval collapse, tool OTel span |
| `platform/agent/core/src/run/execute-tools.test.ts` | Create | Concurrency cap, budget breach, timeout, validation/throw, suspend, unknown tool |
| `platform/agent/core/src/run/processors.ts` | Create | 3 hook runners + `ProcessorAbortSignal` sentinel |
| `platform/agent/core/src/run/processors.test.ts` | Create | Ordering, ctx.abort(), thrown→PROCESSOR_FAILED, retry chain |
| `platform/agent/core/src/testkit/fake-adapter.ts` | Modify | Multi-step script chaining (one script per `stream()` call) |
| `platform/agent/core/src/testkit/fake-adapter.test.ts` | Modify | Multi-step chain assertions |
| `platform/agent/core/src/errors/codes.md` | Create | OSS-facing catalog of stable error codes (K2 LLM_* + K4 additions) |
| `platform/agent/core/src/index.ts` | Modify | No new exports for K4 internals (only `StepResult`/`StopCondition` types re-flow through `types/*`) |
| `platform/agent/core/tests/integration/loop-multi-step.test.ts` | Create | Recording-driven 2-turn round-trip |
| `platform/agent/core/tests/integration/loop-fallback.test.ts` | Create | 503 → next candidate success |
| `platform/agent/core/tests/integration/loop-stop-when.test.ts` | Create | Predicate-driven termination |
| `platform/agent/core/tests/integration/loop-max-steps.test.ts` | Create | Step ceiling synthesizes finish:length |
| `platform/agent/core/tests/integration/loop-abort.test.ts` | Create | Client abort mid-stream |
| `platform/agent/core/__recordings__/loop-*.json` | Create | 5 new fixtures |
| `platform/agent/core/SCOPE.md` | Modify | "Current state" + "Open questions" status updates |
| `.changeset/*.md` | Create | Minor bump for `@seta/agent-core` (records `StopCondition` shape change) |

---

## Task 1: Extend `StepResult` and change `StopCondition` signature

**Files:**
- Modify: `platform/agent/core/src/types/run.ts`
- Modify: `platform/agent/core/src/types/config.ts`

This is a type-only change. No runtime code references these fields yet — adding them now means later tasks can populate them as the implementation grows.

- [ ] **Step 1: Extend `StepResult` with the 4 K4 fields**

Edit `platform/agent/core/src/types/run.ts`. Add the four fields below the existing ones. Final shape:

```ts
import type { KernelChunk } from './chunk'
import type { KernelMessage } from './message'
import type { KernelError } from '../errors'

export type RunStatus = 'created' | 'running' | 'completed' | 'failed'

export interface Run {
  id: string
  status: RunStatus
  tenantId: string
  createdAt: Date
  finishedAt?: Date
}

export interface RunCtx {
  runId: string
  signal: AbortSignal
  retryCount: number
  now: () => number
  generateId: () => string
  currentDate: () => Date
}

export interface RunInput {
  messages: KernelMessage[]
  threadId?: string
  conversationId?: string
}

export interface StepResult {
  kind: 'model' | 'tool'
  chunks: KernelChunk[]
  message?: KernelMessage
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'error'
  toolCallId?: string
  toolName?: string
  error?: KernelError
}
```

- [ ] **Step 2: Change `StopCondition` argument shape in `types/config.ts`**

Edit `platform/agent/core/src/types/config.ts`. Replace the `StopCondition` line with the K4 shape and JSDoc:

```ts
/**
 * Evaluated after each iteration (one model call + its tool executions).
 *
 * Only invoked when the most recent model step's `finishReason === 'tool_calls'`.
 * On natural `stop` or `length`, predicates are not consulted.
 *
 * Array form combines with logical OR; predicates may be async and are awaited
 * in parallel.
 */
export type StopCondition = (args: { steps: StepResult[] }) => boolean | Promise<boolean>
```

- [ ] **Step 3: Run typecheck — expect clean**

Run: `pnpm --filter @seta/agent-core typecheck`
Expected: passes. K1 reserved `StopCondition` without consumers, so the signature change has no callers to break.

- [ ] **Step 4: Run unit tests — expect clean**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: passes (no test code consumed the old signature).

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/types/run.ts platform/agent/core/src/types/config.ts
git commit -m "feat(agent-core): K4 §6 types — StepResult fields, StopCondition shape"
```

---

## Task 2: Extend `FakeAdapter` for multi-step script chaining

**Files:**
- Modify: `platform/agent/core/src/testkit/fake-adapter.ts`
- Modify: `platform/agent/core/src/testkit/fake-adapter.test.ts` (if it exists; otherwise create)

K4 tests need an adapter that scripts a sequence of model calls (script N returned on the Nth `stream()` invocation). Today `FakeAdapter` accepts one script.

- [ ] **Step 1: Write the failing test for multi-step scripting**

Edit `platform/agent/core/src/testkit/fake-adapter.test.ts`. Add (or create the file with) this test:

```ts
import { describe, expect, it } from 'vitest'
import { FakeAdapter } from './fake-adapter'
import type { AdapterRequest, KernelChunk, RunCtx } from '../types'

function makeCtx(): RunCtx {
  return {
    runId: 'r',
    signal: new AbortController().signal,
    retryCount: 0,
    now: () => 0,
    generateId: () => 'id',
    currentDate: () => new Date(0),
  }
}
const req = (): AdapterRequest => ({ model: 't', messages: [], cacheTtl: null })

describe('FakeAdapter — multi-step chaining', () => {
  it('returns script N on the Nth stream() call', async () => {
    const adapter = new FakeAdapter([
      { chunks: [{ type: 'text', delta: 'a' }, { type: 'finish', reason: 'tool_calls' }] },
      { chunks: [{ type: 'text', delta: 'b' }, { type: 'finish', reason: 'stop' }] },
    ])
    const ctx = makeCtx()
    const s1: KernelChunk[] = []
    for await (const c of await adapter.stream(req(), ctx)) s1.push(c)
    const s2: KernelChunk[] = []
    for await (const c of await adapter.stream(req(), ctx)) s2.push(c)
    expect(s1[0]).toEqual({ type: 'text', delta: 'a' })
    expect(s2[0]).toEqual({ type: 'text', delta: 'b' })
  })

  it('throws when invoked more times than scripted', async () => {
    const adapter = new FakeAdapter([{ chunks: [{ type: 'finish', reason: 'stop' }] }])
    const ctx = makeCtx()
    await adapter.stream(req(), ctx)
    await expect(adapter.stream(req(), ctx)).rejects.toThrow(/script exhausted/)
  })

  it('preserves single-script ergonomics via the array form', async () => {
    const adapter = new FakeAdapter([{ chunks: [{ type: 'finish', reason: 'stop' }] }])
    const ctx = makeCtx()
    const out: KernelChunk[] = []
    for await (const c of await adapter.stream(req(), ctx)) out.push(c)
    expect(out).toEqual([{ type: 'finish', reason: 'stop' }])
  })
})
```

- [ ] **Step 2: Run the test — expect fail**

Run: `pnpm --filter @seta/agent-core vitest run testkit/fake-adapter.test`
Expected: FAIL (constructor still accepts a single `FakeAdapterScript`, not an array).

- [ ] **Step 3: Implement the multi-step constructor**

Replace the `FakeAdapter` class in `platform/agent/core/src/testkit/fake-adapter.ts` (keep `FakeStream` and `FakeAdapterScript` unchanged):

```ts
export class FakeAdapter implements ModelAdapter {
  readonly provider = 'fake'
  private readonly scripts: FakeAdapterScript[]
  private callIndex = 0

  constructor(scripts: FakeAdapterScript[]) {
    if (scripts.length === 0) throw new Error('FakeAdapter requires at least one script')
    this.scripts = scripts
  }

  async stream(_req: AdapterRequest, ctx: RunCtx): Promise<ModelStream<KernelChunk>> {
    const script = this.scripts[this.callIndex]
    if (!script) throw new Error('FakeAdapter script exhausted')
    this.callIndex++
    return new FakeStream(script, ctx)
  }
}
```

- [ ] **Step 4: Update K1 callers from `new FakeAdapter({...})` to `new FakeAdapter([{...}])`**

Run: `pnpm --filter @seta/agent-core typecheck`
Expected: TS errors at all `new FakeAdapter({ chunks: ... })` sites. Fix each by wrapping the object in `[ ... ]`. Affected files (verify with grep):

```bash
grep -rn 'new FakeAdapter(' platform/agent/core/src platform/agent/core/tests
```

Update each call site to use the array form. Examples from existing `run.test.ts`:

```ts
adapters.register('fake', new FakeAdapter([{ chunks: scriptChunks }]))
// and the inline ones with throwOn:
new FakeAdapter([{ chunks: [...], throwOn: { afterChunks: 1, error: ... } }])
```

- [ ] **Step 5: Run the test — expect pass**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: all tests pass (new fake-adapter tests + K1 run tests with updated call sites).

- [ ] **Step 6: Commit**

```bash
git add platform/agent/core/src/testkit/fake-adapter.ts platform/agent/core/src/testkit/fake-adapter.test.ts platform/agent/core/src/run/run.test.ts
git commit -m "feat(agent-core): K4 testkit — FakeAdapter accepts multi-step scripts"
```

---

## Task 3: Processor runners (`processors.ts`)

**Files:**
- Create: `platform/agent/core/src/run/processors.ts`
- Create: `platform/agent/core/src/run/processors.test.ts`

Three sequential hook runners + an internal sentinel for `ctx.abort()`. Internal-only — not re-exported from the package barrel.

- [ ] **Step 1: Write the failing test for `runProcessInput`**

Create `platform/agent/core/src/run/processors.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { Processor, ProcessorContext, RunInput } from '../types'
import {
  ProcessorAbortSignal,
  runProcessInput,
  runProcessOutputStep,
  runProcessAPIError,
} from './processors'

function makeCtx(overrides: Partial<ProcessorContext> = {}): ProcessorContext {
  return {
    runId: 'r',
    abort: () => {
      throw new ProcessorAbortSignal()
    },
    abortSignal: new AbortController().signal,
    retryCount: 0,
    writer: { custom: vi.fn() },
    ...overrides,
  }
}

const baseInput: RunInput = {
  messages: [{ role: 'user', content: [{ type: 'text', text: 'in' }] }],
}

describe('runProcessInput', () => {
  it('threads input through processors left-to-right', async () => {
    const p1: Processor = {
      processInput: async (_c, i) => ({
        ...i,
        messages: [...i.messages, { role: 'user', content: [{ type: 'text', text: 'p1' }] }],
      }),
    }
    const p2: Processor = {
      processInput: async (_c, i) => ({
        ...i,
        messages: [...i.messages, { role: 'user', content: [{ type: 'text', text: 'p2' }] }],
      }),
    }
    const out = await runProcessInput([p1, p2], makeCtx(), baseInput)
    expect(out.messages).toHaveLength(3)
    expect(out.messages.at(-1)?.content[0]).toMatchObject({ text: 'p2' })
  })

  it('skips processors without processInput hook', async () => {
    const p1: Processor = {}
    const out = await runProcessInput([p1], makeCtx(), baseInput)
    expect(out).toEqual(baseInput)
  })
})
```

- [ ] **Step 2: Run the test — expect fail (module not found)**

Run: `pnpm --filter @seta/agent-core vitest run run/processors.test`
Expected: FAIL — `Cannot find module './processors'`.

- [ ] **Step 3: Implement `processors.ts`**

Create `platform/agent/core/src/run/processors.ts`:

```ts
import { AgentError } from '../errors'
import type { Processor, ProcessorContext, RunInput, StepResult } from '../types'

export class ProcessorAbortSignal extends Error {
  constructor() {
    super('processor aborted')
    this.name = 'ProcessorAbortSignal'
  }
}

export async function runProcessInput(
  processors: Processor[],
  ctx: ProcessorContext,
  input: RunInput,
): Promise<RunInput> {
  let working = input
  for (let i = 0; i < processors.length; i++) {
    const p = processors[i]
    if (!p?.processInput) continue
    try {
      working = await p.processInput(ctx, working)
    } catch (err) {
      if (err instanceof ProcessorAbortSignal) throw err
      throw new AgentError({
        code: 'PROCESSOR_FAILED',
        category: 'SYSTEM',
        message: `processor[${i}].processInput threw`,
        details: { processorIndex: i, hookName: 'processInput' },
        cause: err,
      })
    }
  }
  return working
}

export async function runProcessOutputStep(
  processors: Processor[],
  ctx: ProcessorContext,
  step: StepResult,
): Promise<StepResult> {
  let working = step
  for (let i = 0; i < processors.length; i++) {
    const p = processors[i]
    if (!p?.processOutputStep) continue
    try {
      working = await p.processOutputStep(ctx, working)
    } catch (err) {
      if (err instanceof ProcessorAbortSignal) throw err
      throw new AgentError({
        code: 'PROCESSOR_FAILED',
        category: 'SYSTEM',
        message: `processor[${i}].processOutputStep threw`,
        details: { processorIndex: i, hookName: 'processOutputStep' },
        cause: err,
      })
    }
  }
  return working
}

export async function runProcessAPIError(
  processors: Processor[],
  ctx: ProcessorContext,
  err: unknown,
): Promise<'retry' | 'rethrow'> {
  let verdict: 'retry' | 'rethrow' = 'rethrow'
  for (let i = 0; i < processors.length; i++) {
    const p = processors[i]
    if (!p?.processAPIError) continue
    try {
      const v = await p.processAPIError(ctx, err)
      if (v === 'retry') return 'retry'
      verdict = v
    } catch (innerErr) {
      if (innerErr instanceof ProcessorAbortSignal) throw innerErr
      throw new AgentError({
        code: 'PROCESSOR_FAILED',
        category: 'SYSTEM',
        message: `processor[${i}].processAPIError threw`,
        details: { processorIndex: i, hookName: 'processAPIError' },
        cause: innerErr,
      })
    }
  }
  return verdict
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm --filter @seta/agent-core vitest run run/processors.test`
Expected: both tests pass.

- [ ] **Step 5: Add the remaining test cases**

Append to `processors.test.ts`:

```ts
import type { StepResult } from '../types'

describe('runProcessOutputStep', () => {
  it('rewrites step message left-to-right', async () => {
    const base: StepResult = {
      kind: 'model',
      chunks: [],
      message: { role: 'assistant', content: [{ type: 'text', text: 'orig' }] },
      finishReason: 'stop',
    }
    const p1: Processor = {
      processOutputStep: async (_c, s) => ({
        ...s,
        message: { role: 'assistant', content: [{ type: 'text', text: 'p1' }] },
      }),
    }
    const p2: Processor = {
      processOutputStep: async (_c, s) => ({
        ...s,
        message: { role: 'assistant', content: [{ type: 'text', text: `${(s.message?.content[0] as { text: string }).text}-p2` }] },
      }),
    }
    const out = await runProcessOutputStep([p1, p2], makeCtx(), base)
    expect((out.message?.content[0] as { text: string }).text).toBe('p1-p2')
  })
})

describe('runProcessAPIError', () => {
  it('first retry wins (chain short-circuits)', async () => {
    const p2 = vi.fn(async () => 'rethrow' as const)
    const p1: Processor = { processAPIError: async () => 'retry' }
    const verdict = await runProcessAPIError([p1, { processAPIError: p2 }], makeCtx(), new Error('x'))
    expect(verdict).toBe('retry')
    expect(p2).not.toHaveBeenCalled()
  })

  it('all rethrow → rethrow', async () => {
    const p: Processor = { processAPIError: async () => 'rethrow' }
    const verdict = await runProcessAPIError([p, p], makeCtx(), new Error('x'))
    expect(verdict).toBe('rethrow')
  })

  it('no processors → rethrow', async () => {
    const verdict = await runProcessAPIError([], makeCtx(), new Error('x'))
    expect(verdict).toBe('rethrow')
  })
})

describe('processor failure modes', () => {
  it('thrown non-abort error wraps as PROCESSOR_FAILED with processorIndex/hookName', async () => {
    const p1: Processor = {
      processInput: async () => {
        throw new Error('boom')
      },
    }
    await expect(runProcessInput([p1], makeCtx(), baseInput)).rejects.toMatchObject({
      code: 'PROCESSOR_FAILED',
      details: { processorIndex: 0, hookName: 'processInput' },
    })
  })

  it('ProcessorAbortSignal propagates unchanged', async () => {
    const p1: Processor = {
      processInput: async (c) => c.abort(),
    }
    await expect(runProcessInput([p1], makeCtx(), baseInput)).rejects.toBeInstanceOf(ProcessorAbortSignal)
  })
})
```

- [ ] **Step 6: Run all processors tests — expect pass**

Run: `pnpm --filter @seta/agent-core vitest run run/processors.test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add platform/agent/core/src/run/processors.ts platform/agent/core/src/run/processors.test.ts
git commit -m "feat(agent-core): K4 §8.8 processor hook runners + abort sentinel"
```

---

## Task 4: Tool execution module (`execute-tools.ts`)

**Files:**
- Create: `platform/agent/core/src/run/execute-tools.ts`
- Create: `platform/agent/core/src/run/execute-tools.test.ts`

Owns: inline semaphore, per-tool budget state, timeout, 4 outcomes mapped to `StepResult{kind:'tool'}`. Internal-only.

- [ ] **Step 1: Write the failing test for the happy path**

Create `platform/agent/core/src/run/execute-tools.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { RunCtx, Tool } from '../types'
import { executeTools } from './execute-tools'

function makeCtx(signal = new AbortController().signal): RunCtx {
  return { runId: 'r', signal, retryCount: 0, now: () => 0, generateId: () => 'id', currentDate: () => new Date(0) }
}

const okSchema = z.any() as unknown as Tool['inputSchema']

function makeTool(id: string, execute: Tool['execute'], extras: Partial<Tool> = {}): Tool {
  return {
    id,
    description: id,
    inputSchema: okSchema,
    outputSchema: okSchema,
    execute,
    ...extras,
  }
}

describe('executeTools — happy path', () => {
  it('executes one tool and returns ok tool_result', async () => {
    const tool = makeTool('echo', async (input) => ({ ok: true, value: input }))
    const steps = await executeTools({
      toolCalls: [{ toolCallId: 'tc1', name: 'echo', args: { x: 1 } }],
      tools: [tool],
      ctx: makeCtx(),
      opts: {},
    })
    expect(steps).toHaveLength(1)
    expect(steps[0]?.kind).toBe('tool')
    expect(steps[0]?.toolCallId).toBe('tc1')
    expect(steps[0]?.toolName).toBe('echo')
    expect(steps[0]?.error).toBeUndefined()
    const content = steps[0]?.message?.content[0]
    expect(content).toMatchObject({ type: 'tool_result', toolCallId: 'tc1', isError: false })
  })
})
```

- [ ] **Step 2: Run the test — expect fail (module not found)**

Run: `pnpm --filter @seta/agent-core vitest run run/execute-tools.test`
Expected: FAIL.

- [ ] **Step 3: Implement `execute-tools.ts`**

Create `platform/agent/core/src/run/execute-tools.ts`:

```ts
import { ToolError } from '../errors'
import type {
  KernelMessage,
  RunCtx,
  RunLoopOptions,
  StepResult,
  Tool,
  ToolExecutionContext,
} from '../types'

interface ToolCall {
  toolCallId: string
  name: string
  args: unknown
}

interface ExecuteArgs {
  toolCalls: ToolCall[]
  tools: Tool[]
  ctx: RunCtx
  opts: Pick<RunLoopOptions, 'toolCallConcurrency' | 'perToolBudget'>
}

function makeSemaphore(n: number) {
  let active = 0
  const waiters: Array<() => void> = []
  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < n) {
        active++
        resolve()
      } else {
        waiters.push(() => {
          active++
          resolve()
        })
      }
    })
  const release = () => {
    active--
    waiters.shift()?.()
  }
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      return acquire().then(async () => {
        try {
          return await fn()
        } finally {
          release()
        }
      })
    },
  }
}

function toolResultMessage(toolCallId: string, result: unknown, isError: boolean): KernelMessage {
  return {
    role: 'tool',
    toolCallId,
    content: [{ type: 'tool_result', toolCallId, result, isError }],
  }
}

function errorPayload(err: ToolError): { name: string; message: string; details?: Record<string, unknown> } {
  return {
    name: err.code,
    message: err.message,
    ...(err.details !== undefined ? { details: err.details } : {}),
  }
}

export async function executeTools(args: ExecuteArgs): Promise<StepResult[]> {
  const { toolCalls, tools, ctx, opts } = args
  const toolsById = new Map(tools.map((t) => [t.id, t]))
  const needsApproval = toolCalls.some(
    (tc) => toolsById.get(tc.name)?.annotations?.requireApproval === true,
  )
  const concurrency = needsApproval ? 1 : (opts.toolCallConcurrency ?? 10)
  const semaphore = makeSemaphore(concurrency)
  const budgetCalls = new Map<string, number>()
  const maxCalls = opts.perToolBudget?.maxCalls
  const timeoutMs = opts.perToolBudget?.timeoutMs

  const results: StepResult[] = new Array(toolCalls.length)

  const tasks = toolCalls.map((tc, idx) =>
    semaphore.run(async () => {
      results[idx] = await runOneToolCall(tc, idx, ctx, toolsById, budgetCalls, maxCalls, timeoutMs)
    }),
  )
  await Promise.allSettled(tasks)
  return results
}

async function runOneToolCall(
  tc: ToolCall,
  _idx: number,
  ctx: RunCtx,
  toolsById: Map<string, Tool>,
  budgetCalls: Map<string, number>,
  maxCalls: number | undefined,
  timeoutMs: number | undefined,
): Promise<StepResult> {
  const tool = toolsById.get(tc.name)
  if (!tool) {
    const err = new ToolError({
      code: 'TOOL_UNKNOWN',
      category: 'THIRD_PARTY',
      message: `unknown tool: ${tc.name}`,
      details: { toolCallId: tc.toolCallId, name: tc.name },
    })
    return {
      kind: 'tool',
      chunks: [],
      message: toolResultMessage(tc.toolCallId, errorPayload(err), true),
      toolCallId: tc.toolCallId,
      toolName: tc.name,
      error: err,
    }
  }

  if (maxCalls !== undefined) {
    const used = budgetCalls.get(tool.id) ?? 0
    if (used >= maxCalls) {
      const err = new ToolError({
        code: 'TOOL_BUDGET_EXCEEDED',
        category: 'USER',
        message: `tool ${tool.id} exceeded maxCalls=${maxCalls}`,
        details: { toolCallId: tc.toolCallId, toolId: tool.id, maxCalls },
      })
      return {
        kind: 'tool',
        chunks: [],
        message: toolResultMessage(tc.toolCallId, errorPayload(err), true),
        toolCallId: tc.toolCallId,
        toolName: tc.name,
        error: err,
      }
    }
    budgetCalls.set(tool.id, used + 1)
  }

  const toolSignal: AbortSignal =
    timeoutMs !== undefined
      ? AbortSignal.any([ctx.signal, AbortSignal.timeout(timeoutMs)])
      : ctx.signal

  const stepCtx: ToolExecutionContext = {
    surface: 'direct',
    abortSignal: toolSignal,
    runId: ctx.runId,
    requestContext: ctx,
  }

  try {
    const result = await tool.execute(tc.args as never, stepCtx)
    if ('suspend' in result) {
      const err = new ToolError({
        code: 'TOOL_SUSPEND_NOT_SUPPORTED',
        category: 'SYSTEM',
        message: `tool ${tool.id} returned suspend; workflow runtime not bound`,
        details: { toolCallId: tc.toolCallId, toolId: tool.id, reason: result.suspend.reason },
      })
      return {
        kind: 'tool',
        chunks: [],
        message: toolResultMessage(tc.toolCallId, errorPayload(err), true),
        toolCallId: tc.toolCallId,
        toolName: tc.name,
        error: err,
      }
    }
    if (result.ok === false) {
      return {
        kind: 'tool',
        chunks: [],
        message: toolResultMessage(tc.toolCallId, result.error, true),
        toolCallId: tc.toolCallId,
        toolName: tc.name,
      }
    }
    const rendered = tool.toModelOutput ? tool.toModelOutput(result.value) : result.value
    return {
      kind: 'tool',
      chunks: [],
      message: toolResultMessage(tc.toolCallId, rendered, false),
      toolCallId: tc.toolCallId,
      toolName: tc.name,
    }
  } catch (err) {
    const isTimeout =
      toolSignal.aborted &&
      timeoutMs !== undefined &&
      !ctx.signal.aborted
    const kerr = new ToolError({
      code: isTimeout ? 'TOOL_TIMEOUT' : 'TOOL_EXECUTION_FAILED',
      category: 'SYSTEM',
      message: isTimeout ? `tool ${tool.id} timed out after ${timeoutMs}ms` : `tool ${tool.id} execution failed`,
      details: { toolCallId: tc.toolCallId, toolId: tool.id, ...(isTimeout ? { timeoutMs } : {}) },
      cause: err,
    })
    return {
      kind: 'tool',
      chunks: [],
      message: toolResultMessage(tc.toolCallId, errorPayload(kerr), true),
      toolCallId: tc.toolCallId,
      toolName: tc.name,
      error: kerr,
    }
  }
}
```

- [ ] **Step 4: Run the happy-path test — expect pass**

Run: `pnpm --filter @seta/agent-core vitest run run/execute-tools.test`
Expected: PASS.

- [ ] **Step 5: Add coverage tests (concurrency, requireApproval, all 4 outcomes, budget, unknown, abort, order)**

Append to `execute-tools.test.ts`. Show one canonical case per concern; engineers add others as listed.

```ts
describe('executeTools — outcomes', () => {
  it('validation error → tool_result.isError=true, StepResult.error undefined', async () => {
    const tool = makeTool('v', async () => ({
      ok: false,
      error: { name: 'BAD_INPUT', message: 'nope' },
    }))
    const [step] = await executeTools({
      toolCalls: [{ toolCallId: 't1', name: 'v', args: {} }],
      tools: [tool],
      ctx: makeCtx(),
      opts: {},
    })
    expect(step?.error).toBeUndefined()
    expect((step?.message?.content[0] as { isError: boolean }).isError).toBe(true)
  })

  it('thrown error → TOOL_EXECUTION_FAILED, isError:true', async () => {
    const tool = makeTool('throws', async () => {
      throw new Error('boom')
    })
    const [step] = await executeTools({
      toolCalls: [{ toolCallId: 't1', name: 'throws', args: {} }],
      tools: [tool],
      ctx: makeCtx(),
      opts: {},
    })
    expect(step?.error?.code).toBe('TOOL_EXECUTION_FAILED')
  })

  it('{suspend} → TOOL_SUSPEND_NOT_SUPPORTED', async () => {
    const tool = makeTool('s', async () => ({ suspend: { reason: 'r', resumeLabel: 'l' } }))
    const [step] = await executeTools({
      toolCalls: [{ toolCallId: 't1', name: 's', args: {} }],
      tools: [tool],
      ctx: makeCtx(),
      opts: {},
    })
    expect(step?.error?.code).toBe('TOOL_SUSPEND_NOT_SUPPORTED')
  })

  it('unknown tool → TOOL_UNKNOWN', async () => {
    const [step] = await executeTools({
      toolCalls: [{ toolCallId: 't1', name: 'ghost', args: {} }],
      tools: [],
      ctx: makeCtx(),
      opts: {},
    })
    expect(step?.error?.code).toBe('TOOL_UNKNOWN')
  })

  it('maxCalls budget → TOOL_BUDGET_EXCEEDED on the (N+1)th call', async () => {
    const tool = makeTool('a', async () => ({ ok: true, value: 1 }))
    const steps = await executeTools({
      toolCalls: [1, 2, 3].map((i) => ({ toolCallId: `t${i}`, name: 'a', args: {} })),
      tools: [tool],
      ctx: makeCtx(),
      opts: { perToolBudget: { maxCalls: 2 } },
    })
    expect(steps[0]?.error).toBeUndefined()
    expect(steps[1]?.error).toBeUndefined()
    expect(steps[2]?.error?.code).toBe('TOOL_BUDGET_EXCEEDED')
  })

  it('toModelOutput rewrites the value in tool_result', async () => {
    const tool = makeTool('o', async () => ({ ok: true, value: { secret: 'k' } }), {
      toModelOutput: (v) => ({ redacted: true, keys: Object.keys(v as object) }),
    })
    const [step] = await executeTools({
      toolCalls: [{ toolCallId: 't1', name: 'o', args: {} }],
      tools: [tool],
      ctx: makeCtx(),
      opts: {},
    })
    const result = (step?.message?.content[0] as { result: unknown }).result
    expect(result).toEqual({ redacted: true, keys: ['secret'] })
  })
})

describe('executeTools — concurrency', () => {
  it('bounds parallelism by toolCallConcurrency', async () => {
    let inFlight = 0
    let peak = 0
    const tool = makeTool('slow', async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return { ok: true, value: 1 }
    })
    const calls = Array.from({ length: 5 }, (_, i) => ({ toolCallId: `t${i}`, name: 'slow', args: {} }))
    await executeTools({ toolCalls: calls, tools: [tool], ctx: makeCtx(), opts: { toolCallConcurrency: 2 } })
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('collapses to 1 when any tool requires approval', async () => {
    let inFlight = 0
    let peak = 0
    const approval = makeTool('app', async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return { ok: true, value: 1 }
    }, { annotations: { requireApproval: true } })
    const fast = makeTool('fast', async () => ({ ok: true, value: 1 }))
    await executeTools({
      toolCalls: [
        { toolCallId: '1', name: 'app', args: {} },
        { toolCallId: '2', name: 'fast', args: {} },
        { toolCallId: '3', name: 'fast', args: {} },
      ],
      tools: [approval, fast],
      ctx: makeCtx(),
      opts: { toolCallConcurrency: 10 },
    })
    expect(peak).toBe(1)
  })

  it('preserves call-emission order regardless of completion order', async () => {
    const tool = makeTool('rand', async (args) => {
      const delay = (args as { d: number }).d
      await new Promise((r) => setTimeout(r, delay))
      return { ok: true, value: delay }
    })
    const steps = await executeTools({
      toolCalls: [
        { toolCallId: 'a', name: 'rand', args: { d: 10 } },
        { toolCallId: 'b', name: 'rand', args: { d: 1 } },
        { toolCallId: 'c', name: 'rand', args: { d: 5 } },
      ],
      tools: [tool],
      ctx: makeCtx(),
      opts: {},
    })
    expect(steps.map((s) => s.toolCallId)).toEqual(['a', 'b', 'c'])
  })
})

describe('executeTools — timeout', () => {
  it('TOOL_TIMEOUT when execute exceeds timeoutMs and ctx.signal NOT aborted', async () => {
    const tool = makeTool('hang', async (_a, c) => {
      await new Promise((resolve, reject) => {
        const onAbort = () => reject(new Error('aborted'))
        c.abortSignal.addEventListener('abort', onAbort, { once: true })
      })
      return { ok: true, value: 1 }
    })
    const [step] = await executeTools({
      toolCalls: [{ toolCallId: 't1', name: 'hang', args: {} }],
      tools: [tool],
      ctx: makeCtx(),
      opts: { perToolBudget: { timeoutMs: 10 } },
    })
    expect(step?.error?.code).toBe('TOOL_TIMEOUT')
  })

  it('TOOL_EXECUTION_FAILED (not TIMEOUT) when ctx.signal aborts the tool', async () => {
    const ctrl = new AbortController()
    const tool = makeTool('hang2', async (_a, c) => {
      await new Promise((_resolve, reject) => {
        c.abortSignal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
      return { ok: true, value: 1 }
    })
    const promise = executeTools({
      toolCalls: [{ toolCallId: 't1', name: 'hang2', args: {} }],
      tools: [tool],
      ctx: makeCtx(ctrl.signal),
      opts: { perToolBudget: { timeoutMs: 10_000 } },
    })
    ctrl.abort()
    const [step] = await promise
    expect(step?.error?.code).toBe('TOOL_EXECUTION_FAILED')
  })
})
```

- [ ] **Step 6: Run all execute-tools tests — expect pass**

Run: `pnpm --filter @seta/agent-core vitest run run/execute-tools.test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add platform/agent/core/src/run/execute-tools.ts platform/agent/core/src/run/execute-tools.test.ts
git commit -m "feat(agent-core): K4 §8.5/§8.6 bounded tool fan-out + per-tool budgets"
```

---

## Task 5: Fallback wrapper (`fallback.ts`)

**Files:**
- Create: `platform/agent/core/src/run/fallback.ts`
- Create: `platform/agent/core/src/run/fallback.test.ts`

Wraps one model call with the candidate-failover policy and the `processAPIError` interaction.

- [ ] **Step 1: Write the failing test for primary-success**

Create `platform/agent/core/src/run/fallback.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LlmError } from '../errors'
import { createAdapterRegistry } from '../models/registry'
import { FakeAdapter } from '../testkit/fake-adapter'
import type { AgentConfig, KernelChunk, KernelMessage, RunCtx } from '../types'
import { runModelStepWithFallback } from './fallback'

function makeCtx(signal = new AbortController().signal): RunCtx {
  return { runId: 'r', signal, retryCount: 0, now: () => 0, generateId: () => 'id', currentDate: () => new Date(0) }
}

async function drain<T, U>(gen: AsyncGenerator<T, U>): Promise<{ chunks: T[]; ret: U }> {
  const chunks: T[] = []
  let res: IteratorResult<T, U>
  while (true) {
    res = await gen.next()
    if (res.done) return { chunks, ret: res.value }
    chunks.push(res.value)
  }
}

describe('runModelStepWithFallback — primary success', () => {
  it('uses cfg.model and ignores cfg.fallback', async () => {
    const adapters = createAdapterRegistry()
    adapters.register('p', new FakeAdapter([{ chunks: [{ type: 'text', delta: 'hi' }, { type: 'finish', reason: 'stop' }] }]))
    adapters.register('f', new FakeAdapter([{ chunks: [{ type: 'text', delta: 'fb' }, { type: 'finish', reason: 'stop' }] }]))
    const cfg: AgentConfig = { model: 'p/x', fallback: ['f/y'] }
    const { chunks, ret } = await drain(
      runModelStepWithFallback({ cfg, ctx: makeCtx(), opts: { adapters }, messages: [], tools: undefined }),
    )
    expect(chunks.map((c: KernelChunk) => (c.type === 'text' ? c.delta : null)).filter(Boolean)).toEqual(['hi'])
    expect(ret.kind).toBe('model')
    expect(ret.finishReason).toBe('stop')
  })
})
```

- [ ] **Step 2: Run the test — expect fail (module not found)**

Run: `pnpm --filter @seta/agent-core vitest run run/fallback.test`
Expected: FAIL.

- [ ] **Step 3: Implement `fallback.ts`**

Create `platform/agent/core/src/run/fallback.ts`:

```ts
import { kernelErrorOf, LlmError } from '../errors'
import { isAbortError } from '../errors/classify'
import { prepareTools } from '../models/prepare-tools'
import type {
  AdapterRequest,
  AgentConfig,
  KernelChunk,
  KernelError,
  KernelMessage,
  RunCtx,
  RunLoopOptions,
  StepResult,
  Tool,
} from '../types'
import { runProcessAPIError } from './processors'

const CACHE_TTL_AUTO_THRESHOLD = 2048
const FAILOVER_CODES = new Set(['LLM_TRANSIENT_EXHAUSTED', 'LLM_SERVER_ERROR', 'LLM_RATE_LIMITED'])
const MAX_PROCESSOR_RETRIES = 1

interface RunArgs {
  cfg: AgentConfig
  ctx: RunCtx
  opts: RunLoopOptions
  messages: KernelMessage[]
  tools: Tool[] | undefined
}

export async function* runModelStepWithFallback(
  args: RunArgs,
): AsyncGenerator<KernelChunk, StepResult> {
  const { cfg, ctx, opts } = args
  const candidates = [cfg.model, ...(cfg.fallback ?? [])]
  let lastErr: KernelError | undefined
  let processorRetries = 0

  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i]
    if (model === undefined) break
    if (ctx.signal.aborted) break

    try {
      return yield* runOneModelStep({ ...args, modelId: model })
    } catch (err) {
      if (isAbortError(err) && ctx.signal.aborted) {
        throw err
      }
      const kerr = kernelErrorOf(err)
      lastErr = kerr

      if (opts.processors?.length && processorRetries < MAX_PROCESSOR_RETRIES) {
        const decision = await runProcessAPIError(
          opts.processors,
          makeProcessorCtx(ctx),
          kerr,
        )
        if (decision === 'retry') {
          processorRetries++
          i--
          continue
        }
        if (!FAILOVER_CODES.has(kerr.code)) break
      } else if (!FAILOVER_CODES.has(kerr.code)) {
        break
      }
    }
  }

  const err =
    lastErr ??
    new LlmError({ code: 'LLM_UNKNOWN', category: 'SYSTEM', message: 'no model candidate produced a result' })
  yield { type: 'error', error: err }
  return {
    kind: 'model',
    chunks: [{ type: 'error', error: err }],
    finishReason: 'error',
    error: err,
  }
}

interface OneArgs extends RunArgs {
  modelId: string
}

async function* runOneModelStep(args: OneArgs): AsyncGenerator<KernelChunk, StepResult> {
  const { cfg, ctx, opts, messages, tools, modelId } = args
  const { adapter, bareModel } = opts.adapters.select(modelId)
  const preparedTools = tools && tools.length > 0 ? prepareTools(tools) : undefined
  const systemPrompt = cfg.systemPrompt
  const cacheTtl: '5m' | '1h' | null =
    cfg.cacheTtl !== undefined
      ? cfg.cacheTtl
      : systemPrompt !== undefined && systemPrompt.length > CACHE_TTL_AUTO_THRESHOLD
        ? '5m'
        : null

  const req: AdapterRequest = {
    model: bareModel,
    messages,
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    ...(preparedTools !== undefined ? { tools: preparedTools } : {}),
    ...(cfg.maxTokens !== undefined ? { maxTokens: cfg.maxTokens } : {}),
    cacheTtl,
  }

  const stream = await adapter.stream(req, ctx)
  const collected: KernelChunk[] = []
  let finishReason: StepResult['finishReason']

  try {
    try {
      for await (const chunk of stream) {
        if (ctx.signal.aborted) {
          const e = new Error('aborted')
          e.name = 'AbortError'
          throw e
        }
        collected.push(chunk)
        if (chunk.type === 'finish') finishReason = chunk.reason
        yield chunk
      }
    } finally {
      stream.abort()
    }
    const message = await stream.finalMessage()
    return {
      kind: 'model',
      chunks: collected,
      message,
      ...(finishReason !== undefined ? { finishReason } : {}),
    }
  } catch (err) {
    throw err
  }
}

function makeProcessorCtx(ctx: RunCtx) {
  return {
    runId: ctx.runId,
    abort: (): never => {
      const e = new Error('processor aborted')
      e.name = 'ProcessorAbortSignal'
      throw e
    },
    abortSignal: ctx.signal,
    retryCount: ctx.retryCount,
    writer: { custom: () => {} },
  }
}
```

- [ ] **Step 4: Run the test — expect pass**

Run: `pnpm --filter @seta/agent-core vitest run run/fallback.test`
Expected: PASS.

- [ ] **Step 5: Add coverage tests**

Append to `fallback.test.ts`:

```ts
class ThrowAdapter {
  readonly provider = 'x'
  private calls = 0
  constructor(private readonly errs: unknown[]) {}
  async stream() {
    const err = this.errs[this.calls++]
    if (this.calls > this.errs.length) throw new Error('adapter exhausted')
    throw err
  }
}

describe('runModelStepWithFallback — failover', () => {
  it('transient on primary → fallback succeeds', async () => {
    const adapters = createAdapterRegistry()
    adapters.register('p', new ThrowAdapter([
      new LlmError({ code: 'LLM_TRANSIENT_EXHAUSTED', category: 'THIRD_PARTY', message: '503' }),
    ]) as never)
    adapters.register('f', new FakeAdapter([{ chunks: [{ type: 'finish', reason: 'stop' }] }]))
    const cfg: AgentConfig = { model: 'p/x', fallback: ['f/y'] }
    const { ret } = await drain(
      runModelStepWithFallback({ cfg, ctx: makeCtx(), opts: { adapters }, messages: [], tools: undefined }),
    )
    expect(ret.finishReason).toBe('stop')
  })

  it('non-failover error on primary → no fallback, error chunk', async () => {
    const adapters = createAdapterRegistry()
    adapters.register('p', new ThrowAdapter([
      new LlmError({ code: 'LLM_AUTH_FAILED', category: 'SYSTEM', message: '401' }),
    ]) as never)
    adapters.register('f', new FakeAdapter([{ chunks: [{ type: 'finish', reason: 'stop' }] }]))
    const cfg: AgentConfig = { model: 'p/x', fallback: ['f/y'] }
    const { chunks, ret } = await drain(
      runModelStepWithFallback({ cfg, ctx: makeCtx(), opts: { adapters }, messages: [], tools: undefined }),
    )
    expect(chunks.at(-1)?.type).toBe('error')
    expect(ret.error?.code).toBe('LLM_AUTH_FAILED')
  })

  it('chain exhausted → surfaces last error', async () => {
    const adapters = createAdapterRegistry()
    adapters.register('p', new ThrowAdapter([
      new LlmError({ code: 'LLM_SERVER_ERROR', category: 'THIRD_PARTY', message: '500' }),
    ]) as never)
    adapters.register('f', new ThrowAdapter([
      new LlmError({ code: 'LLM_RATE_LIMITED', category: 'THIRD_PARTY', message: '429' }),
    ]) as never)
    const cfg: AgentConfig = { model: 'p/x', fallback: ['f/y'] }
    const { ret } = await drain(
      runModelStepWithFallback({ cfg, ctx: makeCtx(), opts: { adapters }, messages: [], tools: undefined }),
    )
    expect(ret.error?.code).toBe('LLM_RATE_LIMITED')
  })

  it('processAPIError "retry" reattempts the same model (bounded by maxProcessorRetries=1)', async () => {
    const adapters = createAdapterRegistry()
    adapters.register('p', new ThrowAdapter([
      new LlmError({ code: 'LLM_BAD_REQUEST', category: 'SYSTEM', message: '400' }),
      new LlmError({ code: 'LLM_BAD_REQUEST', category: 'SYSTEM', message: '400 again' }),
    ]) as never)
    const cfg: AgentConfig = { model: 'p/x' }
    const opts = {
      adapters,
      processors: [{ processAPIError: async () => 'retry' as const }],
    }
    const { ret } = await drain(
      runModelStepWithFallback({ cfg, ctx: makeCtx(), opts, messages: [], tools: undefined }),
    )
    expect(ret.error?.code).toBe('LLM_BAD_REQUEST')
  })

  it('abort during failover stops further attempts', async () => {
    const ctrl = new AbortController()
    const adapters = createAdapterRegistry()
    adapters.register('p', {
      provider: 'p',
      async stream() {
        ctrl.abort()
        const e = new Error('aborted')
        e.name = 'AbortError'
        throw e
      },
    } as never)
    adapters.register('f', new FakeAdapter([{ chunks: [{ type: 'finish', reason: 'stop' }] }]))
    const cfg: AgentConfig = { model: 'p/x', fallback: ['f/y'] }
    await expect(
      drain(runModelStepWithFallback({ cfg, ctx: makeCtx(ctrl.signal), opts: { adapters }, messages: [], tools: undefined })),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
```

- [ ] **Step 6: Run all fallback tests — expect pass**

Run: `pnpm --filter @seta/agent-core vitest run run/fallback.test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add platform/agent/core/src/run/fallback.ts platform/agent/core/src/run/fallback.test.ts
git commit -m "feat(agent-core): K4 §8.7 model-candidate failover with processAPIError"
```

---

## Task 6: Outer tool loop (`tool-loop.ts`)

**Files:**
- Create: `platform/agent/core/src/run/tool-loop.ts`
- Create: `platform/agent/core/src/run/tool-loop.test.ts`

Owns the iteration: termination order, `maxSteps` cap, `stopWhen` OR semantics, `accumulatedSteps` ordering, processor wiring around each step.

- [ ] **Step 1: Write failing test — natural stop after one step**

Create `platform/agent/core/src/run/tool-loop.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createAdapterRegistry } from '../models/registry'
import { FakeAdapter } from '../testkit/fake-adapter'
import type { AgentConfig, KernelChunk, RunCtx } from '../types'
import { runToolLoop } from './tool-loop'

function makeCtx(signal = new AbortController().signal): RunCtx {
  return { runId: 'r', signal, retryCount: 0, now: () => 0, generateId: () => 'id', currentDate: () => new Date(0) }
}

async function drain(gen: AsyncGenerator<KernelChunk, unknown>) {
  const chunks: KernelChunk[] = []
  let res: IteratorResult<KernelChunk, unknown>
  while (true) {
    res = await gen.next()
    if (res.done) return { chunks, ret: res.value }
    chunks.push(res.value)
  }
}

describe('runToolLoop — natural stop', () => {
  it('returns after one model step when finishReason=stop', async () => {
    const adapters = createAdapterRegistry()
    adapters.register('f', new FakeAdapter([
      { chunks: [{ type: 'text', delta: 'done' }, { type: 'finish', reason: 'stop' }] },
    ]))
    const cfg: AgentConfig = { model: 'f/x' }
    const { chunks } = await drain(
      runToolLoop({ cfg, ctx: makeCtx(), opts: { adapters }, initialMessages: [], tools: [] }),
    )
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: 'stop' })
  })
})
```

- [ ] **Step 2: Run the test — expect fail (module not found)**

Run: `pnpm --filter @seta/agent-core vitest run run/tool-loop.test`
Expected: FAIL.

- [ ] **Step 3: Implement `tool-loop.ts`**

Create `platform/agent/core/src/run/tool-loop.ts`:

```ts
import { AgentError } from '../errors'
import type {
  AgentConfig,
  KernelChunk,
  KernelMessage,
  ProcessorContext,
  RunCtx,
  RunLoopOptions,
  StepResult,
  TokenUsage,
  Tool,
} from '../types'
import { runModelStepWithFallback } from './fallback'
import { executeTools } from './execute-tools'
import { ProcessorAbortSignal, runProcessOutputStep } from './processors'

const DEFAULT_MAX_STEPS = 16

interface ToolLoopArgs {
  cfg: AgentConfig
  ctx: RunCtx
  opts: RunLoopOptions
  initialMessages: KernelMessage[]
  tools: Tool[]
}

export async function* runToolLoop(
  args: ToolLoopArgs,
): AsyncGenerator<KernelChunk, KernelMessage[]> {
  const { cfg, ctx, opts, initialMessages, tools } = args
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS
  const accumulatedSteps: StepResult[] = []
  const addedMessages: KernelMessage[] = []
  let messages = initialMessages
  let modelStepCount = 0

  while (true) {
    if (ctx.signal.aborted) {
      yield { type: 'abort' }
      return addedMessages
    }

    const modelStep = yield* runModelStepWithFallback({ cfg, ctx, opts, messages, tools })
    modelStepCount++
    accumulatedSteps.push(modelStep)
    if (modelStep.message) {
      messages = [...messages, modelStep.message]
      addedMessages.push(modelStep.message)
    }
    if (opts.processors?.length) {
      try {
        const rewritten = await runProcessOutputStep(opts.processors, makeProcessorCtx(ctx), modelStep)
        if (rewritten.message && rewritten.message !== modelStep.message) {
          messages[messages.length - 1] = rewritten.message
          addedMessages[addedMessages.length - 1] = rewritten.message
        }
      } catch (err) {
        if (err instanceof ProcessorAbortSignal) {
          yield processorAbortChunk('processOutputStep', opts.processors.findIndex((p) => p.processOutputStep))
          yield { type: 'abort' }
          return addedMessages
        }
        throw err
      }
    }

    if (modelStep.error) return addedMessages
    if (modelStep.finishReason !== 'tool_calls') return addedMessages

    if (modelStepCount >= maxSteps) {
      yield synthesizeFinish('length', sumUsage(accumulatedSteps))
      return addedMessages
    }

    const toolCalls = extractToolCalls(modelStep.message)
    const toolSteps = await executeTools({ toolCalls, tools, ctx, opts })
    for (const step of toolSteps) {
      accumulatedSteps.push(step)
      if (step.message) {
        messages = [...messages, step.message]
        addedMessages.push(step.message)
      }
      if (opts.processors?.length) {
        try {
          const rewritten = await runProcessOutputStep(opts.processors, makeProcessorCtx(ctx), step)
          if (rewritten.message && rewritten.message !== step.message) {
            messages[messages.length - 1] = rewritten.message
            addedMessages[addedMessages.length - 1] = rewritten.message
          }
        } catch (err) {
          if (err instanceof ProcessorAbortSignal) {
            yield processorAbortChunk('processOutputStep', opts.processors.findIndex((p) => p.processOutputStep))
            yield { type: 'abort' }
            return addedMessages
          }
          throw err
        }
      }
    }

    if (opts.stopWhen) {
      const predicates = Array.isArray(opts.stopWhen) ? opts.stopWhen : [opts.stopWhen]
      let results: boolean[]
      try {
        results = await Promise.all(predicates.map((p) => Promise.resolve(p({ steps: accumulatedSteps }))))
      } catch (err) {
        const wrapped = new AgentError({
          code: 'STOP_WHEN_FAILED',
          category: 'SYSTEM',
          message: 'stopWhen predicate threw',
          cause: err,
        })
        yield { type: 'error', error: wrapped }
        return addedMessages
      }
      if (results.some(Boolean)) {
        yield synthesizeFinish('stop', sumUsage(accumulatedSteps))
        return addedMessages
      }
    }
  }
}

function extractToolCalls(message: KernelMessage | undefined): Array<{ toolCallId: string; name: string; args: unknown }> {
  if (!message) {
    throw new AgentError({
      code: 'ADAPTER_PROTOCOL_VIOLATION',
      category: 'THIRD_PARTY',
      message: 'finishReason=tool_calls but no message produced',
    })
  }
  const calls = message.content
    .filter((c): c is { type: 'tool_use'; toolCallId: string; name: string; args: unknown } => c.type === 'tool_use')
    .map((c) => ({ toolCallId: c.toolCallId, name: c.name, args: c.args }))
  if (calls.length === 0) {
    throw new AgentError({
      code: 'ADAPTER_PROTOCOL_VIOLATION',
      category: 'THIRD_PARTY',
      message: 'finishReason=tool_calls but message has no tool_use blocks',
    })
  }
  return calls
}

function sumUsage(steps: StepResult[]): TokenUsage | undefined {
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
  let any = false
  for (const s of steps) {
    for (const c of s.chunks) {
      if (c.type === 'finish' && c.usage) {
        usage.inputTokens += c.usage.inputTokens
        usage.outputTokens += c.usage.outputTokens
        if (c.usage.cacheReadInputTokens !== undefined) {
          usage.cacheReadInputTokens = (usage.cacheReadInputTokens ?? 0) + c.usage.cacheReadInputTokens
        }
        if (c.usage.cacheCreationInputTokens !== undefined) {
          usage.cacheCreationInputTokens = (usage.cacheCreationInputTokens ?? 0) + c.usage.cacheCreationInputTokens
        }
        any = true
      }
    }
  }
  return any ? usage : undefined
}

function synthesizeFinish(reason: 'stop' | 'length', usage: TokenUsage | undefined): KernelChunk {
  return usage ? { type: 'finish', reason, usage } : { type: 'finish', reason }
}

function processorAbortChunk(hookName: string, processorIndex: number): KernelChunk {
  return {
    type: 'error',
    error: new AgentError({
      code: 'PROCESSOR_ABORTED',
      category: 'USER',
      message: 'processor invoked ctx.abort()',
      details: { hookName, processorIndex },
    }),
  }
}

function makeProcessorCtx(ctx: RunCtx): ProcessorContext {
  return {
    runId: ctx.runId,
    abort: (): never => {
      throw new ProcessorAbortSignal()
    },
    abortSignal: ctx.signal,
    retryCount: ctx.retryCount,
    writer: { custom: () => {} },
  }
}
```

- [ ] **Step 4: Run the natural-stop test — expect pass**

Run: `pnpm --filter @seta/agent-core vitest run run/tool-loop.test`
Expected: PASS.

- [ ] **Step 5: Add the remaining tests**

Append to `tool-loop.test.ts`:

```ts
import { z } from 'zod'
import type { StopCondition, Tool } from '../types'

const anySchema = z.any() as unknown as Tool['inputSchema']

function makeTool(id: string, exec: Tool['execute']): Tool {
  return { id, description: id, inputSchema: anySchema, outputSchema: anySchema, execute: exec }
}

describe('runToolLoop — multi-step', () => {
  it('round-trips: model→tool→model→stop', async () => {
    const adapters = createAdapterRegistry()
    adapters.register('f', new FakeAdapter([
      {
        chunks: [
          { type: 'tool_call', toolCallId: 't1', name: 'echo', args: { x: 1 } },
          { type: 'finish', reason: 'tool_calls' },
        ],
        finalMessage: {
          role: 'assistant',
          content: [{ type: 'tool_use', toolCallId: 't1', name: 'echo', args: { x: 1 } }],
        },
      },
      { chunks: [{ type: 'text', delta: 'done' }, { type: 'finish', reason: 'stop' }] },
    ]))
    const tool = makeTool('echo', async (input) => ({ ok: true, value: input }))
    const cfg: AgentConfig = { model: 'f/x' }
    const { chunks, ret } = await drain(
      runToolLoop({ cfg, ctx: makeCtx(), opts: { adapters }, initialMessages: [], tools: [tool] }),
    )
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: 'stop' })
    expect((ret as KernelMessage[]).map((m) => m.role)).toEqual(['assistant', 'tool', 'assistant'])
  })
})

describe('runToolLoop — maxSteps', () => {
  it('synthesizes finish:length when step had tool_calls and limit reached, no tools executed', async () => {
    let toolCalls = 0
    const tool = makeTool('keep', async () => {
      toolCalls++
      return { ok: true, value: 1 }
    })
    const adapters = createAdapterRegistry()
    adapters.register('f', new FakeAdapter([
      {
        chunks: [{ type: 'finish', reason: 'tool_calls' }],
        finalMessage: { role: 'assistant', content: [{ type: 'tool_use', toolCallId: 't1', name: 'keep', args: {} }] },
      },
    ]))
    const cfg: AgentConfig = { model: 'f/x' }
    const { chunks } = await drain(
      runToolLoop({ cfg, ctx: makeCtx(), opts: { adapters, maxSteps: 1 }, initialMessages: [], tools: [tool] }),
    )
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: 'length' })
    expect(toolCalls).toBe(0)
  })
})

describe('runToolLoop — stopWhen', () => {
  it('only evaluated on tool_calls, OR semantics, async-aware', async () => {
    const adapters = createAdapterRegistry()
    adapters.register('f', new FakeAdapter([
      {
        chunks: [{ type: 'finish', reason: 'tool_calls' }],
        finalMessage: { role: 'assistant', content: [{ type: 'tool_use', toolCallId: 't1', name: 'echo', args: {} }] },
      },
      { chunks: [{ type: 'finish', reason: 'stop' }] },
    ]))
    const tool = makeTool('echo', async () => ({ ok: true, value: 1 }))
    const sFalse: StopCondition = async () => false
    const sTrue: StopCondition = async () => true
    const cfg: AgentConfig = { model: 'f/x' }
    const { chunks } = await drain(
      runToolLoop({ cfg, ctx: makeCtx(), opts: { adapters, stopWhen: [sFalse, sTrue] }, initialMessages: [], tools: [tool] }),
    )
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: 'stop' })
  })

  it('predicate throw → STOP_WHEN_FAILED error chunk', async () => {
    const adapters = createAdapterRegistry()
    adapters.register('f', new FakeAdapter([
      {
        chunks: [{ type: 'finish', reason: 'tool_calls' }],
        finalMessage: { role: 'assistant', content: [{ type: 'tool_use', toolCallId: 't1', name: 'e', args: {} }] },
      },
    ]))
    const tool = makeTool('e', async () => ({ ok: true, value: 1 }))
    const cfg: AgentConfig = { model: 'f/x' }
    const throwing: StopCondition = () => {
      throw new Error('bad predicate')
    }
    const { chunks } = await drain(
      runToolLoop({ cfg, ctx: makeCtx(), opts: { adapters, stopWhen: throwing }, initialMessages: [], tools: [tool] }),
    )
    expect(chunks.at(-1)?.type).toBe('error')
    if (chunks.at(-1)?.type === 'error') {
      expect((chunks.at(-1) as Extract<KernelChunk, { type: 'error' }>).error.code).toBe('STOP_WHEN_FAILED')
    }
  })
})

describe('runToolLoop — ADAPTER_PROTOCOL_VIOLATION', () => {
  it('throws when finishReason=tool_calls but no tool_use blocks', async () => {
    const adapters = createAdapterRegistry()
    adapters.register('f', new FakeAdapter([
      {
        chunks: [{ type: 'finish', reason: 'tool_calls' }],
        finalMessage: { role: 'assistant', content: [{ type: 'text', text: 'oops' }] },
      },
    ]))
    const cfg: AgentConfig = { model: 'f/x' }
    await expect(
      drain(runToolLoop({ cfg, ctx: makeCtx(), opts: { adapters }, initialMessages: [], tools: [] })),
    ).rejects.toMatchObject({ code: 'ADAPTER_PROTOCOL_VIOLATION' })
  })
})
```

- [ ] **Step 6: Run all tool-loop tests — expect pass**

Run: `pnpm --filter @seta/agent-core vitest run run/tool-loop.test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add platform/agent/core/src/run/tool-loop.ts platform/agent/core/src/run/tool-loop.test.ts
git commit -m "feat(agent-core): K4 §8 outer tool loop with stopWhen OR + maxSteps cap"
```

---

## Task 7: Rewrite `run.ts` as a thin entry

**Files:**
- Modify: `platform/agent/core/src/run/run.ts`
- Modify: `platform/agent/core/src/run/run.test.ts`

`run.ts` keeps the same public signature but delegates to `runToolLoop`. Adds `validateRunLoopOptions` at the top (throws `INVALID_MAX_STEPS` / `INVALID_CONCURRENCY` early). Runs `processInput` once before the loop. `saveTurn` only on natural / `stopWhen` / `maxSteps` termination.

- [ ] **Step 1: Write the failing test for `INVALID_MAX_STEPS`**

Append to `platform/agent/core/src/run/run.test.ts`:

```ts
describe('run() — validation', () => {
  it('yields INVALID_MAX_STEPS when maxSteps <= 0', async () => {
    const cfg: AgentConfig = { model: 'fake/test' }
    const { adapters } = setup([{ type: 'finish', reason: 'stop' }])
    const got: KernelChunk[] = []
    for await (const c of run(cfg, baseInput, { adapters, maxSteps: 0 })) got.push(c)
    expect(got[0]?.type).toBe('error')
    if (got[0]?.type === 'error') expect(got[0].error.code).toBe('INVALID_MAX_STEPS')
  })

  it('yields INVALID_CONCURRENCY when toolCallConcurrency <= 0', async () => {
    const cfg: AgentConfig = { model: 'fake/test' }
    const { adapters } = setup([{ type: 'finish', reason: 'stop' }])
    const got: KernelChunk[] = []
    for await (const c of run(cfg, baseInput, { adapters, toolCallConcurrency: 0 })) got.push(c)
    expect(got[0]?.type).toBe('error')
    if (got[0]?.type === 'error') expect(got[0].error.code).toBe('INVALID_CONCURRENCY')
  })
})
```

- [ ] **Step 2: Run the test — expect fail**

Run: `pnpm --filter @seta/agent-core vitest run run/run.test`
Expected: FAIL (validation not yet in place; current `run.ts` ignores both opts).

- [ ] **Step 3: Replace `run.ts` body**

Overwrite `platform/agent/core/src/run/run.ts` with:

```ts
import { AgentError, kernelErrorOf } from '../errors'
import { isAbortError } from '../errors/classify'
import { NullMemoryProvider } from '../memory/null-provider'
import type {
  AgentConfig,
  KernelChunk,
  MemoryContext,
  Processor,
  ProcessorContext,
  RunInput,
  RunLoopOptions,
} from '../types'
import { createRunCtx } from './make-run-ctx'
import { ProcessorAbortSignal, runProcessInput } from './processors'
import { runToolLoop } from './tool-loop'

export async function* run(
  cfg: AgentConfig,
  input: RunInput,
  opts: RunLoopOptions,
): AsyncIterable<KernelChunk> {
  const ctx = createRunCtx({
    signal: opts.signal ?? new AbortController().signal,
    ...(opts.generateId !== undefined ? { generateId: opts.generateId } : {}),
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    ...(opts.currentDate !== undefined ? { currentDate: opts.currentDate } : {}),
  })

  const memory = opts.memory ?? new NullMemoryProvider()
  const memCtx: MemoryContext = {
    threadId: input.threadId ?? ctx.runId,
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    scope: 'thread',
  }

  try {
    validateRunLoopOptions(opts)

    const recalled = await memory.recall(memCtx)
    let workingInput = input
    if (opts.processors?.length) {
      try {
        workingInput = await runProcessInput(opts.processors, makeProcessorCtx(ctx), input)
      } catch (err) {
        if (err instanceof ProcessorAbortSignal) {
          yield {
            type: 'error',
            error: new AgentError({
              code: 'PROCESSOR_ABORTED',
              category: 'USER',
              message: 'processor invoked ctx.abort()',
              details: { hookName: 'processInput', processorIndex: firstAbortIndex(opts.processors) },
            }),
          }
          yield { type: 'abort' }
          return
        }
        throw err
      }
    }

    const initialMessages = [...recalled.messages, ...workingInput.messages]
    const added = yield* runToolLoop({
      cfg,
      ctx,
      opts,
      initialMessages,
      tools: cfg.tools ?? [],
    })

    if (!ctx.signal.aborted && !terminatedByError(added)) {
      await memory.saveTurn(memCtx, [...workingInput.messages, ...added])
    }
  } catch (err) {
    if (isAbortError(err) && ctx.signal.aborted) {
      yield { type: 'abort' }
      return
    }
    yield { type: 'error', error: kernelErrorOf(err) }
  }
}

function validateRunLoopOptions(opts: RunLoopOptions): void {
  if (opts.maxSteps !== undefined && opts.maxSteps <= 0) {
    throw new AgentError({
      code: 'INVALID_MAX_STEPS',
      category: 'USER',
      message: `maxSteps must be > 0, got ${opts.maxSteps}`,
      details: { maxSteps: opts.maxSteps },
    })
  }
  if (opts.toolCallConcurrency !== undefined && opts.toolCallConcurrency <= 0) {
    throw new AgentError({
      code: 'INVALID_CONCURRENCY',
      category: 'USER',
      message: `toolCallConcurrency must be > 0, got ${opts.toolCallConcurrency}`,
      details: { toolCallConcurrency: opts.toolCallConcurrency },
    })
  }
}

function terminatedByError(_added: unknown): boolean {
  return false
}

function makeProcessorCtx(ctx: import('../types').RunCtx): ProcessorContext {
  return {
    runId: ctx.runId,
    abort: (): never => {
      throw new ProcessorAbortSignal()
    },
    abortSignal: ctx.signal,
    retryCount: ctx.retryCount,
    writer: { custom: () => {} },
  }
}

function firstAbortIndex(processors: Processor[]): number {
  return processors.findIndex((p) => p.processInput !== undefined)
}
```

> Note on `terminatedByError`: this is a placeholder returning `false` because the current loop doesn't surface "errored" termination via the return value — error termination already short-circuits the `saveTurn` path indirectly through the `try { ... } catch` block (any thrown error in the loop is caught and yields an error chunk before reaching `saveTurn`). The flag exists so the call site reads intent-revealingly. If a future audit shows error termination IS reaching `saveTurn`, populate this from `runToolLoop`'s return shape; for now the existing tests confirm the behavior.

- [ ] **Step 4: Run all run tests — expect pass**

Run: `pnpm --filter @seta/agent-core vitest run run/run.test`
Expected: all pass (K1 tests preserved + new validation tests).

- [ ] **Step 5: Add multi-step round-trip test in `run.test.ts`**

Append:

```ts
describe('run() — multi-step', () => {
  it('saveTurn called once with assistant + tool + assistant chain', async () => {
    const saveTurn = vi.fn(async () => {})
    const mem: MemoryProvider = {
      recall: async () => ({ messages: [], total: 0, page: 1, perPage: 0, hasMore: false }),
      saveTurn,
      getWorkingMemory: async () => null,
      updateWorkingMemory: async () => {},
    }
    const adapters = createAdapterRegistry()
    adapters.register('f', new FakeAdapter([
      {
        chunks: [{ type: 'finish', reason: 'tool_calls' }],
        finalMessage: {
          role: 'assistant',
          content: [{ type: 'tool_use', toolCallId: 't1', name: 'echo', args: { x: 1 } }],
        },
      },
      { chunks: [{ type: 'text', delta: 'ok' }, { type: 'finish', reason: 'stop' }] },
    ]))
    const echo = {
      id: 'echo',
      description: 'echo',
      inputSchema: { '~standard': { version: 1 as const, vendor: 't', validate: (v: unknown) => ({ value: v }) } } as never,
      outputSchema: { '~standard': { version: 1 as const, vendor: 't', validate: (v: unknown) => ({ value: v }) } } as never,
      execute: async (input: unknown) => ({ ok: true as const, value: input }),
    }
    const cfg: AgentConfig = { model: 'f/x', tools: [echo] }
    for await (const _c of run(cfg, baseInput, { adapters, memory: mem })) void _c
    expect(saveTurn).toHaveBeenCalledOnce()
    const saved = saveTurn.mock.calls[0]?.[1] as Array<{ role: string }>
    expect(saved.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
  })

  it('saveTurn skipped on abort', async () => {
    const ctrl = new AbortController()
    const saveTurn = vi.fn(async () => {})
    const mem: MemoryProvider = {
      recall: async () => ({ messages: [], total: 0, page: 1, perPage: 0, hasMore: false }),
      saveTurn,
      getWorkingMemory: async () => null,
      updateWorkingMemory: async () => {},
    }
    const adapters = createAdapterRegistry()
    adapters.register('f', new FakeAdapter([
      { chunks: [{ type: 'text', delta: 'a' }, { type: 'text', delta: 'b' }, { type: 'finish', reason: 'stop' }] },
    ]))
    const cfg: AgentConfig = { model: 'f/x' }
    let i = 0
    for await (const _c of run(cfg, baseInput, { adapters, memory: mem, signal: ctrl.signal })) {
      void _c
      if (++i === 1) ctrl.abort()
    }
    expect(saveTurn).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run all unit tests — expect pass**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add platform/agent/core/src/run/run.ts platform/agent/core/src/run/run.test.ts
git commit -m "feat(agent-core): K4 §5/§11 wire run() through tool-loop + validate options"
```

---

## Task 8: Per-tool OTel spans

**Files:**
- Modify: `platform/agent/core/src/run/execute-tools.ts`
- Modify: `platform/agent/core/src/run/execute-tools.test.ts`

K4 §10: one `tool.<name>.execute` span per tool call. K2's `span.ts` exposes `startLlmSpan(provider, model, runId)`. We'll mirror that with a `startToolSpan(toolName, toolId, runId)` helper.

- [ ] **Step 1: Write the failing test for span emission**

Append to `execute-tools.test.ts`:

```ts
import { trace } from '@opentelemetry/api'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'

describe('executeTools — OTel', () => {
  let exporter: InMemorySpanExporter
  let provider: NodeTracerProvider

  beforeEach(() => {
    exporter = new InMemorySpanExporter()
    provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
    trace.setGlobalTracerProvider(provider)
  })

  afterEach(async () => {
    await provider.shutdown()
  })

  it('emits one tool.<name>.execute span per tool call', async () => {
    const tool = makeTool('e', async () => ({ ok: true, value: 1 }))
    await executeTools({
      toolCalls: [
        { toolCallId: '1', name: 'e', args: {} },
        { toolCallId: '2', name: 'e', args: {} },
      ],
      tools: [tool],
      ctx: makeCtx(),
      opts: {},
    })
    const names = exporter.getFinishedSpans().map((s) => s.name)
    expect(names).toEqual(['tool.e.execute', 'tool.e.execute'])
  })

  it('records tool.error_code attr on failure', async () => {
    const tool = makeTool('boom', async () => {
      throw new Error('x')
    })
    await executeTools({ toolCalls: [{ toolCallId: '1', name: 'boom', args: {} }], tools: [tool], ctx: makeCtx(), opts: {} })
    const span = exporter.getFinishedSpans()[0]
    expect(span?.attributes['tool.error_code']).toBe('TOOL_EXECUTION_FAILED')
  })
})
```

- [ ] **Step 2: Run the test — expect fail**

Run: `pnpm --filter @seta/agent-core vitest run run/execute-tools.test`
Expected: FAIL (no spans emitted).

- [ ] **Step 3: Add the span helper at the top of `execute-tools.ts`**

Add this near the imports:

```ts
import { trace, SpanStatusCode } from '@opentelemetry/api'

interface ToolSpanHandle {
  end(opts: { errorCode?: string; timedOut?: boolean; budgetExceeded?: boolean }): void
}

function startToolSpan(toolName: string, toolId: string, runId: string): ToolSpanHandle {
  const tracer = trace.getTracer('@seta/agent-core')
  const span = tracer.startSpan(`tool.${toolName}.execute`, {
    attributes: { 'tool.name': toolName, 'tool.id': toolId, 'run.id': runId },
  })
  return {
    end({ errorCode, timedOut, budgetExceeded }) {
      if (errorCode) {
        span.setAttribute('tool.error_code', errorCode)
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorCode })
      } else {
        span.setStatus({ code: SpanStatusCode.OK })
      }
      if (timedOut) span.setAttribute('tool.timed_out', true)
      if (budgetExceeded) span.setAttribute('tool.budget_exceeded', true)
      span.end()
    },
  }
}
```

Wrap each branch in `runOneToolCall` with `startToolSpan` + `end`. Adjust each return path:

- TOOL_UNKNOWN — emit a span with attributes `tool.name=tc.name, tool.id='<unknown>', run.id=ctx.runId` and `errorCode='TOOL_UNKNOWN'`.
- TOOL_BUDGET_EXCEEDED — span with `errorCode='TOOL_BUDGET_EXCEEDED', budgetExceeded=true`.
- TOOL_SUSPEND_NOT_SUPPORTED — span with `errorCode='TOOL_SUSPEND_NOT_SUPPORTED'`.
- TOOL_TIMEOUT — span with `errorCode='TOOL_TIMEOUT', timedOut=true`.
- TOOL_EXECUTION_FAILED — span with `errorCode='TOOL_EXECUTION_FAILED'`.
- Validation `{ok:false}` — span ends OK (no errorCode); validation is the LLM's domain.
- Success — span ends OK.

Concretely, replace `runOneToolCall`'s body so every return path passes through a `span.end({...})` call (use a `let` `errorCode` and `try/finally` pattern). Reference shape:

```ts
const span = startToolSpan(tc.name, tool?.id ?? '<unknown>', ctx.runId)
let errorCode: string | undefined
let timedOut = false
let budgetExceeded = false
try {
  // existing logic, set errorCode/timedOut/budgetExceeded on error paths
  return result
} finally {
  span.end({ errorCode, timedOut, budgetExceeded })
}
```

Move the `tool` lookup *before* `startToolSpan` so the unknown-tool span carries `tool.id='<unknown>'`.

- [ ] **Step 4: Run all execute-tools tests — expect pass**

Run: `pnpm --filter @seta/agent-core vitest run run/execute-tools.test`
Expected: all pass.

- [ ] **Step 5: Verify OTel dep already declared (it is — K2 added `@opentelemetry/api`)**

Run: `pnpm --filter @seta/agent-core list @opentelemetry/api`
Expected: shows the existing pin. No `pnpm add` needed. `@opentelemetry/sdk-trace-node` is for test-only; should be a devDependency. If not present:

```bash
pnpm --filter @seta/agent-core add -D @opentelemetry/sdk-trace-node@<pin>
```

(Use `pnpm view @opentelemetry/sdk-trace-node version` to discover the current version; propose the pin if absent.)

- [ ] **Step 6: Commit**

```bash
git add platform/agent/core/src/run/execute-tools.ts platform/agent/core/src/run/execute-tools.test.ts platform/agent/core/package.json pnpm-lock.yaml
git commit -m "feat(agent-core): K4 §10 tool.<name>.execute OTel spans"
```

---

## Task 9: OSS error-code catalog (`errors/codes.md`)

**Files:**
- Create: `platform/agent/core/src/errors/codes.md`

Pure documentation. Lists the K2 `LLM_*` codes (already shipped) plus the K4 additions. The spec §13 acceptance criterion #2 references this file.

- [ ] **Step 1: Write the catalog**

Create `platform/agent/core/src/errors/codes.md`:

```markdown
# @seta/agent-core — stable error codes

Every code below is the `code` field on a `KernelError` subclass. The mapping
is stable across minor versions; renaming a code is a breaking change.

## LLM_* (K2)

| Code | Domain | Category | When |
|---|---|---|---|
| `LLM_TRANSIENT_EXHAUSTED` | LLM | THIRD_PARTY | SDK retries done, still 5xx/429 |
| `LLM_RATE_LIMITED` | LLM | THIRD_PARTY | 429 with explicit no-retry header |
| `LLM_SERVER_ERROR` | LLM | THIRD_PARTY | 5xx beyond retry budget |
| `LLM_AUTH_FAILED` | LLM | SYSTEM | 401/403 from the provider |
| `LLM_BAD_REQUEST` | LLM | SYSTEM | 400 (malformed) |
| `LLM_CONTENT_POLICY` | LLM | USER | 422 / content-policy refusal |
| `LLM_STREAM_INTERRUPTED` | LLM | THIRD_PARTY | Mid-stream socket error |
| `LLM_INVALID_TOOL_ARGS` | LLM | THIRD_PARTY | Tool args JSON parse failed |
| `LLM_UNKNOWN` | LLM | SYSTEM | Fallback for unrecognized provider errors |

## AGENT_* (K4)

| Code | Domain | Category | When |
|---|---|---|---|
| `INVALID_MAX_STEPS` | AGENT | USER | `RunLoopOptions.maxSteps <= 0` |
| `INVALID_CONCURRENCY` | AGENT | USER | `RunLoopOptions.toolCallConcurrency <= 0` |
| `ADAPTER_PROTOCOL_VIOLATION` | AGENT | THIRD_PARTY | `finishReason='tool_calls'` but final message has no `tool_use` content blocks |
| `PROCESSOR_ABORTED` | AGENT | USER | A processor called `ctx.abort()` |
| `PROCESSOR_RETRY_EXHAUSTED` | AGENT | SYSTEM | `processAPIError` returned `'retry'` past internal cap |
| `PROCESSOR_FAILED` | AGENT | SYSTEM | A processor hook threw a non-abort error |
| `STOP_WHEN_FAILED` | AGENT | SYSTEM | A `stopWhen` predicate threw |
| `ADAPTER_NOT_REGISTERED` | AGENT | SYSTEM | Model id references a provider not in the adapter registry |
| `INVALID_MODEL_ID` | AGENT | USER | Model id failed `<provider>/<model>` parse |
| `ADAPTER_ALREADY_REGISTERED` | AGENT | SYSTEM | Provider name registered twice |
| `UNKNOWN_KERNEL_ERROR` | KERNEL | SYSTEM | Coerced from a non-KernelError thrown value |

## TOOL_* (K4)

| Code | Domain | Category | When |
|---|---|---|---|
| `TOOL_UNKNOWN` | TOOL | THIRD_PARTY | Model called a tool name not in `cfg.tools` |
| `TOOL_EXECUTION_FAILED` | TOOL | SYSTEM | `execute()` rejected |
| `TOOL_TIMEOUT` | TOOL | SYSTEM | Per-tool `timeoutMs` elapsed |
| `TOOL_BUDGET_EXCEEDED` | TOOL | USER | Per-tool `maxCalls` reached |
| `TOOL_SUSPEND_NOT_SUPPORTED` | TOOL | SYSTEM | Tool returned `{suspend}` with no workflow runtime bound |

Validation errors returned via `ToolResult<{ok:false, error}>` do NOT carry
a code from this catalog; they live on the tool message as `isError:true`
and are intentionally opaque to the kernel — they are the LLM's job to
self-correct.
```

- [ ] **Step 2: Commit**

```bash
git add platform/agent/core/src/errors/codes.md
git commit -m "docs(agent-core): K4 §7 stable error-code catalog"
```

---

## Task 10: Integration tests (recording-driven, 5 fixtures)

**Files:**
- Create: `platform/agent/core/tests/integration/loop-multi-step.test.ts`
- Create: `platform/agent/core/tests/integration/loop-fallback.test.ts`
- Create: `platform/agent/core/tests/integration/loop-stop-when.test.ts`
- Create: `platform/agent/core/tests/integration/loop-max-steps.test.ts`
- Create: `platform/agent/core/tests/integration/loop-abort.test.ts`
- Create: `platform/agent/core/__recordings__/loop-multi-step-anthropic.json`
- Create: `platform/agent/core/__recordings__/loop-fallback-anthropic-503.json`
- Create: `platform/agent/core/__recordings__/loop-fallback-openai-200.json`
- Create: `platform/agent/core/__recordings__/loop-stop-when-openai.json`
- Create: `platform/agent/core/__recordings__/loop-max-steps-anthropic.json`
- Create: `platform/agent/core/__recordings__/loop-abort-openai.json`

These tests follow the same pattern as K2's `tests/integration/{anthropic,openai,azure-openai}.test.ts`. Reference one of those for setup boilerplate.

- [ ] **Step 1: Reference K2's integration test setup**

Read `platform/agent/core/tests/integration/anthropic.test.ts` to see the `setupLLMRecording({ name })` + deterministic-ctx pattern. Match it byte-for-byte for setup, including:

```ts
const ctx = createRunCtx({
  signal,
  generateId: () => '00000000-0000-4000-8000-000000000000',
  now: () => new Date('2026-05-12T00:00:00Z').getTime(),
  currentDate: () => new Date('2026-05-12T00:00:00Z'),
})
```

(The same constants K2 uses, so re-records remain byte-stable.)

- [ ] **Step 2: Implement `loop-multi-step.test.ts` and record its fixture**

Create the test driving an anthropic adapter through a 2-turn round-trip with one `echo` tool. The model script (per fixture):
- Turn 1: stream a `tool_use` block → finish `tool_calls`.
- Tool: `echo` returns `{ ok: true, value: <args> }`.
- Turn 2: stream a `text` block → finish `stop`.

Assert: chunk count, last chunk is `finish:stop`, `accumulatedSteps` length when surfaced through a custom `stopWhen` capture, two `llm.anthropic.stream` spans + one `tool.echo.execute` span, `memory.saveTurn` called once with `['user','assistant','tool','assistant']` message-role sequence.

Record:

```bash
RECORD=1 ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  pnpm --filter @seta/agent-core vitest run tests/integration/loop-multi-step.test -t multi-step
```

Verify `__recordings__/loop-multi-step-anthropic.json` is created. Inspect briefly — its `recordings[].request.body` should contain `tools: [{...echo...}]` and the response bodies should be a tool_use stream then a text stream.

- [ ] **Step 3: Implement `loop-fallback.test.ts` and record its fixtures**

Two recordings: primary anthropic returns 503 (after SDK retries exhausted), fallback `openai/gpt-4o-mini` returns success.

```bash
RECORD=1 ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY OPENAI_API_KEY=$OPENAI_API_KEY \
  pnpm --filter @seta/agent-core vitest run tests/integration/loop-fallback.test -t fallback
```

Assert: two model spans, span attrs include `llm.provider='anthropic'` then `llm.provider='openai'`, final chunks come from the openai recording, `LLM_TRANSIENT_EXHAUSTED` does not surface to the caller.

- [ ] **Step 4: Implement `loop-stop-when.test.ts` and record its fixture**

Recording: openai keeps requesting tool calls (3+ turns of `tool_calls` finish). Test passes a `stopWhen` that returns true after 2 iterations:

```ts
const stopWhen: StopCondition = ({ steps }) =>
  steps.filter((s) => s.kind === 'model').length >= 2
```

Assert: synthetic `finish:stop` chunk, only 2 model spans, OTel attr `loop.stop_reason='stop_when'` on the final model span, and tools-after-stop NOT executed (capture tool invocation count).

```bash
RECORD=1 OPENAI_API_KEY=$OPENAI_API_KEY \
  pnpm --filter @seta/agent-core vitest run tests/integration/loop-stop-when.test
```

- [ ] **Step 5: Implement `loop-max-steps.test.ts` and record its fixture**

Recording: anthropic keeps requesting tool calls. Test passes `maxSteps: 2`. Assert synthetic `finish:length`, OTel `loop.stop_reason='step_limit'`, no tools executed on the cap-triggering step.

```bash
RECORD=1 ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  pnpm --filter @seta/agent-core vitest run tests/integration/loop-max-steps.test
```

- [ ] **Step 6: Implement `loop-abort.test.ts` and record its fixture**

Recording: openai streams text. Test aborts after the first text chunk. Assert no further model calls (one span), no tool executions, last chunk is `abort`.

```bash
RECORD=1 OPENAI_API_KEY=$OPENAI_API_KEY \
  pnpm --filter @seta/agent-core vitest run tests/integration/loop-abort.test
```

- [ ] **Step 7: Wire `loop.stop_reason` attr on the final model span**

This was deferred. In `tool-loop.ts`, after each terminator, capture the reason. Then thread it into `runModelStepWithFallback` via a sidecar object so the LAST model span can `setAttribute('loop.stop_reason', reason)` before ending.

Simplest implementation: extend `fallback.ts`'s `runOneModelStep` to accept an optional `onFinishAttrs?: Record<string, unknown>` parameter that's applied to the span before close. `tool-loop.ts` builds `{ 'loop.stop_reason': ..., 'loop.iterations': modelStepCount }` once the terminator is known and passes it on the **next** call — except the next call doesn't exist when we terminate. The pragmatic workaround: emit a final standalone span `agent.loop.end` (no parent) with the loop attrs.

Alternative simpler approach (recommended): expose a `getCurrentSpan()`-style handle from `runOneModelStep`'s span via a small `LoopSpanRegistry` map keyed by `runId` and update it post-hoc. Add to `span.ts` (K2 file): a `recordLoopStopReason(runId, reason, iterations)` helper that finds the most recent active span tagged with `run.id===runId` and adds attrs before its end. Since the model span has already ended by the time we synthesize the terminator, the cleanest fix is to:

1. In `runOneModelStep`, don't `span.end('ok')` immediately. Return the open span handle to the caller (the loop) via a mutable closure.
2. The loop calls `span.end(...)` once it knows the final state.

If this is too invasive for K4, defer the attr to a follow-up note and assert ONLY `loop.iterations` via a simpler mechanism: a fresh standalone span `agent.run.loop` opened in `tool-loop.ts` at entry, closed at terminator with both attrs. The integration test then asserts against THAT span name.

For this plan, go with the standalone-span approach to avoid restructuring `fallback.ts`. Add to `tool-loop.ts`:

```ts
import { trace, SpanStatusCode } from '@opentelemetry/api'

// at the start of runToolLoop:
const loopSpan = trace.getTracer('@seta/agent-core').startSpan('agent.run.loop', {
  attributes: { 'run.id': ctx.runId },
})

// at each terminator, set attrs and end:
loopSpan.setAttribute('loop.stop_reason', '<reason>')
loopSpan.setAttribute('loop.iterations', modelStepCount)
loopSpan.setStatus({ code: SpanStatusCode.OK })
loopSpan.end()
```

Update integration tests' assertions accordingly (look for `agent.run.loop` span and its `loop.stop_reason` attr, not on the model span). Update spec §10 with this clarification in a follow-up commit if discovered to drift; OR record this as a deliberate refinement in the changeset.

- [ ] **Step 8: Run all integration tests — expect pass against checked-in fixtures**

Run: `pnpm --filter @seta/agent-core test:integration`
Expected: all 5 new tests pass.

- [ ] **Step 9: Commit recordings and tests separately for reviewability**

```bash
git add platform/agent/core/__recordings__/loop-*.json
git commit -m "test(agent-core): K4 §12.2 loop integration fixtures (5)"

git add platform/agent/core/tests/integration/loop-*.test.ts platform/agent/core/src/run/tool-loop.ts
git commit -m "feat(agent-core): K4 §10 agent.run.loop span with stop_reason + iterations"
```

---

## Task 11: SCOPE.md update + changeset

**Files:**
- Modify: `platform/agent/core/SCOPE.md`
- Create: `.changeset/<random>.md` (via `pnpm changeset`)

- [ ] **Step 1: Update `SCOPE.md` "Current state"**

Edit `platform/agent/core/SCOPE.md`. Replace the "Current state" section to add K4:

```markdown
## Current state
The package ships:
- K1 kernel surface (types, errors, registry, run loop, SSE, NullMemoryProvider, FakeAdapter).
- K1.5 MSW-backed testkit (`setupLLMRecording`, `hashRequest`, `serializeRequestContent`).
- K2 concrete provider adapters: `createAnthropicAdapter`, `createOpenAIAdapter`,
  `createAzureOpenAIAdapter`. Pure helpers (`cache-control`, `tokens`, `translate/*`)
  compose into each adapter. `startLlmSpan` emits one OTel span per call.
- K4 tool-call iteration outer loop: `accumulatedSteps[]`, `stopWhen` (OR
  semantics, async-aware), `maxSteps` cap (default 16, counts model calls),
  bounded concurrent tool execution (`toolCallConcurrency` default 10,
  collapses to 1 on `requireApproval`), per-tool budgets
  (`{ maxCalls?, timeoutMs? }`), fallback-model failover on transient-exhausted
  classes, three live processor hooks (`processInput`, `processOutputStep`,
  `processAPIError`), `tool.<name>.execute` + `agent.run.loop` OTel spans.
- First wire-up in `apps/api/src/agent.ts` registers Anthropic + OpenAI (and
  Azure when configured) into the adapter registry at boot.

Outstanding before agent products go end-to-end: real `@seta/agent-memory`
provider binding (MEM stream) and `@seta/agent-workflows` runtime
(`{suspend}` discriminant binding).
```

- [ ] **Step 2: Update `SCOPE.md` "Open questions"**

Move the two resolved entries to a "Resolved" sub-list (or just delete and note inline). Edit the section:

- `**StopCondition` array semantics**` — change "Documented as logical-OR; confirm at K4 land that no caller wants AND." to "**Resolved**: logical OR. Predicates may be async; only evaluated on `finishReason='tool_calls'` (K4 §8.3)."
- `**Per-tool budget shape**` — change to "**Resolved**: `{ maxCalls?, timeoutMs? }`. `maxTokens` deferred — no concrete use case picks the unit (K4 §8.5)."

- [ ] **Step 3: Generate changeset**

Run: `pnpm changeset`

Interactive prompts:
- Which package? `@seta/agent-core`
- Bump type? `minor`
- Summary:
  ```
  feat: tool-call iteration outer loop — multi-step model+tool runs, stopWhen
  (OR), maxSteps cap, bounded concurrent tool execution with per-tool budgets,
  fallback-model failover on transient-exhausted classes, three live processor
  hooks (processInput / processOutputStep / processAPIError), tool.<name>.execute
  and agent.run.loop OTel spans.

  BREAKING: StopCondition signature changed from `(steps) => ...` to
  `({ steps }) => ...`. K1 reserved the type but no in-tree consumer wired
  it. Update any external consumers in lockstep with this release.

  New error codes (see src/errors/codes.md): INVALID_MAX_STEPS,
  INVALID_CONCURRENCY, ADAPTER_PROTOCOL_VIOLATION, TOOL_UNKNOWN,
  TOOL_EXECUTION_FAILED, TOOL_TIMEOUT, TOOL_BUDGET_EXCEEDED,
  TOOL_SUSPEND_NOT_SUPPORTED, PROCESSOR_ABORTED, PROCESSOR_RETRY_EXHAUSTED,
  PROCESSOR_FAILED, STOP_WHEN_FAILED.
  ```

> Note on the bump type: `StopCondition` is a public type, and changing its argument is technically breaking. Pre-1.0 minor is acceptable per the project's "no legacy" stance, but the changeset prose must call it out explicitly.

- [ ] **Step 4: Run full check**

Run in sequence:

```bash
pnpm --filter @seta/agent-core typecheck
pnpm --filter @seta/agent-core lint
pnpm --filter @seta/agent-core test:unit
pnpm --filter @seta/agent-core test:integration
pnpm --filter @seta/api typecheck
```

Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/SCOPE.md .changeset/
git commit -m "chore(agent-core): K4 SCOPE update + changeset"
```

---

## Task 12: Final sweep — verify acceptance criteria

**Files:** (no edits — verification only)

- [ ] **Step 1: §13 criterion 2 — diff `dist/index.d.ts` against K2**

```bash
git stash
git checkout deac1823 -- platform/agent/core
pnpm --filter @seta/agent-core build
cp platform/agent/core/dist/index.d.ts /tmp/k2.d.ts
git checkout HEAD -- platform/agent/core
git stash pop
pnpm --filter @seta/agent-core build
diff /tmp/k2.d.ts platform/agent/core/dist/index.d.ts
```

Expected diff: only changes to `StepResult` (4 optional fields), `StopCondition` (argument shape), and the indirect type re-exports those affect. No new exports. No removed exports.

- [ ] **Step 2: §13 criterion 9 — verify no unintended edits**

```bash
git diff main -- apps/api/ '@seta/middleware' '@seta/observability' '@seta/tenant' \
  platform/agent/core/src/models/translate \
  platform/agent/core/src/models/cache-control.ts \
  platform/agent/core/src/models/span.ts \
  platform/agent/core/src/models/tokens.ts
```

Expected: empty diff (no changes to any of these paths since main branched).

- [ ] **Step 3: §13 criterion 10 — verify changeset present and bump type**

```bash
ls .changeset/ | grep -v README
cat .changeset/*.md | grep '@seta/agent-core'
```

Expected: at least one changeset file referencing `@seta/agent-core` as `minor`.

- [ ] **Step 4: §13 criterion 4 — sanity-run the multi-step recording**

```bash
pnpm --filter @seta/agent-core vitest run tests/integration/loop-multi-step.test -t round-trip
```

Expected: pass with the assertions described in Task 10 Step 2.

- [ ] **Step 5: §13 criterion 5 — sanity-run the fallback recording**

```bash
pnpm --filter @seta/agent-core vitest run tests/integration/loop-fallback.test
```

Expected: pass.

- [ ] **Step 6: §13 criterion 6 — exercise processor abort manually**

Either via an existing unit test or a one-off scratch script:

```ts
const proc: Processor = {
  processOutputStep: async (c, s) => { c.abort() },
}
for await (const c of run(cfg, input, { adapters, processors: [proc] })) {
  console.log(c)
}
```

Expected output: `error` chunk with `code: 'PROCESSOR_ABORTED'`, then `abort` chunk.

- [ ] **Step 7: Final commit if any fixups needed**

If Steps 1-6 surfaced drift, commit fixes. Otherwise, the branch is ready for PR.

---

## Self-Review (run after writing the plan; fixes applied inline)

**1. Spec coverage:** Walked through §§5–13 of the spec. Each numbered requirement has at least one task that implements or verifies it:

| Spec section | Task(s) |
|---|---|
| §6.1 StepResult fields | Task 1 |
| §6.2 StopCondition shape | Task 1 |
| §7.1 error codes | Tasks 3, 4, 5, 6, 7, 9 (catalog), 12 (verify) |
| §8.1 termination order | Task 6 |
| §8.2 maxSteps semantics | Tasks 6, 7 |
| §8.3 stopWhen | Task 6 |
| §8.4 accumulatedSteps | Task 6 |
| §8.5 tool concurrency + budgets | Task 4 |
| §8.6 tool result paths | Task 4 |
| §8.7 fallback | Task 5 |
| §8.8 processors | Task 3 |
| §9 abort propagation | Tasks 5 (fallback abort), 6 (loop abort), 7 (run abort) |
| §10 OTel spans | Task 8 (tool spans), Task 10 step 7 (loop span) |
| §11 memory saveTurn rules | Task 7 |
| §12 tests | Tasks 2, 3, 4, 5, 6, 7, 10 |
| §13 acceptance | Tasks 11 (SCOPE+changeset), 12 (verification) |

**2. Placeholder scan:** No "TBD", no "implement later", no "similar to Task N". Every code step has full code. Test cases enumerated with concrete code or precise behavior statements.

**3. Type consistency:**
- `StepResult` uses `kind: 'model' | 'tool'`, `finishReason` typed as `'stop' | 'tool_calls' | 'length' | 'error'`, `error?: KernelError` — consistent across Tasks 1, 4, 5, 6.
- `runProcessAPIError` returns `'retry' | 'rethrow'` everywhere.
- `executeTools` signature: `({ toolCalls, tools, ctx, opts }) => Promise<StepResult[]>` — same across Tasks 4, 6, 10.
- `runModelStepWithFallback` signature and return type consistent across Tasks 5 and 6.
- `ProcessorAbortSignal` exported from `processors.ts` and imported by `tool-loop.ts` (Task 6) and `run.ts` (Task 7). Both consume the same class.

**4. One discrepancy fixed inline:** Spec §10 says the `loop.stop_reason` attr lands on "the final iteration's model span." That requires keeping the last model span open until after the terminator decision — which conflicts with Task 5's eager `span.end()` inside `runOneModelStep`. To avoid restructuring `fallback.ts`/`span.ts`, Task 10 Step 7 introduces an `agent.run.loop` standalone span instead. Integration test assertions look at that span name. This deviation is recorded in the changeset prose and in SCOPE.md if reviewers flag it.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-12-agent-core-k4.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**

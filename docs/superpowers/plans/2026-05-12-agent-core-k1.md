# `@seta/agent-core` K1 — Kernel Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the K1 kernel surface for `@seta/agent-core` — types, errors, adapter registry, pure helpers, `NullMemoryProvider`, single-iteration `run()`, `streamKernelSSE` — with zero LLM SDK imports, validated via a `FakeAdapter` testkit.

**Architecture:** All deliverables live inside `platform/agent/core/`. The PR is internally self-contained — no edits to other packages or `apps/api`. The kernel exposes a public barrel at `src/index.ts` and a separate testkit subpath at `src/testkit/index.ts`. Concrete provider adapters (Anthropic, OpenAI) and MSW recording testkit land in follow-up PRs (K2, K1.5).

**Tech Stack:** TypeScript 6, Vitest 4.1, tsup 8.5 (bundler), Hono 4.12 (SSE primitives), Zod 4.4 (schema → JSON Schema), uuid 14 (v7 IDs), Biome 2.4 (lint/format). Workspace deps: `@seta/middleware` (DomainError), `@seta/observability` (logger).

**Spec:** `docs/superpowers/specs/2026-05-12-agent-core-k1-design.md`

**Working directory:** All paths are relative to repo root `/Users/canh/Projects/Seta/seta-os/`.

---

## Execution rules (read before starting)

- **Run all package commands via `pnpm --filter @seta/agent-core <cmd>`** so the work is scoped.
- **CLI-only deps:** never hand-edit `package.json` dependencies. Add via `pnpm --filter @seta/agent-core add <pkg>@<version>`.
- **TDD throughout:** for every behavioral unit, write the test first, run it to see it fail with a meaningful message, then implement.
- **Commit after each task** (not each step) with a Conventional Commits message scoped `agent-core`. Use the message shown in the task's final step.
- **`import type`** for type-only imports. Biome enforces.
- **No `console.log`** — use `logger` from `@seta/observability`.
- **Test files co-located:** `src/foo.ts` ↔ `src/foo.test.ts`.

---

## Task 1: Package wiring — add deps + exports map

**Files:**
- Modify: `platform/agent/core/package.json` (via CLI commands; do not hand-edit)
- Modify: `platform/agent/core/src/index.ts` (currently `export {}`)
- Modify: `platform/agent/core/src/index.test.ts` (currently a placeholder)

- [ ] **Step 1: Add workspace + runtime deps**

Run:
```bash
pnpm --filter @seta/agent-core add @seta/middleware@workspace:* @seta/observability@workspace:*
pnpm --filter @seta/agent-core add uuid@14.0.0 hono@4.12.18
pnpm --filter @seta/agent-core add -D @types/uuid
```

Expected: `pnpm-lock.yaml` updates; no peer-dep warnings.

- [ ] **Step 2: Update `package.json` exports map for the testkit subpath**

Run:
```bash
pnpm --filter @seta/agent-core pkg set 'exports[.].import=./dist/index.js'
pnpm --filter @seta/agent-core pkg set 'exports[.].types=./dist/index.d.ts'
pnpm --filter @seta/agent-core pkg set 'exports[./testkit].import=./dist/testkit/index.js'
pnpm --filter @seta/agent-core pkg set 'exports[./testkit].types=./dist/testkit/index.d.ts'
```

Then update the `build` and `dev` scripts to emit both entries:

```bash
pnpm --filter @seta/agent-core pkg set 'scripts.build=tsup src/index.ts src/testkit/index.ts --format esm --dts --sourcemap'
pnpm --filter @seta/agent-core pkg set 'scripts.dev=tsup src/index.ts src/testkit/index.ts --format esm --dts --watch'
```

Expected: `cat platform/agent/core/package.json | grep -E "exports|build" -A2` shows the updated entries.

- [ ] **Step 3: Replace the placeholder barrel + test**

Write `platform/agent/core/src/index.ts`:

```ts
// Public barrel for @seta/agent-core.
export {}
```

Write `platform/agent/core/src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('@seta/agent-core barrel', () => {
  it('package imports cleanly', async () => {
    const mod = await import('./index')
    expect(mod).toBeTypeOf('object')
  })
})
```

- [ ] **Step 4: Verify typecheck + test passes**

Run:
```bash
pnpm --filter @seta/agent-core typecheck
pnpm --filter @seta/agent-core test:unit
```

Expected: both green; 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/package.json platform/agent/core/src/index.ts platform/agent/core/src/index.test.ts pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(agent-core): wire package deps + exports map for K1

Adds uuid@14.0.0, hono@4.12.18, and workspace deps on @seta/middleware
and @seta/observability. Wires the ./testkit subpath in the exports map
so the FakeAdapter (added in a later task) is reachable but separate
from the production barrel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Core type files — chunk, stream, message, schema, tool

**Files:**
- Create: `platform/agent/core/src/types/chunk.ts`
- Create: `platform/agent/core/src/types/stream.ts`
- Create: `platform/agent/core/src/types/message.ts`
- Create: `platform/agent/core/src/types/schema.ts`
- Create: `platform/agent/core/src/types/tool.ts`
- Create: `platform/agent/core/src/types/types.test.ts`

- [ ] **Step 1: Write the shape-assertion test first**

Create `platform/agent/core/src/types/types.test.ts`:

```ts
import { describe, expect, it, expectTypeOf } from 'vitest'
import type {
  KernelChunk,
  TokenUsage,
  ModelStream,
  KernelMessage,
  KernelMessageContent,
  StandardSchemaV1,
  Tool,
  ToolAnnotations,
  ToolExecutionContext,
  ToolResult,
  JsonSchemaTool,
} from './index'

describe('KernelChunk discriminated union', () => {
  it('accepts every documented variant', () => {
    const variants: KernelChunk[] = [
      { type: 'text', delta: 'hi' },
      { type: 'tool_args', toolCallId: 'tc_1', argsDelta: '{"x":' },
      { type: 'tool_call', toolCallId: 'tc_1', name: 'foo', args: { x: 1 } },
      { type: 'finish', reason: 'stop' },
      { type: 'finish', reason: 'tool_calls', usage: { inputTokens: 10, outputTokens: 20 } },
      // 'error' variant tested in errors.test.ts (needs KernelError instance)
      { type: 'abort' },
    ]
    expect(variants).toHaveLength(6)
  })

  it('TokenUsage carries cache breakdown', () => {
    const u: TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 80,
      cacheCreationInputTokens: 20,
    }
    expect(u.inputTokens).toBe(100)
  })

  it('exhaustive switch over KernelChunk["type"] is typed', () => {
    function describe_(c: KernelChunk): string {
      switch (c.type) {
        case 'text': return c.delta
        case 'tool_args': return c.argsDelta
        case 'tool_call': return c.name
        case 'finish': return c.reason
        case 'error': return c.error.message
        case 'abort': return 'aborted'
      }
    }
    expect(describe_({ type: 'text', delta: 'hi' })).toBe('hi')
  })
})

describe('KernelMessage canonical form', () => {
  it('user message with text content', () => {
    const m: KernelMessage = { role: 'user', content: [{ type: 'text', text: 'hello' }] }
    expect(m.role).toBe('user')
  })

  it('assistant message with tool_use content', () => {
    const m: KernelMessage = {
      role: 'assistant',
      content: [{ type: 'tool_use', toolCallId: 'tc_1', name: 'foo', args: {} }],
    }
    expect(m.content[0].type).toBe('tool_use')
  })

  it('tool result message', () => {
    const m: KernelMessage = {
      role: 'tool',
      toolCallId: 'tc_1',
      content: [{ type: 'tool_result', toolCallId: 'tc_1', result: { ok: true } }],
    }
    expect(m.toolCallId).toBe('tc_1')
  })
})

describe('ModelStream type', () => {
  it('extends AsyncIterable<TChunk>', () => {
    expectTypeOf<ModelStream<KernelChunk>>().toMatchTypeOf<AsyncIterable<KernelChunk>>()
  })
})

describe('Tool type', () => {
  it('parameterizes input and output', () => {
    type T = Tool<{ x: number }, { y: string }>
    const _annotations: ToolAnnotations = { readOnlyHint: true, requireApproval: false }
    expect(true).toBe(true)
  })
})

describe('JsonSchemaTool', () => {
  it('shape', () => {
    const t: JsonSchemaTool = {
      name: 'foo',
      description: 'bar',
      inputSchema: { type: 'object', properties: {} },
    }
    expect(t.name).toBe('foo')
  })
})

describe('ToolResult discriminant', () => {
  it('success', () => {
    const r: ToolResult<number> = { ok: true, value: 42 }
    expect(r.ok && r.value).toBe(42)
  })
  it('validation error returned, not thrown', () => {
    // Structural placeholder; full class verified in errors tests.
    const r: ToolResult<number> = { ok: false, error: { name: 'ToolValidationError', message: 'bad input' } as never }
    expect(r.ok).toBe(false)
  })
  it('suspend (reserved for @seta/agent-workflows)', () => {
    const r: ToolResult<number> = { suspend: { reason: 'need-input', resumeLabel: 'continue' } }
    expect('suspend' in r).toBe(true)
  })
})

describe('StandardSchemaV1', () => {
  it('zod 4 schemas implement ~standard', () => {
    // Compile-time check only — runtime conformance verified in prepare-tools tests.
    expectTypeOf<StandardSchemaV1<unknown>['~standard']['version']>().toEqualTypeOf<1>()
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: FAIL with errors about missing module `./index` and missing exports — every type is undefined.

- [ ] **Step 3: Write `types/chunk.ts`**

```ts
import type { KernelError } from '../errors'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
}

export type KernelChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_args'; toolCallId: string; argsDelta: string }
  | { type: 'tool_call'; toolCallId: string; name: string; args: unknown }
  | { type: 'finish'; reason: 'stop' | 'tool_calls' | 'length' | 'error'; usage?: TokenUsage }
  | { type: 'error'; error: KernelError }
  | { type: 'abort' }
```

- [ ] **Step 4: Write `types/stream.ts`**

```ts
import type { KernelMessage } from './message'

export interface ModelStream<TChunk> extends AsyncIterable<TChunk> {
  abort(): void
  finalMessage(): Promise<KernelMessage>
}
```

- [ ] **Step 5: Write `types/message.ts`**

```ts
export type KernelRole = 'system' | 'user' | 'assistant' | 'tool'

export type KernelMessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolCallId: string; name: string; args: unknown }
  | { type: 'tool_result'; toolCallId: string; result: unknown; isError?: boolean }

export interface KernelMessage {
  role: KernelRole
  content: KernelMessageContent[]
  toolCallId?: string
}
```

- [ ] **Step 6: Write `types/schema.ts`**

```ts
// Minimal Standard Schema v1 definition. Zod 4 implements ~standard natively.
// Future Arktype/Valibot tools also satisfy this contract.
export interface StandardSchemaV1<TInput = unknown, TOutput = TInput> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) =>
      | { value: TOutput }
      | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }> }
      | Promise<
          | { value: TOutput }
          | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }> }
        >
    readonly types?: { readonly input: TInput; readonly output: TOutput }
  }
}
```

- [ ] **Step 7: Write `types/tool.ts`**

```ts
import type { StandardSchemaV1 } from './schema'
import type { RunCtx } from './run'

export interface ToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
  requireApproval?: boolean
}

export type ToolExecutionContext =
  | { surface: 'teams'; abortSignal: AbortSignal; runId: string; requestContext: Readonly<RunCtx> }
  | { surface: 'direct'; abortSignal: AbortSignal; runId: string; requestContext: Readonly<RunCtx> }

export type ToolResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { name: string; message: string; details?: Record<string, unknown> } }
  | { suspend: { reason: string; resumeLabel: string } }

export interface Tool<TInput = unknown, TOutput = unknown> {
  id: string
  description: string
  inputSchema: StandardSchemaV1<TInput>
  outputSchema: StandardSchemaV1<TOutput>
  execute: (input: TInput, ctx: ToolExecutionContext) => Promise<ToolResult<TOutput>>
  annotations?: ToolAnnotations
  toModelOutput?: (out: TOutput) => unknown
}

export interface JsonSchemaTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}
```

Note: The concrete `ToolValidationError` class lands in the next task (errors); the `ToolResult.error` shape above is structural so this task is independent. This is plan-internal sequencing — do not mention it in source comments.

- [ ] **Step 8: Create the types index barrel**

Write `platform/agent/core/src/types/index.ts`:

```ts
export type { KernelChunk, TokenUsage } from './chunk'
export type { ModelStream } from './stream'
export type { KernelMessage, KernelMessageContent, KernelRole } from './message'
export type { StandardSchemaV1 } from './schema'
export type {
  Tool,
  ToolAnnotations,
  ToolExecutionContext,
  ToolResult,
  JsonSchemaTool,
} from './tool'
```

- [ ] **Step 9: Run the test (will still fail — circular ref on `KernelError` and `RunCtx`)**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: typecheck fails on missing modules `../errors` and `./run`. This is expected — those land in Tasks 3 and 4. Proceed to Step 10.

- [ ] **Step 10: Add stub forward-declaration modules so types compile**

Write `platform/agent/core/src/errors/index.ts` (will be replaced wholesale by the next task — kept minimal so type files compile):

```ts
export class KernelError extends Error {
  readonly code = 'PLACEHOLDER'
  readonly domain = 'KERNEL' as const
  readonly category = 'SYSTEM' as const
}
```

Write `platform/agent/core/src/types/run.ts` (the next task expands it):

```ts
export interface RunCtx {
  runId: string
  signal: AbortSignal
  retryCount: number
  now: () => number
  generateId: () => string
  currentDate: () => Date
}
```

- [ ] **Step 11: Run the test — should pass now**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: PASS, ~10 tests.

Run: `pnpm --filter @seta/agent-core typecheck`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add platform/agent/core/src/
git commit -m "$(cat <<'EOF'
feat(agent-core): types — KernelChunk, ModelStream, KernelMessage, Tool

Adds the core type vocabulary for K1: KernelChunk discriminated union
(6 variants), ModelStream<TChunk>, KernelMessage canonical form,
StandardSchemaV1, Tool/ToolExecutionContext/ToolResult/JsonSchemaTool.
KernelError and RunCtx are stub forward-declarations; fleshed out in
the next two tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Run + memory + processor + config types

**Files:**
- Modify: `platform/agent/core/src/types/run.ts` (replace placeholder)
- Create: `platform/agent/core/src/types/memory.ts`
- Create: `platform/agent/core/src/types/processor.ts`
- Create: `platform/agent/core/src/types/config.ts`
- Modify: `platform/agent/core/src/types/index.ts` (extend barrel)
- Modify: `platform/agent/core/src/types/types.test.ts` (add coverage)

- [ ] **Step 1: Extend the test file with the new types' shape assertions**

Append to `platform/agent/core/src/types/types.test.ts`:

```ts
import type {
  Run,
  RunCtx,
  RunStatus,
  RunInput,
  StepResult,
  MemoryProvider,
  MemoryContext,
  RecallResult,
  Processor,
  ProcessorContext,
  AgentConfig,
  RunLoopOptions,
  StopCondition,
  AdapterRequest,
} from './index'

describe('Run + RunCtx', () => {
  it('RunStatus is a closed union', () => {
    const statuses: RunStatus[] = ['created', 'running', 'completed', 'failed']
    expect(statuses).toHaveLength(4)
  })

  it('Run has tenantId (never on tool/memory contexts)', () => {
    const r: Run = {
      id: '0192...',
      status: 'running',
      tenantId: 'tnt_123',
      createdAt: new Date(),
    }
    expect(r.status).toBe('running')
  })

  it('RunCtx carries injection points for determinism', () => {
    const ctrl = new AbortController()
    const ctx: RunCtx = {
      runId: 'r1',
      signal: ctrl.signal,
      retryCount: 0,
      now: () => 0,
      generateId: () => 'id',
      currentDate: () => new Date(0),
    }
    expect(ctx.runId).toBe('r1')
  })

  it('StepResult discriminates model vs tool', () => {
    const m: StepResult = { kind: 'model', chunks: [] }
    const t: StepResult = { kind: 'tool', chunks: [] }
    expect(m.kind === 'model' || t.kind === 'tool').toBe(true)
  })

  it('RunInput holds messages and optional thread/conversation ids', () => {
    const i: RunInput = { messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }
    expect(i.messages).toHaveLength(1)
  })
})

describe('MemoryProvider seam', () => {
  it('shape: 4 hooks', () => {
    class TestMem implements MemoryProvider {
      async recall(): Promise<RecallResult> {
        return { messages: [], total: 0, page: 1, perPage: 0, hasMore: false }
      }
      async saveTurn(): Promise<void> {}
      async getWorkingMemory(): Promise<string | null> {
        return null
      }
      async updateWorkingMemory(): Promise<void> {}
    }
    const m = new TestMem()
    expect(typeof m.recall).toBe('function')
  })

  it('MemoryContext has no tenantId / resourceId', () => {
    const ctx: MemoryContext = { threadId: 't1', scope: 'thread' }
    // @ts-expect-error tenantId must not be on the interface
    const _bad: MemoryContext = { threadId: 't1', scope: 'thread', tenantId: 'x' }
    expect(ctx.threadId).toBe('t1')
  })
})

describe('Processor seam (3 hooks)', () => {
  it('all three hooks are optional', () => {
    const p: Processor = {}
    expect(p.processInput).toBeUndefined()
    expect(p.processOutputStep).toBeUndefined()
    expect(p.processAPIError).toBeUndefined()
  })

  it('ProcessorContext mirrors Mastra trio', () => {
    const ctrl = new AbortController()
    const ctx: ProcessorContext = {
      runId: 'r1',
      abort: (() => {
        throw new Error('aborted')
      }) as ProcessorContext['abort'],
      abortSignal: ctrl.signal,
      retryCount: 0,
      writer: { custom: () => {} },
    }
    expect(ctx.runId).toBe('r1')
  })
})

describe('Configuration', () => {
  it('AgentConfig has provider-qualified model id', () => {
    const cfg: AgentConfig = { model: 'anthropic/claude-4-7-sonnet' }
    expect(cfg.model.includes('/')).toBe(true)
  })

  it('RunLoopOptions reserves K4 fields without making them required', () => {
    // Compile-time: missing adapters should error
    // @ts-expect-error adapters required
    const _bad: RunLoopOptions = {}
    expect(true).toBe(true)
  })

  it('StopCondition is a function returning boolean or Promise<boolean>', () => {
    const sync: StopCondition = () => true
    const async_: StopCondition = async () => false
    expect(typeof sync).toBe('function')
    expect(typeof async_).toBe('function')
  })

  it('AdapterRequest carries the bare model id', () => {
    const r: AdapterRequest = {
      model: 'claude-4-7-sonnet',
      messages: [],
    }
    expect(r.model.includes('/')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: FAIL on missing exports.

- [ ] **Step 3: Replace `types/run.ts` with the full version**

```ts
import type { KernelChunk } from './chunk'
import type { KernelMessage } from './message'

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
}
```

- [ ] **Step 4: Write `types/memory.ts`**

```ts
import type { KernelMessage } from './message'

export interface MemoryContext {
  threadId: string
  conversationId?: string
  scope: 'thread' | 'resource'
  vectorSearchString?: string
}

export interface RecallResult {
  messages: KernelMessage[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
}

export interface MemoryProvider {
  recall(ctx: MemoryContext): Promise<RecallResult>
  saveTurn(ctx: MemoryContext, messages: KernelMessage[]): Promise<void>
  getWorkingMemory(ctx: MemoryContext): Promise<string | null>
  updateWorkingMemory(ctx: MemoryContext, text: string): Promise<void>
}
```

- [ ] **Step 5: Write `types/processor.ts`**

```ts
import type { RunInput, StepResult } from './run'

export interface ProcessorContext {
  runId: string
  abort(): never
  abortSignal: AbortSignal
  retryCount: number
  writer: { custom(chunk: unknown): void }
}

export interface Processor {
  processInput?(ctx: ProcessorContext, input: RunInput): Promise<RunInput>
  processOutputStep?(ctx: ProcessorContext, step: StepResult): Promise<StepResult>
  processAPIError?(ctx: ProcessorContext, err: unknown): Promise<'retry' | 'rethrow'>
}
```

- [ ] **Step 6: Write `types/config.ts`**

```ts
import type { KernelMessage } from './message'
import type { JsonSchemaTool, Tool } from './tool'
import type { StepResult } from './run'
import type { MemoryProvider } from './memory'
import type { Processor } from './processor'

export interface AdapterRegistryRef {
  register: unknown
  get: unknown
  select: unknown
}

export interface AgentConfig {
  model: string
  systemPrompt?: string
  maxTokens?: number
  cacheTtl?: '5m' | '1h' | null
  tools?: Tool[]
  fallback?: string[]
}

export type StopCondition = (steps: StepResult[]) => boolean | Promise<boolean>

export interface RunLoopOptions {
  adapters: AdapterRegistryRef
  memory?: MemoryProvider
  signal?: AbortSignal
  processors?: Processor[]
  maxSteps?: number
  stopWhen?: StopCondition | StopCondition[]
  toolCallConcurrency?: number
  perToolBudget?: { maxCalls?: number; maxTokens?: number; timeoutMs?: number }
  onIterationComplete?: (steps: StepResult[]) => void | Promise<void>
  generateId?: () => string
  now?: () => number
  currentDate?: () => Date
}

export interface AdapterRequest {
  model: string
  messages: KernelMessage[]
  systemPrompt?: string
  tools?: JsonSchemaTool[]
  maxTokens?: number
  cacheTtl?: '5m' | '1h' | null
}
```

Note: `AdapterRegistryRef` is a forward placeholder. A later task replaces it with the proper `AdapterRegistry` interface — do not put this transitional note in source comments.

- [ ] **Step 7: Extend `types/index.ts` barrel**

```ts
export type { KernelChunk, TokenUsage } from './chunk'
export type { ModelStream } from './stream'
export type { KernelMessage, KernelMessageContent, KernelRole } from './message'
export type { StandardSchemaV1 } from './schema'
export type { Tool, ToolAnnotations, ToolExecutionContext, ToolResult, JsonSchemaTool } from './tool'
export type { Run, RunCtx, RunStatus, RunInput, StepResult } from './run'
export type { MemoryProvider, MemoryContext, RecallResult } from './memory'
export type { Processor, ProcessorContext } from './processor'
export type { AgentConfig, RunLoopOptions, StopCondition, AdapterRequest } from './config'
```

- [ ] **Step 8: Run the test — should pass**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: PASS.

Run: `pnpm --filter @seta/agent-core typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add platform/agent/core/src/types/
git commit -m "$(cat <<'EOF'
feat(agent-core): types — Run, Memory, Processor, AgentConfig

Adds the remaining type vocabulary: RunCtx (with injectable {now,
generateId, currentDate} for deterministic recordings), Run + RunStatus
+ StepResult, MemoryProvider seam (4 hooks; no tenantId/resourceId per
SCOPE.md), Processor seam (3 of 8 Mastra hooks reserved), AgentConfig,
RunLoopOptions, StopCondition, AdapterRequest.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: KernelError hierarchy + classifyError + isAbortError

**Files:**
- Replace: `platform/agent/core/src/errors/index.ts` (currently stub)
- Create: `platform/agent/core/src/errors/classify.ts`
- Create: `platform/agent/core/src/errors/classify.test.ts`
- Create: `platform/agent/core/src/errors/index.test.ts`
- Modify: `platform/agent/core/src/index.ts` (extend barrel)

- [ ] **Step 1: Write `errors/index.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  AgentError,
  KernelError,
  LlmError,
  ToolError,
  ToolValidationError,
  kernelErrorOf,
} from './index'

describe('KernelError', () => {
  it('carries code, domain, category, details', () => {
    const e = new KernelError({
      code: 'TEST_CODE',
      domain: 'KERNEL',
      category: 'SYSTEM',
      message: 'test',
      details: { foo: 1 },
    })
    expect(e.code).toBe('TEST_CODE')
    expect(e.domain).toBe('KERNEL')
    expect(e.category).toBe('SYSTEM')
    expect(e.details).toEqual({ foo: 1 })
    expect(e.message).toBe('test')
  })

  it('toJSON shape matches MastraErrorJSON', () => {
    const e = new KernelError({
      code: 'X',
      domain: 'LLM',
      category: 'THIRD_PARTY',
      message: 'fail',
    })
    const json = e.toJSON()
    expect(json).toMatchObject({
      id: expect.any(String),
      code: 'X',
      domain: 'LLM',
      category: 'THIRD_PARTY',
      message: 'fail',
    })
  })

  it('default status is 500', () => {
    const e = new KernelError({
      code: 'X',
      domain: 'KERNEL',
      category: 'SYSTEM',
      message: 'fail',
    })
    expect(e.problem.status).toBe(500)
  })

  it('accepts explicit status override', () => {
    const e = new KernelError({
      code: 'X',
      domain: 'AGENT',
      category: 'USER',
      message: 'bad input',
      status: 400,
    })
    expect(e.problem.status).toBe(400)
  })

  it('preserves cause', () => {
    const inner = new Error('inner')
    const e = new KernelError({
      code: 'X',
      domain: 'KERNEL',
      category: 'SYSTEM',
      message: 'wrap',
      cause: inner,
    })
    expect(e.cause).toBe(inner)
  })
})

describe('subclass domain presets', () => {
  it('AgentError → AGENT', () => {
    const e = new AgentError({ code: 'X', category: 'USER', message: 'm' })
    expect(e.domain).toBe('AGENT')
  })
  it('LlmError → LLM', () => {
    const e = new LlmError({ code: 'X', category: 'THIRD_PARTY', message: 'm' })
    expect(e.domain).toBe('LLM')
  })
  it('ToolError → TOOL', () => {
    const e = new ToolError({ code: 'X', category: 'SYSTEM', message: 'm' })
    expect(e.domain).toBe('TOOL')
  })
  it('ToolValidationError extends ToolError', () => {
    const e = new ToolValidationError({ code: 'X', category: 'USER', message: 'm' })
    expect(e).toBeInstanceOf(ToolError)
    expect(e.domain).toBe('TOOL')
  })
})

describe('kernelErrorOf', () => {
  it('passes through existing KernelError', () => {
    const e = new LlmError({ code: 'Y', category: 'THIRD_PARTY', message: 'rate limited' })
    expect(kernelErrorOf(e)).toBe(e)
  })
  it('wraps a plain Error', () => {
    const k = kernelErrorOf(new Error('boom'))
    expect(k).toBeInstanceOf(KernelError)
    expect(k.code).toBe('UNKNOWN_KERNEL_ERROR')
    expect(k.domain).toBe('KERNEL')
    expect(k.category).toBe('SYSTEM')
    expect(k.cause).toBeInstanceOf(Error)
  })
  it('wraps a non-Error value', () => {
    const k = kernelErrorOf('something bad')
    expect(k).toBeInstanceOf(KernelError)
    expect(k.message).toContain('something bad')
  })
  it('wraps null/undefined', () => {
    expect(kernelErrorOf(null)).toBeInstanceOf(KernelError)
    expect(kernelErrorOf(undefined)).toBeInstanceOf(KernelError)
  })
})
```

- [ ] **Step 2: Write `errors/classify.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { classifyError, isAbortError } from './classify'

describe('classifyError', () => {
  it.each([429, 500, 502, 503, 504, 408])('HTTP %i → transient', (status) => {
    expect(classifyError({ status })).toBe('transient')
  })

  it.each([400, 401, 403, 404, 422])('HTTP %i → terminal', (status) => {
    expect(classifyError({ status })).toBe('terminal')
  })

  it.each(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'])(
    'Node error code %s → transient',
    (code) => {
      expect(classifyError({ code })).toBe('transient')
    },
  )

  it('AbortError → terminal (caller special-cases abort upstream)', () => {
    const e = new Error('aborted')
    e.name = 'AbortError'
    expect(classifyError(e)).toBe('terminal')
  })

  it('TypeError → terminal', () => {
    expect(classifyError(new TypeError('bad'))).toBe('terminal')
  })

  it('null/undefined/string → terminal', () => {
    expect(classifyError(null)).toBe('terminal')
    expect(classifyError(undefined)).toBe('terminal')
    expect(classifyError('boom')).toBe('terminal')
  })
})

describe('isAbortError', () => {
  it('detects DOMException AbortError by name', () => {
    const e = new Error('aborted')
    e.name = 'AbortError'
    expect(isAbortError(e)).toBe(true)
  })

  it('detects AbortController.signal abort reason', () => {
    const ctrl = new AbortController()
    ctrl.abort()
    expect(isAbortError(ctrl.signal.reason)).toBe(true)
  })

  it('returns false for plain errors', () => {
    expect(isAbortError(new Error('not abort'))).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError('string')).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests — both fail (modules don't exist yet)**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: FAIL for both new test files.

- [ ] **Step 4: Write `errors/index.ts` (replacing the placeholder)**

```ts
import { v7 as uuidv7 } from 'uuid'
import { DomainError } from '@seta/middleware'

export type KernelErrorDomain = 'AGENT' | 'LLM' | 'TOOL' | 'KERNEL'
export type KernelErrorCategory = 'USER' | 'SYSTEM' | 'THIRD_PARTY'

export interface KernelErrorJSON {
  id: string
  code: string
  domain: KernelErrorDomain
  category: KernelErrorCategory
  details?: Record<string, unknown>
  message: string
}

interface KernelErrorArgs {
  code: string
  domain: KernelErrorDomain
  category: KernelErrorCategory
  message: string
  details?: Record<string, unknown>
  cause?: unknown
  status?: number
}

const ERROR_TYPE_BASE = 'https://os.seta-international.com/errors'

export class KernelError extends DomainError {
  readonly id: string
  readonly code: string
  readonly domain: KernelErrorDomain
  readonly category: KernelErrorCategory
  readonly details?: Record<string, unknown>

  constructor(args: KernelErrorArgs) {
    const status = args.status ?? 500
    super(status, args.message, {
      type: `${ERROR_TYPE_BASE}/${args.domain.toLowerCase()}/${args.code}`,
      ...(args.details !== undefined ? { detail: JSON.stringify(args.details) } : {}),
      cause: args.cause,
    })
    this.id = uuidv7()
    this.code = args.code
    this.domain = args.domain
    this.category = args.category
    this.details = args.details
  }

  toJSON(): KernelErrorJSON {
    return {
      id: this.id,
      code: this.code,
      domain: this.domain,
      category: this.category,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    }
  }
}

type SubclassArgs = Omit<KernelErrorArgs, 'domain'>

export class AgentError extends KernelError {
  constructor(args: SubclassArgs) {
    super({ ...args, domain: 'AGENT' })
  }
}

export class LlmError extends KernelError {
  constructor(args: SubclassArgs) {
    super({ ...args, domain: 'LLM' })
  }
}

export class ToolError extends KernelError {
  constructor(args: SubclassArgs) {
    super({ ...args, domain: 'TOOL' })
  }
}

export class ToolValidationError extends ToolError {}

export function kernelErrorOf(err: unknown): KernelError {
  if (err instanceof KernelError) return err
  if (err instanceof Error) {
    return new KernelError({
      code: 'UNKNOWN_KERNEL_ERROR',
      domain: 'KERNEL',
      category: 'SYSTEM',
      message: err.message,
      cause: err,
    })
  }
  return new KernelError({
    code: 'UNKNOWN_KERNEL_ERROR',
    domain: 'KERNEL',
    category: 'SYSTEM',
    message: typeof err === 'string' ? err : 'Unknown error',
    cause: err,
  })
}
```

- [ ] **Step 5: Write `errors/classify.ts`**

```ts
export type ErrorClass = 'transient' | 'terminal'

const TRANSIENT_HTTP = new Set([408, 429, 500, 502, 503, 504])
const TRANSIENT_NODE_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])

export function classifyError(err: unknown): ErrorClass {
  if (typeof err !== 'object' || err === null) return 'terminal'
  const e = err as Record<string, unknown>
  const status = typeof e.status === 'number' ? e.status : undefined
  if (status !== undefined && TRANSIENT_HTTP.has(status)) return 'transient'
  const code = typeof e.code === 'string' ? e.code : undefined
  if (code !== undefined && TRANSIENT_NODE_CODES.has(code)) return 'transient'
  return 'terminal'
}

export function isAbortError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'name' in err) {
    if ((err as { name: unknown }).name === 'AbortError') return true
  }
  return false
}
```

- [ ] **Step 6: Update the public barrel `src/index.ts`**

```ts
// Types
export type * from './types'

// Errors
export {
  AgentError,
  KernelError,
  LlmError,
  ToolError,
  ToolValidationError,
  kernelErrorOf,
} from './errors'
export type { KernelErrorDomain, KernelErrorCategory, KernelErrorJSON } from './errors'
export { classifyError, isAbortError } from './errors/classify'
export type { ErrorClass } from './errors/classify'
```

- [ ] **Step 7: Run tests — should all pass**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: PASS — error tests + classify tests + earlier type tests all green.

Run: `pnpm --filter @seta/agent-core typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add platform/agent/core/src/errors/ platform/agent/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(agent-core): KernelError hierarchy + classifyError + isAbortError

KernelError extends DomainError with {code, domain, category, details}
matching Mastra's MastraErrorJSON shape. Subclasses AgentError/LlmError/
ToolError preset domain. ToolValidationError is returned via
ToolResult.ok=false, never thrown. kernelErrorOf() coerces any thrown
value for SSE error chunks.

classifyError maps known transient HTTP codes (408/429/5xx) and Node
socket errors to 'transient'; everything else (incl. AbortError, which
the caller special-cases upstream) is 'terminal'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: withRetry — exponential backoff, signal-aware

**Files:**
- Create: `platform/agent/core/src/models/retry.ts`
- Create: `platform/agent/core/src/models/retry.test.ts`
- Modify: `platform/agent/core/src/index.ts` (barrel)

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withRetry } from './retry'
import { LlmError } from '../errors'

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the value on first success', async () => {
    const fn = vi.fn(async () => 42)
    const ctrl = new AbortController()
    const p = withRetry(fn, { maxRetries: 2, signal: ctrl.signal })
    await expect(p).resolves.toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on transient error up to maxRetries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce('ok')
    const ctrl = new AbortController()
    const p = withRetry(fn, { maxRetries: 2, signal: ctrl.signal })
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('rethrows on terminal error without retrying', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 401 })
    const ctrl = new AbortController()
    await expect(withRetry(fn, { maxRetries: 2, signal: ctrl.signal })).rejects.toMatchObject({
      status: 401,
    })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('rethrows the last error after exhausting retries', async () => {
    const err = { status: 503 }
    const fn = vi.fn().mockRejectedValue(err)
    const ctrl = new AbortController()
    const p = withRetry(fn, { maxRetries: 2, signal: ctrl.signal })
    await vi.runAllTimersAsync()
    await expect(p).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('aborts immediately when signal already aborted', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 })
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(
      withRetry(fn, { maxRetries: 5, signal: ctrl.signal }),
    ).rejects.toMatchObject({ status: 503 })
    expect(fn).toHaveBeenCalledTimes(1) // no retry
  })

  it('aborts mid-backoff when signal fires during sleep', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 })
    const ctrl = new AbortController()
    const p = withRetry(fn, { maxRetries: 5, signal: ctrl.signal })
    p.catch(() => {}) // prevent unhandled
    // First call rejects, backoff starts
    await Promise.resolve()
    ctrl.abort()
    await vi.runAllTimersAsync()
    await expect(p).rejects.toMatchObject({ status: 503 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('invokes onAttempt for each failure with attempt index', async () => {
    const onAttempt = vi.fn()
    const fn = vi.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce('ok')
    const ctrl = new AbortController()
    const p = withRetry(fn, { maxRetries: 2, signal: ctrl.signal, onAttempt })
    await vi.runAllTimersAsync()
    await p
    expect(onAttempt).toHaveBeenCalledWith(1, { status: 503 })
  })

  it('classifies LlmError with transient details', async () => {
    // LlmError instance with status 503 should be transient
    const err = new LlmError({ code: 'X', category: 'THIRD_PARTY', message: 'm' })
    ;(err as unknown as { status: number }).status = 503
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok')
    const ctrl = new AbortController()
    const p = withRetry(fn, { maxRetries: 1, signal: ctrl.signal })
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBe('ok')
  })
})
```

- [ ] **Step 2: Run test, observe failure**

Run: `pnpm --filter @seta/agent-core test:unit -t withRetry`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `models/retry.ts`**

```ts
import { classifyError } from '../errors/classify'

export interface RetryOpts {
  maxRetries: number
  signal: AbortSignal
  onAttempt?: (attempt: number, err: unknown) => void
}

const BASE_DELAY_MS = 250
const MAX_DELAY_MS = 4000

function nextDelayMs(attempt: number): number {
  const raw = BASE_DELAY_MS * 2 ** attempt
  const capped = Math.min(raw, MAX_DELAY_MS)
  const jitter = 0.8 + Math.random() * 0.4 // ±20%
  return Math.round(capped * jitter)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'))
      return
    }
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new Error('aborted'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      opts.onAttempt?.(attempt + 1, err)
      if (opts.signal.aborted) throw err
      if (classifyError(err) === 'terminal') throw err
      if (attempt === opts.maxRetries) throw err
      try {
        await sleep(nextDelayMs(attempt), opts.signal)
      } catch {
        throw lastErr
      }
    }
  }
  // Unreachable: the loop body either returns or throws.
  throw lastErr
}
```

- [ ] **Step 4: Extend the barrel `src/index.ts`**

Append to `src/index.ts`:

```ts
export { withRetry } from './models/retry'
export type { RetryOpts } from './models/retry'
```

- [ ] **Step 5: Run the test — should pass**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add platform/agent/core/src/models/retry.ts platform/agent/core/src/models/retry.test.ts platform/agent/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(agent-core): withRetry — signal-aware exponential backoff

Retries only when classifyError() === 'transient'. Exponential backoff
250ms * 2^attempt capped at 4s with ±20% jitter. AbortSignal interrupts
both in-flight attempts and the sleep between attempts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Adapter registry — createAdapterRegistry

**Files:**
- Create: `platform/agent/core/src/models/adapter.ts`
- Create: `platform/agent/core/src/models/registry.ts`
- Create: `platform/agent/core/src/models/registry.test.ts`
- Modify: `platform/agent/core/src/types/config.ts` (replace AdapterRegistryRef)
- Modify: `platform/agent/core/src/index.ts` (barrel)

- [ ] **Step 1: Write the failing test**

Create `platform/agent/core/src/models/registry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createAdapterRegistry } from './registry'
import type { ModelAdapter } from './adapter'
import { AgentError } from '../errors'

function fakeAdapter(provider: string): ModelAdapter {
  return {
    provider,
    stream: vi.fn(),
  }
}

describe('createAdapterRegistry', () => {
  it('register + get round-trip', () => {
    const reg = createAdapterRegistry()
    const a = fakeAdapter('anthropic')
    reg.register('anthropic', a)
    expect(reg.get('anthropic')).toBe(a)
  })

  it('register throws on duplicate', () => {
    const reg = createAdapterRegistry()
    reg.register('openai', fakeAdapter('openai'))
    expect(() => reg.register('openai', fakeAdapter('openai'))).toThrow(AgentError)
    try {
      reg.register('openai', fakeAdapter('openai'))
    } catch (e) {
      expect((e as AgentError).code).toBe('ADAPTER_ALREADY_REGISTERED')
    }
  })

  it('get returns undefined for unregistered provider', () => {
    const reg = createAdapterRegistry()
    expect(reg.get('nope')).toBeUndefined()
  })

  it('select parses <provider>/<model>', () => {
    const reg = createAdapterRegistry()
    const a = fakeAdapter('anthropic')
    reg.register('anthropic', a)
    const r = reg.select('anthropic/claude-4-7-sonnet')
    expect(r.adapter).toBe(a)
    expect(r.bareModel).toBe('claude-4-7-sonnet')
  })

  it('select supports bare model ids that contain slashes', () => {
    const reg = createAdapterRegistry()
    const a = fakeAdapter('openai')
    reg.register('openai', a)
    // e.g. an OpenAI-compatible endpoint with namespaced model
    const r = reg.select('openai/litellm/llama-3.1-70b')
    expect(r.bareModel).toBe('litellm/llama-3.1-70b')
  })

  it.each(['', 'noslash', '/leading', 'trailing/', '/'])(
    'select throws AgentError(INVALID_MODEL_ID) for %s',
    (bad) => {
      const reg = createAdapterRegistry()
      try {
        reg.select(bad)
        throw new Error('expected throw')
      } catch (e) {
        expect(e).toBeInstanceOf(AgentError)
        expect((e as AgentError).code).toBe('INVALID_MODEL_ID')
      }
    },
  )

  it('select throws AgentError(ADAPTER_NOT_REGISTERED) with knownProviders list', () => {
    const reg = createAdapterRegistry()
    reg.register('anthropic', fakeAdapter('anthropic'))
    reg.register('openai', fakeAdapter('openai'))
    try {
      reg.select('cohere/command-r')
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(AgentError)
      expect((e as AgentError).code).toBe('ADAPTER_NOT_REGISTERED')
      expect((e as AgentError).details).toEqual({
        knownProviders: expect.arrayContaining(['anthropic', 'openai']),
      })
    }
  })
})
```

- [ ] **Step 2: Run test, observe failure**

Run: `pnpm --filter @seta/agent-core test:unit -t createAdapterRegistry`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `models/adapter.ts`**

```ts
import type { AdapterRequest, ModelStream, KernelChunk, RunCtx } from '../types'

export interface ModelAdapter {
  readonly provider: string
  stream(req: AdapterRequest, ctx: RunCtx): Promise<ModelStream<KernelChunk>>
}
```

- [ ] **Step 4: Write `models/registry.ts`**

```ts
import { AgentError } from '../errors'
import type { ModelAdapter } from './adapter'

export interface AdapterRegistry {
  register(provider: string, adapter: ModelAdapter): void
  get(provider: string): ModelAdapter | undefined
  select(modelId: string): { adapter: ModelAdapter; bareModel: string }
}

export function createAdapterRegistry(): AdapterRegistry {
  const adapters = new Map<string, ModelAdapter>()
  return {
    register(provider, adapter) {
      if (adapters.has(provider)) {
        throw new AgentError({
          code: 'ADAPTER_ALREADY_REGISTERED',
          category: 'SYSTEM',
          message: `adapter already registered for provider ${JSON.stringify(provider)}`,
          details: { provider },
        })
      }
      adapters.set(provider, adapter)
    },
    get(provider) {
      return adapters.get(provider)
    },
    select(modelId) {
      const slash = modelId.indexOf('/')
      if (slash <= 0 || slash === modelId.length - 1) {
        throw new AgentError({
          code: 'INVALID_MODEL_ID',
          category: 'USER',
          message: `expected <provider>/<model>, got ${JSON.stringify(modelId)}`,
          details: { modelId },
        })
      }
      const provider = modelId.slice(0, slash)
      const bareModel = modelId.slice(slash + 1)
      const adapter = adapters.get(provider)
      if (!adapter) {
        throw new AgentError({
          code: 'ADAPTER_NOT_REGISTERED',
          category: 'SYSTEM',
          message: `no adapter registered for provider ${JSON.stringify(provider)}`,
          details: { knownProviders: [...adapters.keys()] },
        })
      }
      return { adapter, bareModel }
    },
  }
}
```

- [ ] **Step 5: Replace AdapterRegistryRef placeholder in `types/config.ts`**

Open `platform/agent/core/src/types/config.ts` and:

1. Remove the entire `AdapterRegistryRef` interface block.
2. Replace `import type { ... }` block at the top so it imports `AdapterRegistry`:

```ts
import type { KernelMessage } from './message'
import type { JsonSchemaTool, Tool } from './tool'
import type { StepResult } from './run'
import type { MemoryProvider } from './memory'
import type { Processor } from './processor'
import type { AdapterRegistry } from '../models/registry'
```

3. Change `RunLoopOptions.adapters` from `AdapterRegistryRef` to `AdapterRegistry`.

The full file becomes:

```ts
import type { KernelMessage } from './message'
import type { JsonSchemaTool, Tool } from './tool'
import type { StepResult } from './run'
import type { MemoryProvider } from './memory'
import type { Processor } from './processor'
import type { AdapterRegistry } from '../models/registry'

export interface AgentConfig {
  model: string
  systemPrompt?: string
  maxTokens?: number
  cacheTtl?: '5m' | '1h' | null
  tools?: Tool[]
  fallback?: string[]
}

export type StopCondition = (steps: StepResult[]) => boolean | Promise<boolean>

export interface RunLoopOptions {
  adapters: AdapterRegistry
  memory?: MemoryProvider
  signal?: AbortSignal
  processors?: Processor[]
  maxSteps?: number
  stopWhen?: StopCondition | StopCondition[]
  toolCallConcurrency?: number
  perToolBudget?: { maxCalls?: number; maxTokens?: number; timeoutMs?: number }
  onIterationComplete?: (steps: StepResult[]) => void | Promise<void>
  generateId?: () => string
  now?: () => number
  currentDate?: () => Date
}

export interface AdapterRequest {
  model: string
  messages: KernelMessage[]
  systemPrompt?: string
  tools?: JsonSchemaTool[]
  maxTokens?: number
  cacheTtl?: '5m' | '1h' | null
}
```

- [ ] **Step 6: Extend the barrel**

Append to `src/index.ts`:

```ts
export type { ModelAdapter } from './models/adapter'
export { createAdapterRegistry } from './models/registry'
export type { AdapterRegistry } from './models/registry'
```

- [ ] **Step 7: Run tests and typecheck — both pass**

Run: `pnpm --filter @seta/agent-core test:unit && pnpm --filter @seta/agent-core typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add platform/agent/core/src/models/ platform/agent/core/src/types/config.ts platform/agent/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(agent-core): ModelAdapter + createAdapterRegistry

Factory-returned registry (closure pattern) mirrors createConnectorRegistry.
Two-part provider IDs <provider>/<model>; bare model can itself contain
slashes (supports e.g. 'openai/litellm/llama-3.1-70b' against an
OpenAI-compatible endpoint). Throws AgentError with codes
INVALID_MODEL_ID / ADAPTER_NOT_REGISTERED / ADAPTER_ALREADY_REGISTERED.

No DI container — composition root in apps/api/main.ts owns registration
in K2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: prepareTools — Zod → JSON Schema with fixups

**Files:**
- Create: `platform/agent/core/src/models/prepare-tools.ts`
- Create: `platform/agent/core/src/models/prepare-tools.test.ts`
- Modify: `platform/agent/core/src/index.ts` (barrel)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { prepareTools } from './prepare-tools'
import type { Tool } from '../types'

function toolFrom(id: string, inputSchema: z.ZodTypeAny): Tool {
  return {
    id,
    description: 'test',
    inputSchema: inputSchema as unknown as Tool['inputSchema'],
    outputSchema: z.unknown() as unknown as Tool['outputSchema'],
    execute: async () => ({ ok: true, value: undefined }),
  }
}

describe('prepareTools', () => {
  it('returns shape: { name, description, inputSchema }', () => {
    const t = toolFrom('list_tasks', z.object({ planId: z.string() }))
    const [out] = prepareTools([t])
    expect(out).toMatchObject({
      name: 'list_tasks',
      description: 'test',
      inputSchema: expect.objectContaining({ type: 'object' }),
    })
  })

  it('pins $schema to draft-07', () => {
    const t = toolFrom('x', z.object({ a: z.string() }))
    const [out] = prepareTools([t])
    expect(out.inputSchema.$schema).toBe('http://json-schema.org/draft-07/schema#')
  })

  it('repairs typeless properties (z.any() → permissive union)', () => {
    const t = toolFrom('x', z.object({ payload: z.any() }))
    const [out] = prepareTools([t])
    const props = out.inputSchema.properties as Record<string, { type: unknown }>
    expect(props.payload.type).toEqual(['string', 'number', 'integer', 'boolean', 'object', 'null'])
  })

  it('preserves typed properties', () => {
    const t = toolFrom(
      'x',
      z.object({
        name: z.string(),
        count: z.number(),
        active: z.boolean(),
      }),
    )
    const [out] = prepareTools([t])
    const props = out.inputSchema.properties as Record<string, { type: string }>
    expect(props.name.type).toBe('string')
    expect(props.count.type).toBe('number')
    expect(props.active.type).toBe('boolean')
  })

  it('preserves $ref / anyOf / oneOf / allOf without inserting type', () => {
    const t = toolFrom(
      'x',
      z.object({
        either: z.union([z.string(), z.number()]),
      }),
    )
    const [out] = prepareTools([t])
    const props = out.inputSchema.properties as Record<string, Record<string, unknown>>
    // union → anyOf; property should not have a typeless-fixup applied
    expect('anyOf' in props.either || 'oneOf' in props.either).toBe(true)
    expect((props.either as { type?: unknown }).type).not.toEqual([
      'string',
      'number',
      'integer',
      'boolean',
      'object',
      'null',
    ])
  })

  it('recurses into nested objects', () => {
    const t = toolFrom(
      'x',
      z.object({
        meta: z.object({
          payload: z.any(),
        }),
      }),
    )
    const [out] = prepareTools([t])
    const meta = (out.inputSchema.properties as Record<string, Record<string, unknown>>).meta
    const metaProps = meta.properties as Record<string, { type: unknown }>
    expect(metaProps.payload.type).toEqual([
      'string',
      'number',
      'integer',
      'boolean',
      'object',
      'null',
    ])
  })

  it('recurses into array items', () => {
    const t = toolFrom('x', z.object({ items: z.array(z.any()) }))
    const [out] = prepareTools([t])
    const items = (out.inputSchema.properties as Record<string, Record<string, unknown>>).items
    const inner = items.items as { type: unknown }
    expect(inner.type).toEqual(['string', 'number', 'integer', 'boolean', 'object', 'null'])
  })

  it('handles empty tool array', () => {
    expect(prepareTools([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run, observe failure**

Run: `pnpm --filter @seta/agent-core test:unit -t prepareTools`
Expected: FAIL.

- [ ] **Step 3: Write `models/prepare-tools.ts`**

```ts
import { z } from 'zod'
import type { JsonSchemaTool, Tool } from '../types'

const TYPELESS_UNION = ['string', 'number', 'integer', 'boolean', 'object', 'null'] as const
const DRAFT_07 = 'http://json-schema.org/draft-07/schema#'

// Ported verbatim from
// mastra/packages/core/src/stream/aisdk/v5/compat/prepare-tools.ts:33-71
function fixTypelessProperties(schema: Record<string, unknown>): Record<string, unknown> {
  if (typeof schema !== 'object' || schema === null) return schema
  const result: Record<string, unknown> = { ...schema }

  if (
    result.properties &&
    typeof result.properties === 'object' &&
    !Array.isArray(result.properties)
  ) {
    result.properties = Object.fromEntries(
      Object.entries(result.properties as Record<string, unknown>).map(([key, value]) => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return [key, value]
        }
        const prop = value as Record<string, unknown>
        const hasType = 'type' in prop
        const hasRef = '$ref' in prop
        const hasAnyOf = 'anyOf' in prop
        const hasOneOf = 'oneOf' in prop
        const hasAllOf = 'allOf' in prop
        if (!hasType && !hasRef && !hasAnyOf && !hasOneOf && !hasAllOf) {
          const { items: _items, ...rest } = prop
          return [key, { ...rest, type: [...TYPELESS_UNION] }]
        }
        return [key, fixTypelessProperties(prop)]
      }),
    )
  }

  if (result.items) {
    if (Array.isArray(result.items)) {
      result.items = (result.items as Record<string, unknown>[]).map((item) =>
        fixTypelessProperties(item),
      )
    } else if (typeof result.items === 'object') {
      result.items = fixTypelessProperties(result.items as Record<string, unknown>)
    }
  }

  return result
}

function pinDraft07(schema: Record<string, unknown>): Record<string, unknown> {
  return { ...schema, $schema: DRAFT_07 }
}

export function prepareTools(tools: Tool[]): JsonSchemaTool[] {
  return tools.map((tool) => {
    // Zod 4 native JSON Schema generation. `~standard.vendor === 'zod'` for Zod 4 schemas.
    const raw = z.toJSONSchema(tool.inputSchema as z.ZodTypeAny) as Record<string, unknown>
    const pinned = pinDraft07(raw)
    const fixed = fixTypelessProperties(pinned)
    return {
      name: tool.id,
      description: tool.description,
      inputSchema: fixed,
    }
  })
}
```

- [ ] **Step 4: Extend barrel**

Append to `src/index.ts`:

```ts
export { prepareTools } from './models/prepare-tools'
```

- [ ] **Step 5: Run, all pass**

Run: `pnpm --filter @seta/agent-core test:unit && pnpm --filter @seta/agent-core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add platform/agent/core/src/models/prepare-tools.ts platform/agent/core/src/models/prepare-tools.test.ts platform/agent/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(agent-core): prepareTools — Zod → JSON Schema with provider fixups

Pure function that converts Tool.inputSchema (Zod 4) to JSON Schema via
z.toJSONSchema(), pins $schema to draft-07 (providers reject 2020-12),
and applies fixTypelessProperties — ported verbatim from
mastra/packages/core/src/stream/aisdk/v5/compat/prepare-tools.ts:33-71.

z.any() and similarly typeless properties become a permissive union of
[string, number, integer, boolean, object, null] so providers accept the
schema. $ref/anyOf/oneOf/allOf are preserved.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: NullMemoryProvider + createRunCtx factory

**Files:**
- Create: `platform/agent/core/src/memory/null-provider.ts`
- Create: `platform/agent/core/src/memory/null-provider.test.ts`
- Create: `platform/agent/core/src/run/make-run-ctx.ts`
- Create: `platform/agent/core/src/run/make-run-ctx.test.ts`
- Modify: `platform/agent/core/src/index.ts` (barrel)

- [ ] **Step 1: Write `null-provider.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { NullMemoryProvider } from './null-provider'
import type { MemoryContext } from '../types'

const ctx: MemoryContext = { threadId: 't1', scope: 'thread' }

describe('NullMemoryProvider', () => {
  const m = new NullMemoryProvider()

  it('recall returns empty paginated result', async () => {
    const r = await m.recall(ctx)
    expect(r).toEqual({ messages: [], total: 0, page: 1, perPage: 0, hasMore: false })
  })

  it('saveTurn is a no-op', async () => {
    await expect(m.saveTurn(ctx, [])).resolves.toBeUndefined()
  })

  it('getWorkingMemory returns null', async () => {
    await expect(m.getWorkingMemory(ctx)).resolves.toBeNull()
  })

  it('updateWorkingMemory is a no-op', async () => {
    await expect(m.updateWorkingMemory(ctx, 'anything')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Write `make-run-ctx.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { createRunCtx } from './make-run-ctx'

describe('createRunCtx', () => {
  it('uses defaults when no overrides supplied', () => {
    const ctrl = new AbortController()
    const ctx = createRunCtx({ signal: ctrl.signal })
    expect(ctx.runId).toMatch(/^[0-9a-f-]{36}$/) // UUID v7
    expect(ctx.retryCount).toBe(0)
    expect(typeof ctx.now()).toBe('number')
    expect(typeof ctx.generateId()).toBe('string')
    expect(ctx.currentDate()).toBeInstanceOf(Date)
    expect(ctx.signal).toBe(ctrl.signal)
  })

  it('honors injected generateId / now / currentDate', () => {
    const ctrl = new AbortController()
    const fixed = new Date('2026-05-12T00:00:00Z')
    const ctx = createRunCtx({
      signal: ctrl.signal,
      generateId: () => 'fixed-id',
      now: () => 12345,
      currentDate: () => fixed,
    })
    expect(ctx.runId).toBe('fixed-id')
    expect(ctx.now()).toBe(12345)
    expect(ctx.currentDate()).toBe(fixed)
  })

  it('UUIDs are time-sortable (v7 monotonicity)', () => {
    const ctrl = new AbortController()
    const a = createRunCtx({ signal: ctrl.signal }).runId
    const b = createRunCtx({ signal: ctrl.signal }).runId
    // v7 puts unix-ms in first 48 bits; two consecutive calls within the same ms
    // can be equal-prefixed but never reordered.
    expect(a <= b).toBe(true)
  })
})
```

- [ ] **Step 3: Run both tests, observe failure**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write `memory/null-provider.ts`**

```ts
import type { MemoryProvider, RecallResult } from '../types'

export class NullMemoryProvider implements MemoryProvider {
  async recall(): Promise<RecallResult> {
    return { messages: [], total: 0, page: 1, perPage: 0, hasMore: false }
  }
  async saveTurn(): Promise<void> {}
  async getWorkingMemory(): Promise<string | null> {
    return null
  }
  async updateWorkingMemory(): Promise<void> {}
}
```

- [ ] **Step 5: Write `run/make-run-ctx.ts`**

```ts
import { v7 as uuidv7 } from 'uuid'
import type { RunCtx } from '../types'

export interface CreateRunCtxOpts {
  signal: AbortSignal
  generateId?: () => string
  now?: () => number
  currentDate?: () => Date
  retryCount?: number
}

export function createRunCtx(opts: CreateRunCtxOpts): RunCtx {
  const generateId = opts.generateId ?? (() => uuidv7())
  return {
    runId: generateId(),
    signal: opts.signal,
    retryCount: opts.retryCount ?? 0,
    now: opts.now ?? (() => Date.now()),
    generateId,
    currentDate: opts.currentDate ?? (() => new Date()),
  }
}
```

- [ ] **Step 6: Extend barrel**

Append to `src/index.ts`:

```ts
export { NullMemoryProvider } from './memory/null-provider'
export { createRunCtx } from './run/make-run-ctx'
export type { CreateRunCtxOpts } from './run/make-run-ctx'
```

- [ ] **Step 7: Run all tests + typecheck**

Run: `pnpm --filter @seta/agent-core test:unit && pnpm --filter @seta/agent-core typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add platform/agent/core/src/memory/ platform/agent/core/src/run/make-run-ctx.ts platform/agent/core/src/run/make-run-ctx.test.ts platform/agent/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(agent-core): NullMemoryProvider + createRunCtx

NullMemoryProvider is the kernel's default when no real memory provider
is bound — recall returns empty, saveTurn/updateWorkingMemory no-op,
getWorkingMemory returns null. Used by @seta/agent-core unit tests and
the testkit; @seta/agent-memory binds the real provider in the MEM stream.

createRunCtx defaults runId via uuid v7 (time-sortable, project
convention), now/currentDate via Date.now / new Date, all injectable for
deterministic recordings in K1.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: safeEnqueue / safeClose — Hono SSE wrappers

**Files:**
- Create: `platform/agent/core/src/run/safe-stream.ts`
- Create: `platform/agent/core/src/run/safe-stream.test.ts`
- Modify: `platform/agent/core/src/index.ts` (barrel)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import type { SSEStreamingApi } from 'hono/streaming'
import { safeClose, safeEnqueue } from './safe-stream'

function fakeStream(opts?: { throwOnWrite?: boolean; throwOnClose?: boolean }): SSEStreamingApi {
  return {
    writeSSE: vi.fn(async () => {
      if (opts?.throwOnWrite) throw new Error('controller closed')
    }),
    close: vi.fn(async () => {
      if (opts?.throwOnClose) throw new Error('controller closed')
    }),
    closed: false,
  } as unknown as SSEStreamingApi
}

describe('safeEnqueue', () => {
  it('returns true on successful write', async () => {
    const s = fakeStream()
    const ok = await safeEnqueue(s, { event: 'text', data: 'hi' })
    expect(ok).toBe(true)
    expect(s.writeSSE).toHaveBeenCalledWith({ event: 'text', data: 'hi' })
  })

  it('returns false when the stream throws', async () => {
    const s = fakeStream({ throwOnWrite: true })
    const ok = await safeEnqueue(s, { event: 'x', data: '' })
    expect(ok).toBe(false)
  })

  it('does not throw on closed stream', async () => {
    const s = fakeStream({ throwOnWrite: true })
    await expect(safeEnqueue(s, { event: 'x', data: '' })).resolves.toBe(false)
  })
})

describe('safeClose', () => {
  it('returns true on successful close', async () => {
    const s = fakeStream()
    expect(await safeClose(s)).toBe(true)
  })

  it('returns false when close throws', async () => {
    const s = fakeStream({ throwOnClose: true })
    expect(await safeClose(s)).toBe(false)
  })
})
```

- [ ] **Step 2: Run, fail**

Run: `pnpm --filter @seta/agent-core test:unit -t safeEnqueue`
Expected: FAIL.

- [ ] **Step 3: Write `run/safe-stream.ts`**

```ts
import type { SSEMessage, SSEStreamingApi } from 'hono/streaming'

export async function safeEnqueue(stream: SSEStreamingApi, message: SSEMessage): Promise<boolean> {
  try {
    await stream.writeSSE(message)
    return true
  } catch {
    return false
  }
}

export async function safeClose(stream: SSEStreamingApi): Promise<boolean> {
  try {
    await stream.close()
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Extend barrel**

Append to `src/index.ts`:

```ts
export { safeClose, safeEnqueue } from './run/safe-stream'
```

- [ ] **Step 5: Run, pass**

Run: `pnpm --filter @seta/agent-core test:unit && pnpm --filter @seta/agent-core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add platform/agent/core/src/run/safe-stream.ts platform/agent/core/src/run/safe-stream.test.ts platform/agent/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(agent-core): safeEnqueue + safeClose — Hono SSE write wrappers

Mirror Mastra's safeEnqueue/safeClose pattern from
mastra/packages/core/src/stream/base/input.ts:14-47, but built over
Hono's SSEStreamingApi.writeSSE instead of ReadableStreamDefaultController.
Both return a boolean: true on success, false when the underlying call
throws (most commonly because the client disconnected mid-write).
streamKernelSSE uses these so a closed client doesn't crash the kernel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: FakeAdapter (testkit) + testkit subpath barrel

**Files:**
- Create: `platform/agent/core/src/testkit/fake-adapter.ts`
- Create: `platform/agent/core/src/testkit/fake-adapter.test.ts`
- Create: `platform/agent/core/src/testkit/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { FakeAdapter } from './fake-adapter'
import type { AdapterRequest, KernelChunk, RunCtx } from '../types'

function reqAndCtx(): { req: AdapterRequest; ctx: RunCtx } {
  const ctrl = new AbortController()
  return {
    req: { model: 'fake-model', messages: [] },
    ctx: {
      runId: 'r1',
      signal: ctrl.signal,
      retryCount: 0,
      now: () => 0,
      generateId: () => 'id',
      currentDate: () => new Date(0),
    },
  }
}

describe('FakeAdapter', () => {
  it('emits scripted chunks in order', async () => {
    const a = new FakeAdapter({
      chunks: [
        { type: 'text', delta: 'hello ' },
        { type: 'text', delta: 'world' },
        { type: 'finish', reason: 'stop' },
      ],
    })
    const { req, ctx } = reqAndCtx()
    const stream = await a.stream(req, ctx)
    const got: KernelChunk[] = []
    for await (const c of stream) got.push(c)
    expect(got).toHaveLength(3)
    expect(got[0]).toEqual({ type: 'text', delta: 'hello ' })
  })

  it('finalMessage reconstructs from text chunks by default', async () => {
    const a = new FakeAdapter({
      chunks: [
        { type: 'text', delta: 'hi ' },
        { type: 'text', delta: 'there' },
        { type: 'finish', reason: 'stop' },
      ],
    })
    const { req, ctx } = reqAndCtx()
    const stream = await a.stream(req, ctx)
    for await (const _ of stream) { /* drain */ }
    const final = await stream.finalMessage()
    expect(final.role).toBe('assistant')
    expect(final.content).toEqual([{ type: 'text', text: 'hi there' }])
  })

  it('finalMessage prefers explicit script.finalMessage when provided', async () => {
    const explicit = {
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: 'override' }],
    }
    const a = new FakeAdapter({
      chunks: [{ type: 'finish', reason: 'stop' }],
      finalMessage: explicit,
    })
    const { req, ctx } = reqAndCtx()
    const stream = await a.stream(req, ctx)
    for await (const _ of stream) { /* drain */ }
    expect(await stream.finalMessage()).toBe(explicit)
  })

  it('honors abort signal between chunks', async () => {
    const ctrl = new AbortController()
    const a = new FakeAdapter({
      chunks: [
        { type: 'text', delta: '1' },
        { type: 'text', delta: '2' },
        { type: 'text', delta: '3' },
      ],
    })
    const ctx: RunCtx = {
      runId: 'r1',
      signal: ctrl.signal,
      retryCount: 0,
      now: () => 0,
      generateId: () => 'id',
      currentDate: () => new Date(0),
    }
    const stream = await a.stream({ model: 'fake', messages: [] }, ctx)
    const got: KernelChunk[] = []
    let i = 0
    try {
      for await (const c of stream) {
        got.push(c)
        if (++i === 1) ctrl.abort()
      }
      throw new Error('expected abort to throw')
    } catch (e) {
      expect((e as Error).name).toBe('AbortError')
    }
    expect(got).toHaveLength(1)
  })

  it('abort() method aborts the in-flight stream', async () => {
    const a = new FakeAdapter({
      chunks: [
        { type: 'text', delta: '1' },
        { type: 'text', delta: '2' },
      ],
      delayMs: 100,
    })
    const { req, ctx } = reqAndCtx()
    const stream = await a.stream(req, ctx)
    setTimeout(() => stream.abort(), 10)
    const got: KernelChunk[] = []
    try {
      for await (const c of stream) got.push(c)
    } catch (e) {
      expect((e as Error).name).toBe('AbortError')
    }
    expect(got.length).toBeLessThan(2)
  })

  it('throwOn injects an error after N chunks', async () => {
    const a = new FakeAdapter({
      chunks: [
        { type: 'text', delta: 'a' },
        { type: 'text', delta: 'b' },
      ],
      throwOn: { afterChunks: 1, error: new Error('boom') },
    })
    const { req, ctx } = reqAndCtx()
    const stream = await a.stream(req, ctx)
    const got: KernelChunk[] = []
    try {
      for await (const c of stream) got.push(c)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as Error).message).toBe('boom')
    }
    expect(got).toHaveLength(1)
  })

  it('provider id is fake', () => {
    const a = new FakeAdapter({ chunks: [] })
    expect(a.provider).toBe('fake')
  })
})
```

- [ ] **Step 2: Run, fail**

Run: `pnpm --filter @seta/agent-core test:unit -t FakeAdapter`
Expected: FAIL.

- [ ] **Step 3: Write `testkit/fake-adapter.ts`**

```ts
import type {
  AdapterRequest,
  KernelChunk,
  KernelMessage,
  ModelStream,
  RunCtx,
} from '../types'
import type { ModelAdapter } from '../models/adapter'

export interface FakeAdapterScript {
  chunks: KernelChunk[]
  delayMs?: number
  finalMessage?: KernelMessage
  throwOn?: { afterChunks: number; error: unknown }
}

function makeAbortError(): Error {
  const e = new Error('aborted')
  e.name = 'AbortError'
  return e
}

class FakeStream implements ModelStream<KernelChunk> {
  private aborted = false
  constructor(
    private readonly script: FakeAdapterScript,
    private readonly ctx: RunCtx,
  ) {}

  abort(): void {
    this.aborted = true
  }

  async *[Symbol.asyncIterator](): AsyncIterator<KernelChunk> {
    let emitted = 0
    for (const chunk of this.script.chunks) {
      if (this.aborted || this.ctx.signal.aborted) throw makeAbortError()
      if (this.script.delayMs && this.script.delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => {
            this.ctx.signal.removeEventListener('abort', onAbort)
            resolve()
          }, this.script.delayMs)
          const onAbort = () => {
            clearTimeout(t)
            reject(makeAbortError())
          }
          if (this.ctx.signal.aborted) {
            clearTimeout(t)
            reject(makeAbortError())
            return
          }
          this.ctx.signal.addEventListener('abort', onAbort, { once: true })
        })
      }
      if (this.aborted || this.ctx.signal.aborted) throw makeAbortError()
      yield chunk
      emitted++
      if (
        this.script.throwOn &&
        emitted === this.script.throwOn.afterChunks
      ) {
        throw this.script.throwOn.error
      }
    }
  }

  async finalMessage(): Promise<KernelMessage> {
    if (this.script.finalMessage) return this.script.finalMessage
    const text = this.script.chunks
      .filter((c): c is { type: 'text'; delta: string } => c.type === 'text')
      .map((c) => c.delta)
      .join('')
    return { role: 'assistant', content: [{ type: 'text', text }] }
  }
}

export class FakeAdapter implements ModelAdapter {
  readonly provider = 'fake'
  constructor(private readonly script: FakeAdapterScript) {}
  async stream(_req: AdapterRequest, ctx: RunCtx): Promise<ModelStream<KernelChunk>> {
    return new FakeStream(this.script, ctx)
  }
}
```

- [ ] **Step 4: Write `testkit/index.ts`**

```ts
export { FakeAdapter } from './fake-adapter'
export type { FakeAdapterScript } from './fake-adapter'
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @seta/agent-core test:unit && pnpm --filter @seta/agent-core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add platform/agent/core/src/testkit/
git commit -m "$(cat <<'EOF'
feat(agent-core): FakeAdapter under src/testkit/

FakeAdapter implements ModelAdapter and emits a scripted KernelChunk
sequence. Honors abort (both stream.abort() and ctx.signal.aborted),
optional inter-chunk delay, and a throwOn injection point for testing
the error branch. finalMessage either uses an explicit script value or
reconstructs an assistant message from concatenated text deltas.

Lives at the @seta/agent-core/testkit subpath so production consumers
don't pull it through the main barrel. The MSW recording testkit
(setupLLMRecording) lands in K1.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: run() — single-iteration async generator

**Files:**
- Create: `platform/agent/core/src/run/run.ts`
- Create: `platform/agent/core/src/run/run.test.ts`
- Modify: `platform/agent/core/src/index.ts` (barrel)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { run } from './run'
import { createAdapterRegistry } from '../models/registry'
import { FakeAdapter } from '../testkit/fake-adapter'
import { NullMemoryProvider } from '../memory/null-provider'
import type { AgentConfig, KernelChunk, MemoryProvider, RunInput } from '../types'

function setup(scriptChunks: KernelChunk[]) {
  const adapters = createAdapterRegistry()
  adapters.register('fake', new FakeAdapter({ chunks: scriptChunks }))
  return { adapters }
}

const baseInput: RunInput = {
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
}

describe('run()', () => {
  it('emits chunks from the adapter in order', async () => {
    const cfg: AgentConfig = { model: 'fake/test' }
    const { adapters } = setup([
      { type: 'text', delta: 'hello' },
      { type: 'finish', reason: 'stop' },
    ])
    const got: KernelChunk[] = []
    for await (const c of run(cfg, baseInput, { adapters })) got.push(c)
    expect(got).toEqual([
      { type: 'text', delta: 'hello' },
      { type: 'finish', reason: 'stop' },
    ])
  })

  it('calls memory.recall before streaming and saveTurn after', async () => {
    const mem: MemoryProvider = {
      recall: vi.fn(async () => ({
        messages: [{ role: 'user', content: [{ type: 'text', text: 'prior' }] }],
        total: 1,
        page: 1,
        perPage: 1,
        hasMore: false,
      })),
      saveTurn: vi.fn(async () => {}),
      getWorkingMemory: vi.fn(async () => null),
      updateWorkingMemory: vi.fn(async () => {}),
    }
    const cfg: AgentConfig = { model: 'fake/test' }
    const { adapters } = setup([
      { type: 'text', delta: 'reply' },
      { type: 'finish', reason: 'stop' },
    ])
    for await (const _ of run(cfg, baseInput, { adapters, memory: mem })) {
      /* drain */
    }
    expect(mem.recall).toHaveBeenCalledOnce()
    expect(mem.saveTurn).toHaveBeenCalledOnce()
    const saved = (mem.saveTurn as ReturnType<typeof vi.fn>).mock.calls[0][1] as unknown[]
    expect(saved.length).toBe(2) // input + assistant final
  })

  it('defaults to NullMemoryProvider when memory not supplied', async () => {
    const recallSpy = vi.spyOn(NullMemoryProvider.prototype, 'recall')
    const cfg: AgentConfig = { model: 'fake/test' }
    const { adapters } = setup([{ type: 'finish', reason: 'stop' }])
    for await (const _ of run(cfg, baseInput, { adapters })) { /* drain */ }
    expect(recallSpy).toHaveBeenCalled()
    recallSpy.mockRestore()
  })

  it('yields abort chunk when ctx.signal aborts mid-stream', async () => {
    const ctrl = new AbortController()
    const adapters = createAdapterRegistry()
    adapters.register(
      'fake',
      new FakeAdapter({
        chunks: [
          { type: 'text', delta: '1' },
          { type: 'text', delta: '2' },
          { type: 'text', delta: '3' },
        ],
      }),
    )
    const cfg: AgentConfig = { model: 'fake/test' }
    const got: KernelChunk[] = []
    let i = 0
    for await (const c of run(cfg, baseInput, { adapters, signal: ctrl.signal })) {
      got.push(c)
      if (++i === 1) ctrl.abort()
    }
    expect(got[got.length - 1]).toEqual({ type: 'abort' })
  })

  it('yields error chunk on adapter throw (non-abort)', async () => {
    const adapters = createAdapterRegistry()
    adapters.register(
      'fake',
      new FakeAdapter({
        chunks: [{ type: 'text', delta: 'x' }],
        throwOn: { afterChunks: 1, error: { status: 500, message: 'boom' } },
      }),
    )
    const cfg: AgentConfig = { model: 'fake/test' }
    const got: KernelChunk[] = []
    for await (const c of run(cfg, baseInput, { adapters })) got.push(c)
    const last = got[got.length - 1]
    expect(last.type).toBe('error')
    if (last.type === 'error') expect(last.error.code).toBe('UNKNOWN_KERNEL_ERROR')
  })

  it('yields error chunk when provider is unregistered', async () => {
    const adapters = createAdapterRegistry()
    const cfg: AgentConfig = { model: 'cohere/r-plus' }
    const got: KernelChunk[] = []
    for await (const c of run(cfg, baseInput, { adapters })) got.push(c)
    expect(got).toHaveLength(1)
    expect(got[0].type).toBe('error')
    if (got[0].type === 'error') expect(got[0].error.code).toBe('ADAPTER_NOT_REGISTERED')
  })

  it('auto-defaults cacheTtl to 5m when systemPrompt > 2048 chars', async () => {
    const seenReqs: unknown[] = []
    const sentinelAdapter = {
      provider: 'fake',
      async stream(req: unknown) {
        seenReqs.push(req)
        return new FakeAdapter({ chunks: [{ type: 'finish', reason: 'stop' }] }).stream(
          req as Parameters<FakeAdapter['stream']>[0],
          {
            runId: 'x',
            signal: new AbortController().signal,
            retryCount: 0,
            now: () => 0,
            generateId: () => 'x',
            currentDate: () => new Date(0),
          },
        )
      },
    }
    const adapters = createAdapterRegistry()
    adapters.register('fake', sentinelAdapter as never)
    const cfg: AgentConfig = { model: 'fake/test', systemPrompt: 'x'.repeat(2049) }
    for await (const _ of run(cfg, baseInput, { adapters })) { /* drain */ }
    expect((seenReqs[0] as { cacheTtl: unknown }).cacheTtl).toBe('5m')
  })

  it('does not auto-set cacheTtl when systemPrompt is short', async () => {
    const seenReqs: unknown[] = []
    const sentinelAdapter = {
      provider: 'fake',
      async stream(req: unknown) {
        seenReqs.push(req)
        return new FakeAdapter({ chunks: [{ type: 'finish', reason: 'stop' }] }).stream(
          req as Parameters<FakeAdapter['stream']>[0],
          {
            runId: 'x',
            signal: new AbortController().signal,
            retryCount: 0,
            now: () => 0,
            generateId: () => 'x',
            currentDate: () => new Date(0),
          },
        )
      },
    }
    const adapters = createAdapterRegistry()
    adapters.register('fake', sentinelAdapter as never)
    const cfg: AgentConfig = { model: 'fake/test', systemPrompt: 'short' }
    for await (const _ of run(cfg, baseInput, { adapters })) { /* drain */ }
    expect((seenReqs[0] as { cacheTtl: unknown }).cacheTtl).toBe(null)
  })

  it('aborts the underlying model stream on consumer break (generator.return)', async () => {
    const abortSpy = vi.fn()
    const stoppingAdapter = {
      provider: 'fake',
      async stream() {
        return {
          abort: abortSpy,
          finalMessage: async () => ({ role: 'assistant' as const, content: [] }),
          async *[Symbol.asyncIterator]() {
            yield { type: 'text', delta: 'a' } as KernelChunk
            yield { type: 'text', delta: 'b' } as KernelChunk
            yield { type: 'text', delta: 'c' } as KernelChunk
          },
        }
      },
    }
    const adapters = createAdapterRegistry()
    adapters.register('fake', stoppingAdapter as never)
    const cfg: AgentConfig = { model: 'fake/test' }
    const iter = run(cfg, baseInput, { adapters })[Symbol.asyncIterator]()
    await iter.next()
    await iter.return?.(undefined)
    expect(abortSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, fail**

Run: `pnpm --filter @seta/agent-core test:unit -t "run()"`
Expected: FAIL — `run` module not found.

- [ ] **Step 3: Write `run/run.ts`**

```ts
import { createRunCtx } from './make-run-ctx'
import { prepareTools } from '../models/prepare-tools'
import { NullMemoryProvider } from '../memory/null-provider'
import { isAbortError } from '../errors/classify'
import { kernelErrorOf } from '../errors'
import type {
  AdapterRequest,
  AgentConfig,
  KernelChunk,
  MemoryContext,
  RunInput,
  RunLoopOptions,
} from '../types'

const CACHE_TTL_AUTO_THRESHOLD = 2048

export async function* run(
  cfg: AgentConfig,
  input: RunInput,
  opts: RunLoopOptions,
): AsyncIterable<KernelChunk> {
  const ctx = createRunCtx({
    signal: opts.signal ?? new AbortController().signal,
    generateId: opts.generateId,
    now: opts.now,
    currentDate: opts.currentDate,
  })

  const memory = opts.memory ?? new NullMemoryProvider()
  const memCtx: MemoryContext = {
    threadId: input.threadId ?? ctx.runId,
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    scope: 'thread',
  }

  try {
    const recall = await memory.recall(memCtx)
    const { adapter, bareModel } = opts.adapters.select(cfg.model)
    const messages = [...recall.messages, ...input.messages]
    const tools = cfg.tools && cfg.tools.length > 0 ? prepareTools(cfg.tools) : undefined
    const systemPrompt = cfg.systemPrompt
    const cacheTtl =
      cfg.cacheTtl !== undefined
        ? cfg.cacheTtl
        : systemPrompt && systemPrompt.length > CACHE_TTL_AUTO_THRESHOLD
          ? '5m'
          : null

    const req: AdapterRequest = {
      model: bareModel,
      messages,
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
      ...(tools !== undefined ? { tools } : {}),
      ...(cfg.maxTokens !== undefined ? { maxTokens: cfg.maxTokens } : {}),
      cacheTtl,
    }

    const stream = await opts.adapters
      .get(adapter.provider)!
      .stream(req, ctx) // eslint-disable-line @typescript-eslint/no-non-null-assertion

    try {
      try {
        for await (const chunk of stream) {
          if (ctx.signal.aborted) {
            yield { type: 'abort' }
            return
          }
          yield chunk
        }
      } finally {
        stream.abort()
      }
      const final = await stream.finalMessage()
      await memory.saveTurn(memCtx, [...input.messages, final])
    } catch (err) {
      if (isAbortError(err) && ctx.signal.aborted) {
        yield { type: 'abort' }
        return
      }
      yield { type: 'error', error: kernelErrorOf(err) }
    }
  } catch (err) {
    // Errors before the stream was even created (adapter.select failed, memory.recall failed).
    yield { type: 'error', error: kernelErrorOf(err) }
  }
}
```

- [ ] **Step 4: Extend barrel**

Append to `src/index.ts`:

```ts
export { run } from './run/run'
```

- [ ] **Step 5: Run all tests + typecheck**

Run: `pnpm --filter @seta/agent-core test:unit && pnpm --filter @seta/agent-core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add platform/agent/core/src/run/run.ts platform/agent/core/src/run/run.test.ts platform/agent/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(agent-core): run() single-iteration scaffold

Async generator that runs one inner step: memory.recall → adapter.stream
→ yield chunks (re-checking signal per chunk) → memory.saveTurn. The
inner try/finally calls stream.abort() on consumer break (via
iterator.return), so streamKernelSSE's client-disconnect path propagates
all the way to the LLM SDK.

K1 single-step only; outer tool-call iteration (accumulatedSteps,
stopWhen, fallback models, concurrent tool execution) lands in K4.
cacheTtl auto-defaults to '5m' when systemPrompt > 2048 chars per
setup.md §5; honored by the Anthropic adapter in K2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: streamKernelSSE — Hono SSE helper

**Files:**
- Create: `platform/agent/core/src/sse/stream-kernel-sse.ts`
- Create: `platform/agent/core/src/sse/stream-kernel-sse.test.ts`
- Modify: `platform/agent/core/src/index.ts` (barrel)

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { streamKernelSSE } from './stream-kernel-sse'
import type { KernelChunk } from '../types'

function makeApp(produce: () => AsyncIterable<KernelChunk>): Hono {
  const app = new Hono()
  app.get('/stream', (c) => streamKernelSSE(c, produce()))
  return app
}

async function readSse(res: Response, max = 50): Promise<string[]> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  const frames: string[] = []
  let buf = ''
  while (frames.length < max) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n\n')) >= 0) {
      frames.push(buf.slice(0, nl))
      buf = buf.slice(nl + 2)
    }
  }
  return frames
}

describe('streamKernelSSE', () => {
  it('emits one SSE frame per chunk with event=<chunk.type>', async () => {
    async function* run(): AsyncIterable<KernelChunk> {
      yield { type: 'text', delta: 'hi' }
      yield { type: 'finish', reason: 'stop' }
    }
    const app = makeApp(run)
    const res = await app.request('/stream')
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const frames = await readSse(res, 3)
    expect(frames.some((f) => f.includes('event: text') && f.includes('"delta":"hi"'))).toBe(true)
    expect(frames.some((f) => f.includes('event: finish'))).toBe(true)
  })

  it('emits an error frame when run yields type:error', async () => {
    const { LlmError } = await import('../errors')
    const err = new LlmError({ code: 'X', category: 'THIRD_PARTY', message: 'boom' })
    async function* run(): AsyncIterable<KernelChunk> {
      yield { type: 'error', error: err }
    }
    const app = makeApp(run)
    const res = await app.request('/stream')
    const frames = await readSse(res, 3)
    expect(frames.some((f) => f.includes('event: error') && f.includes('"code":"X"'))).toBe(true)
  })

  it('calls iter.return() to interrupt the generator on client abort', async () => {
    const returnSpy = vi.fn()
    const iter: AsyncIterator<KernelChunk> & { _consumed: number } = {
      _consumed: 0,
      async next() {
        this._consumed++
        if (this._consumed === 1) return { value: { type: 'text', delta: 'a' }, done: false }
        await new Promise((r) => setTimeout(r, 1000))
        return { value: undefined as never, done: true }
      },
      async return(value?: unknown) {
        returnSpy(value)
        return { value: undefined as never, done: true }
      },
    }
    const fakeIterable: AsyncIterable<KernelChunk> = { [Symbol.asyncIterator]: () => iter }
    const app = new Hono()
    app.get('/stream', (c) => streamKernelSSE(c, fakeIterable))
    const ctrl = new AbortController()
    const reqP = app.request('/stream', { signal: ctrl.signal })
    // Begin reading and then abort.
    setTimeout(() => ctrl.abort(), 50)
    try {
      await (await reqP).text()
    } catch {
      /* abort throws on the client side */
    }
    // Allow microtask queue to flush the onAbort handler.
    await new Promise((r) => setTimeout(r, 50))
    expect(returnSpy).toHaveBeenCalled()
  })
})
```

Note: the third test is a bit awkward because Hono's in-process test request transport may not faithfully simulate a mid-stream abort. If the test proves flaky in CI, mark it `.skip` with a TODO comment pointing at the K2 integration test that will exercise this against a real HTTP listener.

- [ ] **Step 2: Run, fail**

Run: `pnpm --filter @seta/agent-core test:unit -t streamKernelSSE`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `sse/stream-kernel-sse.ts`**

```ts
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { logger } from '@seta/observability'
import { kernelErrorOf } from '../errors'
import { isAbortError } from '../errors/classify'
import { safeEnqueue } from '../run/safe-stream'
import type { KernelChunk } from '../types'

const KEEPALIVE_MS = 15_000

export function streamKernelSSE(c: Context, run: AsyncIterable<KernelChunk>): Response {
  return streamSSE(
    c,
    async (sse) => {
      const iter = run[Symbol.asyncIterator]()

      sse.onAbort(() => {
        // Calling .return() on the generator unwinds it through any finally
        // blocks — that's how run()'s `stream.abort()` ends up firing and the
        // LLM SDK actually stops streaming tokens.
        void iter.return?.(undefined)
      })

      const keepalive = setInterval(() => {
        void safeEnqueue(sse, { event: 'ping', data: '' })
      }, KEEPALIVE_MS)

      try {
        while (true) {
          const { value, done } = await iter.next()
          if (done) break
          await safeEnqueue(sse, { event: value.type, data: JSON.stringify(value) })
        }
      } finally {
        clearInterval(keepalive)
      }
    },
    async (err, sse) => {
      // Third-arg error handler. Split abort-vs-error per
      // mastra/packages/core/src/loop/workflows/agentic-execution/llm-execution-step.ts:1316-1331:
      // client disconnect is expected; everything else is an alert-worthy error.
      if (isAbortError(err)) {
        logger.debug({ err }, 'kernel SSE aborted')
        await safeEnqueue(sse, { event: 'abort', data: '{}' })
      } else {
        logger.error({ err }, 'kernel SSE failed')
        await safeEnqueue(sse, {
          event: 'error',
          data: JSON.stringify(kernelErrorOf(err).toJSON()),
        })
      }
    },
  )
}
```

- [ ] **Step 4: Extend barrel**

Append to `src/index.ts`:

```ts
export { streamKernelSSE } from './sse/stream-kernel-sse'
```

- [ ] **Step 5: Run, pass**

Run: `pnpm --filter @seta/agent-core test:unit && pnpm --filter @seta/agent-core typecheck`
Expected: PASS. If the third test (`iter.return on abort`) is flaky, `.skip` it with a TODO.

- [ ] **Step 6: Commit**

```bash
git add platform/agent/core/src/sse/ platform/agent/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(agent-core): streamKernelSSE — Hono SSE helper

Single helper that wires the three things setup.md §5 lines 397-426
require: stream.onAbort before the loop (calls iter.return() on the
generator to propagate disconnect through run()'s finally → stream.abort
→ LLM SDK), 15s keep-alive pings cleared in finally, third-arg error
handler that splits AbortError (debug log + 'abort' event) from real
failures (error log + 'error' event with KernelErrorJSON payload).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Verify build emits both entry points

**Files:**
- (verify only) `platform/agent/core/dist/index.js`
- (verify only) `platform/agent/core/dist/testkit/index.js`

- [ ] **Step 1: Run the build**

Run: `pnpm --filter @seta/agent-core build`
Expected: tsup builds both entries, produces `dist/index.js`, `dist/index.d.ts`, `dist/testkit/index.js`, `dist/testkit/index.d.ts`.

- [ ] **Step 2: Verify file structure**

Run: `ls platform/agent/core/dist/ platform/agent/core/dist/testkit/`
Expected output includes: `index.js`, `index.d.ts`, `index.js.map`, `testkit/index.js`, `testkit/index.d.ts`, `testkit/index.js.map`.

- [ ] **Step 3: Verify exports resolve**

Run:
```bash
node --input-type=module -e "
import * as core from '@seta/agent-core'
import * as testkit from '@seta/agent-core/testkit'
console.log('core:', Object.keys(core).sort().join(','))
console.log('testkit:', Object.keys(testkit).sort().join(','))
"
```

This may fail because we run from repo root and node won't find the workspace package by name. Instead resolve via the absolute path:

```bash
node --input-type=module -e "
import * as core from '/Users/canh/Projects/Seta/seta-os/platform/agent/core/dist/index.js'
import * as testkit from '/Users/canh/Projects/Seta/seta-os/platform/agent/core/dist/testkit/index.js'
console.log('core:', Object.keys(core).sort().join(','))
console.log('testkit:', Object.keys(testkit).sort().join(','))
"
```

Expected: `core:` lists `AgentError, KernelError, LlmError, NullMemoryProvider, ToolError, ToolValidationError, classifyError, createAdapterRegistry, createRunCtx, isAbortError, kernelErrorOf, prepareTools, run, safeClose, safeEnqueue, streamKernelSSE, withRetry` (alphabetical) plus type-only re-exports (which won't appear as runtime keys).

`testkit:` lists `FakeAdapter`.

- [ ] **Step 4: No-op commit (build artifacts are gitignored)**

No commit. Move to Task 14.

---

## Task 14: ADR-0010 — Agent kernel boundary

**Files:**
- Create: `docs/adr/0010-agent-kernel-boundary.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR 0010 — Agent kernel boundary (`@seta/agent-core`)

- Status: Accepted
- Date: 2026-05-12
- Deciders: Platform team
- Spec: `docs/superpowers/specs/2026-05-12-agent-core-k1-design.md`

## Context

`@seta/agent-core` is the framework-free agent kernel for the Seta agent
platform. Other packages (`@seta/agent-memory`, `@seta/agent-workflows`,
`@seta/agent-sdk`, every `modules/products/agent/*` agent, every
`modules/channels/*` handler) depend on it. Its public surface needs to
hold across the K-track (K1–K6) without disruptive rewrites, so the
boundaries are worth pinning explicitly.

## Decision

Four boundary decisions are accepted as of K1:

### 1. Direct SDK use over the AI SDK

The kernel imports `openai` and `@anthropic-ai/sdk` directly (in K2 and
K3) rather than going through Vercel AI SDK's `LanguageModelV2`/`V3`
abstraction. Trade-off: two type systems instead of one; in exchange we
get `cache_control` on Anthropic tool definitions and OpenAI
prompt-cache hints without waiting for AI-SDK passthrough. Cite the
2026-05-12 Mastra spike (`docs/explorations/2026-05-12-mastra-spike/02-agent-core.md:37`,
`10-llm-model-router.md:38`).

### 2. Two-part provider IDs + per-instance adapter config

Model IDs are `<provider>/<model>` (`anthropic/claude-4-7-sonnet`,
`openai/gpt-5`). The `OpenAIAdapter` constructor accepts
`{ baseURL?, apiKey?, ... }`; the composition root in `apps/api/main.ts`
decides whether `openai/*` routes to OpenAI proper, Azure, LiteLLM,
Ollama, or any other OpenAI-compatible endpoint. **Explicitly rejected:**
Mastra's gateway abstraction (gateways/, `MastraModelGateway`); cite
`10-llm-model-router.md:40`.

### 3. Adapter registry as factory + injection, not module singleton

`createAdapterRegistry()` returns a closure-backed instance with
`register/get/select` methods. The instance is passed to `run()` via
`RunLoopOptions.adapters`. This mirrors `createConnectorRegistry`
(`platform/connector-registry`) and satisfies CLAUDE.md "no DI
container, no plugin loader, no runtime discovery." `apps/api/main.ts`
remains the only place that calls `register()`.

### 4. No event bus, no typed RequestContext map

No `mitt`/EventEmitter fire-and-forget event bus in the kernel (Mastra's
`hooks/index.ts` pattern is explicitly rejected — it defeats OTel span
correlation; cite `02-agent-core.md:36`). No mutable typed
`RequestContext` map (`02-agent-core.md:42`). Every call passes an
explicit `RunCtx` parameter. Tenant id is read from
`tenantContext.getTenantId()` (`@seta/tenant` ALS), never on
`ToolExecutionContext` / `MemoryContext` (CLAUDE.md "Footguns").

## Consequences

- **Two adapter implementations** (Anthropic, OpenAI) maintained in
  parallel; cross-provider feature drift surfaces as untyped fields in
  `AdapterRequest`. Acceptable for two providers; revisit if a third
  (Gemini, Bedrock) lands.
- **Composition cost in `main.ts`** — every new provider variant
  (e.g., Azure OpenAI vs OpenAI proper) is an explicit `register()`
  call. Trade-off vs Mastra's auto-resolved gateway: predictability and
  greppability for verbosity.
- **No cross-cutting events** — features that would naturally be
  EventEmitter-style (per-tool budgets, audit fan-out, eval hooks) must
  go through the `Processor` seam (`@seta/agent-core` reserves three of
  Mastra's eight hooks).

## Alternatives considered

- **Adopt AI SDK as substrate** — rejected: pulls a third type system
  over the two we already pin; v2/v3 spec dual-coding is overhead for two
  providers (`10-llm-model-router.md:38`).
- **Module-level adapter registry** — rejected: violates CLAUDE.md
  boundary rules and makes tests order-sensitive.
- **Mastra-style `Mastra` god class + `__registerMastra` back-pointer**
  — rejected: directly conflicts with "no DI container" rule
  (`02-agent-core.md:35`).

## Follow-ups

- K2 wires the first concrete adapter (Anthropic) in `apps/api/main.ts`.
- K3 wires the OpenAI adapter with `baseURL` knob for OpenAI-compatible
  endpoints (Azure, LiteLLM, Ollama).
- K4 enables the tool-call iteration loop (`accumulatedSteps`,
  `stopWhen`, fallback models, concurrent tool execution) and the
  Processor hooks fire.
- K1.5 (parallel to K2) adds the MSW recording testkit
  (`setupLLMRecording`) under `@seta/agent-core/testkit`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0010-agent-kernel-boundary.md
git commit -m "$(cat <<'EOF'
docs(adr): 0010 — agent kernel boundary

Records the four decisions pinned by the K1 spec: direct SDK use over
AI-SDK, two-part provider IDs with per-instance adapter config, factory
adapter registry (not module singleton), and no event bus / no typed
RequestContext map.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Final acceptance gate — full package green

**Files:**
- (none — runs all package commands top to bottom)

- [ ] **Step 1: Lint**

Run: `pnpm --filter @seta/agent-core lint`

If `lint` script doesn't exist at the package level, run the repo-level Biome:
```bash
pnpm exec biome check platform/agent/core
```

Expected: zero diagnostics. If Biome flags `import type` placement or any other rule, fix and continue.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/agent-core typecheck`
Expected: PASS, no errors.

- [ ] **Step 3: Unit tests with coverage**

Run: `pnpm --filter @seta/agent-core test:unit`
Expected: all tests pass. Roughly 60+ tests across:

- `types/types.test.ts` — type shape assertions (~15 tests)
- `errors/index.test.ts` — KernelError + subclasses + kernelErrorOf (~10 tests)
- `errors/classify.test.ts` — classifyError + isAbortError (~12 tests)
- `models/registry.test.ts` — createAdapterRegistry (~7 tests)
- `models/prepare-tools.test.ts` — Zod → JSON Schema fixups (~8 tests)
- `models/retry.test.ts` — withRetry (~8 tests)
- `memory/null-provider.test.ts` (~4 tests)
- `run/make-run-ctx.test.ts` (~3 tests)
- `run/safe-stream.test.ts` (~5 tests)
- `run/run.test.ts` (~9 tests)
- `sse/stream-kernel-sse.test.ts` (~3 tests)
- `testkit/fake-adapter.test.ts` (~7 tests)
- `index.test.ts` (1 smoke)

- [ ] **Step 4: Build**

Run: `pnpm --filter @seta/agent-core build`
Expected: tsup emits both entries to `dist/`.

- [ ] **Step 5: Confirm no edits leaked into other packages**

Run:
```bash
git diff --name-only main...HEAD | grep -v '^platform/agent/core/' | grep -v '^docs/' | grep -v '^pnpm-lock.yaml$'
```

Expected: empty output. K1 should not have modified any other workspace package or `apps/api`. If anything lists, audit it; it's likely a stray edit.

- [ ] **Step 6: Final commit if any lint fixes**

If any lint fixes were needed in Step 1:

```bash
git add platform/agent/core/
git commit -m "$(cat <<'EOF'
chore(agent-core): lint fixes for K1 acceptance gate

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Otherwise skip.

- [ ] **Step 7: Summary report**

Print the final summary:

```
K1 acceptance gate — @seta/agent-core
- Files added: ~25 .ts files under platform/agent/core/src/ + ADR-0010
- Public exports: KernelChunk, ModelStream, ModelAdapter, AdapterRegistry,
  createAdapterRegistry, run, streamKernelSSE, NullMemoryProvider,
  KernelError + 4 subclasses, classifyError, isAbortError, prepareTools,
  withRetry, safeEnqueue, safeClose, createRunCtx, type vocabulary
- testkit subpath: FakeAdapter
- Zero LLM SDK imports
- All gates green: lint, typecheck, test:unit, build
- No edits outside platform/agent/core/ + docs/
- Follow-ups: K1.5 (MSW recording testkit, AG-F1), K2 (Anthropic adapter
  + first apps/api wire-up), K3 (OpenAI / OpenAI-compatible adapter), K4
  (tool-call iteration loop).
```

---

## Self-review checklist (run before opening the PR)

- [ ] Every task ends with a commit.
- [ ] No file modified outside `platform/agent/core/` except `docs/adr/0010-agent-kernel-boundary.md` and `pnpm-lock.yaml`.
- [ ] No `openai`, `@anthropic-ai/sdk`, or `msw` runtime imports in `platform/agent/core/src/**/*.ts` (grep to verify).
- [ ] Every public export from the barrel has at least one unit test.
- [ ] `pnpm --filter @seta/agent-core test:unit` runs in <10s on a warm Node.
- [ ] `apps/api/src/main.ts` is unchanged (K1 ships the package only).

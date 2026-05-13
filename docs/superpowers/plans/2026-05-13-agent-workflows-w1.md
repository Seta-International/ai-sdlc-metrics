# @seta/agent-workflows W1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land `@seta/agent-workflows` (`platform/agent/workflows/`) with a strictly-typed builder DSL (`createWorkflow`/`defineStep`/`.then`/`.parallel`/`.commit`), an in-memory runner (sequential + parallel), tenant-scoped step execution, OTel spans, and full unit + type-test coverage. No persistence — that lands in W2.

**Architecture:** Pure-TypeScript library mirroring Mastra's typing patterns (`packages/core/src/workflows/`) but reduced to the linear-DAG slice that SCOPE.md permits. The builder produces an opaque immutable graph; `run()` executes it in-process, propagating `tenantContext.run()` around each step body and wrapping each step in an OTel span. No Postgres, no `p-queue`, no `suspend`/`resume` — those are W2.

**Tech Stack:** TypeScript (ESM-only), Zod 4.4.3, `uuid` 14.0.0 (v7 for time-sortable run ids), Vitest 4.1.5 (unit + `expectTypeOf` type tests), `@opentelemetry/api` 1.9.1, tsup 8.5.1.

**Spec:** `docs/superpowers/specs/2026-05-13-agent-workflows-w1-design.md`

**Conventions to follow throughout:**
- All commands run from repo root unless noted.
- Every code block is complete — no `// ...` placeholders.
- Each task ends with one focused commit. Conventional Commit format: `feat(agent-workflows): ...`.
- Co-located unit tests `src/**/*.test.ts`. Type tests `src/**/*.test-d.ts`.
- Imports use workspace package names, never relative paths across packages.
- `import type` for type-only imports.

---

## Task 1: Scaffold the package

**Files:**
- Create: `platform/agent/workflows/package.json` (via scaffolder)
- Create: `platform/agent/workflows/tsconfig.json` (via scaffolder)
- Create: `platform/agent/workflows/vitest.config.ts` (via scaffolder)
- Create: `platform/agent/workflows/src/index.ts` (via scaffolder, will be overwritten in later tasks)
- Existing: `platform/agent/workflows/SCOPE.md` (do not touch)

- [ ] **Step 1: Run the package scaffolder**

```bash
pnpm new:package --kind platform-agent --name workflows
```

If the scaffolder prompts interactively, accept defaults; package name resolves to `@seta/agent-workflows`. The scaffolder creates `package.json`, `tsconfig.json`, `vitest.config.ts`, and a stub `src/index.ts`, then runs `pnpm install`.

- [ ] **Step 2: Verify the directory layout**

```bash
ls platform/agent/workflows/
```

Expected output includes: `SCOPE.md  package.json  src  tsconfig.json  vitest.config.ts  node_modules`

- [ ] **Step 3: Install the runtime dependencies**

```bash
pnpm --filter @seta/agent-workflows add zod@4.4.3 uuid@14.0.0 @opentelemetry/api@1.9.1
pnpm --filter @seta/agent-workflows add @seta/agent-core@workspace:* @seta/tenant@workspace:* @seta/observability@workspace:* @seta/middleware@workspace:*
```

- [ ] **Step 4: Verify install + typecheck of empty package**

```bash
pnpm --filter @seta/agent-workflows typecheck
```

Expected: PASS (the stub `src/index.ts` from the scaffolder type-checks trivially).

- [ ] **Step 5: Commit**

```bash
git add platform/agent/workflows/package.json platform/agent/workflows/tsconfig.json platform/agent/workflows/vitest.config.ts platform/agent/workflows/src/index.ts pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(agent-workflows): scaffold package skeleton

Creates @seta/agent-workflows under platform/agent/workflows/ with zod,
uuid, @opentelemetry/api, and workspace deps on agent-core, tenant,
observability, middleware. Source is empty pending W1 implementation tasks.
EOF
)"
```

---

## Task 2: Errors module

**Files:**
- Create: `platform/agent/workflows/src/errors.ts`
- Create: `platform/agent/workflows/src/errors.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `platform/agent/workflows/src/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DomainError } from '@seta/middleware'
import {
  StepExecutionError,
  StepInputValidationError,
  StepOutputValidationError,
  WorkflowBailed,
  WorkflowBuildError,
  WorkflowError,
} from './errors'

describe('WorkflowError hierarchy', () => {
  it('WorkflowError extends DomainError', () => {
    const e = new WorkflowError(500, 'boom')
    expect(e).toBeInstanceOf(DomainError)
    expect(e).toBeInstanceOf(WorkflowError)
    expect(e.message).toBe('boom')
  })

  it('WorkflowBuildError extends WorkflowError', () => {
    const e = new WorkflowBuildError('duplicate step id')
    expect(e).toBeInstanceOf(WorkflowError)
    expect(e.message).toBe('duplicate step id')
  })

  it('StepInputValidationError carries runId + stepId in detail', () => {
    const e = new StepInputValidationError({
      runId: 'r1',
      stepId: 's1',
      cause: new Error('bad'),
    })
    expect(e).toBeInstanceOf(WorkflowError)
    expect(e.detail).toMatchObject({ runId: 'r1', stepId: 's1' })
  })

  it('StepOutputValidationError carries runId + stepId in detail', () => {
    const e = new StepOutputValidationError({
      runId: 'r1',
      stepId: 's1',
      cause: new Error('bad'),
    })
    expect(e.detail).toMatchObject({ runId: 'r1', stepId: 's1' })
  })

  it('StepExecutionError carries cause + runId + stepId', () => {
    const cause = new Error('underlying')
    const e = new StepExecutionError({ runId: 'r1', stepId: 's1', cause })
    expect(e.cause).toBe(cause)
    expect(e.detail).toMatchObject({ runId: 'r1', stepId: 's1' })
  })

  it('WorkflowBailed extends WorkflowError', () => {
    const e = new WorkflowBailed('done early')
    expect(e).toBeInstanceOf(WorkflowError)
    expect(e.message).toBe('done early')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @seta/agent-workflows test -- errors
```

Expected: FAIL — module `./errors` not found.

- [ ] **Step 3: Implement `errors.ts`**

Create `platform/agent/workflows/src/errors.ts`:

```ts
import { DomainError } from '@seta/middleware'

const ERROR_TYPE_BASE = 'https://os.seta-international.com/errors/workflow'

export class WorkflowError extends DomainError {
  constructor(status: number, message: string, opts?: { type?: string; detail?: unknown; cause?: unknown }) {
    super(status, message, {
      type: opts?.type ?? `${ERROR_TYPE_BASE}/workflow-error`,
      detail: opts?.detail !== undefined ? JSON.stringify(opts.detail) : undefined,
      cause: opts?.cause,
    })
  }

  get detail(): unknown {
    const raw = (this as unknown as { problem?: { detail?: string } }).problem?.detail
    if (raw === undefined) return undefined
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
}

export class WorkflowBuildError extends WorkflowError {
  constructor(message: string) {
    super(500, message, { type: `${ERROR_TYPE_BASE}/build-error` })
  }
}

export interface StepErrorArgs {
  runId: string
  stepId: string
  cause: unknown
  message?: string
}

export class StepInputValidationError extends WorkflowError {
  constructor(args: StepErrorArgs) {
    super(400, args.message ?? `step ${args.stepId}: input validation failed`, {
      type: `${ERROR_TYPE_BASE}/step-input-validation`,
      detail: { runId: args.runId, stepId: args.stepId },
      cause: args.cause,
    })
  }
}

export class StepOutputValidationError extends WorkflowError {
  constructor(args: StepErrorArgs) {
    super(500, args.message ?? `step ${args.stepId}: output validation failed`, {
      type: `${ERROR_TYPE_BASE}/step-output-validation`,
      detail: { runId: args.runId, stepId: args.stepId },
      cause: args.cause,
    })
  }
}

export class StepExecutionError extends WorkflowError {
  constructor(args: StepErrorArgs) {
    super(500, args.message ?? `step ${args.stepId}: execution failed`, {
      type: `${ERROR_TYPE_BASE}/step-execution`,
      detail: { runId: args.runId, stepId: args.stepId },
      cause: args.cause,
    })
  }
}

export class WorkflowBailed extends WorkflowError {
  constructor(message: string) {
    super(200, message, { type: `${ERROR_TYPE_BASE}/bailed` })
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @seta/agent-workflows test -- errors
```

Expected: PASS (6 tests).

- [ ] **Step 5: Inspect `DomainError` to confirm `problem.detail` shape**

Run:

```bash
grep -n "detail" platform/middleware/src/errors/*.ts 2>/dev/null | head
```

If `DomainError` stores its detail somewhere other than `this.problem.detail`, adjust the `get detail()` getter in `errors.ts` to read from the actual field. (The agent-core errors file at `platform/agent/core/src/errors/index.ts` is the working reference; this getter only needs to satisfy the test expectations.)

- [ ] **Step 6: Re-run tests after any adjustment**

```bash
pnpm --filter @seta/agent-workflows test -- errors
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add platform/agent/workflows/src/errors.ts platform/agent/workflows/src/errors.test.ts
git commit -m "feat(agent-workflows): WorkflowError hierarchy"
```

---

## Task 3: Core types — `Step`, `StepCtx`, internal step representation

**Files:**
- Create: `platform/agent/workflows/src/types/step.ts`
- Create: `platform/agent/workflows/src/types/index.ts`

- [ ] **Step 1: Implement `types/step.ts`**

Create `platform/agent/workflows/src/types/step.ts`:

```ts
import type { Logger } from '@seta/observability'
import type { ZodType } from 'zod'

export interface StepCtx<TInput> {
  readonly input: TInput
  readonly runId: string
  readonly stepId: string
  readonly workflowId: string
  readonly tenantId: string
  readonly logger: Logger
  readonly signal: AbortSignal

  bail(reason?: string): never
}

export type StepExecuteFn<TIn, TOut> = (input: TIn, ctx: StepCtx<TIn>) => Promise<TOut>

declare const StepBrand: unique symbol

export interface Step<TIn, TOut, TId extends string = string> {
  readonly id: TId
  readonly inputSchema: ZodType<TIn>
  readonly outputSchema: ZodType<TOut>
  readonly execute: StepExecuteFn<TIn, TOut>
  readonly [StepBrand]: true
}

export type StepInput<S> = S extends Step<infer In, unknown, string> ? In : never
export type StepOutput<S> = S extends Step<unknown, infer Out, string> ? Out : never
export type StepId<S> = S extends Step<unknown, unknown, infer Id> ? Id : never
```

- [ ] **Step 2: Implement `types/index.ts` barrel**

Create `platform/agent/workflows/src/types/index.ts`:

```ts
export type { Step, StepCtx, StepExecuteFn, StepId, StepInput, StepOutput } from './step'
```

- [ ] **Step 3: Verify it type-checks**

```bash
pnpm --filter @seta/agent-workflows typecheck
```

Expected: PASS.

- [ ] **Step 4: Confirm `Logger` is exported from `@seta/observability`**

```bash
grep -n "export.*Logger" platform/observability/src/index.ts
```

If `Logger` isn't a named export (it may be exported as `type Logger` from a sub-module), update the import in `step.ts` to match — for example, `import type { Logger } from '@seta/observability'` may need to be `import type { Logger } from '@seta/observability/logger'`. Re-run typecheck.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/workflows/src/types/
git commit -m "feat(agent-workflows): Step / StepCtx core types"
```

---

## Task 4: `defineStep` factory

**Files:**
- Create: `platform/agent/workflows/src/define-step.ts`
- Create: `platform/agent/workflows/src/define-step.test.ts`

- [ ] **Step 1: Write failing test**

Create `platform/agent/workflows/src/define-step.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineStep } from './define-step'

describe('defineStep', () => {
  it('stores id, schemas, and execute', () => {
    const step = defineStep({
      id: 'review',
      inputSchema: z.object({ taskId: z.string() }),
      outputSchema: z.object({ approved: z.boolean() }),
      async execute(input) {
        return { approved: input.taskId.startsWith('ok') }
      },
    })

    expect(step.id).toBe('review')
    expect(step.inputSchema.safeParse({ taskId: 'abc' }).success).toBe(true)
    expect(step.outputSchema.safeParse({ approved: true }).success).toBe(true)
  })

  it('preserves id as a literal type at the type level', () => {
    const step = defineStep({
      id: 'review',
      inputSchema: z.object({ taskId: z.string() }),
      outputSchema: z.object({ approved: z.boolean() }),
      async execute() {
        return { approved: true }
      },
    })

    const id: 'review' = step.id
    expect(id).toBe('review')
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
pnpm --filter @seta/agent-workflows test -- define-step
```

Expected: FAIL — module `./define-step` not found.

- [ ] **Step 3: Implement `define-step.ts`**

Create `platform/agent/workflows/src/define-step.ts`:

```ts
import type { ZodType } from 'zod'
import type { Step, StepExecuteFn } from './types/step'

export interface DefineStepOptions<TIn, TOut, TId extends string> {
  id: TId
  inputSchema: ZodType<TIn>
  outputSchema: ZodType<TOut>
  execute: StepExecuteFn<TIn, TOut>
}

export function defineStep<TIn, TOut, TId extends string>(
  opts: DefineStepOptions<TIn, TOut, TId>,
): Step<TIn, TOut, TId> {
  return {
    id: opts.id,
    inputSchema: opts.inputSchema,
    outputSchema: opts.outputSchema,
    execute: opts.execute,
  } as Step<TIn, TOut, TId>
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm --filter @seta/agent-workflows test -- define-step
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add platform/agent/workflows/src/define-step.ts platform/agent/workflows/src/define-step.test.ts
git commit -m "feat(agent-workflows): defineStep factory"
```

---

## Task 5: Workflow graph internal representation

**Files:**
- Create: `platform/agent/workflows/src/graph.ts`
- Create: `platform/agent/workflows/src/graph.test.ts`

- [ ] **Step 1: Write failing test**

Create `platform/agent/workflows/src/graph.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineStep } from './define-step'
import { type GraphNode, parallel, single } from './graph'

const s = (id: string) =>
  defineStep({
    id,
    inputSchema: z.unknown(),
    outputSchema: z.unknown(),
    async execute() {
      return null
    },
  })

describe('workflow graph nodes', () => {
  it('single() produces a single node', () => {
    const node: GraphNode = single(s('a'))
    expect(node.kind).toBe('single')
    if (node.kind === 'single') expect(node.step.id).toBe('a')
  })

  it('parallel() produces a parallel node with the given branches', () => {
    const node = parallel([s('a'), s('b')])
    expect(node.kind).toBe('parallel')
    if (node.kind === 'parallel') {
      expect(node.branches.map((b) => b.id)).toEqual(['a', 'b'])
    }
  })

  it('parallel() rejects duplicate branch ids at build time', () => {
    expect(() => parallel([s('a'), s('a')])).toThrow(/duplicate step id/i)
  })

  it('parallel() rejects empty branch arrays', () => {
    expect(() => parallel([])).toThrow(/at least one/i)
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
pnpm --filter @seta/agent-workflows test -- graph
```

Expected: FAIL — `./graph` not found.

- [ ] **Step 3: Implement `graph.ts`**

Create `platform/agent/workflows/src/graph.ts`:

```ts
import { WorkflowBuildError } from './errors'
import type { Step } from './types/step'

export interface SingleNode {
  kind: 'single'
  step: Step<unknown, unknown, string>
}

export interface ParallelNode {
  kind: 'parallel'
  branches: ReadonlyArray<Step<unknown, unknown, string>>
}

export type GraphNode = SingleNode | ParallelNode

export function single<TIn, TOut, TId extends string>(step: Step<TIn, TOut, TId>): SingleNode {
  return { kind: 'single', step: step as unknown as Step<unknown, unknown, string> }
}

export function parallel(branches: ReadonlyArray<Step<unknown, unknown, string>>): ParallelNode {
  if (branches.length === 0) {
    throw new WorkflowBuildError('parallel() requires at least one branch')
  }
  const seen = new Set<string>()
  for (const b of branches) {
    if (seen.has(b.id)) {
      throw new WorkflowBuildError(`duplicate step id in parallel branches: ${b.id}`)
    }
    seen.add(b.id)
  }
  return { kind: 'parallel', branches }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm --filter @seta/agent-workflows test -- graph
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add platform/agent/workflows/src/graph.ts platform/agent/workflows/src/graph.test.ts
git commit -m "feat(agent-workflows): internal graph node representation"
```

---

## Task 6: `ParallelOutput` type helper

**Files:**
- Create: `platform/agent/workflows/src/types/parallel-output.ts`
- Modify: `platform/agent/workflows/src/types/index.ts`

- [ ] **Step 1: Implement `parallel-output.ts`**

Create `platform/agent/workflows/src/types/parallel-output.ts`:

```ts
import type { Step } from './step'

export type ParallelOutput<S extends ReadonlyArray<Step<unknown, unknown, string>>> = {
  [K in S[number] as K extends Step<unknown, unknown, infer Id> ? Id : never]: K extends Step<
    unknown,
    infer Out,
    string
  >
    ? Out
    : never
}
```

- [ ] **Step 2: Re-export from `types/index.ts`**

Replace `platform/agent/workflows/src/types/index.ts` with:

```ts
export type { ParallelOutput } from './parallel-output'
export type { Step, StepCtx, StepExecuteFn, StepId, StepInput, StepOutput } from './step'
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @seta/agent-workflows typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add platform/agent/workflows/src/types/parallel-output.ts platform/agent/workflows/src/types/index.ts
git commit -m "feat(agent-workflows): ParallelOutput keyed-record helper"
```

---

## Task 7: `createWorkflow` builder — `.then()` only

**Files:**
- Create: `platform/agent/workflows/src/create-workflow.ts`
- Create: `platform/agent/workflows/src/create-workflow.test.ts`

- [ ] **Step 1: Write failing tests for `.then` + `.commit` happy path**

Create `platform/agent/workflows/src/create-workflow.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createWorkflow } from './create-workflow'
import { defineStep } from './define-step'
import { WorkflowBuildError } from './errors'

const idStep = defineStep({
  id: 'identity',
  inputSchema: z.object({ x: z.number() }),
  outputSchema: z.object({ x: z.number() }),
  async execute(input) {
    return input
  },
})

describe('createWorkflow builder', () => {
  it('chains a single .then() and commits', () => {
    const wf = createWorkflow({
      id: 'wf.id',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
    })
      .then(idStep)
      .commit()

    expect(wf.id).toBe('wf.id')
    expect(typeof wf.run).toBe('function')
  })

  it('throws on .then() after .commit()', () => {
    const wf = createWorkflow({
      id: 'wf.id',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
    })
      .then(idStep)
      .commit()

    expect(() => (wf as unknown as { then: (s: unknown) => unknown }).then(idStep)).toThrow(
      WorkflowBuildError,
    )
  })

  it('throws on duplicate chained step id', () => {
    expect(() =>
      createWorkflow({
        id: 'wf.id',
        inputSchema: z.object({ x: z.number() }),
        outputSchema: z.object({ x: z.number() }),
      })
        .then(idStep)
        .then(idStep)
        .commit(),
    ).toThrow(/duplicate step id/i)
  })

  it('throws if .commit() is never called before .run()', () => {
    const builder = createWorkflow({
      id: 'wf.id',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
    }).then(idStep)

    expect(() => (builder as unknown as { run: () => unknown }).run()).toThrow(WorkflowBuildError)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @seta/agent-workflows test -- create-workflow
```

Expected: FAIL — `./create-workflow` not found.

- [ ] **Step 3: Implement initial `create-workflow.ts` (with `.then` only)**

Create `platform/agent/workflows/src/create-workflow.ts`:

```ts
import type { ZodType } from 'zod'
import { WorkflowBuildError } from './errors'
import { type GraphNode, single } from './graph'
import type { ParallelOutput } from './types/parallel-output'
import type { Step } from './types/step'

export interface CreateWorkflowOptions<TIn, TOut> {
  id: string
  inputSchema: ZodType<TIn>
  outputSchema: ZodType<TOut>
}

export interface Workflow<TInit, TCurrent, TFinal> {
  then<TNext, TId extends string>(
    step: Step<TCurrent, TNext, TId>,
  ): Workflow<TInit, TNext, TFinal>

  parallel<S extends ReadonlyArray<Step<TCurrent, unknown, string>>>(
    steps: S,
  ): Workflow<TInit, ParallelOutput<S>, TFinal>

  commit(this: TCurrent extends TFinal ? Workflow<TInit, TCurrent, TFinal> : never): BuiltWorkflow<
    TInit,
    TFinal
  >
}

export interface BuiltWorkflow<TInit, TFinal> {
  readonly id: string
  run(input: TInit): Promise<TFinal>
  then(_: never): never
  parallel(_: never): never
  commit(): never
}

interface BuilderState {
  readonly workflowId: string
  readonly inputSchema: ZodType<unknown>
  readonly outputSchema: ZodType<unknown>
  readonly nodes: ReadonlyArray<GraphNode>
}

function builderFromState<TInit, TCurrent, TFinal>(
  state: BuilderState,
): Workflow<TInit, TCurrent, TFinal> {
  const collectIds = (nodes: ReadonlyArray<GraphNode>) => {
    const ids: string[] = []
    for (const n of nodes) {
      if (n.kind === 'single') ids.push(n.step.id)
      else for (const b of n.branches) ids.push(b.id)
    }
    return ids
  }
  const guardDuplicate = (existing: string[], adding: string[]) => {
    const seen = new Set(existing)
    for (const id of adding) {
      if (seen.has(id)) {
        throw new WorkflowBuildError(`duplicate step id in workflow ${state.workflowId}: ${id}`)
      }
      seen.add(id)
    }
  }

  return {
    then(step) {
      guardDuplicate(collectIds(state.nodes), [step.id])
      return builderFromState({ ...state, nodes: [...state.nodes, single(step)] })
    },
    parallel(_steps) {
      throw new WorkflowBuildError('parallel() not implemented until Task 8')
    },
    commit() {
      if (state.nodes.length === 0) {
        throw new WorkflowBuildError(`workflow ${state.workflowId}: at least one step required`)
      }
      return buildFinal(state)
    },
  } as Workflow<TInit, TCurrent, TFinal>
}

function buildFinal<TInit, TFinal>(state: BuilderState): BuiltWorkflow<TInit, TFinal> {
  const built: BuiltWorkflow<TInit, TFinal> = {
    id: state.workflowId,
    async run(_input: TInit): Promise<TFinal> {
      throw new WorkflowBuildError(`workflow ${state.workflowId}: runner not implemented yet`)
    },
    then() {
      throw new WorkflowBuildError(`workflow ${state.workflowId}: cannot .then() after .commit()`)
    },
    parallel() {
      throw new WorkflowBuildError(`workflow ${state.workflowId}: cannot .parallel() after .commit()`)
    },
    commit() {
      throw new WorkflowBuildError(`workflow ${state.workflowId}: already committed`)
    },
  }
  return built
}

export function createWorkflow<TIn, TOut>(
  opts: CreateWorkflowOptions<TIn, TOut>,
): Workflow<TIn, TIn, TOut> {
  return builderFromState<TIn, TIn, TOut>({
    workflowId: opts.id,
    inputSchema: opts.inputSchema as ZodType<unknown>,
    outputSchema: opts.outputSchema as ZodType<unknown>,
    nodes: [],
  })
}

export function __getGraphForTest(wf: BuiltWorkflow<unknown, unknown>): never {
  void wf
  throw new Error('internal: do not use')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @seta/agent-workflows test -- create-workflow
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add platform/agent/workflows/src/create-workflow.ts platform/agent/workflows/src/create-workflow.test.ts
git commit -m "feat(agent-workflows): createWorkflow builder with .then() and .commit()"
```

---

## Task 8: Builder — `.parallel()` branch

**Files:**
- Modify: `platform/agent/workflows/src/create-workflow.ts`
- Modify: `platform/agent/workflows/src/create-workflow.test.ts`

- [ ] **Step 1: Add failing tests for `.parallel()`**

Append to `platform/agent/workflows/src/create-workflow.test.ts`:

```ts
import { parallel as parallelNode } from './graph'

describe('createWorkflow .parallel()', () => {
  const a = defineStep({
    id: 'a',
    inputSchema: z.object({ x: z.number() }),
    outputSchema: z.object({ a: z.number() }),
    async execute(input) {
      return { a: input.x + 1 }
    },
  })
  const b = defineStep({
    id: 'b',
    inputSchema: z.object({ x: z.number() }),
    outputSchema: z.object({ b: z.number() }),
    async execute(input) {
      return { b: input.x + 2 }
    },
  })

  it('accepts .parallel() and commits with the keyed-record current type', () => {
    const wf = createWorkflow({
      id: 'wf.parallel',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ a: z.number(), b: z.number() }) as unknown as z.ZodType<
        { a: number } & { b: number }
      >,
    })
      .parallel([a, b])
      .commit()

    expect(wf.id).toBe('wf.parallel')
  })

  it('throws on duplicate id between chained + parallel branches', () => {
    expect(() =>
      createWorkflow({
        id: 'wf.dup',
        inputSchema: z.object({ x: z.number() }),
        outputSchema: z.unknown(),
      })
        .then(a)
        .parallel([a, b])
        .commit(),
    ).toThrow(/duplicate step id/i)
  })

  it('parallelNode helper is internally consistent with builder', () => {
    const node = parallelNode([a, b])
    expect(node.branches).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @seta/agent-workflows test -- create-workflow
```

Expected: FAIL — first test throws "parallel() not implemented until Task 8".

- [ ] **Step 3: Wire `.parallel()` into the builder**

Replace the `parallel(_steps)` method body inside `builderFromState` in `platform/agent/workflows/src/create-workflow.ts` with:

```ts
    parallel(steps) {
      const branchIds = steps.map((s) => s.id)
      guardDuplicate(collectIds(state.nodes), branchIds)
      const node = parallelNode(steps)
      return builderFromState({ ...state, nodes: [...state.nodes, node] })
    },
```

Also add this import at the top of the file:

```ts
import { type GraphNode, parallel as parallelNode, single } from './graph'
```

(Replace the existing `import { type GraphNode, single } from './graph'` line.)

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @seta/agent-workflows test -- create-workflow
```

Expected: PASS (7 tests total in the file).

- [ ] **Step 5: Commit**

```bash
git add platform/agent/workflows/src/create-workflow.ts platform/agent/workflows/src/create-workflow.test.ts
git commit -m "feat(agent-workflows): builder .parallel() with duplicate-id guard"
```

---

## Task 9: Step execution helper (validate → execute → validate)

**Files:**
- Create: `platform/agent/workflows/src/runner/step-execution.ts`
- Create: `platform/agent/workflows/src/runner/step-execution.test.ts`

- [ ] **Step 1: Write failing tests**

Create `platform/agent/workflows/src/runner/step-execution.test.ts`:

```ts
import { trace } from '@opentelemetry/api'
import { logger as baseLogger } from '@seta/observability'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineStep } from '../define-step'
import {
  StepExecutionError,
  StepInputValidationError,
  StepOutputValidationError,
  WorkflowBailed,
} from '../errors'
import { executeStep } from './step-execution'

const tracer = trace.getTracer('test')

const baseCtx = {
  runId: 'r1',
  workflowId: 'wf',
  tenantId: 't1',
  logger: baseLogger.child({ test: true }),
  tracer,
  signal: new AbortController().signal,
}

describe('executeStep', () => {
  const okStep = defineStep({
    id: 'ok',
    inputSchema: z.object({ x: z.number() }),
    outputSchema: z.object({ y: z.number() }),
    async execute(input) {
      return { y: input.x * 2 }
    },
  })

  it('validates input, runs execute, validates output', async () => {
    const out = await executeStep(okStep, { x: 21 }, baseCtx)
    expect(out).toEqual({ y: 42 })
  })

  it('rejects bad input with StepInputValidationError', async () => {
    await expect(executeStep(okStep, { x: 'bad' as unknown as number }, baseCtx)).rejects.toThrow(
      StepInputValidationError,
    )
  })

  it('rejects bad output with StepOutputValidationError', async () => {
    const badStep = defineStep({
      id: 'bad-out',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      async execute() {
        return { y: 'not a number' as unknown as number }
      },
    })
    await expect(executeStep(badStep, { x: 1 }, baseCtx)).rejects.toThrow(StepOutputValidationError)
  })

  it('wraps thrown errors in StepExecutionError', async () => {
    const throwStep = defineStep({
      id: 'throw',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      async execute() {
        throw new Error('boom')
      },
    })
    await expect(executeStep(throwStep, { x: 1 }, baseCtx)).rejects.toThrow(StepExecutionError)
  })

  it('propagates WorkflowBailed without wrapping', async () => {
    const bailStep = defineStep({
      id: 'bail',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      async execute(_input, ctx) {
        ctx.bail('done early')
      },
    })
    await expect(executeStep(bailStep, { x: 1 }, baseCtx)).rejects.toThrow(WorkflowBailed)
  })

  it('exposes runId, stepId, workflowId, tenantId, signal on ctx', async () => {
    let seen: {
      runId?: string
      stepId?: string
      workflowId?: string
      tenantId?: string
      hasSignal?: boolean
    } = {}
    const peekStep = defineStep({
      id: 'peek',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      async execute(_input, ctx) {
        seen = {
          runId: ctx.runId,
          stepId: ctx.stepId,
          workflowId: ctx.workflowId,
          tenantId: ctx.tenantId,
          hasSignal: ctx.signal instanceof AbortSignal,
        }
        return { y: 0 }
      },
    })
    await executeStep(peekStep, { x: 0 }, baseCtx)
    expect(seen).toEqual({
      runId: 'r1',
      stepId: 'peek',
      workflowId: 'wf',
      tenantId: 't1',
      hasSignal: true,
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @seta/agent-workflows test -- step-execution
```

Expected: FAIL — module `./step-execution` not found.

- [ ] **Step 3: Implement `step-execution.ts`**

Create `platform/agent/workflows/src/runner/step-execution.ts`:

```ts
import type { Tracer } from '@opentelemetry/api'
import { SpanStatusCode } from '@opentelemetry/api'
import { createHash } from 'node:crypto'
import type { Logger } from '@seta/observability'
import {
  StepExecutionError,
  StepInputValidationError,
  StepOutputValidationError,
  WorkflowBailed,
} from '../errors'
import type { Step, StepCtx } from '../types/step'

export interface RunContext {
  readonly runId: string
  readonly workflowId: string
  readonly tenantId: string
  readonly logger: Logger
  readonly tracer: Tracer
  readonly signal: AbortSignal
}

function hashInput(value: unknown): string {
  const json = (() => {
    try {
      return JSON.stringify(value) ?? 'undefined'
    } catch {
      return '<unserializable>'
    }
  })()
  return createHash('sha256').update(json).digest('hex')
}

export async function executeStep<TIn, TOut, TId extends string>(
  step: Step<TIn, TOut, TId>,
  rawInput: unknown,
  run: RunContext,
): Promise<TOut> {
  const stepLogger = run.logger.child({ stepId: step.id })

  const inputParsed = step.inputSchema.safeParse(rawInput)
  if (!inputParsed.success) {
    throw new StepInputValidationError({
      runId: run.runId,
      stepId: step.id,
      cause: inputParsed.error,
    })
  }
  const input = inputParsed.data

  const ctx: StepCtx<TIn> = {
    input,
    runId: run.runId,
    stepId: step.id,
    workflowId: run.workflowId,
    tenantId: run.tenantId,
    logger: stepLogger,
    signal: run.signal,
    bail(reason) {
      throw new WorkflowBailed(reason ?? 'workflow bailed')
    },
  }

  return await run.tracer.startActiveSpan(`step.${step.id}`, async (span) => {
    span.setAttribute('step.id', step.id)
    span.setAttribute('step.workflow.id', run.workflowId)
    span.setAttribute('step.run.id', run.runId)
    span.setAttribute('tenant.id', run.tenantId)
    span.setAttribute('step.input.hash', hashInput(input))

    let rawOutput: TOut
    try {
      rawOutput = await step.execute(input, ctx)
    } catch (err) {
      if (err instanceof WorkflowBailed) {
        span.setStatus({ code: SpanStatusCode.OK })
        span.end()
        throw err
      }
      span.recordException(err as Error)
      span.setStatus({ code: SpanStatusCode.ERROR })
      span.end()
      throw new StepExecutionError({ runId: run.runId, stepId: step.id, cause: err })
    }

    const outputParsed = step.outputSchema.safeParse(rawOutput)
    if (!outputParsed.success) {
      span.setStatus({ code: SpanStatusCode.ERROR })
      span.end()
      throw new StepOutputValidationError({
        runId: run.runId,
        stepId: step.id,
        cause: outputParsed.error,
      })
    }

    span.setStatus({ code: SpanStatusCode.OK })
    span.end()
    return outputParsed.data
  })
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @seta/agent-workflows test -- step-execution
```

Expected: PASS (6 tests).

- [ ] **Step 5: Confirm `logger.child` API**

```bash
grep -n "child\b" platform/observability/src/logger*.ts 2>/dev/null | head
```

If `@seta/observability`'s logger uses a method other than `.child()` (e.g., `.withContext()`), adjust both `executeStep` and the test to match. Re-run the tests after any change.

- [ ] **Step 6: Commit**

```bash
git add platform/agent/workflows/src/runner/step-execution.ts platform/agent/workflows/src/runner/step-execution.test.ts
git commit -m "feat(agent-workflows): step execution helper with Zod + OTel"
```

---

## Task 10: In-memory runner — sequential `.then` execution

**Files:**
- Create: `platform/agent/workflows/src/runner/in-memory.ts`
- Create: `platform/agent/workflows/src/runner/in-memory.test.ts`
- Modify: `platform/agent/workflows/src/create-workflow.ts` (wire run() to the runner)

- [ ] **Step 1: Write failing tests for sequential run**

Create `platform/agent/workflows/src/runner/in-memory.test.ts`:

```ts
import { tenantContext } from '@seta/tenant'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createWorkflow } from '../create-workflow'
import { defineStep } from '../define-step'
import { StepInputValidationError, WorkflowError } from '../errors'

const tenantId = '00000000-0000-7000-8000-000000000001'

describe('in-memory runner — sequential', () => {
  it('runs a single .then() step end-to-end', async () => {
    const double = defineStep({
      id: 'double',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
      async execute(input) {
        return { x: input.x * 2 }
      },
    })

    const wf = createWorkflow({
      id: 'wf.double',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
    })
      .then(double)
      .commit()

    const out = await tenantContext.run(tenantId, () => wf.run({ x: 21 }))
    expect(out).toEqual({ x: 42 })
  })

  it('chains output → next step input', async () => {
    const inc = defineStep({
      id: 'inc',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
      async execute(input) {
        return { x: input.x + 1 }
      },
    })
    const triple = defineStep({
      id: 'triple',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
      async execute(input) {
        return { x: input.x * 3 }
      },
    })

    const wf = createWorkflow({
      id: 'wf.chain',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ x: z.number() }),
    })
      .then(inc)
      .then(triple)
      .commit()

    const out = await tenantContext.run(tenantId, () => wf.run({ x: 2 }))
    expect(out).toEqual({ x: 9 })
  })

  it('throws WorkflowError if run() is called without tenant context', async () => {
    const noop = defineStep({
      id: 'noop',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute(input) {
        return input
      },
    })
    const wf = createWorkflow({
      id: 'wf.no-tenant',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .then(noop)
      .commit()

    await expect(wf.run(null)).rejects.toThrow(WorkflowError)
  })

  it('propagates StepInputValidationError when workflow input does not match step input', async () => {
    const strict = defineStep({
      id: 'strict',
      inputSchema: z.object({ y: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      async execute(input) {
        return input
      },
    })

    const wf = createWorkflow({
      id: 'wf.bad-input',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.unknown(),
    })
      .then(strict as unknown as Parameters<ReturnType<typeof createWorkflow>['then']>[0])
      .commit()

    await expect(tenantContext.run(tenantId, () => wf.run({ x: 1 }))).rejects.toThrow(
      StepInputValidationError,
    )
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @seta/agent-workflows test -- in-memory
```

Expected: FAIL — `./in-memory` not found AND `wf.run()` in committed workflow throws "runner not implemented yet".

- [ ] **Step 3: Implement `in-memory.ts`**

Create `platform/agent/workflows/src/runner/in-memory.ts`:

```ts
import { trace } from '@opentelemetry/api'
import { logger as baseLogger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { v7 as uuidv7 } from 'uuid'
import { WorkflowError } from '../errors'
import type { GraphNode } from '../graph'
import { executeStep, type RunContext } from './step-execution'

const tracer = trace.getTracer('@seta/agent-workflows')

export interface RunWorkflowOptions {
  workflowId: string
  nodes: ReadonlyArray<GraphNode>
}

export interface RunInvocationOptions {
  signal?: AbortSignal
}

function chainSignals(parent: AbortSignal | undefined): {
  controller: AbortController
  cleanup: () => void
} {
  const controller = new AbortController()
  if (!parent) return { controller, cleanup: () => {} }
  if (parent.aborted) {
    controller.abort(parent.reason)
    return { controller, cleanup: () => {} }
  }
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  return { controller, cleanup: () => parent.removeEventListener('abort', onAbort) }
}

export async function runWorkflow<TInit, TFinal>(
  opts: RunWorkflowOptions,
  input: TInit,
  invocation?: RunInvocationOptions,
): Promise<TFinal> {
  let tenantId: string
  try {
    tenantId = tenantContext.getTenantId()
  } catch (err) {
    throw new WorkflowError(500, `workflow ${opts.workflowId}: no tenant in context`, {
      cause: err,
    })
  }

  const runId = uuidv7()
  const logger = baseLogger.child({ workflowId: opts.workflowId, runId, tenantId })
  const { controller: runController, cleanup } = chainSignals(invocation?.signal)
  const runCtx: RunContext = {
    runId,
    workflowId: opts.workflowId,
    tenantId,
    logger,
    tracer,
    signal: runController.signal,
  }

  try {
    return await tracer.startActiveSpan(`workflow.${opts.workflowId}`, async (span) => {
      span.setAttribute('workflow.id', opts.workflowId)
      span.setAttribute('workflow.run.id', runId)
      span.setAttribute('tenant.id', tenantId)
      try {
        let current: unknown = input
        for (const node of opts.nodes) {
          current = await executeNode(node, current, runCtx)
        }
        span.end()
        return current as TFinal
      } catch (err) {
        span.recordException(err as Error)
        span.end()
        throw err
      }
    })
  } finally {
    cleanup()
  }
}

async function executeNode(
  node: GraphNode,
  input: unknown,
  run: RunContext,
): Promise<unknown> {
  if (node.kind === 'single') {
    return await tenantContext.run(run.tenantId, () => executeStep(node.step, input, run))
  }
  // parallel — wired in Task 11
  throw new WorkflowError(500, `workflow ${run.workflowId}: parallel not implemented`)
}
```

- [ ] **Step 4: Wire `run()` in `create-workflow.ts` to use the runner**

In `platform/agent/workflows/src/create-workflow.ts`:

(a) Add this import near the other imports:

```ts
import { type RunInvocationOptions, runWorkflow } from './runner/in-memory'
```

(b) Update the `BuiltWorkflow` interface to accept an optional `opts`:

```ts
export interface BuiltWorkflow<TInit, TFinal> {
  readonly id: string
  run(input: TInit, opts?: { signal?: AbortSignal }): Promise<TFinal>
  then(_: never): never
  parallel(_: never): never
  commit(): never
}
```

(c) Replace the `buildFinal` function body with:

```ts
function buildFinal<TInit, TFinal>(state: BuilderState): BuiltWorkflow<TInit, TFinal> {
  const built: BuiltWorkflow<TInit, TFinal> = {
    id: state.workflowId,
    async run(input: TInit, opts?: RunInvocationOptions): Promise<TFinal> {
      return await runWorkflow<TInit, TFinal>(
        { workflowId: state.workflowId, nodes: state.nodes },
        input,
        opts,
      )
    },
    then() {
      throw new WorkflowBuildError(`workflow ${state.workflowId}: cannot .then() after .commit()`)
    },
    parallel() {
      throw new WorkflowBuildError(`workflow ${state.workflowId}: cannot .parallel() after .commit()`)
    },
    commit() {
      throw new WorkflowBuildError(`workflow ${state.workflowId}: already committed`)
    },
  }
  return built
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
pnpm --filter @seta/agent-workflows test -- in-memory
```

Expected: PASS (4 tests).

- [ ] **Step 6: Run full test suite**

```bash
pnpm --filter @seta/agent-workflows test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add platform/agent/workflows/src/runner/in-memory.ts platform/agent/workflows/src/runner/in-memory.test.ts platform/agent/workflows/src/create-workflow.ts
git commit -m "feat(agent-workflows): in-memory runner — sequential .then execution"
```

---

## Task 11: In-memory runner — `.parallel()` branches

**Files:**
- Modify: `platform/agent/workflows/src/runner/in-memory.ts`
- Modify: `platform/agent/workflows/src/runner/in-memory.test.ts`

- [ ] **Step 1: Append parallel-runner tests**

Append to `platform/agent/workflows/src/runner/in-memory.test.ts`:

```ts
describe('in-memory runner — parallel', () => {
  it('runs parallel branches and produces a keyed record', async () => {
    const a = defineStep({
      id: 'a',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ a: z.number() }),
      async execute(input) {
        return { a: input.x + 1 }
      },
    })
    const b = defineStep({
      id: 'b',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ b: z.number() }),
      async execute(input) {
        return { b: input.x + 2 }
      },
    })

    const wf = createWorkflow({
      id: 'wf.par',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ a: z.number(), b: z.number() }) as unknown as z.ZodType<{
        a: number
        b: number
      }>,
    })
      .parallel([a, b])
      .commit()

    const out = await tenantContext.run(tenantId, () => wf.run({ x: 10 }))
    expect(out).toEqual({ a: 11, b: 12 })
  })

  it('runs branches concurrently (overlapping execution windows)', async () => {
    const events: string[] = []
    const slow = (id: string, delayMs: number) =>
      defineStep({
        id,
        inputSchema: z.unknown(),
        outputSchema: z.object({ id: z.string() }),
        async execute() {
          events.push(`start:${id}`)
          await new Promise((r) => setTimeout(r, delayMs))
          events.push(`end:${id}`)
          return { id }
        },
      })

    const wf = createWorkflow({
      id: 'wf.par.concurrent',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .parallel([slow('a', 30), slow('b', 10)])
      .commit()

    await tenantContext.run(tenantId, () => wf.run(null))

    // Both must have started before either ended.
    const startA = events.indexOf('start:a')
    const startB = events.indexOf('start:b')
    const endA = events.indexOf('end:a')
    const endB = events.indexOf('end:b')
    expect(startA).toBeGreaterThanOrEqual(0)
    expect(startB).toBeGreaterThanOrEqual(0)
    expect(Math.max(startA, startB)).toBeLessThan(Math.min(endA, endB))
  })

  it('first rejecting branch aborts the run', async () => {
    const ok = defineStep({
      id: 'ok',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute() {
        return null
      },
    })
    const bad = defineStep({
      id: 'bad',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute() {
        throw new Error('branch failed')
      },
    })

    const wf = createWorkflow({
      id: 'wf.par.fail',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .parallel([ok, bad])
      .commit()

    await expect(tenantContext.run(tenantId, () => wf.run(null))).rejects.toThrow(/branch failed/)
  })

  it('aborts sibling branches via ctx.signal on first rejection', async () => {
    let siblingSawAbort = false
    const sibling = defineStep({
      id: 'sibling',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute(_input, ctx) {
        await new Promise<void>((resolve) => {
          if (ctx.signal.aborted) {
            siblingSawAbort = true
            return resolve()
          }
          ctx.signal.addEventListener(
            'abort',
            () => {
              siblingSawAbort = true
              resolve()
            },
            { once: true },
          )
        })
        return null
      },
    })
    const fast = defineStep({
      id: 'fast',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute() {
        await new Promise((r) => setTimeout(r, 5))
        throw new Error('fast branch failed')
      },
    })

    const wf = createWorkflow({
      id: 'wf.par.cancel',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .parallel([sibling, fast])
      .commit()

    await expect(tenantContext.run(tenantId, () => wf.run(null))).rejects.toThrow(
      /fast branch failed/,
    )
    expect(siblingSawAbort).toBe(true)
  })

  it('honours an externally-supplied AbortSignal', async () => {
    let stepSawAbort = false
    const slow = defineStep({
      id: 'slow',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute(_input, ctx) {
        await new Promise<void>((resolve) => {
          if (ctx.signal.aborted) {
            stepSawAbort = true
            return resolve()
          }
          ctx.signal.addEventListener(
            'abort',
            () => {
              stepSawAbort = true
              resolve()
            },
            { once: true },
          )
        })
        return null
      },
    })

    const wf = createWorkflow({
      id: 'wf.ext.signal',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .then(slow)
      .commit()

    const controller = new AbortController()
    const runPromise = tenantContext.run(tenantId, () =>
      wf.run(null, { signal: controller.signal }),
    )
    await new Promise((r) => setTimeout(r, 5))
    controller.abort(new Error('cancelled'))
    await runPromise.catch(() => {})
    expect(stepSawAbort).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @seta/agent-workflows test -- in-memory
```

Expected: FAIL — `parallel not implemented` thrown.

- [ ] **Step 3: Implement parallel branch execution with sibling cancellation**

In `platform/agent/workflows/src/runner/in-memory.ts`, replace the `executeNode` function with:

```ts
async function executeNode(
  node: GraphNode,
  input: unknown,
  run: RunContext,
): Promise<unknown> {
  if (node.kind === 'single') {
    return await tenantContext.run(run.tenantId, () => executeStep(node.step, input, run))
  }

  const branchController = new AbortController()
  const parent = run.signal
  const onParentAbort = () => branchController.abort(parent.reason)
  if (parent.aborted) branchController.abort(parent.reason)
  else parent.addEventListener('abort', onParentAbort, { once: true })

  const branchRun: RunContext = { ...run, signal: branchController.signal }

  try {
    const settled = await Promise.allSettled(
      node.branches.map((step) =>
        tenantContext.run(run.tenantId, () =>
          executeStep(step, input, branchRun).catch((err) => {
            // First rejection signals siblings to cooperate in shutting down.
            if (!branchController.signal.aborted) branchController.abort(err)
            throw err
          }),
        ),
      ),
    )

    const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed) throw failed.reason

    const keyed: Record<string, unknown> = {}
    for (let i = 0; i < node.branches.length; i++) {
      const branch = node.branches[i]
      const result = settled[i]
      if (branch !== undefined && result?.status === 'fulfilled') {
        keyed[branch.id] = result.value
      }
    }
    return keyed
  } finally {
    parent.removeEventListener('abort', onParentAbort)
  }
}
```

The shift from `Promise.all` to `Promise.allSettled` is deliberate: we let every sibling observe the abort and complete cooperatively, then throw the first rejection. This matches §7.3 / §7.5 of the spec.

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm --filter @seta/agent-workflows test -- in-memory
```

Expected: PASS (9 tests in the file — 4 sequential + 5 parallel including the two cancellation tests).

- [ ] **Step 5: Commit**

```bash
git add platform/agent/workflows/src/runner/in-memory.ts platform/agent/workflows/src/runner/in-memory.test.ts
git commit -m "feat(agent-workflows): parallel branches with AbortSignal-based sibling cancellation"
```

---

## Task 12: Tenant propagation + `bail()` end-to-end test

**Files:**
- Create: `platform/agent/workflows/src/runner/tenant-bail.test.ts`

- [ ] **Step 1: Write the test**

Create `platform/agent/workflows/src/runner/tenant-bail.test.ts`:

```ts
import { tenantContext } from '@seta/tenant'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createWorkflow } from '../create-workflow'
import { defineStep } from '../define-step'
import { WorkflowBailed } from '../errors'

const tenantId = '00000000-0000-7000-8000-000000000002'

describe('runner — tenant + bail', () => {
  it('tenantContext is propagated inside every step body', async () => {
    let seenTenant: string | undefined
    const peek = defineStep({
      id: 'peek',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute() {
        seenTenant = tenantContext.getTenantId()
        return null
      },
    })

    const wf = createWorkflow({
      id: 'wf.tenant',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .then(peek)
      .commit()

    await tenantContext.run(tenantId, () => wf.run(null))
    expect(seenTenant).toBe(tenantId)
  })

  it('ctx.bail() rejects the run with WorkflowBailed', async () => {
    const bail = defineStep({
      id: 'bail',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      async execute(_input, ctx) {
        ctx.bail('done early')
      },
    })

    const wf = createWorkflow({
      id: 'wf.bail',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .then(bail)
      .commit()

    await expect(tenantContext.run(tenantId, () => wf.run(null))).rejects.toThrow(WorkflowBailed)
  })

  it('tenantContext is propagated inside each parallel branch', async () => {
    const seen: string[] = []
    const peekBranch = (id: string) =>
      defineStep({
        id,
        inputSchema: z.unknown(),
        outputSchema: z.unknown(),
        async execute() {
          seen.push(tenantContext.getTenantId())
          return null
        },
      })

    const wf = createWorkflow({
      id: 'wf.tenant.par',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
    })
      .parallel([peekBranch('a'), peekBranch('b')])
      .commit()

    await tenantContext.run(tenantId, () => wf.run(null))
    expect(seen).toEqual([tenantId, tenantId])
  })
})
```

- [ ] **Step 2: Run tests to verify pass**

```bash
pnpm --filter @seta/agent-workflows test -- tenant-bail
```

Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add platform/agent/workflows/src/runner/tenant-bail.test.ts
git commit -m "test(agent-workflows): tenant propagation + bail() across sequential and parallel"
```

---

## Task 13: Type-level tests (`.test-d.ts`)

**Files:**
- Create: `platform/agent/workflows/src/types/workflow.test-d.ts`

- [ ] **Step 1: Confirm vitest version supports `expectTypeOf`**

```bash
grep '"vitest"' platform/agent/workflows/package.json
```

Expected: pinned to `4.1.5` (matches root). Vitest's `expectTypeOf` covers everything we need.

- [ ] **Step 2: Write the type tests**

Create `platform/agent/workflows/src/types/workflow.test-d.ts`:

```ts
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { createWorkflow } from '../create-workflow'
import { defineStep } from '../define-step'

const stepIn = defineStep({
  id: 'in',
  inputSchema: z.object({ x: z.number() }),
  outputSchema: z.object({ y: z.number() }),
  async execute(input) {
    return { y: input.x + 1 }
  },
})

const stepNext = defineStep({
  id: 'next',
  inputSchema: z.object({ y: z.number() }),
  outputSchema: z.object({ z: z.string() }),
  async execute(input) {
    return { z: String(input.y) }
  },
})

const stepMismatch = defineStep({
  id: 'mismatch',
  inputSchema: z.object({ totally: z.string(), different: z.boolean() }),
  outputSchema: z.unknown(),
  async execute() {
    return null
  },
})

const branchA = defineStep({
  id: 'a',
  inputSchema: z.object({ y: z.number() }),
  outputSchema: z.object({ aOut: z.number() }),
  async execute(input) {
    return { aOut: input.y }
  },
})

const branchB = defineStep({
  id: 'b',
  inputSchema: z.object({ y: z.number() }),
  outputSchema: z.object({ bOut: z.string() }),
  async execute(input) {
    return { bOut: String(input.y) }
  },
})

describe('workflow type tests', () => {
  it('chains step outputs to next step inputs', () => {
    const wf = createWorkflow({
      id: 'wf.t1',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ z: z.string() }),
    })
      .then(stepIn)
      .then(stepNext)
      .commit()

    expectTypeOf(wf.run).parameter(0).toEqualTypeOf<{ x: number }>()
    expectTypeOf(wf.run).returns.toEqualTypeOf<Promise<{ z: string }>>()
  })

  it('rejects a .then() whose input schema does not match upstream output', () => {
    const builder = createWorkflow({
      id: 'wf.t2',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.unknown(),
    }).then(stepIn)

    // @ts-expect-error stepMismatch.inputSchema is incompatible with stepIn's output
    builder.then(stepMismatch)
  })

  it('.parallel() produces a keyed record by step id', () => {
    const wf = createWorkflow({
      id: 'wf.t3',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({
        a: z.object({ aOut: z.number() }),
        b: z.object({ bOut: z.string() }),
      }) as unknown as z.ZodType<{ a: { aOut: number }; b: { bOut: string } }>,
    })
      .then(stepIn)
      .parallel([branchA, branchB])
      .commit()

    expectTypeOf(wf.run).returns.toEqualTypeOf<
      Promise<{ a: { aOut: number }; b: { bOut: string } }>
    >()
  })

  it('post-.commit() chaining is a TS error', () => {
    const wf = createWorkflow({
      id: 'wf.t4',
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
    })
      .then(stepIn)
      .commit()

    // @ts-expect-error then() after commit() is typed never
    wf.then(stepIn)
    // @ts-expect-error parallel() after commit() is typed never
    wf.parallel([stepIn])
    // @ts-expect-error commit() after commit() is typed never
    wf.commit()
  })
})
```

- [ ] **Step 3: Run the type tests**

```bash
pnpm --filter @seta/agent-workflows test -- workflow.test-d
```

Expected: PASS. (`expectTypeOf` produces value tests at runtime; `@ts-expect-error` lines force compile-time checks.)

- [ ] **Step 4: Run typecheck to confirm `@ts-expect-error` lines are reachable**

```bash
pnpm --filter @seta/agent-workflows typecheck
```

Expected: PASS. If the typecheck warns "Unused '@ts-expect-error' directive", the type signatures aren't strict enough — go back to `create-workflow.ts` and tighten the generics (verify `then` / `parallel` / `commit` on `BuiltWorkflow` are declared with `(_: never) => never`).

- [ ] **Step 5: Commit**

```bash
git add platform/agent/workflows/src/types/workflow.test-d.ts
git commit -m "test(agent-workflows): type-level tests for builder generics"
```

---

## Task 14: Public barrel + tsup build

**Files:**
- Modify: `platform/agent/workflows/src/index.ts`
- Modify: `platform/agent/workflows/package.json` (only if `exports`/`main`/`types`/`scripts.build` need adjustment — verify first)

- [ ] **Step 1: Inspect the current `package.json`**

```bash
cat platform/agent/workflows/package.json
```

Note the existing `main`, `types`, `exports`, and `scripts.build` fields written by the scaffolder. If they already point at `./dist/index.js` / `./dist/index.d.ts` and the `build` script uses `tsup src/index.ts ...`, leave them alone.

- [ ] **Step 2: Replace `src/index.ts` with the public barrel**

Replace `platform/agent/workflows/src/index.ts` with:

```ts
export { createWorkflow } from './create-workflow'
export type { BuiltWorkflow, CreateWorkflowOptions, Workflow } from './create-workflow'
export { defineStep } from './define-step'
export type { DefineStepOptions } from './define-step'
export {
  StepExecutionError,
  StepInputValidationError,
  StepOutputValidationError,
  WorkflowBailed,
  WorkflowBuildError,
  WorkflowError,
} from './errors'
export type {
  ParallelOutput,
  Step,
  StepCtx,
  StepExecuteFn,
  StepId,
  StepInput,
  StepOutput,
} from './types'
```

- [ ] **Step 3: Build the package**

```bash
pnpm --filter @seta/agent-workflows build
```

Expected: tsup produces `dist/index.js` + `dist/index.d.ts` with no errors.

- [ ] **Step 4: Verify `dist/index.d.ts` is consumable**

```bash
node -e "import('@seta/agent-workflows').then(m => console.log(Object.keys(m).sort()))" 2>&1 | head -30
```

(If run from the repo root, Node should resolve the workspace package via pnpm's symlinks. Expected output: a sorted list of the exported names — `createWorkflow`, `defineStep`, error classes.)

- [ ] **Step 5: Commit**

```bash
git add platform/agent/workflows/src/index.ts platform/agent/workflows/package.json
git commit -m "feat(agent-workflows): public barrel exports + tsup build"
```

---

## Task 15: Repo-wide verification + changeset

**Files:**
- Create: `.changeset/<auto-named>.md`

- [ ] **Step 1: Run repo-wide typecheck**

```bash
pnpm typecheck
```

Expected: PASS. (Adding a new package should not break anything; nothing else imports it yet.)

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: PASS. Fix any biome complaints in `platform/agent/workflows/` and amend the relevant commit (`git commit --amend --no-edit` on the last-touched commit, or stage + commit a fixup if multiple files).

- [ ] **Step 3: Run unit tests across the repo**

```bash
pnpm test:unit
```

Expected: PASS. The new package's tests show up under `@seta/agent-workflows`.

- [ ] **Step 4: Confirm the CI guard for manual package.json edits**

```bash
pnpm --filter @seta/tooling exec tsx scripts/check-no-manual-pkg-edit.ts 2>/dev/null || true
```

Expected: no violations against `platform/agent/workflows/package.json`. (Every edit went through `pnpm new:package` + `pnpm --filter ... add`.)

- [ ] **Step 5: Author the changeset**

```bash
pnpm changeset
```

When prompted:
- Select `@seta/agent-workflows`.
- Bump type: **minor** (initial public surface).
- Summary: `Initial W1 release: typed workflow DSL (\`createWorkflow\`, \`defineStep\`, \`.then\`/\`.parallel\`/\`.commit\`) with in-memory runner. Persistence, suspend/resume, and HITL land in W2.`

- [ ] **Step 6: Final verification**

```bash
pnpm --filter @seta/agent-workflows typecheck
pnpm --filter @seta/agent-workflows lint
pnpm --filter @seta/agent-workflows test
pnpm --filter @seta/agent-workflows build
```

All four must pass.

- [ ] **Step 7: Commit the changeset**

```bash
git add .changeset/
git commit -m "chore(agent-workflows): changeset for W1 initial release"
```

---

## Done criteria

- `pnpm --filter @seta/agent-workflows typecheck` clean.
- `pnpm --filter @seta/agent-workflows lint` clean.
- `pnpm --filter @seta/agent-workflows test` green — all unit tests + `*.test-d.ts` pass.
- `pnpm --filter @seta/agent-workflows build` produces `dist/`.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` at repo root all clean.
- Changeset present.
- Public surface in `src/index.ts`: `createWorkflow`, `defineStep`, the six error classes, the inferred types.
- No exports of `suspend` / `resume` / `runWorkflow` / `runner internals`.
- No `migrations/`, no `drizzle.config.ts`, no `tests/integration/` directory in this package.

## What W2 adds (out of scope for this plan)

- `agent_workflows` Postgres schema (`workflow_snapshots`, `workflow_steps`) + migrations + `drizzle.config.ts`.
- `@seta/db` `OWNER_ORDER` updated to include `agent_workflows`.
- Step result + run snapshot persistence at each `.then()` / `.parallel()` boundary.
- `ctx.suspend({ resumeLabel, payload })` returns branded `never`; engine persists the snapshot.
- `workflow.resume(runId, { label, payload })` public entry point.
- `pg_try_advisory_xact_lock(hashtext(run_id))` inside resume transaction; loser bails.
- `p-queue@9.2.0` runner; concurrency key = `tenant_id`.
- Per-step retry policy (`{ maxAttempts, backoff }`, transient-only by default).
- `@seta/audit` integration for suspend / resume / step transition events.
- Integration tests under `tests/integration/` requiring `DATABASE_URL`.
- AbortSignal threaded into `StepCtx` so sibling branches in `.parallel()` cancel on first rejection.

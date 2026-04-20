# Plan 03 — Tool Registry + `.meta({ agent })`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `TrpcMeta` to carry an `agent?: AgentToolMeta` field. Tag the five Phase-1 planner read procedures with `.meta({ permission, agent })`. Build a `ToolRegistryBuilder` that walks the app router at boot, strips `actorId` + `tenantId` from LLM-visible schemas, and produces AI SDK `tool()` shapes wired to `ToolGateway.invoke`. Add a drift test that mirrors the existing permission-drift guard.

**Architecture:** `TrpcMeta` extension is purely additive — existing `.meta({ permission })` usage is unaffected. Planner procedures gain a second field. Registry builder is a single `@Injectable()` that runs at module init; it introspects tRPC procedure definitions (the `_def.meta`, `_def.inputs`, `_def.type` fields) and constructs an AI SDK `tool()` whose `execute` calls `ToolGateway.invoke`.

**Tech Stack:** tRPC v11, AI SDK (`tool` factory), zod (for `.omit()` on input schemas), vitest.

---

## File Map

**Create:**

- `apps/api/src/modules/agents/infrastructure/tool-registry/tool-registry-builder.ts`
- `apps/api/src/modules/agents/infrastructure/tool-registry/tool-registry-builder.spec.ts`
- `apps/api/src/modules/agents/infrastructure/tool-registry/strip-identity-schema.ts`
- `apps/api/src/modules/agents/infrastructure/tool-registry/strip-identity-schema.spec.ts`

**Modify:**

- `apps/api/src/common/trpc/trpc-init.ts` — extend `TrpcMeta`
- `apps/api/src/common/auth/permissions.ts` — add `planner:tasks:read` + `planner:evidence:read`
- `apps/api/src/common/auth/permissions.spec.ts` — add the agent-meta drift guard
- `apps/api/src/modules/planner/interface/trpc/task.router.ts` — add `.meta({ permission, agent })` to `getFlat`, `getDetail`, `getBoard`
- `apps/api/src/modules/planner/interface/trpc/personal.router.ts` — add `.meta({ permission, agent })` to `listTasks`
- `apps/api/src/modules/planner/interface/trpc/evidence.router.ts` — add `.meta({ permission, agent })` to `list`
- `apps/api/src/modules/agents/agents.module.ts` — register `ToolRegistryBuilder`

---

## Task 1: Extend `TrpcMeta`

**Files:**

- Modify: `apps/api/src/common/trpc/trpc-init.ts`

- [ ] **Step 1: Add the `agent` field**

In `apps/api/src/common/trpc/trpc-init.ts`, change the `TrpcMeta` interface:

```ts
import type { AgentToolMeta } from '../../modules/agents/domain/value-objects/agent-tool-meta'

export interface TrpcMeta {
  permission?: PermissionKey
  /**
   * Present on procedures the agent runtime may invoke as tools. Absence means
   * the procedure is invisible to every sub-agent. See
   * `apps/api/src/modules/agents/domain/value-objects/agent-tool-meta.ts`.
   */
  agent?: AgentToolMeta
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
bun run --filter @future/api typecheck
git add apps/api/src/common/trpc/trpc-init.ts
git commit -m "feat(trpc): extend TrpcMeta with optional agent tool meta"
```

---

## Task 2: Add missing permission keys

**Files:**

- Modify: `apps/api/src/common/auth/permissions.ts`

Two new keys needed for the 5 planner tools. (`planner:personal:read` already exists per `permissions.spec.ts`.)

- [ ] **Step 1: Add to the registry**

Open `apps/api/src/common/auth/permissions.ts`. Locate the existing `PLANNER_PERSONAL_READ` / `PLANNER_PERSONAL_WRITE` pair and add these two new entries in the same style (match the registry's existing idiom — key on the left, kebab-cased string value on the right):

```ts
PLANNER_TASKS_READ: 'planner:tasks:read',
PLANNER_EVIDENCE_READ: 'planner:evidence:read',
```

- [ ] **Step 2: Run the permission-drift tests**

```bash
bun run --filter @future/api test:unit -- permissions
```

Expected: PASS (the new keys are in the registry; no routers use them yet).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/auth/permissions.ts
git commit -m "feat(auth): register planner:tasks:read + planner:evidence:read"
```

---

## Task 3: Tag `planner.task` procedures

**Files:**

- Modify: `apps/api/src/modules/planner/interface/trpc/task.router.ts`

Tag `getFlat`, `getDetail`, and `getBoard` with both `.meta({ permission })` and `.meta({ agent })`. Note: tRPC allows multiple `.meta()` calls which merge.

- [ ] **Step 1: Add meta to `getFlat`**

Replace the `getFlat` procedure definition in `task.router.ts`:

```ts
getFlat: publicProcedure
  .meta({
    permission: 'planner:tasks:read',
    agent: {
      whenToUse:
        'The user wants a flat list of tasks belonging to a specific plan — for example "show me all tasks in Plan X", or to compute filters like overdue or due-today.',
      whenNotToUse:
        'The user wants tasks filtered by assignee across plans (use planner.personal.listTasks). Or they want one task with evidence (use planner.task.getDetail).',
      examples: [
        { input: "what's in Plan X?", callArgs: { planId: '<planId>' } },
        { input: "what's overdue on Plan X?", callArgs: { planId: '<planId>' } },
      ],
    },
  })
  .input(
    z.object({
      planId: z.string().uuid(),
      actorId: z.string().uuid(),
      tenantId: z.string().uuid(),
    }),
  )
  .query(async ({ input }) => {
    // unchanged body
    await svc().assertPlannerEnabled(input.tenantId)
    return svc()
      .query(new GetFlatTasksQuery(input.planId, input.actorId, input.tenantId))
      .catch((e) => {
        throw toPlannerTrpcError(e)
      })
  }),
```

- [ ] **Step 2: Add meta to `getDetail`**

```ts
getDetail: publicProcedure
  .meta({
    permission: 'planner:tasks:read',
    agent: {
      whenToUse:
        'The user references a single specific task and wants detail — checklist, comments, due date, labels, or linked evidence.',
      whenNotToUse:
        'Listing many tasks (use planner.task.getFlat). Or checking only evidence (use planner.evidence.list).',
      examples: [
        {
          input: 'tell me about task T',
          callArgs: { planId: '<planId>', taskId: '<taskId>' },
        },
      ],
    },
  })
  .input(
    z.object({
      planId: z.string().uuid(),
      taskId: z.string().uuid(),
      actorId: z.string().uuid(),
      tenantId: z.string().uuid(),
    }),
  )
  .query(async ({ input }) => {
    await svc().assertPlannerEnabled(input.tenantId)
    return svc()
      .query(new GetTaskDetailQuery(input.planId, input.taskId, input.actorId, input.tenantId))
      .catch((e) => {
        throw toPlannerTrpcError(e)
      })
  }),
```

- [ ] **Step 3: Add meta to `getBoard`**

```ts
getBoard: publicProcedure
  .meta({
    permission: 'planner:tasks:read',
    agent: {
      whenToUse:
        'The user wants a bucketed/board view of a plan — tasks grouped by bucket (workflow column).',
      whenNotToUse:
        'A flat list is sufficient (use planner.task.getFlat). Or the user wants cross-plan tasks by assignee (use planner.personal.listTasks).',
      examples: [{ input: 'show me the board for Plan X', callArgs: { planId: '<planId>' } }],
    },
  })
  .input(
    z.object({
      planId: z.string().uuid(),
      actorId: z.string().uuid(),
      tenantId: z.string().uuid(),
    }),
  )
  .query(async ({ input }) => {
    await svc().assertPlannerEnabled(input.tenantId)
    return svc()
      .query(new GetBoardQuery(input.planId, input.actorId, input.tenantId))
      .catch((e) => {
        throw toPlannerTrpcError(e)
      })
  }),
```

- [ ] **Step 4: Typecheck + run drift test**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api test:unit -- permissions
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/planner/interface/trpc/task.router.ts
git commit -m "feat(planner): tag getFlat/getDetail/getBoard with agent meta"
```

---

## Task 4: Tag `planner.personal.listTasks`

**Files:**

- Modify: `apps/api/src/modules/planner/interface/trpc/personal.router.ts`

- [ ] **Step 1: Add meta to `listTasks`**

Replace the `listTasks` procedure definition inside `personalRouter`:

```ts
listTasks: publicProcedure
  .meta({
    permission: 'planner:personal:read',
    agent: {
      whenToUse:
        "The user asks for tasks assigned to a specific person across all plans — or the session's 'me' without naming a plan.",
      whenNotToUse:
        'The user specifies a plan explicitly (use planner.task.getFlat or getBoard). Or a single task (use planner.task.getDetail).',
      examples: [
        { input: "what's on my plate?", callArgs: { includeCompleted: false } },
        {
          input: 'show Alice\'s active tasks',
          callArgs: { includeCompleted: false },
        },
      ],
    },
  })
  .input(
    z.object({
      actorId: z.string().uuid(),
      tenantId: z.string().uuid(),
      includeCompleted: z.boolean().default(false),
    }),
  )
  .query(async ({ input }) => {
    await svc().assertPersonalEnabled(input.tenantId)
    return svc()
      .query(
        new ListTasksForActorQuery(input.actorId, input.tenantId, {
          includeCompleted: input.includeCompleted,
        }),
      )
      .catch((e) => {
        throw toPlannerTrpcError(e)
      })
  }),
```

- [ ] **Step 2: Typecheck + commit**

```bash
bun run --filter @future/api typecheck
git add apps/api/src/modules/planner/interface/trpc/personal.router.ts
git commit -m "feat(planner): tag personal.listTasks with agent meta"
```

---

## Task 5: Tag `planner.evidence.list`

**Files:**

- Modify: `apps/api/src/modules/planner/interface/trpc/evidence.router.ts`

- [ ] **Step 1: Add meta to `list`**

Replace the `list` procedure definition inside `evidenceRouter`:

```ts
list: publicProcedure
  .meta({
    permission: 'planner:evidence:read',
    agent: {
      whenToUse:
        'The user wants the evidence attached to a specific task — files, links, notes.',
      whenNotToUse:
        'The user wants the task itself (use planner.task.getDetail, which includes evidence references too).',
      examples: [
        {
          input: 'show evidence for task T',
          callArgs: { planId: '<planId>', taskId: '<taskId>' },
        },
      ],
    },
  })
  .input(
    z.object({
      tenantId: z.string().uuid(),
      planId: z.string().uuid(),
      taskId: z.string().uuid(),
      actorId: z.string().uuid(),
    }),
  )
  .query(async ({ input }) => {
    await svc().assertPlannerEnabled(input.tenantId)
    return svc()
      .query(new ListTaskEvidenceQuery(input.tenantId, input.planId, input.taskId, input.actorId))
      .catch((e) => {
        throw toPlannerTrpcError(e)
      })
  }),
```

- [ ] **Step 2: Typecheck + commit**

```bash
bun run --filter @future/api typecheck
git add apps/api/src/modules/planner/interface/trpc/evidence.router.ts
git commit -m "feat(planner): tag evidence.list with agent meta"
```

---

## Task 6: `stripIdentitySchema` helper

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/tool-registry/strip-identity-schema.ts`
- Create: `apps/api/src/modules/agents/infrastructure/tool-registry/strip-identity-schema.spec.ts`

Converts a tRPC input Zod object into an LLM-facing variant with `actorId` and `tenantId` omitted. This is a security invariant: identity is never a negotiable LLM decision (spec §6.1, Plan 02 Task 8).

- [ ] **Step 1: Write failing test**

```ts
// apps/api/src/modules/agents/infrastructure/tool-registry/strip-identity-schema.spec.ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { stripIdentitySchema } from './strip-identity-schema'

describe('stripIdentitySchema', () => {
  const original = z.object({
    actorId: z.string().uuid(),
    tenantId: z.string().uuid(),
    planId: z.string().uuid(),
    includeCompleted: z.boolean().default(false),
  })

  it('omits actorId and tenantId while keeping everything else', () => {
    const llm = stripIdentitySchema(original)
    const keys = Object.keys(llm.shape).sort()
    expect(keys).toEqual(['includeCompleted', 'planId'])
  })

  it('throws when the input schema has neither actorId nor tenantId (mis-tagged procedure)', () => {
    const bad = z.object({ somethingElse: z.string() })
    expect(() => stripIdentitySchema(bad)).toThrow(/missing actorId|missing tenantId/)
  })

  it('preserves default values on remaining fields', () => {
    const llm = stripIdentitySchema(original)
    const parsed = llm.parse({ planId: '00000000-0000-4000-8000-000000000001' })
    expect(parsed.includeCompleted).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
bun run --filter @future/api test:unit -- strip-identity-schema
```

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/agents/infrastructure/tool-registry/strip-identity-schema.ts
import type { ZodObject, ZodRawShape } from 'zod'

/**
 * Returns a copy of `schema` without `actorId` and `tenantId` keys.
 * Used at tool-registry build time: the LLM never sees or influences identity fields.
 *
 * Throws if the procedure's schema lacks `actorId` or `tenantId` — that indicates a
 * mis-tagged procedure (agent tools must use the module's handler-side identity convention).
 */
export function stripIdentitySchema<TShape extends ZodRawShape>(
  schema: ZodObject<TShape>,
): ZodObject<Omit<TShape, 'actorId' | 'tenantId'>> {
  if (!('actorId' in schema.shape)) {
    throw new Error('stripIdentitySchema: missing actorId on procedure input schema')
  }
  if (!('tenantId' in schema.shape)) {
    throw new Error('stripIdentitySchema: missing tenantId on procedure input schema')
  }
  return schema.omit({ actorId: true, tenantId: true } as const) as ZodObject<
    Omit<TShape, 'actorId' | 'tenantId'>
  >
}
```

- [ ] **Step 4: Run + commit**

```bash
bun run --filter @future/api test:unit -- strip-identity-schema
git add apps/api/src/modules/agents/infrastructure/tool-registry/strip-identity-schema.ts \
        apps/api/src/modules/agents/infrastructure/tool-registry/strip-identity-schema.spec.ts
git commit -m "feat(agents): strip-identity-schema helper (actorId + tenantId removed for LLM)"
```

---

## Task 7: `ToolRegistryBuilder`

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/tool-registry/tool-registry-builder.ts`
- Create: `apps/api/src/modules/agents/infrastructure/tool-registry/tool-registry-builder.spec.ts`

Walks a tRPC router tree, extracts procedures with `meta.agent`, and produces AI SDK `tool()` shapes. Each tool's `execute` calls `ToolGateway.invoke`.

- [ ] **Step 1: Write failing test**

```ts
// apps/api/src/modules/agents/infrastructure/tool-registry/tool-registry-builder.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { initTRPC } from '@trpc/server'
import type { AgentToolMeta } from '../../domain/value-objects/agent-tool-meta'
import { ToolRegistryBuilder } from './tool-registry-builder'

// Build a minimal in-memory tRPC app for the test.
interface TestMeta {
  permission?: string
  agent?: AgentToolMeta
}
const t = initTRPC.meta<TestMeta>().context<{ actorId: string; tenantId: string }>().create()

const pingProcedure = t.procedure
  .meta({
    permission: 'test:ping',
    agent: {
      whenToUse: 'ping',
      whenNotToUse: 'pong',
      examples: [{ input: 'ping', callArgs: {} }],
    },
  })
  .input(z.object({ actorId: z.string().uuid(), tenantId: z.string().uuid(), q: z.string() }))
  .query(async ({ input }) => ({ echoed: input.q }))

const unTaggedProcedure = t.procedure
  .input(z.object({ actorId: z.string().uuid(), tenantId: z.string().uuid() }))
  .query(async () => ({ ok: true }))

const testRouter = t.router({
  ping: pingProcedure,
  hidden: unTaggedProcedure,
  nested: t.router({ pung: pingProcedure }),
})

function makeCtx() {
  // Minimal structural ctx for tool closures — no need to exercise TurnContext fully here.
  return {
    traceId: 'tr',
    actorId: '00000000-0000-4000-8000-000000000aaa',
    tenantId: '00000000-0000-4000-8000-00000000000a',
    subAgentKey: 'test',
    abortSignal: new AbortController().signal,
    mode: 'execute' as const,
    taintFlag: false,
    setTainted: () => undefined,
    l1Cache: null,
    circuitBreaker: null,
  }
}

describe('ToolRegistryBuilder', () => {
  const gateway = { invoke: vi.fn().mockResolvedValue({ echoed: 'x' }) }
  const builder = new ToolRegistryBuilder(gateway as never)

  it('build() (unbound) includes every procedure that has agent meta', () => {
    const tools = builder.build(testRouter)
    const names = Object.keys(tools).sort()
    expect(names).toContain('ping')
    expect(names).toContain('nested.pung')
  })

  it('build() omits procedures without agent meta', () => {
    const tools = builder.build(testRouter)
    expect(Object.keys(tools)).not.toContain('hidden')
  })

  it('build() (unbound) tool throws on execute — ctx is required', async () => {
    const tools = builder.build(testRouter)
    await expect(tools['ping'].execute({ q: 'x' })).rejects.toThrow(/without a bound TurnContext/)
  })

  it('buildFor(ctx) delegates to gateway with the captured ctx and stripped identity', async () => {
    const ctx = makeCtx()
    const tools = builder.buildFor(testRouter, ctx as never)
    await tools['ping'].execute({ q: 'x' })
    expect(gateway.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'ping',
        permission: 'test:ping',
        args: { q: 'x' },
        isMutation: false,
        domain: 'ping',
      }),
      ctx,
    )
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
bun run --filter @future/api test:unit -- tool-registry-builder
```

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/agents/infrastructure/tool-registry/tool-registry-builder.ts
import { Injectable } from '@nestjs/common'
import { tool, type Tool } from 'ai'
import type { AnyRouter, AnyProcedure } from '@trpc/server'
import type { ZodObject, ZodRawShape } from 'zod'
import type { ToolGateway } from '../../domain/ports/tool-gateway.port'
import type { AgentToolMeta } from '../../domain/value-objects/agent-tool-meta'
import type { TurnContext } from '../../domain/value-objects/turn-context'
import { stripIdentitySchema } from './strip-identity-schema'

interface ProcedureDefMeta {
  permission?: string
  agent?: AgentToolMeta
}

interface ProcedureDef {
  meta?: ProcedureDefMeta
  inputs?: Array<unknown>
  type?: 'query' | 'mutation' | 'subscription'
  // tRPC procedures expose a callable `resolver`; shape varies by version, so we use
  // the direct procedure function handle for invocation.
}

type AgentToolMap = Record<string, Tool>

@Injectable()
export class ToolRegistryBuilder {
  constructor(private readonly gateway: ToolGateway) {}

  /**
   * `context` is set per-turn by the caller (SubAgentRunner, Plan 04): each tool call
   * in a turn shares one TurnContext. `build(router)` is a factory that returns a
   * context-binding function when needed, but for Phase 1 the context is passed at
   * execute time via a closure pattern.
   */
  /**
   * Unbound: extracts tool descriptors from the router tree but without a bound
   * context. Useful for catalog introspection + drift tests.
   */
  build(router: AnyRouter): AgentToolMap {
    return this.buildFor(router, null)
  }

  /**
   * Per-turn factory: produces a tool map whose `execute` closures capture `ctx`.
   * Called by SubAgentRunner once per turn. Safe under concurrent requests because
   * each turn constructs its own tool map with its own context closure.
   */
  buildFor(router: AnyRouter, ctx: TurnContext | null): AgentToolMap {
    const tools: AgentToolMap = {}
    this.walk(router, [], tools, ctx)
    return tools
  }

  private walk(
    node: AnyRouter,
    path: string[],
    tools: AgentToolMap,
    ctx: TurnContext | null,
  ): void {
    const procedures = (node._def?.procedures ?? {}) as Record<string, AnyProcedure | AnyRouter>
    for (const [key, value] of Object.entries(procedures)) {
      if (this.isProcedure(value)) {
        const def = value._def as ProcedureDef
        if (!def.meta?.agent) continue
        const fullName = [...path, key].join('.')
        const inputSchema = this.resolveInputSchema(def)
        tools[fullName] = this.makeTool(fullName, def, inputSchema, value as AnyProcedure, ctx)
      } else {
        this.walk(value as AnyRouter, [...path, key], tools, ctx)
      }
    }
  }

  private isProcedure(node: unknown): node is AnyProcedure {
    return (
      typeof node === 'object' &&
      node !== null &&
      '_def' in node &&
      typeof (node as { _def?: { procedures?: unknown } })._def?.procedures === 'undefined'
    )
  }

  private resolveInputSchema(def: ProcedureDef): ZodObject<ZodRawShape> {
    const first = (def.inputs ?? [])[0]
    if (!first || typeof (first as { shape?: unknown }).shape !== 'object') {
      throw new Error('ToolRegistryBuilder: procedure must have a zod-object input schema')
    }
    return first as ZodObject<ZodRawShape>
  }

  private makeTool(
    fullName: string,
    def: ProcedureDef,
    inputSchema: ZodObject<ZodRawShape>,
    procedure: AnyProcedure,
    ctx: TurnContext | null,
  ): Tool {
    const llmSchema = stripIdentitySchema(inputSchema)
    const meta = def.meta!.agent!
    const permission = def.meta!.permission ?? ''
    const isMutation = def.type === 'mutation'
    const domain = fullName.split('.')[0] ?? fullName

    return tool({
      description: `${meta.whenToUse}\n\nDo not use when: ${meta.whenNotToUse}`,
      parameters: llmSchema,
      execute: async (args) => {
        if (!ctx) {
          throw new Error(
            `ToolRegistryBuilder: tool ${fullName} invoked without a bound TurnContext — ` +
              `use buildFor(router, ctx) at turn entry.`,
          )
        }
        return this.gateway.invoke(
          {
            toolName: fullName,
            permission,
            args: args as Record<string, unknown>,
            procedure: async (fullArgs) => {
              // @ts-expect-error — tRPC procedure is invoked via its resolver reference
              return procedure({ input: fullArgs })
            },
            meta,
            isMutation,
            domain,
          },
          ctx,
        )
      },
    })
  }
}
```

- [ ] **Step 4: Run + commit**

```bash
bun run --filter @future/api test:unit -- tool-registry-builder
git add apps/api/src/modules/agents/infrastructure/tool-registry/tool-registry-builder.ts \
        apps/api/src/modules/agents/infrastructure/tool-registry/tool-registry-builder.spec.ts
git commit -m "feat(agents): ToolRegistryBuilder walks tRPC tree + builds AI SDK tools"
```

> **Why `buildFor(ctx)` and not a global sentinel:** Fastify serves concurrent requests on a single Node process. A `globalThis` assignment or module-level mutable would cross-contaminate turns. `buildFor(ctx)` captures the context inside each tool's `execute` closure, which is per-turn by construction.

---

## Task 8: Drift test — every `.meta({ agent })` has required fields

**Files:**

- Modify: `apps/api/src/common/auth/permissions.spec.ts` (extend with a second describe block) OR create `apps/api/src/common/trpc/agent-meta.spec.ts`. Prefer the new file to keep concerns separate.
- Create: `apps/api/src/common/trpc/agent-meta.spec.ts`

- [ ] **Step 1: Write the drift guard**

```ts
// apps/api/src/common/trpc/agent-meta.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MODULES_DIR = join(__dirname, '../../modules')

// Match `.meta({ ... agent: { ... } ... })` blocks. Non-greedy across lines.
const META_AGENT_RE = /\.meta\(\s*\{[^{}]*agent:\s*\{([\s\S]*?)\}\s*,?\s*\}/gm

function findRouterFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) out.push(...findRouterFiles(full))
    else if (entry.endsWith('.router.ts') && !entry.includes('.spec.')) out.push(full)
  }
  return out
}

describe('agent meta — drift guard', () => {
  it('every .meta({ agent }) block has whenToUse, whenNotToUse, and at least one example', () => {
    const files = findRouterFiles(MODULES_DIR)
    const offenders: Array<{ file: string; reason: string }> = []

    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      const matches = source.matchAll(META_AGENT_RE)
      for (const m of matches) {
        const body = m[1]!
        if (!/whenToUse\s*:/.test(body)) {
          offenders.push({
            file: file.replace(MODULES_DIR, 'modules'),
            reason: 'missing whenToUse',
          })
        }
        if (!/whenNotToUse\s*:/.test(body)) {
          offenders.push({
            file: file.replace(MODULES_DIR, 'modules'),
            reason: 'missing whenNotToUse',
          })
        }
        if (!/examples\s*:\s*\[[^\]]+\{[^}]+input\s*:/.test(body)) {
          offenders.push({
            file: file.replace(MODULES_DIR, 'modules'),
            reason: 'missing at least one non-empty example',
          })
        }
      }
    }

    expect(
      offenders,
      offenders.length
        ? `Found ${offenders.length} agent-meta drift issues:\n` +
            offenders.map((o) => `  - ${o.reason}  (${o.file})`).join('\n')
        : '',
    ).toEqual([])
  })

  it('every .meta({ agent }) block also declares a permission key (spec §2 canDo invariant)', () => {
    const files = findRouterFiles(MODULES_DIR)
    const offenders: Array<string> = []

    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      const matches = source.matchAll(META_AGENT_RE)
      for (const _m of matches) {
        // Each `.meta({ ... })` block that contains `agent:` must also contain `permission:`
        // in the same outer brace. The regex matched a block already; walk back to the opener
        // of the same .meta({ … }) call and re-check.
        const full = source.slice(0, _m.index! + _m[0].length)
        const openerIdx = full.lastIndexOf('.meta({', full.length - _m[0].length + 1)
        const block = full.slice(openerIdx, full.length)
        if (!/permission\s*:/.test(block)) {
          offenders.push(`${file.replace(MODULES_DIR, 'modules')}`)
        }
      }
    }

    expect(
      offenders,
      offenders.length
        ? `Missing permission on agent-tagged procedure:\n  - ${offenders.join('\n  - ')}`
        : '',
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Run — expect PASS**

```bash
bun run --filter @future/api test:unit -- agent-meta
```

Expected: 2 PASS (all 5 planner procedures carry both blocks).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/trpc/agent-meta.spec.ts
git commit -m "test(trpc): drift guard — every .meta({ agent }) has required fields + permission"
```

---

## Task 9: Register `ToolRegistryBuilder` in `agents.module.ts`

**Files:**

- Modify: `apps/api/src/modules/agents/agents.module.ts`

- [ ] **Step 1: Add import + provider**

```ts
import { ToolRegistryBuilder } from './infrastructure/tool-registry/tool-registry-builder'
```

Add to providers:

```ts
ToolRegistryBuilder,
```

`ToolRegistryBuilder` depends on `ToolGateway` (via the `TOOL_GATEWAY` token). Update the constructor to use the token:

Replace the constructor signature in `tool-registry-builder.ts`:

```ts
import { Inject } from '@nestjs/common'
import { TOOL_GATEWAY } from '../../domain/ports/tool-gateway.port'

// ...
constructor(@Inject(TOOL_GATEWAY) private readonly gateway: ToolGateway) {}
```

- [ ] **Step 2: Typecheck + all tests**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api test:unit
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/agents/agents.module.ts \
        apps/api/src/modules/agents/infrastructure/tool-registry/tool-registry-builder.ts
git commit -m "feat(agents): register ToolRegistryBuilder; inject gateway via token"
```

---

## Self-check before leaving Plan 03

- [ ] All 9 tasks committed.
- [ ] `bun run --filter @future/api test:unit` green — drift tests pass.
- [ ] `bun run --filter @future/api typecheck` green — TrpcMeta extension well-typed.
- [ ] `grep -r "permission: 'planner:tasks:read'" apps/api/src/modules/planner` finds all three task procedures.
- [ ] `grep -r "permission: 'planner:evidence:read'" apps/api/src/modules/planner` finds `evidence.list`.

Next: **04-sub-agents.md** — `defineSubAgent`, `SubAgentRegistry`, `SubAgentRunner` (AI SDK `ToolLoopAgent`, `maxRetries: 0`), `ContextAssembler`, `plannerSubAgent`.

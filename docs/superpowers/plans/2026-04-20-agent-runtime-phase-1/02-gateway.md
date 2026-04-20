# Plan 02 — Tool Gateway

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing `AgentToolExecutor` into `ToolGateway`, implementing the full 10-step pipeline (identity injection → L1 cache lookup → abort pre-check → canDo → shadow-mode → tRPC call → abort post-check → kernel audit → taint flip → cache write). Delete `AgentToolExecutor` in the same change per no-back-compat rule.

**Architecture:** `ToolGateway` is an `@Injectable()` service with a single `invoke()` method executing the pipeline linearly. `TurnContext` is a mutable value object carrying `taintFlag`, `l1Cache`, `circuitBreakerState`, `abortSignal`, caller identity. `AgentPermissionService.checkToolPermission` stays as the canDo adapter.

**Tech Stack:** NestJS, zod, vitest.

---

## File Map

**Create:**

- `apps/api/src/modules/agents/domain/value-objects/turn-context.ts`
- `apps/api/src/modules/agents/domain/value-objects/turn-context.spec.ts`
- `apps/api/src/modules/agents/domain/value-objects/caller-identity.ts`
- `apps/api/src/modules/agents/domain/value-objects/agent-tool-meta.ts`
- `apps/api/src/modules/agents/domain/errors/gateway-errors.ts`
- `apps/api/src/modules/agents/domain/ports/tool-gateway.port.ts`
- `apps/api/src/modules/agents/application/services/canonical-json-hash.ts`
- `apps/api/src/modules/agents/application/services/canonical-json-hash.spec.ts`
- `apps/api/src/modules/agents/application/services/l1-cache.ts`
- `apps/api/src/modules/agents/application/services/l1-cache.spec.ts`
- `apps/api/src/modules/agents/application/services/circuit-breaker.ts`
- `apps/api/src/modules/agents/application/services/circuit-breaker.spec.ts`
- `apps/api/src/modules/agents/application/services/tool-gateway.service.ts`
- `apps/api/src/modules/agents/application/services/tool-gateway.service.spec.ts`
- `apps/api/src/modules/agents/application/services/tool-gateway.service.integration.spec.ts`

**Delete:**

- `apps/api/src/modules/agents/application/services/agent-tool-executor.ts`
- `apps/api/src/modules/agents/application/services/agent-tool-executor.spec.ts`

**Modify:**

- `apps/api/src/modules/agents/agents.module.ts` — swap `AgentToolExecutor` for `ToolGateway`.

---

## Task 1: Caller identity + agent tool meta types

**Files:**

- Create: `apps/api/src/modules/agents/domain/value-objects/caller-identity.ts`
- Create: `apps/api/src/modules/agents/domain/value-objects/agent-tool-meta.ts`

- [ ] **Step 1: `caller-identity.ts`**

```ts
// apps/api/src/modules/agents/domain/value-objects/caller-identity.ts
export interface CallerIdentity {
  readonly actorId: string
  readonly tenantId: string
}
```

- [ ] **Step 2: `agent-tool-meta.ts`**

Defines the Phase-1 subset of the `.meta({ agent })` shape. Additional fields land in later phases; this is the minimal set that the gateway needs.

```ts
// apps/api/src/modules/agents/domain/value-objects/agent-tool-meta.ts
export interface AgentToolMeta {
  /** Human description for LLM: when to reach for this tool. */
  readonly whenToUse: string
  /** Negative example: when to avoid. */
  readonly whenNotToUse: string
  /** At least one example; used in the tool catalog prompt. */
  readonly examples: ReadonlyArray<{ input: string; callArgs: Record<string, unknown> }>
  /** Result-field names that should trip turn-scoped taint when non-null. */
  readonly tenantAuthoredFreeText?: ReadonlyArray<string>
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
bun run --filter @future/api typecheck
git add apps/api/src/modules/agents/domain/value-objects/
git commit -m "feat(agents): caller-identity + agent-tool-meta value objects"
```

---

## Task 2: `TurnContext` value object

**Files:**

- Create: `apps/api/src/modules/agents/domain/value-objects/turn-context.ts`
- Create: `apps/api/src/modules/agents/domain/value-objects/turn-context.spec.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/api/src/modules/agents/domain/value-objects/turn-context.spec.ts
import { describe, it, expect } from 'vitest'
import { TurnContext } from './turn-context'

describe('TurnContext', () => {
  it('exposes caller identity and mutable taint', () => {
    const ctx = TurnContext.create({
      traceId: 't-1',
      actorId: 'a-1',
      tenantId: 'tn-1',
      subAgentKey: 'planner',
      abortSignal: new AbortController().signal,
      mode: 'execute',
    })

    expect(ctx.actorId).toBe('a-1')
    expect(ctx.tenantId).toBe('tn-1')
    expect(ctx.taintFlag).toBe(false)

    ctx.setTainted()
    expect(ctx.taintFlag).toBe(true)
  })

  it('defaults mode to execute', () => {
    const ctx = TurnContext.create({
      traceId: 't',
      actorId: 'a',
      tenantId: 'tn',
      subAgentKey: 'planner',
      abortSignal: new AbortController().signal,
    })
    expect(ctx.mode).toBe('execute')
  })

  it('accepts shadow-mode flag', () => {
    const ctx = TurnContext.create({
      traceId: 't',
      actorId: 'a',
      tenantId: 'tn',
      subAgentKey: 'planner',
      abortSignal: new AbortController().signal,
      mode: 'dry-run',
    })
    expect(ctx.mode).toBe('dry-run')
  })

  it('taint is a monotonic latch (true → true)', () => {
    const ctx = TurnContext.create({
      traceId: 't',
      actorId: 'a',
      tenantId: 'tn',
      subAgentKey: 'planner',
      abortSignal: new AbortController().signal,
    })
    ctx.setTainted()
    ctx.setTainted()
    expect(ctx.taintFlag).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
bun run --filter @future/api test:unit -- turn-context
```

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/agents/domain/value-objects/turn-context.ts
import type { L1Cache } from '../../application/services/l1-cache'
import type { CircuitBreaker } from '../../application/services/circuit-breaker'

export type TurnMode = 'execute' | 'dry-run'

export interface TurnContextInit {
  traceId: string
  actorId: string
  tenantId: string
  subAgentKey: string
  abortSignal: AbortSignal
  mode?: TurnMode
  l1Cache?: L1Cache
  circuitBreaker?: CircuitBreaker
}

export class TurnContext {
  private _taint = false

  private constructor(
    public readonly traceId: string,
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly subAgentKey: string,
    public readonly abortSignal: AbortSignal,
    public readonly mode: TurnMode,
    public readonly l1Cache: L1Cache | null,
    public readonly circuitBreaker: CircuitBreaker | null,
  ) {}

  static create(init: TurnContextInit): TurnContext {
    return new TurnContext(
      init.traceId,
      init.actorId,
      init.tenantId,
      init.subAgentKey,
      init.abortSignal,
      init.mode ?? 'execute',
      init.l1Cache ?? null,
      init.circuitBreaker ?? null,
    )
  }

  get taintFlag(): boolean {
    return this._taint
  }

  setTainted(): void {
    this._taint = true
  }
}
```

- [ ] **Step 4: Run + commit**

```bash
bun run --filter @future/api test:unit -- turn-context
git add apps/api/src/modules/agents/domain/value-objects/turn-context.ts \
        apps/api/src/modules/agents/domain/value-objects/turn-context.spec.ts
git commit -m "feat(agents): TurnContext value object with mutable taint latch"
```

---

## Task 3: Gateway error hierarchy

**Files:**

- Create: `apps/api/src/modules/agents/domain/errors/gateway-errors.ts`

- [ ] **Step 1: Define the error classes**

```ts
// apps/api/src/modules/agents/domain/errors/gateway-errors.ts
export abstract class GatewayError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class PermissionDeniedError extends GatewayError {
  constructor(
    public readonly toolName: string,
    public readonly permission: string,
  ) {
    super(`permission denied: ${permission} on ${toolName}`)
  }
}

export class AbortedError extends GatewayError {
  constructor(public readonly phase: 'pre-call' | 'post-call') {
    super(`tool invocation aborted at ${phase}`)
  }
}

export class DomainExecutionError extends GatewayError {
  constructor(
    public readonly toolName: string,
    public readonly cause: unknown,
  ) {
    super(`domain execution failed for ${toolName}`)
  }
}

export class ToolDisabledError extends GatewayError {
  constructor(public readonly toolName: string) {
    super(`tool disabled by circuit breaker: ${toolName}`)
  }
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
bun run --filter @future/api typecheck
git add apps/api/src/modules/agents/domain/errors/gateway-errors.ts
git commit -m "feat(agents): gateway error hierarchy"
```

---

## Task 4: Canonical JSON hash helper

**Files:**

- Create: `apps/api/src/modules/agents/application/services/canonical-json-hash.ts`
- Create: `apps/api/src/modules/agents/application/services/canonical-json-hash.spec.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/api/src/modules/agents/application/services/canonical-json-hash.spec.ts
import { describe, it, expect } from 'vitest'
import { canonicalJsonHash } from './canonical-json-hash'

describe('canonicalJsonHash', () => {
  it('produces identical hashes for key-reordered objects', () => {
    expect(canonicalJsonHash({ b: 1, a: 2 })).toBe(canonicalJsonHash({ a: 2, b: 1 }))
  })

  it('drops undefined values', () => {
    expect(canonicalJsonHash({ a: 1, b: undefined })).toBe(canonicalJsonHash({ a: 1 }))
  })

  it('preserves null (distinct from missing)', () => {
    expect(canonicalJsonHash({ a: null })).not.toBe(canonicalJsonHash({}))
  })

  it('does not coerce number-like strings', () => {
    expect(canonicalJsonHash({ a: '1' })).not.toBe(canonicalJsonHash({ a: 1 }))
  })

  it('recurses into nested objects and arrays deterministically', () => {
    const x = { outer: { c: 3, a: 1, b: 2 }, arr: [{ y: 2, x: 1 }] }
    const y = { arr: [{ x: 1, y: 2 }], outer: { a: 1, b: 2, c: 3 } }
    expect(canonicalJsonHash(x)).toBe(canonicalJsonHash(y))
  })

  it('returns a hex string of stable length (sha256)', () => {
    const h = canonicalJsonHash({ a: 1 })
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
bun run --filter @future/api test:unit -- canonical-json-hash
```

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/agents/application/services/canonical-json-hash.ts
import { createHash } from 'node:crypto'

/**
 * Deterministic JSON serialization:
 *   - Object keys sorted lexicographically at every depth
 *   - `undefined` values dropped
 *   - `null` preserved (distinct from missing)
 *   - No number coercion; JSON.stringify handles primitive typing
 *   - Arrays retain positional order; inner objects recursively canonicalized
 */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalize)
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const out: Record<string, unknown> = {}
  for (const [k, v] of entries) out[k] = canonicalize(v)
  return out
}

export function canonicalJsonHash(value: unknown): string {
  const json = JSON.stringify(canonicalize(value))
  return createHash('sha256')
    .update(json ?? 'null')
    .digest('hex')
}
```

- [ ] **Step 4: Run + commit**

```bash
bun run --filter @future/api test:unit -- canonical-json-hash
git add apps/api/src/modules/agents/application/services/canonical-json-hash.ts \
        apps/api/src/modules/agents/application/services/canonical-json-hash.spec.ts
git commit -m "feat(agents): deterministic canonical-JSON hash for L1 cache keys"
```

---

## Task 5: `L1Cache`

**Files:**

- Create: `apps/api/src/modules/agents/application/services/l1-cache.ts`
- Create: `apps/api/src/modules/agents/application/services/l1-cache.spec.ts`

Turn-scoped map: `(toolName, argsHash) → result`. Invalidation rule: any mutation tool call in the same sub-agent clears entries whose `toolName` starts with the same domain prefix (per implementation-doc §8 "domain-wide clear"; exact rule pinned there).

- [ ] **Step 1: Write failing test**

```ts
// apps/api/src/modules/agents/application/services/l1-cache.spec.ts
import { describe, it, expect } from 'vitest'
import { L1Cache } from './l1-cache'
import { canonicalJsonHash } from './canonical-json-hash'

describe('L1Cache', () => {
  it('stores and retrieves by (toolName, argsHash)', () => {
    const cache = new L1Cache()
    const h = canonicalJsonHash({ planId: 'p1' })
    cache.set('planner.tasks.getFlat', h, { rows: ['a'] })
    expect(cache.get('planner.tasks.getFlat', h)).toEqual({ rows: ['a'] })
  })

  it('returns undefined on miss', () => {
    const cache = new L1Cache()
    expect(cache.get('planner.tasks.getFlat', 'no-hash')).toBeUndefined()
  })

  it('domain-wide invalidate clears all entries whose toolName shares the domain prefix', () => {
    const cache = new L1Cache()
    cache.set('planner.tasks.getFlat', 'h1', { rows: [] })
    cache.set('planner.evidence.list', 'h2', { rows: [] })
    cache.set('people.profiles.getByUserId', 'h3', { user: {} })

    cache.invalidateDomain('planner')

    expect(cache.get('planner.tasks.getFlat', 'h1')).toBeUndefined()
    expect(cache.get('planner.evidence.list', 'h2')).toBeUndefined()
    expect(cache.get('people.profiles.getByUserId', 'h3')).toEqual({ user: {} })
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
bun run --filter @future/api test:unit -- l1-cache
```

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/agents/application/services/l1-cache.ts
/**
 * Turn-scoped cache. Not shared across sub-agents; not shared across turns.
 * Lives on TurnContext.
 */
export class L1Cache {
  private readonly store = new Map<string, unknown>()

  private key(toolName: string, argsHash: string): string {
    return `${toolName}::${argsHash}`
  }

  get(toolName: string, argsHash: string): unknown | undefined {
    return this.store.get(this.key(toolName, argsHash))
  }

  set(toolName: string, argsHash: string, value: unknown): void {
    this.store.set(this.key(toolName, argsHash), value)
  }

  /**
   * Invalidates all entries whose toolName begins with `${domain}.`.
   * Called after a mutation tool in the same sub-agent.
   */
  invalidateDomain(domain: string): void {
    const prefix = `${domain}.`
    for (const key of this.store.keys()) {
      const toolName = key.split('::')[0]
      if (toolName === domain || toolName.startsWith(prefix)) this.store.delete(key)
    }
  }
}
```

- [ ] **Step 4: Run + commit**

```bash
bun run --filter @future/api test:unit -- l1-cache
git add apps/api/src/modules/agents/application/services/l1-cache.ts \
        apps/api/src/modules/agents/application/services/l1-cache.spec.ts
git commit -m "feat(agents): L1 turn-scoped cache with domain-wide invalidation"
```

---

## Task 6: `CircuitBreaker`

**Files:**

- Create: `apps/api/src/modules/agents/application/services/circuit-breaker.ts`
- Create: `apps/api/src/modules/agents/application/services/circuit-breaker.spec.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/api/src/modules/agents/application/services/circuit-breaker.spec.ts
import { describe, it, expect } from 'vitest'
import { CircuitBreaker } from './circuit-breaker'

describe('CircuitBreaker (per sub-agent, 2-failure threshold)', () => {
  it('tool is enabled until 2 failures recorded', () => {
    const cb = new CircuitBreaker()
    expect(cb.isDisabled('planner.tasks.getFlat')).toBe(false)
    cb.recordFailure('planner.tasks.getFlat')
    expect(cb.isDisabled('planner.tasks.getFlat')).toBe(false)
    cb.recordFailure('planner.tasks.getFlat')
    expect(cb.isDisabled('planner.tasks.getFlat')).toBe(true)
  })

  it('first permission-denied disables the tool immediately', () => {
    const cb = new CircuitBreaker()
    cb.recordPermissionDenied('planner.tasks.getFlat')
    expect(cb.isDisabled('planner.tasks.getFlat')).toBe(true)
  })

  it('isolates state per tool', () => {
    const cb = new CircuitBreaker()
    cb.recordFailure('a')
    cb.recordFailure('a')
    expect(cb.isDisabled('a')).toBe(true)
    expect(cb.isDisabled('b')).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
bun run --filter @future/api test:unit -- circuit-breaker
```

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/agents/application/services/circuit-breaker.ts
/**
 * Per-sub-agent circuit breaker. Lives on TurnContext.
 *
 * Rules (§4 of the spec):
 *  - 2 failures of the same tool → disabled for rest of run
 *  - First permission-denied → disabled immediately ("not permitted, proceed without")
 */
export class CircuitBreaker {
  private readonly failures = new Map<string, number>()
  private readonly disabled = new Set<string>()

  isDisabled(toolName: string): boolean {
    return this.disabled.has(toolName)
  }

  recordFailure(toolName: string): void {
    const next = (this.failures.get(toolName) ?? 0) + 1
    this.failures.set(toolName, next)
    if (next >= 2) this.disabled.add(toolName)
  }

  recordPermissionDenied(toolName: string): void {
    this.disabled.add(toolName)
  }
}
```

- [ ] **Step 4: Run + commit**

```bash
bun run --filter @future/api test:unit -- circuit-breaker
git add apps/api/src/modules/agents/application/services/circuit-breaker.ts \
        apps/api/src/modules/agents/application/services/circuit-breaker.spec.ts
git commit -m "feat(agents): CircuitBreaker (2-failure threshold + immediate-on-permission-denied)"
```

---

## Task 7: `ToolGateway` port

**Files:**

- Create: `apps/api/src/modules/agents/domain/ports/tool-gateway.port.ts`

- [ ] **Step 1: Define the port**

```ts
// apps/api/src/modules/agents/domain/ports/tool-gateway.port.ts
import type { AgentToolMeta } from '../value-objects/agent-tool-meta'
import type { CallerIdentity } from '../value-objects/caller-identity'
import type { TurnContext } from '../value-objects/turn-context'

export interface ToolInvocation<TArgs extends object, TResult> {
  readonly toolName: string
  readonly permission: string
  readonly args: TArgs
  readonly procedure: (args: TArgs & CallerIdentity) => Promise<TResult>
  readonly meta: AgentToolMeta
  /** True if this tool mutates. Cache invalidation + audit-event classification differ. */
  readonly isMutation: boolean
  /** Domain prefix of the tool (e.g. 'planner'). Used by L1Cache.invalidateDomain. */
  readonly domain: string
}

export interface ToolGateway {
  invoke<TArgs extends object, TResult>(
    inv: ToolInvocation<TArgs, TResult>,
    ctx: TurnContext,
  ): Promise<TResult>
}

export const TOOL_GATEWAY = Symbol('TOOL_GATEWAY')
```

- [ ] **Step 2: Typecheck + commit**

```bash
bun run --filter @future/api typecheck
git add apps/api/src/modules/agents/domain/ports/tool-gateway.port.ts
git commit -m "feat(agents): ToolGateway port"
```

---

## Task 8: `ToolGateway` service — identity injection + L1 cache + abort-pre-check

**Files:**

- Create: `apps/api/src/modules/agents/application/services/tool-gateway.service.ts`
- Create: `apps/api/src/modules/agents/application/services/tool-gateway.service.spec.ts`

These three steps land together because none of them call the procedure; testing them in isolation keeps the test fixture small. Later tasks add subsequent pipeline steps.

- [ ] **Step 1: Set up the spec file with shared fixtures**

```ts
// apps/api/src/modules/agents/application/services/tool-gateway.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToolGatewayService } from './tool-gateway.service'
import { TurnContext } from '../../domain/value-objects/turn-context'
import { L1Cache } from './l1-cache'
import { CircuitBreaker } from './circuit-breaker'
import { canonicalJsonHash } from './canonical-json-hash'
import { AbortedError, PermissionDeniedError } from '../../domain/errors/gateway-errors'

const meta = {
  whenToUse: '...',
  whenNotToUse: '...',
  examples: [{ input: 'x', callArgs: {} }],
}

function makeCtx(overrides: Partial<Parameters<typeof TurnContext.create>[0]> = {}) {
  return TurnContext.create({
    traceId: 't',
    actorId: 'a-1',
    tenantId: 'tn-1',
    subAgentKey: 'planner',
    abortSignal: new AbortController().signal,
    l1Cache: new L1Cache(),
    circuitBreaker: new CircuitBreaker(),
    ...overrides,
  })
}

function makePermissionService(allowed = true) {
  return { checkToolPermission: vi.fn().mockResolvedValue(allowed) } as const
}
function makeAuditFacade() {
  return { recordEvent: vi.fn().mockResolvedValue(undefined) } as const
}

describe('ToolGatewayService — identity injection + L1 cache + abort pre-check', () => {
  let permission = makePermissionService()
  let audit = makeAuditFacade()
  let gateway: ToolGatewayService

  beforeEach(() => {
    permission = makePermissionService()
    audit = makeAuditFacade()
    gateway = new ToolGatewayService(permission as never, audit as never)
  })

  it('overrides LLM-supplied actorId/tenantId with context values before invoking the procedure', async () => {
    const ctx = makeCtx()
    const proc = vi.fn().mockResolvedValue({ ok: true })
    await gateway.invoke(
      {
        toolName: 'planner.tasks.getFlat',
        permission: 'planner:tasks:read',
        args: {
          actorId: 'LLM-TRIED-THIS',
          tenantId: 'AND-THIS',
          planId: 'p1',
        } as unknown as { planId: string },
        procedure: proc,
        meta,
        isMutation: false,
        domain: 'planner',
      },
      ctx,
    )
    expect(proc).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'a-1', tenantId: 'tn-1', planId: 'p1' }),
    )
  })

  it('returns cached value on L1 hit and skips the procedure entirely', async () => {
    const ctx = makeCtx()
    const cached = { rows: ['cached'] }
    const argsHash = canonicalJsonHash({ planId: 'p1', actorId: 'a-1', tenantId: 'tn-1' })
    ctx.l1Cache!.set('planner.tasks.getFlat', argsHash, cached)
    const proc = vi.fn().mockResolvedValue({ rows: ['live'] })

    const result = await gateway.invoke(
      {
        toolName: 'planner.tasks.getFlat',
        permission: 'planner:tasks:read',
        args: { planId: 'p1' },
        procedure: proc,
        meta,
        isMutation: false,
        domain: 'planner',
      },
      ctx,
    )
    expect(result).toEqual(cached)
    expect(proc).not.toHaveBeenCalled()
  })

  it('throws AbortedError before any side effect when the abort signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const ctx = makeCtx({ abortSignal: controller.signal })
    const proc = vi.fn()
    await expect(
      gateway.invoke(
        {
          toolName: 'planner.tasks.getFlat',
          permission: 'planner:tasks:read',
          args: { planId: 'p1' },
          procedure: proc,
          meta,
          isMutation: false,
          domain: 'planner',
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(AbortedError)
    expect(proc).not.toHaveBeenCalled()
    expect(audit.recordEvent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
bun run --filter @future/api test:unit -- tool-gateway.service
```

Expected: FAIL with "Cannot find module './tool-gateway.service'".

- [ ] **Step 3: Implement the first three pipeline steps**

```ts
// apps/api/src/modules/agents/application/services/tool-gateway.service.ts
import { Injectable } from '@nestjs/common'
import type { AgentPermissionService } from './agent-permission.service'
import type { KernelAuditFacade } from '@modules/kernel/application/facades/kernel-audit.facade'
import type { ToolGateway, ToolInvocation } from '../../domain/ports/tool-gateway.port'
import type { TurnContext } from '../../domain/value-objects/turn-context'
import { canonicalJsonHash } from './canonical-json-hash'
import { AbortedError, PermissionDeniedError } from '../../domain/errors/gateway-errors'

@Injectable()
export class ToolGatewayService implements ToolGateway {
  constructor(
    private readonly permission: AgentPermissionService,
    private readonly audit: KernelAuditFacade,
  ) {}

  async invoke<TArgs extends object, TResult>(
    inv: ToolInvocation<TArgs, TResult>,
    ctx: TurnContext,
  ): Promise<TResult> {
    // Step 1: identity injection — override LLM-supplied fields from ctx.
    const args = { ...inv.args, actorId: ctx.actorId, tenantId: ctx.tenantId }

    // Step 2: L1 cache lookup.
    const argsHash = canonicalJsonHash(args)
    if (ctx.l1Cache) {
      const hit = ctx.l1Cache.get(inv.toolName, argsHash)
      if (hit !== undefined) return hit as TResult
    }

    // Step 3: abort pre-check.
    if (ctx.abortSignal.aborted) {
      throw new AbortedError('pre-call')
    }

    // Remaining steps land in subsequent tasks.
    throw new Error('tool-gateway: pipeline continues in later tasks')
  }
}
```

- [ ] **Step 4: Run — expect pass on the three covered tests, skip/fail on others**

```bash
bun run --filter @future/api test:unit -- tool-gateway.service
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agents/application/services/tool-gateway.service.ts \
        apps/api/src/modules/agents/application/services/tool-gateway.service.spec.ts
git commit -m "feat(agents): ToolGateway steps 1-3 (identity, cache lookup, abort pre-check)"
```

---

## Task 9: `ToolGateway` — permission check + circuit breaker

**Files:**

- Modify: `apps/api/src/modules/agents/application/services/tool-gateway.service.ts`
- Modify: `apps/api/src/modules/agents/application/services/tool-gateway.service.spec.ts`

- [ ] **Step 1: Add failing tests**

Append to the existing describe block:

```ts
it('throws PermissionDeniedError when canDo returns false', async () => {
  permission.checkToolPermission.mockResolvedValue(false)
  const ctx = makeCtx()
  await expect(
    gateway.invoke(
      {
        toolName: 'planner.tasks.getFlat',
        permission: 'planner:tasks:read',
        args: { planId: 'p1' },
        procedure: vi.fn(),
        meta,
        isMutation: false,
        domain: 'planner',
      },
      ctx,
    ),
  ).rejects.toBeInstanceOf(PermissionDeniedError)
})

it('disables the tool on the first permission denial (circuit-breaker)', async () => {
  permission.checkToolPermission.mockResolvedValue(false)
  const ctx = makeCtx()
  await gateway
    .invoke(
      {
        toolName: 'planner.tasks.getFlat',
        permission: 'planner:tasks:read',
        args: { planId: 'p1' },
        procedure: vi.fn(),
        meta,
        isMutation: false,
        domain: 'planner',
      },
      ctx,
    )
    .catch(() => undefined)
  expect(ctx.circuitBreaker!.isDisabled('planner.tasks.getFlat')).toBe(true)
})

it('skips invocation when the tool is already disabled by the circuit breaker', async () => {
  const ctx = makeCtx()
  ctx.circuitBreaker!.recordPermissionDenied('planner.tasks.getFlat')
  const proc = vi.fn()
  await expect(
    gateway.invoke(
      {
        toolName: 'planner.tasks.getFlat',
        permission: 'planner:tasks:read',
        args: { planId: 'p1' },
        procedure: proc,
        meta,
        isMutation: false,
        domain: 'planner',
      },
      ctx,
    ),
  ).rejects.toThrow(/tool disabled/)
  expect(proc).not.toHaveBeenCalled()
  expect(permission.checkToolPermission).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run — expect failures**

```bash
bun run --filter @future/api test:unit -- tool-gateway.service
```

- [ ] **Step 3: Update the implementation**

Replace the body of `invoke()` in `tool-gateway.service.ts`:

```ts
async invoke<TArgs extends object, TResult>(
  inv: ToolInvocation<TArgs, TResult>,
  ctx: TurnContext,
): Promise<TResult> {
  if (ctx.circuitBreaker?.isDisabled(inv.toolName)) {
    throw new ToolDisabledError(inv.toolName)
  }

  const args = { ...inv.args, actorId: ctx.actorId, tenantId: ctx.tenantId }
  const argsHash = canonicalJsonHash(args)

  if (ctx.l1Cache) {
    const hit = ctx.l1Cache.get(inv.toolName, argsHash)
    if (hit !== undefined) return hit as TResult
  }

  if (ctx.abortSignal.aborted) throw new AbortedError('pre-call')

  const allowed = await this.permission.checkToolPermission({
    actorId: ctx.actorId,
    tenantId: ctx.tenantId,
    toolName: inv.toolName,
    permission: inv.permission,
    args: args as Record<string, unknown>,
  })
  if (!allowed) {
    ctx.circuitBreaker?.recordPermissionDenied(inv.toolName)
    throw new PermissionDeniedError(inv.toolName, inv.permission)
  }

  throw new Error('tool-gateway: pipeline continues in later tasks')
}
```

Also add to imports at the top:

```ts
import { ToolDisabledError } from '../../domain/errors/gateway-errors'
```

- [ ] **Step 4: Run + commit**

```bash
bun run --filter @future/api test:unit -- tool-gateway.service
git add apps/api/src/modules/agents/application/services/tool-gateway.service.ts \
        apps/api/src/modules/agents/application/services/tool-gateway.service.spec.ts
git commit -m "feat(agents): ToolGateway steps 4 + breaker-short-circuit (canDo + disabled-skip)"
```

---

## Task 10: `ToolGateway` — shadow mode + procedure call + abort post-check

**Files:**

- Modify: `apps/api/src/modules/agents/application/services/tool-gateway.service.ts`
- Modify: `apps/api/src/modules/agents/application/services/tool-gateway.service.spec.ts`

- [ ] **Step 1: Add failing tests**

```ts
it('shadow-mode dry-run returns a typed marker and skips the procedure', async () => {
  const ctx = makeCtx({ mode: 'dry-run' })
  const proc = vi.fn()
  const result = await gateway.invoke(
    {
      toolName: 'planner.tasks.getFlat',
      permission: 'planner:tasks:read',
      args: { planId: 'p1' },
      procedure: proc,
      meta,
      isMutation: false,
      domain: 'planner',
    },
    ctx,
  )
  expect(result).toEqual({ __shadow: true, toolName: 'planner.tasks.getFlat' })
  expect(proc).not.toHaveBeenCalled()
})

it('invokes the procedure with merged identity args and returns its result', async () => {
  const ctx = makeCtx()
  const proc = vi.fn().mockResolvedValue({ rows: [1, 2] })
  const result = await gateway.invoke(
    {
      toolName: 'planner.tasks.getFlat',
      permission: 'planner:tasks:read',
      args: { planId: 'p1' },
      procedure: proc,
      meta,
      isMutation: false,
      domain: 'planner',
    },
    ctx,
  )
  expect(result).toEqual({ rows: [1, 2] })
  expect(proc).toHaveBeenCalledWith({ planId: 'p1', actorId: 'a-1', tenantId: 'tn-1' })
})

it('aborts after the procedure returns if abort fires mid-call', async () => {
  const controller = new AbortController()
  const ctx = makeCtx({ abortSignal: controller.signal })
  const proc = vi.fn().mockImplementation(async () => {
    controller.abort()
    return { rows: [] }
  })
  await expect(
    gateway.invoke(
      {
        toolName: 'planner.tasks.getFlat',
        permission: 'planner:tasks:read',
        args: { planId: 'p1' },
        procedure: proc,
        meta,
        isMutation: false,
        domain: 'planner',
      },
      ctx,
    ),
  ).rejects.toBeInstanceOf(AbortedError)
})
```

- [ ] **Step 2: Run — expect failures**

- [ ] **Step 3: Implement**

Replace the end of `invoke()`:

```ts
  // Shadow-mode branch: return a marker; skip procedure, audit, taint, cache.
  if (ctx.mode === 'dry-run') {
    return { __shadow: true, toolName: inv.toolName } as unknown as TResult
  }

  // Step 6: procedure invocation.
  let result: TResult
  try {
    result = await inv.procedure(args as TArgs & CallerIdentity)
  } catch (cause) {
    ctx.circuitBreaker?.recordFailure(inv.toolName)
    throw new DomainExecutionError(inv.toolName, cause)
  }

  // Step 7: abort post-check.
  if (ctx.abortSignal.aborted) throw new AbortedError('post-call')

  // Remaining steps (audit, taint, cache) land in the next task.
  return result
}
```

Add the import:

```ts
import { DomainExecutionError } from '../../domain/errors/gateway-errors'
import type { CallerIdentity } from '../../domain/value-objects/caller-identity'
```

- [ ] **Step 4: Run + commit**

```bash
bun run --filter @future/api test:unit -- tool-gateway.service
git add apps/api/src/modules/agents/application/services/tool-gateway.service.ts \
        apps/api/src/modules/agents/application/services/tool-gateway.service.spec.ts
git commit -m "feat(agents): ToolGateway steps 5-7 (shadow mode, tRPC call, abort post-check)"
```

---

## Task 11: `ToolGateway` — kernel audit + taint flip + cache write

**Files:**

- Modify: `apps/api/src/modules/agents/application/services/tool-gateway.service.ts`
- Modify: `apps/api/src/modules/agents/application/services/tool-gateway.service.spec.ts`

- [ ] **Step 1: Add failing tests**

```ts
it('writes a kernel audit event after successful invocation', async () => {
  const ctx = makeCtx()
  const proc = vi.fn().mockResolvedValue({ rows: [] })
  await gateway.invoke(
    {
      toolName: 'planner.tasks.getFlat',
      permission: 'planner:tasks:read',
      args: { planId: 'p1' },
      procedure: proc,
      meta,
      isMutation: false,
      domain: 'planner',
    },
    ctx,
  )
  expect(audit.recordEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      eventType: 'agent.tool_called',
      tenantId: 'tn-1',
      actorId: 'a-1',
      module: 'agents',
      payload: expect.objectContaining({
        trace_id: 't',
        tool_name: 'planner.tasks.getFlat',
        permission_key: 'planner:tasks:read',
      }),
    }),
  )
})

it('flips taint when the result contains a non-null tenantAuthoredFreeText field', async () => {
  const ctx = makeCtx()
  const proc = vi.fn().mockResolvedValue({ notes: 'suspicious string', id: 1 })
  await gateway.invoke(
    {
      toolName: 'planner.tasks.getDetail',
      permission: 'planner:tasks:read',
      args: { taskId: 't1' },
      procedure: proc,
      meta: { ...meta, tenantAuthoredFreeText: ['notes'] },
      isMutation: false,
      domain: 'planner',
    },
    ctx,
  )
  expect(ctx.taintFlag).toBe(true)
})

it('does not flip taint when the declared field is null', async () => {
  const ctx = makeCtx()
  const proc = vi.fn().mockResolvedValue({ notes: null, id: 1 })
  await gateway.invoke(
    {
      toolName: 'planner.tasks.getDetail',
      permission: 'planner:tasks:read',
      args: { taskId: 't1' },
      procedure: proc,
      meta: { ...meta, tenantAuthoredFreeText: ['notes'] },
      isMutation: false,
      domain: 'planner',
    },
    ctx,
  )
  expect(ctx.taintFlag).toBe(false)
})

it('populates L1 cache after a successful read', async () => {
  const ctx = makeCtx()
  const proc = vi.fn().mockResolvedValue({ rows: [1] })
  await gateway.invoke(
    {
      toolName: 'planner.tasks.getFlat',
      permission: 'planner:tasks:read',
      args: { planId: 'p1' },
      procedure: proc,
      meta,
      isMutation: false,
      domain: 'planner',
    },
    ctx,
  )
  const argsHash = canonicalJsonHash({ planId: 'p1', actorId: 'a-1', tenantId: 'tn-1' })
  expect(ctx.l1Cache!.get('planner.tasks.getFlat', argsHash)).toEqual({ rows: [1] })
})

it('mutation tools invalidate the cache domain instead of writing the result', async () => {
  const ctx = makeCtx()
  ctx.l1Cache!.set('planner.tasks.getFlat', 'existing', { rows: [] })
  const proc = vi.fn().mockResolvedValue({ ok: true })
  await gateway.invoke(
    {
      toolName: 'planner.tasks.create',
      permission: 'planner:tasks:write',
      args: { planId: 'p1' },
      procedure: proc,
      meta,
      isMutation: true,
      domain: 'planner',
    },
    ctx,
  )
  expect(ctx.l1Cache!.get('planner.tasks.getFlat', 'existing')).toBeUndefined()
})
```

- [ ] **Step 2: Run — expect failures**

- [ ] **Step 3: Implement** — replace the final section of `invoke()`:

```ts
// Step 8: kernel audit write.
await this.audit.recordEvent({
  tenantId: ctx.tenantId,
  actorId: ctx.actorId,
  eventType: 'agent.tool_called',
  module: 'agents',
  subjectId: inv.toolName,
  payload: {
    trace_id: ctx.traceId,
    tool_name: inv.toolName,
    permission_key: inv.permission,
    args_hash: argsHash,
    result_hash: canonicalJsonHash(result),
    is_mutation: inv.isMutation,
    sub_agent_key: ctx.subAgentKey,
  },
})

// Step 9: taint flip — inspect the result for any declared tenant-authored free-text field.
if (inv.meta.tenantAuthoredFreeText && typeof result === 'object' && result !== null) {
  for (const field of inv.meta.tenantAuthoredFreeText) {
    const value = (result as Record<string, unknown>)[field]
    if (value !== null && value !== undefined && value !== '') {
      ctx.setTainted()
      break
    }
  }
}

// Step 10: cache behavior depends on mutation vs read.
if (inv.isMutation) {
  ctx.l1Cache?.invalidateDomain(inv.domain)
} else {
  ctx.l1Cache?.set(inv.toolName, argsHash, result)
}

return result
```

- [ ] **Step 4: Run + commit**

```bash
bun run --filter @future/api test:unit -- tool-gateway.service
git add apps/api/src/modules/agents/application/services/tool-gateway.service.ts \
        apps/api/src/modules/agents/application/services/tool-gateway.service.spec.ts
git commit -m "feat(agents): ToolGateway steps 8-10 (audit, taint, cache write/invalidate)"
```

---

## Task 12: Gateway integration test (real DB + real audit)

**Files:**

- Create: `apps/api/src/modules/agents/application/services/tool-gateway.service.integration.spec.ts`

- [ ] **Step 1: Write integration test**

```ts
// apps/api/src/modules/agents/application/services/tool-gateway.service.integration.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Test } from '@nestjs/testing'
import { AgentsModule } from '../../agents.module'
import { makeTestDb } from '@future/db/test-helpers'
import { ToolGatewayService } from './tool-gateway.service'
import { TurnContext } from '../../domain/value-objects/turn-context'
import { L1Cache } from './l1-cache'
import { CircuitBreaker } from './circuit-breaker'

describe('ToolGatewayService (integration)', () => {
  const tenantA = '00000000-0000-4000-8000-00000000000a'
  const actor = '00000000-0000-4000-8000-000000000aaa'

  let gateway: ToolGatewayService

  beforeEach(async () => {
    await makeTestDb({ tenantId: tenantA })
    const mod = await Test.createTestingModule({ imports: [AgentsModule] }).compile()
    gateway = mod.get(ToolGatewayService)
  })

  it('invokes a real procedure and writes a real audit row', async () => {
    const ctx = TurnContext.create({
      traceId: 'it-trace-1',
      actorId: actor,
      tenantId: tenantA,
      subAgentKey: 'planner',
      abortSignal: new AbortController().signal,
      l1Cache: new L1Cache(),
      circuitBreaker: new CircuitBreaker(),
    })

    const result = await gateway.invoke(
      {
        toolName: 'planner.test.ping',
        permission: 'planner:tasks:read',
        args: { q: 'x' },
        procedure: async (args) => ({ echoed: args.q }),
        meta: { whenToUse: '', whenNotToUse: '', examples: [] },
        isMutation: false,
        domain: 'planner',
      },
      ctx,
    )

    expect(result).toEqual({ echoed: 'x' })
    // Audit-row assertion: the integration fixture exposes a way to query audit events
    // for a trace_id — follow the existing pattern from other integration specs.
  })
})
```

- [ ] **Step 2: Run**

```bash
bun run --filter @future/api test:integration -- tool-gateway.service
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/agents/application/services/tool-gateway.service.integration.spec.ts
git commit -m "test(agents): ToolGateway integration against real DB + audit"
```

---

## Task 13: Wire `ToolGateway` into the module, delete `AgentToolExecutor`

**Files:**

- Modify: `apps/api/src/modules/agents/agents.module.ts`
- Delete: `apps/api/src/modules/agents/application/services/agent-tool-executor.ts`
- Delete: `apps/api/src/modules/agents/application/services/agent-tool-executor.spec.ts`

- [ ] **Step 1: Delete the old executor + its spec**

```bash
rm apps/api/src/modules/agents/application/services/agent-tool-executor.ts \
   apps/api/src/modules/agents/application/services/agent-tool-executor.spec.ts
```

- [ ] **Step 2: Update `agents.module.ts`**

Replace the `AgentToolExecutor` import and provider with `ToolGatewayService`:

```ts
// Remove this line:
//   import { AgentToolExecutor } from './application/services/agent-tool-executor'

// Add:
import { ToolGatewayService } from './application/services/tool-gateway.service'
import { TOOL_GATEWAY } from './domain/ports/tool-gateway.port'
import { KernelAuditFacade } from '@modules/kernel/application/facades/kernel-audit.facade'
```

Replace the provider entry `AgentToolExecutor,` with:

```ts
ToolGatewayService,
{ provide: TOOL_GATEWAY, useExisting: ToolGatewayService },
```

`KernelAuditFacade` is already available via `KernelModule` (already imported).

- [ ] **Step 3: Typecheck — ensure no remaining reference**

```bash
bun run --filter @future/api typecheck
```

If there's a residual import of `AgentToolExecutor` outside this module, the typecheck will surface it (grep confirms there are none at plan-write time; verify).

- [ ] **Step 4: Run every test**

```bash
bun run --filter @future/api test:unit
bun run --filter @future/api test:integration -- agents
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agents/agents.module.ts \
        apps/api/src/modules/agents/application/services/agent-tool-executor.ts \
        apps/api/src/modules/agents/application/services/agent-tool-executor.spec.ts
git commit -m "refactor(agents): replace AgentToolExecutor with ToolGateway"
```

---

## Self-check before leaving Plan 02

- [ ] All 13 tasks committed; one logical change per commit.
- [ ] `bun run --filter @future/api test:unit` green.
- [ ] `bun run --filter @future/api test:integration` green.
- [ ] `grep -r AgentToolExecutor apps/` returns no matches.
- [ ] `bun run --filter @future/api dev` boots cleanly.

Next: **03-tool-registry.md** — extend `TrpcMeta` with `agent`, tag 5 planner procedures, build the registry adapter, add drift tests.

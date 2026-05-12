# @seta/agent-core K2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship concrete `AnthropicAdapter`, `OpenAIAdapter`, and `AzureOpenAIAdapter` that satisfy K1's `ModelAdapter` contract, plus wire them up in `apps/api`. After K2 lands, `run(cfg, input, { adapters: agentRegistry })` works against real Anthropic, OpenAI, and Azure OpenAI models with deterministic MSW recordings in CI.

**Architecture:** Three flat per-provider adapter factories (`createXxxAdapter(cfg) → ModelAdapter`) closing over a pre-constructed SDK client. Pure helpers (`cache-control`, `tokens`, `translate/*`) compose into each adapter. OTel span (`startLlmSpan`) spans the entire stream lifecycle. Registry composition lives in `apps/api/src/agent.ts`.

**Tech Stack:** TypeScript ESM, `@anthropic-ai/sdk@0.95.1`, `openai@6.37.0`, `js-tiktoken@1.0.21`, `@opentelemetry/api@1.9.1`, `zod@4.4.3`, `msw@2.14.6` (testkit), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-05-12-agent-core-k2-design.md`

---

## Notes for the implementer

1. **No process metadata in source.** Do not put plan/task/PR/ticket IDs in `.ts` files. References to the K1 spec / K2 plan / Mastra patterns belong in commit messages, not code comments.
2. **Workspace conventions** — CLI-only dependency management. Use `pnpm --filter @seta/<pkg> add <dep>@<version>`; never hand-edit `package.json` (except metadata fields).
3. **Adapter chunk emission rules.** Adapters do **NOT** emit `{ type: 'error' }` or `{ type: 'abort' }` chunks. On error they **throw** (`run()` wraps); on abort they **stop yielding** (`run()` emits the `abort` chunk).
4. **Tenant context** — `tenantContext.getTenantId()` throws when no ALS frame. Wrap reads in `try { ... } catch { undefined }` inside `span.ts` (defensive read for the optional `tenant.id` attribute).
5. **Commits** — Conventional Commits, scope `agent-core` for kernel changes, `api` for `apps/api` changes. One PR for the whole stream is fine; commit per task.
6. **Test files** — co-located unit tests `src/**/*.test.ts`, integration tests `tests/integration/**`.

---

## Task 0: Install dependencies

**Files:**
- Modify: `platform/agent/core/package.json` (via pnpm CLI only)
- Modify: `apps/api/package.json` (no — apps/api already has `@seta/agent-core` workspace dep transitively via `agent.ts` import? confirm in step 2)

- [ ] **Step 1: Install `js-tiktoken` into `@seta/agent-core`**

```bash
pnpm --filter @seta/agent-core add js-tiktoken@1.0.21
```

Expected: lockfile updated; `package.json` `dependencies` gains `"js-tiktoken": "1.0.21"`.

- [ ] **Step 2: Add `@seta/tenant` and `@opentelemetry/api` workspace deps**

```bash
pnpm --filter @seta/agent-core add @seta/tenant@workspace:*
pnpm --filter @seta/agent-core add @opentelemetry/api@1.9.1
```

Expected: `dependencies` now includes both. `@anthropic-ai/sdk`, `openai`, `msw`, `@seta/middleware`, `@seta/observability`, `zod`, `uuid`, `hono` should already be there.

- [ ] **Step 3: Verify `apps/api` will resolve `@seta/agent-core` and its new exports**

```bash
grep '@seta/agent-core' apps/api/package.json
```

If not listed, add it:

```bash
pnpm --filter @seta/api add @seta/agent-core@workspace:*
```

- [ ] **Step 4: Verify typecheck + lint still green on the empty changeset**

```bash
pnpm --filter @seta/agent-core typecheck
pnpm --filter @seta/agent-core lint
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/package.json apps/api/package.json pnpm-lock.yaml
git commit -m "chore(agent-core): add js-tiktoken, @seta/tenant, @opentelemetry/api deps for K2"
```

---

## Task 1: `tokens.ts` — pre-request token estimator

**Files:**
- Create: `platform/agent/core/src/models/tokens.ts`
- Create: `platform/agent/core/src/models/tokens.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `platform/agent/core/src/models/tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { countTokens, estimateMessagesInputTokens } from './tokens'
import type { KernelMessage } from '../types'

describe('countTokens', () => {
  it('returns 0 for empty string', () => {
    expect(countTokens('', 'gpt-4o')).toBe(0)
  })

  it('returns >0 for non-empty string', () => {
    expect(countTokens('hello world', 'gpt-4o')).toBeGreaterThan(0)
  })

  it('uses a stable encoding for unknown models (falls back to cl100k_base)', () => {
    const known = countTokens('hello world', 'gpt-4o')
    const unknown = countTokens('hello world', 'some-future-model')
    expect(unknown).toBe(known)
  })
})

describe('estimateMessagesInputTokens', () => {
  it('returns 0 for no system + no messages', () => {
    expect(estimateMessagesInputTokens([], undefined, 'gpt-4o')).toBe(0)
  })

  it('counts system prompt tokens', () => {
    const n = estimateMessagesInputTokens([], 'you are a helpful assistant', 'gpt-4o')
    expect(n).toBeGreaterThan(0)
  })

  it('counts text-content message tokens', () => {
    const messages: KernelMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ]
    expect(estimateMessagesInputTokens(messages, undefined, 'gpt-4o')).toBeGreaterThan(0)
  })

  it('stringifies tool_use args and tool_result results', () => {
    const messages: KernelMessage[] = [
      {
        role: 'assistant',
        content: [{ type: 'tool_use', toolCallId: 't1', name: 'echo', args: { x: 1 } }],
      },
      {
        role: 'tool',
        toolCallId: 't1',
        content: [{ type: 'tool_result', toolCallId: 't1', result: { ok: true } }],
      },
    ]
    expect(estimateMessagesInputTokens(messages, undefined, 'gpt-4o')).toBeGreaterThan(0)
  })

  it('sums system + messages', () => {
    const messages: KernelMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ]
    const onlyMsgs = estimateMessagesInputTokens(messages, undefined, 'gpt-4o')
    const onlySys = estimateMessagesInputTokens([], 'system text', 'gpt-4o')
    const both = estimateMessagesInputTokens(messages, 'system text', 'gpt-4o')
    expect(both).toBe(onlyMsgs + onlySys)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @seta/agent-core vitest run src/models/tokens.test.ts
```

Expected: FAIL with "Cannot find module './tokens'".

- [ ] **Step 3: Write the implementation**

Create `platform/agent/core/src/models/tokens.ts`:

```ts
import { encodingForModel, getEncoding, type TiktokenModel } from 'js-tiktoken'
import type { KernelMessage, KernelMessageContent } from '../types'

const fallback = getEncoding('cl100k_base')

function encoderFor(model: string) {
  try {
    return encodingForModel(model as TiktokenModel)
  } catch {
    return fallback
  }
}

export function countTokens(text: string, model: string): number {
  if (text.length === 0) return 0
  return encoderFor(model).encode(text).length
}

function contentToText(c: KernelMessageContent): string {
  switch (c.type) {
    case 'text':
      return c.text
    case 'tool_use':
      return JSON.stringify(c.args ?? null)
    case 'tool_result':
      return typeof c.result === 'string' ? c.result : JSON.stringify(c.result ?? null)
  }
}

export function estimateMessagesInputTokens(
  messages: KernelMessage[],
  systemPrompt: string | undefined,
  model: string,
): number {
  const enc = encoderFor(model)
  let total = 0
  if (systemPrompt !== undefined && systemPrompt.length > 0) {
    total += enc.encode(systemPrompt).length
  }
  for (const msg of messages) {
    for (const c of msg.content) {
      const text = contentToText(c)
      if (text.length > 0) total += enc.encode(text).length
    }
  }
  return total
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @seta/agent-core vitest run src/models/tokens.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/models/tokens.ts platform/agent/core/src/models/tokens.test.ts
git commit -m "feat(agent-core): tokens.ts pre-request input token estimator"
```

---

## Task 2: `cache-control.ts` — Anthropic-only ephemeral helper

**Files:**
- Create: `platform/agent/core/src/models/cache-control.ts`
- Create: `platform/agent/core/src/models/cache-control.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `platform/agent/core/src/models/cache-control.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyAnthropicCacheControl } from './cache-control'

describe('applyAnthropicCacheControl', () => {
  it('returns input unchanged when cacheTtl is null', () => {
    const req = { system: 'sys', tools: [{ name: 't', description: 'd', input_schema: {} }] }
    const out = applyAnthropicCacheControl(req, null)
    expect(out).toEqual(req)
  })

  it("wraps string system into array form with cache_control when cacheTtl is '5m'", () => {
    const req = { system: 'you are helpful' }
    const out = applyAnthropicCacheControl(req, '5m')
    expect(out.system).toEqual([
      {
        type: 'text',
        text: 'you are helpful',
        cache_control: { type: 'ephemeral', ttl: '5m' },
      },
    ])
  })

  it("propagates '1h' ttl onto system", () => {
    const req = { system: 'stable' }
    const out = applyAnthropicCacheControl(req, '1h')
    expect((out.system as Array<{ cache_control: { ttl: string } }>)[0].cache_control.ttl).toBe('1h')
  })

  it('marks only the last tool with cache_control', () => {
    const req = {
      tools: [
        { name: 'a', description: 'a', input_schema: {} },
        { name: 'b', description: 'b', input_schema: {} },
        { name: 'c', description: 'c', input_schema: {} },
      ],
    }
    const out = applyAnthropicCacheControl(req, '5m')
    expect(out.tools![0]).not.toHaveProperty('cache_control')
    expect(out.tools![1]).not.toHaveProperty('cache_control')
    expect(out.tools![2]).toMatchObject({
      cache_control: { type: 'ephemeral', ttl: '5m' },
    })
  })

  it('marks the single tool when only one is present', () => {
    const req = { tools: [{ name: 'a', description: 'a', input_schema: {} }] }
    const out = applyAnthropicCacheControl(req, '5m')
    expect(out.tools![0]).toMatchObject({
      cache_control: { type: 'ephemeral', ttl: '5m' },
    })
  })

  it('handles missing system and missing tools', () => {
    const out = applyAnthropicCacheControl({}, '5m')
    expect(out).toEqual({})
  })

  it('handles already-array system', () => {
    const req = { system: [{ type: 'text' as const, text: 'pre-wrapped' }] }
    const out = applyAnthropicCacheControl(req, '5m')
    expect(out.system).toEqual([
      { type: 'text', text: 'pre-wrapped', cache_control: { type: 'ephemeral', ttl: '5m' } },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @seta/agent-core vitest run src/models/cache-control.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

Create `platform/agent/core/src/models/cache-control.ts`:

```ts
export type AnthropicCacheTtl = '5m' | '1h'

interface SystemTextBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral'; ttl: AnthropicCacheTtl }
}

interface AnthropicToolLike {
  name: string
  description?: string
  input_schema: unknown
  cache_control?: { type: 'ephemeral'; ttl: AnthropicCacheTtl }
}

interface CacheableRequest {
  system?: string | SystemTextBlock[]
  tools?: AnthropicToolLike[]
}

export function applyAnthropicCacheControl<T extends CacheableRequest>(
  req: T,
  cacheTtl: AnthropicCacheTtl | null,
): T {
  if (cacheTtl === null) return req

  const out: CacheableRequest = { ...req }

  if (out.system !== undefined) {
    const blocks: SystemTextBlock[] =
      typeof out.system === 'string'
        ? [{ type: 'text', text: out.system }]
        : out.system.map((b) => ({ ...b }))
    if (blocks.length > 0) {
      const last = blocks[blocks.length - 1]!
      last.cache_control = { type: 'ephemeral', ttl: cacheTtl }
    }
    out.system = blocks
  }

  if (out.tools !== undefined && out.tools.length > 0) {
    const tools = out.tools.map((t) => ({ ...t }))
    const last = tools[tools.length - 1]!
    last.cache_control = { type: 'ephemeral', ttl: cacheTtl }
    out.tools = tools
  }

  return out as T
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @seta/agent-core vitest run src/models/cache-control.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/models/cache-control.ts platform/agent/core/src/models/cache-control.test.ts
git commit -m "feat(agent-core): cache-control.ts ephemeral prompt-cache annotator"
```

---

## Task 3: `span.ts` — OTel span helper

**Files:**
- Create: `platform/agent/core/src/models/span.ts`
- Create: `platform/agent/core/src/models/span.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `platform/agent/core/src/models/span.test.ts`:

```ts
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SpanStatusCode } from '@opentelemetry/api'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { tenantContext } from '@seta/tenant'
import { startLlmSpan } from './span'

const exporter = new InMemorySpanExporter()
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
})

beforeAll(() => {
  provider.register()
})

afterAll(async () => {
  await provider.shutdown()
})

beforeEach(() => {
  exporter.reset()
})

describe('startLlmSpan', () => {
  it('opens a span with the expected name and baseline attrs', () => {
    const handle = startLlmSpan('anthropic', 'claude-4-7-sonnet', 'run-1')
    handle.end('ok')
    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(1)
    expect(spans[0]!.name).toBe('llm.anthropic.stream')
    expect(spans[0]!.attributes['llm.provider']).toBe('anthropic')
    expect(spans[0]!.attributes['llm.model']).toBe('claude-4-7-sonnet')
    expect(spans[0]!.attributes['run.id']).toBe('run-1')
    expect(spans[0]!.status.code).toBe(SpanStatusCode.OK)
  })

  it('omits tenant.id attribute when no ALS frame is active', () => {
    const handle = startLlmSpan('openai', 'gpt-4o', 'run-2')
    handle.end('ok')
    const span = exporter.getFinishedSpans()[0]!
    expect(span.attributes['tenant.id']).toBeUndefined()
  })

  it('records tenant.id when an ALS frame is active', async () => {
    await tenantContext.run({ tenantId: 'tenant-a' }, async () => {
      const handle = startLlmSpan('openai', 'gpt-4o', 'run-3')
      handle.end('ok')
    })
    const span = exporter.getFinishedSpans()[0]!
    expect(span.attributes['tenant.id']).toBe('tenant-a')
  })

  it('record() merges attrs that appear on the closed span', () => {
    const handle = startLlmSpan('anthropic', 'claude-4-7-sonnet', 'run-4')
    handle.record({ estimatedInputTokens: 100 })
    handle.record({ inputTokens: 120, outputTokens: 50, finishReason: 'stop' })
    handle.end('ok')
    const a = exporter.getFinishedSpans()[0]!.attributes
    expect(a['llm.estimated_input_tokens']).toBe(100)
    expect(a['llm.input_tokens']).toBe(120)
    expect(a['llm.output_tokens']).toBe(50)
    expect(a['llm.finish_reason']).toBe('stop')
  })

  it("end('error', cause) sets ERROR status and records exception", () => {
    const handle = startLlmSpan('openai', 'gpt-4o', 'run-5')
    handle.record({ errorCode: 'LLM_BAD_REQUEST' })
    handle.end('error', new Error('boom'))
    const span = exporter.getFinishedSpans()[0]!
    expect(span.status.code).toBe(SpanStatusCode.ERROR)
    expect(span.attributes['llm.error_code']).toBe('LLM_BAD_REQUEST')
    expect(span.events.some((e) => e.name === 'exception')).toBe(true)
  })

  it("end('aborted') sets OK status and aborted: true attribute", () => {
    const handle = startLlmSpan('openai', 'gpt-4o', 'run-6')
    handle.end('aborted')
    const span = exporter.getFinishedSpans()[0]!
    expect(span.status.code).toBe(SpanStatusCode.OK)
    expect(span.attributes['llm.aborted']).toBe(true)
  })

  it('calling end twice is a no-op', () => {
    const handle = startLlmSpan('openai', 'gpt-4o', 'run-7')
    handle.end('ok')
    handle.end('error', new Error('late'))
    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(1)
    expect(spans[0]!.status.code).toBe(SpanStatusCode.OK)
  })
})
```

- [ ] **Step 2: Install OTel SDK trace test deps (devDependency, agent-core only)**

```bash
pnpm --filter @seta/agent-core add -D @opentelemetry/sdk-trace-base@1.30.1 @opentelemetry/sdk-trace-node@1.30.1
```

Verify versions match `@seta/observability`'s OTel pins; if `@seta/observability` uses different majors, align by reading `platform/observability/package.json` first and matching majors.

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @seta/agent-core vitest run src/models/span.test.ts
```

Expected: FAIL with module-not-found on `./span`.

- [ ] **Step 4: Write the implementation**

Create `platform/agent/core/src/models/span.ts`:

```ts
import { SpanStatusCode, trace, type Span } from '@opentelemetry/api'
import { tenantContext } from '@seta/tenant'

const tracer = trace.getTracer('@seta/agent-core')

export interface LlmSpanAttrs {
  estimatedInputTokens: number
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error'
  errorCode: string
  aborted: boolean
}

export interface LlmSpanHandle {
  record(attrs: Partial<LlmSpanAttrs>): void
  end(status: 'ok' | 'error' | 'aborted', err?: unknown): void
}

function readTenantId(): string | undefined {
  try {
    return tenantContext.getTenantId()
  } catch {
    return undefined
  }
}

const attrKey: Record<keyof LlmSpanAttrs, string> = {
  estimatedInputTokens: 'llm.estimated_input_tokens',
  inputTokens: 'llm.input_tokens',
  outputTokens: 'llm.output_tokens',
  cacheReadInputTokens: 'llm.cache_read_input_tokens',
  cacheCreationInputTokens: 'llm.cache_creation_input_tokens',
  finishReason: 'llm.finish_reason',
  errorCode: 'llm.error_code',
  aborted: 'llm.aborted',
}

export function startLlmSpan(provider: string, model: string, runId: string): LlmSpanHandle {
  const span: Span = tracer.startSpan(`llm.${provider}.stream`)
  span.setAttribute('llm.provider', provider)
  span.setAttribute('llm.model', model)
  span.setAttribute('run.id', runId)
  const tenantId = readTenantId()
  if (tenantId !== undefined) span.setAttribute('tenant.id', tenantId)

  let closed = false

  return {
    record(attrs) {
      if (closed) return
      for (const [k, v] of Object.entries(attrs) as Array<[keyof LlmSpanAttrs, unknown]>) {
        if (v === undefined) continue
        span.setAttribute(attrKey[k], v as never)
      }
    },
    end(status, err) {
      if (closed) return
      closed = true
      if (status === 'error') {
        if (err instanceof Error) span.recordException(err)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err ?? 'error'),
        })
      } else if (status === 'aborted') {
        span.setAttribute('llm.aborted', true)
        span.setStatus({ code: SpanStatusCode.OK })
      } else {
        span.setStatus({ code: SpanStatusCode.OK })
      }
      span.end()
    },
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @seta/agent-core vitest run src/models/span.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add platform/agent/core/src/models/span.ts platform/agent/core/src/models/span.test.ts platform/agent/core/package.json pnpm-lock.yaml
git commit -m "feat(agent-core): span.ts OTel LLM stream span helper"
```

---

## Task 4: `translate/anthropic.ts` — kernel→Anthropic request shape

**Files:**
- Create: `platform/agent/core/src/models/translate/anthropic.ts`
- Create: `platform/agent/core/src/models/translate/anthropic.test.ts`

- [ ] **Step 1: Write the failing unit test (request-side)**

Create `platform/agent/core/src/models/translate/anthropic.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { kernelToAnthropic } from './anthropic'
import type { AdapterRequest } from '../../types'

describe('kernelToAnthropic', () => {
  it('maps text-only user message and system prompt', () => {
    const req: AdapterRequest = {
      model: 'claude-4-7-sonnet',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      systemPrompt: 'you are helpful',
      maxTokens: 1024,
      cacheTtl: null,
    }
    const out = kernelToAnthropic(req)
    expect(out.model).toBe('claude-4-7-sonnet')
    expect(out.max_tokens).toBe(1024)
    expect(out.system).toBe('you are helpful')
    expect(out.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ])
  })

  it('defaults max_tokens to 4096 when omitted', () => {
    const out = kernelToAnthropic({
      model: 'claude-4-7-sonnet',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      cacheTtl: null,
    })
    expect(out.max_tokens).toBe(4096)
  })

  it('applies cache_control when cacheTtl is "5m"', () => {
    const out = kernelToAnthropic({
      model: 'claude-4-7-sonnet',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      systemPrompt: 'system text',
      cacheTtl: '5m',
      tools: [
        {
          name: 'echo',
          description: 'echo',
          inputSchema: { type: 'object', properties: {}, $schema: 'http://json-schema.org/draft-07/schema#' },
        },
      ],
    })
    expect(out.system).toEqual([
      {
        type: 'text',
        text: 'system text',
        cache_control: { type: 'ephemeral', ttl: '5m' },
      },
    ])
    expect(out.tools![0]).toMatchObject({
      name: 'echo',
      input_schema: expect.any(Object),
      cache_control: { type: 'ephemeral', ttl: '5m' },
    })
  })

  it('strips kernel system role messages (moves text to top-level system, joining with newline if both present)', () => {
    const out = kernelToAnthropic({
      model: 'claude-4-7-sonnet',
      systemPrompt: 'header',
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'inline-system' }] },
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      ],
      cacheTtl: null,
    })
    expect(out.system).toBe('header\ninline-system')
    expect(out.messages).toHaveLength(1)
    expect(out.messages[0]!.role).toBe('user')
  })

  it('maps assistant tool_use to anthropic content block', () => {
    const out = kernelToAnthropic({
      model: 'claude-4-7-sonnet',
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', toolCallId: 't1', name: 'echo', args: { x: 1 } }],
        },
      ],
      cacheTtl: null,
    })
    expect(out.messages[0]).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 't1', name: 'echo', input: { x: 1 } }],
    })
  })

  it('maps tool role with tool_result to user message with anthropic tool_result block', () => {
    const out = kernelToAnthropic({
      model: 'claude-4-7-sonnet',
      messages: [
        {
          role: 'tool',
          toolCallId: 't1',
          content: [{ type: 'tool_result', toolCallId: 't1', result: { ok: true } }],
        },
      ],
      cacheTtl: null,
    })
    expect(out.messages[0]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 't1',
          content: JSON.stringify({ ok: true }),
        },
      ],
    })
  })

  it('marks tool_result with is_error: true when content carries isError', () => {
    const out = kernelToAnthropic({
      model: 'claude-4-7-sonnet',
      messages: [
        {
          role: 'tool',
          toolCallId: 't1',
          content: [
            { type: 'tool_result', toolCallId: 't1', result: 'oops', isError: true },
          ],
        },
      ],
      cacheTtl: null,
    })
    expect(out.messages[0]!.content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 't1',
      is_error: true,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @seta/agent-core vitest run src/models/translate/anthropic.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `platform/agent/core/src/models/translate/anthropic.ts`:

```ts
import type Anthropic from '@anthropic-ai/sdk'
import { applyAnthropicCacheControl } from '../cache-control'
import type { AdapterRequest, KernelMessage, KernelMessageContent } from '../../types'

const DEFAULT_MAX_TOKENS = 4096

type AnthropicMessageParam = Anthropic.MessageCreateParams['messages'][number]
type AnthropicSystem = Anthropic.MessageCreateParams['system']
type AnthropicTool = NonNullable<Anthropic.MessageCreateParams['tools']>[number]

export interface AnthropicRequest {
  model: string
  max_tokens: number
  system?: AnthropicSystem
  tools?: AnthropicTool[]
  messages: AnthropicMessageParam[]
}

function partitionSystem(messages: KernelMessage[]): {
  inlineSystem: string[]
  rest: KernelMessage[]
} {
  const inlineSystem: string[] = []
  const rest: KernelMessage[] = []
  for (const m of messages) {
    if (m.role === 'system') {
      for (const c of m.content) {
        if (c.type === 'text') inlineSystem.push(c.text)
      }
    } else {
      rest.push(m)
    }
  }
  return { inlineSystem, rest }
}

function mapKernelContentToAnthropic(role: 'user' | 'assistant' | 'tool', c: KernelMessageContent) {
  switch (c.type) {
    case 'text':
      return { type: 'text' as const, text: c.text }
    case 'tool_use':
      return {
        type: 'tool_use' as const,
        id: c.toolCallId,
        name: c.name,
        input: (c.args ?? {}) as Record<string, unknown>,
      }
    case 'tool_result': {
      const content =
        typeof c.result === 'string' ? c.result : JSON.stringify(c.result ?? null)
      return {
        type: 'tool_result' as const,
        tool_use_id: c.toolCallId,
        content,
        ...(c.isError === true ? { is_error: true as const } : {}),
      }
    }
  }
}

function mapKernelMessage(m: KernelMessage): AnthropicMessageParam {
  if (m.role === 'tool') {
    return {
      role: 'user',
      content: m.content.map((c) => mapKernelContentToAnthropic('tool', c)) as never,
    }
  }
  if (m.role === 'user' || m.role === 'assistant') {
    return {
      role: m.role,
      content: m.content.map((c) => mapKernelContentToAnthropic(m.role as never, c)) as never,
    }
  }
  throw new Error(`unexpected role: ${m.role as string}`)
}

export function kernelToAnthropic(req: AdapterRequest): AnthropicRequest {
  const { inlineSystem, rest } = partitionSystem(req.messages)
  const systemParts: string[] = []
  if (req.systemPrompt !== undefined && req.systemPrompt.length > 0) {
    systemParts.push(req.systemPrompt)
  }
  systemParts.push(...inlineSystem)
  const system: AnthropicRequest['system'] | undefined =
    systemParts.length > 0 ? systemParts.join('\n') : undefined

  const tools: AnthropicTool[] | undefined =
    req.tools !== undefined && req.tools.length > 0
      ? req.tools.map((t) => ({
          name: t.name,
          description: t.description ?? '',
          input_schema: t.inputSchema as never,
        }))
      : undefined

  const base: AnthropicRequest = {
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(system !== undefined ? { system } : {}),
    ...(tools !== undefined ? { tools } : {}),
    messages: rest.map(mapKernelMessage),
  }

  return applyAnthropicCacheControl(base, req.cacheTtl ?? null)
}
```

- [ ] **Step 4: Confirm `JsonSchemaTool` type shape matches the test's `inputSchema` use**

Read `platform/agent/core/src/types/tool.ts`. Ensure `JsonSchemaTool` has `name: string; description?: string; inputSchema: unknown`. If field names differ (e.g., `parameters` instead of `inputSchema`), update the test and the implementation to match the existing K1 type — do not change K1 type names.

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @seta/agent-core vitest run src/models/translate/anthropic.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add platform/agent/core/src/models/translate/anthropic.ts platform/agent/core/src/models/translate/anthropic.test.ts
git commit -m "feat(agent-core): translate/anthropic kernel→anthropic request mapper"
```

---

## Task 5: `translate/anthropic.ts` — events→chunks + final-message

**Files:**
- Modify: `platform/agent/core/src/models/translate/anthropic.ts`
- Modify: `platform/agent/core/src/models/translate/anthropic.test.ts`

- [ ] **Step 1: Add failing tests for event mapping**

Append to `platform/agent/core/src/models/translate/anthropic.test.ts`:

```ts
import {
  type AnthropicStreamState,
  anthropicEventToKernelChunks,
  anthropicFinalToKernelMessage,
  newAnthropicStreamState,
} from './anthropic'
import type Anthropic from '@anthropic-ai/sdk'

describe('anthropicEventToKernelChunks', () => {
  function step(events: Anthropic.MessageStreamEvent[]) {
    const state: AnthropicStreamState = newAnthropicStreamState()
    const chunks = events.flatMap((e) => anthropicEventToKernelChunks(e, state))
    return { state, chunks }
  }

  it('emits text chunks from content_block_delta text_delta', () => {
    const { chunks } = step([
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      } as never,
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'hello' },
      } as never,
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: ' world' },
      } as never,
      { type: 'content_block_stop', index: 0 } as never,
    ])
    expect(chunks).toEqual([
      { type: 'text', delta: 'hello' },
      { type: 'text', delta: ' world' },
    ])
  })

  it('accumulates tool_use input_json_delta and emits tool_call on content_block_stop', () => {
    const { chunks } = step([
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 't1', name: 'echo', input: {} },
      } as never,
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"x":' },
      } as never,
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '1}' },
      } as never,
      { type: 'content_block_stop', index: 0 } as never,
    ])
    expect(chunks).toEqual([
      { type: 'tool_args', toolCallId: 't1', argsDelta: '{"x":' },
      { type: 'tool_args', toolCallId: 't1', argsDelta: '1}' },
      { type: 'tool_call', toolCallId: 't1', name: 'echo', args: { x: 1 } },
    ])
  })

  it('emits finish on message_stop with mapped stop_reason and usage', () => {
    const { chunks } = step([
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-4-7-sonnet',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      } as never,
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 0 },
      } as never,
      { type: 'message_stop' } as never,
    ])
    expect(chunks).toEqual([
      {
        type: 'finish',
        reason: 'stop',
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadInputTokens: 2,
          cacheCreationInputTokens: 0,
        },
      },
    ])
  })

  it('maps stop_reason=tool_use to finish.reason="tool_calls"', () => {
    const { chunks } = step([
      {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use', stop_sequence: null },
        usage: { input_tokens: 1, output_tokens: 1 },
      } as never,
      { type: 'message_stop' } as never,
    ])
    expect(chunks[0]).toMatchObject({ type: 'finish', reason: 'tool_calls' })
  })

  it('maps stop_reason=max_tokens to finish.reason="length"', () => {
    const { chunks } = step([
      {
        type: 'message_delta',
        delta: { stop_reason: 'max_tokens', stop_sequence: null },
        usage: { input_tokens: 1, output_tokens: 1 },
      } as never,
      { type: 'message_stop' } as never,
    ])
    expect(chunks[0]).toMatchObject({ type: 'finish', reason: 'length' })
  })
})

describe('anthropicFinalToKernelMessage', () => {
  it('translates a final assistant message with text + tool_use blocks', () => {
    const msg = anthropicFinalToKernelMessage({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-4-7-sonnet',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', id: 't1', name: 'echo', input: { x: 1 } },
      ],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    } as never)
    expect(msg).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', toolCallId: 't1', name: 'echo', args: { x: 1 } },
      ],
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @seta/agent-core vitest run src/models/translate/anthropic.test.ts
```

Expected: FAIL — `anthropicEventToKernelChunks`, `anthropicFinalToKernelMessage`, `newAnthropicStreamState` not exported.

- [ ] **Step 3: Extend the implementation**

Append to `platform/agent/core/src/models/translate/anthropic.ts`:

```ts
import type { KernelChunk, KernelMessage } from '../../types'

export interface AnthropicStreamState {
  toolByIndex: Map<number, { id: string; name: string; args: string }>
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error' | null
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens?: number
    cacheCreationInputTokens?: number
  } | null
}

export function newAnthropicStreamState(): AnthropicStreamState {
  return { toolByIndex: new Map(), finishReason: null, usage: null }
}

function mapStopReason(r: string | null | undefined): 'stop' | 'tool_calls' | 'length' | 'error' {
  switch (r) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop'
    case 'tool_use':
      return 'tool_calls'
    case 'max_tokens':
      return 'length'
    default:
      return 'error'
  }
}

export function anthropicEventToKernelChunks(
  event: Anthropic.MessageStreamEvent,
  state: AnthropicStreamState,
): KernelChunk[] {
  switch (event.type) {
    case 'message_start':
      state.usage = {
        inputTokens: event.message.usage?.input_tokens ?? 0,
        outputTokens: event.message.usage?.output_tokens ?? 0,
      }
      return []

    case 'content_block_start': {
      const block = event.content_block as { type: string; id?: string; name?: string }
      if (block.type === 'tool_use') {
        state.toolByIndex.set(event.index, {
          id: block.id ?? '',
          name: block.name ?? '',
          args: '',
        })
      }
      return []
    }

    case 'content_block_delta': {
      const d = event.delta as { type: string; text?: string; partial_json?: string }
      if (d.type === 'text_delta' && typeof d.text === 'string') {
        return [{ type: 'text', delta: d.text }]
      }
      if (d.type === 'input_json_delta' && typeof d.partial_json === 'string') {
        const tool = state.toolByIndex.get(event.index)
        if (!tool) return []
        tool.args += d.partial_json
        return [{ type: 'tool_args', toolCallId: tool.id, argsDelta: d.partial_json }]
      }
      return []
    }

    case 'content_block_stop': {
      const tool = state.toolByIndex.get(event.index)
      if (!tool) return []
      let parsed: unknown = {}
      if (tool.args.length > 0) {
        try {
          parsed = JSON.parse(tool.args)
        } catch {
          parsed = { __unparsedJson: tool.args }
        }
      }
      return [{ type: 'tool_call', toolCallId: tool.id, name: tool.name, args: parsed }]
    }

    case 'message_delta': {
      const d = event.delta as { stop_reason?: string | null }
      state.finishReason = mapStopReason(d.stop_reason)
      const u = (event as { usage?: Record<string, number> }).usage
      if (u !== undefined && state.usage !== null) {
        if (typeof u.input_tokens === 'number') state.usage.inputTokens = u.input_tokens
        if (typeof u.output_tokens === 'number') state.usage.outputTokens = u.output_tokens
        if (typeof u.cache_read_input_tokens === 'number') state.usage.cacheReadInputTokens = u.cache_read_input_tokens
        if (typeof u.cache_creation_input_tokens === 'number') state.usage.cacheCreationInputTokens = u.cache_creation_input_tokens
      }
      return []
    }

    case 'message_stop': {
      const reason = state.finishReason ?? 'stop'
      const usage = state.usage ?? undefined
      return [{ type: 'finish', reason, ...(usage !== undefined ? { usage } : {}) }]
    }

    default:
      return []
  }
}

export function anthropicFinalToKernelMessage(msg: Anthropic.Message): KernelMessage {
  return {
    role: 'assistant',
    content: msg.content.map((b): KernelMessage['content'][number] => {
      if (b.type === 'text') return { type: 'text', text: b.text }
      return {
        type: 'tool_use',
        toolCallId: b.id,
        name: b.name,
        args: b.input as unknown,
      }
    }),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @seta/agent-core vitest run src/models/translate/anthropic.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/models/translate/anthropic.ts platform/agent/core/src/models/translate/anthropic.test.ts
git commit -m "feat(agent-core): translate/anthropic stream events + final message"
```

---

## Task 6: `translate/openai.ts` — kernel→OpenAI request shape

**Files:**
- Create: `platform/agent/core/src/models/translate/openai.ts`
- Create: `platform/agent/core/src/models/translate/openai.test.ts`

- [ ] **Step 1: Write the failing unit test (request-side)**

Create `platform/agent/core/src/models/translate/openai.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { kernelToOpenAI } from './openai'
import type { AdapterRequest } from '../../types'

describe('kernelToOpenAI', () => {
  it('maps text-only user message with system prompt', () => {
    const out = kernelToOpenAI({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      systemPrompt: 'you are helpful',
      maxTokens: 256,
      cacheTtl: null,
    } as AdapterRequest)
    expect(out.model).toBe('gpt-4o')
    expect(out.stream).toBe(true)
    expect(out.stream_options).toEqual({ include_usage: true })
    expect(out.max_completion_tokens).toBe(256)
    expect((out as { max_tokens?: number }).max_tokens).toBeUndefined()
    expect(out.messages).toEqual([
      { role: 'system', content: 'you are helpful' },
      { role: 'user', content: 'hi' },
    ])
  })

  it('omits max_completion_tokens when not provided', () => {
    const out = kernelToOpenAI({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      cacheTtl: null,
    })
    expect(out.max_completion_tokens).toBeUndefined()
  })

  it('ignores cacheTtl', () => {
    const out = kernelToOpenAI({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      cacheTtl: '5m',
    })
    expect(JSON.stringify(out)).not.toMatch(/cache_control/)
  })

  it('wraps tools as { type: "function", function: { name, description, parameters } }', () => {
    const out = kernelToOpenAI({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [
        {
          name: 'echo',
          description: 'echo',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      cacheTtl: null,
    })
    expect(out.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'echo',
          description: 'echo',
          parameters: { type: 'object', properties: {} },
        },
      },
    ])
  })

  it('maps assistant tool_use to assistant with tool_calls', () => {
    const out = kernelToOpenAI({
      model: 'gpt-4o',
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', toolCallId: 't1', name: 'echo', args: { x: 1 } }],
        },
      ],
      cacheTtl: null,
    })
    expect(out.messages[0]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 't1',
          type: 'function',
          function: { name: 'echo', arguments: JSON.stringify({ x: 1 }) },
        },
      ],
    })
  })

  it('maps tool role to a role:tool message with tool_call_id and stringified content', () => {
    const out = kernelToOpenAI({
      model: 'gpt-4o',
      messages: [
        {
          role: 'tool',
          toolCallId: 't1',
          content: [{ type: 'tool_result', toolCallId: 't1', result: { ok: true } }],
        },
      ],
      cacheTtl: null,
    })
    expect(out.messages[0]).toEqual({
      role: 'tool',
      tool_call_id: 't1',
      content: JSON.stringify({ ok: true }),
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @seta/agent-core vitest run src/models/translate/openai.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `platform/agent/core/src/models/translate/openai.ts`:

```ts
import type OpenAI from 'openai'
import type { AdapterRequest, KernelMessage } from '../../types'

type ChatMsg = OpenAI.ChatCompletionMessageParam
type Streaming = OpenAI.ChatCompletionCreateParamsStreaming

function textContent(m: KernelMessage): string {
  return m.content
    .filter((c) => c.type === 'text')
    .map((c) => (c as { text: string }).text)
    .join('')
}

function mapKernelMessage(m: KernelMessage): ChatMsg | null {
  if (m.role === 'system') return { role: 'system', content: textContent(m) }
  if (m.role === 'user') return { role: 'user', content: textContent(m) }
  if (m.role === 'tool') {
    const results = m.content.filter((c) => c.type === 'tool_result') as Array<{
      toolCallId: string
      result: unknown
    }>
    if (results.length === 0) return null
    const r = results[0]!
    return {
      role: 'tool',
      tool_call_id: r.toolCallId,
      content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result ?? null),
    }
  }
  // assistant
  const toolUses = m.content.filter((c) => c.type === 'tool_use') as Array<{
    toolCallId: string
    name: string
    args: unknown
  }>
  const text = textContent(m)
  if (toolUses.length > 0) {
    return {
      role: 'assistant',
      content: text.length > 0 ? text : null,
      tool_calls: toolUses.map((tu) => ({
        id: tu.toolCallId,
        type: 'function' as const,
        function: { name: tu.name, arguments: JSON.stringify(tu.args ?? {}) },
      })),
    }
  }
  return { role: 'assistant', content: text }
}

export function kernelToOpenAI(req: AdapterRequest): Streaming {
  const messages: ChatMsg[] = []
  if (req.systemPrompt !== undefined && req.systemPrompt.length > 0) {
    messages.push({ role: 'system', content: req.systemPrompt })
  }
  for (const m of req.messages) {
    const mapped = mapKernelMessage(m)
    if (mapped !== null) messages.push(mapped)
  }

  const tools: Streaming['tools'] =
    req.tools !== undefined && req.tools.length > 0
      ? req.tools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description ?? '',
            parameters: t.inputSchema as Record<string, unknown>,
          },
        }))
      : undefined

  return {
    model: req.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(req.maxTokens !== undefined ? { max_completion_tokens: req.maxTokens } : {}),
    ...(tools !== undefined ? { tools } : {}),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @seta/agent-core vitest run src/models/translate/openai.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/models/translate/openai.ts platform/agent/core/src/models/translate/openai.test.ts
git commit -m "feat(agent-core): translate/openai kernel→openai request mapper"
```

---

## Task 7: `translate/openai.ts` — chunks→KernelChunk + final-message

**Files:**
- Modify: `platform/agent/core/src/models/translate/openai.ts`
- Modify: `platform/agent/core/src/models/translate/openai.test.ts`

- [ ] **Step 1: Add failing tests for chunk mapping**

Append to `platform/agent/core/src/models/translate/openai.test.ts`:

```ts
import {
  newOpenAIStreamState,
  openaiEventToKernelChunks,
  openaiFinalToKernelMessage,
  type OpenAIStreamState,
} from './openai'

function step(events: Array<Parameters<typeof openaiEventToKernelChunks>[0]>) {
  const state: OpenAIStreamState = newOpenAIStreamState()
  const chunks = events.flatMap((e) => openaiEventToKernelChunks(e, state))
  return { chunks, state }
}

describe('openaiEventToKernelChunks', () => {
  it('emits text chunks from delta.content', () => {
    const { chunks } = step([
      {
        id: 'c1',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'gpt-4o',
        choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }],
      } as never,
      {
        id: 'c2',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'gpt-4o',
        choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
      } as never,
    ])
    expect(chunks).toEqual([
      { type: 'text', delta: 'hello' },
      { type: 'text', delta: ' world' },
    ])
  })

  it('accumulates tool_call arguments and emits tool_call on finish_reason=tool_calls', () => {
    const { chunks } = step([
      {
        id: 'c1',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                { index: 0, id: 't1', type: 'function', function: { name: 'echo', arguments: '' } },
              ],
            },
            finish_reason: null,
          },
        ],
      } as never,
      {
        id: 'c2',
        choices: [
          {
            index: 0,
            delta: { tool_calls: [{ index: 0, function: { arguments: '{"x":' } }] },
            finish_reason: null,
          },
        ],
      } as never,
      {
        id: 'c3',
        choices: [
          {
            index: 0,
            delta: { tool_calls: [{ index: 0, function: { arguments: '1}' } }] },
            finish_reason: null,
          },
        ],
      } as never,
      {
        id: 'c4',
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      } as never,
    ])
    expect(chunks).toEqual([
      { type: 'tool_args', toolCallId: 't1', argsDelta: '' },
      { type: 'tool_args', toolCallId: 't1', argsDelta: '{"x":' },
      { type: 'tool_args', toolCallId: 't1', argsDelta: '1}' },
      { type: 'tool_call', toolCallId: 't1', name: 'echo', args: { x: 1 } },
      { type: 'finish', reason: 'tool_calls' },
    ])
  })

  it('emits finish.reason=stop and usage on usage-bearing chunk', () => {
    const { chunks } = step([
      {
        id: 'c1',
        choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }],
      } as never,
      {
        id: 'c2',
        choices: [],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          prompt_tokens_details: { cached_tokens: 2 },
        },
      } as never,
    ])
    expect(chunks).toEqual([
      { type: 'text', delta: 'ok' },
      {
        type: 'finish',
        reason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 2 },
      },
    ])
  })

  it("maps finish_reason='length' and 'content_filter'", () => {
    const a = step([
      { id: 'x', choices: [{ index: 0, delta: {}, finish_reason: 'length' }] } as never,
    ])
    expect(a.chunks[0]).toMatchObject({ type: 'finish', reason: 'length' })

    const b = step([
      { id: 'y', choices: [{ index: 0, delta: {}, finish_reason: 'content_filter' }] } as never,
    ])
    expect(b.chunks[0]).toMatchObject({ type: 'finish', reason: 'error' })
  })
})

describe('openaiFinalToKernelMessage', () => {
  it('translates an assistant message with text + tool_calls', () => {
    const msg = openaiFinalToKernelMessage({
      id: 'c',
      object: 'chat.completion',
      created: 1,
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'hi',
            tool_calls: [
              {
                id: 't1',
                type: 'function',
                function: { name: 'echo', arguments: JSON.stringify({ x: 1 }) },
              },
            ],
            refusal: null,
          },
          finish_reason: 'tool_calls',
          logprobs: null,
        },
      ],
    } as never)
    expect(msg).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'hi' },
        { type: 'tool_use', toolCallId: 't1', name: 'echo', args: { x: 1 } },
      ],
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @seta/agent-core vitest run src/models/translate/openai.test.ts
```

Expected: FAIL — missing exports.

- [ ] **Step 3: Extend the implementation**

Append to `platform/agent/core/src/models/translate/openai.ts`:

```ts
import type { KernelChunk, KernelMessage, TokenUsage } from '../../types'

export interface OpenAIStreamState {
  toolByIndex: Map<number, { id: string; name: string; args: string; emittedCall: boolean }>
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error' | null
  usage: TokenUsage | null
}

export function newOpenAIStreamState(): OpenAIStreamState {
  return { toolByIndex: new Map(), finishReason: null, usage: null }
}

function mapFinishReason(r: string | null | undefined): 'stop' | 'tool_calls' | 'length' | 'error' {
  switch (r) {
    case 'stop':
      return 'stop'
    case 'tool_calls':
      return 'tool_calls'
    case 'length':
      return 'length'
    default:
      return 'error'
  }
}

export function openaiEventToKernelChunks(
  chunk: OpenAI.ChatCompletionChunk,
  state: OpenAIStreamState,
): KernelChunk[] {
  const out: KernelChunk[] = []

  for (const choice of chunk.choices ?? []) {
    const delta = choice.delta ?? {}

    if (typeof delta.content === 'string' && delta.content.length > 0) {
      out.push({ type: 'text', delta: delta.content })
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0
        let entry = state.toolByIndex.get(idx)
        if (entry === undefined) {
          entry = { id: tc.id ?? '', name: tc.function?.name ?? '', args: '', emittedCall: false }
          state.toolByIndex.set(idx, entry)
        } else {
          if (tc.id !== undefined) entry.id = tc.id
          if (tc.function?.name !== undefined) entry.name = tc.function.name
        }
        const argsDelta = tc.function?.arguments ?? ''
        entry.args += argsDelta
        out.push({ type: 'tool_args', toolCallId: entry.id, argsDelta })
      }
    }

    if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
      state.finishReason = mapFinishReason(choice.finish_reason)
      if (state.finishReason === 'tool_calls') {
        for (const entry of state.toolByIndex.values()) {
          if (entry.emittedCall) continue
          entry.emittedCall = true
          let parsed: unknown = {}
          if (entry.args.length > 0) {
            try {
              parsed = JSON.parse(entry.args)
            } catch {
              parsed = { __unparsedJson: entry.args }
            }
          }
          out.push({
            type: 'tool_call',
            toolCallId: entry.id,
            name: entry.name,
            args: parsed,
          })
        }
      }
    }
  }

  if (chunk.usage !== null && chunk.usage !== undefined) {
    const u = chunk.usage
    const usage: TokenUsage = {
      inputTokens: u.prompt_tokens ?? 0,
      outputTokens: u.completion_tokens ?? 0,
    }
    const cached = (u as { prompt_tokens_details?: { cached_tokens?: number } })
      .prompt_tokens_details?.cached_tokens
    if (typeof cached === 'number') usage.cacheReadInputTokens = cached
    state.usage = usage
  }

  // Emit finish exactly when we have a finish_reason and either the chunk has no choices
  // (usage-only tail chunk after finish) or this same chunk carried the finish.
  const finishCarriedHere =
    chunk.choices?.some((c) => c.finish_reason !== null && c.finish_reason !== undefined) ?? false
  const usageOnlyTail = (chunk.choices?.length ?? 0) === 0

  if (state.finishReason !== null && (finishCarriedHere || usageOnlyTail)) {
    if (!state.usage && finishCarriedHere) {
      out.push({ type: 'finish', reason: state.finishReason })
      state.finishReason = null
    } else if (state.usage) {
      out.push({ type: 'finish', reason: state.finishReason, usage: state.usage })
      state.finishReason = null
      state.usage = null
    }
  }

  return out
}

export function openaiFinalToKernelMessage(msg: OpenAI.ChatCompletion): KernelMessage {
  const choice = msg.choices[0]!
  const m = choice.message
  const content: KernelMessage['content'] = []
  if (typeof m.content === 'string' && m.content.length > 0) {
    content.push({ type: 'text', text: m.content })
  }
  if (Array.isArray(m.tool_calls)) {
    for (const tc of m.tool_calls) {
      if (tc.type !== 'function') continue
      let args: unknown = {}
      try {
        args = tc.function.arguments.length > 0 ? JSON.parse(tc.function.arguments) : {}
      } catch {
        args = { __unparsedJson: tc.function.arguments }
      }
      content.push({ type: 'tool_use', toolCallId: tc.id, name: tc.function.name, args })
    }
  }
  return { role: 'assistant', content }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @seta/agent-core vitest run src/models/translate/openai.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/models/translate/openai.ts platform/agent/core/src/models/translate/openai.test.ts
git commit -m "feat(agent-core): translate/openai stream chunks + final message"
```

---

## Task 8: New error codes

**Files:**
- Modify: `platform/agent/core/src/errors/index.ts` (or wherever error codes are defined; verify K1 file)

- [ ] **Step 1: Inspect existing error class shape**

Read `platform/agent/core/src/errors/index.ts`. Confirm `LlmError extends KernelError` accepts `{ code, category, message, details?, cause? }`. K2 does not add new classes — it adds **stable code strings**. If K1 exports a `LlmErrorCode` type union, extend it; otherwise this task is no-op and codes are inlined at throw sites.

- [ ] **Step 2: If a code union exists, extend it; otherwise document the codes as string constants for the adapters**

If `src/errors/index.ts` defines a `LlmErrorCode = '...' | '...'`, extend with:

```
| 'LLM_TRANSIENT_EXHAUSTED'
| 'LLM_RATE_LIMITED'
| 'LLM_SERVER_ERROR'
| 'LLM_AUTH_FAILED'
| 'LLM_BAD_REQUEST'
| 'LLM_CONTENT_POLICY'
| 'LLM_STREAM_INTERRUPTED'
| 'LLM_INVALID_TOOL_ARGS'
| 'LLM_UNKNOWN'
```

Otherwise skip — adapters will pass these as plain strings in `code:`.

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @seta/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit (only if a file changed)**

```bash
git add platform/agent/core/src/errors/index.ts
git commit -m "feat(agent-core): reserve LLM_* error codes for K2 adapters"
```

If no file changed, skip the commit.

---

## Task 9: `anthropic.ts` adapter (factory + error mapper)

**Files:**
- Create: `platform/agent/core/src/models/anthropic.ts`
- Create: `platform/agent/core/src/models/anthropic.test.ts` (light unit test on construction + error mapper)

- [ ] **Step 1: Write the failing unit test (construction + provider field + error mapping)**

Create `platform/agent/core/src/models/anthropic.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createAnthropicAdapter } from './anthropic'
import { LlmError } from '../errors'

describe('createAnthropicAdapter', () => {
  it('returns a ModelAdapter with provider="anthropic"', () => {
    const adapter = createAnthropicAdapter({ apiKey: 'test' })
    expect(adapter.provider).toBe('anthropic')
    expect(typeof adapter.stream).toBe('function')
  })
})

describe('mapAnthropicError (via createAnthropicAdapter integration)', () => {
  // Full HTTP error mapping is covered in tests/integration/anthropic.test.ts via MSW.
  // This file just guards the public factory shape.
  it('exposes LlmError as the thrown class shape', () => {
    expect(LlmError).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @seta/agent-core vitest run src/models/anthropic.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `platform/agent/core/src/models/anthropic.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { LlmError } from '../errors'
import type { AdapterRequest, KernelChunk, KernelMessage, ModelStream, RunCtx } from '../types'
import type { ModelAdapter } from './adapter'
import { startLlmSpan } from './span'
import { estimateMessagesInputTokens } from './tokens'
import {
  anthropicEventToKernelChunks,
  anthropicFinalToKernelMessage,
  kernelToAnthropic,
  newAnthropicStreamState,
} from './translate/anthropic'

export interface AnthropicAdapterConfig {
  apiKey: string
  baseURL?: string
  defaultHeaders?: Record<string, string>
  maxRetries?: number
  timeoutMs?: number
}

function mapAnthropicError(err: unknown, model: string): LlmError {
  if (err instanceof Anthropic.APIError) {
    const status = err.status
    const requestId = err.headers?.['request-id'] ?? err.headers?.['x-request-id']
    const details: Record<string, unknown> = { provider: 'anthropic', model, status }
    if (typeof requestId === 'string') details['requestId'] = requestId

    if (status === 401 || status === 403) {
      return new LlmError({ code: 'LLM_AUTH_FAILED', category: 'SYSTEM', message: err.message, details, cause: err })
    }
    if (status === 400) {
      return new LlmError({ code: 'LLM_BAD_REQUEST', category: 'SYSTEM', message: err.message, details, cause: err })
    }
    if (status === 429) {
      return new LlmError({ code: 'LLM_RATE_LIMITED', category: 'THIRD_PARTY', message: err.message, details, cause: err })
    }
    if (typeof status === 'number' && status >= 500) {
      return new LlmError({ code: 'LLM_SERVER_ERROR', category: 'THIRD_PARTY', message: err.message, details, cause: err })
    }
    if (status === 422) {
      return new LlmError({ code: 'LLM_CONTENT_POLICY', category: 'USER', message: err.message, details, cause: err })
    }
    return new LlmError({ code: 'LLM_TRANSIENT_EXHAUSTED', category: 'THIRD_PARTY', message: err.message, details, cause: err })
  }
  if (err instanceof Error && err.name === 'AbortError') {
    throw err
  }
  return new LlmError({
    code: 'LLM_UNKNOWN',
    category: 'SYSTEM',
    message: err instanceof Error ? err.message : String(err),
    details: { provider: 'anthropic', model },
    cause: err,
  })
}

export function createAnthropicAdapter(cfg: AnthropicAdapterConfig): ModelAdapter {
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    ...(cfg.baseURL !== undefined ? { baseURL: cfg.baseURL } : {}),
    ...(cfg.defaultHeaders !== undefined ? { defaultHeaders: cfg.defaultHeaders } : {}),
    maxRetries: cfg.maxRetries ?? 2,
    timeout: cfg.timeoutMs ?? 60_000,
  })

  return {
    provider: 'anthropic',
    async stream(req: AdapterRequest, ctx: RunCtx): Promise<ModelStream<KernelChunk>> {
      const span = startLlmSpan('anthropic', req.model, ctx.runId)
      span.record({
        estimatedInputTokens: estimateMessagesInputTokens(req.messages, req.systemPrompt, req.model),
      })

      const wire = kernelToAnthropic(req)
      let sdkStream: Anthropic.MessageStream
      try {
        sdkStream = client.messages.stream(
          { ...wire },
          { signal: ctx.signal },
        )
      } catch (err) {
        const mapped = mapAnthropicError(err, req.model)
        span.record({ errorCode: mapped.code })
        span.end('error', mapped)
        throw mapped
      }

      const state = newAnthropicStreamState()
      let finalUsageRecorded = false

      async function* iterate(): AsyncGenerator<KernelChunk> {
        try {
          for await (const event of sdkStream) {
            if (ctx.signal.aborted) return
            const chunks = anthropicEventToKernelChunks(event, state)
            for (const c of chunks) {
              if (c.type === 'finish') {
                finalUsageRecorded = true
                span.record({
                  finishReason: c.reason,
                  ...(c.usage !== undefined
                    ? {
                        inputTokens: c.usage.inputTokens,
                        outputTokens: c.usage.outputTokens,
                        ...(c.usage.cacheReadInputTokens !== undefined
                          ? { cacheReadInputTokens: c.usage.cacheReadInputTokens }
                          : {}),
                        ...(c.usage.cacheCreationInputTokens !== undefined
                          ? { cacheCreationInputTokens: c.usage.cacheCreationInputTokens }
                          : {}),
                      }
                    : {}),
                })
              }
              yield c
            }
          }
        } catch (err) {
          if (ctx.signal.aborted) return
          const mapped = mapAnthropicError(err, req.model)
          if (!finalUsageRecorded) span.record({ errorCode: mapped.code })
          span.end('error', mapped)
          throw mapped
        }
      }

      const iter = iterate()

      return {
        [Symbol.asyncIterator]() {
          return iter
        },
        abort() {
          try {
            sdkStream.controller.abort()
          } catch {
            /* swallow */
          }
          if (ctx.signal.aborted) span.end('aborted')
        },
        async finalMessage(): Promise<KernelMessage> {
          try {
            const msg = await sdkStream.finalMessage()
            if (!finalUsageRecorded) {
              span.record({ finishReason: 'stop' })
            }
            span.end('ok')
            return anthropicFinalToKernelMessage(msg)
          } catch (err) {
            if (ctx.signal.aborted) {
              span.end('aborted')
              throw err
            }
            const mapped = mapAnthropicError(err, req.model)
            span.record({ errorCode: mapped.code })
            span.end('error', mapped)
            throw mapped
          }
        },
      }
    },
  }
}
```

- [ ] **Step 4: Run unit tests to verify they pass**

```bash
pnpm --filter @seta/agent-core vitest run src/models/anthropic.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/models/anthropic.ts platform/agent/core/src/models/anthropic.test.ts
git commit -m "feat(agent-core): AnthropicAdapter factory + error mapper"
```

---

## Task 10: `openai.ts` adapter (factory + error mapper)

**Files:**
- Create: `platform/agent/core/src/models/openai.ts`
- Create: `platform/agent/core/src/models/openai.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `platform/agent/core/src/models/openai.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createOpenAIAdapter } from './openai'

describe('createOpenAIAdapter', () => {
  it('returns a ModelAdapter with provider="openai"', () => {
    const adapter = createOpenAIAdapter({ apiKey: 'test' })
    expect(adapter.provider).toBe('openai')
    expect(typeof adapter.stream).toBe('function')
  })

  it('accepts baseURL for LiteLLM / OpenAI-compatible proxies', () => {
    const adapter = createOpenAIAdapter({ apiKey: 'test', baseURL: 'https://proxy.example/v1' })
    expect(adapter.provider).toBe('openai')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @seta/agent-core vitest run src/models/openai.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Create `platform/agent/core/src/models/openai.ts`:

```ts
import OpenAI from 'openai'
import { LlmError } from '../errors'
import type { AdapterRequest, KernelChunk, KernelMessage, ModelStream, RunCtx } from '../types'
import type { ModelAdapter } from './adapter'
import { startLlmSpan } from './span'
import { estimateMessagesInputTokens } from './tokens'
import {
  kernelToOpenAI,
  newOpenAIStreamState,
  openaiEventToKernelChunks,
  openaiFinalToKernelMessage,
} from './translate/openai'

export interface OpenAIAdapterConfig {
  apiKey: string
  baseURL?: string
  defaultHeaders?: Record<string, string>
  organization?: string
  project?: string
  maxRetries?: number
  timeoutMs?: number
}

export function mapOpenAIError(err: unknown, model: string, providerLabel = 'openai'): LlmError {
  if (err instanceof OpenAI.APIError) {
    const status = err.status
    const requestId = err.headers?.['x-request-id']
    const details: Record<string, unknown> = { provider: providerLabel, model, status }
    if (typeof requestId === 'string') details['requestId'] = requestId

    if (status === 401 || status === 403) {
      return new LlmError({ code: 'LLM_AUTH_FAILED', category: 'SYSTEM', message: err.message, details, cause: err })
    }
    if (status === 400) {
      return new LlmError({ code: 'LLM_BAD_REQUEST', category: 'SYSTEM', message: err.message, details, cause: err })
    }
    if (status === 429) {
      return new LlmError({ code: 'LLM_RATE_LIMITED', category: 'THIRD_PARTY', message: err.message, details, cause: err })
    }
    if (typeof status === 'number' && status >= 500) {
      return new LlmError({ code: 'LLM_SERVER_ERROR', category: 'THIRD_PARTY', message: err.message, details, cause: err })
    }
    if (status === 422) {
      return new LlmError({ code: 'LLM_CONTENT_POLICY', category: 'USER', message: err.message, details, cause: err })
    }
    return new LlmError({ code: 'LLM_TRANSIENT_EXHAUSTED', category: 'THIRD_PARTY', message: err.message, details, cause: err })
  }
  if (err instanceof Error && err.name === 'AbortError') {
    throw err
  }
  return new LlmError({
    code: 'LLM_UNKNOWN',
    category: 'SYSTEM',
    message: err instanceof Error ? err.message : String(err),
    details: { provider: providerLabel, model },
    cause: err,
  })
}

export function createOpenAIAdapter(cfg: OpenAIAdapterConfig): ModelAdapter {
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    ...(cfg.baseURL !== undefined ? { baseURL: cfg.baseURL } : {}),
    ...(cfg.defaultHeaders !== undefined ? { defaultHeaders: cfg.defaultHeaders } : {}),
    ...(cfg.organization !== undefined ? { organization: cfg.organization } : {}),
    ...(cfg.project !== undefined ? { project: cfg.project } : {}),
    maxRetries: cfg.maxRetries ?? 2,
    timeout: cfg.timeoutMs ?? 60_000,
  })
  return makeOpenAICompatibleAdapter(client, 'openai')
}

export function makeOpenAICompatibleAdapter(
  client: OpenAI,
  providerLabel: 'openai' | 'azure-openai',
): ModelAdapter {
  return {
    provider: providerLabel,
    async stream(req: AdapterRequest, ctx: RunCtx): Promise<ModelStream<KernelChunk>> {
      const span = startLlmSpan(providerLabel, req.model, ctx.runId)
      span.record({
        estimatedInputTokens: estimateMessagesInputTokens(req.messages, req.systemPrompt, req.model),
      })

      const wire = kernelToOpenAI(req)
      let sdkStream: ReturnType<OpenAI['chat']['completions']['stream']>
      try {
        sdkStream = client.chat.completions.stream(wire, { signal: ctx.signal })
      } catch (err) {
        const mapped = mapOpenAIError(err, req.model, providerLabel)
        span.record({ errorCode: mapped.code })
        span.end('error', mapped)
        throw mapped
      }

      const state = newOpenAIStreamState()
      let finalUsageRecorded = false

      async function* iterate(): AsyncGenerator<KernelChunk> {
        try {
          for await (const chunk of sdkStream) {
            if (ctx.signal.aborted) return
            const chunks = openaiEventToKernelChunks(chunk, state)
            for (const c of chunks) {
              if (c.type === 'finish') {
                finalUsageRecorded = true
                span.record({
                  finishReason: c.reason,
                  ...(c.usage !== undefined
                    ? {
                        inputTokens: c.usage.inputTokens,
                        outputTokens: c.usage.outputTokens,
                        ...(c.usage.cacheReadInputTokens !== undefined
                          ? { cacheReadInputTokens: c.usage.cacheReadInputTokens }
                          : {}),
                      }
                    : {}),
                })
              }
              yield c
            }
          }
        } catch (err) {
          if (ctx.signal.aborted) return
          const mapped = mapOpenAIError(err, req.model, providerLabel)
          if (!finalUsageRecorded) span.record({ errorCode: mapped.code })
          span.end('error', mapped)
          throw mapped
        }
      }

      const iter = iterate()

      return {
        [Symbol.asyncIterator]() {
          return iter
        },
        abort() {
          try {
            sdkStream.controller.abort()
          } catch {
            /* swallow */
          }
          if (ctx.signal.aborted) span.end('aborted')
        },
        async finalMessage(): Promise<KernelMessage> {
          try {
            const final = await sdkStream.finalChatCompletion()
            if (!finalUsageRecorded) span.record({ finishReason: 'stop' })
            span.end('ok')
            return openaiFinalToKernelMessage(final)
          } catch (err) {
            if (ctx.signal.aborted) {
              span.end('aborted')
              throw err
            }
            const mapped = mapOpenAIError(err, req.model, providerLabel)
            span.record({ errorCode: mapped.code })
            span.end('error', mapped)
            throw mapped
          }
        },
      }
    },
  }
}
```

- [ ] **Step 4: Run unit tests**

```bash
pnpm --filter @seta/agent-core vitest run src/models/openai.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/models/openai.ts platform/agent/core/src/models/openai.test.ts
git commit -m "feat(agent-core): OpenAIAdapter factory + shared OpenAI-compatible adapter"
```

---

## Task 11: `azure-openai.ts` adapter

**Files:**
- Create: `platform/agent/core/src/models/azure-openai.ts`
- Create: `platform/agent/core/src/models/azure-openai.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `platform/agent/core/src/models/azure-openai.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createAzureOpenAIAdapter } from './azure-openai'

describe('createAzureOpenAIAdapter', () => {
  it('returns a ModelAdapter with provider="azure-openai"', () => {
    const adapter = createAzureOpenAIAdapter({
      apiKey: 'test',
      endpoint: 'https://my-resource.openai.azure.com',
      apiVersion: '2024-10-21',
    })
    expect(adapter.provider).toBe('azure-openai')
    expect(typeof adapter.stream).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @seta/agent-core vitest run src/models/azure-openai.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Create `platform/agent/core/src/models/azure-openai.ts`:

```ts
import { AzureOpenAI } from 'openai'
import type { ModelAdapter } from './adapter'
import { makeOpenAICompatibleAdapter } from './openai'

export interface AzureOpenAIAdapterConfig {
  apiKey: string
  endpoint: string
  apiVersion: string
  defaultHeaders?: Record<string, string>
  maxRetries?: number
  timeoutMs?: number
}

export function createAzureOpenAIAdapter(cfg: AzureOpenAIAdapterConfig): ModelAdapter {
  const client = new AzureOpenAI({
    apiKey: cfg.apiKey,
    endpoint: cfg.endpoint,
    apiVersion: cfg.apiVersion,
    ...(cfg.defaultHeaders !== undefined ? { defaultHeaders: cfg.defaultHeaders } : {}),
    maxRetries: cfg.maxRetries ?? 2,
    timeout: cfg.timeoutMs ?? 60_000,
  })
  return makeOpenAICompatibleAdapter(client, 'azure-openai')
}
```

- [ ] **Step 4: Run unit tests**

```bash
pnpm --filter @seta/agent-core vitest run src/models/azure-openai.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/models/azure-openai.ts platform/agent/core/src/models/azure-openai.test.ts
git commit -m "feat(agent-core): AzureOpenAIAdapter wrapping AzureOpenAI SDK subclass"
```

---

## Task 12: Re-export factories from `src/index.ts`

**Files:**
- Modify: `platform/agent/core/src/index.ts`

- [ ] **Step 1: Add factory exports**

Edit `platform/agent/core/src/index.ts` and append (group near other `models/*` exports):

```ts
export type { AnthropicAdapterConfig } from './models/anthropic'
export { createAnthropicAdapter } from './models/anthropic'
export type { OpenAIAdapterConfig } from './models/openai'
export { createOpenAIAdapter } from './models/openai'
export type { AzureOpenAIAdapterConfig } from './models/azure-openai'
export { createAzureOpenAIAdapter } from './models/azure-openai'
```

- [ ] **Step 2: Run typecheck + unit tests + build**

```bash
pnpm --filter @seta/agent-core typecheck
pnpm --filter @seta/agent-core test:unit
pnpm --filter @seta/agent-core build
```

Expected: all PASS; `dist/index.js` and `dist/index.d.ts` contain the new exports.

- [ ] **Step 3: Smoke import from a temp file (manual sanity)**

```bash
node --input-type=module -e "import('@seta/agent-core').then(m => console.log(Object.keys(m).filter(k => k.includes('Adapter'))))"
```

Expected: prints something like `[ 'createAnthropicAdapter', 'createOpenAIAdapter', 'createAzureOpenAIAdapter' ]` (plus types).

- [ ] **Step 4: Commit**

```bash
git add platform/agent/core/src/index.ts
git commit -m "feat(agent-core): export Anthropic/OpenAI/AzureOpenAI adapter factories"
```

---

## Task 13: Anthropic integration tests + 5 recordings

**Files:**
- Create: `platform/agent/core/tests/integration/anthropic.test.ts`
- Create: `platform/agent/core/__recordings__/anthropic-text-stream.json` (record mode)
- Create: `platform/agent/core/__recordings__/anthropic-tool-call-stream.json`
- Create: `platform/agent/core/__recordings__/anthropic-cache-control.json`
- Create: `platform/agent/core/__recordings__/anthropic-429-retry.json`
- Create: `platform/agent/core/__recordings__/anthropic-abort.json`

> **Important:** Recording integration tests requires a real `ANTHROPIC_API_KEY` in the local environment. CI runs in strict-replay mode against checked-in fixtures.

- [ ] **Step 1: Write the integration test file**

Create `platform/agent/core/tests/integration/anthropic.test.ts`:

```ts
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { tenantContext } from '@seta/tenant'
import {
  createAdapterRegistry,
  createAnthropicAdapter,
  createRunCtx,
  run,
} from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import type { AgentConfig, KernelChunk, RunInput } from '@seta/agent-core'

const RECORDINGS_DIR = path.resolve(__dirname, '../../__recordings__')

function buildRegistry() {
  const reg = createAdapterRegistry()
  reg.register(
    'anthropic',
    createAnthropicAdapter({ apiKey: process.env['ANTHROPIC_API_KEY'] ?? 'sk-test' }),
  )
  return reg
}

async function drain(stream: AsyncIterable<KernelChunk>): Promise<KernelChunk[]> {
  const chunks: KernelChunk[] = []
  for await (const c of stream) chunks.push(c)
  return chunks
}

const FROZEN_NOW = new Date('2026-05-12T00:00:00Z').getTime()
const FROZEN_ID = '00000000-0000-4000-8000-000000000000'
const ctxOverrides = {
  generateId: () => FROZEN_ID,
  now: () => FROZEN_NOW,
  currentDate: () => new Date(FROZEN_NOW),
}

describe('AnthropicAdapter integration (replay)', () => {
  let recording = setupLLMRecording({ name: 'unused', recordingsDir: RECORDINGS_DIR })

  beforeEach(() => {
    /* per-test setup replaces recording handle */
  })
  afterEach(() => {
    recording.stop()
  })

  it('text-only stream success', async () => {
    recording = setupLLMRecording({ name: 'anthropic-text-stream', recordingsDir: RECORDINGS_DIR })
    recording.start()

    const cfg: AgentConfig = {
      model: 'anthropic/claude-haiku-4-5',
      systemPrompt: 'reply with the word "ok"',
      maxTokens: 32,
    }
    const input: RunInput = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }],
    }
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(run(cfg, input, { adapters, ...ctxOverrides })),
    )

    const text = chunks
      .filter((c) => c.type === 'text')
      .map((c) => (c as { delta: string }).delta)
      .join('')
    expect(text.length).toBeGreaterThan(0)
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'stop')).toBe(true)
  })

  it('tool-call stream success', async () => {
    recording = setupLLMRecording({ name: 'anthropic-tool-call-stream', recordingsDir: RECORDINGS_DIR })
    recording.start()

    const cfg: AgentConfig = {
      model: 'anthropic/claude-haiku-4-5',
      maxTokens: 256,
      tools: [
        {
          id: 'echo',
          description: 'echo the given text back',
          // K1's prepareTools calls z.toJSONSchema on this — must be a Zod schema, not a raw JSON Schema.
          inputSchema: z.object({ text: z.string() }) as never,
          outputSchema: z.object({ echoed: z.string() }) as never,
          async execute() {
            return { ok: true, value: { echoed: 'irrelevant' } }
          },
        },
      ],
    }
    const input: RunInput = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'use the echo tool with text="hi"' }] }],
    }

    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(run(cfg, input, { adapters, ...ctxOverrides })),
    )

    const toolCall = chunks.find((c) => c.type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect((toolCall as { name: string }).name).toBe('echo')
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'tool_calls')).toBe(true)
  })

  it('cache_control request shape and cache_read_input_tokens flow-through', async () => {
    recording = setupLLMRecording({ name: 'anthropic-cache-control', recordingsDir: RECORDINGS_DIR })
    recording.start()

    const cfg: AgentConfig = {
      model: 'anthropic/claude-haiku-4-5',
      // > ~2048 chars triggers the kernel's auto cacheTtl default in run.ts; here we set explicitly
      systemPrompt: 'A'.repeat(4096),
      cacheTtl: '5m',
      maxTokens: 32,
    }
    const input: RunInput = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'ok' }] }],
    }

    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(run(cfg, input, { adapters, ...ctxOverrides })),
    )

    const finish = chunks.find((c) => c.type === 'finish') as
      | { type: 'finish'; usage?: { cacheReadInputTokens?: number; cacheCreationInputTokens?: number } }
      | undefined
    expect(finish).toBeDefined()
    // First run: cacheCreationInputTokens > 0; replays beyond TTL on re-record will see cacheReadInputTokens.
    expect(
      (finish?.usage?.cacheCreationInputTokens ?? 0) + (finish?.usage?.cacheReadInputTokens ?? 0),
    ).toBeGreaterThan(0)
  })

  it('429 → SDK auto-retry → success', async () => {
    recording = setupLLMRecording({ name: 'anthropic-429-retry', recordingsDir: RECORDINGS_DIR })
    recording.start()

    // Recording must be hand-edited after first record to insert a 429 response
    // before the 200 response for the same hash (or use a transformRequest to
    // simulate one). See "Crafting the 429 fixture" in §recording-notes below.

    const cfg: AgentConfig = {
      model: 'anthropic/claude-haiku-4-5',
      systemPrompt: 'reply with the word "ok"',
      maxTokens: 32,
    }
    const input: RunInput = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }],
    }
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(run(cfg, input, { adapters, ...ctxOverrides })),
    )
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'stop')).toBe(true)
  })

  it('abort mid-stream', async () => {
    recording = setupLLMRecording({ name: 'anthropic-abort', recordingsDir: RECORDINGS_DIR })
    recording.start()

    const cfg: AgentConfig = {
      model: 'anthropic/claude-haiku-4-5',
      systemPrompt: 'count slowly 1 to 50',
      maxTokens: 512,
    }
    const input: RunInput = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }],
    }
    const controller = new AbortController()
    const adapters = buildRegistry()

    const chunks: KernelChunk[] = []
    await tenantContext.run({ tenantId: 'tenant-test' }, async () => {
      const iter = run(cfg, input, { adapters, signal: controller.signal, ...ctxOverrides })
      for await (const c of iter) {
        chunks.push(c)
        if (c.type === 'text') controller.abort()
      }
    })

    expect(chunks.some((c) => c.type === 'abort')).toBe(true)
    expect(chunks.some((c) => c.type === 'error')).toBe(false)
  })
})
```

- [ ] **Step 2: Record the fixtures (requires `ANTHROPIC_API_KEY`)**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
RECORD=1 pnpm --filter @seta/agent-core test:integration -t "AnthropicAdapter integration"
```

Expected: tests pass and 5 JSON files appear in `platform/agent/core/__recordings__/anthropic-*.json`.

- [ ] **Step 3: Craft the 429 fixture**

Open `__recordings__/anthropic-429-retry.json`. Duplicate the single recorded entry; in the first copy set:

```json
{
  "hash": "<existing hash>",
  "request": { ... unchanged ... },
  "response": { "status": 429, "headers": { "retry-after": "1" }, "body": "{\"type\":\"error\",\"error\":{\"type\":\"rate_limit_error\",\"message\":\"rate limited\"}}" }
}
```

Keep the second copy as the original 200 response. The recording replay system matches by hash and serves in order. Confirm the SDK's built-in `maxRetries: 2` consumes the 429 and continues to the 200.

If the testkit doesn't support ordered multi-response per hash, simulate retry with a one-shot `transformRequest` that ages the cache key — defer to whichever pattern the testkit's `setup.test.ts` already uses; do not invent a new mechanism. As a fallback, downgrade this test to assert behavior in record-mode only and skip in strict replay (`it.skipIf(process.env.RECORD === undefined)`).

- [ ] **Step 4: Replay tests in strict mode**

```bash
unset ANTHROPIC_API_KEY
pnpm --filter @seta/agent-core test:integration -t "AnthropicAdapter integration"
```

Expected: all five tests pass against checked-in fixtures.

- [ ] **Step 5: Commit fixtures + test**

```bash
git add platform/agent/core/tests/integration/anthropic.test.ts platform/agent/core/__recordings__/anthropic-*.json
git commit -m "test(agent-core): AnthropicAdapter integration tests + recordings"
```

---

## Task 14: OpenAI integration tests + 4 recordings

**Files:**
- Create: `platform/agent/core/tests/integration/openai.test.ts`
- Create: `platform/agent/core/__recordings__/openai-text-stream.json`
- Create: `platform/agent/core/__recordings__/openai-tool-call-stream.json`
- Create: `platform/agent/core/__recordings__/openai-429-retry.json`
- Create: `platform/agent/core/__recordings__/openai-abort.json`

- [ ] **Step 1: Write the integration test (mirror Anthropic file)**

Create `platform/agent/core/tests/integration/openai.test.ts`. Use the same structure as `anthropic.test.ts` but:
- Replace `createAnthropicAdapter` with `createOpenAIAdapter`.
- Provider key `'openai'`; model `'openai/gpt-4o-mini'` (cheapest streaming-capable model for fixture record cost).
- Omit the cache_control test entirely.
- The 429 test uses the same hand-edited-fixture approach; expect OpenAI's SDK to consume the 429 via its built-in retry.
- Use `OPENAI_API_KEY` for record mode.

The four tests: text-only stream success; tool-call stream success; 429 → retry → success; abort mid-stream.

```ts
// platform/agent/core/tests/integration/openai.test.ts
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { tenantContext } from '@seta/tenant'
import {
  createAdapterRegistry,
  createOpenAIAdapter,
  run,
} from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import type { AgentConfig, KernelChunk, RunInput } from '@seta/agent-core'

const RECORDINGS_DIR = path.resolve(__dirname, '../../__recordings__')

function buildRegistry() {
  const reg = createAdapterRegistry()
  reg.register('openai', createOpenAIAdapter({ apiKey: process.env['OPENAI_API_KEY'] ?? 'sk-test' }))
  return reg
}

async function drain(stream: AsyncIterable<KernelChunk>): Promise<KernelChunk[]> {
  const chunks: KernelChunk[] = []
  for await (const c of stream) chunks.push(c)
  return chunks
}

const FROZEN_NOW = new Date('2026-05-12T00:00:00Z').getTime()
const ctxOverrides = {
  generateId: () => '00000000-0000-4000-8000-000000000000',
  now: () => FROZEN_NOW,
  currentDate: () => new Date(FROZEN_NOW),
}

describe('OpenAIAdapter integration (replay)', () => {
  let recording = setupLLMRecording({ name: 'unused', recordingsDir: RECORDINGS_DIR })
  beforeEach(() => {})
  afterEach(() => recording.stop())

  it('text-only stream success', async () => {
    recording = setupLLMRecording({ name: 'openai-text-stream', recordingsDir: RECORDINGS_DIR })
    recording.start()
    const cfg: AgentConfig = {
      model: 'openai/gpt-4o-mini',
      systemPrompt: 'reply with the word "ok"',
      maxTokens: 32,
    }
    const input: RunInput = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }],
    }
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(run(cfg, input, { adapters, ...ctxOverrides })),
    )
    expect(chunks.some((c) => c.type === 'text')).toBe(true)
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'stop')).toBe(true)
  })

  it('tool-call stream success', async () => {
    recording = setupLLMRecording({ name: 'openai-tool-call-stream', recordingsDir: RECORDINGS_DIR })
    recording.start()
    const cfg: AgentConfig = {
      model: 'openai/gpt-4o-mini',
      maxTokens: 256,
      tools: [
        {
          id: 'echo',
          description: 'echo the given text back',
          // K1's prepareTools calls z.toJSONSchema on this — must be a Zod schema, not a raw JSON Schema.
          inputSchema: z.object({ text: z.string() }) as never,
          outputSchema: z.object({ echoed: z.string() }) as never,
          async execute() {
            return { ok: true, value: { echoed: 'irrelevant' } }
          },
        },
      ],
    }
    const input: RunInput = {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'call echo with text="hi"' }] }],
    }
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(run(cfg, input, { adapters, ...ctxOverrides })),
    )
    expect(chunks.find((c) => c.type === 'tool_call')).toBeDefined()
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'tool_calls')).toBe(true)
  })

  it('429 → SDK auto-retry → success', async () => {
    recording = setupLLMRecording({ name: 'openai-429-retry', recordingsDir: RECORDINGS_DIR })
    recording.start()
    const cfg: AgentConfig = {
      model: 'openai/gpt-4o-mini',
      systemPrompt: 'reply with the word "ok"',
      maxTokens: 32,
    }
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(
        run(
          cfg,
          { messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }] },
          { adapters, ...ctxOverrides },
        ),
      ),
    )
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'stop')).toBe(true)
  })

  it('abort mid-stream', async () => {
    recording = setupLLMRecording({ name: 'openai-abort', recordingsDir: RECORDINGS_DIR })
    recording.start()
    const cfg: AgentConfig = {
      model: 'openai/gpt-4o-mini',
      systemPrompt: 'count slowly 1 to 50',
      maxTokens: 512,
    }
    const controller = new AbortController()
    const adapters = buildRegistry()
    const chunks: KernelChunk[] = []
    await tenantContext.run({ tenantId: 'tenant-test' }, async () => {
      const iter = run(
        cfg,
        { messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }] },
        { adapters, signal: controller.signal, ...ctxOverrides },
      )
      for await (const c of iter) {
        chunks.push(c)
        if (c.type === 'text') controller.abort()
      }
    })
    expect(chunks.some((c) => c.type === 'abort')).toBe(true)
    expect(chunks.some((c) => c.type === 'error')).toBe(false)
  })
})
```

- [ ] **Step 2: Record fixtures**

```bash
export OPENAI_API_KEY=sk-...
RECORD=1 pnpm --filter @seta/agent-core test:integration -t "OpenAIAdapter integration"
```

- [ ] **Step 3: Hand-edit the 429 fixture** (same approach as Task 13 Step 3).

- [ ] **Step 4: Replay**

```bash
unset OPENAI_API_KEY
pnpm --filter @seta/agent-core test:integration -t "OpenAIAdapter integration"
```

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/tests/integration/openai.test.ts platform/agent/core/__recordings__/openai-*.json
git commit -m "test(agent-core): OpenAIAdapter integration tests + recordings"
```

---

## Task 15: Azure OpenAI integration tests + 4 recordings

**Files:**
- Create: `platform/agent/core/tests/integration/azure-openai.test.ts`
- Create: `platform/agent/core/__recordings__/azure-openai-text-stream.json`
- Create: `platform/agent/core/__recordings__/azure-openai-tool-call-stream.json`
- Create: `platform/agent/core/__recordings__/azure-openai-429-retry.json`
- Create: `platform/agent/core/__recordings__/azure-openai-abort.json`

- [ ] **Step 1: Write the integration test**

Create `platform/agent/core/tests/integration/azure-openai.test.ts`. Mirror Task 14 structure but use `createAzureOpenAIAdapter`. Env vars: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_DEPLOYMENT` (test-time; replay does not need them). Model id format: `azure-openai/<deployment-name>`.

```ts
// platform/agent/core/tests/integration/azure-openai.test.ts
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { tenantContext } from '@seta/tenant'
import {
  createAdapterRegistry,
  createAzureOpenAIAdapter,
  run,
} from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import type { AgentConfig, KernelChunk, RunInput } from '@seta/agent-core'

const RECORDINGS_DIR = path.resolve(__dirname, '../../__recordings__')

function buildRegistry() {
  const reg = createAdapterRegistry()
  reg.register(
    'azure-openai',
    createAzureOpenAIAdapter({
      apiKey: process.env['AZURE_OPENAI_API_KEY'] ?? 'sk-test',
      endpoint: process.env['AZURE_OPENAI_ENDPOINT'] ?? 'https://test.openai.azure.com',
      apiVersion: process.env['AZURE_OPENAI_API_VERSION'] ?? '2024-10-21',
    }),
  )
  return reg
}

const DEPLOYMENT = process.env['AZURE_OPENAI_DEPLOYMENT'] ?? 'gpt-4o-mini'
const MODEL_ID = `azure-openai/${DEPLOYMENT}` as const

async function drain(stream: AsyncIterable<KernelChunk>): Promise<KernelChunk[]> {
  const chunks: KernelChunk[] = []
  for await (const c of stream) chunks.push(c)
  return chunks
}

const FROZEN_NOW = new Date('2026-05-12T00:00:00Z').getTime()
const ctxOverrides = {
  generateId: () => '00000000-0000-4000-8000-000000000000',
  now: () => FROZEN_NOW,
  currentDate: () => new Date(FROZEN_NOW),
}

describe('AzureOpenAIAdapter integration (replay)', () => {
  let recording = setupLLMRecording({ name: 'unused', recordingsDir: RECORDINGS_DIR })
  beforeEach(() => {})
  afterEach(() => recording.stop())

  it('text-only stream success', async () => {
    recording = setupLLMRecording({ name: 'azure-openai-text-stream', recordingsDir: RECORDINGS_DIR })
    recording.start()
    const cfg: AgentConfig = { model: MODEL_ID, systemPrompt: 'reply ok', maxTokens: 32 }
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(
        run(
          cfg,
          { messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }] },
          { adapters, ...ctxOverrides },
        ),
      ),
    )
    expect(chunks.some((c) => c.type === 'text')).toBe(true)
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'stop')).toBe(true)
  })

  it('tool-call stream success', async () => {
    recording = setupLLMRecording({ name: 'azure-openai-tool-call-stream', recordingsDir: RECORDINGS_DIR })
    recording.start()
    const cfg: AgentConfig = {
      model: MODEL_ID,
      maxTokens: 256,
      tools: [
        {
          id: 'echo',
          description: 'echo the given text back',
          inputSchema: z.object({ text: z.string() }) as never,
          outputSchema: z.object({ echoed: z.string() }) as never,
          async execute() {
            return { ok: true, value: { echoed: 'irrelevant' } }
          },
        },
      ],
    }
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(
        run(
          cfg,
          { messages: [{ role: 'user', content: [{ type: 'text', text: 'call echo with text="hi"' }] }] },
          { adapters, ...ctxOverrides },
        ),
      ),
    )
    expect(chunks.find((c) => c.type === 'tool_call')).toBeDefined()
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'tool_calls')).toBe(true)
  })

  it('429 → SDK auto-retry → success', async () => {
    recording = setupLLMRecording({ name: 'azure-openai-429-retry', recordingsDir: RECORDINGS_DIR })
    recording.start()
    const cfg: AgentConfig = { model: MODEL_ID, systemPrompt: 'reply ok', maxTokens: 32 }
    const adapters = buildRegistry()
    const chunks = await tenantContext.run({ tenantId: 'tenant-test' }, () =>
      drain(
        run(
          cfg,
          { messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }] },
          { adapters, ...ctxOverrides },
        ),
      ),
    )
    expect(chunks.some((c) => c.type === 'finish' && c.reason === 'stop')).toBe(true)
  })

  it('abort mid-stream', async () => {
    recording = setupLLMRecording({ name: 'azure-openai-abort', recordingsDir: RECORDINGS_DIR })
    recording.start()
    const cfg: AgentConfig = { model: MODEL_ID, systemPrompt: 'count slowly 1 to 50', maxTokens: 512 }
    const controller = new AbortController()
    const adapters = buildRegistry()
    const chunks: KernelChunk[] = []
    await tenantContext.run({ tenantId: 'tenant-test' }, async () => {
      const iter = run(
        cfg,
        { messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }] },
        { adapters, signal: controller.signal, ...ctxOverrides },
      )
      for await (const c of iter) {
        chunks.push(c)
        if (c.type === 'text') controller.abort()
      }
    })
    expect(chunks.some((c) => c.type === 'abort')).toBe(true)
    expect(chunks.some((c) => c.type === 'error')).toBe(false)
  })
})
```

Note: the Azure file needs `import { z } from 'zod'` at the top with the other imports.

- [ ] **Step 2: Record fixtures (requires Azure OpenAI credentials)**

```bash
export AZURE_OPENAI_API_KEY=... AZURE_OPENAI_ENDPOINT=https://... AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
RECORD=1 pnpm --filter @seta/agent-core test:integration -t "AzureOpenAIAdapter integration"
```

If Azure credentials are not available, skip the record step and use the `transformRequest` testkit option to rewrite recorded OpenAI fixtures' URLs to match Azure's URL pattern — last-resort only; document as a follow-up if used.

- [ ] **Step 3: Hand-edit 429 fixture** (Task 13 Step 3 approach).

- [ ] **Step 4: Replay**

```bash
pnpm --filter @seta/agent-core test:integration -t "AzureOpenAIAdapter integration"
```

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/tests/integration/azure-openai.test.ts platform/agent/core/__recordings__/azure-openai-*.json
git commit -m "test(agent-core): AzureOpenAIAdapter integration tests + recordings"
```

---

## Task 16: Tenant-ALS integration test + recording

**Files:**
- Create: `platform/agent/core/tests/integration/tenant-als.test.ts`
- Create: `platform/agent/core/__recordings__/tenant-als.json`

- [ ] **Step 1: Write the test**

Create `platform/agent/core/tests/integration/tenant-als.test.ts`:

```ts
import path from 'node:path'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { tenantContext } from '@seta/tenant'
import {
  createAdapterRegistry,
  createAnthropicAdapter,
  run,
} from '@seta/agent-core'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import type { AgentConfig, KernelChunk, RunInput } from '@seta/agent-core'

const RECORDINGS_DIR = path.resolve(__dirname, '../../__recordings__')
const exporter = new InMemorySpanExporter()
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })

beforeAll(() => provider.register())
afterAll(async () => provider.shutdown())
beforeEach(() => exporter.reset())

const FROZEN_NOW = new Date('2026-05-12T00:00:00Z').getTime()
const ctxOverrides = {
  generateId: () => '00000000-0000-4000-8000-000000000000',
  now: () => FROZEN_NOW,
  currentDate: () => new Date(FROZEN_NOW),
}

describe('tenant ALS across adapter await boundary', () => {
  it('records tenant.id on the llm span even after `await sdk.stream(...)` crosses microtask boundary', async () => {
    const rec = setupLLMRecording({ name: 'tenant-als', recordingsDir: RECORDINGS_DIR })
    rec.start()
    try {
      const adapters = createAdapterRegistry()
      adapters.register(
        'anthropic',
        createAnthropicAdapter({ apiKey: process.env['ANTHROPIC_API_KEY'] ?? 'sk-test' }),
      )

      const cfg: AgentConfig = {
        model: 'anthropic/claude-haiku-4-5',
        systemPrompt: 'reply with the word "ok"',
        maxTokens: 16,
      }
      const input: RunInput = {
        messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }],
      }

      await tenantContext.run({ tenantId: 'tenant-als-test' }, async () => {
        for await (const _c of run(cfg, input, { adapters, ...ctxOverrides })) {
          // drain
        }
      })

      const spans = exporter.getFinishedSpans()
      const llmSpan = spans.find((s) => s.name.startsWith('llm.'))
      expect(llmSpan).toBeDefined()
      expect(llmSpan!.attributes['tenant.id']).toBe('tenant-als-test')
    } finally {
      rec.stop()
    }
  })
})
```

- [ ] **Step 2: Record fixture**

```bash
export ANTHROPIC_API_KEY=...
RECORD=1 pnpm --filter @seta/agent-core test:integration -t "tenant ALS"
```

- [ ] **Step 3: Replay**

```bash
unset ANTHROPIC_API_KEY
pnpm --filter @seta/agent-core test:integration -t "tenant ALS"
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add platform/agent/core/tests/integration/tenant-als.test.ts platform/agent/core/__recordings__/tenant-als.json
git commit -m "test(agent-core): tenant ALS preservation across adapter await"
```

---

## Task 17: `apps/api/src/env.ts` — add LLM env vars

**Files:**
- Modify: `apps/api/src/env.ts`

- [ ] **Step 1: Edit env schema**

Modify `apps/api/src/env.ts` to add five new fields. Final shape:

```ts
import 'dotenv/config'
import { z } from 'zod'

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().url(),
  PUBLIC_BASE_URL: z.string().url(),
  ENTRA_CLIENT_ID: z.string().min(1),
  ENTRA_CLIENT_SECRET: z.string().min(1),
  KMS_PROVIDER: z.enum(['aws', 'env']).default('env'),
  DEV_DEK_BASE64: z.string().optional(),
  AWS_REGION: z.string().optional(),
  KMS_KEY_ARN: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
  AZURE_OPENAI_API_KEY: z.string().min(1).optional(),
  AZURE_OPENAI_API_VERSION: z.string().default('2024-10-21'),
})

export const env = Env.parse(process.env)
```

- [ ] **Step 2: Update local `.env.example` if it exists**

```bash
ls apps/api/.env.example 2>/dev/null && echo present
```

If present, append:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
# Optional Azure
# AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
# AZURE_OPENAI_API_KEY=...
# AZURE_OPENAI_API_VERSION=2024-10-21
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @seta/api typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/env.ts apps/api/.env.example 2>/dev/null
git commit -m "feat(api): env vars for Anthropic, OpenAI, Azure OpenAI"
```

---

## Task 18: `apps/api/src/agent.ts` — adapter registry composition

**Files:**
- Create: `apps/api/src/agent.ts`

- [ ] **Step 1: Write the composition file**

Create `apps/api/src/agent.ts`:

```ts
import {
  createAdapterRegistry,
  createAnthropicAdapter,
  createAzureOpenAIAdapter,
  createOpenAIAdapter,
} from '@seta/agent-core'
import { logger } from '@seta/observability'
import { env } from './env'

export const agentRegistry = createAdapterRegistry()

agentRegistry.register('anthropic', createAnthropicAdapter({ apiKey: env.ANTHROPIC_API_KEY }))
logger.info({ provider: 'anthropic' }, 'adapter registered')

agentRegistry.register('openai', createOpenAIAdapter({ apiKey: env.OPENAI_API_KEY }))
logger.info({ provider: 'openai' }, 'adapter registered')

if (env.AZURE_OPENAI_ENDPOINT !== undefined && env.AZURE_OPENAI_API_KEY !== undefined) {
  agentRegistry.register(
    'azure-openai',
    createAzureOpenAIAdapter({
      apiKey: env.AZURE_OPENAI_API_KEY,
      endpoint: env.AZURE_OPENAI_ENDPOINT,
      apiVersion: env.AZURE_OPENAI_API_VERSION,
    }),
  )
  logger.info({ provider: 'azure-openai' }, 'adapter registered')
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @seta/api typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/agent.ts
git commit -m "feat(api): build agent adapter registry at composition root"
```

---

## Task 19: `apps/api/src/main.ts` — wire registry on boot

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Add the side-effect import**

Edit `apps/api/src/main.ts`. After the existing `registry.register(directoryConnector)` line (around line 41), add:

```ts
import './agent'
```

(Place the `import './agent'` at the top with the other imports, ESM order.)

The final import block should keep alphabetic ordering inside groups but the `./agent` import can go after `./env` since it depends on `env`.

- [ ] **Step 2: Boot smoke test (manual)**

```bash
ANTHROPIC_API_KEY=sk-test OPENAI_API_KEY=sk-test DATABASE_URL=postgres://localhost/x PUBLIC_BASE_URL=http://localhost:8080 ENTRA_CLIENT_ID=x ENTRA_CLIENT_SECRET=y pnpm --filter @seta/api dev 2>&1 | head -40
```

Expected: log lines include `adapter registered: anthropic` and `adapter registered: openai`. Kill with Ctrl-C.

- [ ] **Step 3: Build**

```bash
pnpm --filter @seta/api build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): import ./agent on boot to register LLM adapters"
```

---

## Task 20: SCOPE.md update + open-question closure

**Files:**
- Modify: `platform/agent/core/SCOPE.md`

- [ ] **Step 1: Update "Current state" section**

Edit `platform/agent/core/SCOPE.md`. Replace the "Current state (Epic 1)" stub paragraph with:

```markdown
## Current state (K2 complete)

The package ships:
- K1 kernel surface (types, errors, registry, run loop, SSE, NullMemoryProvider, FakeAdapter).
- K1.5 MSW-backed testkit (`setupLLMRecording`, `hashRequest`, `serializeRequestContent`).
- K2 concrete provider adapters: `createAnthropicAdapter`, `createOpenAIAdapter`,
  `createAzureOpenAIAdapter`. Pure helpers (`cache-control`, `tokens`, `translate/*`)
  compose into each adapter. `startLlmSpan` emits one OTel span per call with
  baseline attrs (`llm.provider`, `llm.model`, `run.id`, `tenant.id`) and end-state
  attrs (`finishReason`, `inputTokens`, `outputTokens`, `cacheReadInputTokens`,
  `errorCode`, `aborted`).
- First wire-up in `apps/api/src/agent.ts` registers Anthropic + OpenAI (and Azure
  when configured) into the adapter registry at boot.

Outstanding before tool execution end-to-end: K4 (tool-call iteration outer loop),
MEM stream (real `@seta/agent-memory` provider binding).
```

- [ ] **Step 2: Update "Open questions"**

In the "Open questions" section, remove (or mark as resolved) the three K2-decided items:

- `cacheTtl` parity with OpenAI → **Resolved: OpenAI ignores `cacheTtl` as a documented no-op (relies on OpenAI's automatic structured-output caching).**
- Fixture scoping per-test vs per-scenario → **Resolved: per-test, named identically to the test.**
- SSE re-entry of tenant context per chunk producer → **Resolved: ALS survives `await sdk.stream(...)` per the `tenant-als` integration test. Adapters do not span workers; ALS propagation is sufficient.**

- [ ] **Step 3: Update "Patterns to follow"** — append to the "Anthropic prompt caching by default" bullet:

```
The OpenAIAdapter ignores `cacheTtl` entirely (OpenAI's automatic
structured-output caching covers this need). The AzureOpenAIAdapter inherits
the same no-op.
```

- [ ] **Step 4: Commit**

```bash
git add platform/agent/core/SCOPE.md
git commit -m "docs(agent-core): mark K2 complete in SCOPE.md and close open questions"
```

---

## Task 21: Final verification + PR readiness

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck across workspace**

```bash
pnpm typecheck
```

Expected: PASS in every package.

- [ ] **Step 2: Full lint**

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Unit tests for agent-core**

```bash
pnpm --filter @seta/agent-core test:unit
```

Expected: 100% line coverage on the new files (`anthropic.ts`, `openai.ts`, `azure-openai.ts`, `cache-control.ts`, `span.ts`, `tokens.ts`, `translate/anthropic.ts`, `translate/openai.ts`). If a defensive branch is uncoverable, mark inline with the coverage tool's ignore comment.

- [ ] **Step 4: Integration tests in strict replay**

```bash
unset ANTHROPIC_API_KEY OPENAI_API_KEY AZURE_OPENAI_API_KEY
pnpm --filter @seta/agent-core test:integration
```

Expected: all 14 integration tests pass against checked-in fixtures.

- [ ] **Step 5: Build agent-core**

```bash
pnpm --filter @seta/agent-core build
```

Expected: `dist/index.js` and `dist/index.d.ts` exist and contain the three factory exports.

- [ ] **Step 6: Build apps/api**

```bash
pnpm --filter @seta/api build
```

Expected: PASS.

- [ ] **Step 7: Verify no changes to forbidden files**

```bash
git diff main --stat -- platform/agent/core/src/types/ platform/agent/core/src/run/ platform/agent/core/src/sse/ platform/agent/core/src/errors/ platform/agent/core/src/memory/ platform/agent/core/src/testkit/
```

Expected: empty output (no K1 source files modified) **except** possibly `src/errors/index.ts` from Task 8 (only if a `LlmErrorCode` union exists), and `src/index.ts` which is expected to change.

- [ ] **Step 8: Add a changeset**

```bash
pnpm changeset
```

Choose:
- `@seta/agent-core` → **minor** (new factories + new error codes).
- `@seta/api` → **patch** (registry composition added; package is `"private": true` so the changeset only documents the change locally).

Summary: `K2 ships concrete Anthropic/OpenAI/AzureOpenAI adapters + first apps/api wire-up.`

- [ ] **Step 9: Commit changeset + open PR**

```bash
git add .changeset/*.md
git commit -m "chore: changeset for agent-core K2"
git push -u origin <branch>
gh pr create --title "feat(agent-core): K2 concrete LLM adapters + apps/api wire-up" --body "$(cat <<'EOF'
## Summary
- Ship `createAnthropicAdapter` / `createOpenAIAdapter` / `createAzureOpenAIAdapter` satisfying K1's `ModelAdapter` contract.
- Pure helpers: `cache-control` (ephemeral prompt-cache annotator), `tokens` (`js-tiktoken` estimator), `translate/{anthropic,openai}` (wire-format mappers), `span` (OTel LLM span helper).
- First wire-up at `apps/api/src/agent.ts` registers Anthropic + OpenAI (Azure when env present) at boot.
- 14 MSW recordings (5 anthropic, 4 openai, 4 azure, 1 tenant-als) checked in for deterministic CI.
- Closes K1 open questions: cacheTtl parity (OpenAI no-op), fixture scoping (per-test), tenant ALS preservation (verified).

## Test plan
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean
- [ ] `pnpm --filter @seta/agent-core test:unit` clean
- [ ] `pnpm --filter @seta/agent-core test:integration` clean in strict replay
- [ ] `pnpm --filter @seta/api build` succeeds
- [ ] Boot smoke: `pnpm --filter @seta/api dev` logs `adapter registered: anthropic` and `adapter registered: openai`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 10: Verify PR checks pass**

```bash
gh pr checks
```

Expected: all green. Resolve any failures by fixing inline and pushing.

---

## Recording notes (for re-records)

- All recordings are checked into git. PR review diffs the JSON.
- `RECORD=1` records missing recordings; `RECORD=force` re-records all matched-hash entries.
- Frozen `now`/`generateId`/`currentDate` in tests keeps request bodies byte-stable so re-records produce minimal diffs.
- The cache-control recording: re-record only when `cache_control` annotation logic changes. Anthropic's prompt cache TTL means a second re-record within 5 minutes will see `cache_read_input_tokens > 0` instead of `cache_creation_input_tokens > 0` — the test asserts the **sum** is positive to accept either.
- The 429-retry recordings are hand-edited after the first record to insert a 429 response before the success. Follow the testkit's recording-file shape exactly; missing-hash misses fail in strict replay.

---

**End of plan.**

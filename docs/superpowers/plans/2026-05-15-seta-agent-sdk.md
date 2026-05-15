# @seta/agent-sdk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `@seta/agent-sdk` (`platform/agent/sdk/`) — the browser-facing TypeScript client for `apps/api`. Ships the streaming primitive (`parseSseStream`), kernel chunk types, and an `AgentClient` shell with `getMe` + `streamRun`. Plan #1 of 3 for the Studio workstream.

**Architecture:**
- Pure ESM, zero React, zero Node-only deps — must bundle into a browser SPA.
- One `AgentClient` class wraps `fetch` with `credentials: 'include'`, abortable per-request, JSON-or-stream return.
- `parseSseStream(stream, onChunk)` consumes a `ReadableStream<Uint8Array>` from a `Response.body` and yields validated `KernelChunk`s. Uses standard SSE framing (`data: <json>\n\n`) — matching our `streamKernelSSE` server emitter.
- `KernelChunk` is a Zod-validated discriminated union; runtime parse rejects unknown shapes so the SDK and server can't drift silently.
- Concrete endpoint methods (`listRuns`, `listConnectors`, `listCorpus`, `listAudit`, etc.) are NOT in this plan — they land incrementally in Plan #3 (`apps/studio`) alongside the matching `apps/api` routes. This plan ships the transport + types + streaming primitive only.

**Tech Stack:** TypeScript · Zod 4.4.3 · Vitest 4.1.6 · MSW 2.14.6. Build via tsup (existing convention).

**Spec source:** `docs/superpowers/specs/2026-05-15-studio-design.md` §3.3, §4.3, §4.4.

**Server contract:** `streamKernelSSE` in `@seta/agent-core` (`platform/agent/core`) is the authoritative emitter. The SDK's `KernelChunk` schema MUST be validated against a recorded SSE fixture from a real `streamKernelSSE` run before merging.

---

## File Structure

```
platform/agent/sdk/
  package.json                       # pnpm-managed
  tsconfig.json                      # extends platform/tsconfig/node.json
  tsup.config.ts                     # esm + dts, single entry
  vitest.config.ts                   # name override only
  src/
    index.ts                         # public barrel
    types.ts                         # AgentClientOptions, RunStatus, exported chunk types
    schemas/
      chunk.ts                       # Zod schemas for KernelChunk discriminated union
      chunk.test.ts
    sse/
      parseSseStream.ts              # frame parser + chunk validator
      parseSseStream.test.ts
      __fixtures__/
        run-success.sse              # recorded SSE bytes from streamKernelSSE
        run-error.sse
        partial-frame.sse
    transport/
      AgentClientError.ts            # discriminated error class (network / http / parse / abort)
      AgentClientError.test.ts
      request.ts                     # internal fetch wrapper
      request.test.ts
    client/
      AgentClient.ts                 # public class
      AgentClient.test.ts
```

---

## Phases at a Glance

| Phase | Scope | Tasks |
|---|---|---|
| 0 | Scaffold package + deps | 1–3 |
| 1 | Types + chunk schemas | 4–6 |
| 2 | SSE parser | 7–10 |
| 3 | Transport (request + errors) | 11–13 |
| 4 | AgentClient (getMe + streamRun) | 14–16 |
| 5 | Barrel + final verification | 17–18 |

---

## Phase 0 — Scaffold

### Task 1: Confirm package exists, populate metadata

**Files:**
- Modify: `platform/agent/sdk/package.json` (via `pnpm pkg`)

- [ ] **Step 1: Verify package is on disk**

```bash
ls platform/agent/sdk
```
Expected: existing scaffold (package.json, tsconfig.json, src/index.ts). If absent, run `pnpm new:package --kind platform/agent --name sdk --desc "Browser SDK for Seta apps/api"` and rerun this step.

- [ ] **Step 2: Set package metadata**

```bash
pnpm --filter @seta/agent-sdk pkg set \
  description="Browser SDK for Seta apps/api — fetch + SSE streaming + kernel chunk types" \
  keywords[0]="seta" keywords[1]="sdk" keywords[2]="sse" \
  private=true type=module
```

- [ ] **Step 3: Commit**

```bash
git add platform/agent/sdk/package.json pnpm-lock.yaml
git commit -m "chore(agent-sdk): seed package metadata"
```

---

### Task 2: Add runtime + dev dependencies via pnpm

**Files:**
- Modify: `platform/agent/sdk/package.json` (via `pnpm --filter add`)
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Pin Zod to the workspace version**

```bash
pnpm --filter @seta/agent-sdk add zod@4.4.3
```

- [ ] **Step 2: Add dev deps**

```bash
pnpm --filter @seta/agent-sdk add -D \
  @seta/tsconfig@workspace:* \
  msw@2.14.6 \
  vitest@4.1.6 \
  tsup
```

- [ ] **Step 3: Verify build/test scripts exist**

```bash
pnpm --filter @seta/agent-sdk pkg get scripts
```
Expected output contains: `build`, `dev`, `test:unit`, `typecheck`. If any missing, set with `pnpm pkg set scripts.<name>=<value>` matching `platform/auth/package.json`.

- [ ] **Step 4: Commit**

```bash
git add platform/agent/sdk/package.json pnpm-lock.yaml
git commit -m "chore(agent-sdk): add zod, msw, vitest, tsup dev deps"
```

---

### Task 3: Configure tsup, tsconfig, vitest

**Files:**
- Create: `platform/agent/sdk/tsup.config.ts`
- Modify: `platform/agent/sdk/tsconfig.json`
- Modify: `platform/agent/sdk/vitest.config.ts`

- [ ] **Step 1: Write tsup config**

```ts
// platform/agent/sdk/tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  treeshake: true,
})
```

- [ ] **Step 2: Ensure tsconfig matches platform convention**

```json
{
  "extends": "../../tsconfig/node.json",
  "compilerOptions": {
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "types": []
  },
  "include": ["src/**/*"]
}
```

The `DOM` lib addition is required because the SDK uses `fetch`, `ReadableStream`, `TextDecoder`. `types: []` removes Node typings so the SDK can't accidentally import Node-only APIs.

- [ ] **Step 3: Vitest name-only override**

```ts
// platform/agent/sdk/vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { name: '@seta/agent-sdk' } })
```

- [ ] **Step 4: Build smoke test**

```bash
pnpm --filter @seta/agent-sdk build
```
Expected: succeeds, emits `dist/index.js` + `dist/index.d.ts`.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/sdk/tsup.config.ts platform/agent/sdk/tsconfig.json platform/agent/sdk/vitest.config.ts
git commit -m "chore(agent-sdk): configure tsup, browser-safe tsconfig, vitest"
```

---

## Phase 1 — Types + Chunk Schemas

### Task 4: Define RunStatus + shared option types

**Files:**
- Create: `platform/agent/sdk/src/types.ts`

- [ ] **Step 1: Write types**

```ts
// platform/agent/sdk/src/types.ts
export type RunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'aborted'

export interface AgentClientOptions {
  /** Absolute origin of apps/api, e.g. https://api.os.seta-international.com */
  baseUrl: string
  /** Cookie credential mode — defaults to 'include' for cross-origin session cookies */
  credentials?: RequestCredentials
  /** Extra headers merged into every request */
  headers?: Record<string, string>
  /** Override fetch (testing) */
  fetch?: typeof fetch
}

export interface RequestOptions {
  signal?: AbortSignal
  headers?: Record<string, string>
  /** JSON body — stringified automatically */
  body?: unknown
}
```

No `apiPrefix` — `apps/api` owns its own mount prefixes via Hono; the SDK only knows full origin + path.

- [ ] **Step 2: Commit**

```bash
git add platform/agent/sdk/src/types.ts
git commit -m "feat(agent-sdk): define RunStatus and AgentClientOptions"
```

---

### Task 5: Zod schemas for KernelChunk discriminated union

**Files:**
- Create: `platform/agent/sdk/src/schemas/chunk.ts`
- Create: `platform/agent/sdk/src/schemas/chunk.test.ts`

- [ ] **Step 1: Write failing tests first**

```ts
// platform/agent/sdk/src/schemas/chunk.test.ts
import { describe, it, expect } from 'vitest'
import { KernelChunk, parseChunk } from './chunk'

describe('KernelChunk schema', () => {
  it('accepts a text_delta chunk', () => {
    const raw = { type: 'text_delta', id: 'c1', runId: 'r1', ts: 0, delta: 'hi' }
    expect(parseChunk(raw)).toEqual(raw)
  })

  it('accepts a tool_call chunk', () => {
    const raw = {
      type: 'tool_call',
      id: 'c2', runId: 'r1', ts: 0,
      toolName: 'graph.search', input: { q: 'x' },
    }
    expect(parseChunk(raw)).toEqual(raw)
  })

  it('accepts a tool_result chunk', () => {
    const raw = {
      type: 'tool_result',
      id: 'c3', runId: 'r1', ts: 0,
      toolCallId: 'c2', output: { ok: true }, durationMs: 12,
    }
    expect(parseChunk(raw)).toEqual(raw)
  })

  it('accepts model_call_start and model_call_end', () => {
    const start = { type: 'model_call_start', id: 'm1', runId: 'r1', ts: 0, model: 'gpt-4o' }
    const end = {
      type: 'model_call_end', id: 'm1', runId: 'r1', ts: 1,
      tokensIn: 100, tokensOut: 200, durationMs: 500,
    }
    expect(parseChunk(start)).toEqual(start)
    expect(parseChunk(end)).toEqual(end)
  })

  it('accepts run_start, run_end, run_error', () => {
    expect(parseChunk({ type: 'run_start', id: 's', runId: 'r1', ts: 0 })).toMatchObject({ type: 'run_start' })
    expect(parseChunk({ type: 'run_end', id: 'e', runId: 'r1', ts: 0 })).toMatchObject({ type: 'run_end' })
    expect(
      parseChunk({ type: 'run_error', id: 'x', runId: 'r1', ts: 0, message: 'boom', code: 'TOOL_FAILED' }),
    ).toMatchObject({ type: 'run_error', code: 'TOOL_FAILED' })
  })

  it('rejects unknown chunk types', () => {
    expect(() => parseChunk({ type: 'mystery', id: 'x', runId: 'r1', ts: 0 })).toThrow()
  })

  it('rejects missing required fields', () => {
    expect(() => parseChunk({ type: 'text_delta', id: 'x', runId: 'r1', ts: 0 })).toThrow()
  })
})
```

Run: `pnpm --filter @seta/agent-sdk vitest run src/schemas/chunk.test.ts` → expect FAIL with module-not-found.

- [ ] **Step 2: Implement schemas**

```ts
// platform/agent/sdk/src/schemas/chunk.ts
import { z } from 'zod'

const Base = z.object({
  id: z.string(),
  runId: z.string(),
  ts: z.number(),
})

export const TextDeltaChunk = Base.extend({
  type: z.literal('text_delta'),
  delta: z.string(),
})

export const ToolCallChunk = Base.extend({
  type: z.literal('tool_call'),
  toolName: z.string(),
  input: z.unknown(),
})

export const ToolResultChunk = Base.extend({
  type: z.literal('tool_result'),
  toolCallId: z.string(),
  output: z.unknown(),
  durationMs: z.number(),
})

export const ModelCallStartChunk = Base.extend({
  type: z.literal('model_call_start'),
  model: z.string(),
})

export const ModelCallEndChunk = Base.extend({
  type: z.literal('model_call_end'),
  tokensIn: z.number(),
  tokensOut: z.number(),
  durationMs: z.number(),
})

export const RunStartChunk = Base.extend({ type: z.literal('run_start') })
export const RunEndChunk = Base.extend({ type: z.literal('run_end') })
export const RunErrorChunk = Base.extend({
  type: z.literal('run_error'),
  message: z.string(),
  code: z.string(),
})

export const KernelChunk = z.discriminatedUnion('type', [
  TextDeltaChunk,
  ToolCallChunk,
  ToolResultChunk,
  ModelCallStartChunk,
  ModelCallEndChunk,
  RunStartChunk,
  RunEndChunk,
  RunErrorChunk,
])

export type KernelChunk = z.infer<typeof KernelChunk>

export function parseChunk(raw: unknown): KernelChunk {
  return KernelChunk.parse(raw)
}
```

- [ ] **Step 3: Tests pass**

Run: `pnpm --filter @seta/agent-sdk vitest run src/schemas/chunk.test.ts` → expect 7 pass.

- [ ] **Step 4: Commit**

```bash
git add platform/agent/sdk/src/schemas
git commit -m "feat(agent-sdk): KernelChunk discriminated union with Zod validation"
```

---

### Task 6: Cross-validate KernelChunk against streamKernelSSE output

**Files:**
- Create: `platform/agent/sdk/src/schemas/contract.test.ts`

This task forces alignment between SDK schema and server emitter. If the schema rejects a real chunk, fix the schema; if `streamKernelSSE` emits a shape the SDK can't validate, that's a kernel bug.

- [ ] **Step 1: Locate streamKernelSSE source**

```bash
grep -rn "streamKernelSSE" platform/agent --include='*.ts' -l
```
Open the implementation file; identify the chunk-emission function (likely `emitChunk(c, chunk)` or similar).

- [ ] **Step 2: Write a contract test driving the emitter directly**

```ts
// platform/agent/sdk/src/schemas/contract.test.ts
import { describe, it, expect } from 'vitest'
import { parseChunk } from './chunk'

// Imported from the kernel — DO NOT mock; we want to fail fast if shapes diverge.
import { __testEmitChunk as emit } from '@seta/agent-core/internal/stream'

describe('KernelChunk vs streamKernelSSE emitter', () => {
  it('parses every chunk type the kernel can emit', () => {
    const samples = [
      emit({ kind: 'text', runId: 'r', delta: 'x' }),
      emit({ kind: 'toolCall', runId: 'r', name: 't', input: {} }),
      emit({ kind: 'toolResult', runId: 'r', callId: 'c', output: {}, ms: 1 }),
      // ...one sample per emitter branch
    ]
    for (const s of samples) expect(parseChunk(s)).toMatchObject({ runId: 'r' })
  })
})
```

If `__testEmitChunk` does not exist in `@seta/agent-core`, this task's deliverable is a TODO ticket noting that the kernel must export an internal test helper. Open the ticket; mark this task **blocked** and move on. (Plan #3 will reconcile.)

- [ ] **Step 3: Add workspace dep if test compiles**

```bash
pnpm --filter @seta/agent-sdk add -D @seta/agent-core@workspace:*
```

- [ ] **Step 4: Run, commit if green**

```bash
pnpm --filter @seta/agent-sdk vitest run src/schemas/contract.test.ts
git add platform/agent/sdk/src/schemas/contract.test.ts platform/agent/sdk/package.json pnpm-lock.yaml
git commit -m "test(agent-sdk): assert KernelChunk schema matches streamKernelSSE emitter"
```

---

## Phase 2 — SSE Parser

### Task 7: Capture SSE fixtures

**Files:**
- Create: `platform/agent/sdk/src/sse/__fixtures__/run-success.sse`
- Create: `platform/agent/sdk/src/sse/__fixtures__/run-error.sse`
- Create: `platform/agent/sdk/src/sse/__fixtures__/partial-frame.sse`

Fixtures are bytes-on-the-wire so the parser test can `TextEncoder().encode(fixture)` and feed `ReadableStream` chunks of arbitrary size — including mid-frame splits.

- [ ] **Step 1: Record a real run if possible**

Run an integration test that invokes `streamKernelSSE`, capture stdout into the three fixture files. If unavailable, hand-author them matching the SSE framing (`data: <json>\n\n`) using the chunk shapes from Task 5.

Example `run-success.sse`:
```
data: {"type":"run_start","id":"s","runId":"r1","ts":0}

data: {"type":"model_call_start","id":"m1","runId":"r1","ts":1,"model":"gpt-4o"}

data: {"type":"text_delta","id":"t1","runId":"r1","ts":2,"delta":"Hello"}

data: {"type":"text_delta","id":"t2","runId":"r1","ts":3,"delta":" world"}

data: {"type":"model_call_end","id":"m1","runId":"r1","ts":4,"tokensIn":10,"tokensOut":2,"durationMs":42}

data: {"type":"run_end","id":"e","runId":"r1","ts":5}

```

Example `run-error.sse` ends with a `run_error` chunk. Example `partial-frame.sse` deliberately splits a `data: {...}` payload across two lines (`data: {"type":"text_delta",\n"id":"x",...}`) — this is invalid SSE; the parser must report a frame error.

- [ ] **Step 2: Commit fixtures**

```bash
git add platform/agent/sdk/src/sse/__fixtures__
git commit -m "test(agent-sdk): SSE fixtures for parser tests"
```

---

### Task 8: parseSseStream — write the failing tests

**Files:**
- Create: `platform/agent/sdk/src/sse/parseSseStream.test.ts`

- [ ] **Step 1: Write tests**

```ts
// platform/agent/sdk/src/sse/parseSseStream.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSseStream } from './parseSseStream'
import type { KernelChunk } from '../schemas/chunk'

const fx = (name: string) =>
  readFileSync(resolve(__dirname, '__fixtures__', name))

function streamFrom(bytes: Uint8Array, chunkSize = 16): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= bytes.length) return controller.close()
      const end = Math.min(i + chunkSize, bytes.length)
      controller.enqueue(bytes.slice(i, end))
      i = end
    },
  })
}

describe('parseSseStream', () => {
  it('parses a complete success run', async () => {
    const received: KernelChunk[] = []
    await parseSseStream(streamFrom(fx('run-success.sse')), c => received.push(c))
    expect(received.map(c => c.type)).toEqual([
      'run_start', 'model_call_start', 'text_delta', 'text_delta',
      'model_call_end', 'run_end',
    ])
  })

  it('handles arbitrary chunk boundaries (1-byte chunks)', async () => {
    const received: KernelChunk[] = []
    await parseSseStream(streamFrom(fx('run-success.sse'), 1), c => received.push(c))
    expect(received).toHaveLength(6)
  })

  it('propagates run_error chunk', async () => {
    const received: KernelChunk[] = []
    await parseSseStream(streamFrom(fx('run-error.sse')), c => received.push(c))
    expect(received.at(-1)?.type).toBe('run_error')
  })

  it('rejects malformed frames', async () => {
    await expect(
      parseSseStream(streamFrom(fx('partial-frame.sse')), () => {}),
    ).rejects.toThrowError(/sse parse/i)
  })

  it('aborts via signal', async () => {
    const ctrl = new AbortController()
    const slow = streamFrom(fx('run-success.sse'), 1)
    const p = parseSseStream(slow, () => {}, { signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toThrow(/abort/i)
  })

  it('ignores comment lines and empty frames', async () => {
    const text = ': keep-alive\n\ndata: {"type":"run_end","id":"e","runId":"r","ts":0}\n\n'
    const received: KernelChunk[] = []
    await parseSseStream(streamFrom(new TextEncoder().encode(text)), c => received.push(c))
    expect(received).toHaveLength(1)
  })
})
```

Run: `pnpm --filter @seta/agent-sdk vitest run src/sse/parseSseStream.test.ts` → FAIL (module missing).

---

### Task 9: Implement parseSseStream

**Files:**
- Create: `platform/agent/sdk/src/sse/parseSseStream.ts`

- [ ] **Step 1: Implementation**

```ts
// platform/agent/sdk/src/sse/parseSseStream.ts
import { parseChunk, type KernelChunk } from '../schemas/chunk'

export interface ParseOptions {
  signal?: AbortSignal
}

export async function parseSseStream(
  stream: ReadableStream<Uint8Array>,
  onChunk: (c: KernelChunk) => void,
  opts: ParseOptions = {},
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  const onAbort = () => {
    reader.cancel(new DOMException('Aborted', 'AbortError')).catch(() => {})
  }
  opts.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    while (true) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const chunk = parseFrame(frame)
        if (chunk) onChunk(chunk)
      }
    }
    const tail = buffer.trim()
    if (tail) {
      const chunk = parseFrame(tail)
      if (chunk) onChunk(chunk)
    }
  } finally {
    opts.signal?.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
}

function parseFrame(frame: string): KernelChunk | null {
  const lines = frame.split('\n')
  let data = ''
  for (const line of lines) {
    if (line.startsWith(':') || line.length === 0) continue
    if (!line.startsWith('data:')) {
      throw new Error(`sse parse: unexpected field in frame: ${line.slice(0, 32)}`)
    }
    data += line.slice(5).trimStart()
  }
  if (!data) return null
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch (e) {
    throw new Error(`sse parse: invalid JSON in data: ${(e as Error).message}`)
  }
  return parseChunk(raw)
}
```

- [ ] **Step 2: Tests pass**

```bash
pnpm --filter @seta/agent-sdk vitest run src/sse/parseSseStream.test.ts
```
Expected: 6 pass.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/sdk/src/sse
git commit -m "feat(agent-sdk): SSE parser with chunk validation and abort support"
```

---

### Task 10: parseSseStream — backpressure and reader lifecycle test

**Files:**
- Modify: `platform/agent/sdk/src/sse/parseSseStream.test.ts`

- [ ] **Step 1: Append a lifecycle test**

```ts
it('releases the reader lock when consumer throws', async () => {
  const stream = streamFrom(fx('run-success.sse'))
  await expect(
    parseSseStream(stream, () => { throw new Error('consumer boom') }),
  ).rejects.toThrow('consumer boom')

  // After the parser unwinds, the underlying stream must be cancellable.
  await expect(stream.cancel()).resolves.toBeUndefined()
})
```

- [ ] **Step 2: Run; if it fails, wrap `onChunk` invocation with try/finally that calls `reader.cancel`**

If the existing implementation already passes (it does — the `finally` block runs on throw, which calls `releaseLock`), commit and move on.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/sdk/src/sse/parseSseStream.test.ts
git commit -m "test(agent-sdk): assert SSE parser releases reader lock on consumer throw"
```

---

## Phase 3 — Transport

### Task 11: AgentClientError class

**Files:**
- Create: `platform/agent/sdk/src/transport/AgentClientError.ts`
- Create: `platform/agent/sdk/src/transport/AgentClientError.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// platform/agent/sdk/src/transport/AgentClientError.test.ts
import { describe, it, expect } from 'vitest'
import { AgentClientError } from './AgentClientError'

describe('AgentClientError', () => {
  it('carries kind, status, and body for http errors', () => {
    const e = new AgentClientError({ kind: 'http', status: 401, body: { msg: 'no' } })
    expect(e.kind).toBe('http')
    expect(e.status).toBe(401)
    expect(e.body).toEqual({ msg: 'no' })
    expect(e instanceof Error).toBe(true)
  })

  it('exposes kind=network with cause', () => {
    const cause = new TypeError('network down')
    const e = new AgentClientError({ kind: 'network', cause })
    expect(e.kind).toBe('network')
    expect(e.cause).toBe(cause)
  })

  it('exposes kind=parse and kind=abort', () => {
    expect(new AgentClientError({ kind: 'parse', cause: new Error('zod') }).kind).toBe('parse')
    expect(new AgentClientError({ kind: 'abort' }).kind).toBe('abort')
  })
})
```

- [ ] **Step 2: Implementation**

```ts
// platform/agent/sdk/src/transport/AgentClientError.ts
type Init =
  | { kind: 'http'; status: number; body: unknown }
  | { kind: 'network'; cause: unknown }
  | { kind: 'parse'; cause: unknown }
  | { kind: 'abort' }

export class AgentClientError extends Error {
  readonly kind: Init['kind']
  readonly status?: number
  readonly body?: unknown

  constructor(init: Init) {
    super(messageFor(init), 'cause' in init ? { cause: init.cause } : undefined)
    this.name = 'AgentClientError'
    this.kind = init.kind
    if (init.kind === 'http') {
      this.status = init.status
      this.body = init.body
    }
  }
}

function messageFor(i: Init): string {
  switch (i.kind) {
    case 'http': return `HTTP ${i.status}`
    case 'network': return 'Network error'
    case 'parse': return 'Response parse error'
    case 'abort': return 'Request aborted'
  }
}
```

- [ ] **Step 3: Tests pass + commit**

```bash
pnpm --filter @seta/agent-sdk vitest run src/transport/AgentClientError.test.ts
git add platform/agent/sdk/src/transport/AgentClientError.ts platform/agent/sdk/src/transport/AgentClientError.test.ts
git commit -m "feat(agent-sdk): typed AgentClientError discriminated by kind"
```

---

### Task 12: request() helper — failing tests with MSW

**Files:**
- Create: `platform/agent/sdk/src/transport/request.test.ts`
- Create: `platform/agent/sdk/test/setup.ts`

- [ ] **Step 1: Vitest setup wires MSW**

```ts
// platform/agent/sdk/test/setup.ts
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

export const server = setupServer()
export { http, HttpResponse }

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

Update `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    name: '@seta/agent-sdk',
    setupFiles: ['./test/setup.ts'],
  },
})
```

- [ ] **Step 2: Failing tests**

```ts
// platform/agent/sdk/src/transport/request.test.ts
import { describe, it, expect } from 'vitest'
import { server, http, HttpResponse } from '../../test/setup'
import { request } from './request'
import { AgentClientError } from './AgentClientError'
import { z } from 'zod'

const opts = { baseUrl: 'https://api.test', credentials: 'include' as const }

describe('request', () => {
  it('GETs and validates response with provided schema', async () => {
    server.use(http.get('https://api.test/me', () => HttpResponse.json({ id: 'u1' })))
    const Schema = z.object({ id: z.string() })
    const out = await request(opts, '/me', { schema: Schema })
    expect(out).toEqual({ id: 'u1' })
  })

  it('throws kind=http with status + body on 401', async () => {
    server.use(http.get('https://api.test/me', () =>
      HttpResponse.json({ error: 'no' }, { status: 401 })))
    await expect(request(opts, '/me', { schema: z.unknown() }))
      .rejects.toMatchObject({ kind: 'http', status: 401, body: { error: 'no' } })
  })

  it('throws kind=parse when schema rejects body', async () => {
    server.use(http.get('https://api.test/me', () => HttpResponse.json({ wrong: true })))
    await expect(
      request(opts, '/me', { schema: z.object({ id: z.string() }) }),
    ).rejects.toMatchObject({ kind: 'parse' })
  })

  it('throws kind=abort on AbortSignal', async () => {
    server.use(http.get('https://api.test/slow', async () => {
      await new Promise(r => setTimeout(r, 100))
      return HttpResponse.json({})
    }))
    const ctrl = new AbortController()
    const p = request(opts, '/slow', { schema: z.unknown(), signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ kind: 'abort' })
  })

  it('POSTs JSON body and merges headers', async () => {
    server.use(http.post('https://api.test/echo', async ({ request }) => {
      const body = await request.json()
      return HttpResponse.json({ got: body, auth: request.headers.get('x-test') })
    }))
    const out = await request(opts, '/echo', {
      method: 'POST',
      body: { hello: 'world' },
      headers: { 'x-test': '1' },
      schema: z.object({ got: z.object({ hello: z.string() }), auth: z.string() }),
    })
    expect(out).toEqual({ got: { hello: 'world' }, auth: '1' })
  })

  it('returns raw Response when expect="stream"', async () => {
    server.use(http.get('https://api.test/stream', () =>
      new HttpResponse('data: {"type":"run_end","id":"e","runId":"r","ts":0}\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      }),
    ))
    const res = await request(opts, '/stream', { expect: 'stream' })
    expect(res.body).toBeInstanceOf(ReadableStream)
  })
})
```

---

### Task 13: Implement request()

**Files:**
- Create: `platform/agent/sdk/src/transport/request.ts`

- [ ] **Step 1: Implementation**

```ts
// platform/agent/sdk/src/transport/request.ts
import type { z } from 'zod'
import type { AgentClientOptions } from '../types'
import { AgentClientError } from './AgentClientError'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface JsonRequest<T> {
  method?: Method
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  schema: z.ZodType<T>
  expect?: 'json'
}

interface StreamRequest {
  method?: Method
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  expect: 'stream'
}

export function request<T>(opts: AgentClientOptions, path: string, init: JsonRequest<T>): Promise<T>
export function request(opts: AgentClientOptions, path: string, init: StreamRequest): Promise<Response>
export async function request(
  opts: AgentClientOptions,
  path: string,
  init: JsonRequest<unknown> | StreamRequest,
): Promise<unknown> {
  const url = new URL(path, opts.baseUrl).toString()
  const fetchImpl = opts.fetch ?? fetch
  const headers = new Headers(opts.headers)
  for (const [k, v] of Object.entries(init.headers ?? {})) headers.set(k, v)
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  let res: Response
  try {
    res = await fetchImpl(url, {
      method: init.method ?? 'GET',
      headers,
      credentials: opts.credentials ?? 'include',
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    })
  } catch (cause) {
    if (init.signal?.aborted) throw new AgentClientError({ kind: 'abort' })
    throw new AgentClientError({ kind: 'network', cause })
  }

  if (!res.ok) {
    let body: unknown = null
    try { body = await res.json() } catch { /* body may be non-JSON */ }
    throw new AgentClientError({ kind: 'http', status: res.status, body })
  }

  if (init.expect === 'stream') return res

  const json = await res.json().catch(cause => {
    throw new AgentClientError({ kind: 'parse', cause })
  })
  const parsed = init.schema.safeParse(json)
  if (!parsed.success) throw new AgentClientError({ kind: 'parse', cause: parsed.error })
  return parsed.data
}
```

- [ ] **Step 2: Tests pass**

```bash
pnpm --filter @seta/agent-sdk vitest run src/transport/request.test.ts
```
Expected: 6 pass.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/sdk/src/transport platform/agent/sdk/test platform/agent/sdk/vitest.config.ts
git commit -m "feat(agent-sdk): request() helper with Zod validation, abort, stream mode"
```

---

## Phase 4 — AgentClient

### Task 14: AgentClient skeleton + Me schema + getMe — failing tests

**Files:**
- Create: `platform/agent/sdk/src/client/AgentClient.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// platform/agent/sdk/src/client/AgentClient.test.ts
import { describe, it, expect } from 'vitest'
import { server, http, HttpResponse } from '../../test/setup'
import { AgentClient } from './AgentClient'

const baseUrl = 'https://api.test'

describe('AgentClient.getMe', () => {
  it('returns the session principal', async () => {
    server.use(http.get('https://api.test/me', () =>
      HttpResponse.json({
        id: 'u1', email: 'a@b.com', name: 'A B',
        tenants: [{ id: 't1', name: 'Acme', role: 'admin' }],
      }),
    ))
    const c = new AgentClient({ baseUrl })
    const me = await c.getMe()
    expect(me).toMatchObject({ id: 'u1', tenants: [{ id: 't1', role: 'admin' }] })
  })

  it('throws kind=http on 401', async () => {
    server.use(http.get('https://api.test/me', () => HttpResponse.json({}, { status: 401 })))
    const c = new AgentClient({ baseUrl })
    await expect(c.getMe()).rejects.toMatchObject({ kind: 'http', status: 401 })
  })
})

describe('AgentClient.streamRun', () => {
  it('returns a Response whose body is a ReadableStream', async () => {
    server.use(http.get('https://api.test/runs/r1/stream', () =>
      new HttpResponse('data: {"type":"run_end","id":"e","runId":"r1","ts":0}\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      }),
    ))
    const c = new AgentClient({ baseUrl })
    const res = await c.streamRun('r1')
    expect(res.body).toBeInstanceOf(ReadableStream)
  })

  it('forwards an AbortSignal', async () => {
    server.use(http.get('https://api.test/runs/r1/stream', async () => {
      await new Promise(r => setTimeout(r, 200))
      return new HttpResponse('', { headers: { 'content-type': 'text/event-stream' } })
    }))
    const c = new AgentClient({ baseUrl })
    const ctrl = new AbortController()
    const p = c.streamRun('r1', { signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ kind: 'abort' })
  })
})
```

---

### Task 15: Implement AgentClient

**Files:**
- Create: `platform/agent/sdk/src/client/AgentClient.ts`

- [ ] **Step 1: Implementation**

```ts
// platform/agent/sdk/src/client/AgentClient.ts
import { z } from 'zod'
import type { AgentClientOptions } from '../types'
import { request } from '../transport/request'

export const MeSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  tenants: z.array(z.object({
    id: z.string(),
    name: z.string(),
    role: z.enum(['admin', 'member', 'viewer']),
  })),
})
export type Me = z.infer<typeof MeSchema>

export class AgentClient {
  constructor(private readonly opts: AgentClientOptions) {
    if (!opts.baseUrl) throw new Error('AgentClient: baseUrl is required')
  }

  getMe(init: { signal?: AbortSignal } = {}): Promise<Me> {
    return request(this.opts, '/me', { schema: MeSchema, signal: init.signal })
  }

  streamRun(runId: string, init: { signal?: AbortSignal } = {}): Promise<Response> {
    return request(this.opts, `/runs/${encodeURIComponent(runId)}/stream`, {
      expect: 'stream',
      signal: init.signal,
      headers: { accept: 'text/event-stream' },
    })
  }
}
```

- [ ] **Step 2: Tests pass**

```bash
pnpm --filter @seta/agent-sdk vitest run src/client/AgentClient.test.ts
```
Expected: 3 pass.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/sdk/src/client
git commit -m "feat(agent-sdk): AgentClient with getMe and streamRun"
```

---

### Task 16: End-to-end smoke — streamRun + parseSseStream

**Files:**
- Modify: `platform/agent/sdk/src/client/AgentClient.test.ts`

- [ ] **Step 1: Add e2e test inside same suite**

```ts
import { parseSseStream } from '../sse/parseSseStream'
import type { KernelChunk } from '../schemas/chunk'

it('streamRun → parseSseStream emits all chunks', async () => {
  server.use(http.get('https://api.test/runs/r1/stream', () =>
    new HttpResponse(
      [
        'data: {"type":"run_start","id":"s","runId":"r1","ts":0}',
        '',
        'data: {"type":"text_delta","id":"t1","runId":"r1","ts":1,"delta":"hi"}',
        '',
        'data: {"type":"run_end","id":"e","runId":"r1","ts":2}',
        '',
        '',
      ].join('\n'),
      { headers: { 'content-type': 'text/event-stream' } },
    ),
  ))

  const c = new AgentClient({ baseUrl })
  const res = await c.streamRun('r1')
  const got: KernelChunk[] = []
  await parseSseStream(res.body!, ch => got.push(ch))
  expect(got.map(c => c.type)).toEqual(['run_start', 'text_delta', 'run_end'])
})
```

- [ ] **Step 2: Pass + commit**

```bash
pnpm --filter @seta/agent-sdk vitest run src/client/AgentClient.test.ts
git add platform/agent/sdk/src/client/AgentClient.test.ts
git commit -m "test(agent-sdk): end-to-end streamRun + parseSseStream integration"
```

---

## Phase 5 — Barrel + Verify

### Task 17: Public barrel + tsup entry

**Files:**
- Modify: `platform/agent/sdk/src/index.ts`

- [ ] **Step 1: Write barrel**

```ts
// platform/agent/sdk/src/index.ts
export { AgentClient, MeSchema, type Me } from './client/AgentClient'
export { parseSseStream } from './sse/parseSseStream'
export { AgentClientError } from './transport/AgentClientError'
export {
  KernelChunk,
  TextDeltaChunk,
  ToolCallChunk,
  ToolResultChunk,
  ModelCallStartChunk,
  ModelCallEndChunk,
  RunStartChunk,
  RunEndChunk,
  RunErrorChunk,
  parseChunk,
} from './schemas/chunk'
export type {
  AgentClientOptions,
  RequestOptions,
  RunStatus,
} from './types'
```

`KernelChunk` is exported both as the Zod schema and (via `z.infer` re-export in `chunk.ts`) the type — type-only consumers (`@seta/ui`, `apps/studio`) import via `import type { KernelChunk } from '@seta/agent-sdk'`.

- [ ] **Step 2: Build + typecheck**

```bash
pnpm --filter @seta/agent-sdk build
pnpm --filter @seta/agent-sdk typecheck
```
Both succeed; `dist/index.d.ts` exposes the surface above.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/sdk/src/index.ts
git commit -m "feat(agent-sdk): public barrel exports"
```

---

### Task 18: Final verification + changeset

**Files:**
- Create: `.changeset/agent-sdk-initial.md`

- [ ] **Step 1: Repo-wide gates**

```bash
pnpm lint
pnpm typecheck
pnpm --filter @seta/agent-sdk test:unit
pnpm --filter @seta/agent-sdk build
```
All four must succeed.

- [ ] **Step 2: Changeset**

```bash
pnpm changeset
```
Choose `@seta/agent-sdk` minor (first usable release). Message: `Initial @seta/agent-sdk — AgentClient, parseSseStream, KernelChunk`.

- [ ] **Step 3: Commit**

```bash
git add .changeset/
git commit -m "chore(agent-sdk): changeset for initial release"
```

---

## Plan Self-Review Notes

**Spec coverage (`docs/superpowers/specs/2026-05-15-studio-design.md`):**

| Spec section | Plan task |
|---|---|
| §3.3 SetaProvider needs `AgentClient` | Task 15 |
| §4.3 server-state via `AgentClient` | Task 15 |
| §4.4 SSE streaming via `parseSseStream` | Tasks 7–10 |
| §4.4 `KernelChunk` discriminated union | Tasks 5–6 |
| §11 SPA-safe imports (no Node deps) | Task 3 (tsconfig DOM-only) |

**Out of scope (deferred to apps/studio plan):**
- `listTenants`, `listConnectors`, consent URL, `listRuns`, `getRun`, `listCorpus`, upload, `listAudit` — added incrementally as each backend route is built.
- React hooks (`useAgentRun`, `useSession`) — owned by `@seta/ui` (Plan #2).

**Open dependency:** Task 6 (contract test) requires `@seta/agent-core` to export a test helper for chunk emission. If absent, Task 6 is **blocked** — file the kernel-side change as the first item of Plan #2 or as a separate prerequisite ticket before the contract test can land.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-15-seta-agent-sdk.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task with two-stage review between tasks.

**2. Inline Execution** — execute tasks in this session with checkpoints.

**Which approach?**

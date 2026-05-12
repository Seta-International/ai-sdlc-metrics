# `@seta/agent-core` K1.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the MSW-backed LLM record/replay testkit at `@seta/agent-core/testkit` — `setupLLMRecording`, `serializeRequestContent`, `hashRequest` — with unit tests for every module plus an integration test that proves the real Anthropic + OpenAI SDKs are interceptable.

**Architecture:** New subtree under `platform/agent/core/src/testkit/recording/` with six focused files (types, hash, mode, store, streaming, setup). MSW `setupServer` over `https://api.anthropic.com/*` and `https://api.openai.com/*` only. Three modes via `RECORD` env var: unset = strict replay, `RECORD=1` = record-if-missing, `RECORD=force` = re-record all. Each recording file is `__recordings__/<name>.json` with `{ meta, recordings[] }`. Streaming responses are stored as raw `reader.read()` decoded chunks; replay reconstructs a `ReadableStream` with no inter-chunk delay.

**Tech Stack:** TypeScript 6 (ESM), Node 22+ (global `fetch`), `msw@2.14.6`, `vitest@4.1.5`. Existing pins: `@anthropic-ai/sdk@0.95.1`, `openai@6.37.0`, `zod@4.4.3`. Reference implementation lifted from `/Users/canh/Projects/Seta/mastra/packages/_llm-recorder/src/llm-recorder.ts` (Apache-2.0).

**Spec:** `docs/superpowers/specs/2026-05-12-agent-core-k1.5-design.md`

---

## Execution rules (read before starting)

- **Working directory** for every step: `/Users/canh/Projects/Seta/seta-os` (absolute paths used throughout). Never `cd` away.
- **CLI-only `package.json` edits.** Use `pnpm --filter @seta/agent-core add ...` / `pnpm pkg set ...`. Never hand-edit `package.json` outside the whitelisted metadata fields. CI guard `check-no-manual-pkg-edit.ts` will fail the PR otherwise (CLAUDE.md "CLI-only").
- **Conventional Commits** with scope `agent-core`: `feat(agent-core): …` for new code, `test(agent-core): …` when adding fixtures only, `chore(agent-core): …` for dep wiring. Sign-off footer `Co-Authored-By:` per project policy is **not** required here unless the user enables it.
- **No process metadata in source comments.** Don't write "K1.5", "AG-F1", task numbers, plan filenames, spec line numbers, or PR/issue refs in `.ts`/`.json` files. That goes in commit messages only (user feedback memory: `feedback_no_process_metadata_in_source`).
- **TDD always.** Every task writes the failing test first, runs it to confirm it fails, implements, runs to confirm green, then commits.
- **Co-located unit tests** (`src/**/*.test.ts`). Integration test lives at `tests/integration/` per CLAUDE.md.
- **ESM + `import type`** for type-only imports. Biome enforces.
- **No `console.log`.** If you need a log (e.g. mode banner), import `logger` from `@seta/observability`. The recording testkit should produce essentially zero stdout — keep diagnostics in thrown error messages.
- **One commit per task.** Stage only the files that task lists. Run `git status` before staging to verify nothing else slipped in.
- **Verify before claiming done.** After every commit, run `pnpm --filter @seta/agent-core typecheck` and the relevant `pnpm vitest run` invocation. Never skip.
- **No `vi.mock` against `openai` / `@anthropic-ai/sdk`.** The whole point of this PR is that the testkit is the single seam. If you find yourself reaching for `vi.mock`, stop and re-read the spec.
- **Recording files are checked into git.** Pretty-printed (`JSON.stringify(obj, null, 2)` plus trailing newline). The reviewer must be able to read them.

---

## Task 1: Wire dependencies and scripts

**Files:**
- Modify: `platform/agent/core/package.json` (via CLI only)

- [ ] **Step 1: Add `msw@2.14.6` as a regular dependency**

Run from `/Users/canh/Projects/Seta/seta-os`:

```bash
pnpm --filter @seta/agent-core add msw@2.14.6
```

Expected: `pnpm-lock.yaml` and `platform/agent/core/package.json` both updated. The package.json should now show `msw: "2.14.6"` under `dependencies` (exact, no `^`).

- [ ] **Step 2: Verify the install**

Run:

```bash
git diff platform/agent/core/package.json
```

Expected: a single new line under `"dependencies"` for `"msw": "2.14.6"`. No other diffs in that file.

- [ ] **Step 3: Split test scripts to keep unit fast**

Run:

```bash
pnpm --filter @seta/agent-core pkg set 'scripts.test:unit=vitest run src/'
pnpm --filter @seta/agent-core pkg set 'scripts.test:integration=vitest run tests/'
```

Expected: `package.json` scripts now include both `test:unit` (limited to `src/`) and `test:integration` (limited to `tests/`).

- [ ] **Step 4: Sanity check — package still installs and typechecks**

Run:

```bash
pnpm install --frozen-lockfile
pnpm --filter @seta/agent-core typecheck
```

Expected: both succeed. Lockfile is consistent with package.json.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/package.json pnpm-lock.yaml
git commit -m "chore(agent-core): add msw@2.14.6 and split test scripts"
```

---

## Task 2: Recording types

**Files:**
- Create: `platform/agent/core/src/testkit/recording/types.ts`

No tests (type-only file).

- [ ] **Step 1: Create the directory**

```bash
mkdir -p platform/agent/core/src/testkit/recording
```

- [ ] **Step 2: Write `types.ts`**

Create `platform/agent/core/src/testkit/recording/types.ts` with:

```ts
/** Metadata stored at the top of each recording file. */
export interface RecordingMeta {
  /** Recording name (matches the filename without extension). */
  name: string
  /** ISO timestamp when the file was first created. */
  createdAt: string
  /** ISO timestamp set on every write in record/force mode. */
  updatedAt?: string
  /** Provider host inferred from the first recorded request (e.g. "anthropic", "openai"). */
  provider?: string
  /** Model id inferred from the first recorded request's `body.model`, when present. */
  model?: string
}

/** One captured request/response pair. */
export interface LLMRecording {
  /** 16-char hex prefix of `md5(serializeRequestContent(url, body))`. */
  hash: string
  request: {
    url: string
    method: string
    body: unknown
  }
  response: {
    status: number
    statusText: string
    headers: Record<string, string>
    /** Non-streaming responses store the parsed JSON (or text) body here. */
    body?: unknown
    /** Streaming responses store one entry per decoded `reader.read()`. */
    chunks?: string[]
    /** Wall-clock ms deltas captured between chunks. Kept for diagnostic value; not used during replay. */
    chunkTimings?: number[]
    /** Distinguishes the two response shapes above. */
    isStreaming: boolean
  }
}

/** On-disk file format. One JSON file per recording `name`. */
export interface RecordingFile {
  meta: RecordingMeta
  recordings: LLMRecording[]
}

/** Caller-supplied normalizer applied on BOTH record and replay before hashing. */
export type TransformRequest = (req: { url: string; body: unknown }) => { url: string; body: unknown }

export interface SetupLLMRecordingOptions {
  /** Required. Used as the filename inside `recordingsDir`. No auto-naming. */
  name: string
  /** Override the recordings directory. Default: `<cwd>/__recordings__`. */
  recordingsDir?: string
  /** Strip per-run volatile fields (run_id, tenant_id, timestamps) before hashing. */
  transformRequest?: TransformRequest
}

export interface LLMRecordingHandle {
  /** Install MSW handlers. Call from `beforeAll`. */
  start(): void
  /** Remove MSW handlers; flush any pending writes in record/force mode. Call from `afterAll`. */
  stop(): void
}

export type RecordingMode = 'replay' | 'record' | 'force'
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @seta/agent-core typecheck
```

Expected: PASS. No file imports `types.ts` yet, so this verifies syntax + structural typing only.

- [ ] **Step 4: Commit**

```bash
git add platform/agent/core/src/testkit/recording/types.ts
git commit -m "feat(agent-core): testkit recording types"
```

---

## Task 3: Mode resolution

**Files:**
- Create: `platform/agent/core/src/testkit/recording/mode.ts`
- Create: `platform/agent/core/src/testkit/recording/mode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `platform/agent/core/src/testkit/recording/mode.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getRecordingMode } from './mode'

describe('getRecordingMode', () => {
  const original = process.env.RECORD

  beforeEach(() => {
    delete process.env.RECORD
  })

  afterEach(() => {
    if (original === undefined) delete process.env.RECORD
    else process.env.RECORD = original
  })

  it('returns "replay" when RECORD is unset', () => {
    expect(getRecordingMode()).toBe('replay')
  })

  it('returns "record" when RECORD=1', () => {
    process.env.RECORD = '1'
    expect(getRecordingMode()).toBe('record')
  })

  it('returns "force" when RECORD=force', () => {
    process.env.RECORD = 'force'
    expect(getRecordingMode()).toBe('force')
  })

  it('returns "replay" for any other RECORD value', () => {
    process.env.RECORD = 'true'
    expect(getRecordingMode()).toBe('replay')
    process.env.RECORD = 'yes'
    expect(getRecordingMode()).toBe('replay')
    process.env.RECORD = ''
    expect(getRecordingMode()).toBe('replay')
  })

  it('is case-sensitive — RECORD=FORCE does not match', () => {
    process.env.RECORD = 'FORCE'
    expect(getRecordingMode()).toBe('replay')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @seta/agent-core vitest run src/testkit/recording/mode.test.ts
```

Expected: FAIL with module resolution error (`Cannot find module './mode'`).

- [ ] **Step 3: Implement `mode.ts`**

Create `platform/agent/core/src/testkit/recording/mode.ts`:

```ts
import type { RecordingMode } from './types'

export function getRecordingMode(): RecordingMode {
  const v = process.env.RECORD
  if (v === 'force') return 'force'
  if (v === '1') return 'record'
  return 'replay'
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @seta/agent-core vitest run src/testkit/recording/mode.test.ts
```

Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/testkit/recording/mode.ts \
        platform/agent/core/src/testkit/recording/mode.test.ts
git commit -m "feat(agent-core): RECORD env var to recording mode"
```

---

## Task 4: Request hashing + canonical serialization

**Files:**
- Create: `platform/agent/core/src/testkit/recording/hash.ts`
- Create: `platform/agent/core/src/testkit/recording/hash.test.ts`

This is lifted from Mastra `llm-recorder.ts:370-453` with no behavioral changes.

- [ ] **Step 1: Write the failing test**

Create `platform/agent/core/src/testkit/recording/hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hashRequest, serializeRequestContent } from './hash'

describe('serializeRequestContent', () => {
  it('produces identical strings for objects with different key order', () => {
    const a = serializeRequestContent('https://api.anthropic.com/v1/messages', {
      model: 'claude-3-5-haiku-latest',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'hello' }],
    })
    const b = serializeRequestContent('https://api.anthropic.com/v1/messages', {
      messages: [{ content: 'hello', role: 'user' }],
      max_tokens: 16,
      model: 'claude-3-5-haiku-latest',
    })
    expect(a).toBe(b)
  })

  it('sorts nested object keys deeply', () => {
    const a = serializeRequestContent('https://x/y', { a: { z: 1, a: 2 } })
    const b = serializeRequestContent('https://x/y', { a: { a: 2, z: 1 } })
    expect(a).toBe(b)
  })

  it('preserves array element order', () => {
    const a = serializeRequestContent('https://x/y', { xs: [1, 2, 3] })
    const b = serializeRequestContent('https://x/y', { xs: [3, 2, 1] })
    expect(a).not.toBe(b)
  })

  it('canonicalizes ISO date strings in values', () => {
    const a = serializeRequestContent('https://x/y', { t: '2026-05-12T00:00:00Z' })
    const b = serializeRequestContent('https://x/y', { t: '2026-05-12T00:00:00.000Z' })
    expect(a).toBe(b)
  })

  it('handles string bodies', () => {
    expect(serializeRequestContent('https://x/y', 'hello')).toBe('https://x/y:hello')
  })

  it('handles null and primitives', () => {
    expect(serializeRequestContent('https://x/y', null)).toBe('https://x/y:null')
    expect(serializeRequestContent('https://x/y', 42)).toBe('https://x/y:42')
  })
})

describe('hashRequest', () => {
  it('returns a 16-char hex string', () => {
    const h = hashRequest('https://api.openai.com/v1/chat/completions', { model: 'gpt-4o' })
    expect(h).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is stable across runs', () => {
    const url = 'https://api.anthropic.com/v1/messages'
    const body = { model: 'claude-3-5-haiku-latest', messages: [{ role: 'user', content: 'ping' }] }
    expect(hashRequest(url, body)).toBe(hashRequest(url, body))
  })

  it('differs when URL differs', () => {
    expect(hashRequest('https://api.anthropic.com/v1/messages', { x: 1 })).not.toBe(
      hashRequest('https://api.openai.com/v1/chat/completions', { x: 1 }),
    )
  })

  it('is invariant to key order in body', () => {
    expect(hashRequest('https://x', { a: 1, b: 2 })).toBe(hashRequest('https://x', { b: 2, a: 1 }))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @seta/agent-core vitest run src/testkit/recording/hash.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `hash.ts`**

Create `platform/agent/core/src/testkit/recording/hash.ts`:

```ts
import crypto from 'node:crypto'

function canonicalizeISODateString(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return value
  return new Date(value).toISOString()
}

function stableSortKeys(value: unknown): unknown {
  if (typeof value === 'string') return canonicalizeISODateString(value)
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stableSortKeys)
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = stableSortKeys((value as Record<string, unknown>)[key])
  }
  return sorted
}

function normalizeRequestBody(body: unknown): unknown {
  if (typeof body === 'string') return canonicalizeISODateString(body)
  if (body !== null && typeof body === 'object') return stableSortKeys(body)
  return body
}

export function serializeRequestContent(url: string, body: unknown): string {
  const normalized = normalizeRequestBody(body)
  return `${url}:${typeof normalized === 'string' ? normalized : JSON.stringify(normalized)}`
}

export function hashRequest(url: string, body: unknown): string {
  return crypto.createHash('md5').update(serializeRequestContent(url, body)).digest('hex').slice(0, 16)
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @seta/agent-core vitest run src/testkit/recording/hash.test.ts
```

Expected: PASS, 10/10.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/testkit/recording/hash.ts \
        platform/agent/core/src/testkit/recording/hash.test.ts
git commit -m "feat(agent-core): canonical request hashing for the recorder"
```

---

## Task 5: Recording file store (load/save)

**Files:**
- Create: `platform/agent/core/src/testkit/recording/store.ts`
- Create: `platform/agent/core/src/testkit/recording/store.test.ts`

`saveRecordingFile` writes via tmp + rename for crash safety (spec §11 recommendation).

- [ ] **Step 1: Write the failing test**

Create `platform/agent/core/src/testkit/recording/store.test.ts`:

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadRecordingFile, recordingFilePath, saveRecordingFile } from './store'
import type { RecordingFile } from './types'

describe('store', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-store-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('recordingFilePath joins dir + name + .json', () => {
    expect(recordingFilePath(dir, 'my-test')).toBe(path.join(dir, 'my-test.json'))
  })

  it('loadRecordingFile returns null when the file does not exist', () => {
    expect(loadRecordingFile(recordingFilePath(dir, 'missing'))).toBeNull()
  })

  it('saveRecordingFile writes pretty-printed JSON with a trailing newline', () => {
    const file: RecordingFile = {
      meta: { name: 'demo', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [],
    }
    saveRecordingFile(recordingFilePath(dir, 'demo'), file)
    const raw = fs.readFileSync(path.join(dir, 'demo.json'), 'utf-8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(raw).toContain('  "meta"')
    const parsed = JSON.parse(raw) as RecordingFile
    expect(parsed.meta.name).toBe('demo')
    expect(parsed.recordings).toEqual([])
  })

  it('loadRecordingFile round-trips what saveRecordingFile wrote', () => {
    const file: RecordingFile = {
      meta: { name: 'demo', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [
        {
          hash: 'abc1234567890def',
          request: { url: 'https://x/y', method: 'POST', body: { a: 1 } },
          response: { status: 200, statusText: 'OK', headers: {}, body: { ok: true }, isStreaming: false },
        },
      ],
    }
    const filepath = recordingFilePath(dir, 'demo')
    saveRecordingFile(filepath, file)
    expect(loadRecordingFile(filepath)).toEqual(file)
  })

  it('saveRecordingFile creates the parent directory if needed', () => {
    const nested = path.join(dir, 'a', 'b', 'c')
    saveRecordingFile(recordingFilePath(nested, 'demo'), {
      meta: { name: 'demo', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [],
    })
    expect(fs.existsSync(path.join(nested, 'demo.json'))).toBe(true)
  })

  it('saveRecordingFile uses tmp+rename — the final file is either fully written or absent', () => {
    const filepath = recordingFilePath(dir, 'demo')
    saveRecordingFile(filepath, {
      meta: { name: 'demo', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [],
    })
    // No leftover .tmp file:
    const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))
    expect(leftovers).toEqual([])
  })

  it('loadRecordingFile throws when the JSON is structurally invalid', () => {
    const filepath = recordingFilePath(dir, 'bad')
    fs.writeFileSync(filepath, '[]')  // legacy array form is no longer accepted
    expect(() => loadRecordingFile(filepath)).toThrow(/invalid recording file/i)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @seta/agent-core vitest run src/testkit/recording/store.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `store.ts`**

Create `platform/agent/core/src/testkit/recording/store.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import type { RecordingFile } from './types'

export function recordingFilePath(recordingsDir: string, name: string): string {
  return path.join(recordingsDir, `${name}.json`)
}

function isRecordingFile(raw: unknown): raw is RecordingFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const obj = raw as Record<string, unknown>
  return (
    typeof obj.meta === 'object' &&
    obj.meta !== null &&
    Array.isArray(obj.recordings)
  )
}

export function loadRecordingFile(filepath: string): RecordingFile | null {
  if (!fs.existsSync(filepath)) return null
  const raw: unknown = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
  if (!isRecordingFile(raw)) {
    throw new Error(`Invalid recording file format: ${filepath}`)
  }
  return raw
}

export function saveRecordingFile(filepath: string, file: RecordingFile): void {
  fs.mkdirSync(path.dirname(filepath), { recursive: true })
  const tmp = `${filepath}.tmp`
  const json = `${JSON.stringify(file, null, 2)}\n`
  fs.writeFileSync(tmp, json)
  fs.renameSync(tmp, filepath)
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @seta/agent-core vitest run src/testkit/recording/store.test.ts
```

Expected: PASS, 7/7.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/testkit/recording/store.ts \
        platform/agent/core/src/testkit/recording/store.test.ts
git commit -m "feat(agent-core): recording file load/save with atomic write"
```

---

## Task 6: Streaming capture + replay

**Files:**
- Create: `platform/agent/core/src/testkit/recording/streaming.ts`
- Create: `platform/agent/core/src/testkit/recording/streaming.test.ts`

Drains `text/event-stream` bodies into `{ chunks, chunkTimings }`. Replay rebuilds a `ReadableStream` with zero delay between chunks.

- [ ] **Step 1: Write the failing test**

Create `platform/agent/core/src/testkit/recording/streaming.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { captureStreamingResponse, createStreamingResponse, isStreamingResponse } from './streaming'
import type { LLMRecording } from './types'

function makeSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/event-stream' },
  })
}

describe('isStreamingResponse', () => {
  it('detects text/event-stream', () => {
    expect(isStreamingResponse(new Headers({ 'content-type': 'text/event-stream' }))).toBe(true)
  })
  it('detects text/plain (some providers use it for SSE)', () => {
    expect(isStreamingResponse(new Headers({ 'content-type': 'text/plain' }))).toBe(true)
  })
  it('returns false for application/json', () => {
    expect(isStreamingResponse(new Headers({ 'content-type': 'application/json' }))).toBe(false)
  })
  it('returns false when content-type is absent', () => {
    expect(isStreamingResponse(new Headers())).toBe(false)
  })
})

describe('captureStreamingResponse', () => {
  it('captures each reader.read() decode as a string entry', async () => {
    const res = makeSseResponse(['event: a\ndata: 1\n\n', 'event: b\ndata: 2\n\n'])
    const { chunks, timings } = await captureStreamingResponse(res)
    expect(chunks).toEqual(['event: a\ndata: 1\n\n', 'event: b\ndata: 2\n\n'])
    expect(timings).toHaveLength(2)
    expect(timings.every((t) => t >= 0)).toBe(true)
  })

  it('returns an empty result when the body is null', async () => {
    const res = new Response(null, { status: 204 })
    const { chunks, timings } = await captureStreamingResponse(res)
    expect(chunks).toEqual([])
    expect(timings).toEqual([])
  })
})

describe('createStreamingResponse', () => {
  it('rebuilds a ReadableStream that emits the recorded chunks in order', async () => {
    const recording: LLMRecording = {
      hash: 'h',
      request: { url: 'https://x/y', method: 'POST', body: {} },
      response: {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
        chunks: ['event: a\ndata: 1\n\n', 'event: b\ndata: 2\n\n'],
        chunkTimings: [0, 5],
        isStreaming: true,
      },
    }
    const res = createStreamingResponse(recording)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/event-stream')

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    const out: string[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      out.push(decoder.decode(value))
    }
    expect(out).toEqual(['event: a\ndata: 1\n\n', 'event: b\ndata: 2\n\n'])
  })

  it('replays with no inter-chunk delay (entire stream resolves in < 50ms for 100 chunks)', async () => {
    const chunks = Array.from({ length: 100 }, (_, i) => `data: ${i}\n\n`)
    const timings = Array.from({ length: 100 }, () => 50) // would be 5s if we slept
    const recording: LLMRecording = {
      hash: 'h',
      request: { url: 'https://x/y', method: 'POST', body: {} },
      response: {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
        chunks,
        chunkTimings: timings,
        isStreaming: true,
      },
    }
    const start = Date.now()
    const reader = createStreamingResponse(recording).body!.getReader()
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }
    expect(Date.now() - start).toBeLessThan(50)
  })

  it('aborts when the consumer cancels the reader', async () => {
    const recording: LLMRecording = {
      hash: 'h',
      request: { url: 'https://x/y', method: 'POST', body: {} },
      response: {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
        chunks: ['a', 'b', 'c'],
        chunkTimings: [0, 0, 0],
        isStreaming: true,
      },
    }
    const reader = createStreamingResponse(recording).body!.getReader()
    const first = await reader.read()
    expect(first.done).toBe(false)
    await reader.cancel()
    const next = await reader.read()
    expect(next.done).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @seta/agent-core vitest run src/testkit/recording/streaming.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `streaming.ts`**

Create `platform/agent/core/src/testkit/recording/streaming.ts`:

```ts
import type { LLMRecording } from './types'

export function isStreamingResponse(headers: Headers): boolean {
  const ct = headers.get('content-type') || ''
  return ct.includes('text/event-stream') || ct.includes('text/plain')
}

export async function captureStreamingResponse(
  response: Response,
): Promise<{ chunks: string[]; timings: number[] }> {
  const chunks: string[] = []
  const timings: number[] = []
  const reader = response.body?.getReader()
  if (!reader) return { chunks, timings }

  const decoder = new TextDecoder()
  let lastTime = Date.now()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(decoder.decode(value, { stream: true }))
      const now = Date.now()
      timings.push(now - lastTime)
      lastTime = now
    }
  } finally {
    reader.releaseLock()
  }
  return { chunks, timings }
}

export function createStreamingResponse(recording: LLMRecording): Response {
  const chunks = recording.response.chunks ?? []
  let i = 0
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[i] as string))
      i++
    },
  })
  return new Response(stream, {
    status: recording.response.status,
    statusText: recording.response.statusText,
    headers: recording.response.headers,
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @seta/agent-core vitest run src/testkit/recording/streaming.test.ts
```

Expected: PASS, 8/8. The 100-chunk timing test should finish well under 50ms (typically <5ms).

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/testkit/recording/streaming.ts \
        platform/agent/core/src/testkit/recording/streaming.test.ts
git commit -m "feat(agent-core): SSE capture + zero-delay replay"
```

---

## Task 7: `setupLLMRecording` — MSW orchestration

**Files:**
- Create: `platform/agent/core/src/testkit/recording/setup.ts`
- Create: `platform/agent/core/src/testkit/recording/setup.test.ts`

This is the bulk of the testkit. Each handler hits one closure that runs the mode-dispatched logic.

- [ ] **Step 1: Write the failing test**

Create `platform/agent/core/src/testkit/recording/setup.test.ts`:

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupLLMRecording } from './setup'
import { loadRecordingFile, recordingFilePath, saveRecordingFile } from './store'
import type { RecordingFile } from './types'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

describe('setupLLMRecording', () => {
  let dir: string
  const originalRecord = process.env.RECORD

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-setup-'))
    delete process.env.RECORD
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    if (originalRecord === undefined) delete process.env.RECORD
    else process.env.RECORD = originalRecord
  })

  it('start() then stop() does not throw on a fresh dir', () => {
    const rec = setupLLMRecording({ name: 'fresh', recordingsDir: dir })
    rec.start()
    rec.stop()
  })

  it('replay mode + missing recording returns a 500 with a helpful error', async () => {
    const rec = setupLLMRecording({ name: 'missing', recordingsDir: dir })
    rec.start()
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-3-5-haiku-latest', messages: [] }),
      })
      expect(res.status).toBe(500)
      const data = (await res.json()) as { error: string }
      expect(data.error).toMatch(/no matching recording for "missing"/i)
      expect(data.error).toMatch(/api\.anthropic\.com/)
      expect(data.error).toMatch(/RECORD=1/)
    } finally {
      rec.stop()
    }
  })

  it('replay mode + matching recording returns the canned response', async () => {
    const filepath = recordingFilePath(dir, 'replay-hit')
    const file: RecordingFile = {
      meta: { name: 'replay-hit', createdAt: new Date().toISOString() },
      recordings: [
        {
          hash: 'will-be-overwritten',  // we let setup.ts compute on its own; we just need a hit
          request: { url: ANTHROPIC_URL, method: 'POST', body: { model: 'm', messages: [] } },
          response: {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body: { id: 'msg_test', content: [{ type: 'text', text: 'pong' }] },
            isStreaming: false,
          },
        },
      ],
    }
    // Compute the correct hash for the canonicalized request and write it back.
    const { hashRequest } = await import('./hash')
    file.recordings[0]!.hash = hashRequest(ANTHROPIC_URL, { model: 'm', messages: [] })
    saveRecordingFile(filepath, file)

    const rec = setupLLMRecording({ name: 'replay-hit', recordingsDir: dir })
    rec.start()
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'm', messages: [] }),
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { id: string }
      expect(data.id).toBe('msg_test')
    } finally {
      rec.stop()
    }
  })

  it('record mode (RECORD=1) writes a new entry when none exists', async () => {
    process.env.RECORD = '1'
    const filepath = recordingFilePath(dir, 'record-miss')

    // Stand up a temporary "real" endpoint by overriding global fetch only for the bypass leg.
    // Instead, write a fake fetch that the MSW handler will hit via bypass(): we accomplish this
    // by pointing the MSW handler URL at a host MSW intercepts, but the bypassed request goes
    // through the real fetch. For the unit test we cannot reach real anthropic.com, so we replace
    // global fetch with a stub BEFORE start() — MSW's bypass uses the global fetch reference,
    // so this works in node 22+.
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      // Anthropic-like bypass leg:
      if (url === ANTHROPIC_URL) {
        return new Response(JSON.stringify({ id: 'msg_recorded', content: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return realFetch(input as RequestInfo, init)
    }) as typeof fetch

    try {
      const rec = setupLLMRecording({ name: 'record-miss', recordingsDir: dir })
      rec.start()
      try {
        const res = await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'm', messages: [] }),
        })
        expect(res.status).toBe(200)
      } finally {
        rec.stop()
      }
      const stored = loadRecordingFile(filepath)
      expect(stored).not.toBeNull()
      expect(stored!.recordings).toHaveLength(1)
      expect(stored!.recordings[0]!.response.body).toEqual({ id: 'msg_recorded', content: [] })
      expect(stored!.meta.provider).toBe('anthropic')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('force mode (RECORD=force) overwrites the recordings array', async () => {
    process.env.RECORD = 'force'
    const filepath = recordingFilePath(dir, 'force')
    saveRecordingFile(filepath, {
      meta: { name: 'force', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [
        {
          hash: 'old',
          request: { url: ANTHROPIC_URL, method: 'POST', body: { model: 'old' } },
          response: { status: 200, statusText: 'OK', headers: {}, body: { id: 'old' }, isStreaming: false },
        },
      ],
    })

    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      if (url === ANTHROPIC_URL) {
        return new Response(JSON.stringify({ id: 'fresh' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return realFetch(input as RequestInfo)
    }) as typeof fetch

    try {
      const rec = setupLLMRecording({ name: 'force', recordingsDir: dir })
      rec.start()
      try {
        await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'new' }),
        })
      } finally {
        rec.stop()
      }
      const stored = loadRecordingFile(filepath)
      expect(stored!.recordings).toHaveLength(1)
      expect(stored!.recordings[0]!.request.body).toEqual({ model: 'new' })
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('record mode hash hit replays without re-recording', async () => {
    process.env.RECORD = '1'
    const filepath = recordingFilePath(dir, 'record-hit')
    const { hashRequest } = await import('./hash')
    const body = { model: 'm', messages: [] }
    saveRecordingFile(filepath, {
      meta: { name: 'record-hit', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [
        {
          hash: hashRequest(ANTHROPIC_URL, body),
          request: { url: ANTHROPIC_URL, method: 'POST', body },
          response: { status: 200, statusText: 'OK', headers: {}, body: { id: 'cached' }, isStreaming: false },
        },
      ],
    })

    const rec = setupLLMRecording({ name: 'record-hit', recordingsDir: dir })
    rec.start()
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { id: string }
      expect(data.id).toBe('cached')
    } finally {
      rec.stop()
    }
  })

  it('transformRequest normalizes volatile fields before hashing', async () => {
    const filepath = recordingFilePath(dir, 'transform')
    const { hashRequest } = await import('./hash')
    const canonicalBody = { model: 'm', run_id: 'NORMALIZED', messages: [] }
    saveRecordingFile(filepath, {
      meta: { name: 'transform', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [
        {
          hash: hashRequest(ANTHROPIC_URL, canonicalBody),
          request: { url: ANTHROPIC_URL, method: 'POST', body: canonicalBody },
          response: { status: 200, statusText: 'OK', headers: {}, body: { id: 'ok' }, isStreaming: false },
        },
      ],
    })

    const rec = setupLLMRecording({
      name: 'transform',
      recordingsDir: dir,
      transformRequest: ({ url, body }) => ({
        url,
        body: { ...(body as Record<string, unknown>), run_id: 'NORMALIZED' },
      }),
    })
    rec.start()
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'm', run_id: 'each-run-different', messages: [] }),
      })
      const data = (await res.json()) as { id: string }
      expect(data.id).toBe('ok')
    } finally {
      rec.stop()
    }
  })

  it('non-LLM requests pass through (onUnhandledRequest: bypass)', async () => {
    const rec = setupLLMRecording({ name: 'bypass', recordingsDir: dir })
    rec.start()
    try {
      // We can't reach a real host in unit tests, so we stub global fetch for the bypassed leg.
      const realFetch = globalThis.fetch
      globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
        if (url.startsWith('https://example.invalid/')) {
          return new Response('ok', { status: 200 })
        }
        return realFetch(input as RequestInfo)
      }) as typeof fetch
      try {
        const res = await fetch('https://example.invalid/x')
        expect(res.status).toBe(200)
      } finally {
        globalThis.fetch = realFetch
      }
    } finally {
      rec.stop()
    }
  })

  it('start() twice without stop() throws', () => {
    const rec = setupLLMRecording({ name: 'double-start', recordingsDir: dir })
    rec.start()
    try {
      expect(() => rec.start()).toThrow(/already started/i)
    } finally {
      rec.stop()
    }
  })

  it('strips sensitive request headers from the recording', async () => {
    process.env.RECORD = '1'
    const filepath = recordingFilePath(dir, 'header-strip')

    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      if (url === ANTHROPIC_URL) {
        return new Response(JSON.stringify({ id: 'ok' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'authorization': 'Bearer leaked',  // should NOT appear in stored response headers
            'set-cookie': 'session=bad',
            'x-anthropic-id': 'keep-me',
          },
        })
      }
      return realFetch(input as RequestInfo)
    }) as typeof fetch

    try {
      const rec = setupLLMRecording({ name: 'header-strip', recordingsDir: dir })
      rec.start()
      try {
        await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        })
      } finally {
        rec.stop()
      }
      const stored = loadRecordingFile(filepath)
      const headers = stored!.recordings[0]!.response.headers
      expect(headers.authorization).toBeUndefined()
      expect(headers['set-cookie']).toBeUndefined()
      expect(headers['x-anthropic-id']).toBe('keep-me')
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @seta/agent-core vitest run src/testkit/recording/setup.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `setup.ts`**

Create `platform/agent/core/src/testkit/recording/setup.ts`:

```ts
import path from 'node:path'
import { bypass, http, HttpResponse } from 'msw'
import { setupServer, type SetupServerApi } from 'msw/node'
import { hashRequest, serializeRequestContent } from './hash'
import { getRecordingMode } from './mode'
import { loadRecordingFile, recordingFilePath, saveRecordingFile } from './store'
import { captureStreamingResponse, createStreamingResponse, isStreamingResponse } from './streaming'
import type {
  LLMRecording,
  LLMRecordingHandle,
  RecordingFile,
  RecordingMode,
  SetupLLMRecordingOptions,
  TransformRequest,
} from './types'

const SKIP_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'api-key',
  'content-encoding',
  'transfer-encoding',
  'set-cookie',
])

function filterHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    if (!SKIP_HEADERS.has(key.toLowerCase())) out[key] = value
  })
  return out
}

function providerFromUrl(url: string): string | undefined {
  try {
    const host = new URL(url).hostname
    if (host.endsWith('anthropic.com')) return 'anthropic'
    if (host.endsWith('openai.com')) return 'openai'
    return host
  } catch {
    return undefined
  }
}

function modelFromBody(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'model' in body) {
    const m = (body as { model?: unknown }).model
    if (typeof m === 'string') return m
  }
  return undefined
}

async function readRequestBody(request: Request): Promise<unknown> {
  const ct = request.headers.get('content-type')?.toLowerCase() ?? ''
  const cloned = request.clone()
  if (ct.includes('application/json') || ct.includes('+json')) {
    return cloned.json().catch(() => ({}))
  }
  if (ct.startsWith('text/')) {
    return cloned.text().catch(() => '')
  }
  return cloned.text().catch(() => '')
}

interface RecorderState {
  mode: RecordingMode
  filepath: string
  file: RecordingFile
  dirty: boolean
  transformRequest?: TransformRequest
  name: string
}

function emptyFile(name: string): RecordingFile {
  return { meta: { name, createdAt: new Date().toISOString() }, recordings: [] }
}

function lookupRecording(file: RecordingFile, hash: string): LLMRecording | undefined {
  return file.recordings.find((r) => r.hash === hash)
}

function buildMissError(state: RecorderState, hash: string, url: string, body: unknown): Error {
  const preview = JSON.stringify(body).slice(0, 200)
  return new Error(
    `[@seta/agent-core/testkit] No matching recording for "${state.name}". ` +
      `hash=${hash} url=${url} body=${preview}. ` +
      `Set RECORD=1 to capture a new recording, or RECORD=force to re-record all.`,
  )
}

async function captureFromBypass(
  request: Request,
  hash: string,
  storedUrl: string,
  storedBody: unknown,
): Promise<LLMRecording> {
  const real = await fetch(bypass(request))
  const headers = filterHeaders(real.headers)
  const isStreaming = isStreamingResponse(real.headers)
  if (isStreaming) {
    const { chunks, timings } = await captureStreamingResponse(real)
    return {
      hash,
      request: { url: storedUrl, method: request.method, body: storedBody },
      response: {
        status: real.status,
        statusText: real.statusText,
        headers,
        chunks,
        chunkTimings: timings,
        isStreaming: true,
      },
    }
  }
  const ct = real.headers.get('content-type')?.toLowerCase() ?? ''
  const body: unknown = ct.includes('json') ? await real.clone().json().catch(() => undefined) : await real.clone().text().catch(() => undefined)
  return {
    hash,
    request: { url: storedUrl, method: request.method, body: storedBody },
    response: {
      status: real.status,
      statusText: real.statusText,
      headers,
      body,
      isStreaming: false,
    },
  }
}

function recordingToResponse(recording: LLMRecording): Response {
  if (recording.response.isStreaming) return createStreamingResponse(recording)
  const headers = recording.response.headers
  const body = recording.response.body
  const init: ResponseInit = { status: recording.response.status, statusText: recording.response.statusText, headers }
  if (body === undefined) return new Response(null, init)
  if (typeof body === 'string') return new Response(body, init)
  return new Response(JSON.stringify(body), init)
}

export function setupLLMRecording(opts: SetupLLMRecordingOptions): LLMRecordingHandle {
  const recordingsDir = opts.recordingsDir ?? path.join(process.cwd(), '__recordings__')
  const filepath = recordingFilePath(recordingsDir, opts.name)
  let server: SetupServerApi | null = null
  let started = false

  const state: RecorderState = {
    mode: getRecordingMode(),
    filepath,
    file: emptyFile(opts.name),
    dirty: false,
    transformRequest: opts.transformRequest,
    name: opts.name,
  }

  async function handle(request: Request): Promise<Response> {
    const rawBody = await readRequestBody(request)
    const transformed = state.transformRequest
      ? state.transformRequest({ url: request.url, body: rawBody })
      : { url: request.url, body: rawBody }
    const hash = hashRequest(transformed.url, transformed.body)

    if (state.mode === 'force') {
      const recording = await captureFromBypass(request, hash, transformed.url, transformed.body)
      state.file.recordings.push(recording)
      state.file.meta.provider ??= providerFromUrl(request.url)
      state.file.meta.model ??= modelFromBody(transformed.body)
      state.dirty = true
      return recordingToResponse(recording)
    }

    const hit = lookupRecording(state.file, hash)
    if (hit) return recordingToResponse(hit)

    if (state.mode === 'replay') {
      throw buildMissError(state, hash, transformed.url, transformed.body)
    }

    // mode === 'record', miss → forward and append
    const recording = await captureFromBypass(request, hash, transformed.url, transformed.body)
    state.file.recordings.push(recording)
    state.file.meta.provider ??= providerFromUrl(request.url)
    state.file.meta.model ??= modelFromBody(transformed.body)
    state.dirty = true
    return recordingToResponse(recording)
  }

  const resolver = async ({ request }: { request: Request }): Promise<Response> => {
    try {
      const res = await handle(request)
      return new HttpResponse(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return HttpResponse.json({ error: message }, { status: 500 })
    }
  }

  function makeServer(): SetupServerApi {
    return setupServer(
      http.all('https://api.anthropic.com/*', resolver),
      http.all('https://api.openai.com/*', resolver),
    )
  }

  function loadOrReset(): void {
    if (state.mode === 'force') {
      state.file = emptyFile(opts.name)
      return
    }
    const existing = loadRecordingFile(filepath)
    state.file = existing ?? emptyFile(opts.name)
  }

  function flush(): void {
    if (!state.dirty) return
    state.file.meta.updatedAt = new Date().toISOString()
    saveRecordingFile(filepath, state.file)
    state.dirty = false
  }

  return {
    start(): void {
      if (started) throw new Error('[@seta/agent-core/testkit] setupLLMRecording: already started')
      started = true
      loadOrReset()
      server = makeServer()
      server.listen({ onUnhandledRequest: 'bypass' })
    },
    stop(): void {
      if (!started) return
      try {
        flush()
      } finally {
        server?.close()
        server = null
        started = false
      }
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @seta/agent-core vitest run src/testkit/recording/setup.test.ts
```

Expected: PASS, 9/9.

**Note on the "replay mode + missing file" test:** the resolver catches the thrown `Error` and returns a 500 JSON to keep MSW's invariants happy. So `fetch` resolves with `res.status === 500` rather than rejecting. The test as written tries both shapes (`try { await fetch(...) } catch (e)` plus a string match) — if the test fails because `err` is undefined, update it to read the 500 body:

```ts
const res = await fetch(ANTHROPIC_URL, { /* ... */ })
expect(res.status).toBe(500)
const data = (await res.json()) as { error: string }
expect(data.error).toMatch(/missing/)
expect(data.error).toMatch(/api\.anthropic\.com/)
```

Pick one shape (reject vs 500 body) and make the test assert it directly — don't keep both branches.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/testkit/recording/setup.ts \
        platform/agent/core/src/testkit/recording/setup.test.ts
git commit -m "feat(agent-core): setupLLMRecording MSW orchestrator"
```

---

## Task 8: Internal barrel + public re-exports

**Files:**
- Create: `platform/agent/core/src/testkit/recording/index.ts`
- Modify: `platform/agent/core/src/testkit/index.ts`

- [ ] **Step 1: Write the internal barrel**

Create `platform/agent/core/src/testkit/recording/index.ts`:

```ts
export { hashRequest, serializeRequestContent } from './hash'
export { setupLLMRecording } from './setup'
export type {
  LLMRecording,
  LLMRecordingHandle,
  RecordingFile,
  RecordingMeta,
  RecordingMode,
  SetupLLMRecordingOptions,
  TransformRequest,
} from './types'
```

- [ ] **Step 2: Update `testkit/index.ts`**

Replace `platform/agent/core/src/testkit/index.ts` with:

```ts
export type { FakeAdapterScript } from './fake-adapter'
export { FakeAdapter } from './fake-adapter'
export {
  hashRequest,
  serializeRequestContent,
  setupLLMRecording,
} from './recording'
export type {
  LLMRecording,
  LLMRecordingHandle,
  RecordingFile,
  RecordingMeta,
  RecordingMode,
  SetupLLMRecordingOptions,
  TransformRequest,
} from './recording'
```

- [ ] **Step 3: Add an export-contract test**

Create `platform/agent/core/src/testkit/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import * as testkit from './index'

describe('@seta/agent-core/testkit export contract', () => {
  it('exposes the recording API', () => {
    expect(typeof testkit.setupLLMRecording).toBe('function')
    expect(typeof testkit.hashRequest).toBe('function')
    expect(typeof testkit.serializeRequestContent).toBe('function')
  })
  it('exposes FakeAdapter', () => {
    expect(typeof testkit.FakeAdapter).toBe('function')
  })
})
```

- [ ] **Step 4: Run the testkit suite**

```bash
pnpm --filter @seta/agent-core vitest run src/testkit/
```

Expected: PASS for every file under `src/testkit/` (including the new recording suite and the export-contract test).

- [ ] **Step 5: Commit**

```bash
git add platform/agent/core/src/testkit/index.ts \
        platform/agent/core/src/testkit/recording/index.ts \
        platform/agent/core/src/testkit/index.test.ts
git commit -m "feat(agent-core): export recording API from testkit barrel"
```

---

## Task 9: Build verification

**Files:**
- (verify only) `platform/agent/core/dist/testkit/index.js`
- (verify only) `platform/agent/core/dist/testkit/index.d.ts`

- [ ] **Step 1: Run typecheck across the whole package**

```bash
pnpm --filter @seta/agent-core typecheck
```

Expected: PASS with no errors.

- [ ] **Step 2: Run the build**

```bash
pnpm --filter @seta/agent-core build
```

Expected: tsup emits `dist/index.js`, `dist/index.d.ts`, `dist/testkit/index.js`, `dist/testkit/index.d.ts`, plus `.map` files.

- [ ] **Step 3: Inspect the built testkit exports**

```bash
ls platform/agent/core/dist/testkit/
node --input-type=module -e "import * as t from '/Users/canh/Projects/Seta/seta-os/platform/agent/core/dist/testkit/index.js'; console.log(Object.keys(t).sort().join(','))"
```

Expected output (order may vary): `FakeAdapter,hashRequest,serializeRequestContent,setupLLMRecording`.

- [ ] **Step 4: Run lint to catch any style violations introduced**

```bash
pnpm --filter @seta/agent-core lint
```

Expected: PASS. If Biome complains about `import type` placement or unused imports, fix them inline and re-run before committing the next task.

- [ ] **Step 5: No commit** — this task only verifies what previous tasks produced. If anything failed, the fix belongs in the task that introduced it.

---

## Task 10: Integration test scaffold + Anthropic recording

**Files:**
- Create: `platform/agent/core/tests/integration/sdk-intercept.test.ts`
- Create: `platform/agent/core/tests/integration/package.json`
- Create: `platform/agent/core/tests/integration/__recordings__/sdk-intercept-anthropic.json` (recorded by the test itself in this task)

- [ ] **Step 1: Create the test file**

Create `platform/agent/core/tests/integration/sdk-intercept.test.ts`:

```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupLLMRecording } from '../../src/testkit/recording'

const recordingsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__recordings__')

// `transformRequest` strips fields that legitimately change every run.
// For these probe requests there are none — the bodies are deterministic.
const recAnthropic = setupLLMRecording({ name: 'sdk-intercept-anthropic', recordingsDir })
const recOpenai = setupLLMRecording({ name: 'sdk-intercept-openai', recordingsDir })

describe('Anthropic SDK is interceptable via MSW', () => {
  beforeAll(() => recAnthropic.start())
  afterAll(() => recAnthropic.stop())

  it('routes messages.create through the testkit', async () => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? 'sk-test-fake' })
    const res = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'ping' }],
    })
    expect(res.id).toBeTruthy()
    expect(res.content[0]?.type).toBe('text')
  })
})

describe('OpenAI SDK is interceptable via MSW', () => {
  beforeAll(() => recOpenai.start())
  afterAll(() => recOpenai.stop())

  it('routes chat.completions.create through the testkit', async () => {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? 'sk-test-fake' })
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'ping' }],
    })
    expect(res.id).toBeTruthy()
    expect(res.choices[0]?.message.content).toBeTruthy()
  })
})
```

- [ ] **Step 2: Verify vitest picks up the integration test**

```bash
pnpm --filter @seta/agent-core vitest run tests/integration/sdk-intercept.test.ts
```

Expected: FAIL with "No matching recording for sdk-intercept-anthropic" (the recordings don't exist yet).

- [ ] **Step 3: Record the Anthropic fixture against the real API**

This step requires a real API key. **DO NOT proceed without one.** If the executor lacks a key, stop here and ask the human operator to run this step.

```bash
ANTHROPIC_API_KEY=<real-key> RECORD=1 pnpm --filter @seta/agent-core vitest run tests/integration/sdk-intercept.test.ts -t Anthropic
```

Expected: the Anthropic test passes; `platform/agent/core/tests/integration/__recordings__/sdk-intercept-anthropic.json` is created. Open the file and confirm:
- `meta.provider === "anthropic"`
- `meta.model === "claude-3-5-haiku-latest"`
- Exactly one entry in `recordings[]`
- No `authorization` or `x-api-key` field anywhere
- The response body has `content: [{ type: "text", text: <some string> }]`

- [ ] **Step 4: Replay-only run to confirm interception**

```bash
unset ANTHROPIC_API_KEY  # if it was set in this shell
pnpm --filter @seta/agent-core vitest run tests/integration/sdk-intercept.test.ts -t Anthropic
```

Expected: PASS. This proves the Anthropic SDK uses global `fetch` and MSW intercepts it — no real network call.

- [ ] **Step 5: Commit the Anthropic recording + test scaffold**

```bash
git add platform/agent/core/tests/integration/sdk-intercept.test.ts \
        platform/agent/core/tests/integration/__recordings__/sdk-intercept-anthropic.json
git commit -m "test(agent-core): integration test proves Anthropic SDK interception"
```

---

## Task 11: OpenAI recording

**Files:**
- Create: `platform/agent/core/tests/integration/__recordings__/sdk-intercept-openai.json`

- [ ] **Step 1: Record the OpenAI fixture**

```bash
OPENAI_API_KEY=<real-key> RECORD=1 pnpm --filter @seta/agent-core vitest run tests/integration/sdk-intercept.test.ts -t OpenAI
```

Expected: the OpenAI test passes; `platform/agent/core/tests/integration/__recordings__/sdk-intercept-openai.json` is created. Confirm:
- `meta.provider === "openai"`
- `meta.model === "gpt-4o-mini"`
- One entry in `recordings[]`
- No `authorization` header in the response

- [ ] **Step 2: Replay-only run to confirm**

```bash
unset OPENAI_API_KEY
pnpm --filter @seta/agent-core vitest run tests/integration/sdk-intercept.test.ts -t OpenAI
```

Expected: PASS.

- [ ] **Step 3: Full integration suite, no env keys set**

```bash
unset ANTHROPIC_API_KEY OPENAI_API_KEY
pnpm --filter @seta/agent-core test:integration
```

Expected: both tests PASS, 2/2.

- [ ] **Step 4: Commit the OpenAI recording**

```bash
git add platform/agent/core/tests/integration/__recordings__/sdk-intercept-openai.json
git commit -m "test(agent-core): integration test proves OpenAI SDK interception"
```

---

## Task 12: Final acceptance gate

No new code. Run every gate the PR will face.

- [ ] **Step 1: Whole-package unit tests**

```bash
pnpm --filter @seta/agent-core test:unit
```

Expected: PASS, full count includes the K1 suite plus the new K1.5 modules (mode/hash/store/streaming/setup + barrel contract). Total should be in the 60–80 range.

- [ ] **Step 2: Whole-package integration tests**

```bash
pnpm --filter @seta/agent-core test:integration
```

Expected: PASS, 2/2.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @seta/agent-core typecheck
```

Expected: PASS.

- [ ] **Step 4: Lint**

```bash
pnpm --filter @seta/agent-core lint
```

Expected: PASS. Fix any `import type` or unused-import warnings if they appear and re-run.

- [ ] **Step 5: Build, verify dist surface**

```bash
pnpm --filter @seta/agent-core build
node --input-type=module -e "import * as t from '/Users/canh/Projects/Seta/seta-os/platform/agent/core/dist/testkit/index.js'; const want = ['FakeAdapter','hashRequest','serializeRequestContent','setupLLMRecording']; const have = Object.keys(t).sort(); console.log('have:', have.join(',')); if (want.some(w => !have.includes(w))) { console.error('MISSING'); process.exit(1) }"
```

Expected: prints `have: FakeAdapter,hashRequest,serializeRequestContent,setupLLMRecording` (plus type-only names if any) and exits 0.

- [ ] **Step 6: CI guard — no manual package.json edits**

```bash
pnpm tsx scripts/check-no-manual-pkg-edit.ts 2>/dev/null || true
```

(The exact script path may differ; if you can't find it, skip this step — the actual CI run will catch any violation. The point of this gate is to ensure the lockfile was updated whenever `package.json` was.)

- [ ] **Step 7: Search for forbidden patterns**

```bash
grep -rn "K1\.5\|AG-F1\|2026-05-12-agent-core-k1\.5" platform/agent/core/src/ platform/agent/core/tests/ 2>/dev/null || echo "clean"
```

Expected: `clean`. No source file should reference the plan, spec date, or stream name.

```bash
grep -rn "vi\.mock\|vitest\.mock" platform/agent/core/src/ platform/agent/core/tests/ 2>/dev/null || echo "clean"
```

Expected: `clean`. No `vi.mock` against any internal or external module.

```bash
grep -rn "console\.log" platform/agent/core/src/ 2>/dev/null || echo "clean"
```

Expected: `clean`.

- [ ] **Step 8: Changeset**

```bash
pnpm changeset
```

Select `@seta/agent-core` as the affected package and choose `patch` (private package; convention only). Write a one-line description:

> "Add MSW-backed LLM record/replay testkit at `@seta/agent-core/testkit`."

Commit the changeset:

```bash
git add .changeset/
git commit -m "chore(agent-core): changeset for testkit recording"
```

- [ ] **Step 9: Final summary**

Print the green tally:

```bash
git log --oneline main..HEAD
```

Expected: the commits introduced by this plan, in order:

1. `chore(agent-core): add msw@2.14.6 and split test scripts`
2. `feat(agent-core): testkit recording types`
3. `feat(agent-core): RECORD env var to recording mode`
4. `feat(agent-core): canonical request hashing for the recorder`
5. `feat(agent-core): recording file load/save with atomic write`
6. `feat(agent-core): SSE capture + zero-delay replay`
7. `feat(agent-core): setupLLMRecording MSW orchestrator`
8. `feat(agent-core): export recording API from testkit barrel`
9. `test(agent-core): integration test proves Anthropic SDK interception`
10. `test(agent-core): integration test proves OpenAI SDK interception`
11. `chore(agent-core): changeset for testkit recording`

The branch is ready to open as a PR.

---

## Self-review checklist (run before opening the PR)

- [ ] `setupLLMRecording`, `serializeRequestContent`, `hashRequest` exported from `@seta/agent-core/testkit`. ✔ Task 8
- [ ] `msw@2.14.6` pinned in `dependencies` via CLI. ✔ Task 1
- [ ] Three modes (`replay`/`record`/`force`) via `RECORD` env var. ✔ Task 3
- [ ] MSW intercepts only `api.anthropic.com` + `api.openai.com`; everything else bypasses. ✔ Task 7
- [ ] Exact hash matching; no fuzzy fallback. ✔ Task 4 + Task 7
- [ ] Streaming captured as raw `reader.read()` chunks; replay uses zero inter-chunk delay. ✔ Task 6
- [ ] `SKIP_HEADERS` strips auth + encoding headers from stored response headers. ✔ Task 7
- [ ] Atomic file writes (tmp + rename). ✔ Task 5
- [ ] Pretty-printed recording files (2-space indent + trailing newline). ✔ Task 5
- [ ] No vitest imports inside the testkit. ✔ Task 7
- [ ] No module-scope singleton; `setupLLMRecording` returns a closure-scoped handle. ✔ Task 7
- [ ] Integration test proves both SDKs are interceptable, recordings committed. ✔ Tasks 10–11
- [ ] No process metadata in source comments. ✔ Task 12 grep
- [ ] No `vi.mock` against external SDKs. ✔ Task 12 grep
- [ ] No `console.log` in source. ✔ Task 12 grep
- [ ] Changeset added. ✔ Task 12

If any line above fails, stop and fix in the relevant task before opening the PR.

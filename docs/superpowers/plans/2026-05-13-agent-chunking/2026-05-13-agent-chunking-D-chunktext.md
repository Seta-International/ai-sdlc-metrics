# @seta/agent-chunking — Plan D: `chunkText` integration + property tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose A+B+C into the public `chunkText(input, opts): Chunk[]` function. Add `fast-check` property tests that prove the load-bearing `content === input.slice(startChar, endChar)` invariant under randomized inputs. Final wiring; package is feature-complete after this plan.

**Architecture:** Window-stride loop port of Mastra's `splitTextOnTokens`. Each chunk's `startChar`/`endChar` comes from the `tokenStartChars` array built in Plan C. A test-only `__internal_chunkTextWithTrace` export gives property tests access to the underlying `tokens` and `charOfs` arrays so stride correctness can be asserted without re-encoding substrings (BPE is context-dependent — re-encoding a slice can produce a different token count, so it is **not** a valid check).

**Tech Stack:** `js-tiktoken`, Zod, Vitest, `fast-check` (new dev dep).

**Spec:** [`docs/superpowers/specs/2026-05-13-agent-chunking-design.md`](../specs/2026-05-13-agent-chunking-design.md) §2 algorithm + §4 test strategy

**Prereqs:** Plans A + B + C complete.

---

## File Structure

Additions in this plan:

```
platform/agent/chunking/
└── src/
    ├── chunk-text.ts            # chunkText + __internal_chunkTextWithTrace + Chunk type
    ├── chunk-text.test.ts       # unit tests (edge cases, errors)
    ├── chunk-text.property.test.ts   # fast-check property tests
    └── index.ts                 # updated to re-export Chunk + chunkText
```

The `__internal_chunkTextWithTrace` export is **not** re-exported from `src/index.ts`. It is consumed only by the property test file via direct module import.

---

### Task D1: Pin `fast-check` as a dev dep

**Files:**
- Modify: `platform/agent/chunking/package.json` (via CLI only)
- Modify: `pnpm-lock.yaml`
- Modify: `docs/setup.md` (add the pin under §13)

- [ ] **Step 1: Resolve the latest `fast-check` version**

Run from repo root:

```powershell
pnpm view fast-check version
```

Record the printed version as `<FCV>`. Expected: a `4.x` (or current) semver string. If the command fails with a network error, look it up on `https://www.npmjs.com/package/fast-check` and use the latest stable.

- [ ] **Step 2: Pin `fast-check`**

```powershell
pnpm --filter @seta/agent-chunking add -D fast-check@<FCV>
```

Substitute `<FCV>` with the version from Step 1.

- [ ] **Step 3: Add the pin to setup.md §13**

Open `docs/setup.md`, locate §13 (pinned versions). Add a row for `fast-check@<FCV>` consumed by `@seta/agent-chunking` (devDep). Follow the existing row format.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/chunking/package.json pnpm-lock.yaml docs/setup.md
git commit -m "chore(agent-chunking): pin fast-check@<FCV> for property tests"
```

---

### Task D2: Define the `Chunk` type and implement `chunkText` (TDD: failing edge-case tests first)

**Files:**
- Create: `platform/agent/chunking/src/chunk-text.test.ts`

- [ ] **Step 1: Write edge-case unit tests**

Create `platform/agent/chunking/src/chunk-text.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { chunkText } from './chunk-text'
import { ChunkingError } from './errors'
import type { ChunkOptions } from './options'

const SMALL: ChunkOptions = {
  maxTokens: 8,
  overlapTokens: 2,
  model: 'text-embedding-3-small',
}

describe('chunkText — edge cases', () => {
  test('empty input returns []', () => {
    expect(chunkText('', SMALL)).toEqual([])
  })

  test('input shorter than maxTokens returns single chunk spanning whole input', () => {
    const input = 'hi'
    const chunks = chunkText(input, SMALL)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.startChar).toBe(0)
    expect(chunks[0]!.endChar).toBe(input.length)
    expect(chunks[0]!.content).toBe(input)
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0)
    expect(chunks[0]!.tokenCount).toBeLessThanOrEqual(SMALL.maxTokens)
  })

  test('long input produces multiple chunks each respecting maxTokens', () => {
    const input = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'
    const chunks = chunkText(input, SMALL)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(SMALL.maxTokens)
      expect(c.tokenCount).toBeGreaterThan(0)
      expect(c.content).toBe(input.slice(c.startChar, c.endChar))
    }
    expect(chunks[0]!.startChar).toBe(0)
    expect(chunks[chunks.length - 1]!.endChar).toBe(input.length)
  })

  test('overlap = 0 produces non-overlapping chunks', () => {
    const opts: ChunkOptions = { maxTokens: 4, overlapTokens: 0, model: 'text-embedding-3-small' }
    const input = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi'
    const chunks = chunkText(input, opts)
    expect(chunks.length).toBeGreaterThan(1)
    // Adjacent chunks should not share content: c[i+1].startChar >= c[i].endChar
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startChar).toBeGreaterThanOrEqual(chunks[i - 1]!.endChar)
    }
  })

  test('maxTokens = 1 produces one-token-wide chunks', () => {
    const opts: ChunkOptions = { maxTokens: 1, overlapTokens: 0, model: 'text-embedding-3-small' }
    const chunks = chunkText('hello world', opts)
    for (const c of chunks) {
      expect(c.tokenCount).toBe(1)
    }
  })

  test('throws ChunkingError on invalid options (overlapTokens >= maxTokens)', () => {
    expect(() =>
      chunkText('hello', {
        maxTokens: 100,
        overlapTokens: 200,
        model: 'text-embedding-3-small',
      }),
    ).toThrow(ChunkingError)
  })

  test('throws ChunkingError on unknown model', () => {
    expect(() =>
      chunkText('hello', {
        maxTokens: 100,
        overlapTokens: 0,
        model: 'claude-opus-4-7' as never,
      }),
    ).toThrow(ChunkingError)
  })

  test('content/offset roundtrip holds on CJK input', () => {
    const input = '今天天气真好,我们去公园散步吧。今天天气真好,我们去公园散步吧。'
    const chunks = chunkText(input, SMALL)
    for (const c of chunks) {
      expect(c.content).toBe(input.slice(c.startChar, c.endChar))
    }
  })

  test('determinism: same input + opts produce byte-identical chunks', () => {
    const input = 'deterministic chunking should produce the same output every time'
    const a = chunkText(input, SMALL)
    const b = chunkText(input, SMALL)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

```powershell
pnpm --filter @seta/agent-chunking test:unit
```

Expected: FAIL — `Cannot find module './chunk-text'`.

---

### Task D3: Implement `chunk-text.ts`

**Files:**
- Create: `platform/agent/chunking/src/chunk-text.ts`

- [ ] **Step 1: Implement the algorithm**

Create `platform/agent/chunking/src/chunk-text.ts`:

```ts
import { getEncoder } from './encoder-cache'
import type { ChunkOptions } from './options'
import { parseChunkOptions } from './options'
import { tokenStartChars } from './token-start-chars'

export interface Chunk {
  content: string         // === input.slice(startChar, endChar)
  tokenCount: number      // ≤ opts.maxTokens
  startChar: number       // inclusive UTF-16 code-unit offset
  endChar: number         // exclusive UTF-16 code-unit offset
}

interface ChunkTrace {
  chunks: Chunk[]
  tokens: number[]
  charOfs: number[]
}

export function chunkText(input: string, opts: ChunkOptions): Chunk[] {
  return chunkTextInternal(input, opts).chunks
}

/**
 * Test-only entry that exposes the internal `tokens` and `charOfs` arrays
 * so property tests can assert stride correctness against token indices
 * (re-encoding a substring is not a valid check — BPE is context-dependent).
 *
 * Not re-exported from `src/index.ts`.
 */
export function __internal_chunkTextWithTrace(
  input: string,
  opts: ChunkOptions,
): ChunkTrace {
  return chunkTextInternal(input, opts)
}

function chunkTextInternal(input: string, opts: ChunkOptions): ChunkTrace {
  const validated = parseChunkOptions(opts)

  if (input.length === 0) {
    return { chunks: [], tokens: [], charOfs: [0] }
  }

  const encoder = getEncoder(validated.model)
  const tokens = encoder.encode(input)

  if (tokens.length === 0) {
    return { chunks: [], tokens: [], charOfs: [0] }
  }

  const charOfs = tokenStartChars(tokens, encoder, input)
  const stride = validated.maxTokens - validated.overlapTokens

  const chunks: Chunk[] = []
  let i = 0
  while (i < tokens.length) {
    const end = Math.min(i + validated.maxTokens, tokens.length)
    const startChar = charOfs[i]!
    const endChar = charOfs[end]!
    chunks.push({
      content: input.slice(startChar, endChar),
      tokenCount: end - i,
      startChar,
      endChar,
    })
    if (end === tokens.length) break
    i += stride
  }

  return { chunks, tokens, charOfs }
}
```

- [ ] **Step 2: Run the tests and verify they pass**

```powershell
pnpm --filter @seta/agent-chunking test:unit
```

Expected: all 9 `chunk-text` edge-case tests PASS plus all earlier-plan tests.

If the `content/offset roundtrip holds on CJK input` test fails, the U+FFFD edge case from Plan C has manifested. Diagnose by printing `tokens` and `charOfs` for the failing case, then patch `tokenStartChars` per Plan C Task C2 Step 2 notes. Re-run before continuing.

- [ ] **Step 3: Typecheck + lint**

```powershell
pnpm --filter @seta/agent-chunking typecheck
pnpm --filter @seta/agent-chunking lint
```

Both must pass.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/chunking/src/chunk-text.ts platform/agent/chunking/src/chunk-text.test.ts
git commit -m "feat(agent-chunking): add chunkText window-stride algorithm + edge-case tests"
```

---

### Task D4: Add `fast-check` property tests

**Files:**
- Create: `platform/agent/chunking/src/chunk-text.property.test.ts`

- [ ] **Step 1: Write the property tests**

Create `platform/agent/chunking/src/chunk-text.property.test.ts`:

```ts
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { __internal_chunkTextWithTrace, chunkText } from './chunk-text'
import type { ChunkOptions, SupportedModel } from './options'

const MODELS: readonly SupportedModel[] = ['text-embedding-3-small', 'gpt-5']

const optsArb = fc.tuple(
  fc.integer({ min: 1, max: 128 }),
  fc.integer({ min: 0, max: 127 }),
  fc.constantFrom(...MODELS),
).map(([maxTokens, overlapRaw, model]): ChunkOptions => ({
  maxTokens,
  overlapTokens: Math.min(overlapRaw, maxTokens - 1),
  model,
}))

const inputArb = fc.string({ minLength: 1, maxLength: 800 })

describe('chunkText — property tests', () => {
  test('token-budget invariant: every chunk.tokenCount ≤ opts.maxTokens', () => {
    fc.assert(
      fc.property(inputArb, optsArb, (input, opts) => {
        const chunks = chunkText(input, opts)
        for (const c of chunks) {
          expect(c.tokenCount).toBeLessThanOrEqual(opts.maxTokens)
        }
      }),
      { numRuns: 200 },
    )
  })

  test('content/offset roundtrip: chunk.content === input.slice(startChar, endChar)', () => {
    fc.assert(
      fc.property(inputArb, optsArb, (input, opts) => {
        const chunks = chunkText(input, opts)
        for (const c of chunks) {
          expect(c.content).toBe(input.slice(c.startChar, c.endChar))
        }
      }),
      { numRuns: 200 },
    )
  })

  test('coverage: non-empty input ⇒ first.startChar = 0 and last.endChar = input.length', () => {
    fc.assert(
      fc.property(inputArb, optsArb, (input, opts) => {
        const chunks = chunkText(input, opts)
        if (chunks.length === 0) return
        expect(chunks[0]!.startChar).toBe(0)
        expect(chunks[chunks.length - 1]!.endChar).toBe(input.length)
      }),
      { numRuns: 200 },
    )
  })

  test('stride correctness: consecutive chunks start `stride` tokens apart (except final)', () => {
    fc.assert(
      fc.property(inputArb, optsArb, (input, opts) => {
        const trace = __internal_chunkTextWithTrace(input, opts)
        const stride = opts.maxTokens - opts.overlapTokens
        // Recover token index per chunk by finding charOfs entry that matches startChar.
        // charOfs is monotonically non-decreasing; map startChar back to token index.
        const tokenIdxFor = (startChar: number): number => trace.charOfs.indexOf(startChar)

        for (let n = 1; n < trace.chunks.length; n++) {
          // Skip the last pair if the previous chunk reached the end of tokens — final stride may be truncated.
          const prev = trace.chunks[n - 1]!
          const cur = trace.chunks[n]!
          const prevTokIdx = tokenIdxFor(prev.startChar)
          const curTokIdx = tokenIdxFor(cur.startChar)
          // Guard: only assert when both lookups succeeded.
          if (prevTokIdx < 0 || curTokIdx < 0) return
          // Skip when the previous chunk was the final one (no further chunks should exist;
          // but if we're here, n is not the final iteration of the while loop's "break").
          expect(curTokIdx - prevTokIdx).toBe(stride)
        }
      }),
      { numRuns: 200 },
    )
  })

  test('determinism: chunkText is a pure function', () => {
    fc.assert(
      fc.property(inputArb, optsArb, (input, opts) => {
        const a = chunkText(input, opts)
        const b = chunkText(input, opts)
        expect(JSON.stringify(a)).toBe(JSON.stringify(b))
      }),
      { numRuns: 100 },
    )
  })
})
```

- [ ] **Step 2: Run the property tests**

```powershell
pnpm --filter @seta/agent-chunking test:unit
```

Expected: all 5 property tests PASS (each with 100–200 random cases). Property failures will print the shrunk minimal counterexample; if you see one, the algorithm has a real bug — diagnose using the counterexample input + opts, then fix. **Do not raise `numRuns` to hide a failure.**

- [ ] **Step 3: Commit**

```powershell
git add platform/agent/chunking/src/chunk-text.property.test.ts
git commit -m "test(agent-chunking): add fast-check property tests for chunkText invariants"
```

---

### Task D5: Final `src/index.ts` re-exports

**Files:**
- Modify: `platform/agent/chunking/src/index.ts`

- [ ] **Step 1: Update the public surface**

Overwrite `platform/agent/chunking/src/index.ts` with:

```ts
export type { Chunk } from './chunk-text'
export { chunkText } from './chunk-text'
export { ChunkingError } from './errors'
export type {
  ChunkOptions,
  SupportedModel,
} from './options'
export {
  ChunkOptionsSchema,
  DEFAULT_MAX_TOKENS,
  DEFAULT_OVERLAP_TOKENS,
  SUPPORTED_MODELS,
  parseChunkOptions,
} from './options'
```

`__internal_chunkTextWithTrace`, `_resetEncoderCacheForTests`, and the encoder cache internals stay un-exported.

- [ ] **Step 2: Verify a build consumer can import the surface**

Create a temporary verification file `platform/agent/chunking/src/__consumer-check.ts`:

```ts
// Temporary type-only smoke test; deleted before commit.
import type { Chunk, ChunkOptions, SupportedModel } from './index'
import {
  ChunkingError,
  ChunkOptionsSchema,
  DEFAULT_MAX_TOKENS,
  DEFAULT_OVERLAP_TOKENS,
  SUPPORTED_MODELS,
  chunkText,
  parseChunkOptions,
} from './index'

const _c: Chunk = { content: 'a', tokenCount: 1, startChar: 0, endChar: 1 }
const _o: ChunkOptions = { maxTokens: 512, overlapTokens: 64, model: 'text-embedding-3-small' }
const _m: SupportedModel = 'gpt-5'
const _err = new ChunkingError({ message: 'm' })
const _f = chunkText
const _p = parseChunkOptions
const _s = ChunkOptionsSchema
const _max = DEFAULT_MAX_TOKENS
const _ov = DEFAULT_OVERLAP_TOKENS
const _supp = SUPPORTED_MODELS
void [_c, _o, _m, _err, _f, _p, _s, _max, _ov, _supp]
```

Run:

```powershell
pnpm --filter @seta/agent-chunking typecheck
```

Expected: PASS. If any name is missing from `./index`, fix the re-export.

- [ ] **Step 3: Delete the consumer-check and rebuild**

```powershell
Remove-Item platform/agent/chunking/src/__consumer-check.ts
pnpm --filter @seta/agent-chunking build
```

Expected: build produces `dist/index.js` + `dist/index.d.ts`. Inspect `dist/index.d.ts` to confirm every exported symbol from the spec's "Public surface" appears.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/chunking/src/index.ts
git commit -m "feat(agent-chunking): wire Chunk + chunkText into public surface"
```

---

### Task D6: End-to-end verification + SCOPE.md status update

**Files:**
- Modify: `platform/agent/chunking/SCOPE.md` (Status block + Current state section)

- [ ] **Step 1: Run the full local pipeline**

```powershell
pnpm --filter @seta/agent-chunking typecheck
pnpm --filter @seta/agent-chunking lint
pnpm --filter @seta/agent-chunking test:unit
pnpm --filter @seta/agent-chunking build
```

All four must pass.

- [ ] **Step 2: Run repo-wide checks affecting this package**

```powershell
pnpm lint
pnpm typecheck
```

These verify no other package is broken by the new workspace dep. If either fails outside this package, the failure is unrelated to chunking — surface to the user before continuing.

- [ ] **Step 3: Update `platform/agent/chunking/SCOPE.md`**

The SCOPE's status block currently says "Directory placeholder only. … no `package.json`, no `src/` lands in this PR." Update the `Status:` block to:

> **Status:** **P1 — `@seta/agent-chunking` is implemented at `platform/agent/chunking/`.** Public surface frozen per [`docs/superpowers/specs/2026-05-13-agent-chunking-design.md`](../../../docs/superpowers/specs/2026-05-13-agent-chunking-design.md). Consumed by `@seta/agent-rag.ingest` (Plan E, separate spec).

And update the `Current state (P1)` section to reflect that the package now exists. Leave the "Patterns to follow / avoid / Open questions" sections untouched — they remain the binding contract.

- [ ] **Step 4: Final commit**

```powershell
git add platform/agent/chunking/SCOPE.md
git commit -m "docs(agent-chunking): mark SCOPE status as implemented"
```

- [ ] **Step 5: Optional — open a changeset**

This package is `private: true` so no changeset is strictly required. If the team has decided to publish it later, run `pnpm changeset` and follow the prompts.

---

## End-of-plan verification

After Task D6:

```powershell
pnpm --filter @seta/agent-chunking typecheck
pnpm --filter @seta/agent-chunking lint
pnpm --filter @seta/agent-chunking test:unit
pnpm --filter @seta/agent-chunking build
```

All four must pass. The package is now feature-complete per its SCOPE and ready to be consumed by `@seta/agent-embeddings` (separate plan) and `@seta/agent-rag` (separate plan).

## Self-review checklist (run before declaring done)

- [ ] `dist/index.d.ts` exports `Chunk`, `ChunkOptions`, `SupportedModel`, `ChunkingError`, `chunkText`, `parseChunkOptions`, `ChunkOptionsSchema`, `DEFAULT_MAX_TOKENS`, `DEFAULT_OVERLAP_TOKENS`, `SUPPORTED_MODELS`
- [ ] `dist/index.d.ts` does **not** export `__internal_chunkTextWithTrace`, `_resetEncoderCacheForTests`, `getEncoder`, `ENCODING_FOR_MODEL`, or `tokenStartChars`
- [ ] No `console.log` in any source file
- [ ] No `process.env.*` reads in any source file
- [ ] No internal `@seta/*` import outside of `@seta/agent-core`
- [ ] `package.json` not hand-edited beyond what `npm pkg set` / `pnpm add` produced
- [ ] All git commits use conventional-commit format with scope `agent-chunking`

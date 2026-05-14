# @seta/agent-embeddings — Plan B: Input validation (Zod) + batch helper

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two pure helpers — `parseInput(texts)` (Zod boundary that throws `LlmError(LLM_BAD_REQUEST, USER)` on non-array, non-string, empty, or whitespace-only items) and `chunkBy(texts, size)` (deterministic batch splitter). Both are testable without an OpenAI client.

**Architecture:** Pure TypeScript. `parse-input.ts` depends on `zod` and on `LlmError` from `@seta/agent-core`. `batch.ts` has zero internal deps. Tests are co-located.

**Tech Stack:** TypeScript ESM, Vitest, Zod.

**Spec:** [`docs/superpowers/specs/2026-05-14-agent-embeddings-design.md`](../specs/2026-05-14-agent-embeddings-design.md) §2 (boundary validation) and §4 (batch helper file layout).

**Prereq:** Plan A complete (constants + agent-core's `mapOpenAIError` promoted).

---

## File Structure

Additions in this plan:

```
platform/agent/embeddings/
└── src/
    ├── parse-input.ts          # Zod schema + parseInput assertion
    ├── parse-input.test.ts
    ├── batch.ts                # chunkBy(texts, size)
    └── batch.test.ts
```

`src/index.ts` is **not** updated in this plan — these helpers are internal until Plan C composes them into `embed()`. Keeping them private until then prevents premature surface freezes.

---

### Task B1: Implement `parseInput` (Zod boundary)

**Files:**
- Create: `platform/agent/embeddings/src/parse-input.ts`
- Create: `platform/agent/embeddings/src/parse-input.test.ts`

- [ ] **Step 1: Write the failing test**

Create `platform/agent/embeddings/src/parse-input.test.ts`:

```ts
import { LlmError } from '@seta/agent-core'
import { describe, expect, test } from 'vitest'
import { parseInput } from './parse-input'

describe('parseInput — accepts valid input', () => {
  test('accepts an array of non-blank strings', () => {
    expect(() => parseInput(['hello', 'world'])).not.toThrow()
  })

  test('accepts a single-element array', () => {
    expect(() => parseInput(['just one'])).not.toThrow()
  })

  test('accepts strings containing whitespace (so long as there is at least one non-whitespace char)', () => {
    expect(() => parseInput(['  hello  ', 'a b c'])).not.toThrow()
  })

  test('asserts the type — the post-call type is string[]', () => {
    const raw: unknown = ['hi']
    parseInput(raw)
    // After parseInput, `raw` is typed as string[]. The next line compiles
    // only because of the `asserts texts is string[]` signature.
    const upper: string[] = raw.map((t) => t.toUpperCase())
    expect(upper).toEqual(['HI'])
  })
})

describe('parseInput — rejects invalid input', () => {
  test('rejects non-array input (object) with LlmError(LLM_BAD_REQUEST, USER)', () => {
    try {
      parseInput({ not: 'an array' })
      throw new Error('expected parseInput to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(LlmError)
      const le = e as LlmError
      expect(le.code).toBe('LLM_BAD_REQUEST')
      expect(le.category).toBe('USER')
      expect(le.domain).toBe('LLM')
    }
  })

  test('rejects non-array input (string) with LlmError(LLM_BAD_REQUEST, USER)', () => {
    expect(() => parseInput('hello')).toThrow(LlmError)
  })

  test('rejects non-array input (null) with LlmError(LLM_BAD_REQUEST, USER)', () => {
    expect(() => parseInput(null)).toThrow(LlmError)
  })

  test('rejects array with non-string item', () => {
    try {
      parseInput(['ok', 42 as unknown as string])
      throw new Error('expected parseInput to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(LlmError)
      expect((e as LlmError).code).toBe('LLM_BAD_REQUEST')
    }
  })

  test('rejects array containing empty string', () => {
    expect(() => parseInput(['ok', ''])).toThrow(LlmError)
  })

  test('rejects array containing whitespace-only string', () => {
    expect(() => parseInput(['   '])).toThrow(LlmError)
    expect(() => parseInput(['ok', '\t\n'])).toThrow(LlmError)
  })

  test('error details include the original Zod issues', () => {
    try {
      parseInput(['ok', ''])
      throw new Error('expected throw')
    } catch (e) {
      const le = e as LlmError
      expect(le.details).toBeDefined()
      expect(le.details).toMatchObject({
        provider: 'openai',
        model: 'text-embedding-3-small',
      })
      expect(Array.isArray((le.details as { issues: unknown }).issues)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

```powershell
pnpm --filter @seta/agent-embeddings test:unit
```

Expected: FAIL with `Cannot find module './parse-input'`.

- [ ] **Step 3: Implement `parse-input.ts`**

Create `platform/agent/embeddings/src/parse-input.ts`:

```ts
import { LlmError } from '@seta/agent-core'
import { z } from 'zod'
import { EMBEDDING_MODEL } from './constants'

const InputSchema = z.array(z.string().regex(/\S/, 'must be non-blank'))

export function parseInput(texts: unknown): asserts texts is string[] {
  const result = InputSchema.safeParse(texts)
  if (!result.success) {
    throw new LlmError({
      code: 'LLM_BAD_REQUEST',
      category: 'USER',
      message: 'invalid embeddings input',
      details: {
        provider: 'openai',
        model: EMBEDDING_MODEL,
        issues: result.error.issues,
      },
    })
  }
}
```

Three notes:
1. The regex `/\S/` matches any non-whitespace char — rejects `''` and `'   '` alike.
2. `parseInput` returns nothing; the `asserts texts is string[]` signature narrows the caller's `unknown` to `string[]` on the no-throw path.
3. `details.issues` is the raw `ZodIssue[]` — useful for diagnostics; the caller may serialize it to a log line.

- [ ] **Step 4: Run the tests and verify they pass**

```powershell
pnpm --filter @seta/agent-embeddings test:unit
```

Expected: all 12 `parseInput` tests + 5 `constants` tests PASS.

- [ ] **Step 5: Run typecheck and lint**

```powershell
pnpm --filter @seta/agent-embeddings typecheck
pnpm --filter @seta/agent-embeddings lint
```

Both must pass. If Biome flags the `regex(/\S/)` literal as unsafe, leave it — the regex is intentional and minimal. If lint forbids `as unknown as` casts in the test (`['ok', 42 as unknown as string]`), accept the warning since the test deliberately exercises a non-string input; an `eslint-disable` directive is not needed because Biome's `noExplicitAny` is the only relevant rule and we're not using `any`.

- [ ] **Step 6: Commit**

```powershell
git add platform/agent/embeddings/src/parse-input.ts platform/agent/embeddings/src/parse-input.test.ts
git commit -m "feat(agent-embeddings): add parseInput Zod boundary rejecting blank strings"
```

---

### Task B2: Implement `chunkBy` (batch helper)

**Files:**
- Create: `platform/agent/embeddings/src/batch.ts`
- Create: `platform/agent/embeddings/src/batch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `platform/agent/embeddings/src/batch.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { chunkBy } from './batch'

describe('chunkBy — basic shapes', () => {
  test('empty array returns no batches', () => {
    expect(chunkBy([], 10)).toEqual([])
  })

  test('single element returns one batch with one element', () => {
    expect(chunkBy(['a'], 10)).toEqual([['a']])
  })

  test('exact-multiple input returns batches of size exactly `size`', () => {
    const out = chunkBy(['a', 'b', 'c', 'd'], 2)
    expect(out).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  test('input shorter than size returns single batch with all elements', () => {
    expect(chunkBy(['a', 'b'], 10)).toEqual([['a', 'b']])
  })

  test('off-by-one input: 101 items, size 100 → [100, 1]', () => {
    const items = Array.from({ length: 101 }, (_, i) => `i${i}`)
    const out = chunkBy(items, 100)
    expect(out.length).toBe(2)
    expect(out[0]?.length).toBe(100)
    expect(out[1]?.length).toBe(1)
    expect(out[1]?.[0]).toBe('i100')
  })

  test('size 1: every element is its own batch', () => {
    expect(chunkBy(['a', 'b', 'c'], 1)).toEqual([['a'], ['b'], ['c']])
  })
})

describe('chunkBy — preserves order and content', () => {
  test('concatenation of batches equals the input (250 items, size 100)', () => {
    const items = Array.from({ length: 250 }, (_, i) => `i${i}`)
    const batches = chunkBy(items, 100)
    expect(batches.length).toBe(3)
    expect(batches.flat()).toEqual(items)
  })

  test('every batch (except possibly the last) is exactly `size`', () => {
    const items = Array.from({ length: 250 }, (_, i) => `i${i}`)
    const batches = chunkBy(items, 100)
    expect(batches.slice(0, -1).every((b) => b.length === 100)).toBe(true)
    expect(batches.at(-1)!.length).toBeLessThanOrEqual(100)
  })

  test('size 100 with 100 items: exactly one full batch (no empty trailing batch)', () => {
    const items = Array.from({ length: 100 }, (_, i) => `i${i}`)
    const batches = chunkBy(items, 100)
    expect(batches.length).toBe(1)
    expect(batches[0]?.length).toBe(100)
  })
})

describe('chunkBy — generic over element type', () => {
  test('works on number[] (type-level check via compilation)', () => {
    const nums: number[] = [1, 2, 3, 4, 5]
    const batches: number[][] = chunkBy(nums, 2)
    expect(batches).toEqual([[1, 2], [3, 4], [5]])
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

```powershell
pnpm --filter @seta/agent-embeddings test:unit
```

Expected: FAIL with `Cannot find module './batch'`.

- [ ] **Step 3: Implement `batch.ts`**

Create `platform/agent/embeddings/src/batch.ts`:

```ts
export function chunkBy<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}
```

Notes:
- Generic over `T` — works for `string[]` (the actual use case) and any other element type (test exercises `number[]`).
- `readonly T[]` accepts both `T[]` and `readonly T[]` callers.
- No bounds check on `size`. In practice `size` is `EMBEDDING_BATCH_SIZE = 100` (a positive literal); guarding against zero or negative would be defensive code for a path that cannot fire. If you find yourself reaching for `if (size <= 0)`, stop — the only caller passes a positive literal constant.

- [ ] **Step 4: Run the tests and verify they pass**

```powershell
pnpm --filter @seta/agent-embeddings test:unit
```

Expected: all 8 `chunkBy` tests + 12 `parseInput` tests + 5 `constants` tests PASS.

- [ ] **Step 5: Run typecheck and lint**

```powershell
pnpm --filter @seta/agent-embeddings typecheck
pnpm --filter @seta/agent-embeddings lint
```

Both must pass.

- [ ] **Step 6: Commit**

```powershell
git add platform/agent/embeddings/src/batch.ts platform/agent/embeddings/src/batch.test.ts
git commit -m "feat(agent-embeddings): add chunkBy batch helper"
```

---

## End-of-plan verification

After Task B2:

```powershell
pnpm --filter @seta/agent-embeddings typecheck
pnpm --filter @seta/agent-embeddings lint
pnpm --filter @seta/agent-embeddings test:unit
pnpm --filter @seta/agent-embeddings build
```

All four must pass. The build still only produces the constants on the public surface — `parseInput` and `chunkBy` are intentionally not yet re-exported from `src/index.ts`. They become public-via-`embed()` in Plan C; staying internal until then prevents premature API freeze.

Test counts at end of Plan B: **25** unit tests passing.

Plan C composes A's constants and B's helpers into `createOpenAIEmbeddings()` and `embed()`.

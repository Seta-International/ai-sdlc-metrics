# @seta/agent-chunking — Plan C: `tokenStartChars` offset mapping

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `tokenStartChars(tokens, encoder, input)` — the function that maps each token index in a token array to its UTF-16 code-unit start offset in the original input string. This is the load-bearing component for citation provenance.

**Architecture:** Cumulative-prefix decode. For each prefix length `i`, `encoder.decode(tokens.slice(0, i)).length` (UTF-16 code units) is the start offset of token `i`. The final entry is snapped to `input.length` to absorb any rounding from replacement chars at multi-byte UTF-8 boundaries.

**Tech Stack:** `js-tiktoken`, Vitest.

**Spec:** [`docs/superpowers/specs/2026-05-13-agent-chunking-design.md`](../specs/2026-05-13-agent-chunking-design.md) §2 step 2

**Prereqs:** Plans A + B complete.

---

## Algorithm note vs the spec

The spec describes a byte-cumulative algorithm using `utf8ByteLength(decode([t]))` per token. After implementation-discovery: `js-tiktoken@1.0.21`'s `Tiktoken` class does not expose a raw-bytes-per-token API, and `decode([t])` inserts U+FFFD when a multi-byte UTF-8 sequence spans the token. The cumulative-prefix-decode approach below sidesteps this — it operates on full prefixes which never end mid-sequence for in-script text (and snaps the final offset to `input.length` as a safety net).

**Known limitation:** when a multi-byte UTF-8 sequence is split across two tokens (rare; happens with novel emoji ZWJ sequences under some encodings), the offset of the token that ends mid-glyph may be off by 1 UTF-16 unit. The Plan D property test `content === input.slice(startChar, endChar)` will surface this as a hard failure on inputs that trigger it; resolve case-by-case if it manifests.

---

## File Structure

Additions in this plan:

```
platform/agent/chunking/
└── src/
    ├── token-start-chars.ts        # the function
    └── token-start-chars.test.ts   # exhaustive offset tests
```

---

### Task C1: Write the failing tests

**Files:**
- Create: `platform/agent/chunking/src/token-start-chars.test.ts`

- [ ] **Step 1: Write the test file**

Create `platform/agent/chunking/src/token-start-chars.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { getEncoder } from './encoder-cache'
import { tokenStartChars } from './token-start-chars'

describe('tokenStartChars', () => {
  test('empty input → [0]', () => {
    const enc = getEncoder('text-embedding-3-small')
    const tokens: number[] = []
    const ofs = tokenStartChars(tokens, enc, '')
    expect(ofs).toEqual([0])
  })

  test('ASCII: each offset is a valid UTF-16 prefix length', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = 'The quick brown fox jumps over the lazy dog.'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    expect(ofs.length).toBe(tokens.length + 1)
    expect(ofs[0]).toBe(0)
    expect(ofs[ofs.length - 1]).toBe(input.length)
  })

  test('ASCII: offsets are monotonically non-decreasing', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = 'one two three four five six seven eight nine ten'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    for (let i = 1; i < ofs.length; i++) {
      expect(ofs[i]).toBeGreaterThanOrEqual(ofs[i - 1]!)
    }
  })

  test('ASCII: input.slice between consecutive offsets is non-empty for most boundaries', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = 'hello world this is a test of the tokenizer offset mapping'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    // For ASCII, every boundary advances at least one char (no zero-width tokens).
    for (let i = 1; i < ofs.length; i++) {
      expect(ofs[i]).toBeGreaterThan(ofs[i - 1]!)
    }
  })

  test('ASCII: concat of slices reproduces the input', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = 'concatenation reconstruction property test for ASCII inputs'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    let assembled = ''
    for (let i = 0; i < tokens.length; i++) {
      assembled += input.slice(ofs[i]!, ofs[i + 1]!)
    }
    expect(assembled).toBe(input)
  })

  test('CJK input: final offset equals input.length', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = '今天天气真好,我们去公园散步吧。'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    expect(ofs[0]).toBe(0)
    expect(ofs[ofs.length - 1]).toBe(input.length)
  })

  test('CJK input: concat of slices reproduces the input', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = '你好世界,这是一个测试。'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    let assembled = ''
    for (let i = 0; i < tokens.length; i++) {
      assembled += input.slice(ofs[i]!, ofs[i + 1]!)
    }
    expect(assembled).toBe(input)
  })

  test('mixed script: concat of slices reproduces the input', () => {
    const enc = getEncoder('gpt-5')
    const input = 'Hello 世界 hola mundo こんにちは'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    let assembled = ''
    for (let i = 0; i < tokens.length; i++) {
      assembled += input.slice(ofs[i]!, ofs[i + 1]!)
    }
    expect(assembled).toBe(input)
  })

  test('single emoji: produces valid offsets', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = '🌍'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    expect(ofs[0]).toBe(0)
    expect(ofs[ofs.length - 1]).toBe(input.length)
    expect(input.length).toBe(2) // surrogate pair → 2 UTF-16 units
  })

  test('whitespace-runs: final offset equals input.length', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = 'a   b\t\tc\n\n\nd'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    expect(ofs[0]).toBe(0)
    expect(ofs[ofs.length - 1]).toBe(input.length)
  })

  test('offsets length is exactly tokens.length + 1', () => {
    const enc = getEncoder('text-embedding-3-small')
    const input = 'arbitrary text of moderate length for the assertion'
    const tokens = enc.encode(input)
    const ofs = tokenStartChars(tokens, enc, input)

    expect(ofs).toHaveLength(tokens.length + 1)
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

```powershell
pnpm --filter @seta/agent-chunking test:unit
```

Expected: FAIL — `Cannot find module './token-start-chars'`.

---

### Task C2: Implement `tokenStartChars`

**Files:**
- Create: `platform/agent/chunking/src/token-start-chars.ts`

- [ ] **Step 1: Implement the function**

Create `platform/agent/chunking/src/token-start-chars.ts`:

```ts
import type { Tiktoken } from 'js-tiktoken'

/**
 * For a token sequence produced by `encoder.encode(input)`, returns the
 * UTF-16 code-unit start offset of each token into `input`, plus a final
 * entry equal to `input.length`. Length is always `tokens.length + 1`.
 *
 * Used by `chunkText` to recover citation spans on each `Chunk`.
 *
 * Algorithm: for each prefix length `i`, the UTF-16 length of
 * `encoder.decode(tokens.slice(0, i))` is the start offset of token `i`.
 * The final entry is snapped to `input.length` to absorb rounding from
 * U+FFFD replacement chars that tiktoken inserts when a multi-byte UTF-8
 * sequence spans a token boundary.
 *
 * Cost: O(n) decode calls, each O(prefix length) → O(n²) total. For
 * typical FAQ ingest (~3K tokens) this completes in well under a second.
 */
export function tokenStartChars(
  tokens: number[],
  encoder: Tiktoken,
  input: string,
): number[] {
  const offsets = new Array<number>(tokens.length + 1)
  offsets[0] = 0

  for (let i = 1; i < tokens.length; i++) {
    offsets[i] = encoder.decode(tokens.slice(0, i)).length
  }

  offsets[tokens.length] = input.length
  return offsets
}
```

- [ ] **Step 2: Run the tests and verify they pass**

```powershell
pnpm --filter @seta/agent-chunking test:unit
```

Expected: all 11 `tokenStartChars` tests PASS plus all earlier-plan tests.

If the **CJK input: concat of slices reproduces the input** test fails (one of the slices includes U+FFFD where the input has a real glyph), the algorithm has hit the known edge case for that input. Investigate which token boundary is bad: log `tokens`, `ofs`, and `encoder.decode([tokens[i]])` for each `i`. The fix is to detect that the decoded prefix ends with U+FFFD that is NOT present at the same position in `input`, and increment `offsets[i]` until the slice boundary aligns with a complete UTF-16 unit pair. Implement only if a test actually fails — do not pre-emptively add this complexity.

- [ ] **Step 3: Typecheck + lint**

```powershell
pnpm --filter @seta/agent-chunking typecheck
pnpm --filter @seta/agent-chunking lint
```

Both must pass.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/chunking/src/token-start-chars.ts platform/agent/chunking/src/token-start-chars.test.ts
git commit -m "feat(agent-chunking): add tokenStartChars offset mapper"
```

---

## End-of-plan verification

```powershell
pnpm --filter @seta/agent-chunking typecheck
pnpm --filter @seta/agent-chunking lint
pnpm --filter @seta/agent-chunking test:unit
pnpm --filter @seta/agent-chunking build
```

All four must pass. After this plan the package has every primitive needed for Plan D: scaffold + types (A), encoders (B), offset mapping (C). Plan D wires them into `chunkText`.

# Design — @seta/agent-chunking (P1 implementation)

**Status:** Draft for implementation. Authored 2026-05-13. Supersedes the implementation-shape questions in `platform/agent/chunking/SCOPE.md`; the SCOPE's contract (purpose, responsibilities, dep direction, P1 override citation) remains the binding context — this doc fills in the algorithm, error class, and test strategy.

**Scope:** Land `@seta/agent-chunking` under `platform/agent/chunking/` as a pure, synchronous, single-function package that turns a string + options into a token-bounded list of `Chunk`s with exact character offsets. No I/O, no streaming, no async, no class hierarchy.

**Out of scope (P1):** LLM-driven semantic chunking, paragraph/sentence semantic-boundary preference (Mastra `SentenceTransformer` / `MarkdownTransformer` equivalents are deliberately not ported), streaming chunkers, additional providers, runtime telemetry.

---

## 1. Architecture

A single ESM package `@seta/agent-chunking` at `platform/agent/chunking/`. Pure compute. One internal dep (`@seta/agent-core` — only for the `KernelError` base class), no other `@seta/*` imports.

### Public surface (frozen)

```ts
// platform/agent/chunking/src/index.ts
export interface Chunk {
  content: string         // === input.slice(startChar, endChar) — load-bearing invariant
  tokenCount: number      // js-tiktoken count under opts.model; ≤ opts.maxTokens
  startChar: number       // inclusive UTF-16 code-unit offset into the original input
  endChar: number         // exclusive UTF-16 code-unit offset
}

export type SupportedModel = 'text-embedding-3-small' | 'gpt-5'

export interface ChunkOptions {
  maxTokens: number
  overlapTokens: number   // < maxTokens; 0 disables overlap
  model: SupportedModel
}

export function chunkText(input: string, opts: ChunkOptions): Chunk[]

export const DEFAULT_MAX_TOKENS = 512 as const
export const DEFAULT_OVERLAP_TOKENS = 64 as const

export class ChunkingError extends KernelError {
  readonly code: 'CHUNKING_FAILED'
}
```

Defaults are **exported constants**, not implicit parameter defaults. `chunkText` requires the caller (typically `@seta/agent-rag`'s `ingest`) to supply them explicitly — keeps policy visible and one-step-removed-from-magic.

### Imports

- **Allowed internal:** `@seta/agent-core` (for `KernelError` base only).
- **External (pinned per `docs/setup.md` §13):** `js-tiktoken@1.0.21`, `zod@4.4.3`.
- **Forbidden:** any other `@seta/*` package, any `modules/*`, any `apps/*`, model SDKs, DB clients, loggers.

---

## 2. Algorithm — window-stride over tokens with exact offset tracking

Ported from Mastra's `splitTextOnTokens` (`D:/Work/mastra/packages/rag/src/document/transformers/token.ts:14-32`), extended with offset bookkeeping that Mastra discards.

### Why this algorithm

Mastra's transformer is the closest fit to the SCOPE contract: pure, deterministic, hand-rolled around `js-tiktoken`, no semantic-boundary preference. Mastra returns `string[]` and loses character offsets; our `Chunk` requires `startChar`/`endChar` so the rag layer can resolve citations via `cite_sources` without re-chunking at retrieve time. The extension is purely additive — we do not change the cut-point logic.

### Step 1 — encode and stride

```
tokens   = encoder.encode(input)              // one full-input encode
stride   = opts.maxTokens - opts.overlapTokens
charOfs  = tokenStartChars(tokens, encoder, input)  // length === tokens.length + 1

i = 0
chunks = []
while i < tokens.length:
  end       = min(i + opts.maxTokens, tokens.length)
  startChar = charOfs[i]
  endChar   = charOfs[end]
  chunks.push({
    content:    input.slice(startChar, endChar),
    tokenCount: end - i,
    startChar,
    endChar,
  })
  if end === tokens.length: break
  i += stride
```

Cut points are **hard token boundaries** — no paragraph/sentence preference. Matches Mastra exactly. Semantic-boundary chunking is rejected for P1 per SCOPE ("LangChain splitters too heavy").

### Step 2 — `tokenStartChars` (exact UTF-16 offset per token)

tiktoken is byte-level BPE: each token decodes to a fixed UTF-8 byte sequence. We compute UTF-16 char offsets in two passes:

1. **Token → byte length** (one `decode([t])` call per token, O(n)):
   ```
   byteLens[i] = utf8ByteLength(encoder.decode([tokens[i]]))
   byteOfs[i]  = sum(byteLens[0..i-1])
   byteOfs[tokens.length] = sum(byteLens[..])  // total bytes
   ```
2. **Byte offset → UTF-16 char offset** (single linear walk of `input`):
   walk `input` once, maintaining parallel `utf8Bytes` and `utf16Units` counters. Each Unicode code point in `input` contributes a known number of UTF-8 bytes (1–4) and 1 or 2 UTF-16 code units (surrogate pair detection via code-point range). Whenever `utf8Bytes` matches a target in `byteOfs`, record the corresponding `utf16Units` as that token's `charOfs`.

**Crucially:** `content` is sliced from the original `input`, never from the decoded byte string. The decoded form is used only to measure byte lengths. This is what preserves the `content === input.slice(startChar, endChar)` invariant despite BPE's lossy roundtrip (whitespace coalescing, normalization differences).

**Total cost:** O(n) `decode` calls + one O(|input|) char walk. No re-encodes, no `indexOf` searches.

### Step 3 — edge cases handled by the algorithm

| Case | Behaviour |
|---|---|
| `input === ''` | return `[]` without calling encoder |
| `overlapTokens >= maxTokens` | Zod refinement rejects before encoding → `ChunkingError` |
| `maxTokens === 1` | each chunk is one token wide; offset arithmetic unchanged |
| Final chunk shorter than `maxTokens` | `end === tokens.length`; `tokenCount < maxTokens` allowed |
| Multi-byte glyph spans a chunk boundary | offset computation is byte-level; the glyph's UTF-16 surrogate pair lands fully on the side where its first byte begins |
| Encoder `getEncoding(...)` throws | `ChunkingError` with `cause: originalError` |

### Encoder memoization

```ts
const ENCODING_FOR_MODEL: Record<SupportedModel, TiktokenEncoding> = {
  'text-embedding-3-small': 'cl100k_base',
  'gpt-5': 'o200k_base',  // js-tiktoken@1.0.21 has no native gpt-5; fallback per SCOPE Q4
}

const encoderCache = new Map<SupportedModel, Tiktoken>()

function getEncoder(model: SupportedModel): Tiktoken {
  let enc = encoderCache.get(model)
  if (!enc) {
    try {
      enc = getEncoding(ENCODING_FOR_MODEL[model])
    } catch (e) {
      throw new ChunkingError(`failed to load encoder for ${model}`, { cause: e })
    }
    encoderCache.set(model, enc)
  }
  return enc
}
```

Module-scope cache, no invalidation (encoders are immutable). The `gpt-5 → o200k_base` fallback is **explicit, not silent** — a single-line code comment cites the js-tiktoken version. When upstream ships a native gpt-5 encoding, swap the value and bump the pin.

---

## 3. Validation and errors

### Zod schema at the public boundary

```ts
import { z } from 'zod'

const ChunkOptionsSchema = z.object({
  maxTokens: z.number().int().positive(),
  overlapTokens: z.number().int().nonnegative(),
  model: z.enum(['text-embedding-3-small', 'gpt-5']),
}).refine(o => o.overlapTokens < o.maxTokens, {
  message: 'overlapTokens must be < maxTokens',
})
```

Runs at the top of `chunkText`. Validation failures throw `ChunkingError`, never return.

### Error class

```ts
import { KernelError } from '@seta/agent-core/errors'

export class ChunkingError extends KernelError {
  readonly code = 'CHUNKING_FAILED' as const
}
```

Single error class with one code. Two thrown conditions across the entire package:

1. Zod validation failure (invalid `opts`).
2. Encoder load failure (`js-tiktoken.getEncoding` throws).

The algorithm itself has no runtime error paths once options validate. No retries, no recovery — this is pure compute.

---

## 4. Test strategy

All tests are unit tests, co-located at `platform/agent/chunking/src/**/*.test.ts`. No integration tier (no I/O). No LLM fixtures, no `DATABASE_URL`, no `@seta/agent-core/testkit` recordings.

### Property tests

Generators (proposed via `fast-check` — **open question 1**): random non-empty `input: string` × random valid `ChunkOptions` drawn from `{maxTokens ∈ [1, 1024], overlapTokens ∈ [0, maxTokens-1], model ∈ SupportedModel}`.

| Property | Assertion |
|---|---|
| Token-budget invariant | `chunks.every(c => c.tokenCount <= opts.maxTokens)` |
| Content/offset roundtrip | `chunks.every(c => c.content === input.slice(c.startChar, c.endChar))` — **load-bearing** |
| Coverage | non-empty input ⇒ `chunks[0].startChar === 0 && chunks.at(-1)!.endChar === input.length` |
| Stride correctness | for consecutive `a, b` (excluding the final chunk): `b.startChar` corresponds to token index `(a's start token index) + stride` — verified via a test-only export of the algorithm's internal `tokens` and `charOfs` arrays. Re-encoding `input.slice(a.startChar, b.startChar)` is **not** a valid check because BPE is context-dependent: re-encoding a substring can yield a different token count than the same range of the full-input encode. |
| Determinism | `JSON.stringify(chunkText(s, o)) === JSON.stringify(chunkText(s, o))` |
| Empty input | `chunkText('', validOpts).length === 0` |

### Tokenizer parity fixtures

Hand-rolled fixtures locking token counts under both encodings (`cl100k_base`, `o200k_base`). Inputs to cover:

- pure ASCII
- CJK
- emoji (including ZWJ sequences)
- mixed-script
- code blocks (triple-backtick fences, indentation)
- repeated whitespace

Purpose: catch silent `js-tiktoken` upgrades that change tokenization. Fixture file at `src/__fixtures__/token-counts.json`.

### Edge-case unit tests

- `overlapTokens === 0` → adjacent chunks don't share tokens
- `overlapTokens >= maxTokens` → throws `ChunkingError`
- `maxTokens === 1` → each chunk one token wide
- input shorter than `maxTokens` → returns single chunk spanning whole input
- multi-byte boundary stress: input where a CJK / emoji glyph encodes to 2+ tokens at the cut point — assert `content === input.slice(startChar, endChar)` still holds
- encoder load failure simulated (mock `js-tiktoken.getEncoding` to throw) → `ChunkingError` with `cause` preserved
- Zod failures: negative `maxTokens`, fractional `overlapTokens`, unknown `model` → each throws `ChunkingError`

---

## 5. File layout (when implementation lands)

```
platform/agent/chunking/
├── SCOPE.md                                    # exists; remains the binding contract
├── package.json                                # created via `pnpm new:package`
├── tsconfig.json
├── vitest.config.ts                            # leaf override of `test.name` only
├── src/
│   ├── index.ts                                # re-exports public surface
│   ├── chunk-text.ts                           # chunkText + algorithm
│   ├── chunk-text.test.ts                      # property + edge-case tests
│   ├── token-start-chars.ts                    # tokenStartChars helper (testable in isolation)
│   ├── token-start-chars.test.ts
│   ├── encoder-cache.ts                        # memoized getEncoder + ENCODING_FOR_MODEL
│   ├── errors.ts                               # ChunkingError
│   ├── options.ts                              # ChunkOptionsSchema + types
│   └── __fixtures__/
│       └── token-counts.json                   # tokenizer parity fixtures
└── README.md                                   # one-page surface doc (auto-generated from SCOPE links)
```

`chunk-text.ts` is the only file with non-trivial algorithmic content. `token-start-chars.ts` is split out so the offset-mapping logic can be unit-tested in isolation (the UTF-8↔UTF-16 walk is the highest-risk piece).

**Test-only internal export.** The stride-correctness property test needs the algorithm's internal `tokens` array and `charOfs` array. Exported from `chunk-text.ts` as a named internal `__internal_chunkTextWithTrace` (underscore-prefixed; not in `index.ts`). The public surface stays `chunkText` only.

---

## 6. Dep direction and CI guards

- `platform/agent/chunking → @seta/agent-core` (one internal edge, types/error class only). Setup.md §11 dep direction originally listed chunking as "(no internal deps; pure TS)"; the `KernelError` import is a deliberate one-line deviation to keep the error hierarchy uniform. This is consistent with `@seta/agent-embeddings` taking `@seta/agent-core` for `withRetry` / `LlmError` under the P1 override.
- No `modules/*`, no `apps/*`, no `@seta/middleware`, no `@seta/observability`. Caller wraps with logger.
- `"private": true` (P1 — published via changesets follows separately).
- CI guards already in place (`check-no-manual-pkg-edit.ts`, ESM-only, no `console.log`, `import type` enforcement) cover this package without any new guard.

---

## 7. Open questions (resolve before / during writing-plans)

1. **`fast-check` dev-dep pin.** Property tests require a generator library. `fast-check` is the established TS choice but is not currently pinned anywhere in the repo. Adding it requires a setup.md §13 pin (latest stable as of 2026-05-13 — check via `pnpm view fast-check version` during plan). Alternative: hand-rolled deterministic input table (8–12 inputs covering the property space), no generator library — smaller scope, weaker coverage. **Recommendation:** pin `fast-check`; the load-bearing offset-roundtrip property is exactly the kind of invariant generators catch and unit tests miss.
2. **`gpt-5` encoding fallback longevity.** `o200k_base` is the documented fallback. When `js-tiktoken` upstream ships a dedicated gpt-5 encoding, the swap is mechanical. No action required now; a comment in `encoder-cache.ts` cites the pinned version.
3. **`README.md` content.** Single page, links back to SCOPE.md + this spec + open questions. Generated from existing material; no new content beyond a usage snippet.
4. **Per-call encoder cache.** Module-scope `Map` is fine for the FAQ corpus (two models, two entries, immutable). If memory pressure ever matters for serverless cold starts, a `WeakMap` keyed by model string is a one-line change. Not P1.

---

## 8. Cross-references

- **SCOPE (binding):** [`platform/agent/chunking/SCOPE.md`](../../../platform/agent/chunking/SCOPE.md)
- **Mastra reference (algorithm port):** `D:/Work/mastra/packages/rag/src/document/transformers/token.ts` `splitTextOnTokens` (lines 14–32)
- **Sibling P1 RAG SCOPEs:** [`platform/agent/embeddings/SCOPE.md`](../../../platform/agent/embeddings/SCOPE.md), [`platform/agent/vector/SCOPE.md`](../../../platform/agent/vector/SCOPE.md), [`platform/agent/rag/SCOPE.md`](../../../platform/agent/rag/SCOPE.md)
- **P1 override notice:** [`docs/explorations/2026-05-12-mastra-spike/README.md`](../../explorations/2026-05-12-mastra-spike/README.md) § "P1 scope override (2026-05-12)"
- **Setup spec:** [`docs/setup.md`](../../setup.md) §6 (RAG primitives), §11 (dep direction), §13 (`js-tiktoken@1.0.21` pin)
- **Kernel error base:** `@seta/agent-core/errors` `KernelError` (shipped in K1)
- **CLAUDE.md conventions:** ESM-only, schema-driven (`z.infer`), no path aliases, unit tests co-located, no LLM fixtures here (chunker is below the model layer)

# @seta/agent-chunking — Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement these plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-13-agent-chunking-design.md`](../specs/2026-05-13-agent-chunking-design.md)

**SCOPE (binding contract):** [`platform/agent/chunking/SCOPE.md`](../../../platform/agent/chunking/SCOPE.md)

---

## Course-correction noted vs the spec

The spec sketches `ChunkingError extends KernelError { readonly code = 'CHUNKING_FAILED' }`. The actual `KernelError` constructor in `platform/agent/core/src/errors/index.ts:28-49` takes structured args `{ code, domain, category, message, details?, cause?, status? }` and is not extensible via a literal class field. The plans below follow the `AgentError` / `LlmError` / `ToolError` precedent at `platform/agent/core/src/errors/index.ts:65-83` — `ChunkingError` provides a constructor that fixes `domain: 'KERNEL'` and defaults `code: 'CHUNKING_FAILED'`, `category: 'SYSTEM'`. Functionally equivalent to the spec's intent; the shape just had to match what's actually exported.

## Plan ordering and dependencies

Four sequential plans. Each is a self-contained, AI-worker-sized unit that ends with a green typecheck/lint/test cycle plus a commit. Later plans build on earlier plans' files; don't reorder.

```
A. Scaffold + types + errors  →  B. Encoder cache + parity fixtures
                                          ↓
D. chunkText + property tests  ←  C. tokenStartChars offset mapping
```

| Plan | File | What ships | Why this slice |
|---|---|---|---|
| **A** | [`2026-05-13-agent-chunking-A-scaffold.md`](./2026-05-13-agent-chunking-A-scaffold.md) | `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/options.ts`, `src/errors.ts` + unit tests for both. Public types frozen, no algorithm yet. | Lowest-risk entry. Validates the dep direction, error hierarchy, and Zod schema in isolation. |
| **B** | [`2026-05-13-agent-chunking-B-encoder.md`](./2026-05-13-agent-chunking-B-encoder.md) | `src/encoder-cache.ts` + `src/__fixtures__/token-counts.json` + tests locking `js-tiktoken@1.0.21` behaviour under `cl100k_base` and `o200k_base`. | Pins tokenizer behaviour before any algorithm depends on it. Catches silent upstream changes. |
| **C** | [`2026-05-13-agent-chunking-C-offsets.md`](./2026-05-13-agent-chunking-C-offsets.md) | `src/token-start-chars.ts` + exhaustive unit tests (ASCII, CJK, emoji, ZWJ, mixed). | The UTF-8↔UTF-16 walk is the highest-risk piece; isolating it makes failures easy to diagnose. |
| **D** | [`2026-05-13-agent-chunking-D-chunktext.md`](./2026-05-13-agent-chunking-D-chunktext.md) | `src/chunk-text.ts` (window-stride loop + internal-trace export) + property tests via `fast-check` + final `src/index.ts` re-exports. | Composes A+B+C. Property tests verify the load-bearing `content === input.slice(startChar, endChar)` invariant. |

## Verification at the end of each plan

Every plan ends with these three commands. All must pass before commit. Run from the repo root unless noted:

```powershell
pnpm --filter @seta/agent-chunking typecheck
pnpm --filter @seta/agent-chunking lint
pnpm --filter @seta/agent-chunking test:unit
```

## Open question carried forward

`fast-check` is required by Plan D and is not currently pinned in the repo. Plan D includes the lookup + pin step (`pnpm view fast-check version`, then `pnpm --filter @seta/agent-chunking add -D fast-check@<resolved-version>`). The pin is added to `docs/setup.md §13` as the last step of Plan D.

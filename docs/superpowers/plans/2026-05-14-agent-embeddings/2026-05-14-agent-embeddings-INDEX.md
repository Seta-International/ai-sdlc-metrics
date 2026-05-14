# @seta/agent-embeddings — Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement these plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-14-agent-embeddings-design.md`](../specs/2026-05-14-agent-embeddings-design.md)

**SCOPE (binding contract):** [`platform/agent/embeddings/SCOPE.md`](../../../platform/agent/embeddings/SCOPE.md)

---

## Plan ordering and dependencies

Four sequential plans. Each is a self-contained, AI-worker-sized unit that ends with a green typecheck/lint/test cycle plus one or more commits. Later plans build on earlier plans' files; don't reorder.

```
A. Promote mapOpenAIError + scaffold + constants
                  ↓
B. parse-input (Zod) + batch (chunkBy)
                  ↓
C. client + embed orchestration (fake-client unit tests)
                  ↓
D. Integration tests via setupLLMRecording (msw + fixtures)
```

| Plan | File | What ships | Why this slice |
|---|---|---|---|
| **A** | [`2026-05-14-agent-embeddings-A-scaffold.md`](./2026-05-14-agent-embeddings-A-scaffold.md) | `mapOpenAIError` promoted to `@seta/agent-core` public + `minor` changeset. Empty `@seta/agent-embeddings` package: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/constants.ts`, `src/index.ts` (skeleton re-exports). No algorithm yet. | Lowest-risk entry. Establishes dep direction and unblocks every later import (`LlmError`, `withRetry`, `mapOpenAIError`). |
| **B** | [`2026-05-14-agent-embeddings-B-validate-batch.md`](./2026-05-14-agent-embeddings-B-validate-batch.md) | `src/parse-input.ts` (Zod schema rejecting non-blank failures, throws `LlmError(LLM_BAD_REQUEST, USER)`) and `src/batch.ts` (`chunkBy(texts, size)` pure helper). Both with full unit tests. | Pure functions, zero coupling to the OpenAI client. Pinning these in isolation makes the orchestration plan small. |
| **C** | [`2026-05-14-agent-embeddings-C-embed.md`](./2026-05-14-agent-embeddings-C-embed.md) | `src/client.ts` (factory + internal `makeEmbeddingsClient` injection seam), `src/embed.ts` (orchestration: validate → loop → withRetry → aggregate), final `src/index.ts`. Unit tests inject a fake OpenAI-shaped client. | The orchestration is the heart of the package. Tests don't touch the network — msw stays out until Plan D. |
| **D** | [`2026-05-14-agent-embeddings-D-integration.md`](./2026-05-14-agent-embeddings-D-integration.md) | `tests/integration/embed.integration.test.ts` covering 6 scenarios (happy path, multi-batch, 401 terminal, 429-retry, abort mid-request, empty-input short-circuit). Recordings checked into `tests/integration/__recordings__/`. | Validates the OpenAI wire contract once, end-to-end. Locks fixture-determinism guarantees the sequential batching relies on. |

## Verification at the end of each plan

Every plan ends with at minimum:

```powershell
pnpm --filter @seta/agent-embeddings typecheck
pnpm --filter @seta/agent-embeddings lint
pnpm --filter @seta/agent-embeddings test:unit
```

Plan D additionally runs:

```powershell
pnpm --filter @seta/agent-embeddings test:integration
```

Plan A additionally runs (for the agent-core change):

```powershell
pnpm --filter @seta/agent-core typecheck
pnpm --filter @seta/agent-core lint
pnpm --filter @seta/agent-core test:unit
```

## Course-correction noted vs the spec

The spec sketches `embed(texts, opts?): Promise<EmbedResult>` with an `EmbeddingsClient` interface. That stays. One small alignment: spec §2 says `parseInput` is `asserts texts is string[]` — Zod 4's `safeParse` keeps that contract feasible, but the `LlmError` thrown carries `details.issues` as `unknown[]` (typed as such by Zod's `ZodIssue[]`). The plans below reflect this.

The spec also says `mapOpenAIError` is exported from `agent-core`'s `index.ts`. As of `feat/agent-embedding` branch state, it is **not** yet exported. Plan A handles the promotion + a `minor` changeset before the embeddings package starts.

## Open questions carried forward (none block implementation)

1. `Retry-After` honouring — kernel-side follow-up, tracked in the spec §6 Q1.
2. `EMBEDDING_BATCH_SIZE` bump 100 → 2048 — spec §6 Q2.
3. Bounded parallelism — spec §6 Q3.
4. Model widening to `text-embedding-3-large` — spec §6 Q4.
5. `onAttempt` hook through `EmbedOptions` — spec §6 Q5.

None of these affect the public surface or the file layout these plans land.

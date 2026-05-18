# EP-07 `@seta/agent-rag` — Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement these plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Specs:**
- [`docs/superpowers/specs/2026-05-18-agent-rag-design.md`](../../specs/2026-05-18-agent-rag-design.md) — `@seta/agent-rag` package design
- [`docs/superpowers/specs/2026-05-18-agent-vector-span-citation-design.md`](../../specs/2026-05-18-agent-vector-span-citation-design.md) — `@seta/agent-vector` `span jsonb` companion

**SCOPE (binding contracts):**
- [`platform/agent/rag/SCOPE.md`](../../../../platform/agent/rag/SCOPE.md)
- [`platform/agent/vector/SCOPE.md`](../../../../platform/agent/vector/SCOPE.md)

---

## Plan ordering and dependencies

Six sequential plans across two PRs. Plan 0 ships in PR 1 and **must merge before** Plans A–E start (the new `searchChunks` return shape is consumed by Plan E). Plans A–E ship in PR 2, in order.

```
PR 1 (companion):
  0. agent-vector: span jsonb column + searchChunks/insertChunks pass-through
                  ↓ (merge to main / branch)
PR 2 (new package, all under platform/agent/rag/):
  A. Scaffold @seta/agent-rag: package.json, types.ts, index.ts, exports map
                  ↓
  B. fuseByRRF (pure helper) + unit + property tests
                  ↓
  C. createFakeAgentRag testkit + unit tests
                  ↓
  D. ingest path: chunk → hash → dedup → embed → insert + unit + integration tests
                  ↓
  E. retrieve + factory + integration tests + SCOPE.md / supersede doc updates
```

| Plan | File | What ships | Why this slice |
|---|---|---|---|
| **0** | [`0-vector-span-citation.md`](./0-vector-span-citation.md) | Adds nullable `span jsonb` column to `agent_vector.chunks`. `searchChunks` returns `sourceId` + `span`. `insertChunks` accepts and writes `span`. Updated `SearchHit`, `NewChunk`, integration tests. | Unblocks every later plan's citation contract. Migration + return-shape change is small but cuts across two functions; isolating it in PR 1 keeps PR 2 free of vector-package edits. |
| **A** | [`A-scaffold.md`](./A-scaffold.md) | `platform/agent/rag/` package: `package.json` (via `pnpm new:package`), deps via `pnpm add`, `tsconfig.json`, `vitest.config.ts`, `src/types.ts` (full type surface), `src/index.ts` (re-exports), three-subpath exports map (`.`, `./types`, `./testkit`). Stub `factory.ts` and `testkit.ts` so the build is green. No algorithm yet. | Lowest-risk entry. Establishes import paths, dep direction, and the typed contract that Plans B–E will fill in. |
| **B** | [`B-rrf.md`](./B-rrf.md) | `src/rrf.ts` (`fuseByRRF` pure helper), `src/rrf.test.ts` (correctness), `src/rrf.property.test.ts` (`fast-check`, ≥200 runs). | Pure function, zero deps. Lands the ranking primitive in isolation so Plan E can compose it without hidden surprises. |
| **C** | [`C-testkit.md`](./C-testkit.md) | `src/testkit.ts` (`createFakeAgentRag`), `src/testkit.test.ts`. | Unblocks downstream FAQ-Agent tests (EP-12) at the `RagApi` contract layer. No production code consumes the testkit. |
| **D** | [`D-ingest.md`](./D-ingest.md) | `src/ingest.ts` (chunk → hash → dedup → embed → insert; inline `sha256hex`), `src/ingest.test.ts` (hash digest assertions), `tests/integration/_helpers.ts`, `tests/integration/ingest.test.ts` (cases 1–7 from spec §Testing), `tests/integration/__recordings__/` (checked into git). | Largest plan. The dedup loop is the load-bearing cost-saving path; integration coverage proves it end-to-end against real pgvector + recorded OpenAI fixtures. |
| **E** | [`E-retrieve-factory.md`](./E-retrieve-factory.md) | `src/retrieve.ts`, real `src/factory.ts` (wires `ingest` + `retrieve` into `RagApi`), `src/factory.test.ts`, `tests/integration/retrieve.test.ts` (cases 8–13), `platform/agent/rag/SCOPE.md` update, `docs/superpowers/specs/2026-05-15-agent-rag-dedup-ingest-design.md` `Superseded by …` header. | Closes EP-07. The retrieve path consumes Plan 0's `sourceId`/`span` and Plan B's fusion helper; doc bookkeeping is the final commit. |

## Verification at the end of each plan

Every plan ends with:

```powershell
pnpm --filter @seta/agent-rag typecheck
pnpm --filter @seta/agent-rag lint
pnpm --filter @seta/agent-rag test:unit
```

(Plan 0 uses `@seta/agent-vector` instead of `@seta/agent-rag`.)

Plans D and E additionally run:

```powershell
pnpm --filter @seta/agent-rag test:integration
```

Plan 0 also runs:

```powershell
pnpm migrate
pnpm --filter @seta/agent-vector test:integration
```

## Course-correction noted vs the spec

- The spec mentions `apps/api/src/main.ts` wiring (`createAgentRag` construction). That wiring is **owned by EP-14 task 14.3** (apps/api composition root), not EP-07. These plans stop at the package boundary — `createAgentRag` is exported, tested, and callable; the actual call site lands later.
- The spec's optional Zod refinement on `span` shape (vector-side, Plan 0) is **included** in the plan — small bulwark for any direct vector-store consumer.
- **OpenTelemetry spans deferred.** The spec describes two `internal` spans (`agent-rag.ingest`, `agent-rag.retrieve`) with named attributes. None of the sibling agent packages (`vector`, `embeddings`, `chunking`) wrap their public functions in manual spans — they rely on OTel auto-instrumentation of downstream calls (OpenAI fetch, postgres queries). These plans follow that precedent: structured `logger` events at every boundary are sufficient signal; manual span wrapping is a small follow-up task once the sibling pattern shifts. The DoD for WBS 7.1–7.3 does not require spans.

## Open questions carried forward (none block implementation)

1. **FTS leg corpus provenance** — deferred to P2 (rag spec § Out of scope).
2. **Hybrid weight asymmetry** — deferred to P2.
3. **Token-budget for query embedding** — caller's problem; `LlmError` surfaces.
4. **`OWNER_ORDER` placement** — `@seta/agent-rag` owns no schema; no entry.
5. **`hash.ts` extraction** — re-evaluate if a second `sha256hex` consumer appears.
6. **`span` non-null on `NewChunk`** — kept nullable per spec; Zod enforces shape when present.

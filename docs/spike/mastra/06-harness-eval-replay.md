# Key 6 — Harness / Eval / Replay

**Mastra area:** `packages/_llm-recorder/`, `packages/core/src/evals/`, `packages/evals/src/scorers/`, `packages/core/src/loop/network/validation.ts`, `packages/core/src/harness/`
**Our design area:** `agent-runtime.md` §8 (Replay), §12 (Observability/Canary), §14 (Golden traces + regression suite), §16 (LLM-as-judge deferred)
**Investigation date:** 2026-04-21

---

## 1. How mastra does it

### 1.1 Replay: HTTP-level recorder, not prompt-level

Mastra's replay is an MSW-based HTTP interceptor at `packages/_llm-recorder/src/llm-recorder.ts`. It is a **test-fixture** tool, not a runtime replay facility.

- Modes resolved by env/CLI at `llm-recorder.ts:106-124`:
  - `auto` (default) — replay if recording exists, record if not.
  - `update` — force re-record (`vitest -u` analogue), triggered by `--update-recordings` or `UPDATE_RECORDINGS=true`.
  - `replay` — strict; **throws** if no recording (`llm-recorder.ts:757-762`).
  - `live` — bypass recorder entirely.
- Recording key: **MD5-16 of URL + canonicalized JSON body** at `llm-recorder.ts:443-453`. Stable key sort (`stableSortKeys`) + ISO-date canonicalization (`canonicalizeISODateString`) makes hashes deterministic across runs.
- Recording storage: `__recordings__/<name>.json` with `{ meta, recordings[] }` envelope (`llm-recorder.ts:195-198`). Legacy plain-array files auto-migrated on read (`llm-recorder.ts:209-229`).
- Metadata auto-captured: `testFile`, `testName`, `provider`, `model`, `createdAt`, `updatedAt` (`llm-recorder.ts:1067-1075`). Model is extracted from first request body's `model` field.
- Binary artifacts (audio, images) stored as **sidecar files** next to JSON (`llm-recorder.ts:476-504`), referenced by hash + digest. JSON stays readable.
- Streaming (SSE): chunks + inter-chunk timings captured (`llm-recorder.ts:518-549`), replayable with `replayWithTiming: true` to simulate original pacing (`llm-recorder.ts:554-588`).
- Hash miss behavior is **loud but not strict**: `findRecording` at `llm-recorder.ts:607-702` first exact-matches, then falls back to string-similarity fuzzy match (threshold 0.6, `SIMILARITY_THRESHOLD` at line 591). A fuzzy match emits a console `diffJson` warning (`llm-recorder.ts:966-988`) but still returns a response unless `exactMatch: true` is set. **On outright miss**, it throws (`llm-recorder.ts:948-957`).
- `transformRequest` hook (`llm-recorder.ts:242-261`) lets callers normalize dynamic fields (timestamps, UUIDs, session IDs) **before hashing**. Applied on both record and replay sides. Plugin variant takes an `importPath`+`exportName` so the transform is code-loaded at build time.
- Provider scope: intercepts OpenAI, Anthropic, Google, OpenRouter (`llm-recorder.ts:329-334`).
- Dedup on save: recordings with the same hash across tests collapse to one entry (`llm-recorder.ts:1078-1083`). Cross-test reuse is intentional.

### 1.2 `MastraScorer` — pipeline of steps, returns `{ score, reason }`

`packages/core/src/evals/base.ts:263-931`. Scorers are first-class `Agent`-like objects built via `createScorer({ id, description, judge? })` and chained through four optional stages:

1. `.preprocess(stepDef)` — arbitrary transform/extraction step.
2. `.analyze(stepDef)` — structured analysis step (often judge-backed).
3. `.generateScore(stepDef)` — **required**; returns a `number`. Runtime throws if omitted (`base.ts:491-502`).
4. `.generateReason(stepDef)` — optional textual rationale.

Each step is **either** a function `({ run, results }) => value` **or** a `PromptObject { description, outputSchema, createPrompt(ctx), judge? }` (`base.ts:126-149`). Prompt objects are run through a dynamically-constructed `judge` Agent (`base.ts:846-851`) with the prompt's Zod schema.

The pipeline compiles to a Mastra workflow under the hood (`base.ts:668-794`) — same engine that runs the main agent, so scorer runs produce spans (`SpanType.SCORER_RUN`, `SpanType.SCORER_STEP`) and emit scores to the observability store via `mastra.observability.addScore` (`base.ts:599-631`).

`ScorerRun<TInput, TOutput>` (`base.ts:80-123`) carries `runId`, `input`, `output`, optional `groundTruth`, optional `expectedTrajectory`, and target anchors: `targetTraceId`, `targetSpanId`, `targetScope: 'span' | 'trajectory'`, `targetEntityType`, `scoreSource: 'live' | 'trace' | 'experiment' | 'test'`. **One scorer class serves live production scoring, experimental scoring, and retrospective trace scoring** — the `scoreSource` tag differentiates.

### 1.3 Sampling config for live scoring

`ScoringSamplingConfig` at `evals/types.ts:14`:

```typescript
export type ScoringSamplingConfig = { type: 'none' } | { type: 'ratio'; rate: number }
```

Attached per-scorer-entry: `{ scorer, sampling }` at `base.ts:963-968`. `evals/hooks.ts:36-48` is where sampling decides whether to fire — `Math.random() < rate` for ratio-type, always-fire otherwise. This is the **only** sampling dimension exposed — no tenant-keyed, time-bucketed, or error-biased sampling.

### 1.4 Eval harness: `runEvals({ data, scorers, target })`

`packages/core/src/evals/run/index.ts`. Executes a target (Agent or Workflow) against a data array, runs scorers per item, and accumulates averages. Scorers can be:

- A flat array (`runEvals` overload, `run/index.ts:56-81`).
- A structured config: `WorkflowScorerConfig { workflow?, steps? [by-step-id], trajectory? }` or `AgentScorerConfig { agent?, trajectory? }` (`run/index.ts:32-46`).
- `targetOptions` forward any Agent/Workflow execution option (model, maxSteps, structuredOutput).
- `concurrency` parameter; `pMap` parallelism (`run/index.ts:144-174`).
- `onItemComplete` callback fires per item for custom aggregation.
- Side-effect: each result is persisted to the `scores` storage domain via `saveScoresToStorage` (`run/index.ts:653-847`), tagged `source: 'TEST'`.
- Trajectory extraction prefers hierarchical trace-based (reads the just-captured trace from observability storage at `run/index.ts:375-394`), falls back to flat message-based extraction.

### 1.5 Retrospective trace scoring

`packages/core/src/evals/scoreTraces/`. A dedicated internal workflow `__batch-scoring-traces` (`scoreTracesWorkflow.ts:244-262`) takes `{ scorerId, targets: [{ traceId, spanId }] }`, loads each trace from the observability store, reconstructs the scorer input/output from the span, and runs the scorer with `scoreSource: 'trace'`. Concurrency 3.

**This is the critical piece for our replay story**: mastra separates (a) capturing the full trace at production time and (b) running a scorer after the fact on any stored trace. No prompt-hash machinery — the full input/output lives on the span record.

### 1.6 Prebuilt scorer catalog (`packages/evals/src/scorers/`)

- **Code (deterministic):** `completeness`, `content-similarity`, `keyword-coverage`, `textual-difference`, `tone`, `tool-call-accuracy`, `trajectory`.
- **LLM-judge:** `answer-relevancy`, `answer-similarity`, `bias`, `context-precision`, `context-relevance`, `faithfulness`, `hallucination`, `noise-sensitivity`, `prompt-alignment`, `tool-call-accuracy`, `toxicity`, `trajectory`.

Each LLM scorer ships its own MSW fixture in `packages/evals/__recordings__/` (e.g. `evals-src-scorers-llm-faithfulness-index--openai-chat--gpt-4o.json`, 4200 lines). So scorer self-tests are fully offline, deterministic, and CI-runnable. Filenames encode `<path>--<provider>--<model>`.

### 1.7 Network-completion use of scorers

`loop/network/validation.ts:189-224` adapts the scorer to a pass/fail gate: `score === 1 ⇒ passed`. Strategy `'all'` or `'any'` (`validation.ts:250-297`). `runDefaultCompletionCheck` (`validation.ts:386-520`) is a built-in **LLM-judge completion scorer** used when no explicit scorers are configured — returns `{ isComplete, completionReason, finalResult }` from a structured-output call.

### 1.8 Golden traces / canaries / shadow mode

Broad grep across the mastra repo for `golden`, `canary`, `shadow`, `dry-run`, `dryRun` returned **no first-class runtime features**. Matches are limited to:

- Voice/recording fixture files.
- GitHub Actions workflows (`canary` = npm-publish channel, unrelated).
- `explorations/longmemeval/` dataset tooling.
- `DryRunError` naming inside workflow control-flow, not an execution mode.

**Mastra ships no golden-trace set, no canary harness, no shadow/dry-run execution mode.** The eval package ships the harness + scorers + per-scorer fixtures; consumers assemble golden corpora themselves.

### 1.9 Version identification

From spike finding 02: `MASTRA_VERSIONS_KEY` lives on `RequestContext` (`packages/core/src/request-context/index.ts`). Per-request `VersionOverrides` allow the same runtime to pin agents/sub-agents to explicit version IDs (`packages/core/src/mastra/types.ts` — `mergeVersionOverrides`). Versions are **stored IDs**, not **content hashes** — scorer `source?: DefinitionSource` (`evals/base.ts:276`) distinguishes code-defined vs. storage-loaded, and `toRawConfig()` returns the raw storage row for reconstruction. A stored version ID is the primary identity key.

---

## 2. What this tells us

### 2.1 Mastra's replay is for test fixtures, not production-trace reconstruction

The `_llm-recorder` is excellent at its job — MSW interception, content-hash keying, fuzzy fallback, streaming-aware — **but it's a dev-time pinning tool**. It presumes you know the LLM HTTP request body exactly, which for test code is true because the caller fixes the prompt.

**Our §8 replay is a different problem.** We want to reconstruct the full prompt array from a production `trace_id` where the prompt was assembled at runtime from: static prompt fragments (by content hash), retrieved narratives, tool outputs, router decisions, memory windowing. Hash-at-HTTP-boundary doesn't help because we need to recover the **inputs to the assembly**, not the **output of the assembly**.

That said, mastra's hash approach validates two of our §8 assumptions:

1. **Content hashing works as a primary key for prompt fragments.** MD5-16 + stable key sort + ISO canonicalization (`llm-recorder.ts:370-385`) is a useful recipe. We should adopt the canonicalization rules verbatim — they catch real-world sources of hash drift that we will otherwise rediscover in production.
2. **Loud-but-not-strict miss behavior is a trap.** Mastra's fuzzy fallback with a console warning is specifically the anti-pattern our §8 spec names: _"errors explicitly on any lookup miss — no silent fallback"_. Their warning is strictly worse than an error because it survives tests and rots. Our spec is correct; we should keep the strict stance and not soften it when implementation starts.

### 2.2 Scorer retrospective-trace path is the shape our replay + regression flow wants

`scoreTraces.ts` + `run/index.ts:482-488` (trace-to-trajectory extraction) is closer to our §14 goal than anything else in the codebase. The pattern:

1. Production runs write full trace records to observability storage (input/output on every span).
2. A post-hoc workflow loads a trace, reconstructs scorer inputs from spans, and runs any scorer on any past trace.
3. Scores attach back to the span (`attachScoreToSpan`, `run/index.ts:205-242`), making Studio's observability view a unified review UI.

**This gives us a concrete pattern for the golden-trace regression suite.** Our suite is:

- A table of `(trace_id, expected_outcome_signature, scorer_id, threshold)`.
- A job that replays each trace against the current runtime — not the HTTP-level replay, but our own prompt-assembly replay — and compares the freshly-assembled prompt + tool sequence against the stored one.
- A second pass that runs deterministic scorers (structural: tool_call trajectory match, response schema validity, sanitization-projection match on known-taint fixtures) against the new run's output.

The mastra pattern shows how to wire it: **each golden trace is a stored trace record; the regression job is a workflow that iterates those trace_ids and fans out per-scorer**. We already have observability storage in the plan; we need the analogue of `__batch-scoring-traces` as a pg-boss job type.

### 2.3 `MastraScorer` step pipeline is over-built for our v1; the shape is right

`preprocess → analyze → generateScore → generateReason` is rich, but our v1 scorers are almost all deterministic: hash compare, schema validate, trajectory diff. We don't need the judge-Agent wiring yet (§16 defers LLM-judge). **But the `{ score, passed, reason }` result contract and the `scoreSource: 'live' | 'trace' | 'experiment' | 'test'` taxonomy are both directly usable.**

Concrete adoption: define our own `SetaScorer` interface:

```typescript
interface SetaScorer<TInput, TOutput> {
  id: string
  kind: 'deterministic' | 'llm-judge'
  run(
    input: TInput,
    output: TOutput,
    opts: { groundTruth?: unknown; source: ScoreSource },
  ): Promise<{ score: number; passed: boolean; reason?: string }>
}
```

`kind: 'llm-judge'` is a declaration-time enum, **not** a runtime check — used to reject LLM-judge scorers as iterative-exit gates (§3.1 from finding 01) and as v1 regression gates (§14 requires deterministic gating). The rejection happens at registration time, not run time.

### 2.4 Sampling: mastra's `{ type: 'ratio', rate }` is our 1% baseline, cleanly expressed

Our §12 "1% baseline, 100% of flagged" is two separate sampling policies composed. Mastra's sampling config is per-scorer, evaluated at hook time (`hooks.ts:36-48`). We should adopt the same shape but extend it:

```typescript
type SetaSamplingConfig =
  | { type: 'none' }
  | { type: 'ratio'; rate: number }
  | { type: 'all-matching'; triggers: SamplingTrigger[] }
  | { type: 'composite'; policies: SetaSamplingConfig[] }
```

`SamplingTrigger` is the exhaustive list from §12 (approval pending, partial answer, re-plan fired, router low confidence, etc.). Composite lets baseline-ratio + all-matching-triggers coexist per scorer. Mastra's `Math.random() < rate` is fine for the ratio type.

### 2.5 Scorer fixtures: ship one golden trace per regression axis

Mastra ships a scorer-level fixture per LLM scorer (`evals/__recordings__/evals-src-scorers-llm-*.json`). **We should ship one golden trace per regression axis**, checked into `docs/fixtures/golden-traces/` or the equivalent. Our §14 already says "hand-curated"; mastra shows the idiom: fixture file, MD5-keyed entries inside, CI-gated reproducibility.

Starter axes for the golden set (from §14 — restating for concreteness):

- One bounded two-phase KPI query.
- One iterative investigation (once §3.1 lands).
- One write-path draft with taint.
- One partial-answer with explicit gap.
- One sanitization-projection adversarial case (known-malicious source, verify sanitizer triggers).
- One router-ambiguity case (confidence below threshold, re-asks).
- One permission-denied cascade.

Size budget: **≤20 total** — mastra ships 7 per scorer × a handful of scorers, similar order of magnitude. Beyond 20, the set stops being hand-curated and becomes untyped regression noise.

### 2.6 Shadow mode: mastra has nothing; we should not anchor on them

The absence is informative. Mastra's iterative loop + scorer harness is sufficient for their library use case without any shadow-execution mode. **Our shadow-ready gateway (`mode: 'execute' | 'dry-run'`) is a Seta-specific requirement driven by v1.5 model swaps and planner changes, not a generic agent-framework concern.** We will not find a template — we are designing it fresh. What mastra does give us:

- A scorer system that runs against any recorded trace. Shadow runs become "run both modes, score both outputs, compare via a scorer." The scorer-per-trace harness is the substrate for shadow comparison.
- Observability spans as the unit of comparison. If both the real run and the shadow run emit a complete span tree, and we have a scorer that diffs two span trees, we have shadow-mode comparison without new primitives.

### 2.7 One gap we hadn't sharpened: the scorer-as-exit-gate tension

Finding 01 raised this; §1.3 here hardens it: mastra's `CompletionConfig` (`loop/network/validation.ts:100-145`) accepts **any** `MastraScorer`. LLM-judge completion scorers are the default (`runDefaultCompletionCheck`). Their determinism story is effectively "replay the HTTP recording and you get the same judge output" — only true for test fixtures.

For production iterative turns, `runDefaultCompletionCheck` means loop termination is LLM-dependent, which couples replay determinism to LLM output stability, which is not a property we can rely on. Our §3.1 (from finding 01) restricts v1 exit gates to deterministic scorers; this is not negotiable and should be enforced at scorer-registration time via the `kind` tag in §2.3.

---

## 3. Proposed edits to agent-runtime.md

### Edit 1 — §8 (Replay harness), add content-hash canonicalization rules

After the content-hash description:

> **Canonicalization before hashing.** Inputs to the content hash are normalized as follows before MD5-16: (a) object keys recursively sorted; (b) ISO-8601 date strings re-parsed through `Date` and re-serialized (canonical Z form); (c) `null` preserved; (d) string primitives unchanged. Rationale: prompt-store entries must hash identically across runs regardless of object-key iteration order or date-string formatting variants. Reference implementation: `mastra/packages/_llm-recorder/src/llm-recorder.ts:370-385`.

### Edit 2 — §8, harden the miss-behavior statement

The spec currently says "errors explicitly on any lookup miss — no silent fallback." Strengthen with the anti-pattern callout:

> **No fuzzy fallback. No console-warning fallback.** A prompt-store or narrative-store miss during replay is a terminating error. Mastra's `_llm-recorder` implements a string-similarity fuzzy fallback with a `console.warn` that still returns a response; this is a test-tool affordance that would be a correctness hole in production replay. Our replay path throws and surfaces the missing hash to the caller.

### Edit 3 — §14, add scorer interface + kind tag

Introduce the SetaScorer shape and the `kind` field:

> **Scorer contract.** Every regression scorer implements:
>
> ```typescript
> interface SetaScorer<TInput, TOutput> {
>   id: string
>   kind: 'deterministic' | 'llm-judge'
>   run(
>     input: TInput,
>     output: TOutput,
>     opts: ScoreOpts,
>   ): Promise<{ score: number; passed: boolean; reason?: string }>
> }
> ```
>
> `kind` is validated at scorer-registration time. v1 regression gates (this §14) and iterative-turn exit gates (§3.1) accept only `kind: 'deterministic'`. `kind: 'llm-judge'` is permitted only in advisory (non-gating) positions until the v1.5 LLM-judge meta-eval (§16) clears it.

### Edit 4 — §14, golden-trace shape + size cap

> **Golden-trace table shape.** Each row: `{ trace_id, expected_outcome_signature, scorer_id, threshold, axis, tenant_fixture_id }`. Traces are full stored production-trace records (same shape as live traces, anonymized) under `docs/fixtures/golden-traces/`. CI fans out per-row: replay the trace against current runtime, run the scorer, fail the build if `score < threshold` for any row with `kind: 'deterministic'`.
>
> **Size cap: ≤20 rows.** Beyond 20, the set stops being hand-curated and becomes regression noise. Starter axes: bounded two-phase, iterative investigation, write-with-taint, partial-answer-with-gap, sanitization-projection adversarial, router-ambiguity, permission-denied cascade. New axes added only by explicit design decision, not opportunistically.

### Edit 5 — §12, sampling config shape

Replace informal sampling prose with the typed shape:

> **Sampling policies** are typed and composable:
>
> ```typescript
> type SamplingConfig =
>   | { type: 'none' }
>   | { type: 'ratio'; rate: number } // baseline (e.g. 0.01)
>   | { type: 'all-matching'; triggers: SamplingTrigger[] } // 100% on trigger list
>   | { type: 'composite'; policies: SamplingConfig[] } // union
> ```
>
> Trigger list is exhaustive and closed: `approval_pending | partial_answer | re_plan_fired | router_low_confidence | taint_bumped | iteration_cap_approaching_p95 | scorer_failed_in_shadow`. Per-scorer and per-capture-stream configuration; the global "1% baseline + 100% flagged" policy composes baseline ratio with all-matching triggers.

### Edit 6 — §12, canary via trace-scoring workflow

> **Quality canary mechanics.** The rolling canary is a scheduled pg-boss job that takes a frozen set of canary queries (rotated quarterly from anonymized production), replays each against the fixture tenant, and runs the deterministic canary scorers. Reuses the same scorer + trace-storage primitives as the golden regression suite — no separate infrastructure. Reference pattern: mastra's `scoreTracesWorkflow` (`packages/core/src/evals/scoreTraces/scoreTracesWorkflow.ts:244-262`), which takes `{ scorerId, targets: [{traceId, spanId}] }` and fans out at concurrency 3.

### Edit 7 — §8, scope clarification on the replay surface

The spec says "deterministically reconstructs full message array per LLM call." Add the complement:

> **Replay reconstructs the assembly inputs, not the HTTP request.** Our replay recovers: (a) prompt fragments by content hash from `agent_prompt_store`; (b) narrative entries by hash from `agent_narrative_store`; (c) memory-window γ/α snapshot from stored router input; (d) tool outputs from trace spans; (e) model + version IDs from the run's `VersionOverrides` snapshot. It does **not** intercept or pin the outbound HTTP body (mastra's approach); it reconstructs what went into the model call, and re-issues the call against the pinned model version. The distinction matters because our per-LLM-call message arrays are runtime-assembled, and the assembly is the interesting thing to audit.

---

## 4. What we are not borrowing

- **Mastra's fuzzy string-similarity fallback on replay miss** (`llm-recorder.ts:673-702`, `SIMILARITY_THRESHOLD = 0.6`). Correctness hole when promoted from test fixtures to production replay. Our spec already rejects this; edit 2 above names mastra specifically so a future contributor doesn't re-add it thinking they found a clever helper.
- **`runDefaultCompletionCheck` as an iterative exit gate** (`loop/network/validation.ts:386-520`). LLM-judge gating of loop termination. See §3.1 (finding 01) and edit 3 above — kind-tag blocks this path in v1.
- **The full four-step scorer pipeline (`preprocess → analyze → generateScore → generateReason`).** v1 needs only `run(input, output) => { score, passed, reason? }`. The expressive pipeline is useful for complex LLM-judge scorers (v1.5). Adopting it now bakes in judge-Agent wiring we don't need.
- **MSW-based HTTP interception for replay.** Test tool, not production tool. Our replay works off stored traces and the prompt/narrative stores, not by intercepting outbound HTTP.
- **Mastra's per-scorer sampling config as-is.** Too thin (`none | ratio` only). Edit 5 extends the shape; we borrow the pattern, not the type.
- **Unbounded scorer timeout default (10 min).** Mastra's `timeout: 600000` default (`validation.ts:240`) is fine for dev. Our production runtime needs scorer wallclock in tens of seconds, enforced at both the scorer and the outer gate.
- **Running scorer results through a workflow engine** (`base.ts:668-794`). Overkill. v1 scorers are async functions; observability spans are emitted by the scorer directly without a full workflow harness.

---

## 5. Open questions

- **Prompt-store population model.** Spec says "self-populates from live traffic on first use." On a miss during a production turn, do we (a) refuse the turn, (b) populate and proceed, or (c) populate-and-proceed in a warmup window, refuse thereafter? Mastra's auto-record-on-first-run gives us one pattern; for production, (c) with a bounded warmup feels right but needs decision.
- **Do we need HTTP-level LLM recording too, for our own dev-test harness?** Mastra's `_llm-recorder` pattern is genuinely excellent for unit tests. Our planned Jest/Vitest harness could adopt the whole package (or the pattern) independent of the runtime replay story. Two separate tools; both worth having; neither blocks the other. Propose: adopt the MSW pattern in our test utilities as a separate workstream, unrelated to §8 prod replay.
- **Trace storage for golden fixtures — Parquet or JSON?** Mastra checks JSON into git (`__recordings__/*.json`). Our trace records are larger (span trees, tool outputs, narrative entries). If we stick to ≤20 golden traces the JSON-in-git model still works; at 100+ traces we need S3 + content-addressed fixtures. v1 answer is JSON-in-git; re-evaluate if the set grows.
- **Score attach-to-span path under our Drizzle schema.** Mastra's `attachScoreToSpan` (`run/index.ts:205-242`) writes to span `links: [{ type: 'score', scoreId, scorerId, score, createdAt }]`. In our Postgres model, score is a separate table with `trace_id`/`span_id` FK; the observability viewer joins on read. Confirm this matches the planned `insights`/observability schema (deferred per spec §1's observability row).
- **How to validate a trace still matches the runtime it was recorded against.** After a version bump, last month's golden trace may reference a sub-agent version that no longer exists. Options: (a) pin the trace to its recorded `VersionOverrides` snapshot and replay with that pin; (b) require golden-trace refresh on version bumps; (c) both. Mastra's `source: DefinitionSource` + `toRawConfig()` (`evals/base.ts:276, 313-315`) shows (a) is the intended pattern for their retrospective scoring. Propose (a) as default with explicit "re-baseline golden trace" as a conscious PR step.
- **Shadow-mode comparison scorer shape.** Given `mode: 'execute' | 'dry-run'` emits two complete traces for the same input, what scorer compares them? Options: (a) span-tree structural diff with tolerance for timing; (b) output-text similarity via embedding distance; (c) routing-decision equivalence only (ignore final text). Probably (c) for planner-change shadow, (b) for model-swap shadow, (a) for regression baseline. Needs a three-scorer suite, not one.

---

## Status

- **Applied to agent-runtime.md:** none yet. The seven edits above are **pending**.
- **Cross-refs:** finding 01 §3.1 (iterative topology exit-gate determinism) depends on edit 3 landing; finding 02 (identity tracking) establishes the version-ID vs. content-hash distinction referenced in §1.9.

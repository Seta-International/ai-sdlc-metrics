# Key 9 — Cost / Usage Tracking

**Mastra area:** `packages/core/src/stream/base/output.ts`, `packages/core/src/observability/types/metrics.ts`, `packages/core/src/observability/types/tracing.ts`, `packages/core/src/loop/workflows/agentic-execution/llm-execution-step.ts`
**Our design area:** `agent-runtime.md` §11 (Delegation caps), §13 (Layered ceilings + rate limits), §12 (Observability)
**Investigation date:** 2026-04-21

---

## 1. How mastra does it

### Usage capture: per-LLM-call, then accumulated into a run-level sum

Every call to a model produces a `LanguageModelUsage` and mastra folds it into a run-scoped counter. `packages/core/src/stream/base/output.ts:1234-1254`:

```ts
updateUsageCount(usage: Partial<LanguageModelUsage>) {
  if (!usage) return;
  if (usage.inputTokens !== undefined) {
    this.#usageCount.inputTokens = (this.#usageCount.inputTokens ?? 0) + usage.inputTokens;
  }
  // ... outputTokens, totalTokens, reasoningTokens, cachedInputTokens
}
```

`totalUsage` on the run is literally the summed counter (`output.ts:1525-1540`). There is no notion of "turn" — mastra accumulates over an entire `.generate()` / `.stream()` call. If a user's product wants per-turn usage, it reads the final object; if it wants per-step, it listens to `onStepFinish` (`stream/types.ts:895-897`).

### Usage surface explicitly includes cache fields (OpenInference-shaped)

The canonical usage shape in observability (`observability/types/tracing.ts:153-191`):

```ts
export interface InputTokenDetails {
  text?: number
  cacheRead?: number // cache hit / read
  cacheWrite?: number // Anthropic cache creation
  audio?: number
  image?: number
}
export interface OutputTokenDetails {
  text?: number
  reasoning?: number // o1 / Claude thinking / Gemini thoughts
  audio?: number
  image?: number
}
export interface UsageStats {
  inputTokens?: number
  outputTokens?: number
  inputDetails?: InputTokenDetails
  outputDetails?: OutputTokenDetails
}
```

`packages/core/src/stream/types.ts:878-887` extends AI SDK's `LanguageModelV2Usage` with `reasoningTokens` and `cachedInputTokens` at the top level, and preserves the provider's raw payload in `raw?: unknown` for "advanced use cases" (i.e. anything mastra didn't normalise).

**Important downgrade case:** the AI SDK v4 path (`packages/core/src/stream/aisdk/v4/usage.ts:19-28`) converts v4 usage and **drops `cachedInputTokens` entirely** — only `promptTokens` / `completionTokens` survive. v4 callers silently lose cache visibility.

### No pricing table, no cost computation in core

Grep for `pricePerToken|tokenPrice|costPer|priceTable` in `packages/core/src` returns zero application code; the only "pricing" hits in `llm/model/provider-registry.json` are **`docUrl`** pointers to each vendor's public pricing page (lines 954, 2387, 3109, 4224, 4519). Mastra core does not ship a price table, does not compute dollar cost, and does not know what cache-read tokens cost relative to fresh tokens.

### `CostContext` is a transport envelope, not a cost engine

`packages/core/src/observability/types/metrics.ts:60-66`:

```ts
export interface CostContext {
  provider?: string
  model?: string
  estimatedCost?: number // already computed by caller
  costUnit?: string // 'usd' in tests
  costMetadata?: Record<string, unknown>
}
```

The `estimatedCost` number arrives from _outside_ core. The record-builder simply passes it through to storage — `packages/core/src/storage/domains/observability/record-builders.ts:258-262`:

```ts
provider: cost?.provider ?? null,
model: cost?.model ?? null,
estimatedCost: cost?.estimatedCost ?? null,
costUnit: cost?.costUnit ?? null,
costMetadata: cost?.costMetadata ?? null,
```

Tests (`record-builders.test.ts:45-54`) confirm the shape: `pricing_id: 'openai-gpt-4o-mini'`, `tier_index: 0`, `estimatedCost: 0.00123`. The pricing lookup / multiplication lives in Mastra Cloud, not in OSS — the metric names `mastra_model_total_input_tokens`, `mastra_model_input_cache_read_tokens` are referenced only by `playground/src/domains/metrics/hooks/use-model-usage-cost-metrics.tsx:25-29` (a paid dashboard frontend) and test fixtures; the OSS `MetricsContext` ships as **no-op** by default (`observability/no-op.ts:71-73`).

### Ceiling enforcement: only `maxSteps` / `stopWhen`, nothing cost-aware

`packages/core/src/loop/types.ts:129-130`:

```ts
stopWhen?: StopCondition | Array<StopCondition>;
maxSteps?: number;
```

`stopWhen` is re-exported from AI SDK v5/v6. The stock primitives used across mastra's test suite are `stepCountIs(N)` (iteration cap) and `hasToolCall(name)`. Grep for `tokenCountIs` in `loop/` returns zero hits — mastra never gates a turn on tokens spent, let alone dollars spent.

The `TokenLimiterProcessor` at `packages/core/src/processors/processors/token-limiter.ts:9-60` _looks_ cost-adjacent but is a context-window trimmer (input processor) or a response-length cap (output processor). Strategy is `'truncate' | 'abort'`; it counts with `tiktoken` locally, not against a budget.

### Fallback is error-driven, not cost-driven

`packages/core/src/loop/workflows/agentic-execution/llm-execution-step.ts:620-658`:

```ts
function executeStreamWithFallbackModels<T>(models, logger, startIndex = 0) {
  return async (callback) => {
    for (const modelConfig of models.slice(startIndex)) {
      try {
        /* run */ done = true
      } catch (err) {
        if (err instanceof TripWire) throw err // intentional aborts re-raise
        lastError = err
        logger?.error(`Error executing model ${modelConfig.model.modelId}`, err)
      }
    }
    if (typeof finalResult === 'undefined') {
      throw new Error(`Exhausted all fallback models. Last error: ${lastErrMsg}`)
    }
  }
}
```

If the primary 500s, credential-errors, or rate-limits, the loop falls through to the next model in the array. There is no "primary is too expensive for this tenant, downshift to nano" path. The ladder is hardcoded per call site, not per-tenant-tier.

### Refusal vs abort: not a distinguished concept

`finishReason` values in the chunk stream are the AI SDK union (`'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other' | 'unknown'`) plus mastra's `'tripwire'` (set by processors like guardrails). Grep for `budget|refused|refuse|quota|throttle` across `packages/core/src/agent/` returns only test fixtures — there is no vocabulary for "pre-turn refusal" vs "mid-turn abort". A tripwire `reason` string is free-form (`packages/core/src/agent/trip-wire.ts:35-40`).

### Rate-limiting primitives: none

Grep for `rate.?limit|throttle|leaky|token.bucket|per.user.*day|per.tenant|daily.limit|quota` across `packages/core/src/`: zero production-code matches. The hits that exist are inside vendor-side `429` handling for retries (AI SDK territory) and vector-store TTL docs. Mastra has no opinion on per-user-per-minute or per-tenant-per-day abuse limits — that is assumed BYO.

### Cardinality-blocked labels for metrics

`packages/core/src/observability/types/metrics.ts:131-140`:

```ts
export const DEFAULT_BLOCKED_LABELS = [
  'trace_id',
  'span_id',
  'run_id',
  'request_id',
  'user_id',
  'resource_id',
  'session_id',
  'thread_id',
] as const
```

High-cardinality IDs never become metric labels by default. Correlation happens via the `traceId` / `spanId` top-level fields on `ExportedMetric`, not via labels. This matters for us: we cannot build "per-user daily spend" by pivoting on a metric `user_id` label — mastra's design forces the aggregation to happen downstream by joining metric rows to span rows.

### Usage lives on child spans, never aggregated on the run root

Design intent, quoted at `observability/types/tracing.ts:444-447`:

> Note: token usage / cost lives ONLY on `RAG_EMBEDDING` child spans. Aggregating at the root would double-count when an exporter sums child spans. Mirrors how `AGENT_RUN` does not carry aggregated `MODEL_GENERATION` usage.

So the cost truth is the set of `MODEL_GENERATION` spans, summed downstream. The `AGENT_RUN` span is intentionally usage-free so exporters don't double-count.

---

## 2. What this tells us

**Mastra is a data-capture framework, not a budget framework.** It normalises usage shape (including cache read/write and reasoning tokens), plumbs a per-span `CostContext` envelope, and stops there. Every interesting decision in our §13 — dollar denomination, pricing table, cache-hit billing, tiered degradation, per-user-per-day, refusal-vs-abort, admin notifications, top-ups — is product concern that lives **above** mastra.

The expected finding is confirmed: we will **not borrow** a ceilings subsystem, because there isn't one. What we _will_ borrow:

1. **Usage shape.** `UsageStats` with `inputDetails.cacheRead / cacheWrite` and `outputDetails.reasoning` is the right normalisation and matches OpenInference. Our §13 treats "cached tokens" as a single billing adjustment — mastra's shape forces us to consider cache _write_ (Anthropic prompt-caching creation cost, which is higher than input) separately from cache _read_. Our current spec only mentions reading `cached_tokens` — it misses cache-write pricing entirely.
2. **`CostContext` transport pattern.** Carrying `{provider, model, estimatedCost, costUnit, costMetadata.pricing_id}` on every emitted cost event is cleaner than our current approach of embedding cost fields inline with spans. It lets pricing evolve without changing span schemas.
3. **Pricing snapshot via `pricing_id` + `tier_index`.** Mastra's test fixture stamps `pricing_id: 'openai-gpt-4o-mini'` + `tier_index: 0` on every cost event. This is the point-in-time price reference. Auditability trumps "lookup current price" for our compliance story.
4. **Usage lives on child spans, never the root.** Our §12 currently says we aggregate turn cost on the turn span. Mastra's rule ("don't aggregate on root — exporters double-count") is correct — we should only put usage on `MODEL_GENERATION`-equivalent spans and compute turn totals at query time. This also preserves the "turn was cheap, sub-agent was expensive" attribution.
5. **Cardinality-blocked label list.** `DEFAULT_BLOCKED_LABELS` is a smart guardrail we should copy for our metrics export (if/when observability lands). Our current §13 is silent on this — it would be easy for a future engineer to slap `user_id` on a Prometheus-shaped label and create a cardinality bomb.
6. **v4 usage conversion is a cautionary tale.** The v4 converter at `aisdk/v4/usage.ts:19-28` silently drops `cachedInputTokens`. Our ingestion code must refuse any usage payload that didn't carry explicit cache fields when the provider supports them — a missing field is a bug to alert on, not a zero to assume.

Two things mastra does that are worth calling out as design choices we are making differently:

- **Error-driven fallback ladder vs tier-shift on budget.** Mastra's fallback kicks on vendor errors. Our §13 "95% → nano-only" is a _budget-tier_ shift, not an error fallback. These should be distinct mechanisms — our spec should make that explicit, because naming them both "fallback" in future docs will confuse them.
- **No pre-turn gate.** Mastra has no concept. We do (`pre-turn refusal if remaining < $0.10`). Our approach here is correct for a product with quotas; mastra's absence is correct for a framework without them.

---

## 3. Proposed edits (to `agent-runtime.md`)

### §13 — add cache-write as a separate billing line

Current spec says "read `cached_tokens` from provider responses, bill at cached rate". This conflates Anthropic's `cacheCreationTokens` (cache _write_, priced at 1.25× input) with `cacheReadTokens` (priced at 0.1× input). Rewrite to:

> **Cache-aware token accounting.** Every usage payload is normalised into `{inputTokens, outputTokens, inputDetails: {text, cacheRead, cacheWrite, audio, image}, outputDetails: {text, reasoning, audio, image}}`. Each detail field is priced independently from a frozen `pricing_id` snapshot (see below). `cacheWrite` is a one-time cost at ≈1.25× input on the first occurrence of a cached prefix; `cacheRead` is ≈0.1× input on subsequent hits. Conflating the two under-charges cache writes.

### §13 — stamp `pricing_id` + `priced_at` on every cost event

Add:

> **Pricing snapshot.** Every cost row includes `pricing_id: string` (e.g. `openai-gpt-5.4-2026-03`) and `priced_at: Date` referencing the pricing-table version used for the multiplication. Re-pricing historical usage is therefore cheap (swap the row) and audit-safe (old values are recoverable). The price table is versioned; a new vendor price bump produces a new `pricing_id`, never an in-place mutation.

### §12 / §13 — child-span usage, never run-root

Add a normative rule to §12 (Observability):

> **Usage lives on leaf spans only.** `agent.turn` and `agent.session` spans do not carry aggregated token / cost attributes. Usage is stamped on `llm.call` and `tool.call` spans. Turn-level totals are computed at query time by summing descendants. This prevents double-counting when spans are exported to external backends that pre-aggregate.

Cite mastra's rule as prior art in §17.

### §13 — explicit rate-limit-label cardinality guardrail

Add a half-paragraph to the rate limits sub-section:

> **Metric label cardinality.** High-cardinality identifiers (`user_id`, `resource_id`, `tenant_id`, `thread_id`, `trace_id`, `span_id`, `run_id`, `request_id`, `session_id`) are **blocked** as metric labels by default. Per-user / per-tenant rate-limit telemetry is computed by joining metric rows to span rows on `trace_id`, not by emitting a metric with `user_id` as a label.

### §13 — rename "fallback" on the budget path

The spec currently overloads "fallback". Clarify:

> **Budget tier-shift** (95% of daily tenant cap → nano-only) is distinct from **provider fallback** (primary 5xx / 429 → next in ladder). Both exist, both can fire in the same turn. Tier-shift is a policy decision; provider fallback is an error recovery. They log distinct reasons: `finish_reason: 'tier_shift'` vs `finish_reason: 'provider_fallback'`.

### §13 — v4 SDK usage guard

Add a single sentence as an implementation note:

> **Adapter validation.** Any LLM-adapter that maps a vendor response to our `UsageStats` must error-log (not zero-default) when the vendor reported cache fields that the adapter cannot project. A silent drop here (as in AI SDK v4's converter) will under-charge tenants.

### §17 — Prior-art addendum

One paragraph attributing mastra:

> **Mastra** ships a normalised `UsageStats` shape with cache-read/cache-write/reasoning detail, a `CostContext` envelope (`provider`, `model`, `estimatedCost`, `costUnit`, `costMetadata.pricing_id`), and a default cardinality-blocked label set. It deliberately keeps usage on leaf spans (never on the run root) to avoid double-counting in downstream exporters. Mastra does **not** ship ceilings, pricing tables, tiered degradation, rate limits, or refusal/abort semantics — these are product concerns the framework leaves to the caller.

---

## 4. What we are not borrowing

- **Mastra's no-op default `MetricsContext`** (`observability/no-op.ts:71-73`). We need real metrics from day one; defaulting to silent-drop hides cost bugs. Our `MetricsContext` equivalent is a required dependency, not an optional decoration.
- **The `estimatedCost: number` pass-through pattern with no priced-at anchor.** Mastra trusts the caller's number and stamps `pricing_id` in `costMetadata`. We make the snapshot fields first-class (`pricing_id`, `priced_at`) and compute cost in-process from `(usage, pricing_snapshot)` — never accept an externally-computed cost blindly. Admin top-ups are the one exception, and those carry their own audit trail (kernel audit events per §13).
- **`stopWhen: stepCountIs(N)` as the only stop mechanism.** Our iteration cap (§13, 4-5 per sub-agent) is a backstop, not the primary gate. We also need: `remainingBudgetLt(min)`, `toolFailuresGe(2)`, `wallclockGt(30s)`, `delegationDepthGe(max)`. These are first-class stop conditions in our loop, not external decorators.
- **`TokenLimiterProcessor`'s tiktoken-based local counting for budget.** Local token counts drift from vendor-reported counts by ~3-8% in our testing (tokenizer version mismatches). Budget math must use vendor-reported usage from the completion response, never pre-computed local estimates.
- **AI SDK v4 usage-conversion path.** Our adapters target v5+ only. v4 silently drops cache data — unacceptable for cost accuracy. No legacy-v4 support ships.
- **Free-form tripwire `reason` strings.** Mastra lets tripwires emit any string. Our refusal/abort reasons are an enum (§13: `refused | budget | wallclock | iterations | tool_failures | delegation_cap | tier_shift | provider_fallback | user_abort | internal`). Enforcement at the type level, queryable by ops.

---

## 5. Open questions

1. **Cache-write pricing under aggregation.** Anthropic prompt caching bills cache-write once per unique prefix. If two concurrent turns for the same user write overlapping cache keys, does the provider bill twice or dedupe? We need to confirm before our cost math claims accuracy — otherwise we over- or under-estimate.
2. **Who computes `estimatedCost` in our architecture — the adapter or a dedicated pricer service?** If the adapter computes (mastra-style), every adapter needs the price table, duplicating the config. If a pricer service computes (centralised), every span emit adds a hop. §13 should state this explicitly; current spec is ambiguous.
3. **Do we want `onStepFinish`-equivalent hooks for mid-turn cost inspection?** Mastra exposes `MastraOnStepFinishCallback` (`stream/types.ts:895-897`) with per-step usage. We could use this to cut a turn short at the iteration boundary instead of waiting for the next pre-iteration gate. Trade-off: more hooks = more places for product logic to leak into the runtime.
4. **Pricing table versioning strategy.** Monthly freeze with manual bumps? Auto-pull from a vendor feed? What is the SLA for incorporating a vendor price change (OpenAI drops by 20% — how fast do we re-price running tenants)? §13 mentions "admin top-ups audited" but says nothing about table updates.
5. **Reasoning tokens as a separate budget line.** Our §13 currently lumps reasoning into output tokens. For o1/Claude-thinking workloads, reasoning is often 3-5× the output. Should we bill reasoning at a separate rate (matching vendor's reasoning price) and expose it as a distinct ceiling axis (e.g., "no more than 50% of budget on reasoning for non-delegation turns")? Mastra captures the field separately but does not bill separately.
6. **Rate-limit storage backend.** Our §13 defines the policy but not the substrate. Redis (fast, ephemeral) vs Postgres row-with-RLS (durable, audit-friendly) vs in-memory-with-db-replica (ECS task local)? Decision affects whether rate limits survive a pod restart.

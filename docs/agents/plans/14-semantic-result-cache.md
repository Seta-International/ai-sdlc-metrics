# 14 — Semantic Result Cache

**Design §§:** §7 "Semantic result cache" subsection (authoritative spec); §5 (L1 relationship); §7 "Tool-result caching within a turn" (L1 contrast); §12 (observability); §13 (cost accounting).

**Phase:** MVP — opt-in per tool; activates on first production turn.

**Status:** Pending.

---

## 1. Scope

### In

- Per-tenant, per-tool, cross-turn, cross-sub-agent read-result cache keyed by canonical args hash with semantic-match fallback.
- TTL enforcement via declaration on tool meta (`cacheable.ttlSeconds`) with background sweep + read-time expiry check.
- Coarse domain-scoped invalidation: any `.mutation()` on a domain purges the semantic-cache partition for read tools in that domain (§7).
- Eligibility drift test asserting that `cacheable` never attaches to `.mutation()` procedures (piggybacks on plan 01's tool-meta drift harness).
- Gateway pipeline insertion point: new cache lookup step between Resolve and Ceiling pre-check for tools where `cacheable` is set; new cache put step after successful Invoke (§7 pipeline).

### Out

- Caching of `.mutation()` results (forbidden — §7 "Opt-in per tool").
- Cross-tenant cache sharing or pooling (violates Tenet #1).
- Agent-writable cache entries: only the gateway puts; the LLM cannot synthesize cache rows.
- Pre-warming / speculative population / predictive prefetch.
- Consistency guarantees stronger than "at-most-one-TTL stale after a missed invalidation" — the cache is a performance layer, not a consistency layer (§7 L1 principle extended).

---

## 2. Design Context

Three layered read caches coexist by design; each plan owns one layer:

- **L1 (plan 04, §5, §7 "Tool-result caching within a turn"):** per-sub-agent, per-turn, exact-key, RAM-only. Dies at turn end. Zero embedding cost, sub-millisecond hit.
- **Semantic cache (this plan, §7):** per-tenant, cross-turn, cross-sub-agent, exact-key + semantic-match fallback, persistent. TTL-bounded. Opt-in per tool.
- **Out of scope for runtime:** HTTP-layer response caching on the tRPC surface. Different trust boundary (caller-identified, not tenant-identified aggregate), different invalidation model, different cost profile. Do not conflate.

**Why layered exact-then-semantic, not semantic-only.** Semantic lookup requires an embedding call on the request-path args — a real cost and latency tax. Most repeat hits on the same tool within a tenant come from the exact same canonical args (e.g. `planner.getMyTasks({ horizon: 'today' })`). Exact-key hit sidesteps the embedding round-trip entirely. Semantic-match is reserved for near-identical queries that would otherwise miss — e.g. phrasing variance in search args. Cost analysis in §10.

**Why cross-turn, cross-sub-agent (unlike L1).** Read traffic in the target modules (planner, people, projects) is dominated by stable reference queries (team list, task list, project roster) that repeat across users and across turns within a tenant. L1's per-turn scope cannot amortize that. A per-tenant cache with coarse invalidation converts the n-th call into a lookup rather than an LLM-driven redundant DB scan. The §7 correctness-over-hit-rate invalidation rule trades cache hit rate for an absence-of-footgun property: a write in the domain always invalidates stale reads in the domain, full stop.

**Why not finer-grained invalidation.** Per-entity cache-key tracking (e.g. "this cache row depends on `task_id=42`") is a mature-system optimization. At MVP the tool surface is narrow enough that domain-coarse invalidation produces acceptable hit rates without the dependency-graph machinery. Revisit at Beta if metrics show invalidation-churn dominating hit rate.

---

## 3. Data Model

### `agent_tool_result_cache` (new table)

Intent (spec-level; DDL lives in migration):

- `tenant_id` — RLS partition key. Every row carries it; RLS policy enforces read/write only by matching session tenant (Tenet #1).
- `tool_name` — fully-qualified agent-exposed tool identifier. Combines with `tenant_id` and canonical-args hash to form the exact-lookup key.
- `canonical_args_hash` — content hash of the canonical-JSON serialization of the invocation args (plan 01's canonicalizer is the single source of truth; non-deterministic hashing silently defeats the cache).
- `semantic_embedding` — embedding of the canonical args representation used for nearest-neighbor fallback. Provider/model identifier stamped on the row so cache entries generated with a stale model version are ignored on retrieval (self-invalidation on model version bump).
- `result` — structured tool result as stored pre-render (§7 "Tool results stored pre-render"). Tenant-authored free-text fields are already redacted/wrapped per the tool's `tenantAuthoredFreeText` contract — the cache never stores pre-redaction data.
- `stored_at` — insertion timestamp; combined with `ttl_seconds` drives read-time expiry check and sweeper eligibility.
- `ttl_seconds` — copy of `cacheable.ttlSeconds` from tool meta at put time. Persisted so a subsequent shortening of the meta TTL does not retroactively extend stored rows.

### Indexes

- Exact-lookup B-tree on `(tenant_id, tool_name, canonical_args_hash)` — partial where not expired. The hot path hits this index; sub-10ms p99 target (§10).
- Vector index on `semantic_embedding` partitioned (logically) by `(tenant_id, tool_name)` for nearest-neighbor fallback. Implementation choice (pgvector IVF/HNSW) left to infra; distance metric cosine.

### RLS + constraints

- `relforcerowsecurity=true`; policy permits insert/select where session `tenant_id` matches row `tenant_id`.
- Cross-tenant lookup is structurally impossible at the DB layer regardless of code-path bugs above.
- No FK to tool-owning domain tables — cache is orthogonal to domain schemas and participates in no cross-schema integrity relationships (CLAUDE.md "No FK constraints across schema boundaries").

---

## 4. Interface Contracts

Spec-level shapes; exact type definitions belong to implementation.

### `SemanticResultCache.get`

Inputs: `{ tenantId, toolName, args }`.

Output: `CacheHit | undefined`. `CacheHit` carries the stored `result`, a `hitKind` discriminator (`'exact' | 'semantic'`), and the `stored_at` timestamp for observability. `undefined` is returned on miss or on any internal error (fail-open — a cache outage must never block a tool call).

### `SemanticResultCache.put`

Inputs: `{ tenantId, toolName, args, result, ttlSeconds }`.

Output: fire-and-forget from the caller's perspective. The put path computes the embedding, writes the row, and emits the relevant observability attribute. A put failure is logged and non-fatal to the originating tool call.

### `SemanticResultCache.invalidateDomain`

Inputs: `{ tenantId, domain }`.

Output: count of rows purged (for observability). Invoked by the gateway's audit-emit step after any successful `.mutation()`, resolving the domain from the tool's module owner. Coarse by design (§7).

### Tool meta extension

Tool-meta shape from plan 01 gains `cacheable?: { ttlSeconds: number }`. Presence on a `.mutation()` procedure is a drift-test failure at CI (plan 01 drift infrastructure).

---

## 5. Control Flow

### Tool invocation with cache (gateway pipeline, §7 steps)

1. **Resolve** (plan 01 step 1) — look up procedure; confirm agent-exposed and in scope.
2. **L1 check** (plan 04) — if hit, return; skip remainder of pipeline side-effects consistent with plan 04's semantics.
3. **Semantic-cache check (this plan):** if tool's meta carries `cacheable`:
   1. Canonicalize args; compute hash.
   2. Exact lookup on `(tenantId, toolName, canonical_args_hash)`; if row is not expired, return as `hitKind: 'exact'`.
   3. On exact miss, compute embedding of canonical args; nearest-neighbor lookup within the tenant+tool partition; if nearest is within the configured distance threshold and not expired, return as `hitKind: 'semantic'`.
   4. On miss or expired match, proceed.
4. **Taint-wrap, Ceiling pre-check, Pre-write abort-signal check, Invoke** — unchanged (plan 01 steps 2–5).
5. **Cache put (this plan):** on successful invoke for a `cacheable` tool, enqueue an out-of-band put with the pre-rendered result. Failure is non-fatal.
6. **Audit emit** (plan 01 step 6) — unchanged. For `.mutation()` procedures, the audit step also fires `SemanticResultCache.invalidateDomain` for the procedure's owning domain.

### Observability stamping

Every cacheable tool call gets `cache_coalesced: true|false` and `cache_hit_kind: 'exact' | 'semantic' | 'miss'` stamped on the `gateway:semantic-cache` child span (§7 "Every step is a child span").

---

## 6. Requirements

| #       | Requirement                                                                                                                                                                 | Design §§     |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| R-14.1  | `agent_tool_result_cache` carries `tenant_id` on every row with RLS `relforcerowsecurity=true` enforcing per-tenant isolation.                                              | §7, Tenet #1  |
| R-14.2  | `cacheable` on tool meta is rejected on `.mutation()` procedures by the plan 01 tool-meta drift test.                                                                       | §7            |
| R-14.3  | TTL is enforced both at read time (expired rows are treated as miss) and by a background sweeper (bounded retention regardless of traffic).                                 | §7            |
| R-14.4  | Exact-key lookup is attempted before any embedding compute; semantic-match fallback fires only on exact miss.                                                               | §7 "Keying"   |
| R-14.5  | Semantic-match accepts only hits within a configurable per-tool distance threshold; default is conservative (high precision, low recall) and tuneable per tool meta.        | §7 "Keying"   |
| R-14.6  | Any successful `.mutation()` on a domain invalidates the semantic-cache partition for read tools in that domain.                                                            | §7            |
| R-14.7  | Every cacheable invocation stamps `cache_coalesced` and `cache_hit_kind` on its `gateway:semantic-cache` child span; non-cacheable invocations omit the step entirely.      | §7, §12       |
| R-14.8  | Cache get failures (DB unreachable, embedding provider outage) are fail-open: the tool call proceeds as if on a miss.                                                       | §7 L1 analogy |
| R-14.9  | Cache put stores only the pre-rendered, already-redacted tool result; `tenantAuthoredFreeText` fields are wrapped at inject time per §7 and never at storage time.          | §7            |
| R-14.10 | Cached rows carry the embedding model identifier used at put time; retrieval ignores rows stamped with a model ID other than the currently-configured one (version safety). | §7            |

---

## 7. Failure Modes & Recovery

| Failure                                                          | Symptom                                                                                 | Recovery                                                                                                                                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embedding provider outage on put                                 | Semantic row cannot be written                                                          | Fall back to exact-only put (row stored without `semantic_embedding`); logged. Exact-key hits continue to work; semantic-match recall degrades until provider recovers. |
| Embedding provider outage on get                                 | Cannot run nearest-neighbor query                                                       | Exact lookup still runs. Semantic fallback is skipped. Tool call proceeds; no correctness impact.                                                                       |
| Invalidation lag after a mutation (e.g. worker stall)            | Read hits within the domain may return at-most-one-TTL stale data for up to TTL seconds | TTL bounds the window; the cache is explicitly a performance layer, not a consistency layer (§7 principle). Sweeper catches any orphaned rows.                          |
| Vector index corruption                                          | Semantic lookups fail or return implausible neighbors                                   | Drop the cache partition for affected tenants and rebuild — cache loss is acceptable; cache is reconstitutable from traffic.                                            |
| TTL shortened in tool meta post-hoc                              | Stored rows retain original (longer) TTL                                                | Persisted `ttl_seconds` per-row — no retroactive extension. Operator can force a sweep to align with new meta.                                                          |
| Distance threshold mis-tuned (too loose, returns wrong neighbor) | Semantic hit on an unrelated query; tool result no longer matches intent                | Threshold is per-tool-meta, conservative default. Golden-trace CI (plan 10) catches observable drift in tool output on canary. Tuning is opt-in — no auto-relaxation.   |
| DB unavailability on the cache path                              | Every cacheable get/put errors                                                          | Fail-open: tool calls proceed without caching. Alert on sustained error rate, not on a single failure.                                                                  |

---

## 8. Observability Surface

- **Span:** `gateway:semantic-cache` as a child of the tool-call span, with attributes `cache_coalesced`, `cache_hit_kind`, `cache_distance` (on semantic hit), `cache_stored_at_age_seconds`.
- **Metrics:**
  - `agent_semantic_cache_hit_rate{tool_name, hit_kind}` — exact vs semantic vs miss.
  - `agent_semantic_cache_invalidation_lag_seconds` histogram — time from `.mutation()` commit to cache partition purge completion.
  - `agent_semantic_cache_cost_saved_usd` — estimated cost saved per hit (tool's observed median cost × hit count).
  - `agent_semantic_cache_put_failures_total{reason}` — embedding outages vs DB errors.
- **Dashboard:** cache hit-rate by tool (stacked exact/semantic), invalidation-lag p99, cost-saved rollup for the MVP enabled tools.

---

## 9. Security Considerations

- **Cross-tenant leakage is structurally impossible.** RLS + `tenant_id` on every row + per-tenant partition in indexes. A code-path bug cannot return another tenant's row; the DB enforces.
- **Cached results are already-sanitized.** Tool results stored pre-render (§7); `tenantAuthoredFreeText` wrapping is an inject-time concern. The cache never handles raw unwrapped free text.
- **Intra-tenant cache poisoning.** An adversarial caller within a tenant could try to shape args so a chosen result gets cached, hoping other users hit it. Scope: self-scoped. Cache rows are tenant-scoped, and any other user's call hits `canDo` + RLS on the tool anyway — the cached row does not encode a permission. A poisoned hit is a correctness risk (wrong content), not a permission escalation.
- **No new egress surface.** Embedding calls for cache keying are the same provider path as plan 02.5's dynamic tool retrieval; no new vendor relationship.
- **Model-version confusion.** Embedding model identifier on each row prevents a mid-flight vendor swap from silently returning neighbors computed against a different embedding space (R-14.10).

---

## 10. Performance Budget

- **Exact lookup p99:** < 10 ms (single indexed read).
- **Semantic lookup p99:** < 40 ms including embedding round-trip. Embedding compute dominates; cache skips this on exact hits.
- **Put path:** out-of-band relative to the tool-call latency path — the user-facing turn does not wait on put completion.
- **Storage:** bounded by TTL × traffic. At MVP's 5–10 instrumented tools and target tenant sizes, steady-state rows per tenant estimated in the low tens of thousands — trivial for Postgres.
- **Cost per hit saved:** for the planner/people/projects read tools, median tool cost is dominated by DB round-trip + `canDo` resolution; cache-saved cost is measured in `cost_saved_usd` for traceability but is primarily a latency and DB-load optimization.

---

## 11. Testing Strategy

- **Unit:**
  - Canonicalization parity: the cache's canonical-args hash matches plan 01's canonicalizer for identical args; differs for args that should differ (order of list elements is treated per canonicalizer rules).
  - Exact hit returns stored result with `hitKind: 'exact'`.
  - Semantic hit within threshold returns `hitKind: 'semantic'`; outside threshold misses.
  - TTL expiry: a row past `stored_at + ttl_seconds` is treated as miss on read and is swept by the background job.
  - Fail-open: simulated DB unreachable on get → tool call proceeds; no exception propagates.
- **Integration (real DB):**
  - Two-tenant seed — tenant A puts a result; tenant B's lookup with identical args must miss (RLS verified).
  - Domain invalidation — a `.mutation()` on tool in domain `projects` purges cache rows for every `cacheable` read tool in `projects` and leaves `people`/`planner` untouched.
  - Pipeline step ordering — cache check runs after Resolve and before Ceiling pre-check (plan 01's span-ordering assertion harness).
- **Property:**
  - Semantic distance is symmetric: `d(a, b) == d(b, a)` for any stored row pair (guard against an asymmetric distance metric silently breaking nearest-neighbor).
  - Exact-key hits always take precedence over semantic-match hits when both would match — for any stored row pair within threshold, exact wins.
- **Drift (CI):**
  - Scanning tool-meta registry for any `.mutation()` bearing `cacheable` fails the build (piggybacks plan 01's tool-meta drift harness).

---

## 12. Acceptance Criteria

- Cache hit-rate dashboard shows ≥ target hit rate (target value pinned per-tool in plan 14 rollout tracker; MVP goal ≥ 30% for enabled tools) within the first 7 days of traffic.
- Two-tenant seed integration test produces zero cross-tenant hits across 10k synthesized lookups.
- Invalidation-lag p99 observed in production < TTL for every enabled tool (i.e. the invalidation path is faster than natural expiry).
- All R-14.x requirements have at least one test asserting them; coverage threshold (≥70%, CLAUDE.md) met.
- Golden-trace CI (plan 10) passes with semantic cache enabled on the MVP tools — no behavioral drift on the canary suite.

---

## 13. Rollout Plan

1. Ship the cache infrastructure with the enabled-tool set empty; `cacheable` meta present on zero tools. Verifies the get/put/invalidate plumbing without changing runtime behavior.
2. Opt-in first tool (e.g. `people.getMe`) via a PR that adds `cacheable: { ttlSeconds }` to its meta. Observe hit rate + invalidation lag for 24h.
3. Expand to remaining 4–9 MVP tools (`planner.getMyTasks`, `projects.list`, etc.) one at a time. Per-tool PR review covers distance-threshold choice and TTL rationale.
4. Backout path: removing `cacheable` from a tool's meta disables the step for that tool immediately. The stored rows expire naturally or are swept.

---

## 14. Dependencies

- **Plan 01 (gateway pipeline + tool meta):** provides the pipeline insertion point, canonical-args hashing, and the tool-meta drift harness used for `cacheable`-on-`.mutation()` rejection. Hard dependency.
- **Plan 04 (L1 cache):** the layered-cache ordering (L1 first, semantic second) is defined relative to plan 04's semantics. Hard dependency on conceptual ordering; no code coupling.
- **Plan 07 (observability):** supplies the span/trace infrastructure and metric-emission conventions used by R-14.7 and §8. Hard dependency.
- **Plan 10 (harness/replay/golden-trace CI):** used as the drift safety net when enabling the cache on each tool. Soft dependency — cache can ship without it, but rollout expansion should not.

---

## 15. Integration Points

- `modules/agents/infrastructure/cache/` — cache repository, get/put/invalidate implementation, sweeper.
- `modules/agents/infrastructure/schema/` — `agent_tool_result_cache` table and RLS policy.
- Gateway pipeline (plan 01) — the new `gateway:semantic-cache` step between Resolve and Ceiling pre-check; cache-put side-effect after Invoke; invalidation trigger bundled with Audit emit on `.mutation()`.
- Embedding provider (shared with plan 02.5 dynamic tool retrieval) — single client, single configuration source.
- Kernel audit — invalidation events may be surfaced as kernel-audit signals for forensic replay. Open question (§18) — may be log-only.

---

## 16. Activation Gate

MVP first-production-turn. Ship with 0 enabled tools; enable 5–10 high-volume read tools incrementally as part of MVP. Target initial enabled set: `planner.getMyTasks`, `projects.list`, `people.getMe`, and two to three further candidates selected from MVP traffic once observed.

---

## 17. Out of Scope

- Write-through caching of mutation results.
- Cross-tenant cache pooling of any kind.
- Pre-warming, speculative population, or predictive prefetch of likely-future queries.
- Per-entity fine-grained invalidation (dependency tracking of "this row depends on entity X"). Beta reconsideration if domain-coarse invalidation proves too chatty.
- LLM-driven cache writes — only gateway puts; the agent cannot synthesize cache rows.
- A cross-agent or cross-user personalization dimension in the cache key. Cache rows are per-tenant, not per-user — correctness comes from callers' `canDo` + RLS re-check on the tool path, which is unchanged whether a result is cached or fresh.

---

## 18. Open Questions

- **Invalidation as kernel audit event or log-only?** Emitting a kernel audit on every domain-invalidation preserves forensic replay symmetry with other gateway events. Concern: chattiness (write-heavy tenants generate one event per mutation × N read tools in the domain). Proposal: log-only at MVP with a per-tenant daily roll-up; revisit at Beta if forensic replay surfaces a need.
- **Distance-threshold calibration.** Seed conservative defaults from MVP traffic observation, or require every opt-in tool to set an explicit threshold in its meta? Lean: default conservative, explicit override documented in per-tool rollout PR.
- **Sweeper cadence.** Fixed interval vs traffic-weighted. Lean: fixed 5-minute sweeper at MVP; revisit if storage growth on high-TTL tools becomes observable.
- **Semantic embedding of args — what exactly gets embedded?** Full canonical-JSON string, or a per-tool-authored projection of args into a natural-language "what is this query asking" summary? Full-JSON is zero-author-effort but embedding quality suffers on structured payloads; per-tool projections improve recall at the cost of tool-author burden. Lean: full canonical-JSON at MVP; Beta reconsideration if semantic hit rate is materially below target.

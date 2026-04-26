# Cluster 2 — Memory + Cache: Production-Readiness Audit

**Date:** 2026-04-26
**Plans audited:** 04 (Memory L1-L4 + Conversation State), 14 (Semantic Result Cache)
**Auditor:** Claude Sonnet 4.6 (read-only)
**Repo root:** `/Users/canh/Projects/Seta/future`

---

## Summary Table

| Severity | Count | Plans            |
| -------- | ----- | ---------------- |
| P0       | 5     | 04 (×4), 14 (×1) |
| P1       | 9     | 04 (×5), 14 (×4) |
| P2       | 0     | —                |
| INFO     | 3     | 04 (×2), 14 (×1) |

**Overall assessment:** Plan 14 (Semantic Result Cache) infrastructure is largely solid; the gateway integration, metric wiring, and RLS for `agent_tool_result_cache` are correct. Plan 04 has critical production blockers: four Plan 04 tables lack RLS in the migration SQL, the Langfuse GDPR purge step is entirely absent, and the semantic recall infrastructure has no real implementation.

---

## Plan 04 — Memory L1-L4 + Conversation State

### §1 Scope Walk-through

Scope covers L1–L4 + L3.5 scratchpad + semantic recall + conversation state. Implementation surface is confirmed to exist at the file-system level (SaveQueue, WindowBuilder, Summarizer, GDPRErasurePipeline, L3PreferenceService, ConversationRetentionScheduler, NullSemanticIndexRepository).

### §3 Data Model

**`agent_conversation`** (`agents.schema.ts:181`): All columns present — `summary_failure_streak INT DEFAULT 0`, `summary_disabled_at TIMESTAMPTZ`, unique partial index on `(tenant_id, user_id, surface) WHERE status='active'`, lookup index. **CRITICAL GAP:** No `ENABLE ROW LEVEL SECURITY` / `FORCE ROW LEVEL SECURITY` / `CREATE POLICY` in `0000_initial.sql`. The plan mandates `relforcerowsecurity=true` (R-04.4). The integration test at `drizzle-conversation.repository.integration.spec.ts:351` asserts this condition but the DDL was never emitted.

**`agent_message`** (`agents.schema.ts:217`): All columns present — `content JSONB`, `summary TEXT`, `trace_id UUID`, role CHECK constraint. Keyset index `(tenant_id, user_id, conversation_id, created_at)` is correct. **CRITICAL GAP:** No RLS DDL in migration. **ADDITIONAL GAP:** No GIN FTS index — `agent_message_fts_idx` referenced in code comments (`drizzle-conversation-message.repository.ts:179`) does not exist in the migration. The `search()` method performs a full-table `to_tsvector` scan.

**`agent_l3_preference`** (`agents.schema.ts:248`): Schema shape correct — PK `(tenant_id, user_id, key)`, `updated_by` column present. **CRITICAL GAP:** No RLS DDL in migration.

**`agent_scratchpad`** (`agents.schema.ts:269`): Schema correct — `tainted BOOLEAN`, PK `(tenant_id, user_id, field)`. **CRITICAL GAP:** No RLS DDL in migration.

**L1 in-memory cache** (`l1-cache.ts`): Correct — `Map<toolName, Map<argsHash, CacheEntry>>`. Module-scoped invalidation by dot-prefix implemented correctly. `invalidate()` rejects pending promises with `InvalidationAbortError`. `clear()` at turn end. Concurrent in-flight dedup via `registerInFlight`. ✓

**L4** (no table): Correct — consumed through gateway as tool calls.

**`agent_semantic_index_<tenant>`**: No table schema exists in migration. `NullSemanticIndexRepository` is the only implementation. The plan explicitly promotes semantic recall to MVP (§1), requiring a real per-tenant index. `purgeForUser()` silently returns `{ count: 0 }` making GDPR erasure incomplete when any sub-agent opts in.

### §4 Interface Contracts

**`ConversationStore`** (`drizzle-conversation.repository.ts`): `loadOrCreateActive`, `loadById`, `archive`, `delete`, `listGlobal`, `listBySurface` — all present. Integration spec confirms idempotent upsert behavior. ✓

**`MessageStore`** (`drizzle-conversation-message.repository.ts`): `persist`, `persistMany`, `listForWindow`, `updateSummary`, `hardDeleteContent`, `search` — all present. `hardDeleteContent` nulls `content` and `summary` but retains row shells. ✓

**`SaveQueue`** (`save-queue.ts`): `enqueue`, `flushByConversation`, `drain` — present. 100ms debounce, 1s staleness cap, per-conversation mutex chain all implemented. ✓

**`WindowBuilder`** (`window-builder.ts`): `buildGlobal`, `buildInline` — present. γ window: verbatim 3, compressed 10 (placeholder concat at MVP), rolling summary at ≥3 turns. Delimiter wrapping `<conversation_summary source="post_turn_nano">` implemented (R-04.26b). Permission-scope field filtering via `allowedFields` set (R-04.14). **Note:** Compressed tier is a concat placeholder per Phase 4 gate (INFO finding). ✓ modulo Phase 4 gate.

**`L3Preferences`** (`l3-preferences.ts`): `set` enforces allowlist via `assertAllowlisted`. No `.meta({ agent })` on tRPC procedures (verified at `preferences.router.ts`). ✓

**`L1Cache`**: Interface matches plan contract — `get/set/invalidateByDomain/clear` mapped to `lookup/registerInFlight/invalidate/clear`. ✓

**`Summarizer`** (`summarizer.ts`): `scheduleSummarizeTurn`, `summarizeTurn`, `handleSummarizeJob`, `clearSummaryCircuitBreaker`, `registerWorkers` — all present. Circuit-breaker streak ≥5 → `setSummaryDisabled` with no-op guard. Retry up to 3 times with 200ms×attempt backoff. ✓ shape-wise.

**`ScratchpadStore`**: Interface at `scratchpad.repository.ts` — `read`, `write`, `deleteForUser`. Implementation at `drizzle-scratchpad.repository.ts`. ✓

**`SemanticIndex`** (`semantic-index.repository.ts`): Interface correct — `index`, `search`, `purgeForUser`. **Contract drift:** only `NullSemanticIndexRepository` wired; `purgeForUser` always returns `{ count: 0 }`.

**`GDPRErasurePipeline`**: **Contract drift** — `EraseResult` is missing `langfusePurgeStatus: 'ok' | 'partial' | 'failed'` field. No Langfuse step implemented.

### §6 Requirements

| Req      | Status | Evidence                                                                                        |
| -------- | ------ | ----------------------------------------------------------------------------------------------- |
| R-04.1   | ✓      | L1Cache is request-scoped plain class                                                           |
| R-04.2   | ✓      | L1Cache has no DB interactions                                                                  |
| R-04.3   | ✓      | L1 distinct from L3 in naming                                                                   |
| R-04.3a  | ✓      | `l1-cache.ts:178` `invalidate()` by dot-prefix; `tool-gateway.ts:869` fires it                  |
| R-04.4   | **P0** | No RLS DDL for `agent_conversation`, `agent_message` in migration                               |
| R-04.5   | ✓      | Unique partial index implemented                                                                |
| R-04.6   | ✓      | `last_user_turn_at` column present; updated only on user role messages                          |
| R-04.7   | ✓      | `listBySurface` present                                                                         |
| R-04.8   | **P0** | No GIN FTS index in migration                                                                   |
| R-04.9   | **P0** | RLS missing in migration; test assertion will fail                                              |
| R-04.10  | ✓      | Index `(tenant_id, user_id, conversation_id, created_at)` present                               |
| R-04.11  | ✓      | γ: 3 verbatim + 10 compressed + rolling                                                         |
| R-04.12  | ✓      | α: last N verbatim (default 5)                                                                  |
| R-04.13  | ✓      | WindowBuilder never invokes L3/L4; comment asserts this                                         |
| R-04.14  | ✓      | `allowedFields` filtering in `wrapAndFilter`                                                    |
| R-04.15  | **P0** | No RLS DDL for `agent_l3_preference` in migration                                               |
| R-04.16  | ✓      | tRPC mutations omit `.meta({ agent })`                                                          |
| R-04.17  | ✓      | L3 mutations absent from agent registry                                                         |
| R-04.18  | ✓      | Allowlist in `l3-preference.entity.ts`                                                          |
| R-04.19  | ✓      | `assertAllowlisted` enforced at service layer                                                   |
| R-04.20  | ✓      | L4 via gateway/tool calls                                                                       |
| R-04.21  | ✓      | `canDo` denial → tripwire                                                                       |
| R-04.22  | ✓      | Plan 01 error model applies                                                                     |
| R-04.23  | ✓      | 100ms debounce, 1s cap, per-conversation mutex, forced flush                                    |
| R-04.24  | ✓      | pg-boss async job, not on critical path                                                         |
| R-04.25  | ✓      | Summarization failure never propagates to user turn                                             |
| R-04.26  | ✓      | 3-retry with backoff                                                                            |
| R-04.26a | **P1** | Circuit breaker logic correct; alert emission is console.error only — no metric                 |
| R-04.26b | ✓      | Delimiter wrapping in `wrapAndFilter`                                                           |
| R-04.26c | ✓      | Rolling summary at ≥3 turns threshold                                                           |
| R-04.27  | **P1** | `NullTenantLister` makes retention job a no-op; `admin_tenant_config` table absent              |
| R-04.28  | ✓      | `hardDeleteContent` nulls content+summary, retains shell                                        |
| R-04.29  | **P0** | No Langfuse purge step; `langfusePurgeStatus` missing from `EraseResult`                        |
| R-04.30  | **P0** | `l35ScratchpadDeleted` hardcoded to 1 (not real count); Langfuse compliance ticket path missing |
| R-04.31  | ✓      | Field allowlist enforced at `drizzle-scratchpad.repository.ts`                                  |
| R-04.32  | ✓      | `tainted BOOLEAN` stored with value                                                             |
| R-04.33  | ✓      | `scratchpad.write` tool path; kernel audit event wired                                          |
| R-04.34  | ✓      | Scope key `(tenant_id, user_id)`                                                                |
| R-04.35  | ✓      | `canDo('agent.scratchpad.write')` enforced                                                      |
| R-04.36  | **P0** | No per-tenant physical table; `NullSemanticIndexRepository` always returns 0                    |
| R-04.37  | INFO   | Null impl is fire-and-forget; will be correct when real impl arrives                            |
| R-04.38  | ✓      | `SemanticIndex.search` only via sub-agent tool; not pre-injected                                |
| R-04.39  | ✓      | Partition keys are `(tenant_id, user_id)` across all tiers                                      |
| R-04.40  | **P0** | `purgeForUser` returns hardcoded 0; no real index to purge                                      |

### §8 Observability Surface

All nine named **spans** (`MEMORY:conversation-resolve`, `MEMORY:save-queue-enqueue`, `MEMORY:save-queue-flush`, `MEMORY:window-build`, `MEMORY:l3-read`, `MEMORY:l3-write`, `MEMORY:l4-fetch`, `MEMORY:gdpr-erasure`, `SUMMARIZER:turn-summary`) are **absent** from the implementation. No OTel imports in `save-queue.ts`, `window-builder.ts`, `summarizer.ts`, or `gdpr-erasure.ts`.

All seven named **metrics** (`agent_conversation_total`, `agent_save_queue_depth`, `agent_save_queue_flush_duration_ms`, `agent_summary_generation_failed_total`, `agent_l3_write_rejected_total`, `agent_gdpr_erasure_total`, `agent_l4_fetch_denied_total`, `agent_window_build_duration_ms`) are absent. `agent_summary_circuit_broken_total` is commented out in `summarizer.ts:259` but not implemented.

`agent_l1_invalidation_total` is correctly implemented in `gateway-metrics.ts:283` and called from `tool-gateway.ts:510`. ✓

### §9 Security Considerations

RLS as the primary defense is undermined by the missing migration DDL for four tables (P0). All other security properties (FTS scope, L3 agent-immunity, L4 permission coupling, GDPR row-shell retention, summary-as-history delimiter wrapping, L3.5 taint inheritance) are correctly implemented at the application layer.

### §10 Performance Budget

Not directly verifiable from code review. WindowBuilder fetch limits are generous (39 messages for γ build). SaveQueue serialization prevents concurrent DB writes. No metrics to validate p99 targets.

### §11 Testing Strategy

- **Unit:** SaveQueue debounce (✓ `save-queue.spec.ts`), L3 allowlist (✓ `l3-preferences.spec.ts`), γ builder counts (✓ `window-builder.spec.ts`), summarizer retry + circuit breaker (✓ `summarizer.spec.ts`). ✓
- **Integration:** Cross-tenant RLS test exists but will fail without the RLS DDL. FTS test exists in `drizzle-conversation-message.repository.integration.spec.ts` (R-04.8 seeded test). GDPR erasure integration test is unit-only (no real DB). L1 module-scoped invalidation has a unit test. ✓ modulo RLS DDL gap.
- **Property:** SaveQueue ordering property test missing.
- **E2E:** No E2E test exists. **P1** gap.

### §12 Acceptance Criteria

| Criterion                              | Status                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| All tests pass                         | ❌ — RLS DDL absent, integration tests asserting relforcerowsecurity will fail |
| Cross-tenant seed test (R-04.9) passes | ❌ — RLS not applied in migration                                              |
| FTS never returns tool-result content  | ✓ (code correct; no backing index)                                             |
| L3 mutation not exposed to agent       | ✓                                                                              |
| Save queue metrics p99                 | ❌ — metrics not implemented                                                   |
| GDPR erasure runbook dry-run           | ❌ — Langfuse step absent                                                      |
| Cross-device consolidation             | Not verified (no E2E)                                                          |
| γ/α windows stable                     | ✓ (content deterministic)                                                      |
| Summary circuit-breaker end-to-end     | ✓ (logic correct; alert not metriced)                                          |
| Summary delimiter-wrap regression      | ✓ (in spec file)                                                               |
| L1 module-scoped invalidation          | ✓                                                                              |
| GDPR Langfuse exhaustion scenario      | ❌ — not implemented                                                           |

### §13 Rollout Plan

Phase 1 (L1+L2+SaveQueue) and Phase 2 (L3) are functionally implemented. Phase 3 (L4 annotations) is implemented. Phase 4 (summarization) is structurally present with `γ compressed` as a placeholder. Phase 5 (GDPR) is incomplete (Langfuse step missing). RLS DDL gap blocks production readiness for all phases.

### §15 Integration Points

All named integration points are wired. `@future/db` migration is the critical gap. `apps/api/src/modules/agents/application/services/gdpr-erasure.ts` is missing the Langfuse SDK dependency.

### §17 Out of Scope / §18 Open Questions

- Free-form markdown agent working memory: correctly excluded. ✓
- Shared multi-tenant vector index: correctly excluded. ✓
- `γ compression mechanism at MVP` (§18): correctly deferred as placeholder. INFO.
- `Retention config defaults` (§18): admin_tenant_config table is missing — this open question has materialized into a P1 gap.
- `L4 facade inventory` (§18): not fully resolved — which facades have `.meta({ agent })` at MVP is not auditable here.

---

## Plan 14 — Semantic Result Cache

### §1 Scope Walk-through

Scope covers per-tenant cross-turn semantic cache with exact + semantic-match lookup, TTL enforcement, domain-coarse invalidation, and gateway pipeline insertion. Infrastructure is fully present. Zero tools are currently enabled (`cacheable` meta on zero tools per rollout step 1 — INFO).

### §3 Data Model

**`agent_tool_result_cache`** (`agent-tool-result-cache.schema.ts`):

- `tenant_id`, `tool_name`, `canonical_args_hash`, `semantic_embedding` (JSONB, nullable), `embedding_model`, `result` (JSONB), `stored_at`, `ttl_seconds` — all required columns present. ✓
- `embedding_model` stamped for R-14.10 version safety. ✓
- B-tree index on `(tenant_id, tool_name, canonical_args_hash)` present. ✓
- Index on `(tenant_id, tool_name)` for semantic candidate fetch present. ✓
- **RLS:** `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and `CREATE POLICY agent_tool_result_cache_tenant_isolation` all present in `0000_initial.sql:1832-1836`. ✓
- **CRITICAL GAP:** No unique constraint on `(tenant_id, tool_name, canonical_args_hash)`. `onConflictDoNothing()` in `put()` has no conflict target to act on, meaning concurrent puts will insert duplicates.

### §4 Interface Contracts

**`SemanticResultCache.get`** (`semantic-result-cache.ts:89`): Returns `CacheHit | undefined`. `CacheHit` carries `result`, `hitKind`, `storedAt`. Fail-open (catch returns undefined). ✓

**`SemanticResultCache.put`** (`semantic-result-cache.ts:193`): Fire-and-forget. Embedding-provider fallback to exact-only row on failure. ✓

**`SemanticResultCache.invalidateDomain`** (`semantic-result-cache.ts:247`): Domain prefix via LIKE `domain.%`. Returns `{ purgedCount }`. ✓

**Tool meta extension** (`cacheable?: { ttlSeconds, distanceThreshold? }`): The Drizzle/TypeScript tool-meta type in the codebase includes `cacheable` (confirmed by `tool-gateway.ts:550`, `drift-rules.ts:292`). ✓

### §5 Control Flow

Gateway pipeline order: L1 check → semantic-cache check → ceiling pre-check → invoke → cache put → domain invalidation on mutation. This matches the plan's §5 step ordering. Semantic cache lookup is inside `gateway:semantic-cache` child span via `withGatewayStep`. Cache put is fire-and-forget via `void this.semanticCache.put(...)`. Domain invalidation is fire-and-forget. ✓

### §6 Requirements

| Req     | Status | Evidence                                                                                                           |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| R-14.1  | ✓      | RLS DDL present for `agent_tool_result_cache`                                                                      |
| R-14.2  | ✓      | `drift-rules.ts:292` rejects cacheable on mutation; test at `drift-rules.spec.ts`                                  |
| R-14.3  | ✓      | TTL enforced at read (notExpiredFilter) + background sweeper (5min cron)                                           |
| R-14.4  | ✓      | Exact lookup before embedding compute (`semantic-result-cache.ts:97-117`)                                          |
| R-14.5  | ✓      | `distanceThreshold` parameter; default 0.97 (conservative)                                                         |
| R-14.6  | ✓      | `invalidateDomain()` called on mutation success in `tool-gateway.ts:875`                                           |
| R-14.7  | **P1** | `cache_coalesced` and `cache_hit_kind` not stamped on `gateway:semantic-cache` span; only recorded as metric label |
| R-14.8  | ✓      | `try/catch` in `get()` returns `undefined` on any DB/embedding error                                               |
| R-14.9  | ✓      | Pre-rendered result stored; no raw free-text storage                                                               |
| R-14.10 | ✓      | `embeddingModel` filter in candidate query; model mismatch rows skipped                                            |

### §7 Failure Modes

All named failure modes are handled in code:

- Embedding provider outage on put: fallback to exact-only row (`semanticEmbedding: null`). ✓
- Embedding provider outage on get: semantic step skipped. ✓
- DB unavailability: fail-open. ✓
- Invalidation lag: bounded by TTL (correctness contract stated). ✓
- TTL shortened post-hoc: persisted `ttl_seconds` per row prevents retroactive extension. ✓
- Distance threshold mis-tuned: conservative default, per-tool override, golden-trace CI guard (deferred per §14). INFO.

### §8 Observability Surface

**Implemented:**

- `agent_semantic_cache_lookup_total{tenant_id, tool_name, hit_kind}` — `gateway-metrics.ts:358`. ✓
- `agent_semantic_cache_invalidation_lag_ms` histogram — `gateway-metrics.ts:366`. ✓
- `gateway:semantic-cache` child span — `tool-gateway.ts:554`. ✓

**Missing (P1):**

- `agent_semantic_cache_cost_saved_usd` — not implemented.
- `agent_semantic_cache_put_failures_total{reason}` — not implemented.
- `cache_coalesced`, `cache_hit_kind`, `cache_distance`, `cache_stored_at_age_seconds` span attributes on `gateway:semantic-cache` span.

### §9 Security Considerations

- Cross-tenant leakage: structurally impossible — RLS present. ✓
- Cached results are pre-rendered: confirmed (no raw free-text). ✓
- Intra-tenant cache poisoning acknowledged as correctness risk, not permission risk. ✓
- Model-version confusion: `embeddingModel` check in `get()`. ✓

### §10 Performance Budget

- Exact lookup: single indexed B-tree read; p99 < 10ms achievable.
- Semantic lookup: in-process cosine similarity (no pgvector) — O(n) over tenant+tool rows. At low-tens-of-thousands scale (MVP estimate) this should stay within 40ms. No pgvector at MVP is documented. ✓
- Put path: fire-and-forget. ✓

### §11 Testing Strategy

- **Unit:** `semantic-result-cache.spec.ts` — exact hit, semantic hit within/outside threshold, TTL expiry as miss, fail-open on DB unreachable. ✓
- **Integration:** `semantic-result-cache.integration.spec.ts` — RLS check, two-tenant seed isolation, domain invalidation, TTL sweeper. ✓
- **Property:** Semantic distance symmetry — not present. **P1** gap.
- **Drift (CI):** `drift-rules.spec.ts` tests cacheable-on-mutation rejection. ✓
- **Pipeline step ordering:** Not present. **P1** gap.

### §12 Acceptance Criteria

| Criterion                                                | Status                                               |
| -------------------------------------------------------- | ---------------------------------------------------- |
| Cache hit-rate dashboard ≥30% within 7 days              | Not verifiable (no tools enabled, no traffic) — INFO |
| Two-tenant seed integration test: zero cross-tenant hits | ✓ (`semantic-result-cache.integration.spec.ts:54`)   |
| Invalidation-lag p99 < TTL                               | ✓ (fire-and-forget invalidation)                     |
| All R-14.x requirements have at least one test           | ❌ — R-14.7 span attribute test missing              |
| Golden-trace CI passes with semantic cache enabled       | INFO (no tools enabled yet)                          |

### §13 Rollout Plan

Step 1 (ship with zero enabled tools) is the current state — infrastructure present, no cacheable tools. ✓ Rollout step 2 requires adding `cacheable: { ttlSeconds }` to the first tool via PR.

### §15 Integration Points

Gateway pipeline integration at `tool-gateway.ts:549-601` and `:847-889` correctly places semantic cache between L1 miss and ceiling pre-check, and fires put + domain invalidation after successful invoke. Embedding provider shared with plan 02.5. ✓

### §17 Out of Scope / §18 Open Questions

All §17 exclusions (write-through caching, cross-tenant pooling, pre-warming, per-entity invalidation, LLM-driven writes) are not present in the implementation. ✓

§18 open questions:

- `Invalidation as kernel audit event or log-only?` — currently log-only (console.log in `invalidateDomain`). Matches the plan's proposal. INFO.
- `Distance-threshold calibration` — default 0.97 set in tool-gateway.ts:77. ✓
- `Sweeper cadence` — fixed 5-minute via pg-boss cron in `semantic-cache-sweeper.ts:17`. ✓
- `Semantic embedding of args` — full canonical-JSON string (`canonical-args.ts`). ✓

---

## Cross-Plan Observations: Plan 14 ↔ Plan 04 Interaction

### Cache seam interaction

Plan 04's L1 cache sits before Plan 14's semantic cache in the gateway pipeline (`tool-gateway.ts:446-547`). The ordering is correct per both plans. An L1 hit short-circuits the semantic cache check entirely (correct behavior).

### Domain invalidation interaction

When a mutation succeeds, the gateway fires both:

1. L1 `invalidate(modulePrefix)` — clears in-process turn cache (Plan 04 R-04.3a)
2. `semanticCache.invalidateDomain({ tenantId, domain })` — purges cross-turn DB cache (Plan 14 R-14.6)

Both fire correctly at `tool-gateway.ts:869-889`. The L1 invalidation is synchronous; the semantic invalidation is fire-and-forget (correct per plan 14 §7 "invalidation lag" failure mode).

### GDPR interaction

Plan 04's `GDPRErasurePipeline` purges `agent_message` content but does NOT purge any semantic cache rows for the erased user. This is not explicitly addressed by Plan 14's GDPR section — Plan 14's cache stores `(tenant_id, tool_name, canonical_args_hash, result)` but not `user_id`. Tool results are tenant-scoped, not user-scoped, so the cache does not contain per-user PII by design. **However:** if tool results contain derived user data (e.g., `people.getMe` returns PII about the requesting user), cached rows may contain that user's data without being attributable to the user. This is a latent compliance risk not addressed by either plan.

**Recommendation:** Plan 14 should add a TTL-based natural expiry note for GDPR scenarios, and the `invalidateDomain` should optionally accept a `userId` to purge user-specific cached results (e.g., `people.getMe` results).

### Semantic recall (Plan 04) vs. semantic result cache (Plan 14)

These are distinct concerns sharing similar naming:

- **Plan 04 semantic recall:** per-turn memory indexing for cross-session context retrieval. No real implementation (NullSemanticIndexRepository).
- **Plan 14 semantic result cache:** cross-turn tool-result deduplication cache. Fully implemented with real DB.

They do not share infrastructure. The Plan 04 semantic recall write flow (post-turn background job → embed `agent_message.summary` → write to per-tenant index) is entirely absent because `NullSemanticIndexRepository` swallows all writes silently.

---

_Report generated: 2026-04-26. Findings JSON: `docs/agents/audit/findings/cluster-2.json`_

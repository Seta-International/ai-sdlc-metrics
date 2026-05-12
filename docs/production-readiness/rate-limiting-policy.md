# Rate Limiting Policy

**Branch:** `spike/mastra-foundation` · **Last updated:** 2026-05-12 · **Status:** P1 policy; values are starting points to refine against real telemetry before first prod customer.

Concrete rate-limiting policy for every public surface in seta-os. Companion to [`threat-model.md`](./threat-model.md) (DoS rows) and [`llm-safety.md`](./llm-safety.md) (per-tool budgets address adversarial overrun).

## 1. Storage backend

**P1:** in-memory store via `hono-rate-limiter` (per `platform/middleware/SCOPE.md` *Responsibilities — Planned — `hono-rate-limiter` defaults*; setup.md §4 row 188 — *Rate limiting | hono-rate-limiter | Per-tenant + per-IP limits; in-memory store P1, Redis store when scaling triggers hit*).

**P2+ (scaling-trigger driven, setup.md §3:51-55):** swap to Redis store when **any** of these fires:
- `apps/api` needs > 1 process for HA or throughput.
- Bot Framework outbound token cache must be shared across instances (avoid thundering-herd at MS auth).
- Inbound SSO sessions need to survive a restart on a different instance.
- Queue durability becomes a requirement.

The `hono-rate-limiter` interface stays the same; only the `store` implementation swaps. Until the trigger fires, the in-memory store is per-instance — at one instance that's the truth; at multiple instances it becomes per-instance-sloppy and the policy is *softer than advertised*. Do not defer the Redis swap past the scaling trigger; sharded rate limits across instances are the textbook way to silently overshoot a global cap.

CLAUDE.md *Build for now* applies: no Redis until the trigger fires; CLAUDE.md *Idempotent external boundaries* applies: replays already tolerated, so a missed limit on a replay is correctness-neutral.

## 2. Per-surface policy

Limits are starting values, sized for "small team, 10s of users per tenant, 1-2 active agent runs concurrent per user." Refine against telemetry before first prod customer. All rate-limited responses carry the headers in §4 below.

| Surface | Key | Window | Limit | Response |
|---------|-----|--------|-------|----------|
| `POST /teams/messages` | `tenant_id` (extracted from JWT post-verification) | 60s | 60 req steady, 120 burst | `429 application/problem+json` + `Retry-After` |
| `POST /oauth/:provider/consent-url` | client IP | 60s | 10 | 429 |
| `GET /oauth/:provider/callback` | `state` token | n/a | 1 per state (idempotent — single-use state row) | 410 Gone on replay; not a limit per se but the policy fence |
| `POST /runs` (Studio agent kickoff, P2) | `(tenant_id, user_id)` | 60s | 30 | 429 |
| `GET /runs/:id/stream` (SSE, P2) | `(tenant_id, user_id)` | concurrent | 5 simultaneous connections | 429 on the 6th — must close one before opening another |
| `POST /rag/sources` (corpus upload, P1 product surface — TBD per `modules/products/agent/SCOPE.md` corpus-source Open Q) | `tenant_id` | 3600s | 10 | 429 — uploads are heavyweight (chunking + embedding) |
| `GET /audit` (audit-log query, P2 admin) | `(tenant_id, user_id)` | 60s | 60 | 429 |
| API-key-authenticated endpoints (generic) | `api_key_id` (post-verify) | 60s | 1000 | 429 — machine traffic gets a higher ceiling |
| `POST /sso/login/:provider` (P2) | client IP | 60s | 5 | 429 — brute-force guard at the entry of the SSO flow |
| `POST /sso/callback/:provider` (P2) | client IP | 60s | 30 | 429 — higher because legitimate OIDC bursts (popups, reauth) hit this |

Notes per surface:

- **Teams webhook.** The key is `tenant_id` *post-JWT-verify*. Pre-verify, the rate limit must be on IP (because tenant id isn't known yet) — there's a separate edge IP limit at the WAF (§7) covering unauthenticated bursts. Once the JWT verifies (`modules/channels/teams/SCOPE.md` *Patterns — JWKS via createRemoteJWKSet*), the in-app limit takes over keyed on tenant. Bot Framework's own retry behavior (replays on transient failure) is the *reason* for the burst: activity-id idempotency (`modules/channels/teams/SCOPE.md` *Idempotent webhook entry*) means a 429 on a retry is functionally fine — Bot Framework re-tries again after the `Retry-After` window.
- **OAuth consent-url.** Keyed by IP because the requestor may not be authenticated yet (this *is* the route that bootstraps consent for a new tenant). Cites `platform/oauth/SCOPE.md` *Public interface — createOAuthRoutes*.
- **OAuth callback.** State is a 24-byte base64url token, 15-min TTL, `DELETE … RETURNING` for single-use (`platform/oauth/SCOPE.md` *StateStore*). Replay returns 410 because the state row is gone — natural rate limit shape.
- **`POST /runs` + SSE.** Studio P2 surfaces. The SSE concurrent-cap (5 per user) prevents a single user from accidentally or maliciously holding open many streams; the run-kickoff cap (30/min) prevents a stuck client from spamming retries.
- **RAG corpus upload.** Heavy: chunking + embedding generation hits `api.openai.com` for embeddings (per `platform/agent/vector/SCOPE.md` *Imports — @seta/agent-embeddings* and setup.md §6). 10/hour reflects the realistic update cadence of a curated corpus, not a hot path.
- **`GET /audit`.** Admin-only surface (P2). Lower-than-machine-traffic limit because audit queries can be expensive (`audit.audit_log` has no compound indexes yet per `platform/audit/SCOPE.md` Open Q on indexes).
- **API-key-authenticated endpoints.** 1000/min is the *default* — surfaces with heavier per-call cost (e.g., a hypothetical `POST /admin/sync/full`) carry a per-route override.
- **SSO login.** 5/min/IP guards against credential-stuffing. Successful login transitions to the session-cookie path (`platform/auth/SCOPE.md` *Owns — auth.sessions*).

## 3. Per-tenant subscription tiers — P2+

Paid tiers override the steady caps in §2. Mechanism:

- New column `auth.tenants.rate_limit_tier text default 'free'` (or — see Open Qs — a separate `tenant.rate_limit_overrides` table for richer policy).
- `@seta/middleware`'s rate-limit middleware reads the tier at request entry (cached per-tenant in an LRU keyed on `tenant_id`; invalidated on tier change via a `pg_notify` or similar — defer concrete invalidation mechanism to P2).
- Tier table itself is deferred — define rates against the *first* commercially differentiated tier; until then, every tenant is `free` and rates match §2.

CLAUDE.md *Shared cross-instance state must be Redis-ready shape today*: the tier-LRU is `(tenant_id) → tier`, TTL ≤ 5min, swappable to Redis. The in-process LRU is fine until the multi-instance trigger fires (§1).

## 4. Per-tool budget (separate from per-endpoint limit)

Distinct from the §2 per-endpoint limits — this is the *intra-run* limit enforced by `@seta/agent-core` and applied to every agent run regardless of the endpoint that started it:

- **`maxSteps: 16`** default — total iterations through the tool-call loop (spike `03-run-loop.md` *Punch list — Spec a default (e.g., `maxSteps: 16`)*). Configurable per agent definition.
- **`maxRetries: 2`** per failed model call — retry only on `APICallError.isRetryable` (spike `03-run-loop.md` *Delta — pRetry with signal*).
- **`maxToolCalls` per tool id per run** — pending; spec at `{ maxCalls?: number, timeoutMs?: number }` per tool (spike `03-run-loop.md` *Open questions — Per-tool budget shape*).
- **`maxTokens` per run (input + output)** — soft-cap with audit alert at 100k; hard-cap with kernel termination at 200k (see [`llm-safety.md`](./llm-safety.md) §7 *Open questions — Token-budget alert threshold*).
- **Abort wiring is non-negotiable** (setup.md §5:368) — client disconnect cancels in-flight Graph + LLM calls so a runaway run doesn't keep burning quota.

These caps protect against §1.6 *Adversarial overrun* in [`llm-safety.md`](./llm-safety.md) and against benign loops (the LLM thinks it's making progress but isn't).

## 5. Cross-cutting limits

### 5.1 LLM provider request budget per tenant per day
- **Soft cap**: configurable per tier (default for `free`: 1M tokens/day combined input+output). When crossed: audit row + email alert to tenant admin via `@seta/audit.recordAudit({ operation: 'llm.quota.soft_cap_crossed' })`; no functional effect on the request.
- **Hard cap**: 2× soft for `free`. When crossed: 429 with `application/problem+json` carrying `Retry-After` (= seconds until midnight UTC) and a tier-upgrade prompt (P2 — Studio admin UI link; pre-Studio, an email link to support).
- **Implementation locus**: `@seta/agent-core` model-adapter layer. Token accounting from the SDK's final-message metadata (OpenAI: `usage.total_tokens`; Anthropic: `usage.input_tokens + usage.output_tokens` — setup.md §5 references).
- **Counter storage**: `agent_memory`-schema-adjacent counter row keyed `(tenant_id, date)`. The "Redis-ready shape" rule applies (CLAUDE.md *Shared cross-instance state must be Redis-ready shape today*): typed key, TTL of 30 days, tenant-scoped.

Cite Project Plan BK-3 token-cost-per-run (the SLO this is the safety valve for).

### 5.2 Postgres connection pool
- **`max: 20` per `apps/api` process** (setup.md §3:145, `platform/db/SCOPE.md` *Patterns to follow — Postgres pool defaults*).
- Not a rate limit per se — a back-pressure mechanism. When all 20 are in flight, new requests wait for a connection. The natural-rate-limit fall-off has the right shape but no `Retry-After` header.
- At the multi-instance trigger (§1), pool sizing has to account for shared external state — but Redis adoption is the bigger story; pool size isn't the trigger.

### 5.3 Graph (Microsoft) backoff
- Not a Seta-side limit — Graph returns 429 + `Retry-After` on its own. `@seta/ms-graph` handles 429 backoff + 5xx retry transparently (setup.md §4 row 186); Planner-specific retry-after layered on top (`modules/connectors/ms365-planner/SCOPE.md` *Responsibilities — 429/5xx backoff*).
- The kernel's abort wiring (setup.md §5:368) propagates client disconnect through these retries so we don't keep retrying after a closed connection.

## 6. Headers

Every rate-limited response includes:

- `Retry-After: <seconds>` — RFC 7231; required for 429 + 503.
- `X-RateLimit-Limit: <max>` — the cap that was crossed.
- `X-RateLimit-Remaining: 0` — explicit for 429.
- `X-RateLimit-Reset: <unix-seconds>` — when the window resets.

Non-rate-limited responses on a rate-limited route still include `X-RateLimit-Limit` / `Remaining` / `Reset` so well-behaved clients can self-pace.

429 body format follows RFC 7807 (`application/problem+json`) per `platform/middleware/SCOPE.md` *Patterns to follow — `application/problem+json` content type on every error path*:

```json
{
  "type": "https://api.seta.example/problems/rate-limited",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded for tenant. Retry after 42 seconds.",
  "instance": "/teams/messages"
}
```

Implementation: a `RateLimited` `DomainError` subclass extending `@seta/middleware`'s pattern (`platform/middleware/SCOPE.md` *Public interface — DomainError subclasses*); not present today, added when `hono-rate-limiter` wiring lands.

## 7. DDoS protection

L7 application-level limits (everything in §2) are **not** L4/L7 DDoS defense. Volumetric / network-level protection relies on the cloud-provider WAF:

- AWS deployment: CloudFront + WAF with rate-based rules (per-IP, per-URI-path) at the edge.
- Azure deployment: Azure Front Door + Web Application Firewall, equivalent rate-based rules.
- WAF rules sized roughly 10× the in-app cap so legitimate traffic is never blocked by the edge while attack traffic is.

`hono-rate-limiter` runs *after* WAF — it's the application layer's view of "this authenticated tenant is sending too much," not "this anonymous adversary is flooding us."

`threat-model.md` §4.1 (Teams DoS row) and §4.2 (OAuth DoS row) reference this section for the application-layer half.

## 8. Whitelist / bypass

- **Seta-internal IPs.** Admin tooling, load-test runs, on-call response from known office / VPN ranges bypass the IP-keyed limits in §2 (`/oauth/:provider/consent-url`, `/sso/login/:provider`). Configured via env (`RATE_LIMIT_BYPASS_CIDRS`) once the middleware lands; not implemented today.
- **`tenants.exempt_from_rate_limit = true`** — column-flag opt-out for individual tenants. Use cases: contract-customer load tests, internal Seta tenant. Bypasses §2 *and* §5.1 caps. Use sparingly; every exemption is an audit-log entry on grant.
- **No bypass on §4** — the per-tool budget exists to protect the *tenant itself* (and the LLM bill) from runaway agent runs, not Seta's infrastructure from the tenant. Even an exempt tenant's runs are capped at `maxSteps: 16`.

## 9. Audit

Every 429 logged with `tenant_id`, `endpoint`, `key` (the value that crossed the limit — `api_key_id`, IP, or `(tenant_id, user_id)` — never the raw API key), `limit`, `window` via `@seta/audit.recordAudit({ operation: 'http.rate_limited', result: 'failure', metadata: { ... } })`.

Distinct legitimate-burst vs abuse pattern via post-hoc analysis (a query like *which tenants exceeded the §2 cap in the last week without exceeding §5.1?* surfaces legitimate-burst; *same key crossed limit at the same minute for 7 consecutive days* surfaces probable abuse). Implementation: out-of-band; not a runtime alert in P1.

## 10. Open questions

- **Multi-region: per-region or global rate limit?** When the multi-instance trigger (§1) fires, a Redis-backed store gives us global. But if we go multi-region later (P3+ EU residency), do we want global caps (consistent SLO experience) or per-region caps (better latency, lower coordination cost)? Recommendation: per-region for §2, global for §5.1 (token budget — billing-attached). Defer until multi-region planning starts.
- **Cost-based limits vs request-count limits.** §5.1 already moves toward cost — would per-endpoint cost-based limits (e.g., "tools that hit Graph are 5× more expensive than tools that hit our own DB") be valuable? Implementation cost is non-trivial (per-call cost weighting must be in the limiter primitive); revisit if real telemetry shows pure request-count caps catching the wrong patterns.
- **Customer-visible rate-limit dashboard.** Studio P2 should show "you have X% of your daily request quota remaining" — both as transparency and as a self-service signal to upgrade tier. Recommend yes; spec at Studio scoping time.
- **`tenants.exempt_from_rate_limit` granularity.** Today modeled as a boolean. Likely future need: exempt-this-tenant-from-§5.1 but not from §2, or vice versa. Suggest evolving to a JSONB `rate_limit_overrides` column when the first concrete exception lands; until then the boolean is enough.
- **Soft-cap notification UX (§5.1).** Email to tenant admin via what mailbox? Defer until Studio P2 ships tenant-admin profile.
- **`Retry-After` honesty under bursty in-memory windows.** `hono-rate-limiter`'s sliding-window-counter is approximate; `X-RateLimit-Reset` may drift by a second. Acceptable for human-driven traffic; for machine clients with strict scheduling, consider switching to a precise token-bucket. Revisit if a customer complains.
- **Brute-force on `/sso/login/:provider` (5/min/IP) — is that the right shape?** Office NAT pools can put hundreds of users behind one IP; a brute-force attack from a residential botnet has many IPs. Recommend pairing with a per-username lockout (`auth.users.failed_login_count`) at the next P2 SSO milestone; the IP cap alone is the floor, not the whole defense.

## 11. Cross-references

- [`threat-model.md`](./threat-model.md) §4.1 (Teams DoS), §4.2 (OAuth DoS), §4.3 (API key brute force), §4.4 (DoS via per-run tool storms), §6 (Authentication boundaries).
- [`llm-safety.md`](./llm-safety.md) §1.6 (Adversarial overrun), §3 (*Rate-limit per tool within an agent run*), §7 (token-budget Open Q).
- [`rls-regression-tests.md`](./rls-regression-tests.md) — RLS is the data-correctness backstop; rate limiting is the cost-and-availability backstop. They sit on different axes; cross-tenant *data* isolation is RLS, cross-tenant *cost* isolation is here.
- setup.md §3:51-55 (scaling triggers for multi-instance / Redis adoption), §3:145 (Postgres pool default), §4 row 188 (`hono-rate-limiter` row), §5:368 (abort wiring), §11 (`platform/middleware` location).
- `platform/middleware/SCOPE.md` — middleware home; *Public interface — rateLimit({ keyFn, max, window })* pending, *Imports — hono-rate-limiter@^0.5.3*.
- Spike `03-run-loop.md` *Punch list — maxSteps: 16*, *Retry policy*, *Per-tool budget*.
- Project Plan BK-3 (token-cost-per-run SLO — `slo-alerting.md` formalizes the SLO; this doc is the rate-limit safety valve for it).
- CLAUDE.md *Idempotent external boundaries*, *Build for now*, *Shared cross-instance state must be Redis-ready shape today*.

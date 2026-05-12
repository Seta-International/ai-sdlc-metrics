# Threat Model — seta-os Multi-Tenant Agent Platform

**Branch:** `spike/mastra-foundation` · **Last updated:** 2026-05-12 · **Status:** P1 baseline, expected to evolve before first prod customer (Project Plan §0).

This is the STRIDE-style threat model for the seta-os surface as it stands at the end of Epic 1 (auth/oauth landed; agent kernel + Teams channel + connectors mostly scaffolded). Sibling docs:

- [`rls-regression-tests.md`](./rls-regression-tests.md) — proves the multi-tenant isolation invariants listed below.
- [`llm-safety.md`](./llm-safety.md) — extends the *Tool execution* and *LLM provider data exfiltration* rows below into a fuller LLM-specific picture.
- [`rate-limiting-policy.md`](./rate-limiting-policy.md) — concrete per-surface limits referenced in the *DoS* rows below.
- [`gdpr-delete-flow.md`](./gdpr-delete-flow.md), [`slo-alerting.md`](./slo-alerting.md), [`deployment-pipeline.md`](./deployment-pipeline.md) — adjacent production-readiness scopes.

## 1. System boundary

```
                          ┌─────────────────────────── PUBLIC INTERNET (untrusted) ───────────────────────────┐
                          │                                                                                  │
   ┌─ End user (Teams) ──►│ Bot Framework infra ──► POST /teams/messages (JWT-verified) ──┐                  │
   │                      │                                                               │                  │
   ┌─ End user (browser) ►│ HTTPS ──► GET /sso/login/:provider (P2)        ────────────┐  │                  │
   │                      │           POST /sso/callback/:provider (P2)               │  │                  │
   │                      │           GET /studio/* (P2 SPA assets)                   │  │                  │
   │                      │                                                           │  │                  │
   ┌─ Admin (browser) ───►│ HTTPS ──► POST /oauth/:provider/consent-url ──┐           │  │                  │
   │                      │           GET  /oauth/:provider/callback     │           │  │                  │
   │                      │                                              │           │  │                  │
   ┌─ Machine client ────►│ HTTPS Authorization: Bearer <api-key> ──┐    │           │  │                  │
   │                      │                                         │    │           │  │                  │
   └──────────────────────┴─────────────────────────────────────────┼────┼───────────┼──┼──────────────────┘
                                                                    │    │           │  │
                          ┌─── TRUST BOUNDARY (TLS-terminating WAF / Front Door) ────┴──┴──────────────────┐
                          │                                                                                │
                          │              ┌──────── apps/api (Hono process) ────────┐                       │
                          │              │  Hono router + @hono/zod-openapi        │                       │
                          │              │  @seta/middleware (auth/tenant/errors)  │                       │
                          │              │  modules/channels/teams                 │                       │
                          │              │  modules/products/agent (kernel + tools)│                       │
                          │              │  modules/connectors/ms365-*             │                       │
                          │              │  AsyncLocalStorage tenantContext        │                       │
                          │              └─────┬───────────────────────┬───────────┘                       │
                          │                    │                       │                                   │
                          │   ┌────────────────▼─────────┐  ┌──────────▼──────────┐                        │
                          │   │ Postgres 17 + pgvector   │  │ KMS (AWS / Azure)   │                        │
                          │   │ - app role: tenant_user  │  │ - KEK only          │                        │
                          │   │ - admin: platform_admin  │  │ - EncryptionContext │                        │
                          │   │ - RLS on every tenant tbl│  │   {tenantId,purpose}│                        │
                          │   └──────────────────────────┘  └─────────────────────┘                        │
                          │                                                                                │
                          │   Trusted egress (mutually authenticated):                                     │
                          │   - graph.microsoft.com         (via @seta/ms-graph + @seta/oauth)             │
                          │   - login.botframework.com      (JWKS — read-only)                             │
                          │   - login.microsoftonline.com   (Entra OAuth via MSAL)                         │
                          │   - api.anthropic.com           (LLM completions)                              │
                          │   - api.openai.com              (LLM completions, embeddings)                  │
                          │                                                                                │
                          └────────────────────────────────────────────────────────────────────────────────┘
```

Trust boundaries crossed in this diagram:

1. **Public internet → WAF/TLS terminator.** All inbound HTTPS; cloud-provider WAF is the L7 DDoS line (see `rate-limiting-policy.md` § DDoS).
2. **WAF → apps/api.** `@seta/middleware` is the next gate: `requestId` → `requestLogger` → `tenantMiddleware` → `requireUser`/`requireApiKey` (per `platform/middleware/SCOPE.md` Planned section).
3. **apps/api → Postgres.** App connects as `tenant_user` (RLS-enforced). `platform_admin` (BYPASSRLS, per `infra/postgres/init.sql` and `platform/db/SCOPE.md`) is migrations/ops only and never serves an HTTP request.
4. **apps/api → KMS.** Outbound only; KEK never leaves KMS. DEKs are wrapped per-row and bound to `EncryptionContext: { tenantId, purpose }` (setup.md §4 lines 277-325; `platform/oauth/SCOPE.md` Patterns — *KMS EncryptionContext + AES-GCM AAD double-bind*).
5. **apps/api → external SaaS.** Outbound to Graph / Entra / Bot Framework / Anthropic / OpenAI. Each provider has its own contractual + technical mitigations; see threats below.

## 2. Trust zones

| Zone | Members | Trust level |
|------|---------|-------------|
| Untrusted | Anonymous internet, Teams end users, anonymous Studio visitors (P2), machine clients with unverified API keys | None — every request must prove identity at the next boundary |
| Semi-trusted | Bot Framework infrastructure (Microsoft-operated), Entra ID OIDC IdP, Seta staff with Teams accounts, authenticated Studio sessions, holders of valid API keys | Identity verified, but request content is still untrusted (prompt injection, replayed activities, etc.) |
| Trusted | `apps/api` process, the Postgres cluster (`tenant_user` + `platform_admin` roles), the configured KMS (AWS KMS / Azure Key Vault), the host VM / container runtime, OTel collector | Inside our blast radius; assume one compromise = full-zone compromise and design layered defenses |

The internal split between `tenant_user` and `platform_admin` is a *defense-in-depth* sub-boundary inside the trusted zone — see RLS notes in §5 below and `platform/db/SCOPE.md` *Patterns to follow*.

## 3. Assets at risk

Sorted by sensitivity:

**Critical**
- **`oauth.oauth_tokens`** — live OAuth access + refresh tokens for tenants' Graph access; KMS-envelope encrypted, AAD-bound (`platform/oauth/SCOPE.md` *Patterns — KMS EncryptionContext + AES-GCM AAD double-bind*; setup.md §4:277-325). Compromise → impersonation against every Graph endpoint the tenant consented to (Planner read+write, Directory read).
- **KMS DEKs (plaintext form, in-process only)** — wrapped at rest; plaintext exists in memory for one decrypt call and is zeroized in `finally` (`platform/oauth/SCOPE.md` *DEK plaintext zeroization*).
- **Customer data — `agent_memory.*`** (conversation history, working memory) and **`connector_ms365_*`** (cached Planner tasks, Directory mirror). Multi-tenant; tenant isolation is the load-bearing invariant.
- **Audit log integrity** (`audit.audit_log`) — append-only, synchronously written per event (`platform/audit/SCOPE.md` *Synchronous write per event*); tampering / deletion would defeat compliance + forensic response.

**High**
- **API keys (`auth.api_keys.hashedKey`)** — argon2id-hashed; raw key never stored (`platform/auth/SCOPE.md`; setup.md §4:245-275).
- **Tenant memberships (`tenant.tenants`, `tenant.tenant_connectors`, `directory.external_identities`)** — leak would expose customer list / IdP topology.
- **RAG corpus content (`agent_vector.chunks`, FAQ source-of-truth — TBD per `modules/products/agent/SCOPE.md` Open question on corpus source)** — currently scoped per tenant; cross-tenant leak via vector search bug is the load-bearing concern (see `platform/agent/vector/SCOPE.md` *Patterns — iterative_scan correctness*).

**Medium**
- Agent run telemetry, OTel traces, pino logs — sanitized via pino `redact` list (setup.md §8:616-680) but still carries `tenant_id`, `req_id`, operation names.
- Bot Framework outbound bot tokens (LRU-cached, ~1h TTL per `modules/channels/teams/SCOPE.md`).
- Workflow snapshots (`agent_workflows.workflow_snapshots.step_results`) — may contain partial business data depending on step shape.

## 4. STRIDE per surface

Status legend: **mitigated** = design + code lands the defense; **partial** = design covers it, implementation incomplete; **open** = no current defense.

### 4.1 Teams webhook entry — `POST /teams/messages`

| Threat | Detail | Mitigation | Status |
|--------|--------|------------|--------|
| **S**poofing | Forged Bot Framework JWT impersonating a real activity | `jose.jwtVerify` against `https://login.botframework.com/v1/.well-known/keys` with `issuer`, `audience` (= `MS_BOT_ID`), `algorithms: ['RS256']`, `clockTolerance: 60s` (setup.md §7:541-552; `modules/channels/teams/SCOPE.md` *Patterns — JWKS via createRemoteJWKSet*). Multi-matching-kid handled explicitly during MS key rotation. | **partial** — scope is contracted, code is `export {}` placeholder in Epic 1 |
| **T**ampering | Replayed activity (Bot Framework retries on transient error) causing duplicate writes | Activity `id` is the natural idempotency key; downstream tool calls use preview→commit with HMAC continuation, replays are no-ops (CLAUDE.md *Idempotent external boundaries*; `modules/channels/teams/SCOPE.md` *Idempotent webhook entry*) | **partial** |
| **R**epudiation | Tenant denies a write was triggered by their user | Every privileged op + every external API call recorded in `audit.audit_log` synchronously with `tenant_id`, `actor`, `operation`, `result`, `metadata` (`platform/audit/SCOPE.md`; setup.md §3:114) | **partial** — `@seta/audit` writer landed, callers not yet wired in Teams handler |
| **I**nformation disclosure | One tenant's activity processed under another tenant's context (cross-tenant leak) | (a) JWT carries tenant id; (b) `tenantMiddleware` enters `tenantContext.run({tenantId,...}, next)` (frozen store, `platform/tenant/SCOPE.md`); (c) RLS backstop on every tenant-data table (setup.md §3:59-100; see `rls-regression-tests.md`) | **partial** |
| **D**enial of service | Adversary floods bot endpoint to exhaust Postgres pool / LLM quota | `hono-rate-limiter` keyed by `tenant_id` post-JWT-verify; per-surface caps in `rate-limiting-policy.md` § *Per-surface policy* (60 req/min steady, 120 burst); 429 + `Retry-After` | **partial** — `hono-rate-limiter` is a declared dep in `@seta/middleware/package.json` per `platform/middleware/SCOPE.md`, not yet wired |
| **E**levation of privilege | User in group/channel chat tricks agent into running Planner write tools that affect tasks of users not in the chat | Conversation-scope policy: `derefConversationScope(activity)` derives `personal | groupChat | channel`; product router enforces *FAQ-only in groupChat/channel* (`modules/channels/teams/SCOPE.md` *P1 conversation-scope routing constraint*; `modules/products/agent/SCOPE.md` *Patterns — Three-agent trigger-phrase routing*) | **partial** — policy specified, not yet implemented |

### 4.2 OAuth callback — `GET /oauth/:provider/callback`

| Threat | Detail | Mitigation | Status |
|--------|--------|------------|--------|
| **S**poofing | Attacker initiates consent on behalf of a tenant they don't control | Admin-consent URL state-binding: 24-byte base64url random state, 15-min TTL, `DELETE … RETURNING` for single-use semantics (`platform/oauth/SCOPE.md` *StateStore*; setup.md §4 admin-consent paragraph) | **mitigated** — Epic 1 shipped |
| **T**ampering / **R**eplay | Reused authorization code | OAuth `code` is single-use at MSAL; state already consumed; `tid-mismatch` check between query `tenant` and MSAL-returned `account.tenantId` fails-closed with audit (`platform/oauth/SCOPE.md` *Tid-mismatch fails-closed and audits*) | **mitigated** |
| **CSRF** | Attacker tricks admin into hitting callback with crafted parameters | State token verified on the callback path (above) | **mitigated** |
| **I**nformation disclosure (token leakage at rest) | DB dump or row-level read by an attacker | KMS-envelope encryption per row; AAD = `${tenantId}|${providerId}|${partitionKey}|v1`; EncryptionContext = `{tenantId, providerId, partitionKey}`. Even an attacker with KMS Decrypt cannot decrypt without supplying the original (tenantId, providerId, partitionKey) tuple (`platform/oauth/SCOPE.md` *KMS EncryptionContext + AES-GCM AAD double-bind*; setup.md §4:325) | **mitigated** |
| **I**nformation disclosure (in-memory) | Plaintext DEK / JSON bundle lingering in heap | Buffers zeroized in `finally` (`platform/oauth/SCOPE.md` *DEK plaintext zeroization*; `src/vault.ts:120-126,180-184`) | **mitigated** |
| **D**enial of service | Callback flooded to mint/consume state rows | Per-state rate limit (1 per state — single-use); per-IP rate limit on `consent-url` (10/min) per `rate-limiting-policy.md` § *Per-surface policy* | **partial** |
| **E**oP | Stale refresh during concurrent token use bursts producing race conditions | Single-flight refresh via `SELECT … FOR UPDATE` inside `sql.begin` + `set_config('app.tenant_id', …, true)` (`platform/oauth/SCOPE.md` *Single-flight refresh*; setup.md §4:199) | **mitigated** — Epic 1 shipped; covered by `refresh.test.ts` 10-concurrent-acquirer invariant |

### 4.3 API key authentication — `Authorization: Bearer …`

| Threat | Detail | Mitigation | Status |
|--------|--------|------------|--------|
| **S**poofing | Brute-force guessing of an API key | argon2id with OWASP 2024 PARAMS: `m=64MB, t=3, p=4, hashLength=32` (setup.md §4:253-259). Verify cost ≈ 50ms — prohibitive at any meaningful rate | **partial** — params pinned, helper not yet implemented (`platform/auth/SCOPE.md` *Current state — declared, not yet implemented*) |
| **S**poofing (defense-in-depth) | Rate-limit + lockout on per-IP / per-key-prefix bursts | `hono-rate-limiter` keyed by `api_key_id` once verified, by IP before: see `rate-limiting-policy.md` § *Per-surface policy — API-key endpoints* | **partial** |
| **Upgrade window** | OWASP defaults tighten over time → stored hashes weaken | `needsRehash` upgrade-on-verify path; rehash inline with current PARAMS, cost amortized (`platform/auth/SCOPE.md` *Patterns — needsRehash + upgrade-on-verify*; setup.md §4:263-272) | **partial** |
| **R**epudiation | "I didn't authorize that machine call" | Every API-key-authenticated request audited with `api_key_id`, `tenant_id`, `operation` (extension of `platform/audit/SCOPE.md` patterns) | **open** — pattern documented, no implementation yet |
| **I**nformation disclosure | Leaked API key persists in audit log / request log | pino `redact` covers `req.headers.authorization`, `*.api_key`, `*.apiKey` (setup.md §8:636-649); audit `metadata` field is documented not to carry secrets (`platform/audit/SCOPE.md` *metadata carries free-form context but no secrets*) | **mitigated** (design) |
| **E**oP | Compromised key for tenant A used to read tenant B's data | `api_keys.tenantId` is read at verify time and immediately bound to the ALS frame via `tenantContext.run({tenantId, …}, next)`. RLS backstop ensures tenant_user role can only see rows where `tenant_id = current_setting('app.tenant_id')::uuid` (`platform/db/SCOPE.md` *Patterns — set_config('app.tenant_id', $1, true)*; setup.md §3:130-168) | **partial** |

### 4.4 Tool execution (agent kernel)

| Threat | Detail | Mitigation | Status |
|--------|--------|------------|--------|
| **Prompt-injection-driven write** | User message instructs the LLM to call a destructive tool (e.g., `update_tasks.commit`) with attacker-chosen arguments | Preview→commit pattern. `.preview` returns `{ continuation_id, summary, etag_snapshot }`; `.commit` accepts `{ continuation_id }` only — payload comes from the HMAC-signed envelope, not the model's re-supply (spike `04-tools-mcp.md` *Punch list*; `modules/products/agent/SCOPE.md` *Patterns — Preview → HMAC-signed continuation → commit*). User sees the preview and explicitly confirms. Group/channel scope cannot reach write tools at all (per 4.1 EoP row). For the broader prompt-injection picture see [`llm-safety.md`](./llm-safety.md). | **partial** — pattern specified, no `write_continuations` schema yet shipped |
| **Cross-tenant tool access** | Tool reads/writes another tenant's data | All tools read tenant via `tenantContext.getTenantId()`; all DB queries go through `withTenant`; RLS backstop denies stray queries by default (setup.md §3:168 "deny by default"; CLAUDE.md *Tenant id is never a function parameter*) | **mitigated** by design — coverage proven by tests in [`rls-regression-tests.md`](./rls-regression-tests.md) |
| **Arbitrary code execution** | LLM-induced shell-out / `eval` | No `eval`, no `Function()`, no `child_process` in product/connector code paths. Tools are typed callable references registered explicitly in `apps/api/src/main.ts` (CLAUDE.md *No DI containers, plugin loaders, or runtime discovery*; spike `04-tools-mcp.md` *Punch list — explicit registration in apps/api/src/main.ts*) | **mitigated** by architecture |
| **Tool-result tampering** | LLM hallucinates a tool result the kernel believes | Tool `outputSchema` is required for write tools and validated at the kernel boundary; validation errors are **returned**, not thrown, so the kernel feeds them back to the LLM for self-correction (spike `04-tools-mcp.md` *Delta — Validation errors as return values*) | **partial** |
| **ETag race / lost update** | Concurrent edits cause silent overwrite | ETag snapshot at preview time → `If-Match` at commit time (setup.md §7:565-589; `modules/products/agent/SCOPE.md` *ETag snapshot at preview time*) | **partial** |
| **Continuation token forgery** | Attacker mints a fake commit token | HMAC-SHA-256 over canonicalized payload + server secret from `@seta/auth` KMS; `expires_at` TTL; `consumed_at` blocks replay (spike `04-tools-mcp.md` *Punch list*) | **partial** |
| **D**oS via per-run tool storms | Adversarial input makes the agent call tools in a tight loop | Per-tool budget cap + max-iterations cap (default `maxSteps: 16` per spike `03-run-loop.md` *Punch list*); `streamKernelSSE` abort wiring propagates client disconnect to in-flight Graph calls (setup.md §5:368). See [`rate-limiting-policy.md`](./rate-limiting-policy.md) § *Per-tool budget*. | **partial** |

### 4.5 LLM provider data exfiltration

| Threat | Detail | Mitigation | Status |
|--------|--------|------------|--------|
| **System-prompt leakage to user** | Adversarial user prompt extracts the agent system prompt | System prompt is small + non-secret; no per-tenant secrets in the prompt. Audit log records every model call. Architectural mitigation in [`llm-safety.md`](./llm-safety.md) § *System prompt isolation*. | **partial** (the *non-secret* part is architectural) |
| **Cross-tenant content leak via shared model context** | Provider routes our prompt through a context shared with another customer | Out-of-our-control beyond the contractual data-handling agreement with Anthropic / OpenAI. We do **not** opt into model-training (per provider account configuration — verify before each model swap); we send only data the tenant has access to. Documented limit. | **contractual** |
| **Egress of PII / corpus chunks** | RAG retrieval returns tenant A's chunk to a prompt sent under tenant B | `searchChunks` runs inside `withTenant`; HNSW + `iterative_scan = strict_order` is load-bearing for **correctness** (not just perf) under tenant-filtered LIMIT k queries (`platform/agent/vector/SCOPE.md` *Patterns to follow — Three SET LOCAL tuning statements*) | **partial** — vector package is P1 placeholder per its SCOPE |
| **Log-mediated leak** | LLM response or prompt logged in cleartext | pino `redact` list does not yet enumerate prompt/completion fields; **open**. Consider extending `redact.paths` to include `*.prompt`, `*.completion`, `*.system` and structured `messages[].content`. | **open** |

### 4.6 Studio SSE stream (P2 — flagged for forward awareness)

| Threat | Detail | Mitigation | Status |
|--------|--------|------------|--------|
| **Session hijack via cookie theft** | Browser-cookie exfil from XSS / network tap | Session cookies: `HttpOnly + Secure + SameSite=Strict`; Postgres-backed session row tied to `auth.sessions.expiresAt` (`platform/auth/SCOPE.md` *Owns — auth.sessions*; setup.md §4 *Inbound session storage (P2)*) | **P2** |
| **CSRF on state-changing POST** | Cross-site form posts to `/runs` etc. | `SameSite=Strict` cookie + a double-submit token at the form boundary (Studio P2) | **P2** |
| **SSE token leak via URL** | Bearer token in querystring captured in proxy logs | Auth via cookie only on SSE; never as `?token=…` | **P2** |
| **Open SSE connection budget** | Adversary opens many SSE streams to exhaust file descriptors | Per-user concurrent SSE cap (`rate-limiting-policy.md` § *Per-surface policy — GET /runs/:id/stream*: max 5 per `(tenant_id, user_id)`) | **P2** |

### 4.7 Bot Framework outbound (token + reply)

| Threat | Detail | Mitigation | Status |
|--------|--------|------------|--------|
| **Token leak via log** | Outbound bot token printed in error path | pino `redact` covers `*.access_token`, `env.MS_BOT_SECRET` (setup.md §8:636-649) | **mitigated** by design |
| **Token cache poisoning across tenants** | Wrong tenant's bot token reused | One bot token cache, single-app per setup.md §7; tenant scoping is at the conversation level via `serviceUrl + conversationId` — verify before scaling beyond one MS app id | **mitigated** for P1 single-app deployment |

## 5. Multi-tenant isolation invariants

These are the architectural invariants the system relies on. Tests in [`rls-regression-tests.md`](./rls-regression-tests.md) prove them.

1. **Every persisted row has `tenant_id uuid NOT NULL`.** Schema-per-module ownership (setup.md §3:102-127; `platform/db/SCOPE.md`) means each owner package enforces this in its Drizzle schema file.
2. **Every tenant-data table has an RLS policy** keyed on `current_setting('app.tenant_id')::uuid`. Drizzle 0.45.2 ships `pgPolicy`; owners declare policies inline with the table (setup.md §3:80-90). `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` (the latter via hand-written migration since drizzle-kit 0.31.10 doesn't emit `FORCE` — `platform/oauth/SCOPE.md` *0001_security_hardening.sql*).
3. **Every tenant-scoped query goes through `withTenant(tenantId, fn)`** from `@seta/db` (`platform/db/SCOPE.md` *Owns — withTenant*; setup.md §3:130-168). The wrapper opens a transaction and calls `SELECT set_config('app.tenant_id', $1, true)` — bind-param safe and tx-scoped.
4. **App connects as `tenant_user` (RLS-enforced).** `platform_admin` (BYPASSRLS) is migrations-only and never serves HTTP requests (setup.md §3:172; `platform/db/SCOPE.md`).
5. **`set_config('app.tenant_id', $1, true)` not `SET LOCAL` or `SET`.** The `is_local=true` argument is what scopes the GUC to the transaction. Plain `SET` on a pooled connection persists across release → silent cross-tenant leak (setup.md §3:132; `platform/db/SCOPE.md` *Patterns to avoid — Plain SET on a pooled connection*).
6. **`tenantContext` store is frozen** for the lifetime of a request — no `set()` / `update()` / `promoteUser()` (spike `07-request-context.md` *Delta — Mastra's set() mutability*; `platform/tenant/SCOPE.md` *Patterns to follow — Store is logically frozen*). New identity = new `tenantContext.run` frame.
7. **JIT mapping in `@seta/connector-ms365-directory` writes to `auth.users` only via the directory schema's exported API** (`mapIdTokenToUser`) — never raw cross-schema SQL from arbitrary callers (`platform/directory/SCOPE.md` *Patterns — JIT mapping through @seta/directory*). Mapper runs the two upserts inside one `sql.begin` so tenant_id is consistent throughout.
8. **No cross-schema foreign keys.** Cross-context references are by ID only; `tenant_id` is the universal correlation key (CLAUDE.md *No cross-schema foreign keys*; setup.md §3:121-123).

## 6. Authentication boundaries

What proves identity at each surface:

| Surface | Identity proof | Verified by | Notes |
|--------|----------------|-------------|-------|
| Teams (`POST /teams/messages`) | Bot Framework JWT (RS256) | `jose.jwtVerify` against `login.botframework.com/v1/.well-known/keys`; `aud = MS_BOT_ID`, `iss = api.botframework.com` (setup.md §7:526-563; `modules/channels/teams/SCOPE.md`) | Multi-matching-kid handled; stateless JWKS cache on cold starts |
| Web SSO P2 (`GET/POST /sso/login/:provider`) | OIDC ID-token from Entra / Google → `auth.sessions` cookie | `jose.jwtVerify` against `login.microsoftonline.com/<tenant>/discovery/v2.0/keys`; JIT mapping via `@seta/directory.mapIdTokenToUser` (`platform/directory/SCOPE.md`) | P2 surface; Postgres-backed sessions, no Redis |
| API key (`Authorization: Bearer …`) | argon2id verify against `auth.api_keys.hashedKey` | `verifyApiKey(raw, stored, onUpgrade)` per setup.md §4:263-272; LRU(in-process) verify cache keyed on `hashedKey` (`platform/auth/SCOPE.md`) | `needsRehash` auto-upgrade |
| OAuth callback (`GET /oauth/:provider/callback`) | Single-use state token + tid-mismatch check | `StateStore.consume` is `DELETE … RETURNING`; tid-mismatch audits + 400 (`platform/oauth/SCOPE.md`) | Admin path only — not a user-identity boundary, a consent-flow correlation boundary |
| Cross-service (internal) | None — same process, composition in `apps/api/src/main.ts` | N/A | CLAUDE.md *No DI containers* — no internal RPC, modules linked by composition |

## 7. Out of scope of this threat model

Deferred to dedicated docs:

- **LLM-specific safety** (prompt-injection mitigations beyond preview→commit; indirect injection via Planner task titles / FAQ corpus; output sanitization for adaptive cards / Studio markdown rendering) → [`llm-safety.md`](./llm-safety.md).
- **Rate-limiting policy details** (per-surface caps, headers, distributed-store transition trigger) → [`rate-limiting-policy.md`](./rate-limiting-policy.md).
- **RLS test coverage** (the actual tests that prove the invariants in §5) → [`rls-regression-tests.md`](./rls-regression-tests.md).
- **Deletion / right-to-be-forgotten flow** → [`gdpr-delete-flow.md`](./gdpr-delete-flow.md) (already present in this directory).
- **SLOs + alerting** → [`slo-alerting.md`](./slo-alerting.md).
- **Deployment pipeline + secret distribution** → [`deployment-pipeline.md`](./deployment-pipeline.md).

## 8. Open questions

- **Penetration testing cadence.** Recommend annual third-party pentest, plus a targeted re-test after any P1 → P2 major surface change (Studio launch, multi-region rollout). Sponsor to confirm vendor + budget.
- **Bug bounty program.** Recommend opening a private Bugcrowd / HackerOne program once the first prod customer is live and surface-area is stable; gate full-public on at least one Seta-internal rehearsal of the disclosure-response runbook.
- **SOC 2 audit timeline.** Project Plan §0 lists SOC 2 as P3. The audit *period* needs ≥ 90 days of operating effectiveness, so the controls referenced in this doc (RLS, audit log, KMS, secret rotation runbooks per setup.md §15) need to be production-instrumented at least 90 days before the audit kickoff. Sponsor to set a target month so the readiness calendar can be backed out from it.
- **Prompt + completion redaction in logs.** Pino `redact` paths currently cover credentials but not prompt content. Open question: redact verbatim, structurally summarize (`messages[].role`, `messages[].content.length`), or fully omit by default with a `LOG_PROMPTS=true` opt-in for debug environments?
- **Internal admin tooling surface.** Audit-log read access, tenant-management UI, and connector-state inspection currently have no UI; CLI scripts run as `platform_admin` (BYPASSRLS). When admin UI lands, it must run as a separate `audit_reader` / `tenant_admin` role with its own RLS posture (`platform/audit/SCOPE.md` *Open questions — RLS vs admin-only reads*). Until then, all admin access goes through reviewed scripts + the audit log itself.
- **Per-region data residency.** EU customer commitments may require regional Postgres + KMS deployment. Out of P1 scope; deferred to multi-region rollout planning.

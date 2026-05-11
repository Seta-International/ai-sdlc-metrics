# Seta Agent Foundation — MS365 Epics Brainstorm (working doc)

**Status**: Brainstorming · not approved for project plan inclusion yet
**Owner**: Canh Ta
**Updated**: 2026-05-11

> Working document for shaping MS365 + Teams epics before they go into the master Project Plan. Each epic is drafted in deep-dive form, then we react and refine before moving on.

---

## Locked context (from brainstorm Q&A)

| Decision | Value |
|---|---|
| Mock LLM mode | Scaffolding to let Agent team work in parallel with FS/DO doing MS365 wiring; mock fixtures behind same `ModelClient` interface as real OpenAI. Real LLM swaps in once kernel is green. |
| Install guide audience | Design-partner customer IT admin + Seta internal IT admin — single doc with two clearly-labeled sections |
| Sync model | Delta polling — background job hits Graph delta endpoint per tenant, agent reads from local Postgres copy |
| Brainstorm format | Epic-by-epic deep dive; user reacts after each epic before next is drafted |

---

## Proposed epic list (provisional — refine as we go)

| # | Epic title | Status | Estimated capabilities |
|---|---|---|---|
| 1 | **MS365 Authentication & Authorization** | DRAFTED below | Auth setup, OAuth flow, token vault, permission/scope model |
| 2 | **MS365 Planner CRUD via Agent** (read + write) | Not yet drafted | Maps to existing M2 + N1 + N2 + plus user-facing acceptance |
| 3 | **MS365 Background Delta Sync** | Not yet drafted | Maps to M2.5 + new background worker capability |
| 4 | **Teams App Installation & Customer Onboarding** | Not yet drafted | Maps to T1.8 + new customer-install capability |
| 5 | **Mock LLM Mode (parallel-work enabler)** | Not yet drafted | New cross-cutting capability |
| 6 | **Customer + Internal IT Admin Install Documentation** | Not yet drafted | New documentation capability |

---

## EPIC 1 — MS365 Authentication & Authorization

### Business outcome

A Seta customer (or Seta itself) can connect their Microsoft 365 tenant to the agent platform with a single admin consent flow. After consent, the agent can read and write Planner data on behalf of authenticated users, with tokens stored encrypted and auto-refreshed. The customer admin can revoke access at any time from the Entra portal.

### Why this is Epic #1

Nothing else in MS365 works without this. Auth is the gate that everything (CRUD, sync, agent execution) depends on. Get this wrong and the whole MS365 integration is blocked.

### User stories

**As a customer IT admin**, I want to install the Seta agent in my Microsoft 365 tenant by clicking through a consent screen, so that my employees can use it in Teams without each person granting personal permissions.

**As a Seta platform engineer**, I want OAuth tokens stored encrypted at rest with automatic refresh, so that I don't have to think about token lifecycle in the agent code.

**As a customer security officer**, I want the agent to request only the minimum MS365 permissions needed, so that I can approve consent without escalating to legal review.

### Acceptance criteria

| # | Criterion | Verifiable how? |
|---|---|---|
| AC-1 | A new customer tenant can complete OAuth admin consent in under 5 minutes from clean state | Manual run-through on a fresh Entra tenant |
| AC-2 | OAuth tokens are stored AES-GCM encrypted; the encryption key is wrapped by AWS KMS | Inspect database; verify ciphertext; check KMS audit log |
| AC-3 | Tokens auto-refresh 5 minutes before expiry without user intervention | Integration test: set short expiry, observe refresh, verify next call succeeds |
| AC-4 | Permission scopes requested are limited to: `Tasks.ReadWrite`, `Group.Read.All`, `User.Read`, `offline_access` | Read consent screen; verify Entra app registration |
| AC-5 | A customer admin can revoke from the Entra portal and the agent's next call returns a clear error (not a crash) | Manual revocation test |
| AC-6 | Per-tenant + per-user grants are isolated — one tenant cannot use another tenant's tokens | Cross-tenant negative test (existing capability W2.2 covers this for storage; verify it extends here) |
| AC-7 | Token vault supports key rotation — DEK can be rotated without re-consenting users | Run rotation script; verify tokens still decrypt |

### Capabilities required (maps to project plan)

| Capability | Status in plan | Notes |
|---|---|---|
| M1 — OAuth & encrypted token vault (Entra + PKCE + AES-GCM) | Already in plan, ~$3.00 MD, FS-owned with AG-S security review | Covers AC-2, AC-3, AC-4, AC-7 |
| W3 — API authentication (key issuance + verification) | Already in plan | Adjacent: how agent runs identify themselves to the platform after auth |
| Z1 — OIDC client + sessions | Already in plan | Adjacent: web SSO uses the same Entra app registration; consolidate |
| **NEW** — Admin self-service consent UX (a simple "Connect MS365" button in admin API → returns consent URL → callback handler completes flow) | Not currently in plan as a distinct capability | ~0.5 MD FS. Wraps M1.2 in a cleaner admin-facing endpoint. |
| **NEW** — Permission-revocation handling (catch revoked-grant error from Graph, mark tenant inactive, notify admin) | Not currently in plan | ~0.5 MD FS. Important for AC-5. |

### Permissions / scopes (the actual ask to customer admin)

| Scope | Why we need it | What we DON'T request |
|---|---|---|
| `Tasks.ReadWrite` | Read and create/update/complete Planner tasks | We don't ask for `Tasks.ReadWrite.All` (avoids global read across the entire tenant) |
| `Group.ReadWrite.All` | Create new Planner plans on the user's behalf (Epic 2 Q-1 resolution) | – |
| `Group.Read.All` | Read group membership to iterate plans for cross-plan analytics | – |
| `User.Read` | Identify the user calling the agent | We don't ask for `User.Read.All` |
| `offline_access` | Refresh tokens (long-lived sessions without re-consent) | Standard OAuth requirement |

**Notably NOT requested in P1**: Mail, Calendar, Files, Sites. If customer asks "can the agent read my email?" the answer is "no — only Planner in P1; mail comes in P3 with the email channel."

**Note on `Group.ReadWrite.All`**: this is a noticeable scope ask. Customer-facing install docs (Epic 6) must call this out clearly with the user-facing rationale ("the agent can create new plans for you"). Adds ~1 week to large-customer legal review (factored into R-1).

### Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Entra admin consent flow takes 2-4 weeks at large customers (legal/security review of new apps) | High | High | Sales engages customer IT admin pre-kickoff; provide a 1-page security overview that pre-answers the standard review questions (scopes, data flow, retention, encryption) |
| R-2 | Conditional Access policies block agent token acquisition (e.g., require MFA for service principal) | Med | High | R3.1 spike covers happy-path OAuth; step-up `claims` challenge handling deferred to P2 |
| R-3 | Refresh-token race conditions when many concurrent requests trigger simultaneous refresh attempts | Med | Med | Single-flight pattern in token refresh middleware; documented in `runbook-secret-rotation.md` |
| R-4 | Customer revokes consent during active session — agent shows confusing error to user | Med | Low | AC-5 handles this; clear "MS365 access was revoked, contact your admin" message |

### Open questions (need decisions before implementation)

| # | Question | Options | Resolution |
|---|---|---|---|
| Q-1 | Single Entra app multi-tenant, or per-customer app registration? | (a) Single multi-tenant app. (b) Per-customer single-tenant app. | ✅ **RESOLVED — (a) Single multi-tenant**, plus **Seta itself is bootstrapped as the first org via a seed file that reads values from env vars** (so Seta doesn't go through the OAuth consent flow — it's pre-loaded). See "Seta Bootstrap Pattern" below. |
| Q-2 | Where does the consent URL get clicked from? | (a) Standalone admin web page (requires Studio UI — P2). (b) CLI tool that prints URL. (c) Email link from Seta sales. | ✅ **RESOLVED — (b) CLI tool in P1**. Web page lands with Studio in P2. |
| Q-3 | Token vault: separate `oauth_tokens` table, or attach to `tenants` table? | (a) Separate table — clean, supports multiple OAuth providers per tenant. (b) Attached — simpler but less flexible. | ✅ **RESOLVED — (a) Separate**, per current M1 design |
| Q-4 | Per-user tokens vs. service-account tokens? | See "Hybrid OBO + App-only — Standard Solution" below | ✅ **RESOLVED — Hybrid (industry standard)** |

### Hybrid OBO + App-only — Standard Solution (resolves Q-4)

For a multi-tenant SaaS agent on MS365, the standard Microsoft-recommended pattern is **two token flows side-by-side**, used for different purposes:

| Flow | Used for | Why this one |
|---|---|---|
| **On-Behalf-Of (OBO) — per-user delegated tokens** | All Graph calls triggered by a user in chat (e.g., "summarize my tasks", "create a task", "who's overloaded?") — basically anything where the user is in the loop | (1) **Audit trail** — every Graph API call shows the real user in Microsoft's audit log; required for SOC 2 / GDPR / customer compliance reviews. (2) **Permission scoping** — respects what THAT user can see; if user X has no access to plan P, agent acting on user X's behalf also can't see it. (3) **Teams SSO already provides this for free** via the `signin/tokenExchange` invoke activity (capability T1.7). (4) **Microsoft's own products do this** — Copilot Studio, Power Automate, Viva all use OBO. |
| **App-only (client-credentials) — service-account tokens** | Background jobs with no user context — primarily **delta sync polling** (Epic 3) and token-vault health checks | (1) **No user logged in** — a cron job triggered every N minutes has no user identity, so OBO is mechanically impossible. (2) **Scope it narrowly**: request only `Tasks.Read.All` + `Group.Read.All` (read-only) for the service principal. Write operations are NEVER done with the app-only token — always OBO. (3) **Standard Microsoft pattern** — Graph's "app + delegated permissions side-by-side" is documented in Microsoft Learn as the recommended approach. |

#### Permission scopes by token type

| Scope | OBO (delegated) | App-only (service-account) |
|---|---|---|
| `Tasks.ReadWrite` | ✅ (user can read + write their tasks) | ❌ |
| `Tasks.Read.All` | ❌ | ✅ (background sync reads only) |
| `Group.Read.All` | ✅ (knows user's groups) | ✅ (sync iterates all plans across tenant) |
| `User.Read` | ✅ | ❌ |
| `offline_access` | ✅ (refresh tokens) | N/A (app-only uses client credentials, no refresh) |

#### Risk control on app-only

Because app-only tokens are powerful (tenant-wide), we constrain them:
- **Read-only scope** — agent code path that uses app-only token literally cannot call write endpoints (compile-time check via TypeScript types)
- **Audit logging** — every app-only Graph call logged to our own `audit_log` table with `actor=system, reason=delta-sync, tenant_id=X`
- **Conditional access guard** — if customer's Entra Conditional Access blocks app-only flow, sync degrades gracefully to per-user OBO sync on-login (slower but functional)

#### Capability impact

Current M1 (3.00 MD) covers OBO setup. **Add ~0.5 MD FS for app-only client-credentials flow + scope guards.** Total M1 → 3.50 MD. Net FS goes from 33.18 → 33.68 MD (96% util) — definitely need to shed something to AG-F2 (proposing revocation handling, 0.5 MD).

### Seta Bootstrap Pattern (resolves Q-1)

Two paths to onboarding a tenant — Seta vs. everyone else:

| Path | For | Mechanism |
|---|---|---|
| **Seta org (first/special tenant)** | Seta International itself | `tooling/scripts/seed-seta-tenant.ts` reads env vars (`SETA_ENTRA_TENANT_ID`, `SETA_ENTRA_CLIENT_ID`, `SETA_ENTRA_CLIENT_SECRET`, `SETA_ADMIN_EMAIL`, etc.) and creates: `tenants` row for Seta + initial admin API key + `oauth_tokens` row with the pre-acquired client-credentials grant for Seta's MS365 tenant. Idempotent; safe to re-run. |
| **All other tenants** | Design-partner customers, future paying tenants | Standard OAuth admin-consent flow via the multi-tenant Entra app. Customer admin clicks the consent URL (CLI tool in P1, web page in P2), accepts the scopes, callback creates the tenant + tokens. |

**Implications**:
- The seed script is run **once at AWS staging bootstrap** (and again at P2 prod bootstrap) — not by customers
- Env vars must include Seta's Entra app credentials + tenant id; these live in AWS Secrets Manager (not in code, not in `.env.local` for prod)
- The same multi-tenant Entra app serves both paths — Seta is just the first row in `tenants`, otherwise an **ordinary tenant with the same capabilities and toolset as any customer tenant**
- **No `is_seta_org` privilege flag** — Seta does not get special agent capabilities. The seed script just saves the few minutes of clicking through our own consent screen for our own tenant
- For local dev: a `.env.local.example` ships in the repo with placeholder values; engineer copies + fills with their dev Entra app credentials

**New acceptance criterion added**:

| # | Criterion | Verifiable how? |
|---|---|---|
| AC-8 | `seed-seta-tenant.ts` script bootstraps Seta as the first tenant from env vars, idempotent on re-run | Run twice on clean DB, second run is no-op; Seta tenant row + initial admin key + Seta MS365 oauth_tokens row present after first run |

**Capability impact**: Add a small capability **M1.bootstrap** (~0.25 MD FS) for the seed script. Net FS delta: +0.25 MD (32.18 MD total, 92% util — still under cap).

### Demo moment (what user sees if this epic lands)

> *Seta sales rep emails customer IT admin a one-line subject "Approve Seta agent in 60 seconds" with a single link. Admin clicks. Microsoft consent screen appears showing the 4 scopes. Admin clicks Accept. Confirmation page says "Connected — your team can now @ mention SetaAgent in Teams." End of admin's involvement.*

### Estimated effort delta (vs current plan)

Current plan has M1 (3.00 MD, FS) covering the core OAuth + token vault.
This epic adds:

| Addition | Effort | Owner | Why |
|---|---:|---|---|
| Admin self-service consent UX (CLI tool that prints consent URL, callback completes flow) | 0.50 MD | FS | Resolves Q-2 |
| Permission-revocation handling (catch revoked-grant, mark tenant inactive, notify admin) | 0.50 MD | **AG-F2** *(moved off FS to relieve over-cap)* | AC-5 |
| Seta bootstrap seed script (`seed-seta-tenant.ts` reads env → first tenant + admin key + pre-loaded oauth_tokens) | 0.25 MD | FS | Resolves Q-1 |
| App-only client-credentials flow + read-only scope guards | 0.50 MD | FS | Resolves Q-4 |
| **Total epic delta** | **+1.75 MD** | **FS +1.25 / AG-F2 +0.50** | |

**Net per-role impact**:
- FS: 31.93 → 33.18 MD (95% util) — tight, monitor
- AG-F2: 12.50 → 13.00 MD (46% of 28 effective) — still spare

Acceptable. If FS slips, fallback is to defer revocation-handling cleanup polish into early P2 (the 401 error will still surface to the user as a generic "MS365 access revoked, contact admin" message, which is the minimum behavior anyway).

---

### Epic 1 status: ALL OPEN QUESTIONS RESOLVED ✅

Ready to lift into the master Project Plan once Epics 2–6 are also finalized.

---

## EPIC 2 — MS365 Planner CRUD via Agent (Read + Write)

### Business outcome

A user in Microsoft Teams can ask the agent to **read** Planner data ("show my open tasks", "who's overloaded?") and **write** Planner data ("create 3 follow-up tasks", "reassign John's overdue items to Mary") with one-tap confirmation for any write. The agent acts as the user (OBO token), respects their MS365 permissions, and produces rich visual responses (text + tables + charts). Every Graph call is audited.

### Why this epic

This is the actual product surface from a user's perspective. Epic 1 (auth) is foundation; Epic 3 (sync) is plumbing; this is what the user *does*. If this epic doesn't feel fast, accurate, and safe, the demo flops regardless of the rest.

### User stories

**As an end user (employee in Teams)**, I want to ask "show me my open tasks due this week" and get a structured response with task names, due dates, and status — without leaving the chat — so that I can triage my work without context-switching to the Planner web UI.

**As a project manager**, I want to ask "reassign all of John's overdue tasks to Mary" and have the agent confirm before mutating, so that I save 5 minutes of manual reassignment per incident without risking a wrong-bulk-edit.

**As a team lead**, I want to ask "who on my team is overloaded?" and get a **bar chart** of task counts per assignee, so that I have a one-glance answer in a stand-up.

**As any user with no Planner access**, I want a graceful "you don't have permission to see this plan" message instead of a crash or generic 403, so that I understand what to do next (ask my admin).

### Acceptance criteria

| # | Criterion | Verifiable how? |
|---|---|---|
| AC-1 | Read p95 latency < 2s for common queries on AWS staging (cached from delta sync; see Epic 3) | CloudWatch metric on `/agents/:id/run` for read-type intents |
| AC-2 | Write operations always emit a confirmation card (or accept a `--dry-run` flag) before mutating | Manual: every write tool tested; automated: Q4.10-style E2E test |
| AC-3 | Every Graph call (read + write) is logged with `actor_user`, `tenant_id`, `operation`, `resource_ids`, `result` | Inspect `audit_log` table after demo run |
| AC-4 | Optimistic concurrency: write operations use `If-Match` ETag; conflict returns user-friendly "this task changed since you looked at it — retry?" | Integration test: stale ETag → 412 → friendly retry |
| AC-5 | All writes use **OBO token** (the actual user, not service-account); reads of user-scoped data also use OBO | Audit log shows real `actor_user`, not `system` |
| AC-6 | Permission errors return clean "you don't have access to plan X — ask your admin" — never a stack trace | Negative test: user without `Tasks.ReadWrite` on plan X |
| AC-7 | Bulk write (>5 items in one user request) batches Graph calls with concurrency-limited Promise.all, surface partial-success/partial-failure clearly | Integration test: 10 task creates, force 1 failure mid-batch, verify partial result message |
| AC-8 | All write tools support `--dry-run`: agent describes what it would do without executing | Each write tool unit-tested with dry-run flag |

### Capabilities required

| Capability | Status in plan | Notes |
|---|---|---|
| **N1** — Planner READ (list/search tasks, get details, list plans/buckets) | Already in plan, 2.00 MD AG-F1 | Foundation for read user stories |
| **N2** — Planner WRITE + safety (create/update/complete, assignments, comments, dry-run) | Already in plan, 2.25 MD AG-S | Foundation for write user stories |
| **M2** — Graph + Planner client (full ops + delta sync) | Already in plan, 4.50 MD FS+AG-F1 (per Epic 1 rebalance: M was moved off AG-S) | HTTP plumbing that N1/N2 use |
| **A4** — Rich response output (text + tables + charts) | Already in plan, 1.00 MD AG-F (with chart capability captured) | Renders read responses (chart for analytics; table for task list) |
| **A2** — Planner Agent definition (prompt + tool wiring) | Already in plan | Where N1+N2 tools get wired into the agent |
| **NEW** — Graph-call audit logging (`audit_log` table + middleware that wraps every Graph call) | Not currently in plan as a distinct capability | ~0.50 MD AG-F2. Ties to AC-3 and to O4 lifecycle observability. |
| **NEW** — Confirmation UX as an Adaptive Card with Yes/No buttons (not just text "say YES") | Implicit in N2 + A4 but not explicit | ~0.25 MD AG-F. Better UX than text confirm. |
| **NEW** — Bulk write batching with concurrency cap + partial-result surfacing | Not currently in plan | ~0.50 MD AG-S. Important for AC-7. |

### Permission model (Read + Write specifics)

| Operation | Token type | Required scope | Notes |
|---|---|---|---|
| Read user's own tasks | OBO (delegated) | `Tasks.ReadWrite` | User sees only what MS365 says they can see |
| Read tasks in plans user is a member of | OBO | `Tasks.ReadWrite` + `Group.Read.All` | Graph enforces; we don't need extra logic |
| Create/update/complete task | OBO | `Tasks.ReadWrite` | Audit log captures user as actor |
| Create plan | OBO | `Group.ReadWrite.All` | Requested in consent for all tenants (per Q-1 resolution); audit log records `actor_user=X` for every plan creation |
| Add comment to task | OBO | `Tasks.ReadWrite` | Comments use task `/details/conversation` endpoint |
| Read tasks for cross-team analytics (workload) | OBO + iterate user's accessible plans | Same as read | The "what John can see" defines the analytics scope; user can't compute workload for someone whose plans they can't see |

**No tenant-type carve-outs**: Seta org and customer tenants get the same scope list, same toolset, same code path. Anything Seta can do, customers can do via the same OAuth consent flow.

### Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Graph 429 throttling under burst (many users at once) | Med | Med | M2.1 retry/backoff + delta-sync cache absorbs reads; writes are user-initiated so burst is naturally limited |
| R-2 | Optimistic concurrency conflicts on hot tasks (e.g., status changing rapidly) | Med | Low | AC-4 friendly retry message; one auto-retry then surface |
| R-3 | User asks for action across plans they don't have permission to — agent makes partial changes | Med | High | Pre-flight permission check: agent enumerates target IDs, calls Graph with read-only first; if any 403, abort entire bulk op with clear message (no partial mutation) |
| R-4 | Write tool hallucinates IDs (LLM invents a task_id that doesn't exist) | Low | Med | Schema validation rejects non-UUID; Graph 404 surfaced cleanly. Eval set in N4 includes "hallucinated ID" test case |
| R-5 | Bulk operations confuse users ("I asked to update 1 task, why did it update 5?") | Med | Med | Confirmation card explicitly lists every ID and shows count; AC-2 + AC-7 cover |
| R-6 | `Group.ReadWrite.All` is a noticeable consent ask — some customer legal/security reviews may flag it | Med | Med | (1) Customer-facing install doc (Epic 6) leads with the rationale ("agent creates plans for you"). (2) 1-page security overview pre-answers standard review questions. (3) Sales engages customer IT pre-kickoff (per Epic 1 R-1 mitigation). (4) Fallback if a customer refuses: ship a tenant-specific config flag to disable `createPlan` for that tenant (covered by existing capability O1.4 tool-allowlist enforcement — same mechanism, just per-tenant config, not per-tenant-type carve-out). |

### Open questions

| # | Question | Options | Resolution |
|---|---|---|---|
| Q-1 | Include `createPlan` in P1 (needs `Group.ReadWrite.All` scope)? | (a) Yes — request full scope at consent for ALL tenants. (b) No — defer createPlan to P2. (c) ~~Seta-only via app-only token~~ (rejected — no per-tenant-type carve-outs). | ✅ **RESOLVED — (a) Yes for all tenants**. Request `Group.ReadWrite.All` in the OAuth consent flow for every tenant including Seta. Single codebase, single toolset, no per-tenant-type gating. Customer install docs (Epic 6) call out the scope and explain why ("the agent can create new plans on your behalf"). |
| Q-2 | Read-freshness: live Graph or cache-first? | (a) Always live. (b) Cache-first with TTL, live fallback. (c) Sync-only. | ✅ **RESOLVED — (b) Cache-first with 60s TTL + live fallback**. Production-ready balance: fast p95, fresh enough, low Graph quota burn. Details in Epic 3. |
| Q-3 | Confirmation UX: Adaptive Card buttons vs text-only? | (a) Card buttons. (b) Text confirm. | ✅ **RESOLVED — (a) Adaptive Card with Yes/No buttons** (where Teams renders them; text-confirm fallback only if Teams client doesn't support the card variant) |
| Q-4 | Bulk write confirmation threshold? | (a) Every write confirms. (b) Single auto, bulk confirm. (c) Threshold 5+. | ✅ **RESOLVED — (a) Every write confirms, no matter N**. Write safety is non-negotiable; one extra tap is cheap insurance. |
| Q-5 | Where do audit logs go? | (a) Postgres. (b) CloudWatch Logs. (c) Both. | (a) Postgres for P1 (queryable from agent + admin API); CloudWatch added in P2 for SIEM export |

### Scope ask updated (resolves Q-1)

Customer consent screen now requests **5 scopes** instead of 4:

| Scope | Why we need it |
|---|---|
| `Tasks.ReadWrite` | Read + write Planner tasks |
| **`Group.ReadWrite.All`** *(added)* | Create new plans on the user's behalf |
| `Group.Read.All` | Iterate group membership for cross-plan analytics |
| `User.Read` | Identify the calling user |
| `offline_access` | Refresh tokens for long-lived sessions |

**Customer-facing rationale** (lands in Epic 6 install docs): *"The agent will sometimes create new Planner plans for you (e.g., 'set up a plan for our Q3 marketing initiative'). This requires write access to your Microsoft 365 groups in addition to task read/write."*

**No per-tenant-type carve-outs**: Seta and customers get the same scopes, the same toolset, the same code path. The Epic 1 seed script just pre-loads Seta's tokens (skipping the consent UI for ourselves) — it does not grant Seta extra capabilities.

### Demo moment (what user sees)

> *Project manager Sarah opens Teams. Types: "Reassign all of John's overdue tasks to Mary." Agent replies with an Adaptive Card titled "Confirm reassignment" listing 5 specific task names, due dates, and `From: John → To: Mary`. Sarah clicks "Confirm". Agent processes (~3 seconds, with a typing indicator). Returns a success card: "Reassigned 5 tasks from John to Mary. View in Planner ↗" with deep-links to each task. Audit log entry visible to Seta admin shows: actor=sarah@customer.com, action=reassign, 5 task IDs, timestamp.*

### Estimated effort delta (vs current plan)

| Addition | Effort | Owner |
|---|---:|---|
| Graph-call audit logging (table + wrapper middleware) | 0.50 MD | AG-F2 |
| Confirmation Adaptive Card (Yes/No buttons + handler) | 0.25 MD | AG-F |
| Bulk write batching with concurrency cap + partial-result surfacing | 0.50 MD | AG-S |
| **Total epic delta** | **+1.25 MD** | FS unchanged · AG-S +0.50 · AG-F +0.25 · AG-F2 +0.50 |

**Net role impact** (cumulative with Epic 1):
- FS: 33.18 MD (95% util — same as Epic 1 close)
- AG-S: 29.22 → 29.72 MD (85% util) — still healthy
- AG-F1: 27.00 → 27.25 MD (78% util) — still healthy
- AG-F2: 13.00 → 13.50 MD (48% of 28 effective) — still spare

All roles in healthy range. No rebalance needed.

---

### Epic 2 status: ALL OPEN QUESTIONS RESOLVED ✅

---

## EPIC 3 — MS365 Background Delta Sync

### Business outcome

Planner data (tasks, plans, buckets, assignments) is mirrored from Microsoft Graph into a local Postgres cache, refreshed via Graph's **delta endpoint** on a background polling schedule. Result: agent **reads** are fast (sub-200ms p95 from cache) and survive Graph throttling or transient outages, while **writes** flow live through Graph (with immediate cache write-through so the user sees their own change before the next poll).

### Why this epic

Read performance and Graph rate-limit headroom both depend on this. Without a cache:
- Every "show me my tasks" hits Graph live — slow (1–2s) and burns customer's Graph quota
- Burst of users at standup time = 429 throttles + frustrated demo
- Analytics queries ("workload by assignee" iterates many plans) become impractical

With this epic, P1 demo feels snappy even under load.

### User stories

**As an end user**, I want agent reads to feel instant (sub-second) so I don't context-switch to the Planner web app while waiting.

**As a DevOps engineer**, I want sync to recover silently from network blips, Graph throttling, and delta-token expiry, so I'm not paged for transient failures.

**As a security/compliance officer**, I want sync to use a narrowly-scoped app-only token (not user OBO), so we minimize the blast radius if the sync credential is ever compromised.

**As any user who just made a change**, I want my own write to appear immediately in subsequent reads (no "I just created this task, why doesn't the agent see it?"), so I trust the agent.

### Acceptance criteria

| # | Criterion | Verifiable how? |
|---|---|---|
| AC-1 | Read p95 < 200ms when served from cache (vs <2s from live Graph) | CloudWatch latency histogram, split by `served_from=cache\|live` |
| AC-2 | Cache freshness < 5 minutes for any plan that had activity in the last 24h | Synthetic: change a Planner task externally, measure time until it appears in agent |
| AC-3 | Background worker recovers from a 5-minute network outage without manual intervention (resumes from last watermark) | Inject failure in staging, observe recovery |
| AC-4 | Sync uses **app-only token** with read-only scopes (`Tasks.Read.All` + `Group.Read.All`) | Audit log shows `actor=system, token_type=app-only`; code path can't reach write endpoints |
| AC-5 | Delta-token expiry (Graph returns 410 Gone) triggers silent full re-sync; no admin notification needed | Force delta-token expiry; observe silent recovery |
| AC-6 | Per-tenant isolation: one tenant's sync failure does not block another tenant's | Kill sync worker for tenant A; verify tenant B's sync continues |
| AC-7 | Agent's own write updates the local cache **immediately** (read-after-write consistency for the same user) | E2E test: create task, immediately read tasks, verify present without waiting for next poll |
| AC-8 | After 5 consecutive failed sync attempts for a tenant, send alert to operations channel; mark tenant `sync_status=degraded` (agent still works against live Graph) | Inject sustained failure; verify alert + degraded status; verify agent fallback to live Graph |
| AC-9 | Cold start: first sync after bootstrap completes within 10 minutes for a tenant with <500 tasks | Bootstrap fresh tenant in staging, observe |

### Capabilities required

| Capability | Status in plan | Notes |
|---|---|---|
| **M2.5** — Comments + assignments + delta sync (delta tokens, watermark per tenant) | Already in plan, ~1.00 MD AG-F1 | Foundation — Graph delta endpoint usage + watermark storage |
| **NEW** — Background worker runtime (a separate ECS service or scheduled task that runs sync jobs) | Not currently in plan | ~1.00 MD DevOps + ~0.50 MD AG-F2 — see Q-1 below for deployment shape |
| **NEW** — Planner cache schema: `planner_tasks_cache`, `planner_plans_cache`, `planner_buckets_cache` (per-tenant, with composite PK `(tenant_id, graph_id)`, last-synced timestamps, soft-delete flag) | Not currently in plan | ~0.75 MD FS — Drizzle schema + migrations + read-through helpers |
| **NEW** — Read-through pattern in N1 read tools: check cache freshness; if stale, fetch live; update cache opportunistically | Partially in N1 (~0.5 MD) | ~0.25 MD AG-F1 — small extension to existing N1 |
| **NEW** — Write-through pattern in N2 write tools: every agent-initiated write updates local cache immediately, before returning to user | Not currently in plan | ~0.25 MD AG-S |
| **NEW** — Sync health monitoring + alerting (failure count, degraded status, alert webhook) | Not currently in plan | ~0.50 MD DevOps |

### Permission model

Sync uses the **app-only client-credentials token** (Epic 1 Q-4 resolution), scoped narrowly:

| Scope | Required | Not requested |
|---|---|---|
| `Tasks.Read.All` | ✅ (read all tenant tasks for sync) | We do NOT use `Tasks.ReadWrite.All` — sync is read-only |
| `Group.Read.All` | ✅ (iterate all groups to know which plans to sync) | We do NOT use `Group.ReadWrite.All` |

Code-level enforcement: the sync code path imports a typed Graph client that **only exposes read methods**. Write methods are not reachable via that code path. TypeScript compiler enforces.

### Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Cold cache on first deploy → first reads slow until sync populates | High | Low | Bootstrap script triggers initial sync immediately after tenant onboarding; user experience during first 10 min is acceptable (live Graph fallback) |
| R-2 | Stale cache during prolonged Graph outage → agent shows old data confidently | Med | Med | Cache rows carry `synced_at`; if older than 1 hour, agent disclaims ("data may be up to N minutes old") |
| R-3 | Race condition: user writes via agent, sync poll arrives mid-write, overwrites with old Graph data | Low | Med | Writes are tagged with `cache_version` token; sync respects newer cache rows (write-wins for recent writes) |
| R-4 | Many small tenants × frequent sync = cost/quota burden | Med | Med | Adaptive polling: tenants with no recent agent activity drop to 15-min polls; active tenants stay at 1-min |
| R-5 | Worker process crash → no sync until restart | Med | Med | Worker runs as ECS service with auto-restart on failure; health-check endpoint hit every 30s |
| R-6 | First sync for a large tenant (10k tasks) takes too long, blocks other tenant syncs | Low | Med | Per-tenant queue; pagination + cursor-based deltas (not all-at-once) |

### Open questions

| # | Question | Options | Resolution |
|---|---|---|---|
| Q-1 | Where does the sync worker run? | (a) Same ECS task as API. (b) Separate ECS service. (c) Lambda + EventBridge. | ✅ **RESOLVED — (b) Separate ECS service** for scalability. Independent scale from API; better long-term posture; slightly more Terraform but worth it. |
| Q-2 | Sync polling interval? | (a) Fixed 1 min. (b) Fixed 5 min. (c) Adaptive (1 min if active, 15 min if idle). | ✅ **RESOLVED — (c) Adaptive**. Controls cost as we onboard more tenants. |
| Q-3 | Idle tenants — keep syncing? | (a) Yes indefinitely. (b) Stop after N days; resume on agent request. (c) Drop to daily sync after 7 days idle. | ✅ **RESOLVED — (c) Daily after 7 days idle**. Resumes to adaptive on next agent invocation. |
| Q-4 | Alert destination for sync failures? | (a) Slack webhook. (b) Email to oncall. (c) CloudWatch alarm only. (d) Teams channel. | ✅ **RESOLVED — (d) Teams channel** (eat our own dog food). Post to a `#seta-os-ops` channel via the same Bot Framework outbound path the agent uses. CloudWatch alarm as redundant fallback. No external Slack dependency. |
| Q-5 | Cache schema for Graph changes? | (a) Single JSONB. (b) Structured columns. (c) Hybrid. | ✅ **RESOLVED — (c) Hybrid**: `id, title, due_date, assignee_ids, status` as columns + `raw_graph_json` JSONB for the rest. Queryable + future-proof. |
| Q-6 | Stale-cache disclaimer to user when serving older-than-threshold data? | (a) Always show "data may be N min old". (b) Silent. (c) Show only when cache > threshold (e.g., 1 hour). | ✅ **RESOLVED — (c) soft disclaimer when cache > 1 hour stale** ("data may be up to N min old; this can happen during transient Graph issues"). Not blocking; agent still answers. |

### Demo moment

> *During the M6 stakeholder demo, the PM types "show my tasks" — agent responds in <300ms with a card showing 12 tasks. Same query 5 minutes later — same speed. Behind the scenes, the sync worker has been polling Graph every minute, but the user never waited for it. A second window shows the audit log: every sync poll is logged with `actor=system, op=delta-sync, tenant=customer-x, tasks_changed=3`.*

### Estimated effort delta (vs current plan)

| Addition | Effort | Owner |
|---|---:|---|
| Background worker runtime (separate ECS service, Terraform module, deployment automation) | 1.00 MD | DevOps |
| Worker job loop + per-tenant scheduling + adaptive polling logic | 0.50 MD | AG-F2 |
| Planner cache schema (3 tables, hybrid columns + JSONB) **— moved from FS** | 0.75 MD | **AG-F1** |
| Read-through extension in N1 tools (freshness check + cache update) | 0.25 MD | AG-F1 |
| Stale-cache disclaimer (capability O4 lifecycle messaging) | 0.10 MD | AG-F1 |
| Write-through extension in N2 tools (immediate cache update on agent write) | 0.25 MD | AG-S |
| Sync health monitoring + Teams-channel alert webhook (posts via Bot Framework to `#seta-os-ops`) | 0.50 MD | DevOps |
| **Total epic delta** | **+3.35 MD** | FS +0 · AG-S +0.25 · AG-F1 +1.10 · AG-F2 +0.50 · DO +1.50 |

**Net role impact** (cumulative with Epics 1+2, rebalanced):
- FS: 33.18 MD (95% util) — held flat ✅
- AG-S: 29.72 → 29.97 MD (86%) — healthy
- AG-F1: 27.25 → 28.35 MD (81%) — healthy
- AG-F2: 13.50 → 14.00 MD (50% of effective) — spare
- DO: 12.25 → 13.75 MD (39%) — spare

All roles within healthy bounds. AG-F1 takes the cache schema (natural fit — they own M2 Graph client and know the data shapes).

---

### Epic 3 status: ALL OPEN QUESTIONS RESOLVED ✅

---

## EPIC 4 — Teams App Installation & Customer Onboarding

### Business outcome

A customer IT admin can install the Seta agent in their Microsoft Teams tenant by uploading an app package (manifest .zip) through the Teams Admin Center. End users in that tenant can then `@SetaAgent` in any chat or channel where the agent is added. First-time @-mention triggers a friendly welcome card that explains capabilities and links to the install/usage docs. Uninstall cleanly revokes tokens and marks the tenant inactive.

### Why this epic

The agent could be the best in the world, but if customers can't install it, none of it matters. Teams app distribution has its own rules (manifest, validators, admin policies, sideload vs. marketplace). Get this wrong and the demo dies on "we can't show you in your own tenant; let me share screen from Seta's tenant instead."

### User stories

**As a Seta IT admin**, I want to sideload the agent in Seta's Teams tenant before kickoff, so the internal pilot (BK-1) can start day 1 of P1.

**As a design-partner customer IT admin**, I want to install the agent in our Teams tenant via the standard Teams Admin Center upload flow, set which teams/channels can use it, and not have to ask Seta for help.

**As an end user**, when I first `@SetaAgent` in a chat, I want a friendly welcome card that tells me what the agent can do and links to the user guide — not silence or a generic error.

**As a customer IT admin who decides to remove the agent**, I want the uninstall to be clean — tokens revoked, our data not retained, and Microsoft sees the app as removed.

### Acceptance criteria

| # | Criterion | Verifiable how? |
|---|---|---|
| AC-1 | The manifest `.zip` passes the Microsoft Teams App Validator with **zero errors** before sideload | Run validator in CI on every manifest change |
| AC-2 | A Seta IT admin can sideload to Seta's Teams tenant in **under 2 minutes** from a clean state (download zip → upload in Admin Center → app appears in Apps catalog) | Manual run-through during dev tunnel setup (T1.1) |
| AC-3 | A customer IT admin can install via **Teams Admin Center → Manage apps → Upload new app**, with no marketplace submission required | Documented in Epic 6 customer install guide; tested with a fresh non-Seta Microsoft 365 tenant |
| AC-4 | First `@SetaAgent` in any chat triggers a **welcome Adaptive Card** introducing capabilities + linking to the user guide; the welcome fires once per user per conversation | E2E test: fresh user, fresh conversation, observe welcome card |
| AC-5 | Bot is reachable from **Teams desktop, web, and mobile (iOS + Android)** — same response, same rendering | Manual smoke test across all 4 clients in Q5 milestone passes |
| AC-6 | When customer IT admin **uninstalls** the app: bot receives `conversationUpdate` removed event → marks tenant `app_status=uninstalled` → revokes OAuth tokens → emits audit log | Negative test: uninstall in Admin Center, verify cleanup |
| AC-7 | The bot's icon, name, short description, long description, and privacy/ToS URLs **meet Microsoft Teams app guidelines** (in case we later want to submit to the public marketplace) | Pre-flight check against the guidelines doc; Legal sign-off at H2 covers privacy/ToS |
| AC-8 | When added to a Team (not just a 1:1 chat), the bot responds to `@SetaAgent` mentions in channels and respects channel-scope (does not leak cross-channel data) | E2E test in a team with 2+ channels |
| AC-9 | Per-tenant install event captured in `audit_log` with `actor_user=<admin_who_installed>`, `tenant_id`, `timestamp`, `manifest_version` | Inspect audit log post-install |

### Capabilities required

| Capability | Status in plan | Notes |
|---|---|---|
| **T1.1** — Azure AD app reg + Bot Framework reg + devtunnel | Already in plan, 0.50 MD FS | Foundation for the bot endpoint |
| **T1.8** — Teams app manifest + icons + sideload to dev tenant | Already in plan, 0.50 MD FS | The actual manifest + sideload procedure |
| **NEW** — First-run welcome card (Adaptive Card with capability list + user-guide link, fires on first @-mention per user per conversation) | Not currently in plan | ~0.50 MD AG-F. Touches A4 cards + A5 Teams handler. |
| **NEW** — Install/uninstall lifecycle handlers (Bot Framework `conversationUpdate` events: `installationUpdate.action=add`/`remove`) | Not currently in plan | ~0.50 MD AG-S. Hooks into Epic 1 revocation handling for tokens. |
| **NEW** — Cross-client validation (desktop, web, iOS, Android — same response, same rendering) | Implicit in Q5 manual gates | ~0.25 MD QA. Add explicit test plan row. |
| **NEW** — Manifest validator in CI (pre-commit hook + GitHub Actions check) | Not currently in plan | ~0.25 MD DO. Prevents broken manifest from being committed. |
| **NEW** — App icon assets (color icon 192x192, outline icon 32x32 transparent) — design + production-ready PNG | Not currently in plan | ~0.25 MD design (no designer on team; PM coordinates with an external graphic designer, ~$200 budget) |

### Distribution model

| Path | For | Mechanism |
|---|---|---|
| **Sideload (custom app upload)** — P1 default | Seta IT, design-partner customers | Customer IT admin downloads `seta-agent.zip` (manifest + icons) → Teams Admin Center → Manage apps → Upload → policy-allow for selected users/groups. Install lead time: ~10 minutes for IT admin. |
| **Public marketplace submission** — deferred to P2 or P3 | Future general availability | Submit to Microsoft Teams Store via Partner Center; review takes 1–2 weeks; requires Privacy Policy, Terms of Use, marketing materials. Not needed for design-partner phase. |

### Distribution artifact

A single `seta-agent.zip` file is produced by CI on every release:
- `manifest.json` (the Teams app declaration)
- `color.png` (192×192 color icon)
- `outline.png` (32×32 transparent outline icon)

CI publishes this to a versioned location (S3 bucket or GitHub Releases) so customer admins always have a direct link to the latest stable version. The zip is built reproducibly from the repo; no human hand-editing.

### Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Manifest validation fails at sideload time (typo, schema version mismatch) | Med | High | AC-1: CI runs Teams App Validator on every manifest change; broken manifest blocks merge |
| R-2 | Customer org policy blocks all bot installs (no exception path) | Low | High | Sales pre-screens design-partner customer: confirm their Teams app policy allows custom-app sideload before consent flow |
| R-3 | Mobile client renders Adaptive Cards differently from desktop (line wraps, button hidden) | Med | Med | AC-5 cross-client validation; A4 cards designed to graceful-degrade (text fallback for any chart) |
| R-4 | Bot is added to a Team with 1000+ members → flood of welcome cards | Low | Med | AC-4 limits welcome to once-per-user-per-conversation; rate-limited per tenant |
| R-5 | Uninstall doesn't fire `conversationUpdate.remove` (Bot Framework quirk in some clients) | Med | Med | Periodic reconciliation: daily job checks Teams app installations via Graph; flags tenants whose app is gone but DB still says installed |
| R-6 | Public marketplace ambitions creep into P1 ("we need to be in the Teams Store for credibility") | Med | High | Explicit P2/P3 deferral; design-partner customers don't need marketplace. P1 demo works fine with sideload. |

### Open questions

| # | Question | Options | Default |
|---|---|---|---|
| Q-1 | Submit to Teams Store in P1? | (a) Yes — adds 1–2 weeks of Microsoft review + privacy/marketing artifacts. (b) Sideload only for P1; submit to marketplace in P2 or P3. | (b) Sideload only — keeps P1 scope tight; design-partner customers install via Admin Center upload |
| Q-2 | Do we ship a Tab UI (custom interface inside Teams) in P1, or chat/conversation only? | (a) Chat only — fast, scope-tight. (b) Add a basic Tab UI (settings, run history). | (a) Chat only — Tab adds ~2 MD frontend work; defer to P2 with Studio |
| Q-3 | When the bot is added to a channel (vs a 1:1 chat), does it respond only on @-mention, or also to message keywords? | (a) @-mention only — quieter, lower false-positive rate. (b) Mention OR keyword like "seta:" prefix. (c) Mention OR any reply to its own previous message. | (a) @-mention only — keeps the bot quiet by default; users opt-in to engagement |
| Q-4 | Does the bot send proactive messages? | (a) No proactive in P1. (b) Daily digest opt-in. (c) Real-time push. | ✅ **RESOLVED — (b) Daily digest in P1**, via **Teams proactive message** (primary) with Outlook email as a P2 follow-up (defers `Mail.Send` scope). See "Epic 4 supplement — Daily Digest" below. |
| Q-5 | Icon design — who creates it? | (a) Generic placeholder. (b) Hire designer ($200–500). (c) Seta's existing brand asset. | ✅ **RESOLVED — (c) Seta's existing brand asset**; designer fallback only if Seta brand asset isn't suitable for Teams app icon dimensions |

### Demo moment

> *Customer IT admin Sarah opens Microsoft Teams Admin Center → Manage apps → Upload new app → selects `seta-agent-v0.1.0.zip` from her downloads. Confirmation appears: "Seta Agent uploaded — assign to users to make available." She creates a policy "Marketing Team — Seta Agent allowed" and assigns 50 users. In Teams, one of those users (Mark) opens a new chat with @SetaAgent. The first thing he sees is a welcome card: "Hi Mark 👋 I'm SetaAgent. I can help you manage Planner tasks, analyze workload, and answer questions about Seta. Try: 'Show my open tasks' or 'What is our refund policy?' Full guide ↗". Mark types "show my open tasks" and gets his Planner data in 200ms. The next morning at 8 AM local time, Mark receives a Teams card from @SetaAgent: "Daily digest — you have 2 tasks due today, 1 overdue, 5 due this week. View all ↗"*

---

### Epic 4 supplement — Daily Digest (resolves Q-4)

#### Scope

Daily proactive message to each user who opted in (default opt-in for users with agent activity in the last 7 days), summarizing their Planner state — tasks due today, overdue, due this week.

| Aspect | P1 decision |
|---|---|
| Delivery channel | **Teams proactive message** (primary) |
| Outlook email delivery | **Deferred to P2** — avoids adding `Mail.Send` scope to the consent ask in P1 |
| Content | **Templated** (not LLM-generated) — fast, deterministic, zero LLM cost per digest |
| Timing | Fixed **8 AM in tenant's primary timezone** (configurable per tenant in P2) |
| Opt-in default | **Auto opt-in** for users who used the agent in the last 7 days; opt-out via in-chat command (`@SetaAgent stop daily digest`) |
| Per-user customization | **Not in P1** — same digest format for everyone. P2 adds per-user filters (only my tasks vs team's) |

#### Capabilities added

| Capability | Effort | Owner |
|---|---:|---|
| Daily digest scheduler (cron job in sync-worker ECS service, per-tenant, fires at tenant's 8 AM local) | 0.50 MD | DO + AG-F2 |
| Templated digest content generator (Markdown → Adaptive Card from cached Planner data) | 0.50 MD | AG-F |
| Teams proactive message delivery + "proactive trust" handshake (bot remembers each user's serviceUrl + conversation reference from first chat) | 1.00 MD | AG-S — subtle (proactive trust tokens, conversation references) |
| Opt-out command handler (`@SetaAgent stop daily digest` + persist preference) | 0.25 MD | AG-F |
| Daily digest E2E test (one user, one tenant, verify card arrives at 8 AM staging tenant time) | 0.50 MD | QA |
| **Total daily-digest delta** | **+2.75 MD** | AG-S +1.00 · AG-F +0.75 · AG-F2 +0.25 · DO +0.25 · QA +0.50 |

#### Risks

| # | Risk | Mitigation |
|---|---|---|
| R-D1 | Proactive trust tokens are subtle in Bot Framework — first message must be user-initiated (cannot proactively message a user the bot has never talked to) | Auto-opt-in only includes users with prior agent activity (means we already have their conversation reference). New-tenant users only get digests starting day 2 after first @-mention. |
| R-D2 | Digest fires for user on vacation → noise complaint | Opt-out command makes it one-tap to disable; absent-user detection (no Teams activity in 5 days) auto-pauses |
| R-D3 | Timezone detection — tenant primary timezone may be wrong for individual user | Use tenant TZ in P1 (good enough for one-region customers); per-user TZ in P2 |
| R-D4 | Customer's Teams compliance policy blocks proactive bot messages | Pre-flight check: if proactive message returns 403, log + auto-disable digest for that tenant; surface in admin runbook |

#### New AC for Epic 4 (digest-specific)

| # | Criterion | Verifiable how? |
|---|---|---|
| AC-10 | Daily digest delivered as Teams proactive card at 8 AM tenant primary timezone, only to users with agent activity in last 7 days | E2E test in staging with timezone shift |
| AC-11 | Opt-out via `@SetaAgent stop daily digest` removes user from list within 60 seconds; persists across restart | Manual + integration test |
| AC-12 | If proactive delivery fails (Bot Framework 403 / proactive trust missing), error logged + tenant marked `digest_status=blocked` + Teams ops channel alerted | Negative test: revoke proactive trust manually, observe |

### Estimated effort delta (vs current plan)

| Addition | Effort | Owner |
|---|---:|---|
| First-run welcome card + once-per-user-conversation gate | 0.50 MD | AG-F |
| Install/uninstall lifecycle handlers (`conversationUpdate` events + cleanup) | 0.50 MD | AG-S |
| Cross-client validation test plan (desktop, web, iOS, Android) | 0.25 MD | QA |
| Manifest validator in CI (pre-commit + GH Actions) | 0.25 MD | DO |
| App icon — use Seta's existing brand asset (PM coordinates extraction + resize to 192x192 + 32x32) | 0.10 MD coordination | PM (no external spend if Seta brand asset works) |
| **Subtotal (install + onboarding)** | **+1.60 MD** | PM +0.10 · AG-S +0.50 · AG-F +0.50 · QA +0.25 · DO +0.25 |
| **+ Daily digest supplement (per resolution above)** | **+2.75 MD** | AG-S +1.00 · AG-F +0.75 · AG-F2 +0.25 · DO +0.25 · QA +0.50 |
| **Total Epic 4 delta (including digest)** | **+4.35 MD** | PM +0.10 · AG-S +1.50 · AG-F +1.25 · AG-F2 +0.25 · QA +0.75 · DO +0.50 |

**Net role impact** (cumulative with Epics 1+2+3+4):
- PM: 15.00 → 15.10 MD (43%) — healthy
- FS: 33.18 MD (95%) — held flat ✅
- AG-S: 29.97 → 31.47 MD (**90%**) — tight; was 87% before digest
- AG-F1: 28.35 MD (81%) — healthy
- AG-F (split between F1/F2): +1.25 work to distribute
- AG-F2: 14.00 → 14.25 MD (51% of 28 effective) — spare
- QA: 31.25 → 32.00 MD (**91%**) — tighter; was 89% before digest
- DO: 13.75 → 14.25 MD (41%) — spare

**Tightening watch**: AG-S at 90%, QA at 91%. Both still within range but no slack for surprises. If we add Epic 5 (mock mode) or Epic 6 (docs) and either of these creeps further, we'll need explicit mitigation. AG-F2 still has ~14 MD spare which can absorb the AG-F work split.

External spend: ~$0 if Seta brand asset works for the icon; ~$200 fallback only if needed.

---

### Epic 4 status: ALL OPEN QUESTIONS RESOLVED ✅

---

## EPIC 5 — Mock LLM Mode (temporary parallel-work scaffolding)

### Scope clarification

**This is throwaway scaffolding, not a permanent feature.** Built fast in W1, used by Agent team for W1–W3 to develop without waiting on live LLM wiring, then **deleted around W4** once the real OpenAI path is stable. No demo-mode, no production guards, no quarterly fixture refresh, no fixture coverage CI gates. Minimum viable mock client, then gone.

### Business outcome

In W1, Agent team (AG-S, AG-F1, AG-F2) can write + run + test agent code without depending on FS/DO finishing OpenAI credential wiring. They use canned LLM responses behind the same `ModelClient` interface. The mock client is removed from the codebase in W4 (before staging deploy).

### User stories

**As AG-Senior in Week 1**, I want a mock LLM client I can construct in 30 minutes so my run loop work isn't blocked on FS finishing OpenAI integration.

**As AG-Fresher 1 building the Tool framework**, I want deterministic mock responses for my unit tests so I'm not flaky on OpenAI rate limits during development.

### Acceptance criteria

| # | Criterion | Verifiable how? |
|---|---|---|
| AC-1 | `MockModelClient` implements the same `ModelClient` interface as the OpenAI client | Type check + one swap test |
| AC-2 | Toggled via `MOCK_LLM=1` env var | Local dev: set var, observe mock; unset, observe live |
| AC-3 | Hand-written JSON fixtures in `__fixtures__/mock-llm/` covering the ~10 prompts AG team needs for W1–W2 dev | File inspection |
| AC-4 | Missing-fixture lookup fails loud with clear error message | Negative test in W1 |
| AC-5 | **Removal**: by end of W3, the `MockModelClient` class, the fixture directory, and the env var handling are deleted from the codebase | Git commit at end of W3 removes the directory; CI passes against live OpenAI only |

### Capabilities required

| Capability | Effort | Owner |
|---|---:|---|
| **NEW** — `MockModelClient` (subclass/impl of `ModelClient`, reads fixtures by prompt hash, fails loud on miss) | 0.30 MD | AG-F2 |
| **NEW** — Initial 10–15 hand-written fixtures for AG team W1–W2 prompts | 0.20 MD | AG-F2 |
| **NEW** — Removal task in W3 (delete `MockModelClient`, fixture dir, env var; replace any test usage with live LLM or recorded-via-K6) | 0.10 MD | AG-S |
| **Total epic delta** | **+0.60 MD** | AG-S +0.10 · AG-F2 +0.50 |

### Lifecycle (compressed)

| Week | State |
|---|---|
| W1 (~Mon-Tue) | AG-F2 ships `MockModelClient` + 10 fixtures. AG team starts using it for local dev + initial unit tests. |
| W1–W3 | AG team uses mock when FS/DO have OpenAI credentials in flight or for fast iteration loops. |
| End of W3 | Real OpenAI is wired through K3 + W4-W5 server endpoints. AG-S deletes `MockModelClient` + fixtures dir. CI runs entirely against live OpenAI (with K6 record/replay for cost containment in tests). |
| W4 onward | Mock mode does not exist. K6 record/replay (which is a separate, permanent test infrastructure capability) handles deterministic CI without re-introducing a runtime mock. |

### Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | Removal in W3 gets delayed; mock lingers as "temporary forever" | Explicit removal task in capability list with W3 deadline; PM blocks W4 start if mock still in codebase |
| R-2 | AG team adds business logic that depends on mock-specific quirks | AC-1 (same interface as OpenAI) prevents this; PR review enforces |

### Why no demo mode / prod guard / nightly smoke

Because **mock is gone before staging deploys**. The risks of mock-in-production, mock/live drift, and demo-fallback don't exist if the code is deleted in W3. We don't need to build infrastructure to manage a thing that won't be alive.

### Estimated effort delta — recap

**Total Epic 5: +0.60 MD** (vs the +1.95 MD of the over-engineered earlier draft).

**Net role impact** (cumulative with Epics 1+2+3+4):
- PM: 15.10 MD (43%) — no change
- FS: 33.18 MD (95%) — no change
- AG-S: 31.47 → 31.57 MD (90%) — minor
- AG-F1: 28.35 MD (81%) — no change
- AG-F2: 14.25 → 14.75 MD (53% effective) — minor
- QA: 32.00 MD (91%) — no change
- DO: 14.25 MD (41%) — no change

No new constraints from Epic 5.

---

### Epic 5 status: SCOPED AS TEMPORARY SCAFFOLDING — no open questions ✅

Mock is built fast in W1 (~0.5 day), used through W3, deleted W4. K6 record/replay remains the permanent CI-cost-containment mechanism — it predates and outlives mock mode.

---

---

## EPIC 6 — Install Documentation (Customer IT Admin + Seta Internal IT Admin)

**Outcome**: Customer IT admin can install Seta Agent in their tenant in ≤30 min from docs alone. Seta IT admin can bootstrap Seta from a runbook. End users have a 1-page primer.

### Scope (deliverables — all Markdown in `docs/`)

| # | File | Audience | Owner |
|---|---|---|---|
| 1 | `docs/install/customer.md` | Customer IT admin | PM (writes) · FS (review) · AG-F2 (validates) |
| 2 | `docs/install/security-overview.md` | Customer security / vendor-review | PM · FS + AG-S (review) |
| 3 | `docs/runbook/bootstrap.md` | Seta IT / DevOps | PM · DevOps (review) |
| 4 | `docs/user/quickstart.md` + `@SetaAgent help` in-app command | All Teams users | PM · AG-F (wires command) |
| 5 | Troubleshooting matrix — embedded in `customer.md` + `bootstrap.md` | All install audiences | PM + FS pair session |

### Defaults

- **Format**: Markdown only (no PDF generation). All docs live in the same repo under `docs/`.
- **Hosting**: `os.seta-international.com/docs/{install,runbook,user}/` — rendered from same repo.
- **Versioning**: evergreen "latest" in P1.
- **Validation**: AG-F2 dry-runs the customer guide from a fresh tenant before M6 (stopwatch-timed).
- **Language**: English only in P1.

### Key acceptance signals

- Fresh-tenant onboarding via doc-only completes in **<30 min** (AG-F2 dry-run)
- Security overview answers the 10 standard third-party-vendor review questions
- Internal bootstrap runbook completes **<2 hours** from clean AWS account (DevOps dry-run)
- Every example prompt in user quickstart works verbatim on staging at M6-1 day

### Top risks

- **Doc/reality drift** — mitigated by "doc-change required" line in PR template for any install/config change
- **Author-blindness** — mitigated by AG-F2 fresh-eyes dry-run
- **MS Admin Center UI changes** — refresh screenshots in M6-1 week sprint

### Effort

| Addition | MD | Owner |
|---|---:|---|
| `customer.md` (install guide + troubleshooting + screenshots) | 1.50 | PM |
| `security-overview.md` | 0.25 | PM |
| `bootstrap.md` (internal runbook) | 0.75 | PM |
| `quickstart.md` + `@SetaAgent help` wire-up | 0.25 + 0.10 | PM + AG-F |
| Doc dry-run validation | 0.50 | AG-F2 |
| Troubleshooting matrix (pair session) | 0.25 + 0.25 | PM + FS |
| **Total** | **+3.85** | PM +3.00 · FS +0.25 · AG-F +0.10 · AG-F2 +0.50 |

### Demo moment

PM hands `customer.md` to a fresh reader 2 days before M6, starts a stopwatch. M6 demo opens with the stopwatch reading.

### Net role impact (cumulative through all 6 epics)

| Role | Base MD | Util |
|---|---:|---:|
| PM | 18.10 | 52% |
| FS | 33.43 | 96% |
| AG-S | 31.57 | 90% ✅ no change |
| AG-F1 | 28.35 | 81% |
| AG-F2 | 15.25 | 54% effective |
| QA | 32.00 | 91% ✅ no change |
| DevOps | 14.25 | 41% |

PM absorbs docs work; AG-S and QA held flat.

---

## ⏸ ALL 6 EPICS DRAFTED — your turn

Recap of the 6 epics:

| Epic | Title | Status | Delta MD |
|---|---|---|---:|
| 1 | MS365 Authentication & Authorization | ✅ All questions resolved | +1.75 |
| 2 | MS365 Planner CRUD via Agent (Read + Write) | ✅ All questions resolved | +1.25 |
| 3 | MS365 Background Delta Sync | ✅ All questions resolved | +3.35 |
| 4 | Teams App Installation & Customer Onboarding (incl. Daily Digest) | ✅ All questions resolved | +4.35 |
| 5 | Mock LLM Mode (temporary scaffolding, removed W3) | ✅ Scoped as throwaway | +0.60 |
| 6 | Install Documentation (Customer + Internal IT Admin) | DRAFTED, 5 questions open | +3.85 |
| **TOTAL across all 6 epics** | | | **+15.15 MD** |

**Cumulative role utilization after all 6 epics applied to Project Plan v2.9**:

| Role | Base MD | Util |
|---|---:|---:|
| PM | 18.10 | 52% |
| Fullstack (FS) | 33.43 | 96% |
| AG-Senior | 31.57 | 90% |
| AG-Fresher 1 | 28.35 | 81% |
| AG-Fresher 2 | 15.25 | 54% (effective) |
| QA | 32.00 | 91% |
| DevOps | 14.25 | 41% |
| **TOTAL** | **172.95** | **72%** |

All roles within healthy bounds. No further mitigation needed beyond what's already documented.

### Next actions for you

1. **React to Epic 6** open questions (Q-1 to Q-5) or any of the 6 risks
2. Tell me which (if any) of the +15.15 MD additions you want lifted into the master Project Plan v2.10 — I can do this in one consolidated pass
3. Or flag anything missing — are there capabilities for MS365 the 6 epics didn't cover that you want a 7th epic for?

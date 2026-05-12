# Cross-cutting deletion flow — GDPR / right-to-be-forgotten / tenant offboarding

> Cross-cutting procedure for tenant-initiated deletion (GDPR + similar
> privacy laws, tenant offboarding, individual subject-of-rights request).
> Owns the contract for every owner package that holds `tenant_id`-scoped
> data; each owner package must export the named purge functions in
> "Implementation hooks" below.

## Scope

Three distinct deletion shapes are in scope:

1. **GDPR / similar privacy-law right-to-be-forgotten request.** A data
   subject (individual user) exercises their right to erasure under
   GDPR Art. 17 or an equivalent jurisdiction (CCPA, UK DPA, etc.). Subject
   is identified by `(tenant_id, principal_id)` — typically `(tenant_id,
   auth.users.id)`.
2. **Tenant-initiated offboarding.** A customer tenant terminates its Seta
   subscription. Every row scoped to that `tenant_id` is purged across every
   owner package's schema.
3. **Subject-of-rights request inside a tenant.** A tenant administrator
   requests deletion of a specific user inside their tenant without
   offboarding the tenant. Same shape as (1) but originated by the tenant
   admin instead of the data subject.

> **Out of scope.** Right-to-export (data portability) is a separate spike
> — see Open Questions. Aggregated metrics with no PII are retained
> indefinitely.

## Definitions

| Term | Meaning |
|---|---|
| **Tenant deletion** | Cascade-deletes every row with `tenant_id = <id>` across every owner package's schema. Terminates the tenancy. |
| **User deletion** | Cascade-deletes rows that identify a single principal within a tenant (`auth.users` row + every row keyed by `user_id` or `principal_id` within that tenant). Tenant survives. |
| **Conversation (thread) deletion** | Deletes a single `agent_memory.conversations` row and cascades to its `agent_memory.turns` + `agent_memory.working_memory` rows. Tenant + user survive. |
| **Pseudonymisation** | `user_id` → `'deleted_user_<sha256(user_id)[0..16]>'`. `tenant_id` retained for cross-tenant aggregate analysis. Used by `audit.audit_log` only, where legal retention overrides erasure (see "What is NOT deleted"). |

## Schemas affected (exhaustive)

Every owner package's schema with tenant-scoped data, derived from each
package's `SCOPE.md`. CLAUDE.md "Boundaries" + setup.md §3 "Schema-per-module
(DDD)" (`docs/setup.md:102-127`) means each owner package's purge function
owns its schema; no cross-schema FK exists (CLAUDE.md "No cross-schema
foreign keys"; setup.md §3 lines 121-123), so deletion is one transaction per
schema, ordered by data-dependency (reverse-FK-like, even though there are no
FKs).

| Schema | Owner package | Tables | Tenant-delete semantics | User-delete semantics |
|---|---|---|---|---|
| `auth` | `@seta/auth` (`platform/auth/SCOPE.md`) | `users`, `sessions`, `api_keys` | Hard-delete every row where `tenant_id = <id>`. Order: `sessions` → `api_keys` → `users` (sessions and api_keys reference users by id). | Hard-delete `users` row for the principal; cascade to `sessions` + `api_keys` rows where `user_id = <id>`. |
| `tenant` | `@seta/tenant` (`platform/tenant/SCOPE.md`) | `tenants`, `tenant_connectors` | Hard-delete. Order: `tenant_connectors` → `tenants` (the only true FK in P1, per `platform/tenant/SCOPE.md` § "Current state" line 52). This is the **last** schema purged in a tenant delete — once `tenant.tenants` row is gone, no other purge can resolve `tenant_id`. | N/A — user deletion does not touch tenant schema. |
| `directory` | `@seta/directory` (`platform/directory/SCOPE.md`) | `external_identities` | Hard-delete every row where `tenant_id = <id>`. | Hard-delete every row where `user_id = <auth_users_id>`. |
| `oauth` | `@seta/oauth` (`platform/oauth/SCOPE.md`) | `oauth_tokens`, `oauth_state` | Hard-delete every row where `tenant_id = <id>`. **Decrypt-then-zero is unnecessary** — the wrapped DEK + ciphertext are deleted together; once the row is gone, KMS will refuse to decrypt the orphaned ciphertext in backups (the `EncryptionContext = {tenantId, purpose: 'oauth_token'}` binding survives even after the row is gone, but no decrypt callsite has the wrapped DEK anymore). See setup.md §4 line 325 + "What is NOT deleted" below. | Hard-delete every row where `partition_key` matches `user:<homeAccountId>` for the deleted principal (`platform/oauth/SCOPE.md` § "Owns" — OBO writes partition `user:<homeAccountId>`). |
| `audit` | `@seta/audit` (`platform/audit/SCOPE.md`) | `audit_log` | **Special: retain rows; pseudonymise `actor_id`.** Legal retention overrides erasure (recommend 7 years per common-law jurisdictions; confirm per-customer if EU-only). `actor_id` becomes `'deleted_user_<id_hash>'`; `tenant_id` retained for compliance reads; `metadata` jsonb is *not* deep-scanned for PII (callers were forbidden from putting secrets there per `platform/audit/SCOPE.md` § "Patterns to avoid" — same rule means no PII either). | Same: pseudonymise `actor_id` everywhere it equals the deleted `user_id`. Do not delete the row. |
| `connector_ms365_directory` | `@seta/connector-ms365-directory` (`modules/connectors/ms365-directory/SCOPE.md`) | `directory_users`, `directory_groups`, `directory_group_members`, `sync_state` | Hard-delete every row where `tenant_id = <id>`. Order: `directory_group_members` → `directory_groups` → `directory_users` → `sync_state` (members reference both users and groups by `entra_object_id` / `entra_group_id` — by-id, no FKs). | Hard-delete rows in `directory_users` + `directory_group_members` where `entra_object_id` resolves to the deleted principal (lookup via `directory.external_identities`). `directory_groups` survives (group identity is not user-PII). |
| `connector_ms365_planner` | `@seta/connector-ms365-planner` (`modules/connectors/ms365-planner/SCOPE.md`) | `planner_tasks_cache`, `planner_plans_cache`, `planner_buckets_cache`, `sync_watermarks` (the SCOPE.md description also references `planner_task_details_cache` from setup.md §3 line 116) | Hard-delete every row where `tenant_id = <id>`. Cache is rebuildable from MS Graph if needed for a new tenancy. | **No per-user purge — Planner tasks are tenant-scoped, not user-scoped within the cache.** A user-delete leaves Planner cache rows pointing at an `entra_object_id` that no longer resolves through directory; that's acceptable because Planner is an external system of record and the cache reflects external state. |
| `agent` | `@seta/agent` (product — `modules/products/agent/SCOPE.md`) | `write_continuations` | Hard-delete every row where `tenant_id = <id>`. HMAC-signed preview tokens become invalid on row deletion (the `consumed_at` idempotency token disappears with the row). | Hard-delete every row where the continuation's resolved actor matches the deleted principal. |
| `agent_memory` | `@seta/agent-memory` (`platform/agent/memory/SCOPE.md`) | `conversations`, `turns`, `working_memory` | Hard-delete every row where `tenant_id = <id>`. Order: `turns` → `working_memory` → `conversations` (turns and working_memory reference conversations by `thread_id`, by-id, no FKs). | Hard-delete every row where `principal_id = <id>` per `platform/agent/memory/SCOPE.md` § "Patterns to follow" — "Resource-scoped working memory keyed by `tenant_id` + `principal_id`". Conversation-history rows scoped to that principal go with the principal. |
| `agent_workflows` | `@seta/agent-workflows` (`platform/agent/workflows/SCOPE.md`) | `workflow_snapshots`, `workflow_steps` | Hard-delete every row where `tenant_id = <id>`. Order: `workflow_steps` → `workflow_snapshots` (steps reference snapshots by `run_id`, by-id). In-flight workflows for the deleted tenant are **terminated**, not resumed; the advisory-lock holder (per `platform/agent/workflows/SCOPE.md` § "Minimum viable P1 surface") loses on next resume attempt. | Hard-delete workflows where the workflow's originating principal matches the deleted user. Most workflows are tenant-scoped, not user-scoped; user deletion typically leaves the snapshot intact and pseudonymises the originator in `metadata`. |
| `agent_vector` | `@seta/agent-vector` (`platform/agent/vector/SCOPE.md`) | `chunks` | Hard-delete every row where `tenant_id = <id>`. **The corpus + uploads** — every ingested chunk for that tenant, including the FAQ-agent corpus. Embedding cost to re-ingest is real; tenant-delete is irreversible (no soft path here). | Hard-delete every row where `source_id` resolves to a user-owned upload. `source_id` is opaque (`platform/agent/vector/SCOPE.md` § "Open questions" #3); the consumer package owns the user → source mapping. |

> **Schemas not in the list (deliberately).** `connector_registry`,
> `ms-graph`, `middleware`, `observability`, `tsconfig` — none own tenant data
> (per their respective `SCOPE.md` § "Does NOT own" sections). They appear in
> the import graph but not in the deletion graph.

## Tenant deletion procedure

The reverse-data-dependency order is enforced explicitly because there are
**no cross-schema FKs** to do it for us (CLAUDE.md "No cross-schema foreign
keys"; setup.md §3 lines 121-123). Each step runs **in its own transaction
per schema** (CLAUDE.md "Schema-per-module"; setup.md §3 line 124 — "Each
schema is owned exclusively by its owner package").

1. **Verify the tenant id.** The admin endpoint
   (`DELETE /admin/tenants/:id` — see "`apps/api` surface" below) re-reads
   `tenant.tenants` to confirm the row exists and the caller is authorised.
   A typo at this step is the last chance to abort.
2. **Freeze the tenant — suspend new requests.** Set `tenant.tenants.status
   = 'frozen'` (today this is a free-form text column per
   `platform/tenant/SCOPE.md` § "Open questions" #4). `tenantMiddleware`
   (`platform/tenant/SCOPE.md` § "Public interface") refuses to enter
   `tenantContext.run` for a frozen tenant. CLAUDE.md "Idempotent external
   boundaries" — webhooks for the tenant return 410 Gone during freeze.
3. **Audit-log a `tenant.deletion_started` event BEFORE any rows are
   touched.**
   ```ts
   await recordAudit(sql, {
     tenantId: '<tenant>',
     actor:   { type: 'user', userId: '<seta-operator>' },
     operation: 'tenant.deletion_started',
     resource:  { type: 'tenant', ids: ['<tenant>'] },
     result:    'ok',
     metadata:  { reason: 'customer_offboarding', requested_at: '2026-MM-DDT…', soft_delete_window_days: 30 },
   })
   ```
   This is the **last** time `<seta-operator>`'s plain `userId` appears in
   the audit log for this tenant — after pseudonymisation in step 6, the
   audit row's `actor_id` will continue to reference Seta-side operators
   normally (they're not the deleted subject) but any *tenant-side* actors
   referenced in `audit_log` for this tenant become `deleted_user_<hash>`.
4. **30-day reversal window — soft-deletion (stash-then-purge).** Set
   `tenant.tenants.status = 'deletion_pending'` and record
   `deletion_pending_until` (timestamptz, 30 days from now). The tenant is
   not accessible to its users during this window, but a **single
   `POST /admin/tenants/:id/restore` call** can flip status back to `active`
   without data loss. If 30 days elapse with no restore, the cron / scheduled
   job (out of P1 scope — see Open Questions) proceeds to step 5. **In P1,
   the 30-day timer is enforced operationally by on-call** — there is no
   scheduled-job runner yet (setup.md §11 + `platform/agent/workflows/SCOPE.md`
   § "Patterns to avoid" — "Do NOT add scheduled / cron-driven step wakeups
   in P1").
5. **Cascade-delete in dependency order.** Each step is one transaction in
   the named schema, run as `platform_admin` (BYPASSRLS, setup.md §3 line
   73; `platform/db/SCOPE.md` § "Patterns to follow"). The order mirrors the
   data dependency direction; see CLAUDE.md "Schema-per-module" + setup.md
   §11 "Dependency direction" (`docs/setup.md:1079-1092`).
   ```
   5a. agent_vector.chunks                                  (corpus + uploads)
   5b. agent_workflows.workflow_steps                        (steps reference snapshots by run_id)
       agent_workflows.workflow_snapshots
   5c. agent_memory.turns
       agent_memory.working_memory
       agent_memory.conversations
   5d. agent.write_continuations                             (product schema)
   5e. connector_ms365_planner.planner_tasks_cache
       connector_ms365_planner.planner_plans_cache
       connector_ms365_planner.planner_buckets_cache
       connector_ms365_planner.sync_watermarks
   5f. connector_ms365_directory.directory_group_members
       connector_ms365_directory.directory_groups
       connector_ms365_directory.directory_users
       connector_ms365_directory.sync_state
   5g. oauth.oauth_state
       oauth.oauth_tokens                                    (encrypted at rest; row + wrapped DEK go together)
   5h. directory.external_identities
   5i. auth.sessions
       auth.api_keys
       auth.users
   5j. audit.audit_log                                       (pseudonymise — do NOT delete; see step 6)
   5k. tenant.tenant_connectors
       tenant.tenants                                        (the final row; deletion completes)
   ```
6. **Pseudonymise `audit.audit_log` rows for the tenant.** UPDATE
   `actor_id = 'deleted_user_' || substring(encode(sha256(actor_id::bytea),
   'hex') from 1 for 16)` for every row where `tenant_id = <id>` **AND**
   `actor_type = 'user'` (the SCOPE.md schema columns at
   `platform/audit/SCOPE.md` § "Owns"). Rows where `actor_type = 'system'`
   pass through unchanged (system actor ids identify Seta services, not
   data subjects). `tenant_id` itself is retained — the deleted tenant's
   audit history remains queryable for compliance, but no row identifies a
   specific person.
7. **Verify.** Run the verification queries below as `tenant_user` with
   `set_config('app.tenant_id', '<deleted_tenant>', true)` — every
   tenant-data schema must return zero rows. `audit.audit_log` retains rows
   with pseudonymised actors.
8. **Audit-log a `tenant.deletion_completed` event.** Same shape as
   step 3, with `operation: 'tenant.deletion_completed'` and
   `metadata: { rows_deleted_per_schema: { … } }`. **This row's `actor_id`
   is the Seta operator who triggered the deletion — pseudonymisation only
   touched tenant-side actors.**

## User deletion procedure

Narrower scope: identifying the principal and cascading rows that carry the
user's identity. The tenant itself, and tenant-shared resources (Planner
plans, directory groups), survive.

1. **Verify the principal.** Look up the canonical `auth.users` row by
   `(tenant_id, user_id)` or by `(tenant_id, external_provider,
   external_subject)` (the unique index per `platform/auth/SCOPE.md` § "Owns").
2. **Audit-log `user.deletion_started`** with the user's plain id (last
   appearance before pseudonymisation).
3. **Cascade-delete by-principal rows:**
   - `agent_memory.turns` / `agent_memory.working_memory` /
     `agent_memory.conversations` where `principal_id = <user_id>` (per
     `platform/agent/memory/SCOPE.md` § "Patterns to follow" — resource scope).
   - `agent.write_continuations` where the resolved actor matches.
   - `oauth.oauth_tokens` where `partition_key = 'user:<homeAccountId>'`
     for the deleted user (`platform/oauth/SCOPE.md` § "Owns" — OBO writes
     this partition).
   - `directory.external_identities` where `user_id = <user_id>`.
   - `auth.sessions` where `user_id = <user_id>`.
   - `auth.api_keys` where the key's owner is the deleted user (P1 schema
     stores `tenant_id` + scopes on the key, not `user_id` per
     `platform/auth/SCOPE.md` § "Current state"; user-owned keys are
     deleted via the issuer's metadata — see Open Questions).
   - `auth.users` row itself.
4. **Pseudonymise `audit.audit_log`** rows where `tenant_id = <tenant>`
   AND `actor_type = 'user'` AND `actor_id = <user_id>`. Same SQL shape as
   the tenant procedure.
5. **Verify.** A subsequent OIDC sign-in by the same external subject
   should JIT-create a fresh `auth.users` row (`platform/directory/SCOPE.md`
   § "Owns" — `createJitMapper`) — the previous principal is gone.

## Conversation (thread) deletion procedure

The narrowest scope: a single conversation thread. Tenant + user survive.

1. **Verify the caller owns the thread.** The thread CRUD route lives in
   `modules/products/agent` (`modules/products/agent/SCOPE.md` § "Patterns
   to avoid" — "Do NOT add thread CRUD HTTP routes here" applies to
   `@seta/agent-memory`; CRUD is owned by the product). The caller must be
   the principal who owns the thread or a tenant admin.
2. **Delete the conversation + cascade.** In one tenant-scoped transaction:
   ```sql
   DELETE FROM agent_memory.turns         WHERE thread_id = <id>;
   DELETE FROM agent_memory.working_memory WHERE thread_id = <id>;
   DELETE FROM agent_memory.conversations  WHERE id        = <id>;
   ```
3. **Audit-log `thread.deleted`** with `resource.type = 'thread'`,
   `resource.ids = [<thread_id>]`. The owning principal's `user_id` stays
   in plain form (they're alive).

## What is NOT deleted

- **`audit.audit_log` rows.** Retained per legal retention (recommend 7
  years; per-customer override allowed). `actor_id` is pseudonymised; rows
  remain queryable for compliance. `platform/audit/SCOPE.md` § "Patterns to
  avoid" — "Do not declare RLS on `audit.audit_log` without an ADR" + § "Open
  questions" #2 (retention / partitioning).
- **KMS-encrypted backup ciphertext within the retention window.** Daily
  snapshots + 7-day WAL retention (setup.md §3 row `docs/setup.md:49`) hold
  the deleted rows for up to 7 days post-deletion. The ciphertext is
  decryptable while the wrapped DEK exists, **but** the
  `EncryptionContext = {tenantId, purpose: 'oauth_token'}` binding survives
  deletion (setup.md §4 line 325). **Implication:** restoring a backup
  brings the data back. A genuine post-7-day right-to-be-forgotten claim
  needs either (a) waiting 7 days past deletion before declaring the data
  erased, or (b) running the restore-drill (`docs/runbooks/restore-drill.md`)
  post-deletion to confirm the backup chain no longer contains the data.
  Sponsor decision: which compliance posture do we offer? See Open
  Questions.
- **Aggregated metrics / OTel traces with no PII.** Trace data emitted to
  the OTLP endpoint (setup.md §8 lines 605-722) carries `tenant_id` as a
  span attribute but no per-user PII. Retention is provider-defined
  (Jaeger / Grafana Tempo / similar). Not in this runbook's scope.
- **Source code, ADRs, runbooks, configuration files.** These are not
  user data.

## Verification

Post-deletion, run these queries as `tenant_user` with the deleted tenant's
id in the GUC. Every assertion must hold.

```sql
SET ROLE tenant_user;
BEGIN;
  SELECT set_config('app.tenant_id', '<deleted_tenant>', true);

  -- Zero rows in every tenant-data schema for the deleted tenant.
  SELECT 'auth.users'                          AS table, COUNT(*) FROM auth.users                                    -- expect 0
  UNION ALL SELECT 'auth.sessions',            COUNT(*) FROM auth.sessions
  UNION ALL SELECT 'auth.api_keys',            COUNT(*) FROM auth.api_keys
  UNION ALL SELECT 'tenant.tenant_connectors', COUNT(*) FROM tenant.tenant_connectors
  UNION ALL SELECT 'tenant.tenants',           COUNT(*) FROM tenant.tenants
  UNION ALL SELECT 'directory.external_identities',                     COUNT(*) FROM directory.external_identities
  UNION ALL SELECT 'oauth.oauth_tokens',                                COUNT(*) FROM oauth.oauth_tokens
  UNION ALL SELECT 'oauth.oauth_state',                                 COUNT(*) FROM oauth.oauth_state
  UNION ALL SELECT 'connector_ms365_directory.directory_users',         COUNT(*) FROM connector_ms365_directory.directory_users
  UNION ALL SELECT 'connector_ms365_directory.directory_groups',        COUNT(*) FROM connector_ms365_directory.directory_groups
  UNION ALL SELECT 'connector_ms365_directory.directory_group_members', COUNT(*) FROM connector_ms365_directory.directory_group_members
  UNION ALL SELECT 'connector_ms365_directory.sync_state',              COUNT(*) FROM connector_ms365_directory.sync_state
  UNION ALL SELECT 'connector_ms365_planner.planner_tasks_cache',       COUNT(*) FROM connector_ms365_planner.planner_tasks_cache
  UNION ALL SELECT 'connector_ms365_planner.planner_plans_cache',       COUNT(*) FROM connector_ms365_planner.planner_plans_cache
  UNION ALL SELECT 'connector_ms365_planner.planner_buckets_cache',     COUNT(*) FROM connector_ms365_planner.planner_buckets_cache
  UNION ALL SELECT 'connector_ms365_planner.sync_watermarks',           COUNT(*) FROM connector_ms365_planner.sync_watermarks
  UNION ALL SELECT 'agent.write_continuations',                         COUNT(*) FROM agent.write_continuations
  UNION ALL SELECT 'agent_memory.conversations',                        COUNT(*) FROM agent_memory.conversations
  UNION ALL SELECT 'agent_memory.turns',                                COUNT(*) FROM agent_memory.turns
  UNION ALL SELECT 'agent_memory.working_memory',                       COUNT(*) FROM agent_memory.working_memory
  UNION ALL SELECT 'agent_workflows.workflow_snapshots',                COUNT(*) FROM agent_workflows.workflow_snapshots
  UNION ALL SELECT 'agent_workflows.workflow_steps',                    COUNT(*) FROM agent_workflows.workflow_steps
  UNION ALL SELECT 'agent_vector.chunks',                               COUNT(*) FROM agent_vector.chunks;

  -- Audit log retained, pseudonymised. As platform_admin only — the app role
  -- shouldn't read audit (platform/audit/SCOPE.md § Open questions #3).
COMMIT;
RESET ROLE;

-- platform_admin probe — audit rows preserved with pseudonymised user actors.
SELECT COUNT(*)                                  AS retained,
       COUNT(*) FILTER (WHERE actor_id LIKE 'deleted_user_%') AS pseudonymised
  FROM audit.audit_log
 WHERE tenant_id = '<deleted_tenant>'
   AND actor_type = 'user';
-- Expectation: retained > 0; pseudonymised = retained (every user actor
-- carried in this tenant's audit history is now pseudonymised).
```

Restore-drill cross-validation
(`docs/runbooks/restore-drill.md`): after a deletion, the next restore drill
must include "re-pseudonymise" as a recovery step — restoring a pre-deletion
snapshot resurrects the data; the operator must re-apply the deletion
procedure to the restored target. This is the load-bearing operational
contract that ties the two runbooks together.

## Implementation hooks

Every owner package must export a purge function with the signature below.
These are the seams `apps/api` calls into. No package may reach across
another package's schema (CLAUDE.md "Schema-per-module"; setup.md §3 line 124).

| Package | Function | Notes |
|---|---|---|
| `@seta/auth` | `purgeTenant(sql, tenantId)`, `purgeUser(sql, tenantId, userId)` | Runs as `platform_admin`. Deletes `auth.sessions` + `auth.api_keys` + `auth.users` in that order. |
| `@seta/tenant` | `purgeTenant(sql, tenantId)` | Deletes `tenant.tenant_connectors` then `tenant.tenants`. **Called last** — after this row is gone, no `tenant_id` lookup can succeed. |
| `@seta/directory` | `purgeTenant(sql, tenantId)`, `purgeUser(sql, tenantId, userId)` | Deletes `directory.external_identities`. |
| `@seta/oauth` | `purgeTenant(sql, tenantId)`, `purgeUserPartition(sql, tenantId, homeAccountId)` | Deletes `oauth.oauth_tokens` + `oauth.oauth_state`. The wrapped DEK + ciphertext go together. |
| `@seta/audit` | `pseudonymiseTenant(sql, tenantId)`, `pseudonymiseUser(sql, tenantId, userId)` | **UPDATEs** `actor_id` for `actor_type='user'`; never DELETEs. |
| `@seta/connector-ms365-directory` | `purgeTenant(sql, tenantId)`, `purgeUser(sql, tenantId, entraObjectId)` | Deletes `directory_group_members` → `directory_groups` → `directory_users` → `sync_state`. |
| `@seta/connector-ms365-planner` | `purgeTenant(sql, tenantId)` | Tenant-only — no per-user purge (cache is tenant-scoped per "Schemas affected" table). |
| `@seta/agent` (product) | `purgeTenant(sql, tenantId)`, `purgeUser(sql, tenantId, userId)` | Deletes `agent.write_continuations`. |
| `@seta/agent-memory` | `purgeTenant(sql, tenantId)`, `purgePrincipal(sql, tenantId, principalId)`, `purgeThread(sql, tenantId, threadId)` | Three granularity levels matching the three deletion shapes. |
| `@seta/agent-workflows` | `purgeTenant(sql, tenantId)`, `terminateActive(sql, tenantId)` | `terminateActive` is the freeze-step helper that aborts in-flight workflows. |
| `@seta/agent-vector` | `purgeTenant(sql, tenantId)`, `purgeSource(sql, tenantId, sourceId)` | `purgeSource` aligns with `chunks.source_id` per `platform/agent/vector/SCOPE.md` § "Public interface". |

> **Cross-cutting orchestrator.** `apps/api` owns the orchestrator (per
> setup.md §11 boundary — "composition only, no business logic"). The
> orchestrator calls each owner's hooks in the documented order, audits at
> the boundaries, and returns 204 on success. No `platform/` package
> imports another package's purge function — they remain owner-scoped.

## `apps/api` surface

Three new HTTP endpoints, all gated by **Seta-staff-only middleware**
(distinct from regular tenant admin — Seta operators only). The middleware
shape is a follow-up to `platform/auth/SCOPE.md` § "Open questions" #2 (RBAC
primitive). For P1, the gate is operationally enforced by API-key scope
(`seta:platform-admin`).

| Endpoint | Surface | Auth | Behaviour |
|---|---|---|---|
| `DELETE /admin/tenants/:id` | Tenant deletion (full procedure above). Body: `{ reason: string }`. | Seta-staff-only (`seta:platform-admin` scope). | Returns `202 Accepted` with `{ deletion_pending_until: <iso8601> }`. Hard delete proceeds after the 30-day window. |
| `POST /admin/tenants/:id/restore` | Cancels a pending tenant deletion within the 30-day window. | Seta-staff-only. | Returns `200 OK` with `{ status: 'active' }`. Audit-logs `tenant.deletion_cancelled`. |
| `DELETE /admin/tenants/:id/users/:userId` | User deletion within a tenant. Body: `{ reason: string }`. | Seta-staff-only **or** tenant admin (scope `tenant:admin`). | Returns `204 No Content`. Synchronous; no soft window. |
| `DELETE /threads/:id` | Conversation (thread) deletion. | Authenticated user — must own the thread (verified against `agent_memory.conversations.principal_id`) **or** be a tenant admin. | Returns `204 No Content`. Synchronous. |

Each endpoint follows the standard `apps/api` patterns from CLAUDE.md:
`@hono/zod-openapi` for routing (setup.md §15 line 2066), `DomainError`
subclasses for errors (setup.md §15 / CLAUDE.md), and the typed
`env` (no `process.env.X` reads at the route — setup.md §3 / CLAUDE.md).

## Open questions

1. **Backup retention window (7 days) vs GDPR conflict.** GDPR
   Article 17(1) requires "without undue delay" erasure — courts have
   accepted 30-day windows but not indefinite ones. setup.md §3 line 49
   pins 7-day WAL retention; daily snapshot retention is provider-default
   (often 30 days for AWS RDS, 7-35 for Azure Postgres Flexible Server).
   Sponsor decision: do we offer 7-day window with explicit disclosure in
   the customer DPA, or shrink retention to honour stricter erasure?
   Recommend: disclose + 7-day window for P1; revisit when a customer
   contract demands shorter.
2. **Right-to-export (data portability — GDPR Art. 20)** is a separate
   spike. Out of scope for this runbook. Likely shape: per-owner-package
   `exportTenant(sql, tenantId)` returning a streaming NDJSON.
3. **Multi-region replica eventual-consistency under deletion.** P1 is
   single-region (setup.md §3 + scaling triggers at `docs/setup.md:51-57`).
   When multi-region lands, deletion must propagate via logical
   replication; document the consistency window in this runbook then.
4. **Soft-delete cron / scheduler.** Step 4 of the tenant procedure
   relies on operational on-call rather than a scheduled job. The
   `@seta/agent-workflows` package (P1, per `platform/agent/workflows/SCOPE.md`)
   intentionally **does not support `.sleep()` / `.sleepUntil()` in P1**
   (Patterns to avoid). The 30-day timer is the first real need for a
   scheduled wakeup; either reopen the P1-to-P2 boundary for workflows or
   build a separate minimal cron surface. Recommend: minimal cron in
   `apps/api` (a single Postgres-stored job queue with timestamp-driven
   poll) when the second deletion lands in production.
5. **In-flight workflow abort semantics.** `agent_workflows` step 5b
   deletes snapshots while a workflow may still be advancing. The advisory
   lock (`platform/agent/workflows/SCOPE.md` § "Minimum viable P1 surface")
   coordinates so that a `resume()` after deletion loses on
   `pg_try_advisory_xact_lock` — but the *step body* may still be executing
   in `p-queue`. P1 accepts this race: in-flight steps complete with
   whatever side effects they had reached, then write to a deleted snapshot
   and the WRITE fails (no row to UPDATE). Document the race in the
   workflows package's open questions.
6. **Audit retention duration is jurisdiction-dependent.** This runbook
   recommends 7 years (US / common-law default). EU-only customers may
   require shorter (often 5 years for financial; 3 years for general).
   Decision belongs in the customer DPA, not this runbook. Capture per-customer
   retention as a `tenant.tenants` column when the SLA framework lands.
7. **Deletion of `auth.users.tenant_id` orphans.**
   `platform/auth/SCOPE.md` § "Open questions" #4 flags that there is no
   cross-schema FK enforcement between `auth.users.tenant_id` and
   `tenant.tenants.id`. If `tenant.tenants` is deleted before
   `auth.users`, the orphan rows remain readable to a `platform_admin`
   role but invisible to RLS (RLS denies any query that sets a
   `tenant_id` GUC for a tenant that no longer has a row in
   `tenant.tenants` — except `tenant_user` does not check that, it only
   compares the GUC to the row's `tenant_id`). The procedure above
   deletes `auth.*` strictly before `tenant.*` to avoid the orphan.
8. **Restore-drill compatibility.** Every restore drill that uses a
   snapshot taken before a tenant deletion resurrects the deleted data.
   The drill operator MUST re-apply this runbook to the restored target
   before declaring the drill complete. Cross-link added in
   `docs/runbooks/restore-drill.md` Open Questions #5.

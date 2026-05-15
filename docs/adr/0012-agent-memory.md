# ADR 0012 — Agent memory home, RLS posture, and multi-tenant semantics

- Status: Accepted
- Date: 2026-05-13
- Deciders: Platform team
- Spec: `platform/agent/memory/SCOPE.md`

## Context

`@seta/agent-memory` persists conversation threads, messages, and per-resource working memory for the agent kernel. Three non-reversible decisions were made during implementation: where to store the data, how to enforce tenant isolation at the database layer, and how tenant identity flows into every query.

## Decision

### 1. Memory home: Postgres (`agent_memory` schema), not a dedicated store

Thread and message data lives in the existing Postgres cluster under the `agent_memory` schema (schema-per-module, owned by `@seta/agent-memory`). No Redis, no external vector store, no separate SaaS memory service.

Trade-offs accepted:
- No Redis: memory queries run in the same transaction as the request. Acceptable at current scale; the shape is Redis-ready (typed key, TTL concept, tenant-scoped) if a scaling trigger fires.
- No dedicated vector store: working memory is short text (≤ 8 192 bytes). Semantic search over long-term memory can be added via pgvector later without a migration.
- Same cluster as application data means one failure domain. Acceptable: the alternative (a separate cluster) is a larger operational surface for a pre-scale system.

### 2. RLS posture: `FORCE ROW LEVEL SECURITY` + `tenant_user` role

All three tables (`threads`, `messages`, `resources`) carry:

```sql
ENABLE ROW LEVEL SECURITY
FORCE ROW LEVEL SECURITY   -- even table-owner queries go through policies
```

Each has a `tenant_isolation_*` policy that compares `tenant_id` against `current_setting('app.tenant_id', true)::uuid` in both `USING` and `WITH CHECK`. This extends ADR-0003's baseline (`ENABLE RLS` + app-layer `withTenant`) with the stronger `FORCE` flag.

Rationale: memory tables are high-value targets. A misconfigured migration running as the table owner should still be blocked by policy, not silently bypass it.

`platform_admin` (BYPASSRLS) is the only escape hatch; it is reserved for migrations and ops. Application code connects exclusively as `tenant_user`.

`drizzle-kit 0.31.10` cannot express `FORCE ROW LEVEL SECURITY` or `GRANT` — these live in `migrations/0001_security_hardening.sql` (custom migration) rather than generated SQL. The journal and snapshot stay in sync; the file must not be hand-edited.

### 3. Multi-tenant semantics: `withTenant` as the only query entry point

Every `AgentMemoryProvider` method wraps its queries in `withTenant(sql, tenantId, fn)` from `@seta/db`. Tenant id is read from `tenantContext.getTenantId()` (AsyncLocalStorage via `@seta/tenant`).

Consequences of this decision:
- `tenantId` is never a function parameter on `AgentMemoryProvider` methods — consistent with the CLAUDE.md footgun note and ADR-0003.
- Queries outside `withTenant` have `app.tenant_id` unset; RLS rejects them. Deny by default.
- Working memory upserts skip silently (`{ skipped: true, reason: 'no_resource_id' }`) when `userId` is absent from the ALS context rather than failing loudly — the missing resource binding is a session configuration issue, not a data error.

## Consequences

- A forgotten `WHERE tenant_id = $1` in a new query → RLS returns zero rows. No silent cross-tenant exposure.
- The `FORCE RLS` posture means admin scripts must connect as `platform_admin` explicitly; forgetting and connecting as `tenant_user` will produce empty result sets, not permission errors.
- Working memory is capped at 8 192 bytes at two layers: `WorkingMemoryTooLargeError` (application) and an `octet_length` check constraint (database). The DB constraint is the non-bypassable backstop.
- No cross-schema foreign keys. Cross-context references use `tenant_id` + natural IDs only.
- Schema is forward-only. No downgrade migrations.

## Alternatives considered

- **Redis for thread/message storage** — rejected: adds an infra dependency before a scaling trigger; RLS-based isolation is harder to replicate in Redis key-space prefixes.
- **`ENABLE RLS` only (without `FORCE`)** — rejected: table-owner connections (e.g., a migration gone wrong) would bypass policies silently; `FORCE` removes that risk at negligible cost.
- **Pass `tenantId` as explicit parameter** — rejected per CLAUDE.md footgun note; ALS propagation through `withTenant` is the single source of truth and makes it impossible to accidentally query with the wrong tenant.

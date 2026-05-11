# ADR 0003 — RLS as multi-tenancy backstop; app-layer `tenantContext` is primary

- Status: Accepted
- Date: 2026-05-11
- Deciders: Platform team

## Context

Every tenant-data table has a `tenant_id` column. Two enforcement points are possible: (1) the application checks tenant boundaries on every query, and (2) Postgres Row-Level Security enforces it at the database. Picking just one is fragile — a forgotten `WHERE tenant_id = $1` leaks cross-tenant data, and pure-RLS doesn't help when an admin role bypasses policies.

## Decision

- **Primary enforcement:** `tenantContext.getTenantId()` (AsyncLocalStorage in `@seta/tenant`) flows tenant id through every request. The `@seta/db` `withTenant(tenantId, fn)` wrapper opens a transaction, runs `SET LOCAL app.tenant_id = $1`, and executes the query.
- **Backstop:** Drizzle 0.36+ `pgPolicy` definitions in every tenant-scoped table compare `tenant_id` against `current_setting('app.tenant_id', true)::uuid`. The app connects as `tenant_user` (RLS-enforced); `seta_admin` (`bypassRls: true`) is migrations/ops only.

Outside of `withTenant`, queries on the root postgres-js client have `app.tenant_id` unset → RLS rejects them. Deny by default.

## Consequences

- A forgotten `WHERE` clause → RLS returns zero rows. No silent cross-tenant exposure.
- `SET LOCAL` (not plain `SET`) is mandatory: plain `SET` on a pooled connection leaks the tenant id into the next request.
- The bypass role is reserved for migrations/ops. Application code never connects as `seta_admin`.
- All vector/RAG queries also use `withTenant`, so RLS protects pgvector search too.

See spec §3 for the canonical `withTenant` wrapper and `pgPolicy` example.

# SCOPE — platform/audit  (@seta/audit)

## Purpose

Owns the `audit` Postgres schema (`audit.audit_log`) and the synchronous, OTel-correlated writer that every privileged operation and every external API call must invoke. Sized for one row per security-relevant event: who did what to which resource, in which tenant, via which connector, with which result. Setup.md §11 (`docs/setup.md:971`) describes it as "audit_log table + recordAudit() writer (synchronous, OTel-correlated)"; setup.md §3 (`docs/setup.md:114`) scopes the table to "every privileged op + every external API call." Synchronous-write is intentional: an asynchronous queue introduces a window where the system has acted but no audit row exists yet, which violates the audit invariant.

## Responsibilities

- **Owns:**
  - The `audit` Postgres schema and its sole P1 table `audit.audit_log` (bigserial id, tenantId, actorType, actorId, providerId?, connectorId?, operation, resourceType?, resourceIds? text[], result, metadata jsonb, ts timestamptz).
  - The `AuditEntry` shape every caller hands to the writer (typed actor union: `user` | `system`; typed result: `'ok' | 'failure'`).
  - The `AuditWriter` interface + `createAuditWriter(sql)` factory and the top-level `recordAudit(sql, entry)` convenience wrapper.
  - Drizzle schema authoring + `drizzle-kit generate` migrations (setup.md §3 "Schema-per-module (DDD)" `docs/setup.md:102-127`; `platform/audit/drizzle.config.ts:8` uses `schemaFilter: ['audit']`).
- **Does NOT own:**
  - OTel SDK init or pino logger config — those live in `@seta/observability` (setup.md §8 `docs/setup.md:605-722`). This package emits to a `Sql` client and lets the surrounding span carry trace correlation.
  - Request-correlation IDs (`requestId`, `traceparent`, `spanId`). Per `07-request-context.md` Delta, request identity is a frozen ALS-backed object inside `@seta/tenancy`. Callers that want trace correlation embed it in `metadata` (or rely on the surrounding OTel span — see Patterns).
  - Token/secret redaction. Setup.md §8 pino redact list (`docs/setup.md:616-680`) covers logs; the audit row writes whatever `metadata` the caller passes. Callers must not include secrets.
  - The KMS provider abstraction (setup.md §4 `docs/setup.md:277-326`) — that's `@seta/auth`. Audit rows are *plaintext metadata*; do not encrypt them at write time. They are not secret-bearing.
  - Querying / retention / export. P1 ships write-only; reads happen via admin tooling that lives outside this package.
  - RBAC of who *can* read the audit log. That's `@seta/auth` role policy.

## Current state (Epic 1)

Implemented and integration-tested:

- `platform/audit/src/schema.ts` — Drizzle: `auditSchema = pgSchema('audit')`, `auditLog` table with columns matching the §3 contract; exports `AuditLogRow` (`$inferSelect`) and `NewAuditLog` (`$inferInsert`).
- `platform/audit/src/writer.ts` — types `AuditActor` (discriminated union `'user' | 'system'`), `AuditEntry`, `AuditWriter` interface, `createAuditWriter(sql)` factory, and top-level `recordAudit(sql, entry)` convenience.
- `platform/audit/src/writer.test.ts` — integration test against real Postgres (env `DATABASE_URL`, default `postgres://seta:dev@localhost:5432/seta`); inserts a `'system'`-actor row, queries it back, asserts operation/actor/result/metadata fields.
- `platform/audit/drizzle.config.ts` — strict, `schemaFilter: ['audit']`.
- `platform/audit/migrations/0000_milky_omega_red.sql` — creates schema + table (no indexes beyond pk).
- `platform/audit/src/index.ts` — re-exports `AuditActor`, `AuditEntry`, `AuditWriter`, `createAuditWriter`, `recordAudit`, plus the schema module.

No RLS policy declared (the audit log is intentionally cross-tenant readable for compliance — see Open Questions). No indexes beyond the pk; query patterns aren't yet defined.

## Public interface

- `auditSchema` — `pgSchema('audit')` Drizzle handle.
- `auditLog` — Drizzle table.
- `type AuditLogRow` (`$inferSelect`), `type NewAuditLog` (`$inferInsert`).
- `type AuditActor` — `{ type: 'user'; userId: string } | { type: 'system'; label: string }`. The writer flattens `actor.userId | actor.label` into the `actor_id` text column.
- `type AuditEntry`:
  ```
  {
    tenantId: string
    actor: AuditActor
    providerId?: string
    connectorId?: string
    operation: string                  // e.g. "graph.planner.tasks.patch"
    resource?: { type: string; ids: string[] }
    result: 'ok' | 'failure'
    metadata?: Record<string, unknown>
  }
  ```
- `interface AuditWriter`:
  - `recordAudit(entry: AuditEntry): Promise<void>`
- `function createAuditWriter(sql: Sql): AuditWriter` — `Sql` from `postgres@3.4.9`.
- `async function recordAudit(sql: Sql, entry: AuditEntry): Promise<void>` — top-level convenience for code that already has a sql client; equivalent to `createAuditWriter(sql).recordAudit(entry)`.

## Imports

- **Allowed internal:** `@seta/db` (workspace dep per setup.md §13 `docs/setup.md:1777-1778`; not load-bearing in Epic 1 — the `Sql` instance is injected by composition rather than imported here), `@seta/observability` (workspace dep per setup.md §13 `docs/setup.md:1777-1778`; not load-bearing in Epic 1 — OTel correlation is achieved by writing inside the caller's active span; reach in only if/when audit emits its own logger child).
- **Forbidden:**
  - `@seta/auth` runtime — audit rows are plaintext, no KMS path; importing `@seta/auth` here would create a dependency cycle through `oauth_tokens` audit-on-encrypt callsites.
  - `@seta/oauth`, `@seta/ms-graph`, `@seta/directory`, `@seta/connector-registry` — wrong direction; these packages depend on `@seta/audit` (setup.md §13 `docs/setup.md:1790,1794`).
  - `modules/*`, `apps/*` — CLAUDE.md "platform/* depends on nothing in modules/ or apps/".
- **External (pinned per setup.md §13, `docs/setup.md:1777-1778`):**
  - `drizzle-orm@0.45.2` (schema authoring)
  - `postgres@3.4.9` (driver for `Sql` type)
  - `zod@4.4.3`
  - `dotenv@17.4.2` (drizzle-kit config only)
  - Dev: `drizzle-kit@0.31.10`

## Patterns to follow

- **Synchronous write per event.** Setup.md §11 (`docs/setup.md:971`): "synchronous, OTel-correlated." No queue, no batching. If the row write fails, the surrounding operation should also fail — audit is the precondition, not a side-effect.
- **Schema-per-module ownership.** Setup.md §3 (`docs/setup.md:102-127`) and `platform/audit/drizzle.config.ts:8` — owns `audit` schema exclusively; the top-level migration runner orders it after the auth/tenant/directory/oauth schemas per setup.md §3 dependency order (`docs/setup.md:125`).
- **OTel correlation by ambient span.** `07-request-context.md` Delta: Mastra threads `requestContext` explicitly, but our model is ALS-edge + `withTenant` at the DB seam. Same logic applies here: the `recordAudit` call runs inside the caller's active OTel span; `@opentelemetry/auto-instrumentations-node` (setup.md §8 `docs/setup.md:611`) auto-instruments `postgres-js`, so the INSERT becomes a child span whose `trace_id` / `span_id` are queryable in Jaeger without storing them in the row.
- **Natural keys in `resource.ids`.** CLAUDE.md "Idempotent external boundaries … Use natural keys (activity id, conversation id, uuid) for cross-system correlation — never auto-increment ints." `audit.audit_log.id` is `bigserial` for ordering inside the table only; cross-system references go in `resource.ids` (text[]).
- **`operation` is a dotted string namespace.** Convention: `<surface>.<area>.<verb>` — e.g. `graph.planner.tasks.patch`, `oauth.consent.granted`, `tools.create_tasks.commit`. Not enforced at the schema level; reviewers police it.
- **Tenant id from `IdTokenClaims`-style typed input, not ALS.** `AuditEntry.tenantId` is explicit on the entry — the caller (typically a route handler or `@seta/ms-graph` audit hook) reads `tenantContext.getTenantId()` and writes it into the entry. The writer itself doesn't reach into `@seta/tenancy`. This keeps `recordAudit` callable from background jobs that legitimately have no ALS context (per `07-request-context.md` `runAsTenant`).
- **`metadata` carries free-form context but no secrets.** Setup.md §8 pino redact list (`docs/setup.md:616-680`) names the fields to scrub upstream; the audit row never carries `access_token`, `refresh_token`, `authorization`, `password`, `api_key`, etc.
- **DDD: no cross-schema FKs.** Setup.md §3 (`docs/setup.md:121-123`). `audit.audit_log.tenant_id` is a plain `uuid` — no constraint to `tenant.tenants(id)`.

## Patterns to avoid

- **Do not buffer audit rows in memory.** "Synchronous, OTel-correlated" per setup.md §11 (`docs/setup.md:971`) and the audit invariant ("every privileged op + every external API call" per setup.md §3 `docs/setup.md:114`). A crashed buffer = lost evidence.
- **Do not encrypt the audit row.** KMS-envelope encryption (setup.md §4 `docs/setup.md:277-326`) is for `oauth.oauth_tokens` and session secrets, not audit. Plaintext metadata makes the log queryable for compliance / investigation.
- **Do not put secrets in `metadata`.** Tokens, passwords, API keys, raw bearer headers all stay out. The MS Graph audit hook in `@seta/ms-graph` writes path + status + duration, never the Authorization header.
- **Do not declare RLS on `audit.audit_log` without an ADR.** Audit reads are an admin/compliance surface; per-tenant RLS would block cross-tenant investigation. Setup.md §3 hints at this implicitly by listing `audit` separately from per-tenant data tables; Epic 1 ships with no policy. Confirm before adding one.
- **Do not import `@seta/tenancy` here.** `07-request-context.md` Delta "DI/RequestContext conflation" warning + CLAUDE.md "Tenant id is never a function parameter" — the audit entry carries tenantId explicitly because the writer is callable from contexts that legitimately have no ALS frame.
- **Do not call `process.env`.** CLAUDE.md "schema-driven `env`": env reads at `apps/api/src/env.ts`. The `Sql` instance is injected; `dotenv` is loaded only in `drizzle.config.ts` for kit-time use.
- **Do not use `drizzle-kit push`.** CLAUDE.md "Footguns: `drizzle-kit push` is local-dev only." Migrations forward-only and generated.
- **No legacy / compat shims.** CLAUDE.md "No legacy, no backward compat."

## Test strategy

- **Unit:** none meaningful for the writer (it's a single SQL statement). The schema file is type-checked at build.
- **Integration (already implemented, `platform/audit/src/writer.test.ts`):** runs against real Postgres (`DATABASE_URL`); inserts a `system`-actor row with `operation: 'test.event'` and `metadata: { foo: 'bar' }`, queries back, asserts operation/actor_type/actor_id/result/metadata fields.
- **Mocking policy:** never mock Postgres (CLAUDE.md "Never mock Postgres in integration tests"). Never mock `@seta/observability`/`@seta/db` (CLAUDE.md "never mock internal `@seta/*` modules").
- **Future:**
  - Add a test for the `'user'` actor branch (today only `'system'` is exercised).
  - Add a contract test from `@seta/ms-graph` that asserts the Graph audit hook writes a row per call (setup.md §11 `docs/setup.md:969`).
  - Add a multi-tenant filter test if/when RLS is added.

## Open questions

- **Indexes.** P1 ships with only the pk. Likely query patterns: `(tenant_id, ts DESC)`, `(connector_id, ts)`, `(operation, ts)`. Add when the first read consumer (admin UI or compliance export) lands.
- **Retention / partitioning.** Audit is append-only and grows unbounded. Setup.md doesn't pin a retention policy. Decision: pgvector-style monthly partitions when the table exceeds a documented row threshold; capture in an ADR before P2.
- **RLS vs admin-only reads.** The lack of an RLS policy is intentional (compliance reads cross tenants), but the `app.tenant_id` GUC isn't enforced either, meaning a buggy `tenant_user` query could read other tenants' audit rows. Either (a) the app role lacks SELECT on `audit.audit_log` entirely (privilege isolation), or (b) we add an RLS policy and a separate `audit_reader` role. Decide before P2 multi-tenant launch.
- **OTel attribute capture vs row column.** `trace_id` / `span_id` are recoverable via the surrounding span and Jaeger, not stored in the row. If the audit log is exported to a SIEM that doesn't have access to OTel, we may need to denormalize them. Default: defer until SIEM integration is in scope.
- **`@seta/observability` dep usage.** Setup.md §13 pre-allocated the dep (`docs/setup.md:1777-1778`); Epic 1 doesn't use it. Either wire a child logger for write failures (so a failing INSERT still emits a structured log line) or drop the dep.
- **Per-call retry policy on writer.** Today a single INSERT failure surfaces as a thrown promise rejection. Should the writer retry transient errors? Probably no (transient DB errors are usually transactional rollbacks, and retrying breaks the "synchronous precondition" contract), but document the decision.

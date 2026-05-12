# SCOPE — modules/connectors/ms365-planner  (@seta/connector-ms365-planner)

## Purpose

Microsoft 365 Planner vendor adapter. Owns the typed Planner client (lists, plans, buckets, tasks, assignments), the ETag/If-Match read-then-update flow, the Planner cache schema (`connector_ms365_planner`), and the `ConnectorDefinition` manifest that drives admin-consent and scope union. Connectors expose vendor capability; they do **not** own tools, agents, or channels. Products (specifically `@seta/agent`) build preview→commit Planner tools on top of this client. (setup.md §7 Planner section, §11.)

## Responsibilities

- **Owns:**
  - The `plannerConnector: ConnectorDefinition` manifest — id `ms365-planner`, providerId `entra`, required scopes, customer-facing rationale, `capabilities: { syncable: true, writes: true }` (setup.md §11 `manifest.ts`; current `src/manifest.ts`).
  - Typed Planner endpoints over `@seta/ms-graph` — `listPlans`, `listBuckets`, `listTasks`, `getTask`, `createTask`, `updateTask`, `completeTask`, assignment mutations (setup.md §11 `client.ts`).
  - **Mandatory ETag flow on every mutation** — GET to fetch `@odata.etag`, then `PATCH` with `If-Match` + `Prefer: return=representation` (setup.md §7 Planner ETag section, `etag.ts`).
  - Postgres schema `connector_ms365_planner` — `planner_tasks_cache`, related plan/bucket caches, `sync_watermarks` (setup.md §11 `schema.ts`). Owns its own Drizzle config + `migrations/` (CLAUDE.md "Schema-per-module").
  - Cache-first read-through with 60s TTL + stale-fallback (setup.md §11 `cache.ts`).
  - 429/5xx backoff is delegated to `@seta/ms-graph`; the connector layers Planner-specific retry-after on top of it (setup.md §11 `ms-graph` description; §7).
  - `@odata.nextLink` pagination via `graph.paginate(url)` (setup.md §7 pagination note).

- **Does NOT own:**
  - Tools, tool schemas, preview/commit envelopes, HMAC continuation tokens — those live in `modules/products/agent/src/tools/planner/` and the `agent.write_continuations` schema is in `@seta/agent` (setup.md §11; spike `04-tools-mcp.md`).
  - Adaptive cards, agent runtime, LLM calls (boundary rule — connectors never depend on products; CLAUDE.md).
  - Bot Framework, transport, or any channel concern (setup.md §11 boundary rules).
  - User-level OAuth flow — delegated to `@seta/oauth` (MSAL Node CCA, OBO, client-credentials). The connector calls `@seta/ms-graph`, which acquires tokens via `@seta/oauth` (setup.md §11 dep direction `modules/connectors/* → platform/{ms-graph, oauth, …}`).
  - Cross-connector data dependencies — no FK to `connector_ms365_directory.*`. Cross-context references go by ID only (`tenant_id` + `entra_object_id` text columns) per CLAUDE.md "No cross-schema foreign keys".

## Current state (Epic 1)

Epic 1 wired auth + the connector manifest. Business logic (client/cache/etag/schema) is not yet present.

- `src/manifest.ts` — `plannerConnector: ConnectorDefinition` is implemented with the scopes the spec calls for (`Tasks.ReadWrite`, `Group.ReadWrite.All`, `Group.Read.All` delegated; `Tasks.Read.All`, `Group.Read.All` application). Includes `customerFacingRationale` and `capabilities.{syncable,writes}=true`.
- `src/index.ts` re-exports `plannerConnector` only.
- `src/manifest.test.ts` pins the scope set as a contract.
- **Missing vs setup.md §11:** `client.ts`, `cache.ts`, `etag.ts`, `schema.ts`, `drizzle.config.ts`, `migrations/`.
- **Missing vs setup.md §13 deps:** `drizzle-orm@0.45.2`, `p-queue@9.2.0`, `@seta/oauth`, `@seta/db`, `@seta/audit`. Current `package.json` carries `@seta/agent-core`, `@seta/connector-registry`, `@seta/ms-graph`, `zod@4.4.3` only. `@seta/agent-core` in a connector is suspect — see Open questions.

## Public interface

All exports from `modules/connectors/ms365-planner/src/index.ts`.

- `plannerConnector: ConnectorDefinition` — manifest consumed by `createConnectorRegistry().register(...)` in `apps/api/src/main.ts` (setup.md §11 composition example; current `src/manifest.ts`).
- `plannerClient(opts: { tenantId: string }) => PlannerClient` — typed Planner client; tenant comes from `tenantContext.getTenantId()` in the implementation, the explicit parameter exists only at the seam where the agent/sync worker constructs the client. (setup.md §11 `client.ts`.)
- `PlannerClient` — interface with `listPlans`, `listBuckets`, `listTasks`, `getTask`, `createTask`, `updateTask`, `completeTask`, `setTaskAssignments`, plus a `paginate<T>(url)` async-iterator helper.
- `plannerSchema` — Drizzle pg schema object for `connector_ms365_planner` (re-export pattern shown in `@seta/connector-ms365-directory/src/schema.ts`).
- Drizzle table exports: `plannerTasksCache`, `plannerPlansCache`, `plannerBucketsCache`, `syncWatermarks` (setup.md §11 `schema.ts`).
- Inferred row types via `$inferSelect`/`$inferInsert` (CLAUDE.md "Drizzle table → row types").
- `routes(): Hono` — **mandatory `routes(handler?: Handler) => Hono` export** per CLAUDE.md. Connectors typically expose health/sync admin endpoints; if there are none in P1, export a Hono router with no routes so `apps/api/src/main.ts` can mount it uniformly.

No `Handler` interface — connectors do not declare handler shapes (that is a channels concept).

## Imports

- **Allowed internal (per setup.md §11 dep direction `modules/connectors/* → platform/{ms-graph,oauth,connector-registry,db,audit,tenant,observability}` + other `modules/connectors/*`):**
  - `@seta/connector-registry` — for the `ConnectorDefinition` type (currently imported).
  - `@seta/ms-graph` — Graph HTTP wrapper (currently declared; setup.md §13).
  - `@seta/oauth` — token acquisition path used through `@seta/ms-graph` (setup.md §13 missing from current `package.json`; CLAUDE.md "Add dep → `pnpm --filter ... add @seta/oauth@workspace:*`").
  - `@seta/db` — pool + `withTenant` + role exports for the cache schema and migration runner (setup.md §13; CLAUDE.md "Schema-per-module").
  - `@seta/audit` — `recordAudit()` for tool-driven writes and admin-consent events (setup.md §13).
  - `@seta/tenant` — `tenantContext.getTenantId()` (setup.md §11 dep direction; CLAUDE.md).
  - `@seta/observability` — logger, OTel spans (setup.md §11 dep direction).
  - Other `modules/connectors/*` packages — permitted by setup.md §11 ("A connector may import `platform/*` and other `modules/connectors/*`"). In practice the Planner connector should not need the Directory connector at the data layer (cross-context references by ID only, CLAUDE.md).

- **Forbidden:**
  - **Any `modules/products/*` package** including `@seta/agent` — connectors never import products (CLAUDE.md; setup.md §11 "never `modules/products/*`").
  - **Any `modules/channels/*` package** including `@seta/teams` — connectors never import channels (CLAUDE.md; setup.md §11 "never `modules/channels/*`").
  - `@seta/agent-core` — the kernel is consumed by products, not by vendor adapters. Currently mis-declared in `package.json` (see Open questions); should be removed when the connector starts owning code.
  - `openai`, `@anthropic-ai/sdk` — no LLM here.
  - `botbuilder`, `@microsoft/teams-ai` — transport stays in the Teams channel.
  - `@microsoft/microsoft-graph-client` (the official Graph SDK) — setup.md uses a hand-rolled wrapper (`@seta/ms-graph`) over raw `fetch` for backoff/ETag/$batch/audit middleware (setup.md §11 §13).

- **External (pinned per setup.md §13):**
  - `zod@4.4.3`
  - `drizzle-orm@0.45.2`
  - `p-queue@9.2.0` — bounded concurrency for sync/fan-out (CLAUDE.md "Default: LRU + `p-queue` + pgvector").
  - `@microsoft/microsoft-graph-types@2.43.1` — **declared on `@seta/ms-graph`, not here** (setup.md §13). Consume the type re-exports.
  - Dev: `drizzle-kit@0.31.10`, `vitest@4.1.5`, `tsup@8.5.1`, `typescript@6.0.3`, `@types/node@24`.

## Patterns to follow

- **ETag read-then-update on every mutation** — fetch via GET to get `@odata.etag`, PATCH with `If-Match: <etag>` + `Prefer: return=representation`. Skipping `If-Match` returns `412 Precondition Required` (setup.md §7 Planner ETag section).
- **Snapshot ETag at preview time** — the connector exposes `getTask` returning the ETag; `@seta/agent`'s preview tools persist that ETag in `agent.write_continuations` and pass it back at commit (setup.md §7 last paragraph; spike `04-tools-mcp.md` punch list).
- **Schema-per-module Drizzle layout** — `src/schema.ts` + `drizzle.config.ts` with `schemaFilter: ['connector_ms365_planner']` + `migrations/` directory; never hand-edit `migrations/*.sql`, regenerate via `drizzle-kit generate` (CLAUDE.md "Schema-driven"). Mirror the layout of `@seta/connector-ms365-directory`.
- **Multi-tenant by row** — every cache table carries `tenant_id uuid not null`; RLS policy on each tenant-scoped table; pool sets `app.tenant_id` via `SET LOCAL` per request as backstop (CLAUDE.md "Multi-tenant from day one").
- **No cross-schema FKs** — reference directory users by `entra_object_id` text column, not a FK to `connector_ms365_directory.directory_users` (CLAUDE.md "No cross-schema foreign keys").
- **Idempotent boundary** — Planner task ids and `clientCorrelationId` are natural keys; never auto-increment ints (CLAUDE.md "Idempotent external boundaries").
- **Cache-first reads, 60s TTL, stale-fallback** on Graph downtime (setup.md §11 `cache.ts`).
- **Pagination via `for await (const page of graph.paginate(url))`** — `@odata.nextLink` is opaque (setup.md §7 pagination note).
- **Connector consent gate** — call sites verify `connectorRegistry.requireConsent(tenantId, 'ms365-planner')` before any Graph call; the connector itself simply throws a typed error if Graph returns 403, and the caller routes to admin-consent (CLAUDE.md "Connector consent").
- **`p-queue` for bounded fan-out** during full and delta syncs (CLAUDE.md "LRU + `p-queue` + pgvector"; setup.md §13).
- **Errors throw `DomainError` subclasses from `@seta/middleware/errors`** (CLAUDE.md). 412 → `Conflict`, 403 → `Forbidden`, 404 → `NotFound`.
- **OTel spans on every Graph call** via `@seta/ms-graph`'s middleware (setup.md §11 description).
- **`routes()` export** for uniform mounting even if it returns an empty Hono router (CLAUDE.md "Every `modules/*` package exports `routes`").

## Patterns to avoid

- **Importing `@seta/agent`, `@seta/teams`, or any other `modules/products/*` or `modules/channels/*` package** — boundary violation, CI guard rejects (CLAUDE.md; setup.md §11).
- **Importing `@seta/agent-core`** — current `package.json` has this; remove on first real change. Connectors do not consume the kernel (setup.md §11 dep direction).
- **Owning tool definitions or preview/commit logic** — those live in `@seta/agent` so the connector stays reusable across future products (setup.md §11 §7; spike `04-tools-mcp.md`).
- **Hand-writing migrations** — always `drizzle-kit generate` from `schema.ts` (CLAUDE.md).
- **`drizzle-kit push` against shared DBs** — local-dev only (CLAUDE.md footguns).
- **Cross-schema foreign keys** — directory references are by id-as-text (CLAUDE.md).
- **Skipping `If-Match`** on PATCH — silent 412 / silent overwrite (setup.md §7 Planner ETag).
- **Calling `openai`/`@anthropic-ai/sdk`** — no LLM in connectors.
- **Calling `process.env.X` directly** — typed via `@seta/api`'s boot-time env once; connectors receive config via function args or the registry (CLAUDE.md "`process.env` → typed `env`").
- **`console.log`** — use `@seta/observability`'s logger (CLAUDE.md).
- **Mocking `@seta/ms-graph` or `@seta/oauth` in tests** — never mock internal `@seta/*`; use msw recordings of Graph (CLAUDE.md "never mock internal `@seta/*` modules").

## Test strategy

- **Unit (`src/**/*.test.ts`):**
  - Manifest contract (already present — `manifest.test.ts` pins scope set).
  - Cache TTL behaviour, stale-fallback path.
  - ETag round-trip: GET → record ETag → PATCH with `If-Match` → 200; PATCH without ETag → typed error.
  - Pagination iterator across `@odata.nextLink`.
- **Integration (`tests/integration/**`, requires `DATABASE_URL`):**
  - Real Postgres with `connector_ms365_planner` schema migrated; tenant-scoped read/write under RLS.
  - Full sync flow through `p-queue` against msw-recorded Graph fixtures.
- **External HTTP via msw recordings only** — `graph.microsoft.com/v1.0/planner/*` calls (CLAUDE.md "External HTTP via `msw` recordings"; setup.md §17). Recordings checked in under `__recordings__/`.
- **No live Graph in CI; no `vi.mock` of internal `@seta/*` modules** (CLAUDE.md).

## Open questions

- `@seta/agent-core` is currently declared in `package.json` but does not belong in a connector per setup.md §11 dep direction. Confirm intent and remove on first real change, replacing with `@seta/oauth`, `@seta/db`, `@seta/audit`, `drizzle-orm`, `p-queue` per setup.md §13.
- Does the connector expose admin-only sync trigger routes (`POST /admin/sync`) via its `routes()` export, or are sync triggers owned by a separate scheduler/worker? Setup.md does not pin a P1 sync trigger surface.
- Bulk `$batch` calls — pin behaviour to `@seta/ms-graph` (currently described as supporting `$batch` per setup.md §11), or build a Planner-specific batch helper? Default: lean on `@seta/ms-graph` and only specialize for Planner if the 20-request batch limit needs item splitting.
- Cache invalidation contract — does a successful `PATCH` invalidate the row by `(tenant_id, task_id)` synchronously, or do we accept up-to-TTL staleness for the requesting tenant? Suggest synchronous invalidate-on-write to keep "you-just-changed-it" UX correct.
- Does the connector emit OTel events for sync watermarks (last-delta-token transition), or is that purely `recordAudit()`?

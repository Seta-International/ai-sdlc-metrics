# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working rules

- **Never guess.** If a type, version, API shape, or owner is unclear — ask, or read the source/docs (`context7` MCP for pinned libraries). Don't fabricate.
- **No legacy, no backward compat.** Pre-1.0, active dev. Change every caller in the same PR and delete the old shape. No compat shims, deprecation aliases, or "for now" comments.
- **No process-metadata comments in code.** Never reference plan numbers, ticket IDs, task IDs, issue numbers, epic names, or PR numbers in source comments (e.g. `// PLAN-12`, `// TASK-3.2`, `// fixes JIRA-456`, `// per Epic 1`). Code quality is independent of the process that produced it; that context belongs in commit messages, PR descriptions, and the tracker — not in the code, where it rots.

## Boundaries (CI-enforced)

- `apps/*` — composition only, no business logic. Registers connectors and mounts module routes.
- `modules/channels/<name>` — transport adapters. **Never import products, connectors, or other channels.**
- `modules/connectors/<vendor>` — vendor adapters (one external system each: ms365-planner, ms365-directory, future trello/jira/google-workspace). May import `platform/*` and other `modules/connectors/*`. **Never import products or channels.** Each connector owns its own Postgres schema (`connector_<vendor>_<surface>`) and exports a `connector: ConnectorDefinition` manifest.
- `modules/products/<name>` — business modules. May import a channel only to implement its `Handler`, and `modules/connectors/*` to call external systems; **never another product.**
- `platform/*` — framework primitives, vendor-neutral. **Depends on nothing in `modules/` or `apps/`.** Agent-runtime packages live under `platform/agent/*` with the `agent-` prefix.
- Every `modules/*` package exports `routes(handler?: Handler) => Hono`. `apps/api/src/main.ts` owns mount prefixes and the connector registration list — it's the only registry. No DI containers, plugin loaders, or runtime discovery.
- A `"private": false` package must not import any `"private": true` workspace package.

## Commands

| Task                      | Command                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------- |
| Install / Build / Dev     | `pnpm install --frozen-lockfile` · `pnpm build` · `pnpm dev`                        |
| Lint / Format / Typecheck | `pnpm lint` · `pnpm format` · `pnpm typecheck`                                      |
| Tests                     | `pnpm test:unit` · `pnpm test:integration` (needs `DATABASE_URL`) · `pnpm test:e2e` |
| Single test               | `pnpm vitest run path/to/file.test.ts` · `pnpm vitest run -t "name"`                |
| Re-record LLM fixture     | `RECORD=1 pnpm vitest run -t <name>`                                                |
| Migrations                | `pnpm migrate`                                                                      |
| Local services            | `pnpm db:up` / `pnpm db:down`                                                       |
| Scaffold package          | `pnpm new:package`                                                                  |
| Changeset                 | `pnpm changeset`                                                                    |

Jaeger: `http://localhost:16686`. OTLP: `http://localhost:4318`.

## CLI-only — packages and dependencies

**Never hand-edit `package.json` (except metadata: `description`, `keywords`, `homepage`, `repository`, `bugs`, `publishConfig.access`, `files`) or `pnpm-lock.yaml`.** CI guard `check-no-manual-pkg-edit.ts` fails any non-whitelisted `package.json` diff without a matching lockfile diff.

- Create package → `pnpm new:package`
- Add dep → `pnpm --filter @seta/<pkg> add <dep>@<version>` (`-D` for dev)
- Workspace dep → `pnpm --filter @seta/<pkg> add @seta/<other>@workspace:*` (the `workspace:*` protocol is mandatory)
- Remove / update → `pnpm --filter @seta/<pkg> remove <dep>` · `pnpm up -r <dep>@<version>`
- Rename → `pnpm pkg set name=@seta/<new>` + `git mv` + `pnpm install`
- Bump → `pnpm changeset` → `pnpm changeset version`. Never hand-edit `version`.

For "add library X" without a known pin, run `pnpm view <pkg> version` and propose the pin first.

## Schema-driven — always generate, never hand-write

- **Drizzle schema → migration SQL** via `drizzle-kit generate`. Never hand-edit `migrations/*.sql`; fix the schema and regenerate.
- **Schema-per-module (DDD).** Each owner package holds its own Drizzle schema file + `drizzle.config.ts` (with `schemaFilter`) + `migrations/` dir. `@seta/db` owns no application tables — it provides pool, `withTenant`, role exports, and the top-level migration runner that applies owners in dependency order. **No cross-schema foreign keys**; cross-context references by ID only (`tenant_id` is the universal correlation key).
- **Zod schema → TS types** via `z.infer<typeof X>`. Never maintain a parallel `interface`.
- **Drizzle table → row types** via `$inferSelect` / `$inferInsert`.
- **Zod routes → OpenAPI** via `@hono/zod-openapi`'s `getOpenAPIDocument`. Never hand-write `openapi.json`.
- **`process.env` → typed `env`** via Zod once at boot (`apps/api/src/env.ts`). Never read `process.env.X` elsewhere.

## Footguns (silent-failure traps)

- **`z` for OpenAPI routes**: import `z` from `@hono/zod-openapi`, not `zod`. The `zod` import silently drops `.openapi(...)` and breaks doc generation at runtime.
- **OpenAPI uses `{id}`**, Hono native uses `:id`. Don't mix in one router.
- **OTel init order**: `apps/api` MUST start via `node --import ./instrumentation.ts …` (dev: `tsx watch --import`). Anything imported before `sdk.start()` is invisible to traces. Never call `sdk.start()` from `main.ts`.
- **Tenant id is never a function parameter.** Read from `tenantContext.getTenantId()` (`@seta/tenant`). DB client sets `app.tenant_id` via `SET LOCAL` per request; RLS is the backstop.
- **App connects as `tenant_user`** (RLS-enforced). `platform_admin` (`bypassRls: true`) is migrations/ops only.
- **Streaming**: use `streamKernelSSE(c, run)` from `@seta/agent-core` (wires `onAbort`, keep-alive, error handler).
- **`drizzle-kit push`** is local-dev only — never against shared DBs.
- **LLM in tests**: only via `@seta/agent-core/testkit` recordings. Never live model APIs in CI.

## Scale & multi-tenancy

- **Multi-tenant from day one.** Every persisted row has `tenant_id`. Every tenant-data table has an RLS policy. No single-tenant mode.
- **Stateless request path.** Survivable state → Postgres. Shared cross-instance state must be Redis-ready _shape_ today (typed key, TTL, tenant-scoped) even if backed by LRU.
- **Build for now.** Don't add Redis, queue brokers, or external vector stores until a documented scaling trigger fires. Default: LRU + `p-queue` + pgvector.
- **Idempotent external boundaries.** Webhooks, OAuth callbacks, LLM/Graph calls, queue handlers must tolerate replays. Use natural keys (activity id, conversation id, uuid) for cross-system correlation — never auto-increment ints.
- **Forward-only schema.** No downgrade migrations.

## Conventions

- **ESM only** (`"type": "module"`). No CJS.
- **No TS path aliases.** Import via workspace package names.
- **`import type`** for type-only imports (Biome enforces).
- **Tests**: unit co-located `<pkg>/src/**/*.test.ts`; integration `<pkg>/tests/integration/**`; E2E `/tests/e2e/**`.
- **Logging**: `logger` from `@seta/middleware` / `@seta/observability`. No `console.log` outside CLI scripts.
- **Errors**: throw `DomainError` subclasses from `@seta/middleware/errors`; mapped to RFC 7807.
- **Mocks**: never mock internal `@seta/*` modules — if you need to, your seam is wrong. Never mock Postgres in integration tests. External HTTP via `msw` recordings.
- **Vitest config**: root owns `pool` / `coverage` / `thresholds` / `projects`. Leaf overrides only `test.name`. No `vitest.workspace.ts` (deprecated).
- **Don't duplicate pinned tools**: no ESLint, Prettier, Jest, Express, Playwright (until Studio).

## Implementation flow

- **TDD** for `platform/*` and `modules/products/*/tools/*`. Skip for `apps/api` wiring, route registration, type-only changes, one-off scripts.
- **DDD bounded contexts**: `modules/products/<domain>/` and `modules/connectors/<vendor>/` each own their schema + services + tools + handlers. Cross-product imports are forbidden — share via `platform/*` or call through a connector. Connectors don't import each other's tables; if data needs to flow between two external systems, it goes through a product.
- **Outbound OAuth via MSAL Node**: `@azure/msal-node` `ConfidentialClientApplication` covers admin consent, OBO, client_credentials, refresh. Treat MSAL as stateless — don't wire `ICachePlugin`; `oauth.oauth_tokens` is the only SOR; single-flight refresh via `SELECT … FOR UPDATE`. One CCA per tenant id, cached in an LRU.
- **Connector consent**: every Graph call path must first satisfy `connectorRegistry.requireConsent(tenantId, '<connector-id>')`. The admin-consent URL uses `scope=https://graph.microsoft.com/.default` against `/v2.0/adminconsent`; per-connector scopes declared in each connector's `ConnectorDefinition.requiredScopes`.
- **Systematic debugging** for any bug (`superpowers:systematic-debugging`). Reproduce → isolate → fix.
- **Verify before claiming done** (`superpowers:verification-before-completion`): typecheck + lint + relevant tests + exercise the endpoint for HTTP/UI changes.
- **ADRs** for non-reversible decisions (new external service, new auth flow, data-losing migration) → numbered file in `docs/adr/`.

## Commits & PRs

- **Conventional Commits**: `feat(agent-core): …` / `fix(teams): …` / `feat(api)!: …` for breaking. Scope = package without `@seta/`.
- **Changeset required** for every change to a published (`"private": false`) package.
- **One change, one PR.** Bug fix doesn't carry refactors; feature doesn't carry dep bumps. Squash/rebase merges only.

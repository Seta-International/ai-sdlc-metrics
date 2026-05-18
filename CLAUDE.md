# CLAUDE.md

## Working rules
- Never guess. Unclear type/version/API/owner → ask, or read source/docs (`context7` MCP for pinned libs).
- No legacy, no backward compat. Pre-1.0. Change all callers + delete old shape in same PR. No shims, aliases, or "for now" comments.
- No process metadata in source comments (plan/task/ticket/issue/epic/PR IDs). Commits + tracker only.

## Boundaries (CI-enforced)
- `apps/*` — composition only. Registers connectors + mounts module routes.
- `modules/channels/<name>` — transport adapters. Never import products, connectors, or other channels.
- `modules/connectors/<vendor>` — one external system each. May import `platform/*` + other connectors. Never import products or channels. Owns Postgres schema `connector_<vendor>_<surface>`. Exports `connector: ConnectorDefinition`.
- `modules/products/<name>` — business modules. May import a channel only to implement its `Handler`, + `modules/connectors/*`. Never another product.
- `platform/*` — framework primitives, vendor-neutral. Depends on nothing in `modules/` or `apps/`. Agent runtime under `platform/agent/*` with `agent-` prefix.
- Every `modules/*` package exports `routes(handler?: Handler) => Hono`. `apps/api/src/main.ts` owns mount prefixes + connector list — the only registry. No DI containers, plugin loaders, runtime discovery.
- `"private": false` package must not import `"private": true` workspace package.

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

Jaeger `http://localhost:16686` · OTLP `http://localhost:4318` · Node ≥24 · pnpm 11.0.9 (don't bump without a changeset note).

## Packages & deps (CLI-only)
Never hand-edit `package.json` (except `description`, `keywords`, `homepage`, `repository`, `bugs`, `publishConfig.access`, `files`) or `pnpm-lock.yaml`. CI guard `check-no-manual-pkg-edit.ts` fails non-whitelisted `package.json` diffs without a matching lockfile diff.

- Create package → `pnpm new:package`
- Add dep → `pnpm --filter @seta/<pkg> add <dep>@<version>` (`-D` for dev)
- Workspace dep → `pnpm --filter @seta/<pkg> add @seta/<other>@workspace:*` (protocol mandatory)
- Remove/update → `pnpm --filter @seta/<pkg> remove <dep>` · `pnpm up -r <dep>@<version>`
- Rename → `pnpm pkg set name=@seta/<new>` + `git mv` + `pnpm install`
- Version bump → `pnpm changeset` → `pnpm changeset version`. Never hand-edit `version`.
- Unknown pin → `pnpm view <pkg> version`, propose pin first.

## Schema-driven (generate, never hand-write)
- Drizzle schema → migration SQL via `drizzle-kit generate`. Never hand-edit `migrations/*.sql`. Can't-express cases (`FORCE ROW LEVEL SECURITY`, `GRANT`, `CREATE EXTENSION`, raw DDL): `drizzle-kit generate --custom --name <slug>`. Never hand-create or `cp` snapshots.
- Drizzle builder over raw SQL. `sql\`…\`` only when builder can't express it; always parameter-bind.
- Schema-per-module (DDD). Each owner package: Drizzle schema + `drizzle.config.ts` (with `schemaFilter`) + `migrations/`. `@seta/db` owns no app tables — only pool, `withTenant`, role exports, top-level migration runner (dep-ordered). No cross-schema FKs; cross-context refs by ID (`tenant_id` is universal).
- Zod schema → TS types via `z.infer<typeof X>`. No parallel `interface`.
- Drizzle table → row types via `$inferSelect`/`$inferInsert`.
- Zod routes → OpenAPI via `@hono/zod-openapi`'s `getOpenAPIDocument`. Never hand-write `openapi.json`.
- `process.env` → typed `env` via Zod at boot (`apps/api/src/env.ts`). Never read `process.env.X` elsewhere.

## Footguns
- OpenAPI routes: import `z` from `@hono/zod-openapi`, not `zod`. `zod` import silently drops `.openapi(...)`.
- OpenAPI uses `{id}`, Hono native uses `:id`. Don't mix in one router.
- OTel init: `apps/api` MUST start via `node --import ./instrumentation.ts …` (dev: `tsx watch --import`). Anything imported before `sdk.start()` is invisible. Never call `sdk.start()` from `main.ts`.
- Inbound tenant: `tenantMiddleware` from `@seta/tenant` wraps each request in `tenantContext.run(...)`. Read with `tenantContext.getTenantId()`. Never accept `tenantId` as a function/route param. DB client sets `app.tenant_id` via `SET LOCAL` per request; RLS is the backstop.
- Outbound HTTP: Graph via `graphFetch` (`@seta/ms-graph`, handles 429/Retry-After); LLM/embeddings via `@seta/agent-core` (`withRetry`). No naked `fetch` to external systems.
- App connects as `tenant_user` (RLS-enforced). `platform_admin` (`bypassRls: true`) is migrations/ops only.
- Streaming: `streamKernelSSE(c, run)` from `@seta/agent-core` (wires `onAbort`, keep-alive, error handler).
- AbortSignal: agent runs/tools/LLM/embedding/retry all thread `signal`. New long-running ops accept `AbortSignal` and pass it through (especially to `fetch` and `withRetry`).
- `drizzle-kit push` is local-dev only.
- LLM in tests: `@seta/agent-core/testkit` recordings only. Never live model APIs in CI.

## Scale & multi-tenancy
- Multi-tenant. Every persisted row has `tenant_id`. Every tenant-data table has RLS. No single-tenant mode.
- Stateless request path. Survivable state → Postgres. Cross-instance state must be Redis-ready shape (typed key, TTL, tenant-scoped) even when backed by LRU.
- Build for now. No Redis, queue brokers, or external vector stores until a documented trigger. Default: LRU + `p-queue` + pgvector.
- Per-tenant work queues: `getQueue(tenantId)` / `enqueueRun` from `@seta/agent-workflows` — `PQueue` per tenant in LRU.
- Idempotent external boundaries. Webhooks, OAuth callbacks, LLM/Graph calls, queue handlers must tolerate replays. Natural keys (activity id, conversation id, uuid) for correlation — never auto-increment ints.
- Forward-only schema. No downgrade migrations.

## Conventions
- ESM only (`"type": "module"`). No CJS.
- No TS path aliases. Import via workspace package names.
- `import type` for type-only imports (Biome enforces).
- No `any`, no unjustified `as` casts. Derive types from Zod (`z.infer<>`) and Drizzle (`$inferSelect`/`$inferInsert`). `as const` and `satisfies` allowed.
- Tests: unit co-located `<pkg>/src/**/*.test.ts`; integration `<pkg>/tests/integration/**`; E2E `/tests/e2e/**`.
- Logging: `logger` from `@seta/observability`. No `console.log` outside CLI. Every request path, external call (Graph/LLM/OAuth), job, error branch emits structured logs with `tenant_id` + correlation id. Auto-redacted keys: `client_secret`, `secret`, `password`, `access_token`, `refresh_token` (see `@seta/observability/logger.ts`) — name new sensitive fields to match, or extend the redact list. Never bypass `logger` for ad-hoc dumps.
- UI/UX: admin SPAs (Studio, Timesheet, PMO, Finance) follow `DESIGN.md` (shared tokens, AppShell, Linear-inspired). Read before new screens/components/variants.
- Errors: throw `DomainError` subclasses from `@seta/middleware/errors`; mapped to RFC 7807. Never swallow — `catch` either handles a specific subclass or logs + rethrows. No empty catches, no `.catch(() => {})`.
- Mocks: never mock internal `@seta/*` (fix the seam). Never mock Postgres in integration tests. External HTTP via `msw` recordings.
- Vitest: root owns `pool`/`coverage`/`thresholds`/`projects`. Leaf overrides only `test.name`. No `vitest.workspace.ts`.
- Don't duplicate pinned tools: no ESLint, Prettier, Jest, Express, Playwright (until Studio).

## Implementation flow
- TDD for `platform/*` and `modules/products/*/tools/*`. Skip: `apps/api` wiring, route registration, type-only, one-off scripts.
- DDD ownership: each `modules/products/<domain>/` and `modules/connectors/<vendor>/` owns its schema + services + tools + handlers. Import rules in *Boundaries*.
- Outbound OAuth via MSAL Node: `@azure/msal-node` `ConfidentialClientApplication` (admin consent, OBO, client_credentials, refresh). Stateless — no `ICachePlugin`. `oauth.oauth_tokens` is the only SOR. Single-flight refresh via `SELECT … FOR UPDATE`. One CCA per tenant, LRU-cached.
- Connector consent: every Graph call path must first pass `connectorRegistry.requireConsent(tenantId, '<connector-id>')`. Admin-consent URL: `scope=https://graph.microsoft.com/.default` against `/v2.0/adminconsent`. Per-connector scopes in `ConnectorDefinition.requiredScopes`.
- Bugs: `superpowers:systematic-debugging` (reproduce → isolate → fix).
- Done: `superpowers:verification-before-completion` (typecheck + lint + relevant tests + exercise endpoint for HTTP/UI).
- ADRs for non-reversible decisions (new external service, new auth flow, data-losing migration) → `docs/adr/`.

## Commits & PRs
- Conventional Commits: `feat(agent-core): …` / `fix(teams): …` / `feat(api)!: …` for breaking. Scope = package without `@seta/`.
- Changeset required for every change to a published (`"private": false`) package.
- One change, one PR. No bundled refactors or dep bumps. Squash/rebase merges only.

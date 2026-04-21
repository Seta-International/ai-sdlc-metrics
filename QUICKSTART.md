# Future — Quickstart

> **For AI agents and developers.** Get from zero to running code in under 10 minutes.
> This is the single entry point. All detailed docs are linked from here.

---

## Prerequisites

| Tool    | Version    | Install                                     |
| ------- | ---------- | ------------------------------------------- |
| Bun     | `^1.3`     | `curl -fsSL https://bun.sh/install \| bash` |
| Docker  | any recent | docker.com/get-started                      |
| Node.js | not needed | Bun replaces it                             |

---

## 1. Install dependencies

```bash
bun install
```

This installs all workspace packages across `apps/`, `packages/`, and `agents/`.

---

## 2. Start local infrastructure

```bash
bun run db:up
```

Starts PostgreSQL 16 and Redis 8 via Docker Compose. On first boot, creates three databases:
`future`, `future_dev`, `future_test`.

---

## 3. Configure environment

The fastest way — copy all `.env` files at once:

```bash
bun run bootstrap
```

Or do it manually:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web-shell/.env.example apps/web-shell/.env
cp agents/langfuse/.env.example agents/langfuse/.env
```

Required variables to set before the API will start:

| Variable            | What it is             | Where to get it                  |
| ------------------- | ---------------------- | -------------------------------- |
| `DATABASE_URL`      | Dev DB connection      | Already set in `.env.example`    |
| `TEST_DATABASE_URL` | Test DB connection     | Already set in `.env.example`    |
| `REDIS_URL`         | Redis connection       | Already set in `.env.example`    |
| `JWT_SECRET`        | Session signing key    | Any random 32-byte string        |
| `ENTRA_TENANT_ID`   | Microsoft Entra tenant | Azure portal → Entra ID          |
| `ENTRA_CLIENT_ID`   | Entra app registration | Azure portal → App registrations |

For local dev without SSO, the `NEXT_PUBLIC_DEV_TENANT_ID` and `NEXT_PUBLIC_DEV_ACTOR_ID`
variables in `.env.example` let you bypass auth entirely. Never set these in production.

---

## 4. Build workspace packages

Packages export from `./dist/` and must be built before running the API or tests.

```bash
bun run --filter "@future/*" build
```

Run this once after a fresh `bun install` or after pulling a branch that touched packages.
If you see `Failed to resolve entry for package "@future/..."`, this is why.

---

## 5. Run DB migrations

```bash
bun run db:migrate
```

Applies all pending Drizzle migrations against `future_dev`.

---

## 6. Start the dev server

Most common: API + the zones you're working on.

```bash
# API only
bun run dev --filter=@future/api

# API + shell + specific zones
bun run dev --filter=@future/api --filter=@future/web-shell --filter=@future/web-people

# Everything (slow, use only if you need all zones)
bun run dev
```

| Service          | URL                   |
| ---------------- | --------------------- |
| API (tRPC)       | http://localhost:4000 |
| web-shell (auth) | http://localhost:3000 |
| web-people       | http://localhost:3001 |
| web-time         | http://localhost:3002 |
| web-hiring       | http://localhost:3003 |
| web-performance  | http://localhost:3004 |
| web-projects     | http://localhost:3005 |
| web-finance      | http://localhost:3006 |
| web-goals        | http://localhost:3007 |
| web-insights     | http://localhost:3008 |
| web-planner      | http://localhost:3009 |
| web-admin        | http://localhost:3010 |

---

## 7. Run tests

```bash
# Unit tests (fast, no DB needed)
bun run test:unit

# Integration tests (requires running Postgres on TEST_DATABASE_URL)
bun run test:integration

# E2E (requires staging deployment)
bun run test:e2e
```

Test files live next to the code they test: `foo.handler.spec.ts` beside `foo.handler.ts`.
Coverage threshold is 70% lines/functions/branches — PRs below this are blocked.
See [docs/engineering/testing-strategy.md](docs/engineering/testing-strategy.md) for the full test pyramid and conventions.

---

## 8. Provision a local tenant (optional)

If you need a seeded tenant for dev work:

```bash
bun run tenant:provision \
  --name "Acme Corp" \
  --slug acme \
  --plan starter \
  --admin-name "Admin User" \
  --admin-email admin@acme.example
```

---

## 9. Stop local infrastructure

```bash
bun run db:down
```

---

## Key commands reference

| Command                  | What it does                                                   |
| ------------------------ | -------------------------------------------------------------- |
| `bun run bootstrap`      | Copy all .env.example files (safe to re-run)                   |
| `bun run bootstrap:full` | Full onboarding: copy envs + install + db:up + build + migrate |
| `bun run db:up`          | Start Postgres + Redis                                         |
| `bun run db:down`        | Stop Postgres + Redis                                          |
| `bun run db:generate`    | Generate a new Drizzle migration from schema changes           |
| `bun run db:migrate`     | Apply pending migrations                                       |
| `bun run typecheck`      | Type-check all packages                                        |
| `bun run lint`           | Lint all packages                                              |
| `bun run format`         | Format all files with Prettier                                 |
| `bun run deps:outdated`  | Check for outdated deps across all workspaces                  |
| `bun run deps:update`    | Update deps within semver ranges                               |
| `turbo gen workspace`    | Scaffold a new workspace package (never create manually)       |
| `bunx nest generate ...` | Add NestJS module/service/controller (run from `apps/api`)     |

---

## Repo structure

```
apps/
  api/               → NestJS modular monolith (tRPC + agent endpoints)
  web-shell/         → Next.js auth hub (SSO entry point for all zones)
  web-{module}/      → Next.js zone per domain module (11 total)
  e2e/               → Playwright E2E tests (staging only)
agents/
  langfuse/          → Self-hosted LLM observability
  mcp-tools/         → MCP tool contracts per module
  prompts/           → System prompts, topic configs, guardrail rules
  evals/             → LLM eval harness
  channels/          → Teams, Slack, SSE adapters
packages/
  db/                → Drizzle schema + migrations
  ui/                → Shared React components (@future/ui)
  auth/              → SSO helpers, useSession hook
  event-contracts/   → Domain event types (zero NestJS/Drizzle deps)
  api-client/        → tRPC type exports only
  app-layout/        → Sidebar, AppLayout (one instance per session)
infra/               → Terraform IaC (AWS ECS Fargate, ap-southeast-1)
data-platform/       → AWS Glue ETL scripts
docs/                → Architecture, engineering standards, roadmaps
```

---

## Architecture in one paragraph

The API is a NestJS modular monolith. Each domain module (`people`, `time`, `hiring`, etc.)
owns its own Drizzle schema, command/query handlers, and tRPC router slice. Modules never
import each other's internals — cross-module reads go through `*QueryFacade`, cross-module
writes go through domain events in `packages/event-contracts`. The frontend is 11 independent
Next.js zones + a shell; zones talk to the API only via tRPC, never the DB directly. Agents
run inside the `agents` module and reach other modules through MCP tool contracts.

Full architecture: [docs/architecture/overview.md](docs/architecture/overview.md)

---

## Rules that block PRs

These are non-negotiable. Full rules: [AGENTS.md](AGENTS.md) and [docs/engineering/project-rules.md](docs/engineering/project-rules.md).

1. **Write tests first.** No test = feature not started.
2. **UUIDs use `uuidv7()`**, not `randomUUID()`.
3. **No FK constraints across module schemas.**
4. **Every table has `tenant_id`.**
5. **Never import another module's `domain/` or `infrastructure/`.**
6. **No `.js` extensions in relative imports** — this repo is NodeNext+CJS.
7. **Never manually edit `package.json` or lockfiles** — use `bun add` / `bun remove`.
8. **Never push to `main`** — all changes via PR, CI green + one approval.
9. **Never use `Promise.all` for DB queries in handlers** — single client per request.
10. **Secrets in AWS Secrets Manager only** — never in env files, DB, or hardcoded.

---

## For AI agents

Read [AGENTS.md](AGENTS.md) for the full rule set before any implementation work.
Check [docs/agents/critical-decisions.md](docs/agents/critical-decisions.md) and
[docs/agents/repeat-issues.md](docs/agents/repeat-issues.md) before non-trivial work
— recurring issues and durable decisions are logged there.

Key gotchas:

- Build packages before running tests: `bun run --filter "@future/*" build`
- Sequential DB queries only inside handlers (`await` each one, no `Promise.all`)
- Module exports facades only — never raw repos or domain entities
- `CLAUDE.md` is a symlink to `AGENTS.md` — one source of truth for both Claude and other agents

---

## Further reading

| Document                                                                     | What's in it                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| [AGENTS.md](AGENTS.md)                                                       | Hard rules, module boundaries, DDD conventions         |
| [DESIGN.md](DESIGN.md)                                                       | Design system — read before any UI work                |
| [docs/architecture/overview.md](docs/architecture/overview.md)               | Full architecture diagram                              |
| [docs/engineering/tech-stack.md](docs/engineering/tech-stack.md)             | Every technology choice with versions and rationale    |
| [docs/engineering/project-rules.md](docs/engineering/project-rules.md)       | Non-negotiable engineering rules with code examples    |
| [docs/engineering/testing-strategy.md](docs/engineering/testing-strategy.md) | Test pyramid, framework choices, coverage requirements |
| [docs/architecture/application.md](docs/architecture/application.md)         | Module layout, DDD boundaries, cross-module patterns   |
| [infra/bootstrap/README.md](infra/bootstrap/README.md)                       | Terraform bootstrap (run once before any infra ops)    |

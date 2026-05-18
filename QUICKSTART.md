# Quickstart

Local dev environment for Seta OS in ~5 minutes.

## Prerequisites

- **Node** ≥ 24
- **pnpm** 11.0.9 (don't bump without a changeset note)
- **Docker** running

## One-time setup

```bash
git clone https://github.com/Seta-International/seta-os.git
cd seta-os
pnpm install --frozen-lockfile
cp .env.example .env
```

Then edit `.env` and fill in:

| Secret | Generate with |
| ------ | ------------- |
| `SESSION_HMAC_KEY` | `openssl rand -base64 32` |
| `DEV_DEK_BASE64` | `openssl rand -base64 32` |
| `CONTINUATION_HMAC_KEY` | `openssl rand -hex 32` |
| `BOOTSTRAP_SUPERADMIN_EMAILS` | your email (first entry becomes tenant owner) |

For **real SSO login** you also need:

- `ENTRA_CLIENT_ID` + `ENTRA_CLIENT_SECRET` — Azure App Registration with redirect URI `http://localhost:8080/sso/callback/entra`
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — Google OAuth client with redirect URI `http://localhost:8080/sso/callback/google`
- `BOOTSTRAP_ENTRA_TENANT_ID` — the Azure tenant the bootstrap user lives in

For first run without SSO (UI smoke test only) leave the SSO/Bootstrap-Entra values as the `dev-placeholder-*` defaults and keep `BOOTSTRAP_OFFLINE=1`.

## Bootstrap

```bash
pnpm bootstrap
```

That single command runs `db:up` → `migrate` → `seed`:

- Starts Postgres + Jaeger + OTel collector via Docker Compose.
- Initializes the DB roles (`platform_admin`, `tenant_user`) and applies every owner's migrations in dependency order.
- Creates the bootstrap tenant (`BOOTSTRAP_TENANT_SLUG`), seeds connector consent, and inserts each `BOOTSTRAP_SUPERADMIN_EMAILS` entry into `auth.superadmins`. The first email becomes the tenant owner.

## Run

```bash
pnpm dev
```

Brings up the three apps (api + studio + console) under Turborepo:

| App | Direct | Through API proxy |
| --- | --- | --- |
| API | http://localhost:8080 | — |
| Studio | http://localhost:5180/studio/ | **http://localhost:8080/studio/** |
| Console | http://localhost:5174/console/ | **http://localhost:8080/console/** |

Use the **API-origin URLs** so session cookies and `/api/*` calls share one host.

Traces: http://localhost:16686 (Jaeger).

## Common commands

| Task | Command |
| ---- | ------- |
| Reset DB and re-bootstrap | `docker exec seta-os-pg-1 psql -U seta -d postgres -c "DROP DATABASE seta WITH (FORCE); CREATE DATABASE seta;" && pnpm bootstrap` |
| Stop docker services | `pnpm db:down` |
| Run apps + all library watchers | `pnpm dev:all` (heavier; use when editing workspace packages) |
| Rebuild a single workspace lib | `pnpm --filter @seta/<pkg> build` |
| Lint / format / typecheck | `pnpm lint` · `pnpm format` · `pnpm typecheck` |
| Unit tests | `pnpm test:unit` |
| Integration tests | `pnpm test:integration` (needs `DATABASE_URL`) |
| Add a package dep | `pnpm --filter @seta/<pkg> add <dep>@<version>` |
| Scaffold a new package | `pnpm new:package` |

## Troubleshooting

- **`relation "agent.agent_profiles" does not exist` at boot** — migrations didn't run for a module. Re-bootstrap (see Common commands).
- **Console binds to a different port** — a stale Vite from a Claude worktree is holding `:5174`. Find it with `lsof -i :5174` and `kill <pid>`.
- **`(node:NNNN) [DEP0205] DeprecationWarning: module.register()`** — dev-only noise from tsx 4.21.0's loader on Node 26. Production (`node --import dist/instrumentation.js dist/main.js`) is unaffected. Will go away when tsx upstream migrates to `module.registerHooks()`; track [privatenumber/tsx](https://github.com/privatenumber/tsx/issues).
- **Pre-commit fails on `package.json`** — never hand-edit `package.json` (except metadata keys). Use `pnpm add/remove/up` or `npm pkg set scripts.<name>=...` instead. See `CLAUDE.md` → *Packages & deps*.

## Letting Claude Code do it

If you have [Claude Code](https://claude.com/claude-code) installed in the repo, paste this prompt:

> Bootstrap this repo for local development. Read `QUICKSTART.md`. Create `.env` from `.env.example`, fill the three secret placeholders (`SESSION_HMAC_KEY`, `DEV_DEK_BASE64`, `CONTINUATION_HMAC_KEY`) with freshly generated values, leave SSO + Bootstrap-Entra placeholders alone for now, set `BOOTSTRAP_SUPERADMIN_EMAILS` to my git email, then run `pnpm install --frozen-lockfile && pnpm bootstrap && pnpm dev` in the background. Confirm the API responds on http://localhost:8080/healthz and Studio responds on http://localhost:8080/studio/. Don't push, don't commit.

For a fresh clone where Claude needs more guidance, start with:

> Read `README.md`, `CLAUDE.md`, and `QUICKSTART.md`, then bootstrap and run the project locally.

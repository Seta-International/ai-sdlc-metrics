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

For **real SSO login** you need two Entra app registrations (different purposes):

| App | Vars | Purpose |
| --- | --- | --- |
| Bootstrap tenant's Entra app (Graph) | `ENTRA_CLIENT_ID` / `_SECRET` | First tenant's Entra app for Graph (Planner / Directory / Mail.Send). Additional tenants onboard via admin UI → per-tenant token vault. |
| Per-tenant SSO app | `BOOTSTRAP_SSO_CLIENT_ID` / `_SECRET`, `BOOTSTRAP_ENTRA_DIRECTORY_ID`, `BOOTSTRAP_SSO_EMAIL_DOMAINS` | User sign-in for the bootstrap tenant. Single-tenant; registered inside the tenant's own Entra directory. |

See **First-time SSO setup** below for the step-by-step app-reg walkthrough.

For first run without SSO (UI smoke test only) leave the placeholders alone and keep `BOOTSTRAP_OFFLINE=1`.

### First-time SSO setup

Seta uses bring-your-own-IdP SSO: each tenant configures its own Microsoft
Entra app. For local development, Seta-the-tenant needs an Entra app reg
in your test Entra directory.

1. Open the Azure portal → **App registrations** → **New registration**.
2. Name: `Seta SSO (dev)`. Supported account types: **Accounts in this
   organizational directory only**.
3. Redirect URI (Web): `http://localhost:8080/sso/callback/entra`.
4. After registration:
   - Copy **Application (client) ID** → `BOOTSTRAP_SSO_CLIENT_ID`
   - Copy **Directory (tenant) ID** → `BOOTSTRAP_ENTRA_DIRECTORY_ID`
5. **Certificates & secrets** → **New client secret** → copy the **Value**
   (not the Secret ID) → `BOOTSTRAP_SSO_CLIENT_SECRET`. The value is shown only once.
6. Set `BOOTSTRAP_SSO_EMAIL_DOMAINS` to a comma list of email domains
   whose users should resolve to this tenant at `POST /sso/discover`
   (typically your corporate domain, e.g. `seta-international.vn`).
7. Run `pnpm bootstrap`.

The Graph-data Entra app (`ENTRA_CLIENT_*`) is a separate app reg from
the SSO one above. It is owned by the tenant in their own M365 directory
and used only for Graph API access (Planner, Directory, Mail.Send), not
for user sign-in. For dev you may reuse the same app reg for both —
production should have two.

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

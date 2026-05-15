# PR-2: apps/api — Mount /sso + /me Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire @seta/identity into apps/api by adding env vars and a composition diff in main.ts that mounts createSsoRoutes.

**Architecture:** apps/api stays composition-only. New env vars added to apps/api/src/env.ts Zod schema. main.ts imports createSsoRoutes + provider classes, builds them, mounts at root. Integration test covers a full callback round-trip with a mock provider.

**Tech Stack:** Hono, @seta/identity@workspace:*, Zod 4.4.3, vitest 4.1.5.

---

## Phase 1 — Workspace dependency

### Task 1.1 — Add @seta/identity workspace dependency to @seta/api

- [ ] Run the CLI (no hand-edit of package.json):

```sh
pnpm --filter @seta/api add @seta/identity@workspace:*
```

- [ ] Confirm `apps/api/package.json` now lists `"@seta/identity": "workspace:*"` under `"dependencies"` (alphabetised between `@seta/oauth` and `@seta/observability` after re-sort, or wherever pnpm placed it — do NOT manually re-sort).
- [ ] Confirm `pnpm-lock.yaml` updated.

Commit:

```sh
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add @seta/identity workspace dependency"
```

---

## Phase 2 — Env schema extension (TDD)

### Task 2.1 — Write failing co-located unit test for new env vars

Create `apps/api/src/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

// Re-build the same schema shape used in env.ts. The schema itself is private to env.ts
// (it parses process.env at module load), so we re-create the relevant slice here and
// assert on its parse output. When env.ts is updated, the imports below switch to the
// exported schema (see Task 2.2 — exports the raw schema as `EnvSchema`).
import { EnvSchema } from './env'

const baseEnv = {
  NODE_ENV: 'test',
  PORT: '8080',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  PUBLIC_BASE_URL: 'http://localhost:8080',
  ENTRA_CLIENT_ID: 'entra-client',
  ENTRA_CLIENT_SECRET: 'entra-secret',
  KMS_PROVIDER: 'env',
  DEV_DEK_BASE64: 'AAAA',
  CONTINUATION_HMAC_KEY: '0'.repeat(64),
  MS_BOT_ID: 'bot',
  MS_BOT_SECRET: 'bot-secret',
  GOOGLE_CLIENT_ID: 'google-client',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  SESSION_HMAC_KEY: 'a'.repeat(32),
  SESSION_TTL_SEC: '86400',
}

describe('apps/api env', () => {
  it('accepts a complete, valid env', () => {
    const parsed = EnvSchema.parse(baseEnv)
    expect(parsed.GOOGLE_CLIENT_ID).toBe('google-client')
    expect(parsed.SESSION_TTL_SEC).toBe(86400)
    expect(parsed.SESSION_HMAC_KEY.length).toBe(32)
  })

  it('rejects when ENTRA_CLIENT_ID is missing', () => {
    const { ENTRA_CLIENT_ID: _, ...rest } = baseEnv
    expect(() => EnvSchema.parse(rest)).toThrow()
  })

  it('rejects when ENTRA_CLIENT_SECRET is missing', () => {
    const { ENTRA_CLIENT_SECRET: _, ...rest } = baseEnv
    expect(() => EnvSchema.parse(rest)).toThrow()
  })

  it('rejects when GOOGLE_CLIENT_ID is missing', () => {
    const { GOOGLE_CLIENT_ID: _, ...rest } = baseEnv
    expect(() => EnvSchema.parse(rest)).toThrow()
  })

  it('rejects when GOOGLE_CLIENT_SECRET is missing', () => {
    const { GOOGLE_CLIENT_SECRET: _, ...rest } = baseEnv
    expect(() => EnvSchema.parse(rest)).toThrow()
  })

  it('rejects SESSION_HMAC_KEY shorter than 32 chars', () => {
    expect(() => EnvSchema.parse({ ...baseEnv, SESSION_HMAC_KEY: 'short' })).toThrow()
  })

  it('rejects SESSION_TTL_SEC of 0', () => {
    expect(() => EnvSchema.parse({ ...baseEnv, SESSION_TTL_SEC: '0' })).toThrow()
  })

  it('rejects negative SESSION_TTL_SEC', () => {
    expect(() => EnvSchema.parse({ ...baseEnv, SESSION_TTL_SEC: '-1' })).toThrow()
  })

  it('defaults SESSION_TTL_SEC to 86400 when omitted', () => {
    const { SESSION_TTL_SEC: _, ...rest } = baseEnv
    const parsed = EnvSchema.parse(rest)
    expect(parsed.SESSION_TTL_SEC).toBe(86400)
  })

  it('rejects when PUBLIC_BASE_URL is not a URL', () => {
    expect(() => EnvSchema.parse({ ...baseEnv, PUBLIC_BASE_URL: 'not-a-url' })).toThrow()
  })

  it('rejects when SESSION_HMAC_KEY is missing', () => {
    const { SESSION_HMAC_KEY: _, ...rest } = baseEnv
    expect(() => EnvSchema.parse(rest)).toThrow()
  })
})
```

- [ ] Run `pnpm --filter @seta/api test` — confirm test file fails to import (`EnvSchema` not exported yet). RED state established.

Commit:

```sh
git add apps/api/src/env.test.ts
git commit -m "test(api): pending env schema unit tests for sso vars"
```

### Task 2.2 — Extend `apps/api/src/env.ts` Zod schema and export `EnvSchema`

Replace the body of `apps/api/src/env.ts` with:

```ts
import 'dotenv/config'
import { z } from 'zod'

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().url(),
  PUBLIC_BASE_URL: z.string().url(),
  ENTRA_CLIENT_ID: z.string().min(1),
  ENTRA_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  SESSION_HMAC_KEY: z.string().min(32, 'must be ≥32 chars'),
  SESSION_TTL_SEC: z.coerce.number().int().positive().default(86400),
  KMS_PROVIDER: z.enum(['aws', 'env']).default('env'),
  DEV_DEK_BASE64: z.string().optional(),
  AWS_REGION: z.string().optional(),
  KMS_KEY_ARN: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
  AZURE_OPENAI_API_KEY: z.string().min(1).optional(),
  AZURE_OPENAI_API_VERSION: z.string().default('2024-10-21'),
  CONTINUATION_HMAC_KEY: z.string().min(64, 'must be ≥32 bytes (64 hex chars)'),
  PLANNER_CACHE_TTL_TASKS_SEC: z.coerce.number().int().positive().default(60),
  PLANNER_CACHE_TTL_PLANS_SEC: z.coerce.number().int().positive().default(600),
  PLANNER_CACHE_TTL_BUCKETS_SEC: z.coerce.number().int().positive().default(300),
  PLANNER_CACHE_STALE_FALLBACK_MAX_SEC: z.coerce.number().int().positive().default(3600),
  PLANNER_BATCH_CONCURRENCY: z.coerce.number().int().positive().default(3),
  CONTINUATION_TTL_MIN: z.coerce.number().int().positive().default(15),
  MS_BOT_ID: z.string().min(1),
  MS_BOT_SECRET: z.string().min(1),
  TEAMS_SKIP_JWT_VERIFY: z.coerce.boolean().default(false),
  PLANNER_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(180_000),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  AGENT_EMBEDDINGS_PROVIDER: z.enum(['openai', 'azure-openai', 'none']).default('none'),
})

export const env = EnvSchema.parse(process.env)
```

- [ ] Run `pnpm --filter @seta/api test`. All env tests pass — GREEN.
- [ ] Run `pnpm --filter @seta/api typecheck`. Clean.

Commit:

```sh
git add apps/api/src/env.ts apps/api/src/env.test.ts
git commit -m "feat(api): add sso env vars (entra/google/session) to Zod env schema"
```

---

## Phase 3 — Composition diff in main.ts

### Task 3.1 — Mount /sso and /me in `apps/api/src/main.ts`

Add the import to the existing import block in `apps/api/src/main.ts`:

```ts
import { createSsoRoutes, EntraSsoProvider, GoogleSsoProvider } from '@seta/identity'
```

Add the following block in `main.ts` immediately after the `EntraProvider` (line ~73) singleton construction and before the `// ── Tool registry ──` divider:

```ts
// ── SSO providers + routes ────────────────────────────────────────────────────

const entraSso = new EntraSsoProvider({
  clientId: env.ENTRA_CLIENT_ID,
  clientSecret: env.ENTRA_CLIENT_SECRET,
})
const googleSso = new GoogleSsoProvider({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
})

const sso = createSsoRoutes({
  providers: { entra: entraSso, google: googleSso },
  sql,
  sessionCookie: {
    name: 'seta_sess',
    hmacKey: env.SESSION_HMAC_KEY,
    ttlSec: env.SESSION_TTL_SEC,
    secure: env.NODE_ENV === 'production',
  },
  redirectBase: env.PUBLIC_BASE_URL,
})
```

Then add the mount line in the route-registration section, immediately after `app.get('/healthz', ...)` and before `app.route('/oauth', ...)`:

```ts
app.route('/', sso)
```

- [ ] Diff is exactly: 1 import line, ~16-line SSO providers + routes block, and 1 mount line.
- [ ] Run `pnpm --filter @seta/api typecheck`. Clean.
- [ ] Run `pnpm --filter @seta/api build`. Clean.

Commit:

```sh
git add apps/api/src/main.ts
git commit -m "feat(api): mount /sso and /me via createSsoRoutes"
```

---

## Phase 4 — `.env.example` + SCOPE.md

### Task 4.1 — Update `apps/api/.env.example`

Append to `apps/api/.env.example` immediately after the `ENTRA_CLIENT_SECRET=...` block:

```
# SSO — Studio (PR-2)
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>

# Generate with: openssl rand -base64 32
SESSION_HMAC_KEY=<base64-32-byte-secret>
SESSION_TTL_SEC=86400
```

- [ ] Confirm the file parses (manual review — no test target).

### Task 4.2 — Update `apps/api/SCOPE.md` env table + endpoints list

In `apps/api/SCOPE.md`, under `## Current state (Epic 1)` → `src/env.ts` paragraph, append the new fields to the description.

In the `## Public interface` → `**HTTP endpoints (current).**` block, add (insert after the `/healthz` line, before `/oauth/*`):

```
- `POST /sso/login/:provider` — issues PKCE handshake URL (provider ∈ `entra | google`).
- `GET  /sso/callback/:provider` — exchanges code, sets `seta_sess` cookie, 302 redirects.
- `POST /sso/logout` — clears session.
- `GET  /me` — returns `{ user, tenants, csrfToken }` or 401 RFC 7807 problem JSON.
```

In the `## Public interface` → `**Env contract**` table, add four rows after the `ENTRA_CLIENT_SECRET` row:

```
| `GOOGLE_CLIENT_ID` | non-empty string | — | yes |
| `GOOGLE_CLIENT_SECRET` | non-empty string | — | yes |
| `SESSION_HMAC_KEY` | string (≥32 chars) | — | yes |
| `SESSION_TTL_SEC` | positive int | `86400` | no |
```

- [ ] Verify markdown renders cleanly.

Commit (combined for the two docs):

```sh
git add apps/api/.env.example apps/api/SCOPE.md
git commit -m "docs(api): document sso env vars and /sso + /me endpoints"
```

---

## Phase 5 — Integration tests (TDD: failing first)

### Task 5.1 — Factor `buildApp()` out of `main.ts` so tests can boot the composition in-process

`main.ts` currently calls `serve(...)` as a top-level side effect, which prevents importing it from tests. Refactor in-place:

In `apps/api/src/main.ts`, replace the final boot block with a `buildApp()` export and a `main.meta.url`-guarded boot call:

```ts
export function buildApp() {
  return app
}

export { sql, sso }

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const server = serve({ fetch: app.fetch, port: env.PORT }, async (info) => {
    logger.info({ port: info.port }, 'api listening')
    await boot().catch((err) => logger.error({ err }, 'boot failed'))
  })

  const shutdown = (signal: string) => async () => {
    logger.info({ signal }, 'shutting down')
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await sql.end()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown('SIGTERM'))
  process.on('SIGINT', shutdown('SIGINT'))
}
```

- [ ] Run `pnpm --filter @seta/api typecheck`. Clean.
- [ ] Run `pnpm --filter @seta/api build`. Clean.
- [ ] Run `pnpm --filter @seta/api dev` locally; confirm boot still works (`curl localhost:8080/healthz` returns `{"ok":true}`).

Commit:

```sh
git add apps/api/src/main.ts
git commit -m "refactor(api): expose buildApp() and guard serve() under import.meta.url"
```

### Task 5.2 — Add devDependency on @seta/identity testkit (mock provider helper)

@seta/identity (per PR-1 §4.4) does not yet ship a `testkit` subpath — the integration test will construct an inline mock `SsoProvider` literal that returns a fixed `OidcIdToken`. No extra dep required.

- [ ] Confirm — no `pnpm add` needed here. Skip if confirmed.

### Task 5.3 — Write failing integration test: `/me` returns 401 RFC 7807

Create `apps/api/tests/integration/sso.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildApp } from '../../src/main'

describe('GET /me without session', () => {
  it('returns 401 with RFC 7807 problem JSON', async () => {
    const app = buildApp()
    const res = await app.request('/me')
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/)
    const body = await res.json()
    expect(body).toMatchObject({
      type: expect.any(String),
      title: expect.any(String),
      status: 401,
    })
  })
})
```

- [ ] Set `DATABASE_URL` (e.g. via `.env.test`) before running, since `env.ts` requires it at module load. Use the pre-existing local-dev Postgres pool from `pnpm db:up`.
- [ ] Run `pnpm --filter @seta/api vitest run tests/integration/sso.test.ts`. Confirm it fails (route not yet hit / fixture missing / @seta/identity missing — depends on PR-1 status).
- [ ] Once @seta/identity lands and the route returns the RFC 7807 problem body, the test passes — GREEN.

Commit:

```sh
git add apps/api/tests/integration/sso.test.ts
git commit -m "test(api): /me returns 401 RFC 7807 problem without session"
```

### Task 5.4 — Write failing integration test: full SSO callback round-trip with mock provider

Add a second describe block to `apps/api/tests/integration/sso.test.ts`. The test builds an isolated Hono app via `createSsoRoutes(...)` directly (NOT `buildApp()`), injecting an inline mock `SsoProvider`. This keeps the test focused on the @seta/identity public contract and avoids requiring real Entra/Google credentials in CI.

Append:

```ts
import { Hono } from 'hono'
import { onError } from '@seta/middleware'
import { createSsoRoutes, type SsoProvider } from '@seta/identity'
import { sql } from '../../src/db'

const mockProvider = (id: 'entra' | 'google'): SsoProvider => ({
  id,
  authorizeUrl: ({ state, redirectUri }) =>
    `https://mock.${id}/authorize?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  exchangeCode: async () => ({
    sub: `mock-${id}-subject`,
    email: `user@example.com`,
    name: 'Mock User',
    picture: null,
    provider: id,
  }),
})

function buildSsoApp() {
  const app = new Hono().onError(onError)
  const sso = createSsoRoutes({
    providers: { entra: mockProvider('entra'), google: mockProvider('google') },
    sql,
    sessionCookie: {
      name: 'seta_sess',
      hmacKey: 'a'.repeat(32),
      ttlSec: 86400,
      secure: false,
    },
    redirectBase: 'http://localhost:8080',
  })
  app.route('/', sso)
  return app
}

describe('SSO round-trip with mock provider', () => {
  it('login → callback → /me yields a session and user payload', async () => {
    const app = buildSsoApp()

    // 1. POST /sso/login/entra → { url }
    const loginRes = await app.request('/sso/login/entra', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnTo: '/' }),
    })
    expect(loginRes.status).toBe(200)
    const { url } = (await loginRes.json()) as { url: string }
    const parsed = new URL(url)
    const state = parsed.searchParams.get('state')
    expect(state).toBeTruthy()
    const loginSetCookie = loginRes.headers.get('set-cookie')
    expect(loginSetCookie).toMatch(/seta_pkce=/)

    // 2. GET /sso/callback/entra?code=mock-code&state=<state>
    const callbackRes = await app.request(
      `/sso/callback/entra?code=mock-code&state=${state}`,
      { headers: { cookie: loginSetCookie ?? '' } },
    )
    expect(callbackRes.status).toBe(302)
    expect(callbackRes.headers.get('location')).toBe('http://localhost:8080/')
    const sessCookie = callbackRes.headers.get('set-cookie')
    expect(sessCookie).toMatch(/seta_sess=/)

    // 3. Assert auth.sessions row inserted
    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count
      from auth.sessions
      where user_id in (
        select user_id from auth.user_identities where provider = 'entra' and subject = 'mock-entra-subject'
      )
    `
    expect(Number(rows[0].count)).toBeGreaterThan(0)

    // 4. GET /me with the session cookie → 200 + { user, tenants: [], csrfToken }
    const meRes = await app.request('/me', { headers: { cookie: sessCookie ?? '' } })
    expect(meRes.status).toBe(200)
    const me = (await meRes.json()) as {
      user: { email: string; name: string }
      tenants: unknown[]
      csrfToken: string
    }
    expect(me.user.email).toBe('user@example.com')
    expect(me.tenants).toEqual([])
    expect(typeof me.csrfToken).toBe('string')
    expect(me.csrfToken.length).toBeGreaterThan(0)
  })
})
```

- [ ] Run `pnpm --filter @seta/api vitest run tests/integration/sso.test.ts`. With PR-1 in place + Postgres up + migrations applied, this passes — GREEN.

Commit:

```sh
git add apps/api/tests/integration/sso.test.ts
git commit -m "test(api): integration round-trip /sso/login → /sso/callback → /me with mock provider"
```

---

## Phase 6 — Verification gate

### Task 6.1 — Full quality gate

Run all of:

```sh
pnpm --filter @seta/api lint
pnpm --filter @seta/api typecheck
pnpm --filter @seta/api test
```

- [ ] All three succeed.

### Task 6.2 — Smoke test: live server returns 401 unauth

In one shell:

```sh
pnpm db:up
pnpm --filter @seta/api dev
```

In another shell:

```sh
curl -i http://localhost:8080/me
```

- [ ] Response is `HTTP/1.1 401 Unauthorized` with `Content-Type: application/problem+json` and a JSON body containing `"status": 401`.
- [ ] Response of `curl -i http://localhost:8080/healthz` is still `{"ok": true}` (regression check).

Demo state achieved per master plan §3.2 row PR-2: `/me` returns 401 unauth; OIDC round-trip returns user JSON (covered by Task 5.4 integration test).

---

## Self-review checklist

- [ ] §5 of master plan fully covered: env vars added (`ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_HMAC_KEY`, `SESSION_TTL_SEC`, `PUBLIC_BASE_URL` confirmed pre-existing), composition diff matches the spec snippet verbatim.
- [ ] No `process.env.X` read outside `apps/api/src/env.ts`.
- [ ] No hand-edit of `package.json` beyond the CLI add. No lockfile hand-edit.
- [ ] No DI containers, no plugin loaders, no runtime discovery — providers + router are literal singletons in `main.ts`.
- [ ] No internal `@seta/*` mocking in integration tests — only the `SsoProvider` interface (an external boundary contract) is mocked.
- [ ] Integration test uses real Postgres via `DATABASE_URL`.
- [ ] `@hono/zod-openapi` not introduced in this PR — `/me` schemas belong to @seta/identity (PR-1). No `z` import collision here.
- [ ] All commit messages use Conventional Commits with `api` scope.
- [ ] PR-1 dependency: this plan tolerates PR-1 not yet merged at planning time — `pnpm install` resolves `@seta/identity@workspace:*` once it exists. Sequencing belongs to PR ordering, not this plan's scope.

# PR-1: @seta/identity Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the @seta/identity package that owns OIDC + PKCE login for Entra and Google, signed-cookie sessions in auth.sessions, requireSession + csrfMiddleware, and a createSsoRoutes factory.

**Architecture:** Schema-per-module Drizzle in platform/sso/, opaque session-id cookie with HMAC envelope, single-flight handshake with PKCE state cookie, Zod-validated routes via @hono/zod-openapi. Returns empty tenants array on /me; PR-4 fills tenant_members.

**Tech Stack:** Hono 4.12.18, jose 6.2.3, Drizzle ORM 0.45.2 + drizzle-kit 0.31.10, postgres 3.4.9, @hono/zod-openapi 1.4.0, Zod 4.4.3, vitest 4.1.6.

---

## Pre-flight — pin reconciliation

The user spec mentions `vitest@4.1.5`. The workspace is uniformly on `vitest@4.1.6` (every existing platform package). Per CLAUDE.md "Never guess … pin → ask, or read source/docs" — match the workspace standard. **This plan uses `vitest@4.1.6`.** If the user explicitly wants `4.1.5`, they must bump the entire workspace via a separate changeset.

Other pins (all verified against existing platform packages — `oauth`, `tenant`, `middleware`, `auth`):

| Package | Pin | Source |
|---|---|---|
| `hono` | `4.12.18` | `platform/middleware/package.json`, `platform/oauth/package.json` |
| `@hono/zod-openapi` | `1.4.0` | `platform/middleware/package.json` |
| `zod` | `4.4.3` | `platform/oauth/package.json` |
| `jose` | `6.2.3` | `modules/channels/teams/package.json`, master plan §4 |
| `drizzle-orm` | `0.45.2` | `platform/oauth/package.json` |
| `drizzle-kit` | `0.31.10` | `platform/oauth/package.json` |
| `postgres` | `3.4.9` | `platform/oauth/package.json` |
| `vitest` | `4.1.6` | workspace standard |
| `@types/node` | `^25.7.0` | workspace root |
| `typescript` | `6.0.3` | workspace root |
| `tsup` | `8.5.1` | `platform/oauth/package.json` |
| `dotenv` | `17.4.2` | `platform/oauth/package.json` |

Pre-existing schema conflict to resolve in this PR: `@seta/auth`'s `auth.users` and `auth.sessions` schema (commit-shipped, **zero TS importers** — verified via `grep -r "from '@seta/auth'" --include="*.ts"`) is incompatible with SSO multi-tenant identity (its `auth.users.tenant_id NOT NULL` collides with SSO's tenant-spanning identity model). Per CLAUDE.md "No legacy, no backward compat. Pre-1.0. Change all callers + delete old shape in same PR" — PR-1 replaces `@seta/auth`'s `users`/`sessions` schema by transferring schema ownership to `@seta/identity` (the new `auth`-schema owner). `@seta/auth` keeps `api_keys` only (still unused, but out of PR-1 scope). `OWNER_ORDER` in `@seta/db` is updated so the `sso` package owns the `auth`-schema migrations.

---

## Phase 1 — Package scaffold

### Task 1.1 — Scaffold the @seta/identity package via pnpm new:package

- [ ] Run the scaffolder non-interactively:

```sh
pnpm new:package --kind platform --name sso --desc "OIDC + PKCE SSO for Entra and Google; signed-cookie sessions"
```

- [ ] Expected output line:

```
✓ @seta/identity created at platform/sso
```

- [ ] Verify the package directory exists:

```sh
ls platform/sso
```

Expected output line (any order, must contain): `package.json  src  tsconfig.json  vitest.config.ts`

- [ ] Verify the scaffolded `platform/sso/package.json` has `"name": "@seta/identity"`, `"version": "0.1.0"`, `"private": true`, `"type": "module"`, `scripts.build`, `scripts.test:unit`, `scripts.typecheck`. Do NOT hand-edit it.

Commit:

```sh
git add platform/sso pnpm-lock.yaml pnpm-workspace.yaml package.json
git commit -m "chore(sso): scaffold @seta/identity package"
```

---

## Phase 2 — Dependencies via pnpm CLI

### Task 2.1 — Add runtime dependencies

- [ ] Confirm the `jose` pin from the workspace lockfile:

```sh
pnpm view jose version
```

Expected output line: `6.2.3` (or newer — if the registry has a newer version, do **not** auto-bump; keep `6.2.3` to match the existing `modules/channels/teams` pin).

- [ ] Install runtime deps via the CLI (one command — pnpm resolves the workspace links):

```sh
pnpm --filter @seta/identity add \
  jose@6.2.3 \
  postgres@3.4.9 \
  drizzle-orm@0.45.2 \
  hono@4.12.18 \
  '@hono/zod-openapi@1.4.0' \
  zod@4.4.3 \
  dotenv@17.4.2 \
  '@seta/db@workspace:*' \
  '@seta/middleware@workspace:*' \
  '@seta/observability@workspace:*' \
  '@seta/tenant@workspace:*'
```

- [ ] Expected output line includes: `+ jose 6.2.3` and `+ @seta/db workspace:^0.1.0` (or similar workspace link line).

### Task 2.2 — Add dev dependencies

- [ ] Install dev deps:

```sh
pnpm --filter @seta/identity add -D \
  vitest@4.1.6 \
  drizzle-kit@0.31.10 \
  tsup@8.5.1 \
  typescript@6.0.3 \
  '@types/node@^25.7.0' \
  '@seta/tsconfig@workspace:*'
```

- [ ] Expected output line includes: `+ drizzle-kit 0.31.10`.

### Task 2.3 — Verify package.json was written by the CLI (do not hand-edit)

- [ ] Open `platform/sso/package.json` and confirm the dependency block lists every package from Tasks 2.1–2.2 with the exact pins above. If any pin drifted (e.g., caret prefix), STOP — re-run the failed `pnpm --filter` command without a caret.

- [ ] Run `pnpm install --frozen-lockfile` and expect exit code 0:

```sh
pnpm install --frozen-lockfile
```

Expected output line: `Done in <N>s` and no `ERR_PNPM_OUTDATED_LOCKFILE` errors.

Commit:

```sh
git add platform/sso/package.json pnpm-lock.yaml
git commit -m "chore(sso): pin runtime and dev dependencies"
```

---

## Phase 3 — Drizzle config & schema ownership transfer

### Task 3.1 — Write drizzle.config.ts for the auth schema

Create `platform/sso/drizzle.config.ts`:

```ts
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  schemaFilter: ['auth'],
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta' },
  verbose: true,
  strict: true,
})
```

- [ ] File created.

### Task 3.2 — Write the Drizzle schema for auth.users, auth.user_identities, auth.sessions

Create `platform/sso/src/schema.ts`:

```ts
import { tenantUser } from '@seta/db'
import { sql } from 'drizzle-orm'
import {
  index,
  inet,
  pgPolicy,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const authSchema = pgSchema('auth')

/**
 * Canonical SSO user identity. A user is tenant-agnostic — tenant membership
 * lives in tenant.tenant_members (added by PR-4). One row per human, keyed by
 * id; email is the natural login key and is globally unique.
 */
export const users = authSchema.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  pictureUrl: text('picture_url'),
  primaryProvider: text('primary_provider', { enum: ['entra', 'google'] }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

/**
 * Cross-provider linking. (provider, subject) is the IdP-side natural key;
 * user_id is the Seta-side foreign key. A single user_id can have multiple
 * (provider, subject) rows (Entra + Google linked to the same user).
 */
export const userIdentities = authSchema.table(
  'user_identities',
  {
    provider: text('provider', { enum: ['entra', 'google'] }).notNull(),
    subject: text('subject').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.subject] }),
    index('user_identities_user_idx').on(t.userId),
  ],
)

/**
 * Opaque session row. id is the cookie-bound opaque token. RLS forces
 * per-user isolation via current_setting('app.user_id', true)::uuid — the
 * tenant-agnostic membership policy. FORCE ROW LEVEL SECURITY + GRANT are
 * appended via a custom migration in Task 3.5 (drizzle 0.45.2 cannot emit
 * those statements from schema declarations).
 */
export const sessions = authSchema.table(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
    pgPolicy('session_owner_isolation', {
      as: 'permissive',
      to: tenantUser,
      for: 'all',
      using: sql`${t.userId} = current_setting('app.user_id', true)::uuid`,
      withCheck: sql`${t.userId} = current_setting('app.user_id', true)::uuid`,
    }),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type UserIdentity = typeof userIdentities.$inferSelect
export type NewUserIdentity = typeof userIdentities.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
```

- [ ] File created.

### Task 3.3 — Delete the @seta/auth users + sessions schema (transfer ownership)

`@seta/auth` is unused (zero TS importers). PR-1 transfers `auth.users` + `auth.sessions` to `@seta/identity` cleanly per CLAUDE.md "delete old shape in same PR".

- [ ] Edit `platform/auth/src/schema.ts` to keep only the (still-unused) `api_keys` table:

```ts
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const auth = pgSchema('auth')

export const apiKeys = auth.table('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  hashedKey: text('hashed_key').notNull(),
  scopes: text('scopes').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})
```

- [ ] Delete the now-stale generated migration that creates `auth.users` and `auth.sessions`:

```sh
rm platform/auth/migrations/0000_brown_blonde_phantom.sql
rm -rf platform/auth/migrations/meta
```

- [ ] Re-generate `@seta/auth`'s baseline migration so it only emits `api_keys`:

```sh
pnpm --filter @seta/auth exec drizzle-kit generate --name baseline
```

Expected output line: `1 file created` and a new file at `platform/auth/migrations/0000_baseline.sql` (or similar drizzle-kit name).

- [ ] Inspect the generated SQL. It must contain `CREATE TABLE "auth"."api_keys"` and **must not** contain `CREATE TABLE "auth"."users"` or `CREATE TABLE "auth"."sessions"`.

### Task 3.4 — Generate the @seta/identity baseline migration

- [ ] Generate the migration from the Drizzle schema:

```sh
pnpm --filter @seta/identity exec drizzle-kit generate --name baseline
```

Expected output line: `1 file created` plus a new file `platform/sso/migrations/0000_baseline.sql`.

- [ ] Inspect the generated SQL. It must contain (substring matches):
  - `CREATE TABLE "auth"."users"` with columns `id`, `email`, `name`, `picture_url`, `primary_provider`, `created_at`, `updated_at`.
  - `CREATE TABLE "auth"."user_identities"` with columns `provider`, `subject`, `user_id`, `created_at` and the primary key on (`provider`, `subject`).
  - `CREATE TABLE "auth"."sessions"` with columns `id`, `user_id`, `expires_at`, `ip`, `user_agent`, `last_seen_at`, `created_at`.
  - `CREATE UNIQUE INDEX` on `auth.users (email)`.
  - `CREATE POLICY "session_owner_isolation" ON "auth"."sessions"`.
  - `ALTER TABLE "auth"."sessions" ENABLE ROW LEVEL SECURITY` (drizzle-kit emits ENABLE for any table that declares a `pgPolicy`).

### Task 3.5 — Custom migration: FORCE ROW LEVEL SECURITY + GRANT

drizzle-kit 0.31.10 cannot emit `FORCE ROW LEVEL SECURITY` or `GRANT` from schema. Append a custom migration (pattern from `platform/oauth/migrations/0001_security_hardening.sql`).

- [ ] Generate the custom-migration shell:

```sh
pnpm --filter @seta/identity exec drizzle-kit generate --custom --name security_hardening
```

Expected output line: `1 file created` plus a new file `platform/sso/migrations/0001_security_hardening.sql`.

- [ ] Overwrite the file contents (drizzle-kit emits an empty custom migration) with:

```sql
ALTER TABLE "auth"."sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."users" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."user_identities" TO "tenant_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."sessions" TO "tenant_user";
```

- [ ] Verify the file is exactly that content (no extra DDL).

### Task 3.6 — Register sso in @seta/db's OWNER_ORDER

The migration runner only runs owners listed in `OWNER_ORDER`. Add `sso` directly after `auth` so the baseline of `api_keys` from `@seta/auth` runs first, then the SSO-owned tables (`users`, `user_identities`, `sessions`) follow.

- [ ] Update `platform/db/src/migrate.ts`. Replace the `OWNER_ORDER` and `OWNER_PACKAGE_PATH` blocks with:

```ts
export const OWNER_ORDER = [
  'auth',
  'sso',
  'tenant',
  'directory',
  'oauth',
  'audit',
  'connector_ms365_directory',
  'connector_ms365_planner',
  'agent',
  'agent_memory',
  'agent_workflows',
] as const

export type Owner = (typeof OWNER_ORDER)[number]

const OWNER_PACKAGE_PATH: Record<Owner, string> = {
  auth: 'platform/auth/migrations',
  sso: 'platform/sso/migrations',
  tenant: 'platform/tenant/migrations',
  directory: 'platform/directory/migrations',
  oauth: 'platform/oauth/migrations',
  audit: 'platform/audit/migrations',
  connector_ms365_directory: 'modules/connectors/ms365-directory/migrations',
  connector_ms365_planner: 'modules/connectors/ms365-planner/migrations',
  agent: 'modules/products/agent/migrations',
  agent_memory: 'platform/agent/memory/migrations',
  agent_workflows: 'platform/agent/workflows/migrations',
}
```

- [ ] Update the existing co-located test `platform/db/src/migrate.test.ts` — replace the array comparison so `'sso'` lives directly after `'auth'`:

```ts
import { describe, expect, it } from 'vitest'
import { OWNER_ORDER } from './migrate'

describe('migration runner', () => {
  it('applies owners in dependency order', () => {
    expect([...OWNER_ORDER]).toEqual([
      'auth',
      'sso',
      'tenant',
      'directory',
      'oauth',
      'audit',
      'connector_ms365_directory',
      'connector_ms365_planner',
      'agent',
      'agent_memory',
      'agent_workflows',
    ])
  })

  it('places sso after auth', () => {
    const authIdx = OWNER_ORDER.indexOf('auth')
    const ssoIdx = OWNER_ORDER.indexOf('sso')
    expect(authIdx).toBeGreaterThanOrEqual(0)
    expect(ssoIdx).toBe(authIdx + 1)
  })

  it('places agent_memory after agent', () => {
    const agentIdx = OWNER_ORDER.indexOf('agent')
    const memIdx = OWNER_ORDER.indexOf('agent_memory')
    expect(agentIdx).toBeGreaterThanOrEqual(0)
    expect(memIdx).toBeGreaterThan(agentIdx)
  })

  it('places agent_workflows after agent_memory', () => {
    const memIdx = OWNER_ORDER.indexOf('agent_memory')
    const wfIdx = OWNER_ORDER.indexOf('agent_workflows')
    expect(memIdx).toBeGreaterThanOrEqual(0)
    expect(wfIdx).toBeGreaterThan(memIdx)
  })
})
```

- [ ] Run the test and expect it green:

```sh
pnpm --filter @seta/db test:unit
```

Expected output line: `Test Files  1 passed` and `Tests  4 passed`.

Commit:

```sh
git add platform/sso platform/auth/src/schema.ts platform/auth/migrations platform/db/src/migrate.ts platform/db/src/migrate.test.ts
git commit -m "feat(sso): drizzle schema for auth.users, auth.user_identities, auth.sessions"
```

---

## Phase 4 — Cookie HMAC helper (TDD)

### Task 4.1 — Write failing unit test for cookie HMAC sign/verify roundtrip

Create `platform/sso/src/cookie.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { signCookie, verifyCookie } from './cookie'

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('cookie HMAC', () => {
  it('signs then verifies a payload (roundtrip)', () => {
    const payload = 'session-id-abc'
    const signed = signCookie(payload, KEY)
    const verified = verifyCookie(signed, KEY)
    expect(verified).toBe(payload)
  })

  it('returns null on mutation of payload', () => {
    const signed = signCookie('session-id-abc', KEY)
    const tampered = signed.replace('session-id-abc', 'session-id-xyz')
    expect(verifyCookie(tampered, KEY)).toBeNull()
  })

  it('returns null on mutation of signature byte', () => {
    const signed = signCookie('session-id-abc', KEY)
    // Flip the last char of the base64url signature segment.
    const lastChar = signed[signed.length - 1] ?? 'A'
    const flipped = signed.slice(0, -1) + (lastChar === 'A' ? 'B' : 'A')
    expect(verifyCookie(flipped, KEY)).toBeNull()
  })

  it('returns null on malformed envelope (no dot)', () => {
    expect(verifyCookie('no-dot-here', KEY)).toBeNull()
  })

  it('returns null on empty payload', () => {
    expect(verifyCookie('', KEY)).toBeNull()
  })

  it('rejects verification when the HMAC key is wrong', () => {
    const signed = signCookie('session-id-abc', KEY)
    const wrongKey = 'f'.repeat(64)
    expect(verifyCookie(signed, wrongKey)).toBeNull()
  })
})
```

- [ ] Run the test and expect it to FAIL (file does not exist yet):

```sh
pnpm --filter @seta/identity test:unit
```

Expected output line: `FAIL  src/cookie.test.ts` and an `Error: Failed to load url ./cookie` (or similar resolution error).

### Task 4.2 — Implement cookie HMAC helper

Create `platform/sso/src/cookie.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Cookie envelope: `<base64url(payload)>.<base64url(hmac-sha256(payload, key))>`.
 * The key is hex-encoded (≥32 bytes / 64 hex chars). The payload is the opaque
 * session id (a uuid string); signCookie/verifyCookie are payload-agnostic and
 * can sign any short string (also used for the PKCE state cookie).
 */
export function signCookie(payload: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex')
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url')
  const mac = createHmac('sha256', key).update(payloadB64).digest('base64url')
  return `${payloadB64}.${mac}`
}

export function verifyCookie(signed: string, hexKey: string): string | null {
  if (!signed) return null
  const dot = signed.indexOf('.')
  if (dot < 1 || dot === signed.length - 1) return null
  const payloadB64 = signed.slice(0, dot)
  const macGiven = signed.slice(dot + 1)
  const key = Buffer.from(hexKey, 'hex')
  const macExpected = createHmac('sha256', key).update(payloadB64).digest('base64url')
  const a = Buffer.from(macGiven)
  const b = Buffer.from(macExpected)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null
  try {
    return Buffer.from(payloadB64, 'base64url').toString('utf8')
  } catch {
    return null
  }
}
```

- [ ] Run the test and expect green:

```sh
pnpm --filter @seta/identity test:unit -- cookie
```

Expected output line: `Test Files  1 passed` and `Tests  6 passed`.

Commit:

```sh
git add platform/sso/src/cookie.ts platform/sso/src/cookie.test.ts
git commit -m "feat(sso): cookie HMAC sign and verify helpers"
```

---

## Phase 5 — PKCE generator (TDD)

### Task 5.1 — Write failing unit test for PKCE generator

Create `platform/sso/src/pkce.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generatePkce } from './pkce'

describe('PKCE generator', () => {
  it('produces a code_verifier in the RFC 7636 charset [A-Za-z0-9-._~] of 43..128 chars', () => {
    const { verifier } = generatePkce()
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
  })

  it('produces a base64url-encoded S256 challenge (43 chars, no padding)', () => {
    const { challenge } = generatePkce()
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]{43}$/)
  })

  it('produces a different (verifier, challenge) on each call', () => {
    const a = generatePkce()
    const b = generatePkce()
    expect(a.verifier).not.toBe(b.verifier)
    expect(a.challenge).not.toBe(b.challenge)
  })

  it('challenge equals base64url(sha256(verifier))', async () => {
    const { createHash } = await import('node:crypto')
    const { verifier, challenge } = generatePkce()
    const expected = createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
  })
})
```

- [ ] Run and expect FAIL:

```sh
pnpm --filter @seta/identity test:unit -- pkce
```

Expected output line: `FAIL  src/pkce.test.ts`.

### Task 5.2 — Implement PKCE generator

Create `platform/sso/src/pkce.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto'

/**
 * RFC 7636 PKCE pair. verifier is 32 random bytes base64url-encoded → 43 chars
 * in the RFC 7636 charset. challenge = base64url(sha256(verifier)).
 */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}
```

- [ ] Run and expect green:

```sh
pnpm --filter @seta/identity test:unit -- pkce
```

Expected output line: `Test Files  1 passed` and `Tests  4 passed`.

Commit:

```sh
git add platform/sso/src/pkce.ts platform/sso/src/pkce.test.ts
git commit -m "feat(sso): PKCE S256 verifier and challenge generator"
```

---

## Phase 6 — Zod schemas (SessionUser, TenantSummary)

### Task 6.1 — Write the Zod schemas

Create `platform/sso/src/schemas.ts`:

```ts
import { z } from '@hono/zod-openapi'

export const SessionUser = z
  .object({
    id: z.uuid(),
    email: z.string().email(),
    name: z.string().min(1),
    pictureUrl: z.string().url().nullable(),
  })
  .openapi('SessionUser')

export type SessionUser = z.infer<typeof SessionUser>

/**
 * Per-tenant membership summary returned by /me. PR-1 returns an empty array
 * (tenant.tenant_members is populated by PR-4). The schema is defined here so
 * PR-4 only needs to add the row source — not the wire format.
 */
export const TenantSummary = z
  .object({
    id: z.uuid(),
    name: z.string().min(1),
    role: z.enum(['owner', 'admin', 'member']),
  })
  .openapi('TenantSummary')

export type TenantSummary = z.infer<typeof TenantSummary>

export const MeResponse = z
  .object({
    user: SessionUser,
    tenants: z.array(TenantSummary),
    csrfToken: z.string().min(1),
  })
  .openapi('MeResponse')

export type MeResponse = z.infer<typeof MeResponse>

export const LoginBody = z
  .object({
    returnTo: z.string().optional(),
  })
  .openapi('SsoLoginBody')

export const LoginResponse = z
  .object({
    url: z.string().url(),
  })
  .openapi('SsoLoginResponse')

export const ProviderParam = z.enum(['entra', 'google'])
```

- [ ] File created. No test required — these are pure Zod definitions and are covered by integration tests in Phase 11.

Commit:

```sh
git add platform/sso/src/schemas.ts
git commit -m "feat(sso): Zod schemas for SessionUser, TenantSummary, MeResponse"
```

---

## Phase 7 — SsoProvider interface + EntraSsoProvider + GoogleSsoProvider (TDD)

### Task 7.1 — Write the SsoProvider interface and OidcIdToken type

Create `platform/sso/src/provider.ts`:

```ts
/**
 * Decoded id_token claims after JWS verification by jose. Only the claims
 * @seta/identity reads are typed; other claims are dropped. picture and name are
 * optional in OIDC core; email is required by both Entra and Google for our
 * profile scope and is asserted here.
 */
export type OidcIdToken = {
  sub: string
  email: string
  name?: string
  picture?: string
  iss: string
  aud: string
}

export interface SsoProvider {
  readonly id: 'entra' | 'google'
  authorizeUrl(opts: { state: string; pkce: string; redirectUri: string }): string
  exchangeCode(opts: { code: string; pkce: string; redirectUri: string }): Promise<OidcIdToken>
}
```

- [ ] File created.

### Task 7.2 — Write failing unit test for EntraSsoProvider.authorizeUrl

Create `platform/sso/src/providers/entra.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { EntraSsoProvider } from './entra'

describe('EntraSsoProvider.authorizeUrl', () => {
  const provider = new EntraSsoProvider({
    clientId: 'entra-client',
    clientSecret: 'entra-secret',
    tenant: 'common',
  })

  it('builds an authorize URL with the required OIDC + PKCE query params', () => {
    const url = provider.authorizeUrl({
      state: 'state-abc',
      pkce: 'challenge-xyz',
      redirectUri: 'http://localhost:8080/sso/callback/entra',
    })
    const u = new URL(url)
    expect(u.origin).toBe('https://login.microsoftonline.com')
    expect(u.pathname).toBe('/common/oauth2/v2.0/authorize')
    expect(u.searchParams.get('client_id')).toBe('entra-client')
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:8080/sso/callback/entra')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('response_mode')).toBe('query')
    expect(u.searchParams.get('scope')).toBe('openid email profile')
    expect(u.searchParams.get('state')).toBe('state-abc')
    expect(u.searchParams.get('code_challenge')).toBe('challenge-xyz')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('uses configured tenant when not "common"', () => {
    const p = new EntraSsoProvider({ clientId: 'c', clientSecret: 's', tenant: 'my-tenant' })
    const url = p.authorizeUrl({
      state: 's',
      pkce: 'p',
      redirectUri: 'http://localhost/cb',
    })
    expect(new URL(url).pathname).toBe('/my-tenant/oauth2/v2.0/authorize')
  })
})
```

- [ ] Run and expect FAIL:

```sh
pnpm --filter @seta/identity test:unit -- entra
```

Expected output line: `FAIL  src/providers/entra.test.ts`.

### Task 7.3 — Implement EntraSsoProvider

Create `platform/sso/src/providers/entra.ts`:

```ts
import { ServiceUnavailable } from '@seta/middleware'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { OidcIdToken, SsoProvider } from '../provider'

export type EntraSsoConfig = {
  clientId: string
  clientSecret: string
  /** Entra tenant id, or 'common' / 'organizations' for the multi-tenant endpoint. */
  tenant: string
  /** Override for tests. Defaults to the global Entra discovery endpoint. */
  discoveryUrl?: string
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch
}

type Discovery = {
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  issuer: string
}

export class EntraSsoProvider implements SsoProvider {
  readonly id = 'entra' as const
  private discoveryCache: Discovery | null = null

  constructor(private readonly cfg: EntraSsoConfig) {}

  private get discoveryUrl(): string {
    return (
      this.cfg.discoveryUrl ??
      `https://login.microsoftonline.com/${this.cfg.tenant}/v2.0/.well-known/openid-configuration`
    )
  }

  private get fetchImpl(): typeof fetch {
    return this.cfg.fetchImpl ?? fetch
  }

  private async discover(): Promise<Discovery> {
    if (this.discoveryCache) return this.discoveryCache
    const res = await this.fetchImpl(this.discoveryUrl)
    if (!res.ok) throw new ServiceUnavailable(`Entra discovery failed: ${res.status}`)
    const json = (await res.json()) as Discovery
    this.discoveryCache = json
    return json
  }

  authorizeUrl(opts: { state: string; pkce: string; redirectUri: string }): string {
    const u = new URL(`https://login.microsoftonline.com/${this.cfg.tenant}/oauth2/v2.0/authorize`)
    u.searchParams.set('client_id', this.cfg.clientId)
    u.searchParams.set('redirect_uri', opts.redirectUri)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('response_mode', 'query')
    u.searchParams.set('scope', 'openid email profile')
    u.searchParams.set('state', opts.state)
    u.searchParams.set('code_challenge', opts.pkce)
    u.searchParams.set('code_challenge_method', 'S256')
    return u.toString()
  }

  async exchangeCode(opts: {
    code: string
    pkce: string
    redirectUri: string
  }): Promise<OidcIdToken> {
    const d = await this.discover()
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
      code_verifier: opts.pkce,
    })
    const res = await this.fetchImpl(d.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) throw new ServiceUnavailable(`Entra token exchange failed: ${res.status}`)
    const tok = (await res.json()) as { id_token?: string }
    if (!tok.id_token) throw new ServiceUnavailable('Entra token response missing id_token')

    const jwks = createRemoteJWKSet(new URL(d.jwks_uri))
    const { payload } = await jwtVerify(tok.id_token, jwks, {
      issuer: d.issuer,
      audience: this.cfg.clientId,
    })
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new ServiceUnavailable('Entra id_token missing sub or email')
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
      iss: typeof payload.iss === 'string' ? payload.iss : '',
      aud: this.cfg.clientId,
    }
  }
}
```

- [ ] Run and expect green:

```sh
pnpm --filter @seta/identity test:unit -- entra
```

Expected output line: `Test Files  1 passed` and `Tests  2 passed`.

### Task 7.4 — Write failing unit test for GoogleSsoProvider.authorizeUrl

Create `platform/sso/src/providers/google.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GoogleSsoProvider } from './google'

describe('GoogleSsoProvider.authorizeUrl', () => {
  const provider = new GoogleSsoProvider({
    clientId: 'google-client',
    clientSecret: 'google-secret',
  })

  it('builds an authorize URL with the required OIDC + PKCE query params', () => {
    const url = provider.authorizeUrl({
      state: 'state-abc',
      pkce: 'challenge-xyz',
      redirectUri: 'http://localhost:8080/sso/callback/google',
    })
    const u = new URL(url)
    expect(u.origin).toBe('https://accounts.google.com')
    expect(u.pathname).toBe('/o/oauth2/v2/auth')
    expect(u.searchParams.get('client_id')).toBe('google-client')
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:8080/sso/callback/google')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('scope')).toBe('openid email profile')
    expect(u.searchParams.get('state')).toBe('state-abc')
    expect(u.searchParams.get('code_challenge')).toBe('challenge-xyz')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
  })
})
```

- [ ] Run and expect FAIL.

### Task 7.5 — Implement GoogleSsoProvider

Create `platform/sso/src/providers/google.ts`:

```ts
import { ServiceUnavailable } from '@seta/middleware'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { OidcIdToken, SsoProvider } from '../provider'

export type GoogleSsoConfig = {
  clientId: string
  clientSecret: string
  /** Override for tests. Defaults to the Google discovery endpoint. */
  discoveryUrl?: string
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch
}

type Discovery = {
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  issuer: string
}

export class GoogleSsoProvider implements SsoProvider {
  readonly id = 'google' as const
  private discoveryCache: Discovery | null = null

  constructor(private readonly cfg: GoogleSsoConfig) {}

  private get discoveryUrl(): string {
    return this.cfg.discoveryUrl ?? 'https://accounts.google.com/.well-known/openid-configuration'
  }

  private get fetchImpl(): typeof fetch {
    return this.cfg.fetchImpl ?? fetch
  }

  private async discover(): Promise<Discovery> {
    if (this.discoveryCache) return this.discoveryCache
    const res = await this.fetchImpl(this.discoveryUrl)
    if (!res.ok) throw new ServiceUnavailable(`Google discovery failed: ${res.status}`)
    const json = (await res.json()) as Discovery
    this.discoveryCache = json
    return json
  }

  authorizeUrl(opts: { state: string; pkce: string; redirectUri: string }): string {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    u.searchParams.set('client_id', this.cfg.clientId)
    u.searchParams.set('redirect_uri', opts.redirectUri)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('scope', 'openid email profile')
    u.searchParams.set('state', opts.state)
    u.searchParams.set('code_challenge', opts.pkce)
    u.searchParams.set('code_challenge_method', 'S256')
    return u.toString()
  }

  async exchangeCode(opts: {
    code: string
    pkce: string
    redirectUri: string
  }): Promise<OidcIdToken> {
    const d = await this.discover()
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
      code_verifier: opts.pkce,
    })
    const res = await this.fetchImpl(d.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) throw new ServiceUnavailable(`Google token exchange failed: ${res.status}`)
    const tok = (await res.json()) as { id_token?: string }
    if (!tok.id_token) throw new ServiceUnavailable('Google token response missing id_token')

    const jwks = createRemoteJWKSet(new URL(d.jwks_uri))
    const { payload } = await jwtVerify(tok.id_token, jwks, {
      issuer: d.issuer,
      audience: this.cfg.clientId,
    })
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new ServiceUnavailable('Google id_token missing sub or email')
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
      iss: typeof payload.iss === 'string' ? payload.iss : '',
      aud: this.cfg.clientId,
    }
  }
}
```

- [ ] Run and expect green:

```sh
pnpm --filter @seta/identity test:unit -- google
```

Expected output line: `Test Files  1 passed` and `Tests  1 passed`.

Commit:

```sh
git add platform/sso/src/provider.ts platform/sso/src/providers
git commit -m "feat(sso): SsoProvider interface, EntraSsoProvider, GoogleSsoProvider"
```

---

## Phase 8 — CSRF token helper (TDD)

### Task 8.1 — Write failing unit test for CSRF token derivation

Create `platform/sso/src/csrf.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deriveCsrfToken } from './csrf'

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('deriveCsrfToken', () => {
  it('is deterministic for a given (sessionId, key) pair', () => {
    const a = deriveCsrfToken('session-1', KEY)
    const b = deriveCsrfToken('session-1', KEY)
    expect(a).toBe(b)
  })

  it('differs for different session ids', () => {
    expect(deriveCsrfToken('session-1', KEY)).not.toBe(deriveCsrfToken('session-2', KEY))
  })

  it('differs for different keys', () => {
    const otherKey = 'f'.repeat(64)
    expect(deriveCsrfToken('session-1', KEY)).not.toBe(deriveCsrfToken('session-1', otherKey))
  })

  it('produces a base64url string ≥ 32 chars', () => {
    const token = deriveCsrfToken('session-1', KEY)
    expect(token).toMatch(/^[A-Za-z0-9\-_]{32,}$/)
  })
})
```

- [ ] Run and expect FAIL:

```sh
pnpm --filter @seta/identity test:unit -- csrf
```

Expected output line: `FAIL  src/csrf.test.ts`.

### Task 8.2 — Implement deriveCsrfToken

Create `platform/sso/src/csrf.ts`:

```ts
import { createHmac } from 'node:crypto'

/**
 * Stateless CSRF token = HMAC-SHA256(sessionId, key, domainTag="csrf").
 * Returned by /me alongside the session cookie. Mirrored back by Studio in
 * X-CSRF-Token on state-changing requests; csrfMiddleware re-derives and
 * timing-safe-compares.
 */
export function deriveCsrfToken(sessionId: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex')
  return createHmac('sha256', key).update(`csrf:${sessionId}`).digest('base64url')
}
```

- [ ] Run and expect green:

```sh
pnpm --filter @seta/identity test:unit -- csrf
```

Expected output line: `Test Files  1 passed` and `Tests  4 passed`.

Commit:

```sh
git add platform/sso/src/csrf.ts platform/sso/src/csrf.test.ts
git commit -m "feat(sso): deterministic CSRF token derivation"
```

---

## Phase 9 — requireSession middleware (TDD)

### Task 9.1 — Write failing unit test for requireSession (unauth path)

Create `platform/sso/src/middleware.test.ts`:

```ts
import { onError, Unauthorized } from '@seta/middleware'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { Session } from './schema'
import { csrfMiddleware, requireSession, type SsoVariables } from './middleware'

const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const COOKIE_NAME = 'seta_sess'

type FakeStore = { get(id: string): Promise<Session | null> }

function makeApp(store: FakeStore) {
  const app = new Hono<{ Variables: SsoVariables }>().onError(onError)
  app.use(
    '*',
    requireSession({
      cookieName: COOKIE_NAME,
      hmacKey: HMAC_KEY,
      sessionStore: store,
    }),
  )
  app.get('/protected', (c) => c.json({ userId: c.get('userId'), sessionId: c.get('sessionId') }))
  return app
}

describe('requireSession', () => {
  it('returns 401 when no cookie is sent', async () => {
    const app = makeApp({ get: async () => null })
    const res = await app.request('/protected')
    expect(res.status).toBe(401)
  })

  it('returns 401 when cookie HMAC is invalid', async () => {
    const app = makeApp({ get: async () => null })
    const res = await app.request('/protected', {
      headers: { cookie: `${COOKIE_NAME}=tampered.signature` },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when session row does not exist', async () => {
    const { signCookie } = await import('./cookie')
    const cookie = signCookie('11111111-1111-1111-1111-111111111111', HMAC_KEY)
    const app = makeApp({ get: async () => null })
    const res = await app.request('/protected', {
      headers: { cookie: `${COOKIE_NAME}=${cookie}` },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when session has expired', async () => {
    const { signCookie } = await import('./cookie')
    const sessionId = '11111111-1111-1111-1111-111111111111'
    const cookie = signCookie(sessionId, HMAC_KEY)
    const app = makeApp({
      get: async () => ({
        id: sessionId,
        userId: '22222222-2222-2222-2222-222222222222',
        expiresAt: new Date(Date.now() - 1000),
        ip: null,
        userAgent: null,
        lastSeenAt: new Date(),
        createdAt: new Date(),
      }),
    })
    const res = await app.request('/protected', {
      headers: { cookie: `${COOKIE_NAME}=${cookie}` },
    })
    expect(res.status).toBe(401)
  })

  it('attaches userId and sessionId to context when cookie + session row are valid', async () => {
    const { signCookie } = await import('./cookie')
    const sessionId = '11111111-1111-1111-1111-111111111111'
    const userId = '22222222-2222-2222-2222-222222222222'
    const cookie = signCookie(sessionId, HMAC_KEY)
    const app = makeApp({
      get: async (id) => {
        if (id !== sessionId) return null
        return {
          id: sessionId,
          userId,
          expiresAt: new Date(Date.now() + 60_000),
          ip: null,
          userAgent: null,
          lastSeenAt: new Date(),
          createdAt: new Date(),
        }
      },
    })
    const res = await app.request('/protected', {
      headers: { cookie: `${COOKIE_NAME}=${cookie}` },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ userId, sessionId })
  })
})

describe('csrfMiddleware', () => {
  it('passes when X-CSRF-Token matches the session-derived token', async () => {
    const { deriveCsrfToken } = await import('./csrf')
    const sessionId = 'abc'
    const app = new Hono<{ Variables: SsoVariables }>().onError(onError)
    app.use('*', async (c, next) => {
      c.set('sessionId', sessionId)
      c.set('userId', 'user-1')
      await next()
    })
    app.use('*', csrfMiddleware({ hmacKey: HMAC_KEY }))
    app.post('/x', (c) => c.json({ ok: true }))
    const res = await app.request('/x', {
      method: 'POST',
      headers: { 'x-csrf-token': deriveCsrfToken(sessionId, HMAC_KEY) },
    })
    expect(res.status).toBe(200)
  })

  it('returns 401 when X-CSRF-Token is missing', async () => {
    const sessionId = 'abc'
    const app = new Hono<{ Variables: SsoVariables }>().onError(onError)
    app.use('*', async (c, next) => {
      c.set('sessionId', sessionId)
      c.set('userId', 'user-1')
      await next()
    })
    app.use('*', csrfMiddleware({ hmacKey: HMAC_KEY }))
    app.post('/x', (c) => c.json({ ok: true }))
    const res = await app.request('/x', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('returns 401 when X-CSRF-Token does not match', async () => {
    const sessionId = 'abc'
    const app = new Hono<{ Variables: SsoVariables }>().onError(onError)
    app.use('*', async (c, next) => {
      c.set('sessionId', sessionId)
      c.set('userId', 'user-1')
      await next()
    })
    app.use('*', csrfMiddleware({ hmacKey: HMAC_KEY }))
    app.post('/x', (c) => c.json({ ok: true }))
    const res = await app.request('/x', {
      method: 'POST',
      headers: { 'x-csrf-token': 'wrong-token' },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when no session has been attached to context', async () => {
    // Used as a defence-in-depth: csrfMiddleware mounts AFTER requireSession,
    // but if mounted alone (misconfig), it must still 401 instead of leaking.
    const app = new Hono<{ Variables: SsoVariables }>().onError(onError)
    app.use('*', csrfMiddleware({ hmacKey: HMAC_KEY }))
    app.post('/x', (c) => c.json({ ok: true }))
    const res = await app.request('/x', {
      method: 'POST',
      headers: { 'x-csrf-token': 'any' },
    })
    expect(res.status).toBe(401)
  })
})

// Suppress unused-import warning if onError or Unauthorized are not directly referenced
// by an assertion (they are imported for type-load behaviour).
void Unauthorized
```

- [ ] Run and expect FAIL.

### Task 9.2 — Implement requireSession and csrfMiddleware

Create `platform/sso/src/middleware.ts`:

```ts
import { Unauthorized } from '@seta/middleware'
import { logger } from '@seta/observability'
import { timingSafeEqual } from 'node:crypto'
import { getCookie } from 'hono/cookie'
import type { MiddlewareHandler } from 'hono'
import { verifyCookie } from './cookie'
import { deriveCsrfToken } from './csrf'
import type { Session } from './schema'

export type SsoVariables = {
  userId: string
  sessionId: string
}

export interface SessionStore {
  get(sessionId: string): Promise<Session | null>
}

export type RequireSessionOpts = {
  cookieName: string
  hmacKey: string
  sessionStore: SessionStore
}

export function requireSession(opts: RequireSessionOpts): MiddlewareHandler<{
  Variables: SsoVariables
}> {
  return async (c, next) => {
    const raw = getCookie(c, opts.cookieName)
    if (!raw) throw new Unauthorized('missing session cookie')
    const sessionId = verifyCookie(raw, opts.hmacKey)
    if (!sessionId) {
      logger.warn({ event: 'sso.cookie_invalid' }, '[sso] cookie HMAC verify failed')
      throw new Unauthorized('invalid session cookie')
    }
    const row = await opts.sessionStore.get(sessionId)
    if (!row) {
      logger.warn({ event: 'sso.session_not_found', sessionId }, '[sso] session row not found')
      throw new Unauthorized('session not found')
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      logger.warn({ event: 'sso.session_expired', sessionId }, '[sso] session expired')
      throw new Unauthorized('session expired')
    }
    c.set('sessionId', sessionId)
    c.set('userId', row.userId)
    await next()
  }
}

export type CsrfOpts = {
  hmacKey: string
}

export function csrfMiddleware(opts: CsrfOpts): MiddlewareHandler<{ Variables: SsoVariables }> {
  return async (c, next) => {
    const sessionId = c.get('sessionId')
    if (!sessionId) throw new Unauthorized('csrf: no session in context')
    const given = c.req.header('x-csrf-token')
    if (!given) throw new Unauthorized('csrf: missing token')
    const expected = deriveCsrfToken(sessionId, opts.hmacKey)
    const a = Buffer.from(given)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Unauthorized('csrf: token mismatch')
    }
    await next()
  }
}
```

- [ ] Run the unit tests and expect green:

```sh
pnpm --filter @seta/identity test:unit -- middleware
```

Expected output line: `Test Files  1 passed` and `Tests  9 passed`.

Commit:

```sh
git add platform/sso/src/middleware.ts platform/sso/src/middleware.test.ts
git commit -m "feat(sso): requireSession and csrfMiddleware"
```

---

## Phase 10 — createSsoRoutes factory

### Task 10.1 — Session store implementation against the auth.sessions table

Create `platform/sso/src/session-store.ts`:

```ts
import type { Sql } from 'postgres'
import type { Session } from './schema'
import type { SessionStore } from './middleware'

/**
 * Postgres-backed SessionStore. Reads bypass RLS because the session row is
 * how we *establish* the user identity; routes that read sessions must run
 * outside withTenant (the session row itself has no tenant). All writes
 * (insert / delete) go through the same pool — auth.sessions RLS policy
 * authorises by user_id, which is set by withTenant when used by callers.
 */
export function createSessionStore(sql: Sql): SessionStore & {
  insert(input: {
    id: string
    userId: string
    expiresAt: Date
    ip: string | null
    userAgent: string | null
  }): Promise<void>
  delete(sessionId: string): Promise<void>
} {
  return {
    async get(sessionId) {
      const rows = await sql<
        Array<{
          id: string
          user_id: string
          expires_at: Date
          ip: string | null
          user_agent: string | null
          last_seen_at: Date
          created_at: Date
        }>
      >`
        SELECT id, user_id, expires_at, ip, user_agent, last_seen_at, created_at
          FROM auth.sessions
         WHERE id = ${sessionId}
         LIMIT 1
      `
      const r = rows[0]
      if (!r) return null
      const row: Session = {
        id: r.id,
        userId: r.user_id,
        expiresAt: new Date(r.expires_at),
        ip: r.ip,
        userAgent: r.user_agent,
        lastSeenAt: new Date(r.last_seen_at),
        createdAt: new Date(r.created_at),
      }
      return row
    },
    async insert({ id, userId, expiresAt, ip, userAgent }) {
      await sql`
        INSERT INTO auth.sessions (id, user_id, expires_at, ip, user_agent)
        VALUES (${id}, ${userId}, ${expiresAt}, ${ip}, ${userAgent})
      `
    },
    async delete(sessionId) {
      await sql`DELETE FROM auth.sessions WHERE id = ${sessionId}`
    },
  }
}

export type PostgresSessionStore = ReturnType<typeof createSessionStore>
```

- [ ] File created.

### Task 10.2 — User upsert helper for the callback path

Create `platform/sso/src/users-repo.ts`:

```ts
import type { Sql } from 'postgres'

/**
 * Idempotent upsert keyed on (provider, subject). If a (provider, subject) row
 * already exists, returns the linked user. Else if a user with that email
 * exists (e.g., signed up via the other provider first), links the new
 * identity to that user. Else creates a fresh user + identity.
 */
export async function upsertUserByIdentity(
  sql: Sql,
  input: {
    provider: 'entra' | 'google'
    subject: string
    email: string
    name: string
    pictureUrl: string | null
  },
): Promise<{ id: string; email: string; name: string; pictureUrl: string | null }> {
  const linked = await sql<Array<{ id: string; email: string; name: string; picture_url: string | null }>>`
    SELECT u.id, u.email, u.name, u.picture_url
      FROM auth.user_identities i
      JOIN auth.users u ON u.id = i.user_id
     WHERE i.provider = ${input.provider} AND i.subject = ${input.subject}
     LIMIT 1
  `
  if (linked[0]) {
    return {
      id: linked[0].id,
      email: linked[0].email,
      name: linked[0].name,
      pictureUrl: linked[0].picture_url,
    }
  }

  const byEmail = await sql<Array<{ id: string; email: string; name: string; picture_url: string | null }>>`
    SELECT id, email, name, picture_url FROM auth.users WHERE email = ${input.email} LIMIT 1
  `
  if (byEmail[0]) {
    await sql`
      INSERT INTO auth.user_identities (provider, subject, user_id)
      VALUES (${input.provider}, ${input.subject}, ${byEmail[0].id})
    `
    return {
      id: byEmail[0].id,
      email: byEmail[0].email,
      name: byEmail[0].name,
      pictureUrl: byEmail[0].picture_url,
    }
  }

  const created = await sql<Array<{ id: string; email: string; name: string; picture_url: string | null }>>`
    INSERT INTO auth.users (email, name, picture_url, primary_provider)
    VALUES (${input.email}, ${input.name}, ${input.pictureUrl}, ${input.provider})
    RETURNING id, email, name, picture_url
  `
  const row = created[0]
  if (!row) throw new Error('auth.users insert returned no row')
  await sql`
    INSERT INTO auth.user_identities (provider, subject, user_id)
    VALUES (${input.provider}, ${input.subject}, ${row.id})
  `
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    pictureUrl: row.picture_url,
  }
}
```

- [ ] File created.

### Task 10.3 — Implement createSsoRoutes factory

Create `platform/sso/src/routes.ts`:

```ts
import { BadRequest, Unauthorized } from '@seta/middleware'
import { logger } from '@seta/observability'
import { z } from '@hono/zod-openapi'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Sql } from 'postgres'
import { signCookie, verifyCookie } from './cookie'
import { deriveCsrfToken } from './csrf'
import { csrfMiddleware, requireSession, type SsoVariables } from './middleware'
import { generatePkce } from './pkce'
import type { SsoProvider } from './provider'
import {
  LoginBody,
  LoginResponse,
  MeResponse,
  ProviderParam,
  type SessionUser,
  type TenantSummary,
} from './schemas'
import { createSessionStore } from './session-store'
import { upsertUserByIdentity } from './users-repo'

export type SsoRoutesDeps = {
  providers: { entra: SsoProvider; google: SsoProvider }
  sql: Sql
  sessionCookie: { name: string; hmacKey: string; ttlSec: number; secure: boolean }
  redirectBase: string
}

const STATE_COOKIE_TTL_SEC = 600
const STATE_COOKIE_NAME = 'seta_sso_state'

type StatePayload = {
  pkce: string
  returnTo: string
  provider: 'entra' | 'google'
  state: string
}

export function createSsoRoutes(deps: SsoRoutesDeps): Hono<{ Variables: SsoVariables }> {
  const store = createSessionStore(deps.sql)
  const app = new Hono<{ Variables: SsoVariables }>()

  app.post('/sso/login/:provider', async (c) => {
    const providerId = ProviderParam.parse(c.req.param('provider'))
    const provider = deps.providers[providerId]
    if (!provider) throw new BadRequest(`unknown provider '${providerId}'`)
    const body = LoginBody.parse(await c.req.json().catch(() => ({})))
    const returnTo = body.returnTo ?? '/'

    const { verifier, challenge } = generatePkce()
    const state = crypto.randomUUID()
    const payload: StatePayload = { pkce: verifier, returnTo, provider: providerId, state }
    const signed = signCookie(JSON.stringify(payload), deps.sessionCookie.hmacKey)

    setCookie(c, STATE_COOKIE_NAME, signed, {
      httpOnly: true,
      secure: deps.sessionCookie.secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: STATE_COOKIE_TTL_SEC,
    })

    const url = provider.authorizeUrl({
      state,
      pkce: challenge,
      redirectUri: `${deps.redirectBase}/sso/callback/${providerId}`,
    })
    logger.info({ event: 'sso.login_start', provider: providerId }, '[sso] login start')
    return c.json(LoginResponse.parse({ url }))
  })

  app.get('/sso/callback/:provider', async (c) => {
    const providerId = ProviderParam.parse(c.req.param('provider'))
    const provider = deps.providers[providerId]
    if (!provider) throw new BadRequest(`unknown provider '${providerId}'`)

    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!code || !state) throw new BadRequest('missing code or state')

    const stateCookie = getCookie(c, STATE_COOKIE_NAME)
    if (!stateCookie) throw new BadRequest('missing state cookie')
    const verified = verifyCookie(stateCookie, deps.sessionCookie.hmacKey)
    if (!verified) throw new BadRequest('state cookie invalid')

    const parsed = JSON.parse(verified) as StatePayload
    if (parsed.state !== state) throw new BadRequest('state mismatch')
    if (parsed.provider !== providerId) throw new BadRequest('state provider mismatch')

    const idToken = await provider.exchangeCode({
      code,
      pkce: parsed.pkce,
      redirectUri: `${deps.redirectBase}/sso/callback/${providerId}`,
    })

    const user = await upsertUserByIdentity(deps.sql, {
      provider: providerId,
      subject: idToken.sub,
      email: idToken.email,
      name: idToken.name ?? idToken.email,
      pictureUrl: idToken.picture ?? null,
    })

    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + deps.sessionCookie.ttlSec * 1000)
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const ua = c.req.header('user-agent') ?? null
    await store.insert({ id: sessionId, userId: user.id, expiresAt, ip, userAgent: ua })

    setCookie(c, deps.sessionCookie.name, signCookie(sessionId, deps.sessionCookie.hmacKey), {
      httpOnly: true,
      secure: deps.sessionCookie.secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: deps.sessionCookie.ttlSec,
    })
    deleteCookie(c, STATE_COOKIE_NAME, { path: '/' })

    logger.info(
      { event: 'sso.login_complete', userId: user.id, provider: providerId },
      '[sso] login complete',
    )
    return c.redirect(parsed.returnTo)
  })

  app.post(
    '/sso/logout',
    requireSession({
      cookieName: deps.sessionCookie.name,
      hmacKey: deps.sessionCookie.hmacKey,
      sessionStore: store,
    }),
    async (c) => {
      const sessionId = c.get('sessionId')
      await store.delete(sessionId)
      deleteCookie(c, deps.sessionCookie.name, { path: '/' })
      logger.info({ event: 'sso.logout', sessionId }, '[sso] logout')
      return c.json({ ok: true })
    },
  )

  app.get(
    '/me',
    requireSession({
      cookieName: deps.sessionCookie.name,
      hmacKey: deps.sessionCookie.hmacKey,
      sessionStore: store,
    }),
    async (c) => {
      const userId = c.get('userId')
      const sessionId = c.get('sessionId')
      const rows = await deps.sql<
        Array<{ id: string; email: string; name: string; picture_url: string | null }>
      >`SELECT id, email, name, picture_url FROM auth.users WHERE id = ${userId} LIMIT 1`
      const u = rows[0]
      if (!u) throw new Unauthorized('user not found')
      const user: SessionUser = {
        id: u.id,
        email: u.email,
        name: u.name,
        pictureUrl: u.picture_url,
      }
      const tenants: TenantSummary[] = []
      const csrfToken = deriveCsrfToken(sessionId, deps.sessionCookie.hmacKey)
      return c.json(MeResponse.parse({ user, tenants, csrfToken }))
    },
  )

  return app
}

// Re-export csrfMiddleware so consumers can mount it on their state-changing
// routes without a second import path.
export { csrfMiddleware }
// z import is required for Zod schema validation; mark the value as used.
void z
```

- [ ] File created.

Commit:

```sh
git add platform/sso/src/session-store.ts platform/sso/src/users-repo.ts platform/sso/src/routes.ts
git commit -m "feat(sso): createSsoRoutes factory with login, callback, logout, /me"
```

---

## Phase 11 — Integration tests (Postgres-backed)

These tests run against a real Postgres (`DATABASE_URL`) so the schema, RLS policies, and upsert logic are exercised end-to-end. They use a `MockSsoProvider` instead of hitting Entra/Google — `SsoProvider` is the seam (CLAUDE.md "fix the seam, never mock internal @seta/*" — `MockSsoProvider` is an in-package fake implementing the *public* interface, not a mock of `@seta/identity` internals).

### Task 11.1 — Write the MockSsoProvider fixture

Create `platform/sso/tests/integration/_mock-provider.ts`:

```ts
import type { OidcIdToken, SsoProvider } from '../../src/provider'

export class MockSsoProvider implements SsoProvider {
  readonly id: 'entra' | 'google'
  constructor(
    id: 'entra' | 'google',
    private readonly fixture: OidcIdToken,
  ) {
    this.id = id
  }

  authorizeUrl(opts: { state: string; pkce: string; redirectUri: string }): string {
    const u = new URL(`https://mock-${this.id}.test/authorize`)
    u.searchParams.set('state', opts.state)
    u.searchParams.set('code_challenge', opts.pkce)
    u.searchParams.set('redirect_uri', opts.redirectUri)
    return u.toString()
  }

  async exchangeCode(_opts: {
    code: string
    pkce: string
    redirectUri: string
  }): Promise<OidcIdToken> {
    return this.fixture
  }
}
```

- [ ] File created.

### Task 11.2 — Configure vitest to discover integration tests

Edit `platform/sso/vitest.config.ts` so it runs both co-located unit tests and `tests/integration/**`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@seta/identity',
    include: ['src/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Integration tests truncate auth.* tables; serialise files so one
    // file's beforeEach does not wipe another file's in-flight data.
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
```

- [ ] File updated.

### Task 11.3 — Write the routes integration test

Create `platform/sso/tests/integration/routes.test.ts`:

```ts
import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { signCookie } from '../../src/cookie'
import { createSsoRoutes } from '../../src/routes'
import { MockSsoProvider } from './_mock-provider'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const entraFixture = {
  sub: 'entra-sub-1',
  email: 'alice@example.com',
  name: 'Alice',
  picture: 'https://cdn.example/alice.png',
  iss: 'https://login.microsoftonline.com/common/v2.0',
  aud: 'entra-client',
}

function buildApp(sql: postgres.Sql) {
  const app = new Hono().onError(onError)
  const sso = createSsoRoutes({
    providers: {
      entra: new MockSsoProvider('entra', entraFixture),
      google: new MockSsoProvider('google', { ...entraFixture, sub: 'google-sub-1', iss: 'https://accounts.google.com' }),
    },
    sql,
    sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
    redirectBase: 'http://localhost:8080',
  })
  app.route('/', sso)
  return app
}

describe('createSsoRoutes (integration)', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

  beforeEach(async () => {
    await sql`TRUNCATE auth.sessions, auth.user_identities, auth.users CASCADE`
  })

  afterAll(async () => {
    await sql.end()
  })

  it('POST /sso/login/entra returns an authorize URL and sets a state cookie', async () => {
    const app = buildApp(sql)
    const res = await app.request('/sso/login/entra', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnTo: '/dashboard' }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { url: string }
    expect(json.url).toMatch(/^https:\/\/mock-entra\.test\/authorize/)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/seta_sso_state=/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
  })

  it('GET /sso/callback/entra exchanges code, upserts user, creates session, sets cookie, 302s', async () => {
    const app = buildApp(sql)
    const start = await app.request('/sso/login/entra', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnTo: '/dashboard' }),
    })
    const stateCookieRaw = (start.headers.get('set-cookie') ?? '').match(/seta_sso_state=([^;]+)/)?.[1]
    expect(stateCookieRaw).toBeDefined()
    const startUrl = new URL(((await start.json()) as { url: string }).url)
    const state = startUrl.searchParams.get('state') ?? ''

    const cbRes = await app.request(`/sso/callback/entra?code=fake-code&state=${state}`, {
      headers: { cookie: `seta_sso_state=${stateCookieRaw}` },
    })
    expect(cbRes.status).toBe(302)
    expect(cbRes.headers.get('location')).toBe('/dashboard')
    const cbCookie = cbRes.headers.get('set-cookie') ?? ''
    expect(cbCookie).toMatch(/seta_sess=/)

    const userRows = await sql<{ count: string }[]>`SELECT count(*)::text FROM auth.users WHERE email = ${entraFixture.email}`
    expect(userRows[0]?.count).toBe('1')
    const idRows = await sql<{ count: string }[]>`SELECT count(*)::text FROM auth.user_identities WHERE provider = 'entra' AND subject = ${entraFixture.sub}`
    expect(idRows[0]?.count).toBe('1')
    const sessRows = await sql<{ count: string }[]>`SELECT count(*)::text FROM auth.sessions`
    expect(sessRows[0]?.count).toBe('1')
  })

  it('GET /me without cookie returns 401', async () => {
    const app = buildApp(sql)
    const res = await app.request('/me')
    expect(res.status).toBe(401)
  })

  it('GET /me with valid cookie returns user + empty tenants + csrfToken', async () => {
    const app = buildApp(sql)
    const start = await app.request('/sso/login/entra', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const stateCookieRaw = (start.headers.get('set-cookie') ?? '').match(/seta_sso_state=([^;]+)/)?.[1] ?? ''
    const state = new URL(((await start.json()) as { url: string }).url).searchParams.get('state') ?? ''
    const cb = await app.request(`/sso/callback/entra?code=c&state=${state}`, {
      headers: { cookie: `seta_sso_state=${stateCookieRaw}` },
    })
    const sessCookieRaw = (cb.headers.get('set-cookie') ?? '').match(/seta_sess=([^;]+)/)?.[1] ?? ''

    const meRes = await app.request('/me', { headers: { cookie: `seta_sess=${sessCookieRaw}` } })
    expect(meRes.status).toBe(200)
    const me = (await meRes.json()) as { user: { email: string; name: string }; tenants: unknown[]; csrfToken: string }
    expect(me.user.email).toBe(entraFixture.email)
    expect(me.user.name).toBe(entraFixture.name)
    expect(me.tenants).toEqual([])
    expect(typeof me.csrfToken).toBe('string')
    expect(me.csrfToken.length).toBeGreaterThan(0)
  })

  it('POST /sso/logout deletes session row and /me subsequently returns 401', async () => {
    const app = buildApp(sql)
    const start = await app.request('/sso/login/entra', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const stateCookieRaw = (start.headers.get('set-cookie') ?? '').match(/seta_sso_state=([^;]+)/)?.[1] ?? ''
    const state = new URL(((await start.json()) as { url: string }).url).searchParams.get('state') ?? ''
    const cb = await app.request(`/sso/callback/entra?code=c&state=${state}`, {
      headers: { cookie: `seta_sso_state=${stateCookieRaw}` },
    })
    const sessCookieRaw = (cb.headers.get('set-cookie') ?? '').match(/seta_sess=([^;]+)/)?.[1] ?? ''

    const logoutRes = await app.request('/sso/logout', {
      method: 'POST',
      headers: { cookie: `seta_sess=${sessCookieRaw}` },
    })
    expect(logoutRes.status).toBe(200)

    const sessRows = await sql<{ count: string }[]>`SELECT count(*)::text FROM auth.sessions`
    expect(sessRows[0]?.count).toBe('0')

    const meRes = await app.request('/me', { headers: { cookie: `seta_sess=${sessCookieRaw}` } })
    expect(meRes.status).toBe(401)
  })

  it('callback links a second provider to the same user when email matches', async () => {
    const app = buildApp(sql)

    // First, log in via entra.
    const startA = await app.request('/sso/login/entra', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const stateCookieA = (startA.headers.get('set-cookie') ?? '').match(/seta_sso_state=([^;]+)/)?.[1] ?? ''
    const stateA = new URL(((await startA.json()) as { url: string }).url).searchParams.get('state') ?? ''
    await app.request(`/sso/callback/entra?code=c&state=${stateA}`, {
      headers: { cookie: `seta_sso_state=${stateCookieA}` },
    })

    // Then, log in via google with the same email.
    const startB = await app.request('/sso/login/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const stateCookieB = (startB.headers.get('set-cookie') ?? '').match(/seta_sso_state=([^;]+)/)?.[1] ?? ''
    const stateB = new URL(((await startB.json()) as { url: string }).url).searchParams.get('state') ?? ''
    await app.request(`/sso/callback/google?code=c&state=${stateB}`, {
      headers: { cookie: `seta_sso_state=${stateCookieB}` },
    })

    const userCount = await sql<{ count: string }[]>`SELECT count(*)::text FROM auth.users`
    expect(userCount[0]?.count).toBe('1')
    const idCount = await sql<{ count: string }[]>`SELECT count(*)::text FROM auth.user_identities`
    expect(idCount[0]?.count).toBe('2')
  })
})
```

- [ ] File created.

### Task 11.4 — Migrate the test database

Integration tests require the auth schema to exist. Apply migrations:

```sh
pnpm db:up
pnpm migrate
```

Expected output line: `applied: sso/0000_baseline` and `applied: sso/0001_security_hardening` (or similar dispatched-migration log lines).

- [ ] Confirm in psql:

```sh
psql "$DATABASE_URL" -c "\dt auth.*"
```

Expected output line includes a row for `auth | users | table | seta`, `auth | user_identities | table | seta`, `auth | sessions | table | seta`, and `auth | api_keys | table | seta`.

### Task 11.5 — Run the integration tests

```sh
pnpm --filter @seta/identity test:unit
```

Expected output line: `Test Files  7 passed` (cookie, pkce, csrf, middleware, entra provider, google provider, routes integration) and `Tests  32 passed`.

Commit:

```sh
git add platform/sso/tests platform/sso/vitest.config.ts
git commit -m "test(sso): integration tests for login, callback, /me, logout, provider linking"
```

---

## Phase 12 — Public exports and README

### Task 12.1 — Wire up the package index

Replace `platform/sso/src/index.ts`:

```ts
export type { Session, NewSession, User, NewUser, UserIdentity, NewUserIdentity } from './schema'
export { users, userIdentities, sessions, authSchema } from './schema'
export type { OidcIdToken, SsoProvider } from './provider'
export type { EntraSsoConfig } from './providers/entra'
export { EntraSsoProvider } from './providers/entra'
export type { GoogleSsoConfig } from './providers/google'
export { GoogleSsoProvider } from './providers/google'
export type { SessionStore, SsoVariables, RequireSessionOpts, CsrfOpts } from './middleware'
export { csrfMiddleware, requireSession } from './middleware'
export { signCookie, verifyCookie } from './cookie'
export { generatePkce } from './pkce'
export { deriveCsrfToken } from './csrf'
export type { SsoRoutesDeps } from './routes'
export { createSsoRoutes } from './routes'
export type { MeResponse, SessionUser, TenantSummary } from './schemas'
export { LoginBody, LoginResponse, MeResponse as MeResponseSchema, ProviderParam, SessionUser as SessionUserSchema, TenantSummary as TenantSummarySchema } from './schemas'
export { createSessionStore } from './session-store'
export type { PostgresSessionStore } from './session-store'
export { upsertUserByIdentity } from './users-repo'
```

- [ ] File replaced. Delete the scaffolded `src/index.test.ts` placeholder created by `pnpm new:package`:

```sh
rm platform/sso/src/index.test.ts
```

### Task 12.2 — Write platform/sso/README.md

Create `platform/sso/README.md`:

```markdown
# @seta/identity

OIDC + PKCE single sign-on for Seta. Owns the `auth.users`, `auth.user_identities`, and `auth.sessions` tables; mints HMAC-signed opaque session cookies; exposes `requireSession`, `csrfMiddleware`, and the `createSsoRoutes` factory.

## Boundary

`@seta/identity` is a `platform/*` package — framework primitives, vendor-neutral.

- **Depends on:** `@seta/db`, `@seta/middleware`, `@seta/observability`, `@seta/tenant` (type-only — for the `TenantSummary` shape returned by `/me`).
- **Does not depend on:** `@seta/auth` (argon2 / local credentials, separate package), `@seta/oauth` (vendor token vault, separate package), MSAL, model SDKs, any `modules/*`.

## Public interface

```ts
import {
  createSsoRoutes,
  EntraSsoProvider,
  GoogleSsoProvider,
  requireSession,
  csrfMiddleware,
  type SessionUser,
  type TenantSummary,
} from '@seta/identity'
```

- `createSsoRoutes(opts)` returns a `Hono` app exposing `POST /sso/login/:provider`, `GET /sso/callback/:provider`, `POST /sso/logout`, `GET /me`.
- `requireSession({ cookieName, hmacKey, sessionStore })` is a `MiddlewareHandler` that 401s on missing/invalid/expired sessions and attaches `userId` + `sessionId` to the Hono context.
- `csrfMiddleware({ hmacKey })` is a `MiddlewareHandler` that 401s when `X-CSRF-Token` does not match `HMAC(sessionId, "csrf", hmacKey)`. Mount after `requireSession`.

## Owned schema

- `auth.users(id, email UNIQUE, name, picture_url, primary_provider, created_at, updated_at)` — one row per human, tenant-agnostic.
- `auth.user_identities(provider, subject, user_id, created_at)` — primary key on `(provider, subject)`, cross-provider linking.
- `auth.sessions(id, user_id, expires_at, ip, user_agent, last_seen_at, created_at)` — opaque session, RLS-enforced via `current_setting('app.user_id', true)::uuid`.

## Tenant membership

`/me` returns `tenants: []` in PR-1. PR-4 introduces `tenant.tenant_members(user_id, tenant_id, role)` (owned by `@seta/tenant`) and populates the array there.

## Test strategy

- Unit tests co-located in `src/**/*.test.ts`.
- Integration tests in `tests/integration/**`, require `DATABASE_URL` and the SSO migrations applied via `pnpm migrate`.
- No live IdP calls; integration tests inject a `MockSsoProvider`.
```

- [ ] File created.

### Task 12.3 — Confirm tsup builds cleanly

- [ ] Run the build and expect exit code 0:

```sh
pnpm --filter @seta/identity build
```

Expected output line: `ESM dist/index.js` (or similar tsup output) followed by `Build success`.

- [ ] Run typecheck and expect exit code 0:

```sh
pnpm --filter @seta/identity typecheck
```

Expected output line: no output on success, exit code 0.

Commit:

```sh
git add platform/sso/src/index.ts platform/sso/README.md
git commit -m "feat(sso): public exports and package README"
```

---

## Phase 13 — Final verification

### Task 13.1 — Run the full @seta/identity suite

- [ ] Run every test in the package:

```sh
pnpm --filter @seta/identity test:unit
```

Expected output line: `Test Files  7 passed (7)` and `Tests  32 passed (32)`.

### Task 13.2 — Run repo-wide typecheck and lint

- [ ] Confirm no other package broke:

```sh
pnpm typecheck
```

Expected output line: `Tasks: <N> successful, <N> total` (turbo summary) with exit code 0.

```sh
pnpm lint
```

Expected output line: `Checked <N> files in <ms>ms. No fixes applied.` (Biome) with exit code 0.

### Task 13.3 — Verify boundary CI guard

The `check-no-manual-pkg-edit.ts` CI guard fails non-whitelisted `package.json` diffs without a matching lockfile diff. Every dependency in this PR was added via `pnpm --filter @seta/identity add` (Tasks 2.1, 2.2). Confirm:

```sh
git diff --stat HEAD~12 -- platform/sso/package.json pnpm-lock.yaml
```

Expected output line includes both `platform/sso/package.json` AND `pnpm-lock.yaml` (the guard requires they co-vary).

### Task 13.4 — Demo state confirmation

- [ ] No `apps/api` change in this PR — `createSsoRoutes` is not yet mounted (PR-2 does that). The demo state for PR-1 is:

```sh
pnpm --filter @seta/identity test:unit
```

passes green with 7 test files and 32 tests, and the package exports `createSsoRoutes`, `EntraSsoProvider`, `GoogleSsoProvider`, `requireSession`, `csrfMiddleware`, `SessionUser`, `TenantSummary`.

- [ ] Verify the public API surface by importing from a one-shot file:

```sh
pnpm --filter @seta/identity exec node --input-type=module -e "import { createSsoRoutes, EntraSsoProvider, GoogleSsoProvider, requireSession, csrfMiddleware } from '@seta/identity'; console.log('exports ok', typeof createSsoRoutes, typeof EntraSsoProvider, typeof GoogleSsoProvider, typeof requireSession, typeof csrfMiddleware)"
```

Expected output line: `exports ok function function function function function`.

---

## Out of scope (deferred to later PRs)

- Mounting `createSsoRoutes` in `apps/api/src/main.ts` and adding `ENTRA_CLIENT_ID`/`GOOGLE_CLIENT_ID`/`SESSION_HMAC_KEY` to `apps/api/src/env.ts` — **PR-2**.
- `tenant.tenant_members` schema + `/me` returning real tenant array — **PR-4** (`@seta/tenant`).
- Studio `/login` UI consuming `POST /sso/login/:provider` — **PR-3**.
- Connecting `csrfMiddleware` to state-changing routes — done at each route's owning PR (PR-4 onwards).

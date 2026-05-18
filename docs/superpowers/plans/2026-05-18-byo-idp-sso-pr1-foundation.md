# Per-tenant Entra SSO — PR 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-Entra-app SSO with per-tenant Entra app configuration loaded from DB. Login works end-to-end on the new model via email-first tenant discovery. Operators manage SSO via SQL until PR 2 ships the admin UI.

**Architecture:**
- New `auth.sso_configs` (per-tenant SSO config), `auth.sso_email_domains` (domain→tenant index), and `auth.magic_links` (table only — routes ship in PR 4) live in the `auth` schema owned by `@seta/identity`.
- `EntraSsoProvider` becomes per-request: a factory loads the row, decrypts the client secret from the existing KMS-backed `oauth.oauth_tokens` vault, builds a tenant-specific authority URL.
- User-facing routes: `POST /sso/discover`, `POST /sso/start`, `GET /sso/callback/entra`. The old `POST /sso/login/:provider` is deleted with no compat shim.
- Frontend `LoginPage` becomes 2-state: email-entry → (after callback success) one-click "Continue as …" via a signed (non-session) `seta_last_login` cookie.
- Env vars rename to make "platform connector OAuth" vs "tenant SSO" explicit. Google provider is removed entirely; the design's discriminated-union shape keeps it addable later.

**Tech Stack:** TypeScript ESM, Hono, Drizzle ORM, Zod (`@hono/zod-openapi`), `postgres` driver, `jose` for JWT verification, MSW for HTTP fixtures, Vitest, React (`@seta/ui` + `@seta/identity-client`), pnpm workspaces.

**Spec:** [`docs/superpowers/specs/2026-05-18-byo-idp-sso-design.md`](../specs/2026-05-18-byo-idp-sso-design.md). Read the **Decisions**, **Data model**, **Login flow**, and **Last-login hint** sections before starting.

**Operating rules (from CLAUDE.md):**
- Never hand-edit `package.json` (except metadata fields) or `migrations/*.sql` from a generated path. Use `pnpm` and `drizzle-kit`.
- `import type` for type-only imports.
- ESM only; no path aliases; relative imports do not carry `.js` extensions.
- One change, one PR. Squash merges. Conventional Commits.
- No `console.log` outside CLI; use `logger` from `@seta/observability`.

---

## File Map

**Create**
- `platform/identity/src/schema/sso-configs.ts` — Drizzle table for `auth.sso_configs`
- `platform/identity/src/schema/sso-email-domains.ts` — Drizzle table for `auth.sso_email_domains`
- `platform/identity/src/schema/magic-links.ts` — Drizzle table for `auth.magic_links` (no routes yet; just the table)
- `platform/identity/migrations/0003_sso_byo_idp.sql` — drizzle-kit `generate` output (table DDL)
- `platform/identity/migrations/0004_sso_rls.sql` — drizzle-kit `generate --custom` (RLS policies + grants)
- `platform/identity/src/sso-domain-denylist.ts` — code constant: catch-all public domains
- `platform/identity/src/sso-domain-denylist.test.ts`
- `platform/identity/src/sso-config-schema.ts` — Zod discriminated union for `provider`+`config`
- `platform/identity/src/sso-config-schema.test.ts`
- `platform/identity/src/sso-config-repo.ts` — DB access: `getByTenantId`, `resolveByEmail`
- `platform/identity/src/sso-config-repo.test.ts` (unit; pure)
- `platform/identity/tests/integration/sso-config-repo.test.ts` (DB integration)
- `platform/identity/src/providers/entra-factory.ts` — `ssoProviderFor(row, secret)` factory + `Unreachable` helper
- `platform/identity/src/providers/entra-factory.test.ts`
- `platform/identity/src/last-login.ts` — set/read/clear `seta_last_login` cookie
- `platform/identity/src/last-login.test.ts`
- `platform/identity/tests/integration/sso-discover.test.ts`
- `platform/identity/tests/integration/sso-start.test.ts`
- `platform/identity/tests/integration/sso-callback.test.ts`
- `platform/identity-client/src/LastLoginHint.ts` — client-side reader
- `platform/identity-client/src/LastLoginHint.test.ts`

**Modify**
- `platform/identity/drizzle.config.ts` — already `schemaFilter: ['auth']`; no change needed
- `platform/identity/src/schema/index.ts` — export the three new tables
- `platform/identity/src/schemas.ts` — drop `ProviderParam` `.enum(['entra','google'])` Google option; add `DiscoverBody`, `DiscoverResponse`, `StartBody`, `StartResponse` Zod schemas
- `platform/identity/src/providers/entra.ts` — `EntraSsoConfig` drops `tenant` field, adds `entraTenantId`; constructor accepts `clientSecret` per-instance (already does); `authorizeUrl` adds optional `loginHint`
- `platform/identity/src/routes.ts` — REWRITE: replace `POST /sso/login/:provider` with `POST /sso/discover`, `POST /sso/start`, `GET /sso/callback/entra`; remove Google branch; set `seta_last_login` on callback success
- `platform/identity/src/index.ts` — drop Google exports; add new exports (`ssoProviderFor`, last-login helpers, repo)
- `platform/identity/tests/integration/routes.test.ts` — REWRITE entirely against new routes
- `platform/identity/tests/integration/_mock-provider.ts` — keep, adapt for new factory contract (used as a stand-in for `EntraSsoProvider` in tests)
- `platform/identity-client/src/signIn.ts` — REWRITE: `discover` + `start` functions; export `requestLastLoginHint` (no-op signature for callers)
- `platform/identity-client/src/signIn.test.ts` — adjust to new API
- `platform/identity-client/src/LoginPage.tsx` — 2-state UI: email-entry vs "Continue as …" (reads last-login cookie)
- `platform/identity-client/src/LoginPage.test.tsx` — both states tested
- `platform/identity-client/src/index.ts` — re-export new names
- `apps/api/src/env.ts` — delete `ENTRA_SSO_TENANT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SSO_ENTRA_ENABLED`, `SSO_GOOGLE_ENABLED`; rename `ENTRA_CLIENT_ID/SECRET` → `PLATFORM_CONNECTOR_CLIENT_ID/SECRET`
- `apps/api/src/main.ts` — rename `entra` → `platformConnectorOAuth`; drop `entraSso`/`googleSso`; rewire `createSsoRoutes` against new factory; inject `sso-config-repo`
- `apps/api/tests/integration/sso.test.ts` — replace with smoke covering the new routes
- `tooling/scripts/seed-first-tenant.ts` — env renames; add SSO config + email domain inserts; vault.put for SSO secret
- `tooling/scripts/_env.ts` — if anything references the renamed env vars, update
- `.env.example` — drop, rename, add per spec
- `docs/QUICKSTART.md` — update env section

**Delete**
- `platform/identity/src/providers/google.ts`
- `platform/identity/src/providers/google.test.ts`
- Any references to `GoogleSsoProvider`, `GoogleSsoConfig`, `SSO_GOOGLE_ENABLED`, `SSO_ENTRA_ENABLED`, `ENTRA_SSO_TENANT` anywhere outside test fixtures

---

## Phase A — Schema and migrations

### Task A1: Drizzle schema files for the three new tables

**Files:**
- Create: `platform/identity/src/schema/sso-configs.ts`
- Create: `platform/identity/src/schema/sso-email-domains.ts`
- Create: `platform/identity/src/schema/magic-links.ts`
- Modify: `platform/identity/src/schema/index.ts`

- [ ] **Step 1: Create `platform/identity/src/schema/sso-configs.ts`**

```ts
import { boolean, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authSchema } from './users'

export const ssoConfigs = authSchema.table(
  'sso_configs',
  {
    tenantId: uuid('tenant_id').notNull(),
    provider: text('provider').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    secretVaultId: text('secret_vault_id'),
    enabled: boolean('enabled').notNull().default(true),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.provider] })],
)

export type SsoConfigRow = typeof ssoConfigs.$inferSelect
export type NewSsoConfigRow = typeof ssoConfigs.$inferInsert
```

Note on FK: we do NOT add `references(() => tenants.id)` here because `tenant.tenants` lives in a different schema-per-module (`@seta/tenancy`), and CLAUDE.md says "no cross-schema FKs". App-level integrity is enough; the tenant_id is also referenced from `tenant_members` already.

- [ ] **Step 2: Create `platform/identity/src/schema/sso-email-domains.ts`**

```ts
import { text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authSchema } from './users'

export const ssoEmailDomains = authSchema.table('sso_email_domains', {
  domain: text('domain').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type SsoEmailDomainRow = typeof ssoEmailDomains.$inferSelect
export type NewSsoEmailDomainRow = typeof ssoEmailDomains.$inferInsert
```

- [ ] **Step 3: Create `platform/identity/src/schema/magic-links.ts`**

```ts
import { customType, inet, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authSchema } from './users'

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
})

export const magicLinks = authSchema.table('magic_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  tokenHash: bytea('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  requestedIp: inet('requested_ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type MagicLinkRow = typeof magicLinks.$inferSelect
export type NewMagicLinkRow = typeof magicLinks.$inferInsert
```

- [ ] **Step 4: Modify `platform/identity/src/schema/index.ts` to re-export the new tables**

Open the file and add the three new exports at the bottom (keep existing exports unchanged):

```ts
export * from './sso-configs'
export * from './sso-email-domains'
export * from './magic-links'
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @seta/identity typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add platform/identity/src/schema/sso-configs.ts \
        platform/identity/src/schema/sso-email-domains.ts \
        platform/identity/src/schema/magic-links.ts \
        platform/identity/src/schema/index.ts
git commit -m "feat(identity): add Drizzle tables for sso_configs, sso_email_domains, magic_links"
```

### Task A2: Generate the table migration

**Files:**
- Create: `platform/identity/migrations/0003_<auto-name>.sql` (drizzle-kit names it)
- Create: `platform/identity/migrations/meta/0003_snapshot.json` (drizzle-kit writes)

- [ ] **Step 1: Run drizzle-kit generate**

Run from repo root: `pnpm --filter @seta/identity exec drizzle-kit generate --name sso_byo_idp`
Expected: writes a new SQL file in `platform/identity/migrations/` numbered `0003_*.sql` and updates the meta snapshot.

- [ ] **Step 2: Inspect the generated SQL**

Open `platform/identity/migrations/0003_*.sql`. It must contain three `CREATE TABLE` statements for `auth.sso_configs`, `auth.sso_email_domains`, `auth.magic_links` and one composite PK constraint. Do not hand-edit it.

- [ ] **Step 3: Apply migrations against the dev DB**

Run: `pnpm db:up && pnpm migrate`
Expected: migration runs without error.

- [ ] **Step 4: Verify tables exist**

Run: `psql "$DATABASE_URL" -c "\dt auth.*"` (or use the connection string from your `.env`).
Expected: `auth.sso_configs`, `auth.sso_email_domains`, `auth.magic_links` listed.

- [ ] **Step 5: Commit**

```bash
git add platform/identity/migrations/0003_*.sql \
        platform/identity/migrations/meta/0003_snapshot.json \
        platform/identity/migrations/meta/_journal.json
git commit -m "feat(identity): generate sso_byo_idp migration"
```

### Task A3: Custom RLS migration

**Files:**
- Create: `platform/identity/migrations/0004_sso_rls.sql`

- [ ] **Step 1: Generate the custom migration file**

Run: `pnpm --filter @seta/identity exec drizzle-kit generate --custom --name sso_rls`
Expected: writes a blank `0004_sso_rls.sql` and updates the journal.

- [ ] **Step 2: Fill in the RLS policies**

Open `platform/identity/migrations/0004_sso_rls.sql` (the only file in this repo where editing SQL by hand is permitted — it was created via `--custom`). Add:

```sql
-- sso_configs
ALTER TABLE auth.sso_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.sso_configs FORCE ROW LEVEL SECURITY;
CREATE POLICY sso_configs_tenant ON auth.sso_configs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.sso_configs TO tenant_user;

-- sso_email_domains
ALTER TABLE auth.sso_email_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.sso_email_domains FORCE ROW LEVEL SECURITY;
-- domain lookup must work BEFORE we know the tenant; we expose it via a
-- SECURITY DEFINER function rather than a policy that bypasses RLS for
-- arbitrary callers.
CREATE POLICY sso_email_domains_tenant ON auth.sso_email_domains
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.sso_email_domains TO tenant_user;

-- Lookup function used by /sso/discover (no tenant set yet at that point).
-- SECURITY DEFINER lets it bypass RLS, but it returns only the tenant_id
-- and provider — nothing tenant-private.
CREATE OR REPLACE FUNCTION auth.resolve_sso_by_domain(p_domain text)
RETURNS TABLE(tenant_id uuid, provider text, enabled boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, pg_temp
AS $$
  SELECT c.tenant_id, c.provider, c.enabled
  FROM auth.sso_email_domains d
  JOIN auth.sso_configs c
    ON c.tenant_id = d.tenant_id AND c.enabled
  WHERE d.domain = lower(p_domain)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION auth.resolve_sso_by_domain(text) FROM public;
GRANT EXECUTE ON FUNCTION auth.resolve_sso_by_domain(text) TO tenant_user;

-- magic_links
ALTER TABLE auth.magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.magic_links FORCE ROW LEVEL SECURITY;
CREATE POLICY magic_links_tenant ON auth.magic_links
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.magic_links TO tenant_user;
```

- [ ] **Step 3: Apply migration**

Run: `pnpm migrate`
Expected: migration runs without error.

- [ ] **Step 4: Verify RLS active**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables JOIN pg_class ON relname=tablename WHERE schemaname='auth' AND tablename IN ('sso_configs','sso_email_domains','magic_links');"
```
Expected: three rows, all with `t  | t` in the boolean columns.

- [ ] **Step 5: Verify the resolver function**

Run: `psql "$DATABASE_URL" -c "SELECT * FROM auth.resolve_sso_by_domain('nonexistent.example');"`
Expected: zero rows, no error.

- [ ] **Step 6: Commit**

```bash
git add platform/identity/migrations/0004_sso_rls.sql \
        platform/identity/migrations/meta/_journal.json
git commit -m "feat(identity): RLS + resolver function for SSO tables"
```

---

## Phase B — Domain primitives (pure logic, TDD)

### Task B1: Email-domain denylist constant

**Files:**
- Create: `platform/identity/src/sso-domain-denylist.ts`
- Test: `platform/identity/src/sso-domain-denylist.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// platform/identity/src/sso-domain-denylist.test.ts
import { describe, expect, it } from 'vitest'
import { isDeniedSsoEmailDomain, normalizeEmailDomain } from './sso-domain-denylist'

describe('normalizeEmailDomain', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmailDomain(' Acme.COM ')).toBe('acme.com')
  })
  it('strips a single trailing dot', () => {
    expect(normalizeEmailDomain('acme.com.')).toBe('acme.com')
  })
  it('returns null for invalid hostnames', () => {
    expect(normalizeEmailDomain('not a domain')).toBeNull()
    expect(normalizeEmailDomain('')).toBeNull()
  })
})

describe('isDeniedSsoEmailDomain', () => {
  it('rejects common public mail providers', () => {
    expect(isDeniedSsoEmailDomain('gmail.com')).toBe(true)
    expect(isDeniedSsoEmailDomain('outlook.com')).toBe(true)
    expect(isDeniedSsoEmailDomain('yahoo.com')).toBe(true)
  })
  it('allows corporate domains', () => {
    expect(isDeniedSsoEmailDomain('acme.com')).toBe(false)
    expect(isDeniedSsoEmailDomain('seta-international.vn')).toBe(false)
  })
  it('normalizes before checking', () => {
    expect(isDeniedSsoEmailDomain(' GMAIL.com ')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @seta/identity vitest run src/sso-domain-denylist.test.ts`
Expected: FAIL ("Cannot find module './sso-domain-denylist'").

- [ ] **Step 3: Implement**

```ts
// platform/identity/src/sso-domain-denylist.ts
export const SSO_EMAIL_DOMAIN_DENYLIST = new Set<string>([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com',
  'aol.com', 'gmx.com', 'mail.com',
  'qq.com', '163.com',
])

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

export function normalizeEmailDomain(input: string): string | null {
  if (typeof input !== 'string') return null
  let d = input.trim().toLowerCase()
  if (d.endsWith('.')) d = d.slice(0, -1)
  if (!DOMAIN_RE.test(d)) return null
  return d
}

export function isDeniedSsoEmailDomain(input: string): boolean {
  const d = normalizeEmailDomain(input)
  if (!d) return true
  return SSO_EMAIL_DOMAIN_DENYLIST.has(d)
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @seta/identity vitest run src/sso-domain-denylist.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/identity/src/sso-domain-denylist.ts platform/identity/src/sso-domain-denylist.test.ts
git commit -m "feat(identity): email-domain denylist + normalization"
```

### Task B2: SSO config Zod schema (discriminated union)

**Files:**
- Create: `platform/identity/src/sso-config-schema.ts`
- Test: `platform/identity/src/sso-config-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// platform/identity/src/sso-config-schema.test.ts
import { describe, expect, it } from 'vitest'
import { SsoConfigDiscriminated, parseSsoConfig } from './sso-config-schema'

describe('parseSsoConfig (entra)', () => {
  it('parses a valid entra row', () => {
    const r = parseSsoConfig({
      provider: 'entra',
      config: { entra_tenant_id: '11111111-2222-3333-4444-555555555555', client_id: 'abc' },
    })
    expect(r.provider).toBe('entra')
    expect(r.config.entra_tenant_id).toMatch(/^[0-9a-f-]+$/)
  })

  it('rejects missing entra_tenant_id', () => {
    expect(() =>
      parseSsoConfig({ provider: 'entra', config: { client_id: 'abc' } }),
    ).toThrow()
  })

  it('rejects unknown provider', () => {
    expect(() =>
      parseSsoConfig({ provider: 'okta', config: {} } as never),
    ).toThrow()
  })
})

describe('SsoConfigDiscriminated', () => {
  it('exposes provider as the discriminator', () => {
    const parsed = SsoConfigDiscriminated.safeParse({
      provider: 'entra',
      config: { entra_tenant_id: 't', client_id: 'c' },
    })
    expect(parsed.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @seta/identity vitest run src/sso-config-schema.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// platform/identity/src/sso-config-schema.ts
import { z } from '@hono/zod-openapi'

export const EntraConfig = z.object({
  entra_tenant_id: z.string().min(1),
  client_id: z.string().min(1),
})
export type EntraConfig = z.infer<typeof EntraConfig>

export const SsoConfigDiscriminated = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('entra'), config: EntraConfig }),
])
export type SsoConfigDiscriminated = z.infer<typeof SsoConfigDiscriminated>

export function parseSsoConfig(input: unknown): SsoConfigDiscriminated {
  return SsoConfigDiscriminated.parse(input)
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @seta/identity vitest run src/sso-config-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/identity/src/sso-config-schema.ts platform/identity/src/sso-config-schema.test.ts
git commit -m "feat(identity): SSO config discriminated union (entra v1)"
```

### Task B3: EntraSsoProvider refactor — per-request config

**Files:**
- Modify: `platform/identity/src/providers/entra.ts`
- Modify: `platform/identity/src/provider.ts` (add `loginHint?: string` to `authorizeUrl` arg)

- [ ] **Step 1: Update the `SsoProvider` interface**

Open `platform/identity/src/provider.ts` and add `loginHint?: string` to the `authorizeUrl` arg type. After change:

```ts
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
  authorizeUrl(opts: { state: string; pkce: string; redirectUri: string; loginHint?: string }): string
  exchangeCode(opts: { code: string; pkce: string; redirectUri: string }): Promise<OidcIdToken>
}
```

- [ ] **Step 2: Refactor `EntraSsoProvider` config shape**

Open `platform/identity/src/providers/entra.ts`. Replace the `EntraSsoConfig` to drop `tenant` and require `entraTenantId`:

```ts
export type EntraSsoConfig = {
  clientId: string
  clientSecret: string
  entraTenantId: string
  discoveryUrl?: string
  fetchImpl?: typeof fetch
}
```

In the class body, replace every `this.cfg.tenant` with `this.cfg.entraTenantId`. In `authorizeUrl`, append the `login_hint` query param when provided:

```ts
authorizeUrl(opts: { state: string; pkce: string; redirectUri: string; loginHint?: string }): string {
  const u = new URL(`https://login.microsoftonline.com/${this.cfg.entraTenantId}/oauth2/v2.0/authorize`)
  u.searchParams.set('client_id', this.cfg.clientId)
  u.searchParams.set('redirect_uri', opts.redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('response_mode', 'query')
  u.searchParams.set('scope', 'openid email profile')
  u.searchParams.set('state', opts.state)
  u.searchParams.set('code_challenge', opts.pkce)
  u.searchParams.set('code_challenge_method', 'S256')
  if (opts.loginHint) u.searchParams.set('login_hint', opts.loginHint)
  return u.toString()
}
```

- [ ] **Step 3: Update the existing unit test to the new shape**

Open `platform/identity/src/providers/entra.test.ts`. Replace any constructor call with `tenant: '...'` to `entraTenantId: '...'`. Add a test for `loginHint`:

```ts
it('appends login_hint when provided', () => {
  const p = new EntraSsoProvider({ clientId: 'c', clientSecret: 's', entraTenantId: 'tid' })
  const u = new URL(p.authorizeUrl({ state: 'st', pkce: 'pk', redirectUri: 'http://x/cb', loginHint: 'a@b.com' }))
  expect(u.searchParams.get('login_hint')).toBe('a@b.com')
  expect(u.pathname).toBe('/tid/oauth2/v2.0/authorize')
})
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @seta/identity vitest run src/providers/entra.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/identity/src/provider.ts platform/identity/src/providers/entra.ts platform/identity/src/providers/entra.test.ts
git commit -m "refactor(identity)!: EntraSsoProvider per-request config + login_hint"
```

### Task B4: Provider factory

**Files:**
- Create: `platform/identity/src/providers/entra-factory.ts`
- Test: `platform/identity/src/providers/entra-factory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// platform/identity/src/providers/entra-factory.test.ts
import { describe, expect, it } from 'vitest'
import { ssoProviderFor } from './entra-factory'

describe('ssoProviderFor', () => {
  it('returns an EntraSsoProvider for provider=entra', () => {
    const p = ssoProviderFor(
      { provider: 'entra', config: { entra_tenant_id: 'tid', client_id: 'cid' } },
      'secret',
    )
    expect(p.id).toBe('entra')
  })

  it('throws Unreachable for unknown provider', () => {
    expect(() =>
      ssoProviderFor({ provider: 'okta', config: {} } as never, 'secret'),
    ).toThrow(/Unreachable|unknown provider/i)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @seta/identity vitest run src/providers/entra-factory.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// platform/identity/src/providers/entra-factory.ts
import type { SsoProvider } from '../provider'
import type { SsoConfigDiscriminated } from '../sso-config-schema'
import { EntraSsoProvider } from './entra'

export function ssoProviderFor(row: SsoConfigDiscriminated, clientSecret: string): SsoProvider {
  switch (row.provider) {
    case 'entra':
      return new EntraSsoProvider({
        clientId: row.config.client_id,
        clientSecret,
        entraTenantId: row.config.entra_tenant_id,
      })
    default: {
      const x: never = row.provider
      throw new Error(`Unreachable: unknown provider '${x as string}'`)
    }
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @seta/identity vitest run src/providers/entra-factory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/identity/src/providers/entra-factory.ts platform/identity/src/providers/entra-factory.test.ts
git commit -m "feat(identity): ssoProviderFor factory dispatching on provider discriminator"
```

### Task B5: SSO config repo (pure + integration)

**Files:**
- Create: `platform/identity/src/sso-config-repo.ts`
- Create: `platform/identity/tests/integration/sso-config-repo.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// platform/identity/tests/integration/sso-config-repo.test.ts
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resolveSsoByEmail, upsertSsoConfig, upsertSsoEmailDomain } from '../../src/sso-config-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

const tenantId = '00000000-0000-4000-8000-000000000001'

describe('sso-config-repo (integration)', () => {
  beforeEach(async () => {
    await sql`TRUNCATE auth.sso_email_domains, auth.sso_configs, tenant.tenant_members, tenant.tenant_connectors CASCADE`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'acme', 'Acme')`
  })
  afterAll(async () => {
    await sql.end()
  })

  it('upserts a config and resolves by email domain', async () => {
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: 'tid-xyz', client_id: 'cid' },
      secretVaultId: 'sso-entra:sso',
      createdByUserId: null,
    })
    await upsertSsoEmailDomain(sql, { domain: 'acme.com', tenantId })

    const hit = await resolveSsoByEmail(sql, 'alice@ACME.com')
    expect(hit).toMatchObject({ tenantId, provider: 'entra', enabled: true })
  })

  it('returns null on a miss', async () => {
    expect(await resolveSsoByEmail(sql, 'alice@nowhere.test')).toBeNull()
  })

  it('returns null when config is disabled', async () => {
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: 't', client_id: 'c' },
      secretVaultId: 'sso-entra:sso',
      createdByUserId: null,
    })
    await sql`UPDATE auth.sso_configs SET enabled = false WHERE tenant_id = ${tenantId}`
    await upsertSsoEmailDomain(sql, { domain: 'acme.com', tenantId })
    expect(await resolveSsoByEmail(sql, 'alice@acme.com')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @seta/identity vitest run tests/integration/sso-config-repo.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// platform/identity/src/sso-config-repo.ts
import type { Sql } from 'postgres'
import { normalizeEmailDomain } from './sso-domain-denylist'
import { parseSsoConfig, type SsoConfigDiscriminated } from './sso-config-schema'

export type SsoResolution = {
  tenantId: string
  provider: 'entra'
  enabled: boolean
}

export async function resolveSsoByEmail(sql: Sql, email: string): Promise<SsoResolution | null> {
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  const domain = normalizeEmailDomain(email.slice(at + 1))
  if (!domain) return null
  const rows = (await sql`SELECT tenant_id, provider, enabled FROM auth.resolve_sso_by_domain(${domain})`) as Array<{
    tenant_id: string
    provider: 'entra'
    enabled: boolean
  }>
  const row = rows[0]
  if (!row) return null
  if (!row.enabled) return null
  return { tenantId: row.tenant_id, provider: row.provider, enabled: row.enabled }
}

export async function getSsoConfigByTenant(
  sql: Sql,
  tenantId: string,
): Promise<{ row: SsoConfigDiscriminated; secretVaultId: string | null } | null> {
  const rows = (await sql`
    SELECT provider, config, secret_vault_id
    FROM auth.sso_configs
    WHERE tenant_id = ${tenantId} AND enabled
    LIMIT 1
  `) as Array<{ provider: string; config: unknown; secret_vault_id: string | null }>
  const r = rows[0]
  if (!r) return null
  const parsed = parseSsoConfig({ provider: r.provider, config: r.config })
  return { row: parsed, secretVaultId: r.secret_vault_id }
}

export async function upsertSsoConfig(
  sql: Sql,
  input: {
    tenantId: string
    provider: 'entra'
    config: SsoConfigDiscriminated['config']
    secretVaultId: string
    createdByUserId: string | null
  },
): Promise<void> {
  await sql`
    INSERT INTO auth.sso_configs (tenant_id, provider, config, secret_vault_id, enabled, created_by_user_id)
    VALUES (${input.tenantId}, ${input.provider}, ${sql.json(input.config as never)}, ${input.secretVaultId}, true, ${input.createdByUserId})
    ON CONFLICT (tenant_id, provider) DO UPDATE
      SET config = excluded.config,
          secret_vault_id = excluded.secret_vault_id,
          enabled = excluded.enabled,
          updated_at = now()
  `
}

export async function upsertSsoEmailDomain(
  sql: Sql,
  input: { domain: string; tenantId: string },
): Promise<void> {
  const d = (input.domain ?? '').toLowerCase()
  if (!d) return
  await sql`
    INSERT INTO auth.sso_email_domains (domain, tenant_id)
    VALUES (${d}, ${input.tenantId})
    ON CONFLICT (domain) DO NOTHING
  `
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @seta/identity vitest run tests/integration/sso-config-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/identity/src/sso-config-repo.ts platform/identity/tests/integration/sso-config-repo.test.ts
git commit -m "feat(identity): sso-config-repo with email-domain resolver"
```

### Task B6: Last-login cookie helpers

**Files:**
- Create: `platform/identity/src/last-login.ts`
- Test: `platform/identity/src/last-login.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// platform/identity/src/last-login.test.ts
import { describe, expect, it } from 'vitest'
import { LAST_LOGIN_COOKIE_NAME, readLastLoginHint, signLastLoginHint } from './last-login'

const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('signLastLoginHint / readLastLoginHint', () => {
  const payload = {
    email: 'alice@acme.com',
    provider: 'entra' as const,
    tenantDisplayName: 'Acme',
    ts: 1700000000,
  }

  it('round-trips', () => {
    const signed = signLastLoginHint(payload, HMAC_KEY)
    expect(readLastLoginHint(signed, HMAC_KEY)).toEqual(payload)
  })

  it('returns null on tampered HMAC', () => {
    const signed = signLastLoginHint(payload, HMAC_KEY)
    const tampered = signed.slice(0, -2) + 'aa'
    expect(readLastLoginHint(tampered, HMAC_KEY)).toBeNull()
  })

  it('returns null on missing cookie', () => {
    expect(readLastLoginHint(undefined, HMAC_KEY)).toBeNull()
    expect(readLastLoginHint('', HMAC_KEY)).toBeNull()
  })

  it('returns null when the payload is not the expected shape', () => {
    // Sign an arbitrary JSON string with the same HMAC mechanism.
    const signed = signLastLoginHint({ unrelated: true } as never, HMAC_KEY)
    expect(readLastLoginHint(signed, HMAC_KEY)).toBeNull()
  })

  it('exports the cookie name constant', () => {
    expect(LAST_LOGIN_COOKIE_NAME).toBe('seta_last_login')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @seta/identity vitest run src/last-login.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// platform/identity/src/last-login.ts
import { z } from 'zod'
import { signCookie, verifyCookie } from './cookie'

export const LAST_LOGIN_COOKIE_NAME = 'seta_last_login'

export const LastLoginHint = z.object({
  email: z.string().email(),
  provider: z.literal('entra'),
  tenantDisplayName: z.string().min(1),
  ts: z.number().int(),
})
export type LastLoginHint = z.infer<typeof LastLoginHint>

export function signLastLoginHint(payload: unknown, hexKey: string): string {
  return signCookie(JSON.stringify(payload), hexKey)
}

export function readLastLoginHint(signed: string | undefined, hexKey: string): LastLoginHint | null {
  if (!signed) return null
  const raw = verifyCookie(signed, hexKey)
  if (!raw) return null
  try {
    const parsed = LastLoginHint.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    return parsed.data
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @seta/identity vitest run src/last-login.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/identity/src/last-login.ts platform/identity/src/last-login.test.ts
git commit -m "feat(identity): seta_last_login signed cookie helpers"
```

---

## Phase C — Routes

### Task C1: New Zod schemas for the API surface

**Files:**
- Modify: `platform/identity/src/schemas.ts`

- [ ] **Step 1: Replace the file contents (entire file shown for clarity)**

```ts
// platform/identity/src/schemas.ts
import { z } from '@hono/zod-openapi'

export const TenantSummary = z
  .object({ id: z.uuid(), slug: z.string(), name: z.string(), isAdmin: z.boolean() })
  .openapi('TenantSummary')
export type TenantSummary = z.infer<typeof TenantSummary>

export const SessionUser = z
  .object({
    id: z.uuid(),
    email: z.string().email(),
    name: z.string().min(1),
    pictureUrl: z.string().url().nullable(),
  })
  .openapi('SessionUser')
export type SessionUser = z.infer<typeof SessionUser>

export const MeResponse = z
  .object({
    user: SessionUser,
    tenant: TenantSummary.nullable(),
    isSuperadmin: z.boolean(),
    apps: z.array(z.string()),
    csrfToken: z.string().min(1),
  })
  .openapi('MeResponse')
export type MeResponse = z.infer<typeof MeResponse>

export const DiscoverBody = z.object({ email: z.string().email() }).openapi('SsoDiscoverBody')
export const DiscoverResponse = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    provider: z.literal('entra'),
    tenantSlug: z.string(),
    displayName: z.string(),
  }),
  z.object({ ok: z.literal(false), error: z.literal('no_workspace_for_email') }),
]).openapi('SsoDiscoverResponse')

export const StartBody = z
  .object({ email: z.string().email(), returnTo: z.string().optional() })
  .openapi('SsoStartBody')
export const StartResponse = z.object({ url: z.string().url() }).openapi('SsoStartResponse')

export const ProviderParam = z.enum(['entra'])
```

Note: `ProviderParam` narrows to `['entra']` only. `LoginBody`/`LoginResponse` (old) are deleted in favor of `StartBody`/`StartResponse`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/identity typecheck`
Expected: many errors in `routes.ts` and `index.ts` referencing now-removed Google bits. That's fine — Tasks C2/C3/F1 fix them. Do not chase them yet.

- [ ] **Step 3: Commit (skipped — combine with C2)**

(Skip commit here; the package won't compile until Task C2 lands.)

### Task C2: Rewrite SSO routes

**Files:**
- Modify: `platform/identity/src/routes.ts` (rewrite)

- [ ] **Step 1: Replace the file contents**

```ts
// platform/identity/src/routes.ts
import { BadRequest, NotFound, Unauthorized } from '@seta/middleware'
import { logger } from '@seta/observability'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Sql } from 'postgres'
import { signCookie, verifyCookie } from './cookie'
import { deriveCsrfToken } from './csrf'
import { LAST_LOGIN_COOKIE_NAME, signLastLoginHint } from './last-login'
import { resolveNextUrl } from './me/resolve-next-url'
import type { AttachStatus, MeContextProvider } from './me-context-provider'
import { csrfMiddleware, requireSession, type SsoVariables } from './middleware'
import { generatePkce } from './pkce'
import { ssoProviderFor } from './providers/entra-factory'
import { getSsoConfigByTenant, resolveSsoByEmail } from './sso-config-repo'
import { DiscoverBody, MeResponse, StartBody, type SessionUser } from './schemas'
import { createSessionStore } from './session-store'
import { upsertUserByIdentity } from './users-repo'

export type SsoRoutesDeps = {
  sql: Sql
  sessionCookie: { name: string; hmacKey: string; ttlSec: number; secure: boolean }
  redirectBase: string
  meContext: MeContextProvider
  tenancy: { findOrAttachUser: (userId: string) => Promise<AttachStatus> }
  /** Look up a vault entry containing the client secret. */
  getClientSecret: (input: { tenantId: string; vaultId: string | null }) => Promise<string>
  /** Look up tenant display info for the discover/start response. */
  getTenantBrief: (tenantId: string) => Promise<{ slug: string; displayName: string } | null>
  /** Auto-join after SSO callback when the user has no membership. */
  autoJoinOnDomain: (input: { userId: string; tenantId: string }) => Promise<void>
  verifyLastApp?: (raw: string | undefined) => string | null
}

const STATE_COOKIE_TTL_SEC = 600
const STATE_COOKIE_NAME = 'seta_sso_state'
const LAST_LOGIN_TTL_SEC = 30 * 24 * 60 * 60

type StatePayload = {
  pkce: string
  returnTo: string
  provider: 'entra'
  state: string
  tenantId: string
  email: string
}

export function createSsoRoutes(deps: SsoRoutesDeps): Hono<{ Variables: SsoVariables }> {
  const store = createSessionStore(deps.sql)
  const app = new Hono<{ Variables: SsoVariables }>()

  app.post('/sso/discover', async (c) => {
    const body = DiscoverBody.parse(await c.req.json().catch(() => ({})))
    const hit = await resolveSsoByEmail(deps.sql, body.email)
    if (!hit) {
      logger.info({ event: 'sso.discover_miss' }, '[sso] discover miss')
      return c.json({ ok: false as const, error: 'no_workspace_for_email' as const })
    }
    const brief = await deps.getTenantBrief(hit.tenantId)
    if (!brief) {
      logger.warn({ event: 'sso.discover_miss', tenantId: hit.tenantId }, '[sso] discover tenant brief missing')
      return c.json({ ok: false as const, error: 'no_workspace_for_email' as const })
    }
    logger.info(
      { event: 'sso.discover_hit', tenant_id: hit.tenantId, provider: hit.provider },
      '[sso] discover hit',
    )
    return c.json({ ok: true as const, provider: hit.provider, tenantSlug: brief.slug, displayName: brief.displayName })
  })

  app.post('/sso/start', async (c) => {
    const body = StartBody.parse(await c.req.json().catch(() => ({})))
    const returnTo = body.returnTo ?? '/'

    const hit = await resolveSsoByEmail(deps.sql, body.email)
    if (!hit) throw new NotFound('no workspace for email')

    const cfg = await getSsoConfigByTenant(deps.sql, hit.tenantId)
    if (!cfg) throw new NotFound('sso config missing')

    const clientSecret = await deps.getClientSecret({ tenantId: hit.tenantId, vaultId: cfg.secretVaultId })
    const provider = ssoProviderFor(cfg.row, clientSecret)

    const { verifier, challenge } = generatePkce()
    const state = crypto.randomUUID()
    const payload: StatePayload = {
      pkce: verifier,
      returnTo,
      provider: 'entra',
      state,
      tenantId: hit.tenantId,
      email: body.email,
    }
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
      redirectUri: `${deps.redirectBase}/sso/callback/entra`,
      loginHint: body.email,
    })

    logger.info(
      { event: 'sso.start', tenant_id: hit.tenantId, provider: 'entra' },
      '[sso] start',
    )
    return c.json({ url })
  })

  app.get('/sso/callback/entra', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!code || !state) throw new BadRequest('missing code or state')

    const stateCookie = getCookie(c, STATE_COOKIE_NAME)
    if (!stateCookie) throw new BadRequest('missing state cookie')
    const verified = verifyCookie(stateCookie, deps.sessionCookie.hmacKey)
    if (!verified) throw new BadRequest('state cookie invalid')
    const parsed = JSON.parse(verified) as StatePayload
    if (parsed.state !== state) throw new BadRequest('state mismatch')
    if (parsed.provider !== 'entra') throw new BadRequest('state provider mismatch')

    const cfg = await getSsoConfigByTenant(deps.sql, parsed.tenantId)
    if (!cfg) throw new BadRequest('sso config missing')

    const clientSecret = await deps.getClientSecret({ tenantId: parsed.tenantId, vaultId: cfg.secretVaultId })
    const provider = ssoProviderFor(cfg.row, clientSecret)

    const idToken = await provider.exchangeCode({
      code,
      pkce: parsed.pkce,
      redirectUri: `${deps.redirectBase}/sso/callback/entra`,
    })

    // Issuer check: id_token issuer must match the entra_tenant_id we expected.
    if (cfg.row.provider === 'entra') {
      const expectedIssuerPrefix = `https://login.microsoftonline.com/${cfg.row.config.entra_tenant_id}/`
      if (!idToken.iss.startsWith(expectedIssuerPrefix)) {
        logger.warn(
          {
            event: 'sso.callback_fail',
            tenant_id: parsed.tenantId,
            reason: 'issuer_mismatch',
            got: idToken.iss,
          },
          '[sso] issuer mismatch',
        )
        throw new BadRequest('issuer mismatch')
      }
    }

    // Email-domain check: id_token email's domain must be owned by this tenant.
    const emailHit = await resolveSsoByEmail(deps.sql, idToken.email)
    if (!emailHit || emailHit.tenantId !== parsed.tenantId) {
      logger.warn(
        { event: 'sso.callback_fail', tenant_id: parsed.tenantId, reason: 'email_domain_mismatch' },
        '[sso] email domain mismatch',
      )
      throw new BadRequest('email domain not in tenant allowlist')
    }

    const user = await upsertUserByIdentity(deps.sql, {
      provider: 'entra',
      subject: idToken.sub,
      email: idToken.email,
      name: idToken.name ?? idToken.email,
      pictureUrl: idToken.picture ?? null,
    })

    await deps.autoJoinOnDomain({ userId: user.id, tenantId: parsed.tenantId })

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

    // Last-login hint (non-session cookie, readable by the browser)
    const brief = await deps.getTenantBrief(parsed.tenantId)
    if (brief) {
      const hint = signLastLoginHint(
        {
          email: idToken.email,
          provider: 'entra',
          tenantDisplayName: brief.displayName,
          ts: Math.floor(Date.now() / 1000),
        },
        deps.sessionCookie.hmacKey,
      )
      setCookie(c, LAST_LOGIN_COOKIE_NAME, hint, {
        httpOnly: false,
        secure: deps.sessionCookie.secure,
        sameSite: 'Lax',
        path: '/',
        maxAge: LAST_LOGIN_TTL_SEC,
      })
    }

    deleteCookie(c, STATE_COOKIE_NAME, { path: '/' })

    logger.info(
      { event: 'sso.callback_ok', tenant_id: parsed.tenantId, provider: 'entra', user_id: user.id },
      '[sso] callback ok',
    )

    const status = await deps.tenancy.findOrAttachUser(user.id)
    const rawLastApp = getCookie(c, 'seta_last_app') ?? undefined
    const lastApp = deps.verifyLastApp ? deps.verifyLastApp(rawLastApp) : null
    const next =
      status === 'superadmin'
        ? '/console/admin/tenants'
        : status === 'no-membership'
          ? '/console/no-workspace'
          : resolveNextUrl({ returnTo: parsed.returnTo, lastApp })

    return c.redirect(next)
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
      const user: SessionUser = { id: u.id, email: u.email, name: u.name, pictureUrl: u.picture_url }
      const ctx = await deps.meContext.resolve(userId)
      const csrfToken = deriveCsrfToken(sessionId, deps.sessionCookie.hmacKey)
      return c.json(
        MeResponse.parse({
          user,
          tenant: ctx.tenant,
          isSuperadmin: ctx.isSuperadmin,
          apps: ctx.apps,
          csrfToken,
        }),
      )
    },
  )

  return app
}

export { csrfMiddleware }
```

Note: `providers`, `enabledProviders` deps are gone — those were the old global provider singletons. The factory replaces them.

- [ ] **Step 2: Update `platform/identity/src/index.ts` to reflect the new exports**

Open `platform/identity/src/index.ts` and replace the contents with:

```ts
export { signCookie, verifyCookie } from './cookie'
export { deriveCsrfToken } from './csrf'
export type { ResolveNextUrlInput } from './me/resolve-next-url'
export { resolveNextUrl } from './me/resolve-next-url'
export type { AttachStatus, MeContext, MeContextProvider } from './me-context-provider'
export type { CsrfOpts, RequireSessionOpts, SessionStore, SsoVariables } from './middleware'
export { csrfMiddleware, requireSession } from './middleware'
export type { RequireSuperadminOpts } from './middleware/require-superadmin'
export { requireSuperadmin } from './middleware/require-superadmin'
export { generatePkce } from './pkce'
export type { OidcIdToken, SsoProvider } from './provider'
export type { EntraSsoConfig } from './providers/entra'
export { EntraSsoProvider } from './providers/entra'
export { ssoProviderFor } from './providers/entra-factory'
export type { SsoRoutesDeps } from './routes'
export { createSsoRoutes } from './routes'
export type { NewSession, NewUser, NewUserIdentity, Session, User, UserIdentity } from './schema'
export {
  authSchema,
  magicLinks,
  sessions,
  ssoConfigs,
  ssoEmailDomains,
  userIdentities,
  users,
} from './schema'
export type {
  MagicLinkRow,
  NewMagicLinkRow,
  NewSsoConfigRow,
  NewSsoEmailDomainRow,
  SsoConfigRow,
  SsoEmailDomainRow,
} from './schema'
export {
  DiscoverBody,
  DiscoverResponse,
  MeResponse,
  ProviderParam,
  SessionUser,
  StartBody,
  StartResponse,
  TenantSummary,
} from './schemas'
export type { PostgresSessionStore } from './session-store'
export { createSessionStore } from './session-store'
export { isSuperadmin } from './superadmin-repo'
export {
  getSsoConfigByTenant,
  resolveSsoByEmail,
  upsertSsoConfig,
  upsertSsoEmailDomain,
} from './sso-config-repo'
export type { SsoConfigDiscriminated, EntraConfig } from './sso-config-schema'
export { SsoConfigDiscriminated as SsoConfigSchema, parseSsoConfig } from './sso-config-schema'
export {
  isDeniedSsoEmailDomain,
  normalizeEmailDomain,
  SSO_EMAIL_DOMAIN_DENYLIST,
} from './sso-domain-denylist'
export {
  LAST_LOGIN_COOKIE_NAME,
  LastLoginHint,
  readLastLoginHint,
  signLastLoginHint,
} from './last-login'
export { upsertUserByIdentity } from './users-repo'
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @seta/identity typecheck`
Expected: PASS (callers elsewhere still break — they're fixed in Phase D).

- [ ] **Step 4: Commit**

```bash
git add platform/identity/src/schemas.ts \
        platform/identity/src/routes.ts \
        platform/identity/src/index.ts
git commit -m "feat(identity)!: rewrite SSO routes for email-first per-tenant Entra"
```

### Task C3: Integration tests for the new routes

**Files:**
- Create: `platform/identity/tests/integration/sso-discover.test.ts`
- Create: `platform/identity/tests/integration/sso-start.test.ts`
- Create: `platform/identity/tests/integration/sso-callback.test.ts`
- Delete: `platform/identity/tests/integration/routes.test.ts` (the old one)
- Delete: `platform/identity/tests/integration/_mock-provider.ts` (the old mock — replaced by a factory stub below)

The new tests build the app with a *stub* `getClientSecret` and *stub* HTTP boundary (we override `EntraSsoProvider.fetchImpl` for the callback test). Earlier tests used `MockSsoProvider`; with the factory shape, there's no provider singleton to mock — we override the provider's outbound `fetch` instead.

- [ ] **Step 1: Write `sso-discover.test.ts`**

```ts
// platform/identity/tests/integration/sso-discover.test.ts
import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createSsoRoutes } from '../../src/routes'
import { upsertSsoConfig, upsertSsoEmailDomain } from '../../src/sso-config-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const tenantId = '00000000-0000-4000-8000-0000000000a1'

function buildApp(sql: postgres.Sql) {
  const app = new Hono().onError(onError)
  app.route(
    '/',
    createSsoRoutes({
      sql,
      sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
      redirectBase: 'http://localhost:8080',
      meContext: { resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }) },
      tenancy: { findOrAttachUser: async () => 'attached' },
      getClientSecret: async () => 'unused-in-discover',
      getTenantBrief: async () => ({ slug: 'acme', displayName: 'Acme Inc.' }),
      autoJoinOnDomain: async () => {},
    }),
  )
  return app
}

describe('POST /sso/discover (integration)', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

  beforeEach(async () => {
    await sql`TRUNCATE auth.sso_email_domains, auth.sso_configs CASCADE`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'acme', 'Acme Inc.')`
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: 'tid-acme', client_id: 'cid' },
      secretVaultId: 'sso-entra:sso',
      createdByUserId: null,
    })
    await upsertSsoEmailDomain(sql, { domain: 'acme.com', tenantId })
  })
  afterAll(async () => {
    await sql.end()
  })

  it('returns provider+slug+displayName for a configured domain', async () => {
    const app = buildApp(sql)
    const res = await app.request('/sso/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@ACME.com' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      ok: true,
      provider: 'entra',
      tenantSlug: 'acme',
      displayName: 'Acme Inc.',
    })
  })

  it('returns no_workspace_for_email for an unknown domain', async () => {
    const app = buildApp(sql)
    const res = await app.request('/sso/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@nowhere.example' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, error: 'no_workspace_for_email' })
  })
})
```

- [ ] **Step 2: Write `sso-start.test.ts`**

```ts
// platform/identity/tests/integration/sso-start.test.ts
import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createSsoRoutes } from '../../src/routes'
import { upsertSsoConfig, upsertSsoEmailDomain } from '../../src/sso-config-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const tenantId = '00000000-0000-4000-8000-0000000000a2'

describe('POST /sso/start (integration)', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

  beforeEach(async () => {
    await sql`TRUNCATE auth.sso_email_domains, auth.sso_configs CASCADE`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'acme', 'Acme')`
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: '11111111-2222-3333-4444-555555555555', client_id: 'cid' },
      secretVaultId: 'sso-entra:sso',
      createdByUserId: null,
    })
    await upsertSsoEmailDomain(sql, { domain: 'acme.com', tenantId })
  })
  afterAll(async () => { await sql.end() })

  it('returns a tenant-specific authorize URL with login_hint, sets a signed state cookie', async () => {
    const app = new Hono().onError(onError)
    app.route(
      '/',
      createSsoRoutes({
        sql,
        sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
        redirectBase: 'http://localhost:8080',
        meContext: { resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }) },
        tenancy: { findOrAttachUser: async () => 'attached' },
        getClientSecret: async () => 'fake-secret',
        getTenantBrief: async () => ({ slug: 'acme', displayName: 'Acme' }),
        autoJoinOnDomain: async () => {},
      }),
    )
    const res = await app.request('/sso/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@acme.com', returnTo: '/dashboard' }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { url: string }
    const u = new URL(json.url)
    expect(u.origin).toBe('https://login.microsoftonline.com')
    expect(u.pathname).toBe('/11111111-2222-3333-4444-555555555555/oauth2/v2.0/authorize')
    expect(u.searchParams.get('login_hint')).toBe('alice@acme.com')
    expect(u.searchParams.get('client_id')).toBe('cid')
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/seta_sso_state=/)
    expect(setCookie).toMatch(/HttpOnly/i)
  })

  it('404s when the email has no workspace', async () => {
    const app = new Hono().onError(onError)
    app.route(
      '/',
      createSsoRoutes({
        sql,
        sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
        redirectBase: 'http://localhost:8080',
        meContext: { resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }) },
        tenancy: { findOrAttachUser: async () => 'attached' },
        getClientSecret: async () => 'fake',
        getTenantBrief: async () => ({ slug: 'acme', displayName: 'Acme' }),
        autoJoinOnDomain: async () => {},
      }),
    )
    const res = await app.request('/sso/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@unknown.example' }),
    })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 3: Write `sso-callback.test.ts`**

This test uses the real `EntraSsoProvider` but overrides its `fetchImpl` to return canned discovery + token responses, and uses `jose.SignJWT` to mint a deterministic id_token. The Entra issuer + jwks URI are mocked via the discovery doc to point at a local jwks server.

```ts
// platform/identity/tests/integration/sso-callback.test.ts
import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { signCookie } from '../../src/cookie'
import { createSsoRoutes } from '../../src/routes'
import { upsertSsoConfig, upsertSsoEmailDomain } from '../../src/sso-config-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const tenantId = '00000000-0000-4000-8000-0000000000a3'
const entraTenantId = '99999999-8888-7777-6666-555555555555'
const clientId = 'cid'

async function mintIdToken(args: { email: string; sub: string }): Promise<{ token: string; jwks: unknown }> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = await exportJWK(publicKey)
  jwk.kid = 'kid-1'
  jwk.alg = 'RS256'
  jwk.use = 'sig'
  const token = await new SignJWT({ email: args.email, name: 'Alice', sub: args.sub })
    .setProtectedHeader({ alg: 'RS256', kid: 'kid-1' })
    .setIssuer(`https://login.microsoftonline.com/${entraTenantId}/v2.0`)
    .setAudience(clientId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
  return { token, jwks: { keys: [jwk] } }
}

function buildFetchStub(idToken: string, jwks: unknown): typeof fetch {
  const fetchStub: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.endsWith('/.well-known/openid-configuration')) {
      return new Response(
        JSON.stringify({
          issuer: `https://login.microsoftonline.com/${entraTenantId}/v2.0`,
          authorization_endpoint: `https://login.microsoftonline.com/${entraTenantId}/oauth2/v2.0/authorize`,
          token_endpoint: `https://login.microsoftonline.com/${entraTenantId}/oauth2/v2.0/token`,
          jwks_uri: 'https://stub.test/jwks.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (url === 'https://stub.test/jwks.json') {
      return new Response(JSON.stringify(jwks), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.endsWith('/oauth2/v2.0/token')) {
      return new Response(JSON.stringify({ id_token: idToken }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    throw new Error(`unexpected fetch ${url}`)
  }
  return fetchStub
}

describe('GET /sso/callback/entra (integration)', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

  beforeEach(async () => {
    await sql`TRUNCATE auth.sessions, auth.user_identities, auth.users, auth.sso_email_domains, auth.sso_configs CASCADE`
    await sql`DELETE FROM tenant.tenant_members WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'acme', 'Acme')`
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: entraTenantId, client_id: clientId },
      secretVaultId: 'sso-entra:sso',
      createdByUserId: null,
    })
    await upsertSsoEmailDomain(sql, { domain: 'acme.com', tenantId })
  })
  afterAll(async () => { await sql.end() })

  it('happy path: exchanges code, upserts user, auto-joins, sets session + last-login cookies', async () => {
    const { token, jwks } = await mintIdToken({ email: 'alice@acme.com', sub: 'sub-1' })
    let autoJoined = false

    const app = new Hono().onError(onError)
    app.route(
      '/',
      createSsoRoutes({
        sql,
        sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
        redirectBase: 'http://localhost:8080',
        meContext: { resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }) },
        tenancy: { findOrAttachUser: async () => 'attached' },
        getClientSecret: async () => 'fake-secret',
        getTenantBrief: async () => ({ slug: 'acme', displayName: 'Acme' }),
        autoJoinOnDomain: async () => { autoJoined = true },
      }),
    )
    // Patch the global fetch the provider uses (the EntraSsoProvider falls
    // back to globalThis.fetch when no fetchImpl was passed).
    const originalFetch = globalThis.fetch
    globalThis.fetch = buildFetchStub(token, jwks)
    try {
      const state = 'state-1'
      const statePayload = {
        pkce: 'verifier',
        returnTo: '/',
        provider: 'entra',
        state,
        tenantId,
        email: 'alice@acme.com',
      }
      const stateCookie = signCookie(JSON.stringify(statePayload), HMAC_KEY)
      const res = await app.request(`/sso/callback/entra?code=AUTHCODE&state=${state}`, {
        method: 'GET',
        headers: { cookie: `seta_sso_state=${stateCookie}` },
      })
      expect(res.status).toBe(302)
      const setCookie = res.headers.get('set-cookie') ?? ''
      expect(setCookie).toMatch(/seta_sess=/)
      expect(setCookie).toMatch(/seta_last_login=/)
      expect(autoJoined).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('rejects on issuer mismatch', async () => {
    // Mint with a different entra tenant.
    const { token, jwks } = await mintIdToken({ email: 'alice@acme.com', sub: 'sub-2' })
    const tampered = token.replace(/./g, (c, i) => (i === 60 ? '!' : c))  // simulate something opaque
    // Easier: use a fetch stub that returns an id_token with wrong iss.
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.endsWith('/.well-known/openid-configuration')) {
        return new Response(
          JSON.stringify({
            issuer: 'https://login.microsoftonline.com/WRONG/v2.0',
            authorization_endpoint: 'x',
            token_endpoint: 'https://login.microsoftonline.com/WRONG/oauth2/v2.0/token',
            jwks_uri: 'https://stub.test/jwks.json',
          }),
          { status: 200 },
        )
      }
      if (url === 'https://stub.test/jwks.json') return new Response(JSON.stringify(jwks))
      if (url.endsWith('/token')) return new Response(JSON.stringify({ id_token: token }))
      throw new Error('unexpected')
    }
    try {
      const app = new Hono().onError(onError)
      app.route(
        '/',
        createSsoRoutes({
          sql,
          sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
          redirectBase: 'http://localhost:8080',
          meContext: { resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }) },
          tenancy: { findOrAttachUser: async () => 'attached' },
          getClientSecret: async () => 'fake',
          getTenantBrief: async () => ({ slug: 'acme', displayName: 'Acme' }),
          autoJoinOnDomain: async () => {},
        }),
      )
      // We expect the jose.jwtVerify to fail because issuer in discovery doesn't
      // match what was minted. The exchangeCode helper throws ServiceUnavailable.
      const state = 'state-2'
      const stateCookie = signCookie(
        JSON.stringify({ pkce: 'v', returnTo: '/', provider: 'entra', state, tenantId, email: 'alice@acme.com' }),
        HMAC_KEY,
      )
      const res = await app.request(`/sso/callback/entra?code=X&state=${state}`, {
        method: 'GET',
        headers: { cookie: `seta_sso_state=${stateCookie}` },
      })
      expect(res.status).toBeGreaterThanOrEqual(400)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('rejects when id_token email is in a different tenant', async () => {
    const { token, jwks } = await mintIdToken({ email: 'bob@other.example', sub: 'sub-3' })
    const originalFetch = globalThis.fetch
    globalThis.fetch = buildFetchStub(token, jwks)
    try {
      const app = new Hono().onError(onError)
      app.route(
        '/',
        createSsoRoutes({
          sql,
          sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
          redirectBase: 'http://localhost:8080',
          meContext: { resolve: async () => ({ tenant: null, isSuperadmin: false, apps: [] }) },
          tenancy: { findOrAttachUser: async () => 'attached' },
          getClientSecret: async () => 'fake',
          getTenantBrief: async () => ({ slug: 'acme', displayName: 'Acme' }),
          autoJoinOnDomain: async () => {},
        }),
      )
      const state = 'state-3'
      const stateCookie = signCookie(
        JSON.stringify({ pkce: 'v', returnTo: '/', provider: 'entra', state, tenantId, email: 'alice@acme.com' }),
        HMAC_KEY,
      )
      const res = await app.request(`/sso/callback/entra?code=X&state=${state}`, {
        method: 'GET',
        headers: { cookie: `seta_sso_state=${stateCookie}` },
      })
      expect(res.status).toBe(400)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
```

- [ ] **Step 4: Delete the obsolete files**

```bash
git rm platform/identity/tests/integration/routes.test.ts
git rm platform/identity/tests/integration/_mock-provider.ts
```

- [ ] **Step 5: Run the new tests**

Run: `pnpm --filter @seta/identity vitest run tests/integration`
Expected: PASS for all three new tests.

- [ ] **Step 6: Commit**

```bash
git add platform/identity/tests/integration/sso-discover.test.ts \
        platform/identity/tests/integration/sso-start.test.ts \
        platform/identity/tests/integration/sso-callback.test.ts
git commit -m "test(identity): integration tests for /sso/discover, /sso/start, /sso/callback"
```

### Task C4: Delete the Google provider

**Files:**
- Delete: `platform/identity/src/providers/google.ts`
- Delete: `platform/identity/src/providers/google.test.ts`

- [ ] **Step 1: Remove the files**

```bash
git rm platform/identity/src/providers/google.ts
git rm platform/identity/src/providers/google.test.ts
```

- [ ] **Step 2: Verify nothing references Google in @seta/identity**

Run: `grep -rn "Google" platform/identity/src/ || echo "clean"`
Expected: prints "clean" or only matches unrelated to the deleted provider.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @seta/identity typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(identity)!: drop Google SSO provider"
```

---

## Phase D — Wiring (apps/api) and bootstrap

### Task D1: Env var rename / delete / add

**Files:**
- Modify: `apps/api/src/env.ts`

- [ ] **Step 1: Update env schema**

Open `apps/api/src/env.ts`. Apply this diff (the resulting file is shown):

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { z } from 'zod'

config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'),
  quiet: true,
})

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().url(),
  PUBLIC_BASE_URL: z.string().url(),
  PLATFORM_CONNECTOR_CLIENT_ID: z.string().min(1),
  PLATFORM_CONNECTOR_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.never().optional(),
  GOOGLE_CLIENT_SECRET: z.never().optional(),
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
  MS_BOT_TENANT_ID: z.string().min(1),
  PLANNER_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(180_000),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  AGENT_EMBEDDINGS_PROVIDER: z.enum(['openai', 'azure-openai', 'none']).default('none'),
  APPS_DEPLOYED: z.string().default('studio'),
})

export const env = EnvSchema.parse(process.env)

export const deployedApps = () =>
  env.APPS_DEPLOYED.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
```

Notes:
- `ENTRA_CLIENT_ID/SECRET` are renamed to `PLATFORM_CONNECTOR_CLIENT_ID/SECRET`.
- `ENTRA_SSO_TENANT`, `SSO_ENTRA_ENABLED`, `SSO_GOOGLE_ENABLED`, the `enabledSsoProviders()` helper are deleted.
- `GOOGLE_CLIENT_ID/SECRET` are marked `z.never().optional()` for one cycle so a stale `.env` with them throws a clear error instead of silently passing.
- The `enabledSsoProviders` export is removed — main.ts is updated to drop its reference.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/api typecheck`
Expected: FAIL — main.ts still references the old names. Fixed in Task D2.

(no commit yet)

### Task D2: Rewire `apps/api/src/main.ts`

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Apply the wiring changes**

Open `apps/api/src/main.ts`. Apply these specific changes:

1. **Rename the connector OAuth construction** (around line 79):

```ts
const platformConnectorOAuth = new EntraProvider({
  clientId: env.PLATFORM_CONNECTOR_CLIENT_ID,
  clientSecret: env.PLATFORM_CONNECTOR_CLIENT_SECRET,
})
```

Then find/replace `entra.acquireAppOnly` → `platformConnectorOAuth.acquireAppOnly` and `providers: { entra }` → `providers: { entra: platformConnectorOAuth }` in the OAuth routes wiring. The `entra` identifier should appear nowhere as a top-level binding after this change.

2. **Replace the SSO construction block** (currently lines 86-115). Delete the `entraSso`, `googleSso`, and `sso` `createSsoRoutes(...)` block. Insert:

```ts
const sso = createSsoRoutes({
  sql,
  sessionCookie: {
    name: 'seta_sess',
    hmacKey: env.SESSION_HMAC_KEY,
    ttlSec: env.SESSION_TTL_SEC,
    secure: env.NODE_ENV === 'production',
  },
  redirectBase: env.PUBLIC_BASE_URL,
  meContext,
  tenancy: { findOrAttachUser: (uid) => findOrAttachUser(sql as never, uid) },
  verifyLastApp: (raw) => verifyLastApp(raw, env.SESSION_HMAC_KEY),
  getClientSecret: async ({ tenantId, vaultId }) => {
    if (!vaultId) throw new Error('sso config has no secret_vault_id')
    const [providerId, accountKey] = vaultId.split(':') as ['sso-entra', string]
    const bundle = await vault.get(tenantId, providerId, accountKey)
    if (!bundle) throw new Error(`vault miss for ${tenantId}/${vaultId}`)
    return bundle.accessToken
  },
  getTenantBrief: async (tenantId) => {
    const rows = (await sql`SELECT slug, display_name FROM tenant.tenants WHERE id = ${tenantId} LIMIT 1`) as Array<{
      slug: string
      display_name: string
    }>
    const r = rows[0]
    return r ? { slug: r.slug, displayName: r.display_name } : null
  },
  autoJoinOnDomain: async ({ userId, tenantId }) => {
    await sql`
      INSERT INTO tenant.tenant_members (user_id, tenant_id, role, source)
      VALUES (${userId}, ${tenantId}, 'member', 'sso_domain_match')
      ON CONFLICT DO NOTHING
    `
  },
})
```

3. **Remove the imports** that are no longer used: `EntraSsoProvider`, `GoogleSsoProvider`, `enabledSsoProviders`.

4. **Keep** `findOrAttachUser`, `requireSession`, `isSuperadmin` imports — still used.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/api typecheck`
Expected: PASS.

- [ ] **Step 3: Replace the `apps/api/tests/integration/sso.test.ts` smoke**

Open the file and rewrite it to assert wiring on the new shape:

```ts
// apps/api/tests/integration/sso.test.ts
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/main'
import { upsertSsoConfig, upsertSsoEmailDomain } from '@seta/identity'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const tenantId = '00000000-0000-4000-8000-0000000000b1'

describe('apps/api SSO smoke', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

  beforeEach(async () => {
    await sql`TRUNCATE auth.sso_email_domains, auth.sso_configs CASCADE`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'smokesetup', 'Smoke')`
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: 'tid-smoke', client_id: 'cid' },
      secretVaultId: 'sso-entra:sso',
      createdByUserId: null,
    })
    await upsertSsoEmailDomain(sql, { domain: 'smoke.test', tenantId })
  })
  afterAll(async () => { await sql.end() })

  it('GET /sso/providers is gone; POST /sso/discover hits a real workspace', async () => {
    const app = buildApp()
    const res = await app.request('/sso/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@smoke.test' }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as Record<string, unknown>
    expect(json).toMatchObject({ ok: true, provider: 'entra', tenantSlug: 'smokesetup' })
  })
})
```

- [ ] **Step 4: Run the smoke**

Run: `pnpm --filter @seta/api vitest run tests/integration/sso.test.ts`
Expected: PASS (assuming `.env` has been updated to new env var names; see D3).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/env.ts apps/api/src/main.ts apps/api/tests/integration/sso.test.ts
git commit -m "refactor(api)!: wire per-tenant SSO + rename PLATFORM_CONNECTOR_CLIENT_*"
```

### Task D3: Update `tooling/scripts/seed-first-tenant.ts`

**Files:**
- Modify: `tooling/scripts/seed-first-tenant.ts`

- [ ] **Step 1: Update env schema and bootstrap inserts**

In the `Env` Zod object near the top:

```diff
-  ENTRA_CLIENT_ID: z.string().min(1),
-  ENTRA_CLIENT_SECRET: z.string().min(1),
+  PLATFORM_CONNECTOR_CLIENT_ID: z.string().min(1),
+  PLATFORM_CONNECTOR_CLIENT_SECRET: z.string().min(1),
   BOOTSTRAP_TENANT_SLUG: z.string().min(1),
   BOOTSTRAP_TENANT_NAME: z.string().min(1),
-  BOOTSTRAP_ENTRA_TENANT_ID: z.string().min(1),
+  BOOTSTRAP_SETA_ENTRA_TENANT_ID: z.string().min(1),
+  BOOTSTRAP_SSO_CLIENT_ID: z.string().min(1),
+  BOOTSTRAP_SSO_CLIENT_SECRET: z.string().min(1),
+  BOOTSTRAP_SSO_EMAIL_DOMAINS: z.string().min(1),
   BOOTSTRAP_SUPERADMIN_EMAILS: z.string().min(1),
```

Replace `env.ENTRA_CLIENT_ID` → `env.PLATFORM_CONNECTOR_CLIENT_ID`, `env.ENTRA_CLIENT_SECRET` → `env.PLATFORM_CONNECTOR_CLIENT_SECRET`, `env.BOOTSTRAP_ENTRA_TENANT_ID` → `env.BOOTSTRAP_SETA_ENTRA_TENANT_ID` throughout the file.

Add an SSO seeding block inside `sql.begin(async (tx) => { ... })` after the existing owner/superadmin inserts, before the `return id`:

```ts
const bootstrapSsoDomains = env.BOOTSTRAP_SSO_EMAIL_DOMAINS
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

// 1. seed sso_configs (secret put separately via the vault below; vault is
//    not transactional with this tx)
await tx`
  INSERT INTO auth.sso_configs
    (tenant_id, provider, config, secret_vault_id, enabled, created_by_user_id)
  VALUES (
    ${id},
    'entra',
    ${tx.json({
      entra_tenant_id: env.BOOTSTRAP_SETA_ENTRA_TENANT_ID,
      client_id:       env.BOOTSTRAP_SSO_CLIENT_ID,
    } as never)},
    'sso-entra:sso',
    true,
    ${owner.id}
  )
  ON CONFLICT (tenant_id, provider) DO UPDATE
    SET config = excluded.config,
        secret_vault_id = excluded.secret_vault_id,
        enabled = excluded.enabled,
        updated_at = now()
`

// 2. seed sso_email_domains
for (const domain of bootstrapSsoDomains) {
  await tx`
    INSERT INTO auth.sso_email_domains (domain, tenant_id)
    VALUES (${domain}, ${id})
    ON CONFLICT (domain) DO NOTHING
  `
}
```

After the `sql.begin` block, add the SSO secret put before the connector token block:

```ts
// Put SSO client secret in the vault (envelope-encrypted via KMS).
await vault.put(tenantId, 'sso-entra', 'sso', {
  accessToken: env.BOOTSTRAP_SSO_CLIENT_SECRET,
})

if (!SEED_MODE_OFFLINE) {
  const bundle = await entra.acquireAppOnly(env.BOOTSTRAP_SETA_ENTRA_TENANT_ID, [
    'https://graph.microsoft.com/.default',
  ])
  await vault.put(tenantId, 'entra', `app:${env.PLATFORM_CONNECTOR_CLIENT_ID}`, bundle)
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/tooling typecheck` (or whatever package owns scripts; if no separate package, run root-level `pnpm typecheck`).
Expected: PASS.

- [ ] **Step 3: Run the script locally with a fresh DB**

Set `.env` per Task F1 first, then:
```bash
pnpm db:down && pnpm db:up && pnpm migrate
BOOTSTRAP_OFFLINE=1 pnpm seed:first-tenant
```
Expected: ends with `✓ seeded tenant ...`. No errors.

- [ ] **Step 4: Verify rows exist**

```bash
psql "$DATABASE_URL" -c "SELECT tenant_id, provider, enabled FROM auth.sso_configs;"
psql "$DATABASE_URL" -c "SELECT domain, tenant_id FROM auth.sso_email_domains;"
```
Expected: one row in each.

- [ ] **Step 5: Commit**

```bash
git add tooling/scripts/seed-first-tenant.ts
git commit -m "feat(tooling): seed SSO config + email domains for first tenant"
```

---

## Phase E — Frontend

### Task E1: Rewrite `signIn` in `@seta/identity-client`

**Files:**
- Modify: `platform/identity-client/src/signIn.ts`
- Modify: `platform/identity-client/src/signIn.test.ts`

- [ ] **Step 1: Write the new failing tests**

```ts
// platform/identity-client/src/signIn.test.ts
import { describe, expect, it, vi } from 'vitest'
import { discover, start } from './signIn'

describe('discover', () => {
  it('posts email and returns the result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, provider: 'entra', tenantSlug: 'acme', displayName: 'Acme' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const r = await discover('alice@acme.com', { fetch: fetchImpl as never })
    expect(r).toEqual({ ok: true, provider: 'entra', tenantSlug: 'acme', displayName: 'Acme' })
    const [, init] = fetchImpl.mock.calls[0]!
    expect(JSON.parse((init.body as string) ?? '{}')).toEqual({ email: 'alice@acme.com' })
  })
})

describe('start', () => {
  it('posts email + returnTo and returns the authorize URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://login.microsoftonline.com/x/oauth2/v2.0/authorize?cid=1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const r = await start('alice@acme.com', { returnTo: '/dashboard', fetch: fetchImpl as never })
    expect(r.url).toMatch(/^https:\/\/login\.microsoftonline\.com/)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @seta/identity-client vitest run src/signIn.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// platform/identity-client/src/signIn.ts
export type SsoProviderId = 'entra'

export type DiscoverHit = {
  ok: true
  provider: 'entra'
  tenantSlug: string
  displayName: string
}
export type DiscoverMiss = { ok: false; error: 'no_workspace_for_email' }
export type DiscoverResult = DiscoverHit | DiscoverMiss

export interface SignInOptions {
  returnTo?: string
  fetch?: typeof fetch
  /** Override base path (rarely needed). */
  basePath?: string
}

export async function discover(email: string, opts: SignInOptions = {}): Promise<DiscoverResult> {
  const fetchImpl = opts.fetch ?? fetch
  const url = `${opts.basePath ?? ''}/sso/discover`
  const res = await fetchImpl(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(`sso discover failed: ${res.status}`)
  return (await res.json()) as DiscoverResult
}

export async function start(email: string, opts: SignInOptions = {}): Promise<{ url: string }> {
  const fetchImpl = opts.fetch ?? fetch
  const url = `${opts.basePath ?? ''}/sso/start`
  const res = await fetchImpl(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, returnTo: opts.returnTo ?? '/' }),
  })
  if (!res.ok) throw new Error(`sso start failed: ${res.status}`)
  return (await res.json()) as { url: string }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @seta/identity-client vitest run src/signIn.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (combine with E2 below — package's index export changes too)**

(skip commit until E2)

### Task E2: Last-login client reader

**Files:**
- Create: `platform/identity-client/src/LastLoginHint.ts`
- Create: `platform/identity-client/src/LastLoginHint.test.ts`
- Modify: `platform/identity-client/src/index.ts`

- [ ] **Step 1: Write the test**

```ts
// platform/identity-client/src/LastLoginHint.test.ts
import { describe, expect, it } from 'vitest'
import { readLastLoginHintCookie } from './LastLoginHint'

function makePayload(p: Record<string, unknown>): string {
  // base64url-encode the JSON string, then append a fake mac (the client
  // does not verify; it just decodes).
  const payloadB64 = Buffer.from(JSON.stringify(p), 'utf8').toString('base64url')
  return `${payloadB64}.unverifiedmac`
}

describe('readLastLoginHintCookie', () => {
  const cookieStr = (kv: Record<string, string>) =>
    Object.entries(kv).map(([k, v]) => `${k}=${v}`).join('; ')

  it('returns the embedded hint when present', () => {
    const c = cookieStr({
      seta_last_login: makePayload({
        email: 'a@b.com',
        provider: 'entra',
        tenantDisplayName: 'Acme',
        ts: 1700000000,
      }),
    })
    expect(readLastLoginHintCookie(c)).toEqual({
      email: 'a@b.com',
      provider: 'entra',
      tenantDisplayName: 'Acme',
      ts: 1700000000,
    })
  })

  it('returns null when cookie absent', () => {
    expect(readLastLoginHintCookie('seta_sess=foo')).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    expect(readLastLoginHintCookie('seta_last_login=garbage.mac')).toBeNull()
  })

  it('returns null on missing required fields', () => {
    const c = cookieStr({ seta_last_login: makePayload({ email: 'a@b.com' }) })
    expect(readLastLoginHintCookie(c)).toBeNull()
  })
})
```

- [ ] **Step 2: Implement**

```ts
// platform/identity-client/src/LastLoginHint.ts
export interface LastLoginHint {
  email: string
  provider: 'entra'
  tenantDisplayName: string
  ts: number
}

const COOKIE_NAME = 'seta_last_login'

function readCookieRaw(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const k = part.slice(0, eq).trim()
    if (k === COOKIE_NAME) return part.slice(eq + 1).trim()
  }
  return null
}

function fromBase64Url(s: string): string {
  // Browser-friendly base64url → utf-8 decode
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '==='.slice((b64.length + 3) % 4)
  if (typeof atob === 'function') {
    const bin = atob(padded)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  }
  // Node fallback (tests)
  return Buffer.from(padded, 'base64').toString('utf8')
}

export function readLastLoginHintCookie(cookieHeader?: string): LastLoginHint | null {
  const raw = readCookieRaw(cookieHeader ?? (typeof document !== 'undefined' ? document.cookie : undefined))
  if (!raw) return null
  const dot = raw.indexOf('.')
  if (dot < 1) return null
  const payloadB64 = raw.slice(0, dot)
  try {
    const json = JSON.parse(fromBase64Url(payloadB64)) as Partial<LastLoginHint>
    if (
      typeof json.email !== 'string' ||
      json.provider !== 'entra' ||
      typeof json.tenantDisplayName !== 'string' ||
      typeof json.ts !== 'number'
    ) {
      return null
    }
    return json as LastLoginHint
  } catch {
    return null
  }
}

export function clearLastLoginHintCookie(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
}
```

- [ ] **Step 3: Update the package index**

In `platform/identity-client/src/index.ts`, add:

```ts
export { discover, start } from './signIn'
export type { DiscoverHit, DiscoverMiss, DiscoverResult, SignInOptions, SsoProviderId } from './signIn'
export { readLastLoginHintCookie, clearLastLoginHintCookie } from './LastLoginHint'
export type { LastLoginHint } from './LastLoginHint'
export { LoginPage } from './LoginPage'
export type { LoginPageProps } from './LoginPage'
export { CallbackSplash } from './CallbackSplash'
export { RequireSession } from './RequireSession'
export { useMe } from './useMe'
```

Remove any old `signIn` (the single-function default export) entry.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @seta/identity-client vitest run src/LastLoginHint.test.ts src/signIn.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/identity-client/src/signIn.ts \
        platform/identity-client/src/signIn.test.ts \
        platform/identity-client/src/LastLoginHint.ts \
        platform/identity-client/src/LastLoginHint.test.ts \
        platform/identity-client/src/index.ts
git commit -m "feat(identity-client): discover/start + last-login cookie reader"
```

### Task E3: Rewrite `LoginPage` for email-first 2-state UI

**Files:**
- Modify: `platform/identity-client/src/LoginPage.tsx`
- Modify: `platform/identity-client/src/LoginPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// platform/identity-client/src/LoginPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

function mockFetchSequence(handlers: Array<(url: string, init?: RequestInit) => Response>): typeof fetch {
  let i = 0
  return ((url, init) => {
    const h = handlers[i++]
    if (!h) throw new Error('unexpected extra fetch')
    return Promise.resolve(h(url as string, init as RequestInit))
  }) as typeof fetch
}

describe('LoginPage State A (no last-login cookie)', () => {
  it('shows email input; discover hit then start navigates', async () => {
    // Replace fetch on globalThis for this test only
    const original = globalThis.fetch
    globalThis.fetch = mockFetchSequence([
      () =>
        new Response(JSON.stringify({ ok: true, provider: 'entra', tenantSlug: 'acme', displayName: 'Acme' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      () =>
        new Response(JSON.stringify({ url: 'https://login.microsoftonline.com/x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ])
    const setHref = vi.fn()
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
    try {
      render(<LoginPage returnTo="/" />)
      const input = screen.getByLabelText(/work email/i)
      await userEvent.type(input, 'alice@acme.com')
      await userEvent.click(screen.getByRole('button', { name: /continue/i }))
      await waitFor(() => expect(window.location.href).toMatch(/^https:\/\/login\.microsoftonline\.com/))
    } finally {
      globalThis.fetch = original
    }
  })

  it('shows an error on discover miss', async () => {
    const original = globalThis.fetch
    globalThis.fetch = mockFetchSequence([
      () =>
        new Response(JSON.stringify({ ok: false, error: 'no_workspace_for_email' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ])
    try {
      render(<LoginPage returnTo="/" />)
      await userEvent.type(screen.getByLabelText(/work email/i), 'alice@unknown.test')
      await userEvent.click(screen.getByRole('button', { name: /continue/i }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/no workspace/i)
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('LoginPage State B (last-login cookie present)', () => {
  it('renders "Continue as <email>" primary button', () => {
    const payload = {
      email: 'alice@acme.com',
      provider: 'entra',
      tenantDisplayName: 'Acme',
      ts: 1700000000,
    }
    const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    Object.defineProperty(document, 'cookie', {
      get: () => `seta_last_login=${b64}.mac`,
      configurable: true,
    })
    render(<LoginPage returnTo="/" />)
    expect(screen.getByRole('button', { name: /continue as alice@acme\.com/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /use a different account/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @seta/identity-client vitest run src/LoginPage.test.tsx`
Expected: FAIL (UI still has the old "Sign in with Microsoft" / Google buttons).

- [ ] **Step 3: Replace the implementation**

```tsx
// platform/identity-client/src/LoginPage.tsx
import { Button } from '@seta/ui'
import { Loader2, X } from 'lucide-react'
import { type FormEvent, type ReactElement, useEffect, useState } from 'react'
import { clearLastLoginHintCookie, type LastLoginHint, readLastLoginHintCookie } from './LastLoginHint'
import { discover, start } from './signIn'

export interface LoginPageProps {
  returnTo?: string
  title?: string
  subtitle?: string
  buildSha?: string
  termsUrl?: string
  privacyUrl?: string
  logoUrl?: string
  logoAlt?: string
}

export function LoginPage({
  returnTo = '/',
  title = 'Sign in to Seta',
  subtitle = 'Use your work email to continue.',
  buildSha = 'dev',
  termsUrl = '/legal/terms',
  privacyUrl = '/legal/privacy',
  logoUrl,
  logoAlt = 'Seta',
}: LoginPageProps) {
  const [hint, setHint] = useState<LastLoginHint | null>(null)
  useEffect(() => { setHint(readLastLoginHintCookie()) }, [])

  if (hint) {
    return (
      <Shell logoUrl={logoUrl} logoAlt={logoAlt} title={title} subtitle={subtitle} buildSha={buildSha} termsUrl={termsUrl} privacyUrl={privacyUrl}>
        <StateB hint={hint} returnTo={returnTo} onUseDifferent={() => { clearLastLoginHintCookie(); setHint(null) }} />
      </Shell>
    )
  }
  return (
    <Shell logoUrl={logoUrl} logoAlt={logoAlt} title={title} subtitle={subtitle} buildSha={buildSha} termsUrl={termsUrl} privacyUrl={privacyUrl}>
      <StateA returnTo={returnTo} />
    </Shell>
  )
}

function StateA({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const r = await discover(email)
      if (!r.ok) {
        setError(`We couldn't find a workspace for that email. Ask your admin to invite you.`)
        return
      }
      const { url } = await start(email, { returnTo })
      window.location.href = url
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="mt-6 flex flex-col gap-3" onSubmit={submit}>
      {error && <ErrorBanner text={error} onClear={() => setError(null)} />}
      <label className="text-[13px] text-ink-mute" htmlFor="email">Work email</label>
      <input
        id="email"
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-md border border-divider bg-canvas px-3 py-2 text-[14px] focus:border-primary focus:outline-none"
        placeholder="alice@example.com"
      />
      <Button type="submit" variant="primary" disabled={pending || !email}
        icon={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
        Continue
      </Button>
    </form>
  )
}

function StateB({ hint, returnTo, onUseDifferent }: { hint: LastLoginHint; returnTo: string; onUseDifferent: () => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setError(null); setPending(true)
    try {
      const { url } = await start(hint.email, { returnTo })
      window.location.href = url
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      {error && <ErrorBanner text={error} onClear={() => setError(null)} />}
      <p className="text-[14px] text-ink-mute">Welcome back to {hint.tenantDisplayName}.</p>
      <Button variant="primary" onClick={go} disabled={pending}
        icon={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
        aria-label={`Continue as ${hint.email}`}>
        Continue as {hint.email}
      </Button>
      <Button variant="secondary" onClick={onUseDifferent}>Use a different account</Button>
    </div>
  )
}

function ErrorBanner({ text, onClear }: { text: string; onClear: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-error/20 bg-error-soft px-3 py-2 text-[13px] text-error">
      <span className="flex-1">{text}</span>
      <button type="button" aria-label="Dismiss" onClick={onClear}
        className="-mr-1 -mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-error/70 hover:bg-error/10 hover:text-error">
        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
    </div>
  )
}

function Shell({
  children, logoUrl, logoAlt, title, subtitle, buildSha, termsUrl, privacyUrl,
}: {
  children: ReactElement
  logoUrl?: string; logoAlt: string; title: string; subtitle: string; buildSha: string
  termsUrl: string; privacyUrl: string
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#eef0fb_0%,#c7d2fe_35%,#a5b4fc_65%,#5e6ad2_100%)] px-4 py-12">
      <div className="w-full max-w-[400px] rounded-xl bg-canvas p-10 shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col items-center gap-2">
          {logoUrl ? <img src={logoUrl} alt={logoAlt} className="h-8 w-auto select-none" /> : <Wordmark />}
        </div>
        <div className="mt-8 space-y-1.5 text-center">
          <h1 className="font-semibold text-[26px] leading-[1.12] tracking-[-0.5px] text-ink">{title}</h1>
          <p className="text-[14px] leading-[1.5] text-ink-mute">{subtitle}</p>
        </div>
        {children}
        <div className="mt-8 flex flex-col items-center gap-1 text-center text-[12px] leading-[1.4] text-ink-mute">
          <div className="flex items-center gap-2">
            <a href={termsUrl} className="hover:text-ink hover:underline">Terms</a>
            <span aria-hidden="true">·</span>
            <a href={privacyUrl} className="hover:text-ink hover:underline">Privacy</a>
          </div>
          <div className="text-ink-subtle tabular-nums">v{buildSha}</div>
        </div>
      </div>
    </div>
  )
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-on-primary font-semibold text-[15px] leading-none tracking-[-0.2px] shadow-[0_2px_6px_rgba(94,106,210,0.35)]">S</span>
      <span className="font-semibold text-[18px] leading-none tracking-[-0.2px] text-ink">Seta</span>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @seta/identity-client vitest run src/LoginPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify the console app still compiles**

Run: `pnpm --filter @seta/console typecheck`
Expected: PASS. The `apps/console/src/routes/login.tsx` uses `<LoginPage>` with a `returnTo` and `logoUrl` — both still supported.

- [ ] **Step 6: Commit**

```bash
git add platform/identity-client/src/LoginPage.tsx \
        platform/identity-client/src/LoginPage.test.tsx
git commit -m "feat(identity-client)!: email-first LoginPage with last-login fast path"
```

---

## Phase F — Cleanup, docs, end-to-end verification

### Task F1: Update `.env.example` and `docs/QUICKSTART.md`

**Files:**
- Modify: `.env.example`
- Modify: `docs/QUICKSTART.md`

- [ ] **Step 1: Open `.env.example` and apply this diff**

Remove:
```
ENTRA_SSO_TENANT=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SSO_ENTRA_ENABLED=...
SSO_GOOGLE_ENABLED=...
```

Rename:
```
ENTRA_CLIENT_ID            → PLATFORM_CONNECTOR_CLIENT_ID
ENTRA_CLIENT_SECRET        → PLATFORM_CONNECTOR_CLIENT_SECRET
BOOTSTRAP_ENTRA_TENANT_ID  → BOOTSTRAP_SETA_ENTRA_TENANT_ID
```

Add:
```
# Seta-the-tenant's own SSO app (different reg from the connector app above)
BOOTSTRAP_SSO_CLIENT_ID=
BOOTSTRAP_SSO_CLIENT_SECRET=
BOOTSTRAP_SSO_EMAIL_DOMAINS=  # comma-separated, e.g. seta-international.vn
```

Group with header comments:
```
# ── Platform connector OAuth (Seta-owned multi-tenant Entra app for Graph API) ─
PLATFORM_CONNECTOR_CLIENT_ID=
PLATFORM_CONNECTOR_CLIENT_SECRET=

# ── First-tenant bootstrap (writes auth.sso_configs row for Seta itself) ──────
BOOTSTRAP_TENANT_SLUG=seta
BOOTSTRAP_TENANT_NAME=Seta
BOOTSTRAP_SETA_ENTRA_TENANT_ID=
BOOTSTRAP_SSO_CLIENT_ID=
BOOTSTRAP_SSO_CLIENT_SECRET=
BOOTSTRAP_SSO_EMAIL_DOMAINS=
BOOTSTRAP_SUPERADMIN_EMAILS=
BOOTSTRAP_CONNECTORS=ms365-planner,ms365-directory
BOOTSTRAP_OFFLINE=0
```

- [ ] **Step 2: Open `docs/QUICKSTART.md` and add a "First-time SSO setup" subsection**

Find the existing env section (introduced in commit `eb541d35` per the recent history). Add a new subsection right after the env table:

```markdown
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
   - Copy **Directory (tenant) ID** → `BOOTSTRAP_SETA_ENTRA_TENANT_ID`
5. **Certificates & secrets** → **New client secret** → copy the **Value**
   (not the Secret ID) → `BOOTSTRAP_SSO_CLIENT_SECRET`. This value is only
   shown once.
6. Set `BOOTSTRAP_SSO_EMAIL_DOMAINS` to a comma list of email domains
   whose users should resolve to Seta's tenant (typically
   `seta-international.vn`).
7. Run `pnpm migrate && pnpm seed:first-tenant`.

The platform connector Entra app (`PLATFORM_CONNECTOR_CLIENT_*`) is a
separate, Seta-operated multi-tenant Entra app used only for Graph API
access (Planner, Directory). It is unrelated to per-tenant SSO. For dev,
you may reuse the same app reg for both — but production should have two.
```

- [ ] **Step 3: Sanity-check the env loads**

Update your local `.env` to match `.env.example` (drop the old vars, add the new). Then:

Run: `pnpm --filter @seta/api typecheck && pnpm --filter @seta/api vitest run tests/integration/sso.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add .env.example docs/QUICKSTART.md
git commit -m "docs: env vars and quickstart for per-tenant SSO bootstrap"
```

### Task F2: Full check + final commit

**Files:** none new — verifies the whole repo.

- [ ] **Step 1: Run the repo-wide checks**

Run, in this order:
1. `pnpm install` (in case env changes caused workspace resolution drift)
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test:unit`
5. `pnpm test:integration`

Expected: all PASS.

- [ ] **Step 2: Hand-exercise login**

Run `pnpm dev` and in another terminal:
```bash
curl -sX POST -H 'content-type: application/json' \
  -d '{"email":"alice@seta-international.vn"}' \
  http://localhost:8080/sso/discover
```
Expected: `{"ok":true,"provider":"entra","tenantSlug":"seta","displayName":"Seta"}`.

Then:
```bash
curl -sX POST -H 'content-type: application/json' \
  -d '{"email":"alice@seta-international.vn","returnTo":"/"}' \
  http://localhost:8080/sso/start | jq .url
```
Expected: a `https://login.microsoftonline.com/<entra-tenant-id>/oauth2/v2.0/authorize?...` URL containing `login_hint=alice@seta-international.vn`.

- [ ] **Step 3: Open the console and verify the new login UI**

In a browser, open `http://localhost:8080/console/login`.
Expected: see the email-entry form. Type a known email and submit. Browser navigates to Microsoft's sign-in page (matching the curl URL above).

- [ ] **Step 4: Add a changeset (the `@seta/identity` package is private but its consumers may be public)**

Run: `pnpm changeset`
Choose: any non-private packages touched in this PR (likely none directly, but `@seta/identity-client` is published as a consumer if it isn't private — check `package.json` `"private"` field). Add a short summary of the breaking change.

- [ ] **Step 5: Final commit + push**

```bash
git status   # should be clean
git push -u origin <branch>
gh pr create --title "feat(identity)!: per-tenant Entra SSO foundation (PR 1)" \
  --body "$(cat <<'EOF'
## Summary
- Per-tenant Entra SSO: tenant config in `auth.sso_configs`, secret in existing KMS vault, authority built per request from `entra_tenant_id`.
- Email-first tenant discovery via `auth.sso_email_domains` + SECURITY DEFINER resolver.
- New routes `POST /sso/discover`, `POST /sso/start`, `GET /sso/callback/entra`. Old `POST /sso/login/:provider` deleted.
- Auto-join on domain-match (`source='sso_domain_match'`).
- Signed `seta_last_login` cookie for one-click re-login.
- Env: `PLATFORM_CONNECTOR_CLIENT_*` (renamed), `BOOTSTRAP_SSO_*` (new). Google SSO and `ENTRA_SSO_TENANT` deleted.
- Seed script writes Seta's SSO config + email domains.

Spec: `docs/superpowers/specs/2026-05-18-byo-idp-sso-design.md`
Subsequent PRs: superadmin admin UI (PR 2), @seta/mailer (PR 3), magic-link break-glass (PR 4).

## Test plan
- [ ] pnpm typecheck && pnpm lint
- [ ] pnpm test:unit && pnpm test:integration
- [ ] Manual: hit /sso/discover and /sso/start against local seeded tenant
- [ ] Manual: complete the full login round-trip against a real Entra app reg
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Data model (`auth.sso_configs`, `auth.sso_email_domains`, `auth.magic_links`) → Task A1, A2, A3 ✅
- Provider factory + discriminated union → Task B2, B4 ✅
- Email-first login (`/sso/discover` + `/sso/start` + `/sso/callback/entra`) → Task C2, tests C3 ✅
- Issuer + email-domain checks at callback → Task C2 (in code), C3 (tests) ✅
- Auto-join on domain match → Task C2 (calls `autoJoinOnDomain`), D2 (wires it to a real INSERT) ✅
- Last-login cookie set on callback, read by `LoginPage` → Task B6, C2, E2, E3 ✅
- Env var rename/drop/add → Task D1 ✅
- Bootstrap script changes → Task D3 ✅
- LoginPage email-first 2-state → Task E3 ✅
- Google removal → Task C4, D1 ✅
- Docs (.env.example, QUICKSTART) → Task F1 ✅
- Magic-link table only (no routes) → Task A1, A3 ✅
- ADR — **deferred to PR 1 commit message body**; the ADR file itself can land in PR 2 since the BYO-IdP decision is observable from PR 1 code.

**Placeholder scan:** no TBD/TODO/"add appropriate error handling" / "similar to Task N" remaining. Every code step shows the full content.

**Type consistency:**
- `SsoConfigDiscriminated` defined in B2, used the same way in B4, C2, D2, D3 ✅
- `getClientSecret`, `getTenantBrief`, `autoJoinOnDomain` deps named consistently in C2 (routes), D2 (wiring), C3 (tests) ✅
- `LastLoginHint` shape defined in B6, mirrored client-side in E2 ✅
- `STATE_COOKIE_NAME`, `LAST_LOGIN_COOKIE_NAME` defined exactly once each ✅

**Scope check:** PR 1 is a single coherent slice (login works end-to-end on the new model). Subsequent PRs (admin UI, mailer, magic-link) get their own plans after this one merges.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-18-byo-idp-sso-pr1-foundation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session, batch execution with checkpoints.

Which approach?

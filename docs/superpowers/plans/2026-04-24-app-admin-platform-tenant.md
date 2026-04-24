# App Admin Platform Tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the professional SaaS admin foundation for Future: tenant discovery login, backend-owned SSO, platform-admin tenant context, org admin configuration, secret workflows, and aligned admin UI.

**Architecture:** Keep `web-admin` as the single admin zone with System mode for `platform_admin` and Org mode for both `platform_admin` and `tenant_admin`. Move SSO from shell-owned static config to an API-owned auth gateway where shell renders login options and API performs OAuth exchange with tenant secrets from AWS Secrets Manager. Preserve DDD boundaries by adding module-owned commands/queries and consuming cross-module data through facades.

**Tech Stack:** Next.js multi-zone apps (`apps/web-shell`, `apps/web-admin`), NestJS CQRS/tRPC (`apps/api`), Drizzle/PostgreSQL, AWS Secrets Manager, `@future/ui`, `@future/app-layout`, Vitest, Playwright, Bun/Turbo.

---

## Scope Check

The spec spans several subsystems. Implement this as sequential, independently testable slices. Each task can ship as its own PR, but the full feature is complete only after Task 10.

Do not switch branches during execution unless the user explicitly asks. The current branch after brainstorming is `feat/app-admin-platform-tenant-design`.

Before any implementation work:

- Read [the design spec](../specs/2026-04-24-app-admin-platform-tenant-design.md).
- Read `DESIGN.md` before UI work.
- Preserve existing unrelated staged agent changes. Do not revert them.
- For a fresh worktree, run `bun run --filter "@future/*" build` before package tests if `@future/...` packages fail to resolve.

## File Map

Planned ownership and responsibilities:

- `apps/api/src/common/auth/permissions.ts` - single permission registry; add platform/admin/AI/module permissions used by routers and nav.
- `apps/api/src/modules/kernel/**` - system tenant bootstrap, platform admin authority checks, tenant list/create/status commands, target-tenant authorization helpers.
- `apps/api/src/modules/identity/**` - login discovery, tenant domains, OAuth sessions, backend-owned OAuth start/callback, IdP secret create/rotate/test.
- `apps/api/src/modules/admin/**` - tenant profile settings, generalized module toggles, tenant AI provider config.
- `apps/api/src/modules/agents/**` - consume tenant AI provider config through an admin facade; keep runtime cost/budget behavior in agents.
- `apps/api/src/common/trpc/app-router.ts` and `apps/api/src/common/trpc/trpc.module.ts` - wire new routers without stale placeholder shims.
- `apps/web-shell/src/app/auth/login/page.tsx` - tenant discovery first, then org-branded login options.
- `apps/web-shell/src/app/auth/callback/microsoft/route.ts` - pass `code/state` to API; stop exchanging tokens in shell.
- `apps/web-shell/src/lib/auth-config.ts` - remove tenant-specific Microsoft static config; retain cookie and API base URL config.
- `apps/web-admin/src/navigation.ts` - use real permission keys and System/Org mode navigation.
- `apps/web-admin/src/app/**` - system dashboard and org admin pages.
- `packages/db/drizzle/migrations/0000_initial.sql` and `packages/db/drizzle/migrations/meta/**` - regenerated initial migration only, per repo rule.
- `apps/e2e/src/**` - Playwright critical admin/auth flows.

## Shared Commands

Use targeted commands while iterating:

```bash
bun run --cwd apps/api test:unit -- <spec-path>
bun run --cwd apps/api test:integration -- <spec-path>
bun run --cwd apps/web-shell typecheck
bun run --cwd apps/web-admin typecheck
bun run --cwd apps/web-shell lint
bun run --cwd apps/web-admin lint
bun run --cwd apps/api typecheck
bun run --cwd apps/api lint
```

For schema changes during development:

```bash
bun run db:generate --name initial
bun run db:down -v && bun run db:up && bun run db:migrate
```

Do not add numbered migrations.

## Task 1: Permission Registry And Admin Navigation Alignment

**Files:**

- Modify: `apps/api/src/common/auth/permissions.ts`
- Modify: `apps/api/src/modules/admin/interface/trpc/admin.router.ts`
- Modify: `apps/api/src/modules/identity/interface/trpc/identity.router.ts`
- Modify: `apps/web-admin/src/navigation.ts`
- Test: `apps/api/src/common/auth/permissions.spec.ts`
- Test: `apps/api/src/modules/admin/interface/trpc/admin.router.spec.ts`
- Test: `apps/api/src/modules/identity/interface/trpc/identity.router.spec.ts`
- Test: `apps/web-admin/src/navigation.spec.ts`

- [ ] **Step 1: Write failing permission registry tests**

Add a spec that asserts the admin permission keys used by admin nav and routers exist in `PERMISSION_KEY_SET`.

```ts
import { PERMISSION_KEY_SET, PERMISSIONS } from './permissions'

describe('admin permissions', () => {
  it('registers platform and tenant admin permission keys', () => {
    expect(PERMISSION_KEY_SET.has(PERMISSIONS.ADMIN_PLATFORM_READ)).toBe(true)
    expect(PERMISSION_KEY_SET.has(PERMISSIONS.ADMIN_PLATFORM_MANAGE)).toBe(true)
    expect(PERMISSION_KEY_SET.has(PERMISSIONS.ADMIN_TENANT_SWITCH)).toBe(true)
    expect(PERMISSION_KEY_SET.has(PERMISSIONS.ADMIN_AI_READ)).toBe(true)
    expect(PERMISSION_KEY_SET.has(PERMISSIONS.ADMIN_AI_MANAGE)).toBe(true)
    expect(PERMISSION_KEY_SET.has(PERMISSIONS.ADMIN_MODULE_READ)).toBe(true)
    expect(PERMISSION_KEY_SET.has(PERMISSIONS.ADMIN_MODULE_MANAGE)).toBe(true)
  })
})
```

- [ ] **Step 2: Write failing web-admin nav test**

Create `apps/web-admin/src/navigation.spec.ts` to walk `adminNavConfig.sidebar` and assert every permission is in a local copy of the exported admin permission keys. Keep this pure TypeScript; do not render React.

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
bun run --cwd apps/api test:unit -- src/common/auth/permissions.spec.ts
bun run --cwd apps/web-admin typecheck
```

Expected: fail because the new permission constants and nav test support do not exist yet.

- [ ] **Step 4: Add permission constants**

Extend `PERMISSIONS` in `apps/api/src/common/auth/permissions.ts`:

```ts
ADMIN_PLATFORM_READ: 'admin:platform:read',
ADMIN_PLATFORM_MANAGE: 'admin:platform:manage',
ADMIN_TENANT_SWITCH: 'admin:tenant:switch',
ADMIN_AI_READ: 'admin:ai:read',
ADMIN_AI_MANAGE: 'admin:ai:manage',
ADMIN_MODULE_READ: 'admin:module:read',
ADMIN_MODULE_MANAGE: 'admin:module:manage',
```

Keep existing permission names. Do not introduce deprecated aliases.

- [ ] **Step 5: Update router metadata and nav**

Replace literal permission strings in admin and identity routers with `PERMISSIONS.*` imports where practical. Update `apps/web-admin/src/navigation.ts` so labels use existing or newly registered keys:

- Tenant Settings: `admin:tenant:read`
- AI Config: `admin:ai:read`
- Module Toggles: `admin:module:read`
- Roles & Permissions: `admin:role:read`
- Agent admin pages: use `admin:agent:read`, not `admin:agents:read`

- [ ] **Step 6: Run targeted tests**

Run:

```bash
bun run --cwd apps/api test:unit -- src/common/auth/permissions.spec.ts src/modules/admin/interface/trpc/admin.router.spec.ts src/modules/identity/interface/trpc/identity.router.spec.ts
bun run --cwd apps/web-admin typecheck
bun run --cwd apps/web-admin lint
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/auth/permissions.ts apps/api/src/common/auth/permissions.spec.ts apps/api/src/modules/admin/interface/trpc/admin.router.ts apps/api/src/modules/admin/interface/trpc/admin.router.spec.ts apps/api/src/modules/identity/interface/trpc/identity.router.ts apps/api/src/modules/identity/interface/trpc/identity.router.spec.ts apps/web-admin/src/navigation.ts apps/web-admin/src/navigation.spec.ts
git commit -m "feat(admin): align admin permissions"
```

## Task 2: Identity Tenant Domains And OAuth Session Schema

**Files:**

- Modify: `apps/api/src/modules/identity/infrastructure/schema/identity.schema.ts`
- Create: `apps/api/src/modules/identity/domain/entities/tenant-domain.entity.ts`
- Create: `apps/api/src/modules/identity/domain/entities/oauth-authorization-session.entity.ts`
- Create: `apps/api/src/modules/identity/domain/repositories/tenant-domain.repository.ts`
- Create: `apps/api/src/modules/identity/domain/repositories/oauth-authorization-session.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-tenant-domain.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-oauth-authorization-session.repository.ts`
- Modify: `apps/api/src/modules/identity/identity.module.ts`
- Test: co-located unit and integration specs for the new entities/repositories.
- Generate: `packages/db/drizzle/migrations/0000_initial.sql`

- [ ] **Step 1: Write failing entity tests**

Create tests for verified tenant domain and OAuth authorization session entities:

```ts
it('rejects unverified domain for login discovery', () => {
  const domain = TenantDomainEntity.create({
    tenantId: 'tenant-id',
    domain: 'example.com',
    status: 'pending',
    verificationTokenHash: 'hash',
  })
  expect(domain.isUsableForLogin()).toBe(false)
})
```

```ts
it('expires oauth sessions by timestamp', () => {
  const session = OAuthAuthorizationSessionEntity.create({
    id: 'session-id',
    tenantId: 'tenant-id',
    providerId: 'provider-id',
    providerType: 'microsoft',
    nonceHash: 'nonce-hash',
    stateHash: 'state-hash',
    redirectTo: 'http://localhost:3001',
    expiresAt: new Date('2026-04-24T10:00:00Z'),
  })
  expect(session.isExpired(new Date('2026-04-24T10:01:00Z'))).toBe(true)
})
```

- [ ] **Step 2: Write failing repository integration tests**

Use a real DB integration spec to assert:

- `tenant_domain` unique per domain.
- only verified domains are returned for login discovery.
- OAuth session lookup consumes a session once.
- expired OAuth session cannot be consumed.
- tenant isolation is preserved by explicit tenant filters.

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
bun run --cwd apps/api test:unit -- src/modules/identity/domain/entities/tenant-domain.entity.spec.ts src/modules/identity/domain/entities/oauth-authorization-session.entity.spec.ts
bun run --cwd apps/api test:integration -- src/modules/identity/infrastructure/repositories/drizzle-tenant-domain.repository.integration.spec.ts src/modules/identity/infrastructure/repositories/drizzle-oauth-authorization-session.repository.integration.spec.ts
```

Expected: fail because files/tables do not exist.

- [ ] **Step 4: Add Drizzle schema**

Add identity tables:

```ts
export const tenantDomain = identitySchema.table(
  'tenant_domain',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    domain: text('domain').notNull(),
    status: text('status', { enum: ['pending', 'verified', 'disabled'] })
      .notNull()
      .default('pending'),
    verificationTokenHash: text('verification_token_hash').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('tenant_domain_domain_uidx').on(table.domain)],
)
```

```ts
export const oauthAuthorizationSession = identitySchema.table(
  'oauth_authorization_session',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    providerId: uuid('provider_id').notNull(),
    providerType: text('provider_type', { enum: ['microsoft', 'google'] }).notNull(),
    stateHash: text('state_hash').notNull(),
    nonceHash: text('nonce_hash').notNull(),
    redirectTo: text('redirect_to').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('oauth_authorization_session_state_uidx').on(table.stateHash),
    index('oauth_authorization_session_tenant_idx').on(table.tenantId, table.createdAt),
  ],
)
```

- [ ] **Step 5: Implement domain entities and repositories**

Keep repository interfaces in `domain/repositories/`, not `domain/ports/`. Use sequential DB calls. No cross-module imports from another module's domain or infrastructure.

- [ ] **Step 6: Register providers in `IdentityModule`**

Add repository tokens and implementations to `apps/api/src/modules/identity/identity.module.ts`.

- [ ] **Step 7: Regenerate the initial migration**

Run:

```bash
rm -f packages/db/drizzle/migrations/*.sql
rm -rf packages/db/drizzle/migrations/meta
bun run db:generate --name initial
```

Then verify:

```bash
rg -n "tenant_domain|oauth_authorization_session" packages/db/drizzle/migrations/0000_initial.sql
```

Expected: both new tables exist in `0000_initial.sql`.

- [ ] **Step 8: Run targeted tests**

Run the unit and integration commands from Step 3. Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/identity packages/db/drizzle
git commit -m "feat(identity): add tenant domains and oauth sessions"
```

## Task 3: Tenant Discovery And Public Login Options

**Files:**

- Create: `apps/api/src/modules/identity/application/queries/get-login-options.query.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-login-options.handler.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-login-options.handler.spec.ts`
- Modify: `apps/api/src/modules/identity/application/facades/identity-query.facade.ts`
- Create: `apps/api/src/modules/identity/interface/trpc/auth-gateway.router.ts`
- Create: `apps/api/src/modules/identity/interface/trpc/auth-gateway.router.spec.ts`
- Modify: `apps/api/src/common/trpc/app-router.ts`
- Modify: `apps/api/src/common/trpc/trpc.module.ts`

- [ ] **Step 1: Write failing query tests**

Cover:

- slug resolves tenant.
- verified email domain resolves tenant.
- pending domain does not resolve tenant.
- suspended tenant returns no startable SSO methods.
- public login options do not expose `clientSecretRef`.

Use fakes for `KernelQueryFacade`, identity-provider repo, and tenant-domain repo.

- [ ] **Step 2: Write failing router test**

Assert `identity.auth.getLoginOptions` exists and returns the handler result.

- [ ] **Step 3: Run tests to verify failure**

```bash
bun run --cwd apps/api test:unit -- src/modules/identity/application/queries/get-login-options.handler.spec.ts src/modules/identity/interface/trpc/auth-gateway.router.spec.ts
```

Expected: fail because query/router do not exist.

- [ ] **Step 4: Implement `GetLoginOptionsHandler`**

Handler dependencies:

- `KernelQueryFacade` for tenant lookup by slug or tenant metadata. If a facade method is missing, add it in Task 4 instead of importing kernel repositories.
- tenant-domain repository for verified domain lookup.
- identity-provider repository for primary IdP.

Output shape follows the design spec. Return only public fields:

```ts
{
  tenant: { id, slug, name, status },
  methods: [
    {
      type: provider.providerType,
      displayName: provider.displayName,
      clientId: provider.clientId,
      directoryId: provider.directoryId,
      status: provider.syncStatus === 'failed' ? 'needs_attention' : 'ready',
    },
  ],
}
```

Do not return `clientSecretRef`.

- [ ] **Step 5: Add `identity.auth` router**

Create `auth-gateway.router.ts` with:

- `getLoginOptions`
- placeholder exports for `startOAuth` and `completeOAuth` only after Task 5 adds handlers

Use `publicProcedure` only for discovery/start/complete auth gateway procedures. Do not require a Future session for login start.

- [ ] **Step 6: Wire router into app router**

In `app-router.ts`, merge `authGatewayRouter` into `identity` under `auth`. Avoid backward-compatible duplicates once shell callers are updated.

- [ ] **Step 7: Run targeted tests**

```bash
bun run --cwd apps/api test:unit -- src/modules/identity/application/queries/get-login-options.handler.spec.ts src/modules/identity/interface/trpc/auth-gateway.router.spec.ts
bun run --cwd apps/api typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/identity/application/queries apps/api/src/modules/identity/application/facades/identity-query.facade.ts apps/api/src/modules/identity/interface/trpc/auth-gateway.router.ts apps/api/src/modules/identity/interface/trpc/auth-gateway.router.spec.ts apps/api/src/common/trpc/app-router.ts apps/api/src/common/trpc/trpc.module.ts
git commit -m "feat(identity): expose login discovery"
```

## Task 4: Kernel System Tenant Bootstrap And Platform Authority

**Files:**

- Modify: `apps/api/src/modules/kernel/domain/repositories/tenant.repository.port.ts`
- Modify: `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-tenant.repository.ts`
- Modify: `apps/api/src/modules/kernel/application/facades/kernel-query.facade.ts`
- Create: `apps/api/src/modules/kernel/application/commands/bootstrap-platform-admin.command.ts`
- Create: `apps/api/src/modules/kernel/application/commands/bootstrap-platform-admin.handler.ts`
- Create: `apps/api/src/modules/kernel/application/commands/bootstrap-platform-admin.handler.spec.ts`
- Create: `apps/api/src/modules/kernel/application/queries/list-tenants.handler.ts`
- Create: `apps/api/src/modules/kernel/application/queries/list-tenants.query.ts`
- Create: `apps/api/src/modules/kernel/application/queries/list-tenants.handler.spec.ts`
- Modify: `apps/api/src/modules/kernel/kernel.module.ts`
- Modify: `apps/api/src/seeds/seed.ts`

- [ ] **Step 1: Write failing bootstrap tests**

Cover:

- creates hidden system tenant if missing.
- creates actor/user identity for `FUTURE_PLATFORM_ADMIN_EMAIL`.
- grants `platform_admin` in system tenant.
- is idempotent.
- does not set passwords or raw secrets.

- [ ] **Step 2: Write failing tenant list tests**

`platform_admin` should list active/suspended/cancelled tenants. A regular tenant admin should not call the platform route; route enforcement is covered in Task 6.

- [ ] **Step 3: Run tests to verify failure**

```bash
bun run --cwd apps/api test:unit -- src/modules/kernel/application/commands/bootstrap-platform-admin.handler.spec.ts src/modules/kernel/application/queries/list-tenants.handler.spec.ts
```

Expected: fail.

- [ ] **Step 4: Add tenant repository methods**

Add methods through the repository interface:

```ts
findBySlug(slug: string): Promise<Tenant | null>
findAll(): Promise<Tenant[]>
upsertSystemTenant(data: { id: string; slug: string; name: string }): Promise<Tenant>
```

Use existing `findAll` if already present. Do not expose raw Drizzle tables outside infrastructure.

- [ ] **Step 5: Implement bootstrap command**

Use existing kernel repositories for tenant, actor, user identity, role grant, and role permissions. The command should:

- read the configured email from command input, not directly from process env.
- create or find `future-system`.
- create or find a person actor for the email.
- create or claim local placeholder user identity.
- grant `platform_admin`.
- seed role permissions for the system tenant if needed.

- [ ] **Step 6: Call bootstrap from seed**

Update `apps/api/src/seeds/seed.ts` so:

- it reads `FUTURE_PLATFORM_ADMIN_EMAIL`.
- if present, bootstraps the platform admin.
- it removes hardcoded Entra fallback secrets from the seed path.
- it never stores raw Entra client secret as `clientSecretRef`.

- [ ] **Step 7: Run targeted tests**

```bash
bun run --cwd apps/api test:unit -- src/modules/kernel/application/commands/bootstrap-platform-admin.handler.spec.ts src/modules/kernel/application/queries/list-tenants.handler.spec.ts
bun run --cwd apps/api typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/kernel apps/api/src/seeds/seed.ts
git commit -m "feat(kernel): bootstrap platform admin"
```

## Task 5: Backend-Owned OAuth Start And Callback

**Files:**

- Create: `apps/api/src/modules/identity/application/commands/start-oauth.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/start-oauth.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/start-oauth.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/commands/complete-oauth.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/complete-oauth.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/complete-oauth.handler.spec.ts`
- Create: `apps/api/src/modules/identity/domain/ports/oauth-token-exchanger.port.ts`
- Create: `apps/api/src/modules/identity/infrastructure/oauth/microsoft-oauth-token-exchanger.ts`
- Create: `apps/api/src/modules/identity/infrastructure/oauth/microsoft-oauth-token-exchanger.spec.ts`
- Modify: `apps/api/src/modules/identity/interface/trpc/auth-gateway.router.ts`
- Modify: `apps/api/src/modules/identity/identity.module.ts`

- [ ] **Step 1: Write failing start OAuth tests**

Cover:

- active tenant and ready provider returns Microsoft authorization URL.
- suspended tenant throws.
- missing provider throws.
- state and nonce are stored hashed only.
- redirect target is constrained to allowed Future zone URLs.

- [ ] **Step 2: Write failing complete OAuth tests**

Cover:

- consumes state once.
- loads `clientSecretRef` through `SECRETS_STORE`.
- exchanges code via `OAUTH_TOKEN_EXCHANGER`.
- validates ID token issuer/audience/nonce/expiry/email.
- rejects Microsoft `tid` mismatch.
- resolves Future login and returns session token.

- [ ] **Step 3: Run tests to verify failure**

```bash
bun run --cwd apps/api test:unit -- src/modules/identity/application/commands/start-oauth.handler.spec.ts src/modules/identity/application/commands/complete-oauth.handler.spec.ts
```

Expected: fail.

- [ ] **Step 4: Implement OAuth token exchanger port**

Port input:

```ts
export interface OAuthTokenExchangeInput {
  tokenEndpoint: string
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
  scope: string
}
```

Port result:

```ts
export interface OAuthTokenExchangeResult {
  idToken: string
  accessToken: string
  tokenType: string
  expiresIn: number
}
```

- [ ] **Step 5: Implement start OAuth handler**

Build the Microsoft authorize URL from tenant provider metadata, not shell env:

```ts
const authorizationUrl = new URL(
  `https://login.microsoftonline.com/${provider.directoryId}/oauth2/v2.0/authorize`,
)
authorizationUrl.searchParams.set('client_id', provider.clientId)
authorizationUrl.searchParams.set('response_type', 'code')
authorizationUrl.searchParams.set('redirect_uri', callbackUri)
authorizationUrl.searchParams.set('scope', 'openid profile email')
authorizationUrl.searchParams.set('response_mode', 'query')
authorizationUrl.searchParams.set('state', opaqueState)
authorizationUrl.searchParams.set('nonce', nonce)
```

- [ ] **Step 6: Implement complete OAuth handler**

Use `jose` or existing JWT utilities to validate ID token. Do not decode without validation. Return Future session token using the existing JWT service path.

- [ ] **Step 7: Wire tRPC procedures**

Add:

- `identity.auth.startOAuth`
- `identity.auth.completeOAuth`

Use public procedures. Validate all inputs with zod.

- [ ] **Step 8: Run targeted tests**

```bash
bun run --cwd apps/api test:unit -- src/modules/identity/application/commands/start-oauth.handler.spec.ts src/modules/identity/application/commands/complete-oauth.handler.spec.ts src/modules/identity/interface/trpc/auth-gateway.router.spec.ts
bun run --cwd apps/api typecheck
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/identity
git commit -m "feat(identity): move oauth exchange to api"
```

## Task 6: Platform Tenant Context APIs

**Files:**

- Create: `apps/api/src/modules/admin/application/queries/list-platform-tenants.query.ts`
- Create: `apps/api/src/modules/admin/application/queries/list-platform-tenants.handler.ts`
- Create: `apps/api/src/modules/admin/application/queries/list-platform-tenants.handler.spec.ts`
- Create: `apps/api/src/modules/admin/application/commands/update-target-tenant-status.command.ts`
- Create: `apps/api/src/modules/admin/application/commands/update-target-tenant-status.handler.ts`
- Create: `apps/api/src/modules/admin/application/commands/update-target-tenant-status.handler.spec.ts`
- Modify: `apps/api/src/modules/admin/interface/trpc/admin.router.ts`
- Modify: `apps/api/src/modules/admin/interface/trpc/admin-router.service.ts`
- Modify: `apps/api/src/modules/admin/admin.module.ts`
- Test: `apps/api/src/modules/admin/interface/trpc/admin.router.spec.ts`

- [ ] **Step 1: Write failing authorization tests**

Use the router caller pattern to assert:

- `admin.platform.listTenants` requires `admin:platform:read`.
- `admin.platform.updateTenantStatus` requires `admin:platform:manage`.
- tenant admin without platform permission receives forbidden.
- platform admin can specify target tenant id.

- [ ] **Step 2: Write failing handler tests**

Cover:

- list tenants returns safe org summary.
- update tenant status records audit with `targetTenantId`.
- cannot suspend the hidden system tenant.

- [ ] **Step 3: Run tests to verify failure**

```bash
bun run --cwd apps/api test:unit -- src/modules/admin/application/queries/list-platform-tenants.handler.spec.ts src/modules/admin/application/commands/update-target-tenant-status.handler.spec.ts src/modules/admin/interface/trpc/admin.router.spec.ts
```

Expected: fail.

- [ ] **Step 4: Implement platform admin router section**

In `createAdminRouter`, add:

```ts
platform: router({
  listTenants: permissionProtectedProcedure
    .meta({ permission: PERMISSIONS.ADMIN_PLATFORM_READ })
    .input(z.object({}))
    .query(...),
  updateTenantStatus: permissionProtectedProcedure
    .meta({ permission: PERMISSIONS.ADMIN_PLATFORM_MANAGE })
    .input(z.object({
      tenantId: z.string().uuid(),
      status: z.enum(['active', 'suspended', 'cancelled']),
    }))
    .mutation(...),
})
```

- [ ] **Step 5: Implement audit payload**

Record:

```ts
payload: {
  targetTenantId: command.targetTenantId,
  previousStatus,
  nextStatus: command.status,
}
```

No secrets or unrelated tenant data.

- [ ] **Step 6: Run targeted tests**

Run the command from Step 3 plus:

```bash
bun run --cwd apps/api typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/admin
git commit -m "feat(admin): add platform tenant context api"
```

## Task 7: Shell Tenant Discovery Login UI

**Files:**

- Modify: `apps/web-shell/src/lib/auth-config.ts`
- Create: `apps/web-shell/src/lib/auth-gateway-client.ts`
- Create: `apps/web-shell/src/lib/auth-gateway-client.spec.ts`
- Modify: `apps/web-shell/src/app/auth/login/page.tsx`
- Create: `apps/web-shell/src/app/auth/login/page.spec.tsx`
- Modify: `apps/web-shell/src/app/auth/callback/microsoft/route.ts`
- Create: `apps/web-shell/src/app/auth/callback/microsoft/route.spec.ts`
- Modify: `apps/web-shell/src/app/api/auth/magic-link/route.ts`

- [ ] **Step 1: Write failing client tests**

Test that `auth-gateway-client` calls:

- `identity.auth.getLoginOptions`
- `identity.auth.startOAuth`
- `identity.auth.completeOAuth`

and normalizes tRPC responses.

- [ ] **Step 2: Write failing login page tests**

Render the login page and assert:

- initial screen asks for email or org slug.
- provider buttons are not rendered before discovery.
- discovered Microsoft option renders tenant name and "Continue with Microsoft".
- clicking Microsoft calls `startOAuth` and redirects to returned URL.

- [ ] **Step 3: Write failing callback route tests**

Assert callback route:

- forwards `code` and `state` to API.
- sets `_future_session` on success.
- redirects to returned `redirectTo`.
- does not exchange token with Microsoft directly.

- [ ] **Step 4: Run tests to verify failure**

```bash
bun run --cwd apps/web-shell typecheck
bun run --cwd apps/web-shell lint
```

If the app does not yet have a frontend test runner, record that gap in the task PR and cover with Playwright in Task 10.

- [ ] **Step 5: Remove static Microsoft tenant config**

In `auth-config.ts`, keep:

- `SESSION_COOKIE_NAME`
- `SESSION_MAX_AGE_SECONDS`
- `COOKIE_OPTIONS`
- `API_BASE_URL`

Remove tenant-specific `MICROSOFT_CONFIG` values from shell runtime. Shell may keep a global callback URL only if the API needs it as a configured redirect.

- [ ] **Step 6: Implement discovery-first UI**

Use `@future/ui`:

- `Input` for email/org.
- `Button` for discovery and provider actions.
- `Alert` for errors.
- `Spinner` for pending actions.

Do not use raw `<button>` or raw `<input>`.

- [ ] **Step 7: Update magic link route**

Magic link request must include discovered tenant id. Do not rely on `NEXT_PUBLIC_TENANT_ID`.

- [ ] **Step 8: Run checks**

```bash
bun run --cwd apps/web-shell typecheck
bun run --cwd apps/web-shell lint
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add apps/web-shell
git commit -m "feat(shell): add tenant discovery login"
```

## Task 8: Admin System Dashboard And Org Context UI

**Files:**

- Modify: `apps/web-admin/src/navigation.ts`
- Modify: `apps/web-admin/src/app/page.tsx`
- Create: `apps/web-admin/src/app/system/platform-admins/page.tsx`
- Create: `apps/web-admin/src/app/org/[tenantId]/layout.tsx`
- Create: `apps/web-admin/src/app/org/[tenantId]/overview/page.tsx`
- Create: `apps/web-admin/src/lib/admin-api.ts`
- Create: `apps/web-admin/src/components/system/organization-table.tsx`
- Create: `apps/web-admin/src/components/system/org-context-switcher.tsx`
- Create: `apps/web-admin/src/components/admin-page-header.tsx`
- Test: co-located specs where existing frontend test setup supports it.

- [ ] **Step 1: Write failing component/page tests**

Cover:

- platform admin dashboard renders organization table.
- tenant admin does not render org switcher.
- org header shows active org.
- org table uses `DataTable` and `Button`, not raw interactive HTML.

- [ ] **Step 2: Run tests/checks to verify failure**

```bash
bun run --cwd apps/web-admin typecheck
bun run --cwd apps/web-admin lint
```

Expected: fail until components exist.

- [ ] **Step 3: Implement `admin-api.ts`**

Wrap tRPC calls behind typed helpers because some current generated router slots are `any`.

```ts
export async function listPlatformTenants() {
  return admin.platform.listTenants.query({})
}
```

Keep the wrapper narrow and delete casts when router types are repaired.

- [ ] **Step 4: Implement system dashboard**

Use `DataTable` columns:

- name
- slug
- status
- plan tier
- primary IdP
- verified domains
- modules
- AI key status
- last admin activity

Actions:

- enter org admin
- suspend/reactivate

- [ ] **Step 5: Implement org context layout**

For platform admins, route `/org/[tenantId]/overview` should set target tenant context for admin API calls by passing `tenantId` explicitly to platform-safe procedures. Do not mutate the Future session cookie in this task.

- [ ] **Step 6: Run checks**

```bash
bun run --cwd apps/web-admin typecheck
bun run --cwd apps/web-admin lint
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web-admin
git commit -m "feat(web-admin): add system dashboard"
```

## Task 9: Org Admin Configuration APIs And Pages

**Files:**

- Modify: `apps/api/src/modules/admin/infrastructure/schema/admin.schema.ts`
- Create: `apps/api/src/modules/admin/application/queries/get-tenant-admin-summary.query.ts`
- Create: `apps/api/src/modules/admin/application/queries/get-tenant-admin-summary.handler.ts`
- Create: `apps/api/src/modules/admin/application/commands/update-module-toggles.command.ts`
- Create: `apps/api/src/modules/admin/application/commands/update-module-toggles.handler.ts`
- Create: `apps/api/src/modules/admin/application/commands/upsert-ai-provider-config.command.ts`
- Create: `apps/api/src/modules/admin/application/commands/upsert-ai-provider-config.handler.ts`
- Modify: `apps/api/src/modules/admin/interface/trpc/admin.router.ts`
- Modify: `apps/api/src/modules/admin/admin.module.ts`
- Create: `apps/web-admin/src/app/org/[tenantId]/integrations/page.tsx`
- Create: `apps/web-admin/src/app/org/[tenantId]/ai-config/page.tsx`
- Create: `apps/web-admin/src/app/org/[tenantId]/modules/page.tsx`
- Create: `apps/web-admin/src/app/org/[tenantId]/audit-log/page.tsx`
- Create: `apps/web-admin/src/app/org/[tenantId]/roles/page.tsx`
- Create: `apps/web-admin/src/app/org/[tenantId]/users/page.tsx`
- Generate: `packages/db/drizzle/migrations/0000_initial.sql`

- [ ] **Step 1: Write failing backend tests**

Cover:

- tenant admin can read own tenant summary.
- tenant admin cannot pass another target tenant id.
- platform admin can read selected tenant summary.
- module toggles update writes audit.
- AI config accepts raw key only on create/rotate and stores a secret ref only.
- AI config query returns masked metadata only.

- [ ] **Step 2: Write failing frontend tests**

Cover:

- integrations page masks configured secret.
- AI config page has rotate/test controls.
- modules page uses `Switch`.
- role page calls existing roles router.
- audit page uses filters.

- [ ] **Step 3: Run tests to verify failure**

```bash
bun run --cwd apps/api test:unit -- src/modules/admin/application/queries/get-tenant-admin-summary.handler.spec.ts src/modules/admin/application/commands/update-module-toggles.handler.spec.ts src/modules/admin/application/commands/upsert-ai-provider-config.handler.spec.ts
bun run --cwd apps/web-admin typecheck
```

Expected: fail.

- [ ] **Step 4: Add admin schema**

Add a tenant AI provider table in `admin.schema.ts`:

```ts
export const tenantAiProviderConfig = adminSchema.table('tenant_ai_provider_config', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull().unique(),
  providerType: text('provider_type', { enum: ['openai'] }).notNull(),
  apiKeyRef: text('api_key_ref').notNull(),
  apiKeyLastFour: text('api_key_last_four'),
  defaultReasoningModel: text('default_reasoning_model').notNull().default('gpt-5.4'),
  defaultClassificationModel: text('default_classification_model')
    .notNull()
    .default('gpt-5.4-nano'),
  embeddingModel: text('embedding_model').notNull().default('text-embedding-3-small'),
  status: text('status', { enum: ['ready', 'needs_attention', 'disabled'] })
    .notNull()
    .default('needs_attention'),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

For module toggles, either extend `tenant_settings` conservatively or add a normalized `tenant_module_toggle` table. Recommendation: normalized table because modules will expand beyond planner.

- [ ] **Step 5: Implement handlers**

Use sequential DB operations. For secret writes, use `SECRETS_STORE`. For audit, use `KernelAuditFacade`. Never return raw keys.

- [ ] **Step 6: Regenerate initial migration**

```bash
rm -f packages/db/drizzle/migrations/*.sql
rm -rf packages/db/drizzle/migrations/meta
bun run db:generate --name initial
```

- [ ] **Step 7: Implement pages**

Use dense operational layout:

- page header
- status summary
- form panel
- recent audit/status table where useful

Use `@future/ui` controls only.

- [ ] **Step 8: Run tests/checks**

```bash
bun run --cwd apps/api test:unit -- src/modules/admin/application/queries/get-tenant-admin-summary.handler.spec.ts src/modules/admin/application/commands/update-module-toggles.handler.spec.ts src/modules/admin/application/commands/upsert-ai-provider-config.handler.spec.ts
bun run --cwd apps/api typecheck
bun run --cwd apps/web-admin typecheck
bun run --cwd apps/web-admin lint
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/admin apps/web-admin packages/db/drizzle
git commit -m "feat(admin): add org configuration workspace"
```

## Task 10: E2E Flows, Hardening, And Docs Sync

**Files:**

- Create: `apps/e2e/src/admin-auth-gateway.spec.ts`
- Create: `apps/e2e/src/admin-platform-context.spec.ts`
- Modify: `docs/superpowers/specs/2026-04-24-app-admin-platform-tenant-design.md` if implementation decisions changed.
- Modify: `README.md` or module docs only if existing docs mention static shell OAuth config.

- [ ] **Step 1: Write failing Playwright tests**

Cover:

- login starts with org/email discovery.
- platform admin reaches system dashboard.
- platform admin selects org and reaches org overview.
- tenant admin reaches own org admin directly.
- tenant admin cannot open another org URL.
- SSO setup test result never shows secret.
- OpenAI rotate flow stores value once and later displays only masked metadata.

- [ ] **Step 2: Run E2E to verify failure**

Start required services and apps, then run:

```bash
bun run --cwd apps/e2e test:e2e -- admin-auth-gateway.spec.ts admin-platform-context.spec.ts
```

Expected: fail before UI/API wiring is complete, pass after prior tasks are done.

- [ ] **Step 3: Add missing hardening tests**

If not already covered, add backend tests for:

- OAuth state replay.
- OAuth expired state.
- Microsoft `tid` mismatch.
- tenant admin target tenant spoofing.
- platform admin audit payload target tenant.
- secret values absent from query output and audit payload.

- [ ] **Step 4: Run full relevant verification**

Run:

```bash
bun run --filter "@future/*" build
bun run --cwd apps/api test:unit
bun run --cwd apps/api test:integration
bun run --cwd apps/api typecheck
bun run --cwd apps/api lint
bun run --cwd apps/web-shell typecheck
bun run --cwd apps/web-shell lint
bun run --cwd apps/web-admin typecheck
bun run --cwd apps/web-admin lint
bun run --cwd apps/e2e test:e2e -- admin-auth-gateway.spec.ts admin-platform-context.spec.ts
```

Expected: pass. If full integration/E2E requires local infrastructure, document exact missing service or credential.

- [ ] **Step 5: Update docs if needed**

Remove or update any doc that says shell owns Microsoft client ID, tenant ID, or client secret. Document auth gateway ownership and Secrets Manager flow.

- [ ] **Step 6: Commit**

```bash
git add apps/e2e docs README.md
git commit -m "test(admin): cover auth gateway admin flows"
```

## Final Verification Before PR

- [ ] `git status --short` reviewed; unrelated staged agent work is not included unless intentionally part of this feature.
- [ ] `bun run --filter "@future/*" build` passes.
- [ ] `bun run --cwd apps/api test:unit` passes.
- [ ] `bun run --cwd apps/api test:integration` passes or documented local infra blocker exists.
- [ ] `bun run --cwd apps/api typecheck` passes.
- [ ] `bun run --cwd apps/api lint` passes.
- [ ] `bun run --cwd apps/web-shell typecheck` passes.
- [ ] `bun run --cwd apps/web-shell lint` passes.
- [ ] `bun run --cwd apps/web-admin typecheck` passes.
- [ ] `bun run --cwd apps/web-admin lint` passes.
- [ ] Playwright admin/auth gateway tests pass.
- [ ] No raw secrets appear in source, migrations, tests, snapshots, logs, or docs.
- [ ] No relative imports use `.js` suffix.
- [ ] No command/query handler uses `Promise.all` for DB queries.
- [ ] The only migration SQL file is `packages/db/drizzle/migrations/0000_initial.sql`.

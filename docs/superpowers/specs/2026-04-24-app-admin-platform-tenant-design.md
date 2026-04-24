# App Admin Platform And Tenant Design

## Purpose

Finalize the direction for `apps/web-admin` as the single SaaS admin zone for Future.

The admin app must support both system-wide `platform_admin` users and org-scoped
`tenant_admin` users. `SETA` is a normal tenant, not the owner/operator of the
platform. Platform administration is system-wide Future administration.

V1 focuses on the admin foundation: professional SaaS authentication, tenant
discovery, org context selection, org configuration, tenant RBAC, integrations,
AI keys, module toggles, and audit visibility.

## Source Context

- Admin app: `apps/web-admin`
- Shell login app: `apps/web-shell`
- Design source of truth: `DESIGN.md`
- Raw design direction: `docs/raws/design/project/People Module.html`
- Admin backend module: `apps/api/src/modules/admin`
- Identity backend module: `apps/api/src/modules/identity`
- Kernel tenant/RBAC module: `apps/api/src/modules/kernel`
- Agents AI/cost module: `apps/api/src/modules/agents`
- Shared app layout: `packages/app-layout`
- Shared UI components: `packages/ui`

Current state:

- `web-admin` is mostly placeholder UI. The timezone setting works; AI config,
  module toggles, roles, sessions, and agent definitions are incomplete.
- `web-admin/src/navigation.ts` references permission keys that do not exist in
  the permission registry, such as `admin:ai:read`, `admin:module:read`, and
  `admin:agents:read`.
- `platform_admin` exists as a role key, but the implementation treats it like a
  tenant-scoped role. It is not yet a complete system-wide authority model.
- `web-shell` currently uses static Microsoft OAuth environment variables. That
  cannot support per-tenant Entra configuration.
- The seed flow contains fallback Entra secret values in source. That violates
  the platform rule that secrets live in AWS Secrets Manager only.

## Goals

- Support professional SaaS login with tenant discovery before SSO redirect.
- Keep `web-shell` as the hosted login UI, not the owner of tenant OAuth secrets.
- Let `platform_admin` users manage system config and any tenant after choosing
  an explicit target org context.
- Let `tenant_admin` users manage only their own org.
- Treat every org, including SETA, as a normal tenant.
- Move tenant-related keys and provider config into admin-managed tenant config:
  Microsoft Entra, Microsoft 365/Graph, OpenAI, Google, and future providers.
- Store only secret references and safe metadata in Postgres.
- Use AWS Secrets Manager for create, rotate, test, and disconnect flows.
- Build the admin UI from `@future/ui` and `@future/app-layout`, following
  `DESIGN.md`.
- Preserve module boundaries: cross-module reads through facades, writes through
  explicit facades or module-owned command handlers.
- Add tests first and cover cross-tenant authorization, secret workflows, SSO,
  and critical admin flows.

## Non-Goals

- A separate admin zone for system admins.
- SETA-specific operator behavior.
- Storing raw client secrets, OpenAI keys, refresh tokens, or private keys in
  `.env`, source, Postgres, audit payloads, or frontend state.
- A global no-tenant session model in V1.
- Full agent definition authoring, budget dashboards, and cost analytics in the
  first admin foundation pass.
- Backward compatibility shims for old permission names or route shapes.

## Product Model

`web-admin` has two authority modes.

### System Mode

Visible only to `platform_admin`.

System mode is the global Future control plane. It shows:

- Organization list.
- Tenant status, plan, domain, IdP status, module status, and AI key status.
- Create org.
- Suspend or reactivate org.
- Enter org admin for a selected org.
- Manage platform admins.
- System-wide defaults that are not tenant data.

System mode does not make arbitrary tenant-scoped pages silently cross-tenant.
Every tenant mutation still has an explicit target tenant.

### Org Mode

Visible to both `platform_admin` and `tenant_admin`.

Org mode is the tenant admin workspace. A tenant admin lands directly in their
own org. A platform admin selects an org first, then enters that org's admin
context.

Org mode shows:

- Overview.
- Tenant profile.
- Users and admins.
- Roles and permissions.
- Integrations.
- AI config.
- Module toggles.
- Audit log.

The header must show the active org. Platform admins also get an org switcher.
Tenant admins do not.

## Authority Model

Use an explicit tenant context for platform admin actions.

Recommended V1 session anchoring:

- Introduce a hidden system tenant, for example `future-system`, to satisfy the
  current JWT, tRPC, and RLS assumption that every session has a tenant id.
- Seed the first platform admin from deployment config:
  `FUTURE_PLATFORM_ADMIN_EMAIL`.
- The seeded identity receives `platform_admin` in the system tenant.
- Additional platform admins are managed from `web-admin`.
- Bootstrap config is a recovery path, not the normal admin-management workflow.

Rules:

- `platform_admin` can list tenants and select a target tenant.
- `platform_admin` can operate on a tenant only through platform-admin procedures
  or explicit tenant-context procedures that accept a target tenant id.
- `tenant_admin` can operate only on `ctx.tenantId`.
- Every admin write records the real actor, source session tenant, target tenant,
  role context, event type, and safe metadata.
- No tenant admin can grant themselves or others system-wide `platform_admin`
  authority.

## Professional SaaS Auth Gateway

`web-shell` must become a login UI backed by an API-owned auth gateway.

### Login Discovery Flow

1. User enters work email or org slug.
2. Shell calls a public-safe API endpoint, such as
   `identity.getLoginOptions({ emailOrSlug })`.
3. API resolves the tenant by verified domain or slug.
4. API reads the tenant's primary identity provider and login policy.
5. API returns only public login metadata:
   - tenant display name
   - enabled login methods
   - provider type
   - Microsoft client id when applicable
   - Microsoft directory id when applicable
   - provider status
6. Shell renders a branded org login screen.
7. User chooses Microsoft, Google, or magic link.

### OAuth Authorization Flow

1. Shell asks API to create an OAuth authorization session.
2. API creates signed, opaque state containing:
   - tenant id
   - provider id
   - redirect target
   - nonce
   - expiry
3. API returns the authorization URL.
4. Shell redirects to the IdP.
5. The IdP redirects back to shell callback.
6. Shell sends `code` and `state` to API.
7. API verifies state and loads the client secret from Secrets Manager.
8. API exchanges the code for tokens.
9. API validates the ID token:
   - issuer
   - audience
   - expiry
   - nonce
   - email
   - Microsoft `tid` against configured Entra directory id
10. API resolves the Future login and returns a Future session token.
11. Shell sets `_future_session` and redirects to the requested zone.

The shell never sees the OAuth client secret.

### Fallback Login

If a tenant has no SSO provider configured, shell should show magic link when
enabled. If neither SSO nor magic link is available, shell shows a clear
contact-admin state.

## Tenant Config Ownership

Use module ownership boundaries, but surface all tenant configuration in
`web-admin`.

### Kernel

Owns:

- `tenant`
- actors
- `role_grant`
- `role_permission`
- platform/system authority checks
- audit event recording

Needed additions:

- system tenant bootstrap support
- platform-admin tenant listing/query surface
- explicit target-tenant authorization helpers
- commands to create/suspend/reactivate tenants

### Admin

Owns:

- tenant settings
- module toggles
- email config
- tenant-level UI/admin configuration
- tenant AI config if the AI settings are product-level rather than agent-runner
  internals

Needed additions:

- generalized module toggle schema beyond planner flags
- tenant profile settings
- tenant domain verification metadata or facade over identity-owned domain data
- AI config read/write surface if selected as owner

### Identity

Owns:

- identity providers
- verified domains, if modeled as auth-owned data
- SSO login options
- OAuth authorization sessions
- OAuth callback exchange
- local/magic-link accounts
- IdP group mappings
- Microsoft Graph credentials
- API keys for system actors

Needed additions:

- public-safe tenant discovery by slug/domain/email domain
- login options query
- create OAuth authorization session command
- complete OAuth callback command
- secret create/rotate workflow using Secrets Manager
- domain verification workflow
- richer status metadata for IdP configuration

### Agents

Owns:

- agent runner model use
- model pricing
- tenant budgets
- cost events
- rate limits

OpenAI key ownership has one decision point:

- If the OpenAI key is a tenant product setting, put the config in `admin` and
  expose it to `agents` through an `AdminQueryFacade`.
- If the OpenAI key is purely an agent-runtime concern, put it in `agents` and
  expose only admin UI procedures through `agents`.

Recommendation: store tenant AI provider config in `admin` because it is an org
setting alongside module toggles and integration status. The `agents` module
should consume the resolved config through a facade and continue owning runtime
cost/budget behavior.

## Secret Handling

Follow the standard SaaS pattern:

- Admin UI accepts raw secrets only during create or rotate.
- Backend immediately writes the secret to AWS Secrets Manager.
- DB stores only:
  - secret ref
  - provider metadata
  - masked last-four or checksum when useful
  - validation status
  - last validated time
  - last error summary
  - created/updated timestamps
- Queries never return secret values.
- Audit payloads never contain secret values.
- Disconnect deletes or schedules deletion of the secret and marks config
  inactive.

Admin screens show:

- masked secret status
- `Validated`
- `Needs attention`
- `Never tested`
- `Rotate`
- `Test connection`
- `Disconnect`

The seed flow must not contain fallback client secrets. Local development should
use developer-provided secure secret refs or explicitly marked local-only mock
credentials that are not committed secrets.

## Admin UI Design

The UI should be dark, dense, operational, and consistent with `DESIGN.md`.

Rules:

- Use `@future/app-layout` for sidebar and top-level layout.
- Do not build a zone-local sidebar.
- Use `@future/ui` primitives for all interactive elements:
  `Button`, `Input`, `Select`, `Textarea`, `Alert`, `Dialog`, `Card`,
  `DataTable`, `Skeleton`, `Spinner`, `Switch`, `Tabs`, and related controls.
- Use icons from `@future/ui/icons`.
- Keep page structure work-focused and scan-friendly.
- Avoid hero sections, decorative panels, nested cards, and marketing language.
- Use cards for repeated items and true panels only.
- Use DataTable for orgs, users, roles, group mappings, and audit events.
- Use alerts for destructive or invalid config states.

### System Dashboard

Route: `/`

Visible to platform admins.

Main content:

- Organization table:
  - name
  - slug
  - plan tier
  - status
  - primary IdP
  - verified domains
  - module count/status
  - AI key status
  - last admin activity
- Actions:
  - create org
  - enter org admin
  - suspend/reactivate org
  - manage platform admins

### Org Admin Workspace

Routes should remain in `web-admin` and use the same pages for tenant admins and
platform admins after target org selection.

Suggested sections:

- `/overview`
- `/settings`
- `/users`
- `/roles`
- `/integrations`
- `/ai-config`
- `/modules`
- `/audit-log`

The current nav should be updated to use real permission keys from
`apps/api/src/common/auth/permissions.ts`.

## Data Contracts

### Public Login Options

Input:

```ts
type GetLoginOptionsInput = {
  emailOrSlug: string
}
```

Output:

```ts
type LoginOptions = {
  tenant: {
    id: string
    slug: string
    name: string
    status: 'active' | 'suspended' | 'cancelled'
  }
  methods: Array<
    | {
        type: 'microsoft'
        displayName: string
        clientId: string
        directoryId: string
        status: 'ready' | 'needs_attention'
      }
    | {
        type: 'google'
        displayName: string
        clientId: string
        hostedDomain?: string
        status: 'ready' | 'needs_attention'
      }
    | {
        type: 'magic_link'
        status: 'ready'
      }
  >
}
```

### OAuth Session

Input:

```ts
type StartOAuthInput = {
  tenantId: string
  providerType: 'microsoft' | 'google'
  redirectTo: string
}
```

Output:

```ts
type StartOAuthResult = {
  authorizationUrl: string
}
```

### OAuth Callback

Input:

```ts
type CompleteOAuthInput = {
  code: string
  state: string
}
```

Output:

```ts
type CompleteOAuthResult = {
  token: string
  redirectTo: string
}
```

### Admin Integration Summary

Output:

```ts
type TenantIntegrationSummary = {
  primaryIdp: {
    providerType: 'microsoft' | 'google'
    displayName: string
    clientId: string
    directoryId: string | null
    syncEnabled: boolean
    status: 'ready' | 'needs_attention' | 'disabled'
    lastValidatedAt: string | null
    lastError: string | null
    secretLastFour?: string
  } | null
  microsoftGraph: {
    tenantAdId: string
    scopes: string[]
    status: 'active' | 'invalid' | 'paused'
    lastValidatedAt: string | null
    lastError: string | null
  } | null
  aiProvider: {
    providerType: 'openai'
    status: 'ready' | 'needs_attention' | 'disabled'
    defaultReasoningModel: string
    defaultClassificationModel: string
    embeddingModel: string
    lastValidatedAt: string | null
    lastError: string | null
    secretLastFour?: string
  } | null
}
```

## Error Handling

- Unknown tenant during login discovery returns a neutral "organization not
  found" state.
- Suspended tenants cannot start SSO or magic-link login.
- IdP misconfiguration returns a non-secret diagnostic to the shell and records
  an admin-visible status.
- OAuth state expiry returns the user to login with a retry path.
- Callback tenant mismatch, nonce mismatch, issuer mismatch, and Microsoft `tid`
  mismatch are rejected and audited.
- Tenant admins attempting cross-tenant operations receive forbidden errors.
- Platform admins must include explicit target tenant context for tenant writes.
- Secret write/test failures leave prior working config intact unless this is a
  first-time setup.

## Permissions

Use the permission registry as the single source of truth.

Potential additions:

- `admin:platform:read`
- `admin:platform:manage`
- `admin:tenant:switch`
- `admin:tenant:manage`
- `admin:idp:read`
- `admin:idp:configure`
- `admin:idp:sync`
- `admin:ai:read`
- `admin:ai:manage`
- `admin:module:read`
- `admin:module:manage`
- `admin:user:read`
- `admin:user:manage`
- `admin:role:read`
- `admin:role:manage`
- `admin:audit:read`

Existing routes and nav items should be updated to use `PERMISSIONS` constants
instead of literal strings where possible.

## Testing

Follow repository rules:

- Write tests first.
- Co-locate specs next to implementation files.
- Do not use `__tests__/`.
- Command handlers cover happy path and every error path.
- Cross-module interactions use integration tests against a real DB.
- Critical user flows use Playwright E2E.

Backend tests:

- Tenant discovery by slug.
- Tenant discovery by verified email domain.
- Unknown tenant discovery.
- Suspended tenant cannot start login.
- Login options expose public metadata only.
- OAuth session creates signed state with tenant/provider/nonce/expiry.
- OAuth callback validates nonce, issuer, audience, expiry, and tenant id.
- Microsoft callback rejects mismatched `tid`.
- API exchanges OAuth code using secret loaded from Secrets Manager.
- Tenant admin cannot list all tenants.
- Platform admin can list tenants.
- Tenant admin cannot manage another tenant.
- Platform admin can manage selected target tenant.
- Bootstrap creates first platform admin from `FUTURE_PLATFORM_ADMIN_EMAIL`.
- Bootstrap is idempotent.
- Secret create stores only ref and safe metadata.
- Secret rotate does not expose previous or new secret.
- Secret test writes audit event without secret payload.
- IdP config updates write audit event.
- AI provider config updates write audit event.

Frontend tests:

- Login page starts with email/org discovery, not provider buttons from static
  env config.
- Org login screen renders tenant name and enabled login methods.
- Microsoft button calls start OAuth and redirects to returned URL.
- Callback handles success and error states.
- Platform admin sees system dashboard and org switcher.
- Tenant admin does not see system dashboard or org switcher.
- Org mode header shows active org.
- Integration page masks secrets and exposes test/rotate/disconnect actions.
- Misconfigured IdP state renders an `Alert`.
- Module toggles use `Switch`.
- RBAC pages use design-system controls and respect permissions.
- Audit log can filter by actor, module, event type, and date.

E2E flows:

- First platform admin login reaches system dashboard.
- Platform admin selects an org and opens org admin.
- Tenant admin logs in and lands directly in their org admin.
- Tenant admin cannot open another tenant context by URL manipulation.
- SSO setup test connection displays success/failure without revealing secrets.
- Rotate OpenAI key accepts a raw key once and later shows only masked status.

## Rollout Plan

1. Auth Gateway foundation:
   - remove shell static Microsoft config dependency
   - add tenant discovery
   - add API-owned OAuth start/callback flow
   - preserve magic link fallback
2. System admin foundation:
   - seed platform admin from deployment config
   - add system tenant/session anchoring
   - add org list and target tenant context
3. Org admin workspace:
   - build tenant profile, users/admins, RBAC, integrations, AI config, modules,
     and audit pages
   - fix permission-key drift in nav and router metadata
4. Secrets workflows:
   - create/rotate/test/disconnect for IdP, Microsoft Graph, and OpenAI
   - store refs only
5. Hardening:
   - cross-tenant integration tests
   - SSO callback validation tests
   - Playwright login/admin flows
   - audit assertions

## Open Decisions

- Whether verified domains live in `identity` or `admin`. Recommendation:
  `identity`, because they are part of login discovery and IdP policy.
- Whether OpenAI tenant config lives in `admin` or `agents`. Recommendation:
  `admin`, consumed by `agents` through a facade.
- Whether the hidden system tenant should appear in any admin UI. Recommendation:
  no; it is implementation infrastructure only.
- Whether platform admin can impersonate tenant users. Recommendation: no for V1.
  Tenant context selection is enough for admin configuration and has lower audit
  risk.

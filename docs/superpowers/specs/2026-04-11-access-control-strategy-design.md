# Access Control Strategy Design

**Date:** 2026-04-11
**Status:** Draft
**Scope:** Authentication, authorization, and identity lifecycle for Future platform

---

## Overview

Holistic access control strategy covering three layers: authentication (how users prove identity), authorization (what authenticated users can do), and identity provisioning (how accounts are created, synced, and deactivated). Supports Microsoft Entra ID and Google Workspace as identity providers, plus local accounts for contractors/externals.

## Key Decisions

| Decision                  | Choice                                                   | Rationale                                                                                  |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Sync model                | JIT + periodic directory pull (hourly)                   | SCIM requires premium IdP plans; Graph/Directory APIs available on all tiers               |
| Multi-IdP                 | One primary IdP per tenant + local accounts              | SMEs are all-Microsoft or all-Google; dual IdP dedup is not worth complexity               |
| Group-to-role mapping     | Fully automatic with admin-managed mapping table         | Zero HR burden for routine org changes; offboarding within 1 hour                          |
| Session management        | IdP-agnostic JWT in httpOnly cookie shared across zones  | Aligns with existing architecture; shell outage doesn't affect authenticated users         |
| Authorization granularity | Role to permission bundle with scope enforcement         | Roles are admin-facing; permissions are code-facing; scopes prevent cross-department leaks |
| Local account auth        | Email magic link only                                    | Minimal security surface; contractors are the exception, not the rule                      |
| Permission storage        | Database-configurable per tenant                         | Different tenants need different permission sets; ship faster with seed + tune             |
| Locked permissions        | Small irremovable set per role                           | Prevents self-lockout and product breakage                                                 |
| Sync vs manual grants     | `source` field on `role_grant`                           | Sync only touches `idp_sync` grants; manual grants are never modified by sync              |
| Architecture              | Kernel owns authz; new Identity module owns authn + sync | Clean separation; sync infrastructure doesn't bloat kernel                                 |

---

## 1. Authorization Layer (Kernel Module)

### 1.1 New Schema: `role_permission` table in `core`

```
role_permission (id, tenant_id, role_key, permission_key, is_locked, created_at)
  permission_key: string — e.g., 'people:profile:read', 'time:leave:approve'
  is_locked: boolean — true = cannot be removed by tenant admin
  UNIQUE: (tenant_id, role_key, permission_key)
```

Seeded with defaults on tenant creation. Admin can add/remove non-locked entries.

### 1.2 Permission Key Convention

```
{module}:{resource}:{action}
{module}:{resource}:{scope_qualifier}:{action}

Examples:
  people:profile:read          — read any profile
  people:profile:self:read     — read own profile only
  people:profile:update        — update any profile
  time:leave:approve           — approve leave requests
  time:leave:self:submit       — submit own leave
  hiring:candidate:create      — create candidates
```

The `self` qualifier is special: the authz check compares `actorId` against the resource owner. Handled in `canDo()` logic.

### 1.3 Schema Change: `role_grant.source`

Add to existing `role_grant` table:

```
source: 'manual' | 'idp_sync' | 'delegation'  (default: 'manual')
```

Sync job only touches entries with `source = 'idp_sync'`. Manual grants are never modified by sync.

### 1.4 KernelQueryFacade Additions

```ts
canDo(actorId: string, permission: string, context: {
  tenantId: string
  scopeType?: 'global' | 'department' | 'project' | 'account'
  scopeId?: string
  resourceOwnerId?: string  // for 'self' permission checks
}): Promise<boolean>

getEffectivePermissions(actorId: string, tenantId: string): Promise<string[]>
```

### 1.5 `canDo()` Resolution Order

1. Get all active `role_grant` entries for actor (including valid delegations)
2. For each grant, look up `role_permission` entries for that `role_key` + `tenant_id`
3. Check if any permission matches the requested `permission` key
4. If matched, check scope: grant is `global` -> pass; grant scope matches requested scope -> pass; permission has `self` qualifier and `actorId === resourceOwnerId` -> pass
5. Deny if no match

Delegations are transparent: `canDo()` unions the actor's own grants with any active delegations where they are the delegatee. No caller changes needed.

### 1.6 Default Role-Permission Seed

| Role               | Locked Permissions                                                                | Default Additional Permissions                                                             |
| ------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `employee`         | `people:profile:self:read`, `time:leave:self:submit`, `time:attendance:self:read` | `planner:task:self:manage`                                                                 |
| `line_manager`     | all `employee` locked + `people:profile:team:read`                                | `time:leave:approve`, `performance:review:submit`                                          |
| `hr_ops`           | all `employee` locked                                                             | `people:profile:read`, `people:profile:update`, `time:leave:read`, `hiring:candidate:read` |
| `tenant_admin`     | `admin:role:manage`, `admin:tenant:read`                                          | all permissions                                                                            |
| `recruiter`        | all `employee` locked                                                             | `hiring:candidate:read`, `hiring:candidate:create`, `hiring:pipeline:manage`               |
| `finance_operator` | all `employee` locked                                                             | `finance:invoice:read`, `finance:payroll:read`, `finance:budget:manage`                    |
| `project_manager`  | all `employee` locked                                                             | `projects:assignment:manage`, `projects:staffing:read`                                     |
| `platform_admin`   | all `tenant_admin` locked                                                         | all permissions across all tenants                                                         |

---

## 2. Identity Module

### 2.1 Module Structure

```
modules/identity/
  domain/
    entities/           -> IdentityProvider, IdpGroupMapping, MagicLinkToken
    value-objects/      -> ProviderType, SyncStatus, TokenExpiry
    repositories/       -> IIdentityProviderRepository, IIdpGroupMappingRepository, IMagicLinkTokenRepository
    events/             -> internal domain events
  application/
    commands/
      configure-identity-provider.handler.ts
      update-idp-group-mapping.handler.ts
      request-magic-link.handler.ts
      validate-magic-link.handler.ts
      run-directory-sync.handler.ts
    queries/
      get-identity-provider.handler.ts
      get-idp-group-mappings.handler.ts
      get-sync-status.handler.ts
    facades/
      identity-query.facade.ts    -> only public export
    event-handlers/
      on-tenant-created.handler.ts  -> seed default IdP config
  infrastructure/
    schema/             -> Drizzle tables in 'identity' schema
    repositories/       -> Drizzle adapters
    providers/
      microsoft-graph.provider.ts   -> Graph API client
      google-directory.provider.ts  -> Directory API client
    jobs/
      directory-sync.job.ts         -> pg-boss recurring job
    email/
      magic-link-email.sender.ts    -> SES integration
  interface/
    trpc/               -> tRPC router contribution
  identity.module.ts    -> exports: [IdentityQueryFacade] ONLY
```

### 2.2 New Schema: `identity`

**`identity_provider` table:**

```
identity_provider (id, tenant_id, provider_type, display_name,
                   client_id, client_secret_ref, directory_id,
                   is_primary, sync_enabled, last_sync_at,
                   sync_status, created_at, updated_at)
  provider_type: 'microsoft' | 'google'
  client_secret_ref: ARN in AWS Secrets Manager (never the secret itself)
  is_primary: boolean (only one per tenant)
  sync_status: 'idle' | 'running' | 'failed'
  UNIQUE: (tenant_id, is_primary) WHERE is_primary = true
```

**`idp_group_mapping` table:**

```
idp_group_mapping (id, tenant_id, identity_provider_id,
                   external_group_id, external_group_name,
                   role_key, scope_type, scope_id,
                   created_at, updated_at)
  external_group_id: Entra group OID or Google group email
  role_key: maps to role_grant.role_key
  scope_type + scope_id: the scope for the granted role
  UNIQUE: (tenant_id, external_group_id, role_key, scope_type, scope_id)
```

**`magic_link_token` table:**

```
magic_link_token (id, tenant_id, email, token_hash,
                  expires_at, used_at, created_at)
  token_hash: SHA-256 of the token (never store plaintext)
  expires_at: created_at + 15 minutes
  used_at: NULL until consumed (one-time use)
  INDEX: (token_hash) WHERE used_at IS NULL
```

### 2.3 Directory Sync Flow (pg-boss, hourly)

```
pg-boss fires 'identity:directory-sync' job
  -> RunDirectorySyncHandler executes
  -> Fetch identity_provider for tenant (provider_type + credentials)
  -> Call Graph API or Directory API:
      - List all users (paginated)
      - List all groups + memberships
  -> For each IdP user:
      - Find matching user_identity by sso_subject
      - If not found -> create actor + user_identity (JIT pre-provisioning)
      - If found -> update display_name, email if changed
      - If IdP user disabled -> suspend user_identity,
        revoke all role_grants WHERE source = 'idp_sync'
  -> For each idp_group_mapping:
      - Get IdP group members
      - Diff against current role_grants WHERE source = 'idp_sync'
      - Grant missing roles, revoke removed roles
  -> Write audit_event for every change
  -> Update identity_provider.last_sync_at + sync_status
```

The sync writes to kernel tables (`user_identity`, `role_grant`, `actor`) via kernel command bus, not direct DB access. This preserves module boundaries.

### 2.4 Cross-Module Events Published

```ts
// packages/event-contracts/src/identity/
UserProvisionedFromIdpEvent   { tenantId, actorId, provider, ssoSubject }
UserDeactivatedFromIdpEvent   { tenantId, actorId, provider, reason }
RoleGrantSyncedEvent          { tenantId, actorId, roleKey, action: 'granted' | 'revoked', source: 'idp_sync' }
DirectorySyncCompletedEvent   { tenantId, providerId, usersCreated, usersDeactivated, rolesChanged }
```

---

## 3. Authentication Flow

### 3.1 SSO Login (Entra / Google)

```
User hits any zone (e.g., people.seta-international.com)
  -> Zone reads httpOnly cookie -> no session found
  -> Redirect to shell.seta-international.com/auth/login?redirect={original_url}
  -> Shell fetches tenant's identity_provider config (via tRPC)
  -> Shell renders "Sign in with Microsoft" or "Sign in with Google"
     (based on tenant's primary IdP)
  -> User clicks -> OIDC Authorization Code flow:

    Microsoft Entra:
      -> Redirect to login.microsoftonline.com/authorize
      -> Callback to shell.seta-international.com/auth/callback/microsoft
      -> Exchange code for tokens
      -> Extract: oid (sso_subject), tid, preferred_username, name, groups

    Google Workspace:
      -> Redirect to accounts.google.com/o/oauth2/v2/auth
      -> Callback to shell.seta-international.com/auth/callback/google
      -> Exchange code for tokens
      -> Extract: sub (sso_subject), hd (hosted domain), email, name

  -> Shell calls API: POST trpc.identity.resolveLogin
      Input:  { provider, ssoSubject, email, displayName, tenantSlug }
      Logic:
        1. Find user_identity by (sso_subject, provider)
        2. If not found -> JIT: create actor + user_identity
        3. If found but suspended -> reject login
        4. Update last_login_at
        5. Fetch role_grants via KernelQueryFacade
        6. Return: { actorId, tenantId, roles[], displayName }

  -> API signs a Future session token (JWT, signed with app secret):
      { sub: actorId, tid: tenantId, roles: [...], provider, iat, exp (8h) }

  -> Shell sets httpOnly cookie:
      Set-Cookie: _future_session=<jwt>;
        Domain=.seta-international.com;
        HttpOnly; Secure; SameSite=Lax;
        Path=/; Max-Age=28800

  -> Redirect back to original zone URL
```

### 3.2 Magic Link Login (Local Accounts)

```
User visits shell.seta-international.com/auth/login
  -> Enters email, clicks "Send magic link"
  -> Shell calls API: POST trpc.identity.requestMagicLink
      Input:  { email, tenantSlug }
      Logic:
        1. Find user_identity by (email, provider='local')
        2. If not found or suspended -> return success anyway (no email enumeration)
        3. Generate 32-byte random token
        4. Store SHA-256(token) in magic_link_token (expires: 15 min)
        5. Send email via SES with link: shell.seta-international.com/auth/magic/{token}

  -> User clicks link
  -> Shell calls API: POST trpc.identity.validateMagicLink
      Input:  { token }
      Logic:
        1. Find magic_link_token by SHA-256(token) WHERE used_at IS NULL AND expires_at > now
        2. If not found -> reject
        3. Mark used_at = now
        4. Resolve actor, roles (same as SSO flow)
        5. Return session payload

  -> Same cookie/redirect flow as SSO
```

### 3.3 Session Validation (Every Request)

```
tRPC middleware in apps/api:
  1. Read _future_session cookie from request
  2. Verify JWT signature
  3. Check exp (reject if expired)
  4. Extract actorId, tenantId, roles
  5. Set tenantId via TenantContextService (feeds RLS)
  6. Inject { actorId, tenantId, roles } into tRPC context
```

`protectedProcedure = publicProcedure + authMiddleware`. All module routers use `protectedProcedure`.

### 3.4 Session Lifecycle

- **Expiry:** 8 hours, no refresh token. Re-auth via SSO is seamless (corporate SSO session typically lasts 8-24 hours).
- **Logout:** Clear `_future_session` cookie (Max-Age=0) + call IdP front-channel logout endpoint.
- **Deactivation catch:** If user is deactivated in IdP between syncs, re-auth after JWT expiry will fail (resolveLogin rejects suspended accounts).

---

## 4. Permission Enforcement

### 4.1 tRPC Middleware Stack

Three layers on every `protectedProcedure`:

```
Request -> authMiddleware (JWT -> context)
        -> rlsMiddleware (set tenant_id for PostgreSQL RLS)
        -> permissionMiddleware (check canDo())
        -> Handler
```

### 4.2 Declaring Permissions on Procedures

```ts
export const peopleRouter = router({
  getProfile: protectedProcedure
    .meta({ permission: 'people:profile:read' })
    .input(z.object({ actorId: z.string() }))
    .query(({ ctx, input }) => { ... }),

  updateProfile: protectedProcedure
    .meta({ permission: 'people:profile:update' })
    .input(z.object({ actorId: z.string(), ... }))
    .mutation(({ ctx, input }) => { ... }),

  getOwnProfile: protectedProcedure
    .meta({ permission: 'people:profile:self:read' })
    .query(({ ctx }) => { ... }),
})
```

### 4.3 Permission Middleware

```ts
const permissionMiddleware = t.middleware(async ({ ctx, meta, next }) => {
  if (!meta?.permission) return next({ ctx })

  const allowed = await kernelFacade.canDo(ctx.actorId, meta.permission, {
    tenantId: ctx.tenantId,
    scopeType: meta.scopeType,
    scopeId: meta.scopeId,
    resourceOwnerId: meta.resourceOwnerId,
  })

  if (!allowed) throw new TRPCError({ code: 'FORBIDDEN' })
  return next({ ctx })
})
```

### 4.4 Handler-Level Scope Checks

When scope depends on the resource being acted on, the check happens in the handler:

```ts
approveLeave: protectedProcedure
  .meta({ permission: 'time:leave:approve' })
  .input(z.object({ leaveRequestId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const request = await timeRepo.findLeaveRequest(input.leaveRequestId)
    const placement = await kernelFacade.getCurrentOrgPlacement(request.actorId, ctx.tenantId)

    const allowed = await kernelFacade.canDo(ctx.actorId, 'time:leave:approve', {
      tenantId: ctx.tenantId,
      scopeType: 'department',
      scopeId: placement.departmentId,
    })

    if (!allowed) throw new TRPCError({ code: 'FORBIDDEN' })
    // proceed
  })
```

Pattern: middleware handles simple role-level checks; handlers handle resource-scoped checks.

### 4.5 Delegation Transparency

`canDo()` unions the actor's own grants with active delegations where they are delegatee. Handlers do not need to know about delegations.

### 4.6 Audit Trail

Permission checks write to `audit_event`:

```
audit_event {
  actor_id, event_type: 'permission_check', module: 'kernel',
  payload: { permission, scope, result: 'granted' | 'denied', via: 'role_grant' | 'delegation' }
}
```

Only denied checks and sensitive operations logged by default. Configurable per tenant.

---

## 5. Admin Configuration Surface

### 5.1 Identity Provider Setup

Via `web-admin` zone: Settings -> Identity Provider.

- Select provider (Microsoft Entra ID or Google Workspace)
- Enter Client ID and Directory/Tenant ID
- Upload client secret (stored as ARN in Secrets Manager)
- "Test Connection" validates credentials against Graph/Directory API
- Required IdP permissions:
  - **Entra:** `User.Read.All`, `Group.Read.All`, `GroupMember.Read.All` (Application)
  - **Google:** Admin SDK `admin.directory.user.readonly`, `admin.directory.group.readonly`

### 5.2 Group-to-Role Mapping

Via `web-admin`: Settings -> Role Mapping.

- "Sync Groups" fetches groups from IdP
- Admin maps each group to a role + scope
- "Sync Now" triggers immediate directory sync
- Stored in `idp_group_mapping` table

### 5.3 Permission Management

Via `web-admin`: Settings -> Roles & Permissions.

- List of roles with their permission bundles
- Locked permissions shown with lock icon, disabled toggle
- Admin can add/remove non-locked permissions per role
- "Reset to Defaults" restores seed permissions for a role
- Permissions grouped by module for readability

### 5.4 Local Account Management

Via `web-admin`: Settings -> Local Accounts.

- "Invite User": email, display name, role assignments
- Creates actor + user_identity (provider: 'local') + role_grants (source: 'manual')
- Sends magic link invitation email via SES

### 5.5 Sync Monitoring

Via `web-admin`: Settings -> Directory Sync.

- Last sync timestamp, status, next scheduled sync
- Stats: users synced, created, deactivated, role changes
- "Sync Now" button for immediate trigger
- Sync history table with error details for failed runs

### 5.6 Audit Log Viewer

Via `web-admin`: Settings -> Access Audit Log.

- Filterable by actor, event type, module, date range
- Shows: permission denials, role changes (with source), login events, delegation activity
- Export to CSV

---

## Module Dependencies

```
identity module (new — 'identity' schema)
  -> reads: KernelQueryFacade (actor lookup, role checks)
  -> writes: kernel command bus (CreateActor, GrantRole, RevokeRole)
  -> publishes: UserProvisionedFromIdpEvent, UserDeactivatedFromIdpEvent, etc.
  -> tables: identity_provider, idp_group_mapping, magic_link_token, api_key
  -> infra: Microsoft Graph API, Google Directory API, AWS SES, AWS Secrets Manager, pg-boss

kernel module (authz additions to 'core' schema)
  -> new table: role_permission
  -> new column: role_grant.source
  -> new facade methods: canDo(), getEffectivePermissions()

agents module (MCP guard integration)
  -> new guards: McpAuthGuard, ExposureContractGuard, ToolPermissionGuard
  -> uses: KernelQueryFacade.canDo() for every tool invocation
  -> uses: identity module's api_key validation for system-to-system auth

web-shell (auth flows)
  -> OIDC flows for Entra + Google
  -> Magic link request/validation
  -> Session cookie management (IdP-agnostic JWT)

web-admin (configuration UI)
  -> IdP setup, group mapping, permission management, local accounts
  -> Sync monitoring, audit log
  -> Agent access: system actors, API keys, exposure contracts
```

---

## 6. Agent Access to Backend Services

Two distinct patterns depending on where the agent runs.

### 6.1 Internal Agents (Command Bus — Inside the Monolith)

Agents in `modules/agents/` live inside the NestJS process. They have access to the DI container and call domain services directly — no MCP overhead.

```
User sends message via WebSocket / Teams / Slack
  -> Agent gateway resolves actorId from user session
  -> Agent reasons, selects a tool/action
  -> Before execution: canDo(actorId, permission, context)
  -> If allowed: CommandBus.execute(new SubmitLeaveRequestCommand(...))
  -> audit_event { actor_id: userId, event_type: 'agent.tool_call', payload: { tool, args, result } }
```

**Key principle:** the agent acts **on behalf of a user**. It inherits the user's `actorId` and can never do more than the user's roles + delegations allow. `canDo()` is the same check used by tRPC procedures — no special agent code path.

**Internal agent auth flow:**

1. User authenticates via SSO/magic link (standard session)
2. Agent session starts — `actorId` + `tenantId` extracted from session JWT
3. Every tool invocation calls `canDo(actorId, toolPermission, { tenantId, scopeType, scopeId })`
4. `exposure_contract` check is optional for internal agents (they use the same permissions as the user)
5. `audit_event` records every tool call with `via: 'agent'` in payload

### 6.2 External Agents (MCP over HTTP+SSE — Remote Clients)

External AI agents, partner integrations, and third-party MCP clients connect via `@rekog/mcp-nest` at `/mcp/{module}`. MCP is the right protocol here:

- Standard protocol any AI client can speak
- `@rekog/mcp-nest` supports NestJS guards natively
- Tool-level guards via `@ToolGuards()` control per-tool access
- Tools hidden from `tools/list` for unauthorized actors — deny-by-default

**Two authentication modes for external agents:**

| Mode                 | Token Type                | Resolves To                   | Use Case                                                    |
| -------------------- | ------------------------- | ----------------------------- | ----------------------------------------------------------- |
| **Delegated**        | Bearer JWT (user session) | `actorId` of the human user   | AI assistant acting on behalf of a logged-in user           |
| **System-to-system** | API key                   | `actorId` of a `system` actor | Automated integrations, scheduled agent tasks, partner bots |

**System actors (`actor.type = 'system'`):**

External integrations get a `system` actor with their own `role_grant` entries. This means:

- Permissions are scoped like human users (global, department, project)
- `canDo()` works identically — no special code path
- `exposure_contract` adds an extra deny-by-default layer for external consumers
- `audit_event` traces every action back to the system actor
- Revoking access = deactivate the actor or revoke role_grants

**API key management:**

```
api_key (in identity schema)
  id              UUID v7 PRIMARY KEY
  tenant_id
  actor_id        -> system actor
  key_hash        SHA-256 of the API key (never store plaintext)
  name            display name for admin UI
  last_used_at
  expires_at      -> null = no expiry; recommended: 1 year rotation
  revoked_at
  created_at
```

API keys are created by `tenant_admin` via `web-admin`, associated with a system actor. The plaintext key is shown once at creation and never stored.

**MCP guard stack (applied in order):**

```
MCP request arrives at /mcp/{module}
  -> McpAuthGuard: validate bearer JWT or API key -> resolve actorId
  -> ExposureContractGuard: check exposure_contract for this consumer + tool
  -> ToolPermissionGuard: call canDo(actorId, toolPermission, context)
  -> If all pass: execute tool, write audit_event
  -> If any fail: tool not visible in tools/list, or FORBIDDEN
```

```ts
// MCP module registration with guard stack
@Module({
  imports: [
    McpModule.forRoot({
      name: 'future-mcp-server',
      version: '1.0.0',
      guards: [McpAuthGuard], // global auth on all MCP endpoints
      streamableHttp: {
        enableJsonResponse: false,
        sessionIdGenerator: () => uuidv7(),
      },
    }),
  ],
})
// Per-tool guards for fine-grained access control
@Injectable()
export class PeopleMcpTools {
  @Tool({
    name: 'people_get_employment_profile',
    description: 'Get employment profile for an actor',
    parameters: z.object({ actorId: z.string().uuid() }),
  })
  @ToolGuards([ExposureContractGuard, ToolPermissionGuard])
  async getEmploymentProfile({ actorId }) {
    // Guard already verified: exposure_contract + canDo('people:profile:read')
    return this.peopleQueryFacade.getEmploymentProfile(actorId, this.tenantId)
  }
}
```

### 6.3 Agent Permission Patterns

| Scenario                                | Auth                                   | Authz                                             | Example                                |
| --------------------------------------- | -------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| User chats with AI assistant in web app | Session JWT (user)                     | `canDo(userId, ...)`                              | "Show me my leave balance"             |
| User asks AI to perform action          | Session JWT (user)                     | `canDo(userId, ...)`                              | "Submit leave request for next Monday" |
| Scheduled agent runs nightly report     | API key (system actor)                 | `canDo(systemActorId, ...)` + `exposure_contract` | Nightly staffing report generation     |
| Partner bot reads project status        | API key (system actor)                 | `canDo(systemActorId, ...)` + `exposure_contract` | Client dashboard integration           |
| Teams/Slack bot relays user command     | Session JWT (user via channel adapter) | `canDo(userId, ...)`                              | "Approve leave request #123" via Teams |

### 6.4 Admin Configuration for Agent Access

Via `web-admin`: Settings -> Agent Access.

- **System actors:** create/manage system actors for integrations
- **API keys:** generate, view (last 4 chars only), rotate, revoke
- **Exposure contracts:** per-tool access control for system actors (deny-by-default)
- **Role assignment:** assign roles + scopes to system actors (same UI as human role management)
- **Audit trail:** filter audit log by `via: 'agent'` to see all agent actions

---

## Tenant Bootstrap Flow

When a new tenant is created (by platform admin):

1. Platform admin creates tenant record
2. System creates a local `tenant_admin` account with email + magic link invitation
3. Tenant admin logs in via magic link, accesses `web-admin`
4. Tenant admin configures identity provider (Entra or Google)
5. Tenant admin sets up group-to-role mappings
6. Tenant admin triggers first directory sync -- all IdP users are provisioned
7. From this point, users log in via SSO; tenant admin's local account remains as fallback

This ensures there is always a way to access the system even before IdP integration is configured.

---

## Security Considerations

- **Client secrets** never stored in DB; only ARN references to AWS Secrets Manager
- **Magic link tokens** stored as SHA-256 hash; plaintext never persisted
- **Session JWT** signed with app secret; HttpOnly + Secure + SameSite=Lax prevents XSS/CSRF
- **No email enumeration** on magic link request (always returns success)
- **RLS enforcement** unchanged; tenant_id set transaction-local via set_config(..., false)
- **Audit immutability** unchanged; INSERT-only with REVOKE + trigger guard
- **Locked permissions** prevent admin self-lockout
- **Sync source separation** prevents sync from overriding manual grants
- **Agent least-privilege** — internal agents inherit user permissions only; external agents get explicit role_grants + exposure_contracts
- **API keys** stored as SHA-256 hash; plaintext shown once at creation, never stored
- **MCP tool visibility** — unauthorized tools hidden from `tools/list`, not just blocked on execution
- **Agent audit trail** — every tool call recorded with `via: 'agent'` and the originating actorId (human or system)

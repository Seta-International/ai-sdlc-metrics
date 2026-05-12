# Design — MS365 Authentication & Authorization (Epic 1)

**Status**: Draft for review · approved-section-by-section in brainstorm
**Author**: Canh Ta (with Claude)
**Date**: 2026-05-11
**Source brainstorm**: `docs/plans/MS365 Epics Brainstorm.md` — Epic 1
**Companion specs (forthcoming)**: Epic 2 (Planner CRUD), Epic 3 (Background Sync), Epic 4 (Teams Install + Daily Digest)
**Kernel assumption**: K-phase contracts exist as paper contracts (`@seta/middleware/errors`, `@seta/tenant`, `@seta/observability`); their internals are out of scope here.

---

## 1. Goal

A customer admin can connect their Microsoft 365 tenant to the Seta agent platform in one admin-consent click. After consent, the platform holds encrypted, auto-refreshing OAuth tokens that downstream connectors (Planner today; Calendar, Files, Trello, Google Workspace tomorrow) consume to read and write on the user's or tenant's behalf. The Seta tenant itself is bootstrapped by a seed script with no privileged carve-outs — it is "ordinary tenant #1."

This spec covers the foundation that every subsequent connector reuses. It is **not** Planner-specific.

## 2. Non-goals

- Calling Microsoft Graph beyond token validation (Epic 2)
- Caching Planner data, sync workers, write-through (Epic 3)
- Teams app installation, channel handlers, proactive messages (Epic 4)
- Adaptive Card UX, tool framework, agent prompts (kernel + A-phase)
- HSM-backed keys, per-tenant CMK, multi-region KMS replication (P3 SOC2)
- A web UI for the consent flow (P2 Studio)

## 3. Architecture overview

### 3.1 Tiers

The repository's existing `platform/`, `modules/products/`, `modules/channels/` boundary is extended with a third module tier:

| Tier | Purpose | May import | May NOT import |
|---|---|---|---|
| `platform/*` | Framework primitives, vendor-neutral | other `platform/*` | `modules/*`, `apps/*` |
| `modules/connectors/<vendor>/` *(new)* | Vendor adapters (one external system each) | `platform/*`, other connectors | `modules/products/*`, `modules/channels/*` |
| `modules/products/<name>/` | Seta business modules | `platform/*`, `modules/connectors/*` | other `modules/products/*`, `modules/channels/*` *(except to implement Handler)* |
| `modules/channels/<name>/` | UI surfaces (Teams, web, …) | `platform/*` | `modules/products/*`, `modules/connectors/*` |

**CLAUDE.md adjustment required**: add `modules/connectors/*` boundary line and move `platform/ms365-planner` → `modules/connectors/ms365-planner`.

### 3.2 Packages in scope for Epic 1

```
platform/auth/                    Seta IAM (sessions, API keys, OIDC consumer)
platform/oauth/                   Provider registry + token vault + admin-consent routes
  src/provider.ts                 OAuthProvider interface
  src/vault.ts                    TokenVault + AES-GCM/KMS envelope
  src/refresh.ts                  Single-flight refresh via SELECT FOR UPDATE
  src/providers/entra.ts          MSAL Node 5.2.0 ConfidentialClientApplication wrapper
  src/routes.ts                   POST /oauth/:provider/consent-url
                                  GET  /oauth/:provider/callback
                                  POST /oauth/:provider/revoke
                                  POST /oauth/:provider/exchange-obo

platform/connector-registry/      NEW — ConnectorDefinition type + runtime registry
platform/directory/               NEW — Canonical directory tables, JIT mapper
platform/audit/                   NEW — audit_log table + recordAudit() writer

platform/ms-graph/                Stub in Epic 1; populated in Epic 2

modules/connectors/ms365-planner/        NEW dir (was platform/ms365-planner)
  src/manifest.ts                        Only file populated in Epic 1
modules/connectors/ms365-directory/      NEW
  src/manifest.ts                        Manifest only in Epic 1
  src/jit-mapper.ts                      ID-token → auth.users + directory.external_identities

apps/api/src/main.ts                     Mounts routes; registers connectors statically

tooling/scripts/
  seed-first-tenant.ts                   Idempotent bootstrap from env vars
  connect-tenant.ts                      CLI: prints admin-consent URL for given --connectors
```

### 3.3 Boundary properties

- `modules/connectors/ms365-planner` imports `platform/ms-graph`, `platform/oauth`, `platform/connector-registry` — never another connector's data, never a product, never a channel.
- Adding **Trello**: new `modules/connectors/trello/`, new `platform/oauth/src/providers/atlassian.ts`, one `register()` call in `apps/api/src/main.ts`. Zero edits to `platform/oauth` core.
- Adding **Google Workspace directory**: new `modules/connectors/google-directory/`, new `platform/oauth/src/providers/google.ts`, one register call.

## 4. Data model (schema-per-module, DDD)

### 4.1 Schema ownership

| Schema | Owner package | Tables (Epic 1) |
|---|---|---|
| `auth` | `platform/auth` | `users`, `sessions`, `api_keys` |
| `tenant` | `platform/tenant` | `tenants`, `tenant_connectors` |
| `directory` | `platform/directory` | `external_identities` |
| `oauth` | `platform/oauth` | `oauth_tokens`, `oauth_state` |
| `audit` | `platform/audit` | `audit_log` |
| `connector_ms365_directory` | `modules/connectors/ms365-directory` | `directory_users`, `directory_groups`, `directory_group_members`, `sync_state` |
| `connector_ms365_planner` | `modules/connectors/ms365-planner` | *(empty in Epic 1; populated by Epics 2–3)* |

**DDD rules:**
- **No cross-schema foreign keys.** References across bounded contexts are by ID only. The `tenant_id` UUID is the cross-cutting correlation key, present in every tenant-scoped table.
- **Each schema is owned exclusively by its owner package's Drizzle schema file.** No package reads another's tables directly — communicate via the owner's exported API.
- **Migrations partitioned by schema.** Drizzle config per owner package generates into `<package>/migrations/`. A top-level migration runner applies them in dependency order at boot: `auth`, `tenant`, `directory`, `oauth`, `audit`, then each `connector_*`.
- **Forward-only.** No downgrade migrations.

### 4.2 Tables

**`tenant.tenants`**
```
id            uuid pk
slug          text unique
display_name  text
status        text                    -- 'active' | 'suspended' | 'uninstalled'
created_at    timestamptz default now()
```

**`tenant.tenant_connectors`** (per-tenant connector enablement)
```
tenant_id              uuid                      -- references tenant.tenants.id (same schema → FK OK)
connector_id           text                      -- 'ms365-planner', 'ms365-directory', ...
status                 text                      -- 'pending_consent' | 'active' | 'revoked' | 'degraded'
consented_at           timestamptz
consented_by_user_id   uuid                      -- references auth.users.id (cross-schema; no FK)
scope_set              jsonb                     -- snapshot of scopes at consent
metadata               jsonb
updated_at             timestamptz default now()
PRIMARY KEY (tenant_id, connector_id)
```

**`auth.users`** (canonical Seta identity — one row per person per tenant)
```
id                  uuid pk
tenant_id           uuid                         -- by ID, no FK
email               text                         -- canonical, lowercased
display_name        text
status              text                         -- 'active' | 'disabled' | 'orphaned'
created_at          timestamptz default now()
updated_at          timestamptz default now()
UNIQUE (tenant_id, email)
```

**`auth.sessions`**, **`auth.api_keys`** — standard shapes, fleshed out by W3/Z1 plan items. Not detailed here.

**`directory.external_identities`** (auth.users ↔ external directory subjects)
```
id                  uuid pk
tenant_id           uuid
user_id             uuid                         -- auth.users.id (cross-schema; no FK)
provider_id         text                         -- 'entra' | 'google'
external_subject    text                         -- OIDC sub / Entra objectId
raw_profile         jsonb
synced_at           timestamptz
UNIQUE (provider_id, external_subject)
```

**`oauth.oauth_tokens`**
```
id                  uuid pk
tenant_id           uuid
provider_id         text                         -- 'entra'
partition_key       text                         -- app-only: 'app:<clientId>'
                                                 -- OBO/user:  'user:<homeAccountId>'
scope_set           jsonb                        -- scopes this bundle was issued for
envelope_version    smallint                     -- 1
kms_key_id          text                         -- KMS key ARN used to wrap the DEK
wrapped_dek         bytea                        -- KMS-encrypted DEK
iv                  bytea                        -- 12 bytes
auth_tag            bytea                        -- 16 bytes (AES-GCM)
ciphertext          bytea                        -- encrypted TokenBundle JSON
expires_at          timestamptz                  -- access-token expiry
created_at          timestamptz default now()
updated_at          timestamptz default now()
UNIQUE (tenant_id, provider_id, partition_key)
```

**`oauth.oauth_state`** (short-lived CSRF state for admin-consent redirect)
```
state               text pk                      -- crypto-random; appears in URL ?state=
provider_id         text
connector_ids       text[]                       -- which connectors are being consented
nonce               text
created_at          timestamptz default now()
expires_at          timestamptz                  -- now() + 15min
```

**`audit.audit_log`**
```
id              bigserial pk
tenant_id       uuid
actor_type      text                             -- 'user' | 'system'
actor_id        text
provider_id     text                             -- nullable
connector_id    text                             -- nullable
operation       text                             -- 'oauth.admin_consent', etc.
resource_type   text
resource_ids    text[]
result          text                             -- 'ok' | 'failure'
metadata        jsonb
ts              timestamptz default now()
```

**`connector_ms365_directory.*`** — populated by Epic 1's directory connector for JIT mapping ground truth; schema details deferred to the directory connector module's Drizzle file. Tables: `directory_users` (Entra-side cache), `directory_groups`, `directory_group_members`, `sync_state` (delta tokens).

### 4.3 Database roles & RLS

- **`platform_admin`** — owns all schemas, runs migrations, `BYPASSRLS`. Operations only.
- **`tenant_user`** — application connection. `USAGE` on every schema, per-table SELECT/INSERT/UPDATE/DELETE, **RLS enforced**.
- **Every tenant-scoped table has RLS**: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`. The request middleware does `SET LOCAL app.tenant_id = '<uuid>'` per transaction.
- `oauth.oauth_state` is **RLS-exempt** (no tenant context yet during inbound consent); secured by TTL + secure-random state token.
- `audit.audit_log` is RLS-enforced on `tenant_id`; cross-tenant admin queries use the `platform_admin` role.

## 5. TokenVault & KMS envelope encryption

### 5.1 Interface

```ts
type TokenBundle = {
  accessToken: string
  refreshToken: string | null         // null for app-only (client_credentials)
  scopes: string[]
  expiresAt: Date
  meta: Record<string, unknown>       // home_account_id, tid, etc. — provider-specific
}

interface TokenVault {
  get(tenantId: string, providerId: string, partitionKey: string): Promise<TokenBundle | null>
  put(tenantId: string, providerId: string, partitionKey: string, bundle: TokenBundle): Promise<void>
  delete(tenantId: string, providerId: string, partitionKey: string): Promise<void>
}
```

### 5.2 Envelope mechanics

Standard AWS pattern: per-row Data Encryption Key (DEK), wrapped by KMS.

**`put`:**
1. `kms.GenerateDataKey({ KeyId: env.KMS_KEY_ARN, KeySpec: 'AES_256' })` → `{ Plaintext: 32B, CiphertextBlob, KeyId }`
2. `iv = crypto.randomBytes(12)`
3. `cipher = crypto.createCipheriv('aes-256-gcm', Plaintext, iv)`; encrypt JSON `TokenBundle`; capture `cipher.getAuthTag()` (16B)
4. `Plaintext.fill(0)` — zero key bytes
5. UPSERT `oauth.oauth_tokens(tenant_id, provider_id, partition_key)` with `envelope_version=1`, `kms_key_id`, `wrapped_dek=CiphertextBlob`, `iv`, `auth_tag`, `ciphertext`, `expires_at`, `scope_set`

**`get`:**
1. SELECT row (RLS-protected); return null if absent
2. `kms.Decrypt({ CiphertextBlob: wrapped_dek, KeyId: kms_key_id })` → `Plaintext`
3. `decipher = crypto.createDecipheriv('aes-256-gcm', Plaintext, iv)`; `decipher.setAuthTag(auth_tag)`; decrypt
4. Zero `Plaintext`; parse + return

The `envelope_version` byte dispatches on shape so algorithm/key migrations don't require a single big-bang rewrap.

### 5.3 Refresh & single-flight

MSAL Node does not coordinate concurrent refreshes across instances; we own this. The mechanism is a row-level Postgres lock:

```ts
async function acquireToken(tenantId, providerId, partitionKey): Promise<TokenBundle> {
  return db.transaction(async (tx) => {
    const row = await tx.execute(
      `SELECT * FROM oauth.oauth_tokens
        WHERE tenant_id=$1 AND provider_id=$2 AND partition_key=$3
        FOR UPDATE`,
      [tenantId, providerId, partitionKey]
    )
    if (!row) throw new NoTokenForTenant({ tenantId, providerId })

    if (row.expires_at > addMinutes(now(), 5)) return decryptAndReturn(row)

    const refreshed = await provider.refresh(decrypt(row), row.scope_set)
    await tx.execute(/* UPDATE oauth.oauth_tokens SET ciphertext=…, iv=…, … */)
    await audit.recordAudit({ tenantId, providerId, op: 'oauth.token_refresh', result: 'ok' })
    return refreshed
  })
}
```

Concurrent callers block on the row lock; the first commits a fresh expiry, the rest read it and short-circuit. Works equally for OBO (refresh-token-based) and app-only (re-`acquireTokenByClientCredential`).

### 5.4 Key rotation

- **AWS-managed annual KMS rotation** is transparent: `kms.Decrypt` selects the right key version from `wrapped_dek`. No app changes.
- **App-driven KMS-key migration** (e.g., switching to a new ARN) is a background batch: SELECT, decrypt-with-old, encrypt-with-new, UPDATE `kms_key_id` + `wrapped_dek`. Bump `envelope_version` if the shape changes.

## 6. OAuthProvider interface + Entra implementation

### 6.1 Provider interface (`platform/oauth/src/provider.ts`)

```ts
interface OAuthProvider {
  id: string                                              // 'entra'

  buildAdminConsentUrl(input: {
    scopes: string[]
    redirectUri: string
    state: string
    tenantHint?: string                                   // tenant GUID, or 'organizations'
  }): string

  completeAdminConsent(input: {
    tenantQueryParam: string                              // 'tenant' from callback — UNTRUSTED hint
    state: string
  }): Promise<{ tenantId: string; appOnlyBundle: TokenBundle }>

  acquireAppOnly(tenantId: string, scopes: string[]): Promise<TokenBundle>

  acquireOnBehalfOf(input: {
    tenantId: string
    userAssertion: string                                 // user JWT from Teams SSO / web sign-in
    scopes: string[]
  }): Promise<TokenBundle>

  refresh(bundle: TokenBundle, scopes: string[]): Promise<TokenBundle>
}
```

### 6.2 Entra implementation

Wraps **`@azure/msal-node@5.2.0`** `ConfidentialClientApplication`. App-only flows require a tenant-specific authority, so one CCA per tenant ID is cached in an **LRU keyed by `tenantId`** (capacity 256, TTL 60 min). This is Redis-ready in shape today, LRU-backed per the YAGNI rule in CLAUDE.md.

```ts
const ccaCache = new LRU<string, ConfidentialClientApplication>({ max: 256, ttl: 60 * 60_000 })

function getCca(tenantId: string): ConfidentialClientApplication {
  const cached = ccaCache.get(tenantId)
  if (cached) return cached
  const cca = new ConfidentialClientApplication({
    auth: {
      clientId: env.ENTRA_CLIENT_ID,
      clientSecret: env.ENTRA_CLIENT_SECRET,
      authority: `https://login.microsoftonline.com/${tenantId}/v2.0`
    },
    system: { loggerOptions: { logLevel: 'Warning' } }
  })
  ccaCache.set(tenantId, cca)
  return cca
}
```

**MSAL is stateless from the platform's perspective.** We do not wire `ICachePlugin`. Each call goes through MSAL; we normalize the `AuthenticationResult` to our `TokenBundle` and persist via `TokenVault`. Reasons:
- Future providers (Trello, Google) have no MSAL — uniform handling.
- MSAL's serialized cache format is opaque; our schema stays clean and queryable.
- Single-flight is owned by `SELECT … FOR UPDATE` (§5.3) regardless of provider.

### 6.3 Admin-consent URL

We use Microsoft's dedicated `/adminconsent` endpoint — the only path that grants **application** permissions in one click:

```
https://login.microsoftonline.com/<tenant-or-organizations>/v2.0/adminconsent
  ?client_id=<entra-client-id>
  &redirect_uri=<our-redirect-uri>
  &scope=https://graph.microsoft.com/.default
  &state=<crypto-random>
```

`scope=.default` requests **everything** declared in the App Registration's required-permissions list — both delegated and application — per Microsoft Learn. See §8 for the implications.

## 7. Admin-consent flow

```
[1] CLI: pnpm tsx tooling/scripts/connect-tenant.ts --connectors=ms365-planner,ms365-directory
    → POSTs /oauth/entra/consent-url with { connectors: [...] }
    → API:
        - Looks up scopes via ConnectorRegistry (used as a sanity check; URL uses .default)
        - INSERT oauth.oauth_state row with random state, 15-min TTL
        - audit: 'oauth.consent_url_issued'
        - Returns consent URL
    → CLI prints URL.

[2] Customer admin clicks URL → Microsoft consent screen renders the superset scopes
    from the App Registration's required-permissions list.

[3] Admin accepts → Microsoft redirects:
    GET /oauth/entra/callback?admin_consent=True&tenant=<customer-tenant-guid>&state=<state>

[4] Callback handler:
    a. Look up oauth.oauth_state by state — reject (400, ConsentStateExpired) if missing/expired.
    b. Read 'tenant' query param as UNTRUSTED hint only.
    c. entra.acquireAppOnly(tenantHint, ['https://graph.microsoft.com/.default']).
    d. Decode the app-only JWT; verify 'tid' claim == tenant hint.
       Mismatch → reject (400, ConsentTidMismatch) + audit 'oauth.admin_consent_tid_mismatch'.
    e. UPSERT tenant.tenants — slug derived from tenant GUID; display_name fetched from
       Graph /organization in a follow-up call (deferred to Epic 2's Graph client; in Epic 1
       we store slug as the display_name placeholder).
    f. For each connector in the stored state row:
       UPSERT tenant.tenant_connectors with status='active', scope_set=connector.requiredScopes,
       consented_at=now(), consented_by_user_id=NULL (no user authenticated yet).
    g. vault.put(tenantId, 'entra', 'app:<clientId>', appOnlyBundle).
    h. DELETE oauth_state row.
    i. audit.recordAudit: op='oauth.admin_consent', connector_ids=[...], result='ok'.
    j. Render success page.

[5] (Later) First user @-mention in Teams (Epic 4 territory):
    Channel adapter receives Teams SSO assertion → entra.acquireOnBehalfOf →
    vault.put(tenantId, 'entra', 'user:<homeAccountId>', oboBundle).
```

### 7.1 Bootstrap variant — `seed-first-tenant.ts`

Bypasses the consent UI because the deploying tenant has already admin-consented its own Entra app via the Azure portal. Reads env, executes steps **4e–4i** directly:

```
BOOTSTRAP_TENANT_SLUG
BOOTSTRAP_TENANT_NAME
BOOTSTRAP_ENTRA_TENANT_ID
BOOTSTRAP_ENTRA_CLIENT_ID
BOOTSTRAP_ENTRA_CLIENT_SECRET
BOOTSTRAP_ADMIN_EMAIL
BOOTSTRAP_CONNECTORS                  # csv: 'ms365-planner,ms365-directory'
```

Idempotent: re-running on populated DB is a no-op. Same code path as the callback — no Seta-specific carve-outs, no privilege flag.

### 7.2 Routes (`platform/oauth/src/routes.ts`)

| Route | Auth | Purpose |
|---|---|---|
| `POST /oauth/:providerId/consent-url` | optional admin API key (rate-limited) | Returns admin-consent URL for given connectors |
| `GET /oauth/:providerId/callback` | none (Microsoft redirects here) | Completes admin consent; idempotent on state replay |
| `POST /oauth/:providerId/revoke` | platform admin | Manual revocation: delete vault row + mark connector revoked |
| `POST /oauth/:providerId/exchange-obo` | service-internal (channel adapters) | Exchange user assertion for OBO bundle |

### 7.3 Revocation handling

`refresh` / `acquireOnBehalfOf` returning `AADSTS65001`, `AADSTS50173`, or Graph 401 → caught in `platform/oauth/src/refresh.ts` → mark `tenant_connectors.status='revoked'`, DELETE oauth_tokens row, audit `op='oauth.revoke_detected'`, throw `ConsentRevoked`. Re-consent flow: admin reruns the CLI; callback flips status back to `active`.

## 8. ConnectorRegistry + scope strategy

### 8.1 Registry interface

```ts
interface ConnectorDefinition {
  id: string
  providerId: string
  displayName: string
  description: string
  customerFacingRationale: string
  requiredScopes: { delegated: string[]; application: string[] }
  capabilities: { syncable: boolean; writes: boolean }
}

interface ConnectorRegistry {
  register(def: ConnectorDefinition): void
  get(id: string): ConnectorDefinition
  list(): ConnectorDefinition[]
  listByProvider(providerId: string): ConnectorDefinition[]
  scopeUnion(connectorIds: string[]): { delegated: string[]; application: string[] }
  requireConsent(tenantId: string, connectorId: string): Promise<void>
}
```

Registration is static in the composition root, per CLAUDE.md "no plugin loaders":

```ts
// apps/api/src/main.ts
const registry = createConnectorRegistry()
registry.register(plannerConnector)
registry.register(directoryConnector)
```

### 8.2 Two connector manifests (Epic 1)

```ts
// modules/connectors/ms365-planner/src/manifest.ts
export const plannerConnector: ConnectorDefinition = {
  id: 'ms365-planner',
  providerId: 'entra',
  displayName: 'Microsoft 365 Planner',
  description: 'Read and write tasks, plans, and buckets in Microsoft Planner.',
  customerFacingRationale:
    'Lets the agent list, create, update, and complete Planner tasks; create new plans on the user\'s behalf for new workstreams.',
  requiredScopes: {
    delegated: ['Tasks.ReadWrite', 'Group.ReadWrite.All', 'Group.Read.All'],
    application: ['Tasks.Read.All', 'Group.Read.All']
  },
  capabilities: { syncable: true, writes: true }
}

// modules/connectors/ms365-directory/src/manifest.ts
export const directoryConnector: ConnectorDefinition = {
  id: 'ms365-directory',
  providerId: 'entra',
  displayName: 'Microsoft 365 Directory',
  description: 'Sync users, groups, and group memberships from your Microsoft 365 directory.',
  customerFacingRationale:
    'Lets the agent know who exists in your organization, who reports to whom, and who is in which group — used for workload analysis and assignment recommendations.',
  requiredScopes: {
    delegated: ['User.Read'],
    application: ['User.Read.All', 'Group.Read.All']
  },
  capabilities: { syncable: true, writes: false }
}
```

### 8.3 The `.default` superset tradeoff

Entra's `/adminconsent` endpoint with `scope=.default` consents to **everything** declared in the App Registration's required-permissions list — both delegated and application. There is no per-scope toggle at consent time for application permissions.

**Decision: one Entra App Registration per platform deploy, declared with the superset of all current connectors' scopes.** Connector enablement gates feature exposure *inside our system* (the `tenant_connectors` table), not at Microsoft's consent layer.

Implications:
- Customer install docs explain which scopes serve which connector even though the consent screen renders them as one block.
- A "Planner-only" customer still sees directory scopes on the consent screen. Documented fallback if a customer rejects the bundle: maintain a second "minimal" App Registration; picked by env config at consent-URL build time. **Do not build this in P1**; document the escape hatch only.

### 8.4 Syncable contract (for Epic 3's sync worker)

Connectors that mirror data declare `capabilities.syncable: true` and export:

```ts
interface Syncable {
  sync(ctx: SyncContext): Promise<SyncResult>
  fullResync(ctx: SyncContext): Promise<SyncResult>
}
```

The sync worker (Epic 3) iterates `(tenant, connector)` pairs with `status='active'` and `capabilities.syncable`, calling each connector's `sync(ctx)`. Adding Google Workspace is a new connector implementing `Syncable`.

## 9. Audit

### 9.1 Writer

`platform/audit/src/audit.ts`:

```ts
type AuditEntry = {
  tenantId: string
  actor: { type: 'user'; userId: string } | { type: 'system'; label: string }
  providerId?: string
  connectorId?: string
  operation: string
  resource?: { type: string; ids: string[] }
  result: 'ok' | 'failure'
  metadata?: Record<string, unknown>
}

async function recordAudit(entry: AuditEntry): Promise<void>
```

- **Synchronous INSERT** (not fire-and-forget). For an audit log we prefer to fail the user operation than silently lose the record.
- **RLS-enforced**: tenants only ever read their own log.
- **Parallel OTel log line** via `@seta/observability` so the same event lands in CloudWatch / Jaeger for SIEM export in P2.

### 9.2 Operations audited in Epic 1

| Operation | When |
|---|---|
| `tenant.bootstrap` | Seed script creates a tenant |
| `oauth.consent_url_issued` | Consent URL generated |
| `oauth.admin_consent` | Successful callback completion |
| `oauth.admin_consent_tid_mismatch` | Callback `tenant` hint ≠ token `tid` |
| `oauth.token_refresh` | Token successfully refreshed |
| `oauth.token_refresh_failed` | Refresh attempted, provider returned error |
| `oauth.revoke_detected` | Refresh/OBO returned revoked error |
| `oauth.revoke_manual` | Admin endpoint invoked |
| `connector.enabled` / `connector.disabled` | `tenant_connectors.status` flip |

## 10. Error model

All errors thrown by `platform/oauth` are `DomainError` subclasses from `@seta/middleware/errors`, mapped to RFC 7807 by the kernel:

| `DomainError` class | HTTP | Trigger |
|---|---:|---|
| `ConsentStateExpired` | 400 | `oauth_state` row missing or expired |
| `ConsentTidMismatch` | 400 | callback `tenant` hint ≠ token `tid` |
| `ConnectorNotConsented` | 403 | tool calls vault for a connector this tenant hasn't enabled |
| `ConsentRevoked` | 401 | refresh/OBO returns revoked-grant error |
| `NoTokenForTenant` | 401 | `vault.get` returned null |
| `KmsUnavailable` | 503 | KMS Decrypt failed (network/permissions) |
| `KmsAuthTagInvalid` | 500 *(fatal, alerts ops)* | AES-GCM auth tag mismatch — tampering or wrong key |
| `ProviderUnavailable` | 503 | Entra token endpoint 5xx after retries |

## 11. Observability

- **Spans** on every `acquireToken` (attributes: provider, partition_kind {app|user}, cache_hit {true|false|refreshed}, latency_ms) and every vault encrypt/decrypt.
- **Metrics**: `oauth_token_refresh_total{provider,result}`, `oauth_tokens_active{provider}`, `oauth_consent_completed_total`, `kms_decrypt_latency_seconds`.
- **Logger**: `@seta/observability` only. No `console.log` outside CLI scripts (CLAUDE.md).
- **OTel init order**: `apps/api` starts via `node --import ./instrumentation.ts …`. `sdk.start()` is never called from `main.ts`.

## 12. Testing strategy

TDD for `platform/*` per CLAUDE.md.

### 12.1 Unit (co-located `src/**/*.test.ts`)

| Package | Key tests |
|---|---|
| `platform/oauth` | TokenVault encrypt/decrypt round-trip with localstack KMS; `oauth_state` TTL; refresh single-flight via concurrent `Promise.all` against the same row |
| `platform/oauth/providers/entra` | Consent URL shape; callback with **msw**-recorded Entra responses; `tid` validation rejects mismatch |
| `platform/connector-registry` | Scope union; `requireConsent` throws `ConnectorNotConsented` if row missing |
| `platform/audit` | Synchronous INSERT visible in same transaction; OTel log line emitted |
| `platform/db` | RLS denies cross-tenant SELECT under `tenant_user` |
| `modules/connectors/ms365-planner` | Manifest scope strings match Microsoft's docs |
| `modules/connectors/ms365-directory` | JIT mapper produces correct `auth.users` row from ID-token claims |

### 12.2 Integration (`tests/integration/**`, requires `DATABASE_URL`)

- Real Postgres with both `platform_admin` and `tenant_user` roles. Tenant middleware sets `app.tenant_id`; RLS enforces isolation.
- **msw** recordings for Entra HTTP (no live IdP in CI).
- **localstack** for KMS in CI; real AWS KMS in staging.
- End-to-end consent flow: POST consent-url → fake Microsoft → GET callback → tenant + tenant_connectors + oauth_tokens rows present; audit log entries present; idempotent on state replay.
- Refresh race: spawn N concurrent `acquireToken` calls against the same row; assert exactly one provider HTTP call.

### 12.3 E2E (`tests/e2e/**`)

- Bootstrap seed against a fresh Postgres + fresh Entra dev app; second run is a no-op (AC-8).
- Real-Entra consent against a dev tenant — manual gate, captured in a runbook (not run in CI).

## 13. Acceptance criteria mapping

| AC (from brainstorm Epic 1) | Where it's met |
|---|---|
| AC-1: ≤5 min admin consent on fresh tenant | §7 single redirect to `/v2.0/adminconsent` |
| AC-2: AES-GCM + KMS-wrapped DEK | §5.2 envelope |
| AC-3: Auto-refresh 5 min before expiry | §5.3 `acquireToken` |
| AC-4: Minimum scopes per connector | §8 ConnectorDefinition + §8.3 superset tradeoff |
| AC-5: Clean revocation surface | §7.3 revocation path + §10 error model |
| AC-6: Per-tenant isolation | §4.3 RLS + `app.tenant_id` middleware |
| AC-7: DEK rotation supported | §5.4 |
| AC-8: Idempotent seed script | §7.1 |

## 14. Dependencies & version pins

Kernel (paper contracts — assumed delivered by K-phase):
- `@seta/middleware/errors` — `DomainError` base + RFC 7807 mapping
- `@seta/middleware` logger
- `@seta/tenant` — `tenantContext.getTenantId()`, RLS `SET LOCAL` middleware
- `@seta/observability` — OTel SDK init order, logger
- `apps/api` boot via `node --import ./instrumentation.ts …`
- Drizzle migration-runner conventions

Third-party (pinned per research, May 2026):
- `@azure/msal-node@5.2.0`
- `@aws-sdk/client-kms@3.1045.0`
- `@hono/zod-openapi` (current stable; version pinned at `pnpm add` time per CLAUDE.md CLI-only rule. `z` import per CLAUDE.md footgun.)
- `drizzle-orm` + `drizzle-kit`
- `lru-cache`
- `zod`

**Not used**: `@microsoft/microsoft-graph-client` (last published 2022, effectively dead); `@microsoft/msgraph-sdk` (pre-GA Kiota client as of May 2026). Epic 2 introduces a thin `graphFetch` wrapper.

## 15. Open follow-ups (deferred)

- **Minimal App Registration escape hatch** — build if a design-partner customer rejects the superset scope bundle. Doc only in P1.
- **HSM-backed key**, **per-tenant CMK**, **multi-region KMS replication** — P3 SOC 2 prep.
- **Tenant-admin audit-log API endpoint** — P2 admin surface.
- **SIEM export of audit log** — P2 CloudWatch destination.
- **Per-tenant `display_name`** — fetched from Graph `/organization` once Epic 2 lands the Graph client. P1 uses slug as placeholder.
- **Web admin consent UI** — P2 Studio.

## 16. CLAUDE.md changes implied by this spec

1. **Add boundary line for `modules/connectors/<vendor>/`** in the Boundaries section: "vendor adapters; may import `platform/*` and other `modules/connectors/*`; may NOT import `modules/products/*` or `modules/channels/*`."
2. **Update package layout reference** to reflect the move of `platform/ms365-planner` → `modules/connectors/ms365-planner`.
3. Rename `seta_admin` examples (if any) → `platform_admin` to honor the "Seta is just an ordinary tenant" principle.

## 17. References

- Microsoft Learn — [Admin consent on the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/v2-admin-consent)
- Microsoft Learn — [Token caching in MSAL Node](https://learn.microsoft.com/en-us/entra/msal/javascript/node/caching)
- MSAL Node — [ConfidentialClientApplication API ref](https://azuread.github.io/microsoft-authentication-library-for-js/ref/classes/_azure_msal_node.ConfidentialClientApplication.html)
- AWS — [KMS GenerateDataKey](https://docs.aws.amazon.com/kms/latest/APIReference/API_GenerateDataKey.html)
- AWS — [KMS cryptography essentials](https://docs.aws.amazon.com/kms/latest/developerguide/kms-cryptography.html)
- AzureAD/microsoft-authentication-library-for-js [#7909](https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/7909) — concurrent `acquireTokenSilent` race

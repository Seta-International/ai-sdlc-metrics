# Per-tenant Entra SSO with operator-managed configuration

Status: Draft — pending user review
Date: 2026-05-18
Owner: identity platform

## Problem

Sign-in fails with `AADSTS50194` because the API uses the `/common` Entra
authority while the registered app is single-tenant. The root cause is
architectural: a single global `EntraSsoProvider` configured from the
`ENTRA_SSO_TENANT` env var (default `'common'`) cannot serve multiple
customer tenants, each of whom should have its own Entra app registration.

The platform is multi-tenant B2B SaaS. Each customer tenant needs an
identity-trust boundary inside *its own* Entra directory so Conditional
Access, audit, and consent live where the customer's security team
expects them. A Seta-owned multi-tenant Entra app would put Seta in the
trust path for every customer's employees — the opposite of what
enterprise buyers want.

## Goal

Ship a production-ready bring-your-own-IdP (BYO-IdP) SSO with operator-
managed per-tenant Entra app configuration, replacing the existing
single-Entra-app design.

## Non-goals (v1)

- SCIM / automated user provisioning. Deferred.
- Multi-workspace users (one user belongs to ≤1 tenant). The existing
  `tenant_members.user_id` UNIQUE constraint stays.
- Self-service customer setup wizard. Operator (Seta) configures each
  tenant's SSO on the customer's behalf.
- Single Logout (SLO).
- Google SSO. Design is provider-extensible (discriminated union) so
  Google can be added later as a code-only change.
- Bounce/complaint handling for the mailer subsystem.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Tenant discovery at login | Email-first: user types email, API resolves tenant by email domain |
| SSO providers in v1 | Entra only; schema is forward-compatible with Google/OIDC/SAML |
| Break-glass on lockout | Magic-link to tenant owner, single-use, 10-min TTL, SMTP |
| Bootstrap | `tooling/scripts/seed-first-tenant.ts` writes Seta's SSO config as part of seeding the first tenant. Seta is just a tenant row — no special-case schema |
| Auto-join | New user whose id-token email matches a tenant's allowed domain is auto-joined as `role='member'`, `source='sso_domain_match'` |
| Connector OAuth (Graph API access) | Unchanged — remains a single operator-owned multi-tenant Entra app, separate from per-tenant SSO |
| SSO admin surface | Superadmin-only. Tenant owners/admins cannot edit their own SSO. |
| Client secret storage | Reuse existing KMS-backed `oauth.oauth_tokens` vault |
| Mailer | New platform package `@seta/mailer` wrapping SMTP / SES / Graph / Console backends |
| Dev affordance for magic links | `ConsoleMailer` selected when `MAILER_BACKEND=console`; logs the link instead of sending. Fails closed in production. |
| UX hint | Signed (non-session) `seta_last_login` cookie carries `{ email, provider, tenant_display_name }` for one-click re-login |

## Architecture

### Two Entra apps, two purposes

| Entra app | Owner | Purpose | How tenant is identified |
|---|---|---|---|
| Platform connector app | Seta (operator) | Graph API access (Planner, Directory, future Teams, future Outlook mail send). Multi-tenant in Azure portal; customer admin grants admin-consent once. | `tenantHint` (customer's Entra tenant id) on consent URL. App-only tokens via `acquireAppOnly(tenantId, scopes)`. |
| Per-tenant SSO app | Customer | User sign-in only. Single-tenant; customer registers their own app in their own Entra directory. | Authority `login.microsoftonline.com/<config.entra_tenant_id>/v2.0`. Loaded per-request from `auth.sso_configs`. |

### Data model

```ts
auth.sso_configs {
  tenant_id           uuid    NOT NULL FK→tenant.tenants.id
  provider            text    NOT NULL  -- 'entra' (v1) | future: 'google' | 'oidc' | 'saml'
  config              jsonb   NOT NULL  -- provider-specific, Zod-validated discriminated union
  secret_vault_id     text              -- nullable: SAML cert-based providers won't need it
  enabled             boolean NOT NULL DEFAULT true
  created_by_user_id  uuid
  created_at, updated_at timestamptz

  PRIMARY KEY (tenant_id, provider)
}

auth.sso_email_domains {
  domain     text NOT NULL PRIMARY KEY  -- lowercased at the app boundary
  tenant_id  uuid NOT NULL FK→sso_configs.tenant_id
  created_at timestamptz
}

auth.magic_links {
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
  user_id         uuid NOT NULL FK→auth.users.id
  tenant_id       uuid NOT NULL FK→tenant.tenants.id
  token_hash      bytea NOT NULL          -- sha256 of raw token; raw never stored
  expires_at      timestamptz NOT NULL    -- now() + 10 min by default
  consumed_at     timestamptz             -- nullable; single-use
  requested_ip    inet
  created_at      timestamptz NOT NULL DEFAULT now()
}
```

**Zod per-provider config shapes** (lives in `@seta/identity`):

```ts
const EntraConfig = z.object({
  entra_tenant_id: z.string().min(1),  // GUID or verified domain
  client_id: z.string().min(1),
})

// Scaffolded for forward-compat, not wired in v1:
const GoogleConfig = z.object({
  client_id: z.string().min(1),
  hosted_domain: z.string().min(1),
})
const OidcConfig = z.object({
  discovery_url: z.string().url(),
  client_id: z.string().min(1),
  scopes: z.array(z.string()).default(['openid', 'email', 'profile']),
})
const SamlConfig = z.object({
  idp_metadata_url: z.string().url().optional(),
  idp_sso_url: z.string().url().optional(),
  idp_x509_cert: z.string().optional(),
})

const SsoConfig = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('entra'), config: EntraConfig }),
])
```

**Secret storage:** the client secret is stored via the existing
`oauth.oauth_tokens` vault. Insert with
`vault.put(tenantId, 'sso-entra', 'sso', { accessToken: <client_secret> })`.
`sso_configs.secret_vault_id = 'sso-entra:sso'` is the composite key into the
vault. Same envelope encryption, same KMS wrap, same audit story.

**RLS:** all three tables enable RLS using the same pattern as
`tenant.tenant_connectors` (filter on `app.tenant_id` set by request
middleware). `magic_links` is only inserted/read via API in a single short
window; RLS is the backstop.

**Email-domain denylist** — code constant in
`@seta/identity/src/sso-domain-denylist.ts` containing the public catch-all
domains (`gmail.com`, `outlook.com`, `yahoo.com`, ...). Enforced at insert
time by the admin route. Not a security boundary (the auth-time
issuer-and-email-domain check is the security boundary); just a guardrail
against an operator typing a wrong value.

### Provider factory

```ts
interface SsoProvider {
  readonly id: 'entra' | 'google'
  authorizeUrl(opts: { state: string; pkce: string; redirectUri: string; loginHint?: string }): string
  exchangeCode(opts: { code: string; pkce: string; redirectUri: string }): Promise<OidcIdToken>
}

function ssoProviderFor(row: SsoConfigRow, clientSecret: string): SsoProvider {
  switch (row.provider) {
    case 'entra': return new EntraSsoProvider({ ...row.config, clientSecret })
    default: throw new Unreachable(row.provider)
  }
}
```

`EntraSsoProvider` is reconstructed per request from the row + decrypted
secret. Discovery doc is cached per `entra_tenant_id` in a process-local
LRU (keyed string, TTL 1h) — same pattern as the connector OAuth provider.

### Login flow (end-to-end)

```
1. User opens /login. If seta_last_login cookie exists and signature
   verifies, render State B ("Continue as alice@acme.com (Acme)"),
   otherwise render State A (email entry form).

2. State A submit → POST /sso/discover { email }
   - normalize domain
   - lookup auth.sso_email_domains for the domain
   - hit  → 200 { provider, tenant_pub_id, display_name }
   - miss → 200 { error: 'no_workspace_for_email' }  (canonical, non-leaky)

3. Browser → POST /sso/start { email, returnTo }
   API:
   - re-resolve tenant from email (defense-in-depth; never trust the
     tenant_pub_id echoed from discover)
   - load sso_configs row + decrypt client_secret from vault
   - build Entra authority login.microsoftonline.com/<entra_tenant_id>/v2.0
   - mint PKCE + state, sign seta_sso_state cookie carrying
     { pkce, state, tenant_id, returnTo, email }
   - return { url } — Entra authorize URL with login_hint=<email>

4. Browser → Microsoft. User authenticates against the customer's Entra
   directory.

5. Microsoft → GET /sso/callback/entra?code=&state=
   API:
   - verify state cookie HMAC, extract tenant_id
   - re-load sso_configs (config is source of truth, not the cookie)
   - exchange code → id_token; verify issuer matches
     login.microsoftonline.com/<entra_tenant_id>/v2.0 and audience matches
     client_id
   - SECURITY: id_token email-claim domain MUST end in a domain owned by
     this tenant; mismatch → 400. Prevents a user with bob@gmail.com in
     Acme's Entra directory from claiming Acme membership.
   - upsertUserByIdentity(...) (existing function, unchanged)
   - AUTO-JOIN: if tenant_members has no row for this user, insert
     (user_id, tenant_id, role='member', source='sso_domain_match')
   - issue session cookie (existing seta_sess) + set seta_last_login hint
     cookie + redirect to returnTo
```

### Break-glass magic-link flow

```
1. User on /login clicks "Can't sign in? Email me a link" → /login/magic.

2. POST /sso/magic/request { email, returnTo }. API:
   - resolve tenant by email
   - look up user; allow ONLY if user exists AND is
     tenant_members.role='owner'. Otherwise: 200 with no row inserted,
     no email sent (no enumeration).
   - generate 32-byte URL-safe token; store sha256(token) in
     auth.magic_links; TTL 10 min
   - send via mailer.send(magicLinkMessage({ to, link, tenantDisplayName }))
   - audit: sso.magic_link_issued

3. Owner clicks link → GET /sso/magic/consume?t=<token>:
   - sha256 the param; atomic UPDATE ... SET consumed_at=now()
     WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at > now()
     RETURNING user_id, tenant_id
   - issue session cookie + set seta_last_login + redirect to
     /console/admin/sso/<tenant_id> so they can immediately repair SSO
   - audit: sso.magic_link_consumed

4. Rate limit: 3 requests per email per hour, 10 per IP per hour. Reuses
   existing rateLimit middleware that already wraps /sso/login/*.
```

### Last-login hint cookie

After a successful sign-in (callback or magic-link consume) the API sets:

```
Set-Cookie: seta_last_login=<signCookie({ email, provider,
            tenant_display_name, ts })>; HttpOnly=false; Secure;
            SameSite=Lax; Path=/; Max-Age=2592000
```

`HttpOnly=false` is intentional — the `LoginPage` reads it client-side to
render "Continue as Alice". The cookie carries no auth material. The
client does **not** verify the HMAC signature (HMAC requires a private
key the browser doesn't have); only the server verifies. So a tampered
cookie may render an attacker-chosen display name in State B
(cosmetic-only nuisance), but the actual sign-in still flows through
`/sso/start` → Microsoft → `/sso/callback/entra`, where the id_token's
issuer-and-email-domain checks are the real security boundary. The
session cookie (`seta_sess`) stays `HttpOnly`.

`LoginPage` states:

- State A: no cookie / invalid signature → email-entry form
- State B: valid cookie → "Continue as alice@acme.com (Acme)" primary
  button (calls `/sso/start` directly, skips `/sso/discover`) + "Use a
  different account" secondary (clears the cookie, falls back to State A)

Default `/sso/logout` keeps the hint so next sign-in is one click.
A "Sign out and forget me" option clears it. Same model as Google's
account picker. A future "shared computer" toggle on the LoginPage can
suppress setting the cookie at all; out of scope for v1.

## API surface

### User-facing

```
POST /sso/discover                   { email }                  → { provider, tenant_pub_id, display_name } | { error }
POST /sso/start                      { email, returnTo }         → { url }
GET  /sso/callback/entra?code&state                              → 302 to returnTo
POST /sso/magic/request              { email, returnTo }         → 200 (always; no enumeration)
GET  /sso/magic/consume?t                                        → 302
POST /sso/logout                     (existing)                  → 200
GET  /me                             (existing)                  → MeResponse
```

The current `POST /sso/login/:provider` is **deleted** (no compat shim).

### Superadmin

```
GET    /admin/sso/tenants                                      → list rows
GET    /admin/sso/tenants/:tenantId                            → { config (no secret), domains[], last_test }
PUT    /admin/sso/tenants/:tenantId                            → upsert; clientSecret optional
DELETE /admin/sso/tenants/:tenantId                            → disable + delete
POST   /admin/sso/tenants/:tenantId/test                       → server-side validation only
POST   /admin/sso/tenants/:tenantId/rotate-secret  { clientSecret }
```

Server-side test does three checks:

1. Fetch discovery doc at `.well-known/openid-configuration`
2. Verify `issuer` field
3. Client-credentials probe — POST to the token endpoint with the stored
   client_id + secret and `grant_type=client_credentials,
   scope=https://graph.microsoft.com/.default`. Success proves the
   credential is valid without needing any Graph permissions or a browser
   round-trip.

All mutations emit audit events.

## `@seta/mailer` platform package

New platform package at `platform/mailer/`. Vendor-neutral interface,
vendor-specific backend factories. Selection at boot via env.

```ts
export interface Mailer { send(msg: OutboundMessage): Promise<void> }
export interface OutboundMessage {
  to: string | string[]
  subject: string
  text: string
  html?: string
  from?: string
  replyTo?: string
  headers?: Record<string, string>
  idempotencyKey?: string
}

export function createSmtpMailer(opts: SmtpOpts): Mailer       // nodemailer
export function createSesMailer(opts: SesOpts): Mailer         // @aws-sdk/client-ses
export function createGraphMailer(opts: GraphOpts): Mailer     // @seta/ms-graph
export function createConsoleMailer(opts: ConsoleOpts): Mailer // logs only

export function createMailerFromEnv(env, deps): Mailer
```

Backends:

| Backend | Use case | Auth |
|---|---|---|
| `smtp` | Self-hosted or Postmark/Mailgun/SES-SMTP | `SMTP_URL` |
| `ses` | AWS-hosted | IAM (existing `AWS_REGION` + role) |
| `graph` | Dogfood via operator M365 mailbox | Constructor-injected token-getter using the platform connector Entra app, `Mail.Send` scope |
| `console` | Local dev | none |

Zod refinement:

- `MAILER_BACKEND=smtp` → `SMTP_URL` required
- `MAILER_BACKEND=ses` → `AWS_REGION` required
- `MAILER_BACKEND=graph` → `GRAPH_MAILBOX_USER_ID` + `OPERATOR_ENTRA_TENANT_ID` required
- `MAILER_BACKEND=console` + `NODE_ENV=production` → boot error (fail closed)

Templates are TypeScript functions colocated with the caller (e.g.
`@seta/identity/src/mail-templates/magic-link.ts`), returning
`OutboundMessage`. No template engine in v1.

Cross-backend contract suite lives in `platform/mailer/tests/contract/` —
every backend must satisfy the same happy-path + error-shape tests. This
guarantees swapping `MAILER_BACKEND` is a config change.

## Module ownership

| Package | Owns | Imports |
|---|---|---|
| `@seta/identity` | SSO schema (`sso_configs`, `sso_email_domains`, `magic_links`), user-facing routes (`/sso/*`), superadmin routes (`/admin/sso/*`), provider factory, `EntraSsoProvider`, magic-link issue/consume, email-domain denylist, mail templates | `@seta/middleware`, `@seta/observability`, `@seta/oauth` (vault), `@seta/audit`, `@seta/tenancy` (membership writes), `@seta/mailer` |
| `@seta/mailer` (new) | `Mailer` interface, SMTP/SES/Graph/Console backends, `createMailerFromEnv` | `nodemailer`, `@aws-sdk/client-ses`, `@seta/ms-graph`, `@seta/observability` |
| `@seta/oauth` | Unchanged. Vault and connector-OAuth `EntraProvider` stay as today. | unchanged |
| `@seta/identity-client` | `LoginPage` (email-first, two-state), `MagicLinkRequestPage`, `useMe` (unchanged), `signIn` rewrite as `discover` + `start`, `requestMagicLink`, last-login cookie reader | React, fetch |
| `apps/api` | Composition: env parsing, route mounting, mailer construction. Renames `entra` → `platformConnectorOAuth`. | wiring only |
| `apps/console` | Superadmin pages under `_superadmin/admin/tenants/$tenantId/sso/*`. Updated login + magic-link request routes. | `@seta/identity-client`, `@seta/ui` |
| `tooling/scripts` | `seed-first-tenant.ts` writes the bootstrap SSO config + domains | unchanged shape |

## Env vars

```diff
# Deleted
- ENTRA_SSO_TENANT
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- SSO_ENTRA_ENABLED
- SSO_GOOGLE_ENABLED

# Renamed (operator credentials, not Seta-tenant credentials)
- ENTRA_CLIENT_ID            → PLATFORM_CONNECTOR_CLIENT_ID
- ENTRA_CLIENT_SECRET        → PLATFORM_CONNECTOR_CLIENT_SECRET
- BOOTSTRAP_ENTRA_TENANT_ID  → BOOTSTRAP_SETA_ENTRA_TENANT_ID

# Added — Seta-the-tenant's own SSO app (first row in auth.sso_configs)
+ BOOTSTRAP_SSO_CLIENT_ID
+ BOOTSTRAP_SSO_CLIENT_SECRET
+ BOOTSTRAP_SSO_EMAIL_DOMAINS   # comma-separated

# Added — mailer
+ MAILER_BACKEND                # smtp | ses | graph | console
+ MAILER_FROM_ADDRESS
+ MAILER_REPLY_TO               # optional
+ SMTP_URL                      # when backend=smtp
+ SES_CONFIGURATION_SET         # optional, when backend=ses
+ GRAPH_MAILBOX_USER_ID         # when backend=graph
+ OPERATOR_ENTRA_TENANT_ID      # when backend=graph; defaults to BOOTSTRAP_SETA_ENTRA_TENANT_ID
```

The Zod schema fails the API boot if a backend is selected without its
required vars. Console + production is a boot error.

## Bootstrap (`seed-first-tenant.ts`)

The existing transactional flow is preserved. A new block runs inside the
same transaction, right before the connector token acquisition:

```ts
// vault the SSO client secret
await vault.put(id, 'sso-entra', 'sso',
  { accessToken: env.BOOTSTRAP_SSO_CLIENT_SECRET })

// upsert sso_configs row
await tx`
  INSERT INTO auth.sso_configs
    (tenant_id, provider, config, secret_vault_id, enabled, created_by_user_id)
  VALUES (
    ${id},
    'entra',
    ${tx.json({
      entra_tenant_id: env.BOOTSTRAP_SETA_ENTRA_TENANT_ID,
      client_id:       env.BOOTSTRAP_SSO_CLIENT_ID,
    })},
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

// insert email domain rows
for (const domain of bootstrapSsoEmailDomains) {
  await tx`
    INSERT INTO auth.sso_email_domains (domain, tenant_id)
    VALUES (${domain.toLowerCase()}, ${id})
    ON CONFLICT (domain) DO NOTHING
  `
}
```

`BOOTSTRAP_OFFLINE=1` (existing) skips the connector token step AND skips
any boot-time mailer/SES validation that would require network access.

## Observability

All events emit structured logs via `@seta/observability/logger` with
`tenant_id`, `correlation_id`, and `event` fields. Secrets never appear
in logs.

```
event=sso.discover_hit         tenant_id provider domain
event=sso.discover_miss        domain
event=sso.start                tenant_id provider authority_host
event=sso.callback_ok          tenant_id provider user_id auto_joined
event=sso.callback_fail        tenant_id provider reason
event=sso.magic_request        tenant_id email_hash sent
event=sso.magic_consume_ok     tenant_id user_id
event=sso.magic_consume_fail   reason
event=sso.admin_test_run       tenant_id result
event=mailer.send_ok           backend to_hash subject_hash latency_ms
event=mailer.send_failed       backend to_hash subject_hash reason
event=mailer.console_send      to subject body                  (dev only)
```

Audit (via `audit.recordAudit`):

```
sso.config_created    sso.config_updated    sso.config_deleted
sso.secret_rotated    sso.domain_added      sso.domain_removed
sso.test_run          sso.magic_link_issued sso.magic_link_consumed
```

Actor is the superadmin user id for admin actions; `system:sso` for
callback auto-join.

The logger's existing redact list covers `client_secret`, `secret`,
`password`, `access_token`, `refresh_token`. Additions:
`BOOTSTRAP_SSO_CLIENT_SECRET`, `SMTP_URL`.

## Testing

TDD per CLAUDE.md for `platform/identity/*` and `platform/mailer/*`. No
TDD for `apps/api` wiring, route registration, or `tooling/scripts`.

| Layer | Coverage |
|---|---|
| Unit (identity) | Zod discriminated-union parse; `ssoProviderFor` dispatch; `EntraSsoProvider.authorizeUrl` per-request; magic-link token sha256 + constant-time compare; denylist enforcement; domain normalization |
| Integration (identity) | `/sso/discover` hit/miss; `/sso/start` builds correct authority URL with `login_hint` and signs state cookie (no Microsoft HTTP call at this stage); callback happy path + auto-join with `source='sso_domain_match'` using MSW for token-endpoint + JWKS; callback rejects on issuer mismatch; callback rejects on id_token email-domain mismatch; magic-link request as non-owner (no row, no send); as owner (row + mailer called); magic-link consume happy path + replay + expiry; rate limits |
| Integration (admin) | `PUT /admin/sso/tenants/:id` as non-superadmin → 403; clientSecret only writes via vault; never echoed back; denylist domain rejected; cross-tenant domain conflict returns 409; `POST .../test` happy path + each failure mode |
| Smoke (apps/api) | Replaces existing `apps/api/tests/integration/sso.test.ts`. Full app, real Postgres, MSW Microsoft, fake mailer |
| Mailer unit | `createMailerFromEnv` dispatches per env; boot error on prod+console |
| Mailer backend | SMTP: in-memory transport asserts envelope; SES: `mockClient`; Graph: MSW; Console: log line shape |
| Mailer contract | One parameterized suite over `[smtp, ses, graph, console]` — all backends satisfy the same `Mailer` contract |
| Console UI | `LoginPage` State A and State B (last-login cookie present/absent/tampered); `MagicLinkRequestPage` form submit returns generic success |

E2E (Playwright) is not in v1 — CLAUDE.md defers Playwright until Studio.

## Rollout / PR sequencing

Each PR is self-consistent and squash-merges to `main`. No compat shim
between PRs; each one ships a coherent slice.

```
PR 1 — Foundation: per-tenant Entra SSO, email-first discovery, last-login cookie.
       Login works end-to-end on the new model. Operators manage SSO via SQL.
PR 2 — Superadmin SSO admin UI (admin routes + console pages).
PR 3 — @seta/mailer platform package with smtp + console backends + contract suite.
       No callers yet.
PR 4 — Break-glass magic links (depends on PR 1 and PR 3).
PR 5 (later, optional) — Add SES backend.
PR 6 (later, optional) — Add Graph backend.
```

Cutover mechanics (pre-1.0, no production customers):

- Renamed env vars fail fast at boot via Zod, so missing renames are
  immediate and obvious.
- `pnpm migrate && pnpm seed:first-tenant` brings a fresh dev DB to a
  usable state.
- No data backfill. Existing `auth.users` and `auth.user_identities` rows
  keep working; users just need their email domain registered in
  `sso_email_domains` to log in again.

## ADR

A short ADR at `docs/adr/NNNN-per-tenant-entra-sso.md` (NNNN = next available
number, picked when PR 1 is opened) records:

- Context: AADSTS50194 root cause; B2B trust model requires per-tenant Entra apps
- Decision: per-tenant SSO config in DB; provider-extensible schema;
  operator-managed; magic-link break-glass; new `@seta/mailer` platform package
- Consequences: customer onboarding requires sharing three values with
  the operator; adding Google/SAML later is code-only; operator now owns
  an SMTP dependency; a misconfigured tenant locks all members except
  the owner

## Open questions

None blocking. Future work tracked here:

- Per-tenant from-addresses for invitations / digests (mailer v2)
- "Shared computer" toggle on LoginPage to suppress the last-login cookie
- SCIM provisioning when a customer requires lifecycle automation
- Multi-IdP per tenant (Entra + Google together)
- Single Logout

## Appendix: things explicitly out of scope for v1

- SCIM
- Multi-workspace users
- Self-serve customer setup wizard
- Single Logout
- Account-linking UI (Google removed; nothing to link to)
- Bounce/complaint handling
- DKIM/SPF management (deployment config, not code)
- Scheduled/delayed mail sending
- Template engine
- Per-tenant sender addresses
- Conditional Access replication

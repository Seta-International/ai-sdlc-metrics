# @seta/identity

OIDC + PKCE single sign-on for Seta. Owns the `auth.users`, `auth.user_identities`, and `auth.sessions` tables; mints HMAC-signed opaque session cookies; exposes `requireSession`, `csrfMiddleware`, and the `createSsoRoutes` factory.

## Boundary

`@seta/identity` is a `platform/*` package — framework primitives, vendor-neutral.

- **Depends on:** `@seta/db`, `@seta/middleware`, `@seta/observability`, `@seta/tenancy` (type-only — for the `TenantSummary` shape returned by `/me`).
- **Does not depend on:** `@seta/auth` (api_keys, separate package), `@seta/oauth` (vendor token vault, separate package), MSAL, model SDKs, any `modules/*`.

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

`/me` returns `tenants: []` until the tenant-membership schema lands in `@seta/tenancy`; the field shape is final.

## Test strategy

- Unit tests co-located in `src/**/*.test.ts`.
- Integration tests in `tests/integration/**`, require `DATABASE_URL` and the SSO migrations applied via `pnpm migrate`.
- No live IdP calls; integration tests inject a `MockSsoProvider`.

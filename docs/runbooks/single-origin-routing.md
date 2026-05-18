# Single-Origin Routing

Production single-origin layout: the browser hits one origin (e.g. `https://seta.example.com`); a Caddy reverse proxy in front of the API and SPAs routes traffic by URL prefix.

## Path map

| Prefix | Routes to | Notes |
| --- | --- | --- |
| `/console/*` | Console SPA | Vite build output served as static assets |
| `/studio/*` | Studio SPA | Vite build output served as static assets |
| `/sso/*` | API (`@seta/identity` routes) | SSO login/callback/logout |
| `/me` | API | Current-session payload |
| `/members*` | API | Tenant member management (admin) |
| `/admin/*` | API | Superadmin endpoints |
| `/oauth/*` | API | Per-vendor OAuth callbacks |
| `/tenants/*` | API | Connector-scoped endpoints (`/tenants/:id/connectors`) |
| `/teams/*` | API | MS Teams webhook + admin |
| `/healthz` | API | Liveness |
| `/` | Redirect to `/console/` | Default landing |

## Caddyfile snippet

```caddy
seta.example.com {
  encode gzip
  log

  # SPAs (served from disk after `pnpm build`)
  handle_path /console/* {
    root * /var/www/console
    try_files {path} /index.html
    file_server
  }
  handle_path /studio/* {
    root * /var/www/studio
    try_files {path} /index.html
    file_server
  }

  # API routes
  @api {
    path /sso/* /me /members* /admin/* /oauth/* /tenants/* /teams/* /healthz
  }
  reverse_proxy @api http://api:8080

  # Default → console
  redir / /console/ 302
}
```

## Dev mode

In development, the API itself proxies `/console/*` and `/studio/*` to the Vite dev servers (5174 and 5180), so the developer still hits one origin (`http://localhost:8080`). This is gated by `NODE_ENV=development` in `apps/api/src/main.ts`.

`pnpm dev` starts:
- `apps/api` on 8080 (also proxies to the SPAs)
- `apps/console` Vite on 5174
- `apps/studio` Vite on 5180

Browser → `http://localhost:8080/console/` → API proxies to console Vite → HMR works.

## Cookies and origin

All cookies (`seta_sess`, `seta_sso_state`, `seta_last_app`) are set with `HttpOnly; Secure; SameSite=Lax; Path=/`. Because every browser-visible URL shares one origin, no `SameSite=None` is required and CSRF is constrained to the same site.

## CSRF token

The CSRF token derives from the session id via HMAC (see `platform/identity/src/csrf.ts`). Clients read it from `/me` and submit on mutating requests via the `x-csrf-token` header.

# Web-shell: User Menu, Notifications Popover, and Icon-Collapse Sidebar

**Date:** 2026-04-17
**Status:** Draft — awaiting user approval
**Scope:** Shared UI in `@future/ui` and `@future/app-layout`; affects `web-shell` and all 11 zones via `AppLayout`.

## 1. Problem

Today `web-shell/src/app/page.tsx` uses `GlobalNav` from `@future/ui`, and every zone uses `NavbarRenderer` from `@future/app-layout`. Both navbars expose `onProfileClick` and `onNotificationsClick` as callback-only stubs — no dropdown, no panel, no way to log out from the UI without navigating to `/auth/logout` by hand. Separately, the zone left sidebar rendered by `SidebarRenderer` collapses to off-canvas (the shadcn default), hiding navigation entirely when the user asks for more content space.

Three cohesive gaps to close in one spec:

1. User menu dropdown — wired to `GET /api/auth/me` and `GET /auth/logout`.
2. Notifications popover — UI-only with a pluggable data source, ready to swap for a real tRPC feed later.
3. Sidebar collapse mode — switch from off-canvas to icon-only, with tooltips.

## 2. Goals & non-goals

### Goals

- A tenant-aware user menu accessible from every navbar, with logout and role-conditional links.
- A notifications popover that works today with stub data and exposes a stable prop contract for the future backend.
- Zone left sidebar that collapses to icons (with tooltips) on desktop, retains off-canvas drawer on mobile.
- Responsive across DESIGN.md breakpoints (Mobile Small through Large Desktop).
- Full DDD respect: no cross-module imports from frontend; no silent backend stubs.
- Full DESIGN.md compliance: only tokenized Tailwind values; typography, colors, radii, and elevation per the design system.

### Non-goals

- Build the notifications backend module. Tracked for a separate spec.
- Add a multi-tenant switcher wire-up. UI surface is defined; activation is deferred.
- Add a sidebar to `web-shell`'s landing page (landing page stays topbar-only).
- Redesign the existing navbar layout. Only the two button slots change.

## 3. Architecture

### 3.1 Where each piece lives

| Piece                                                               | Package                                                | Consumers                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| `UserMenu`, `NotificationsPopover` primitives (presentation-only)   | `packages/ui/src/components/`                          | `GlobalNav`, `NavbarRenderer`                            |
| `SessionUserMenu`, `StubNotificationsPopover` (data-bound wrappers) | `packages/app-layout/src/`                             | Every zone via `AppLayout`; `web-shell` imports directly |
| Zone route constants (`ZONE_ROUTES.profile`, etc.)                  | `packages/app-layout/src/zone-routes.ts` (new)         | `SessionUserMenu`                                        |
| Sidebar collapse config                                             | `packages/app-layout/src/sidebar/sidebar-renderer.tsx` | All zones using `AppLayout`                              |

### 3.2 Layer contract

- `@future/ui` stays dumb: no `fetch`, no cookies, no router. Pure props-in, JSX-out. This mirrors the hexagonal rule that `domain/` has no NestJS/Drizzle.
- `@future/app-layout` is the composition layer: it knows `/api/auth/me`, knows how to read session claims, knows which zone hosts `/me` for profiles.
- Next.js zones just mount `AppLayout`. `web-shell`'s root page mounts the wrappers directly beside `GlobalNav`.

### 3.3 Navbar integration

`GlobalNav` and `NavbarRenderer` grow two new optional props:

```ts
userMenuSlot?: ReactNode
notificationsSlot?: ReactNode
```

When a slot is provided, it replaces the current callback-only button. The `onProfileClick` and `onNotificationsClick` props are removed in the same PR once every consumer has migrated (per CLAUDE.md "No Backward Compatibility" rule).

## 4. Component contracts

### 4.1 `UserMenu` (`@future/ui`)

```ts
interface UserMenuUser {
  displayName: string
  email: string
  tenantName: string
  tenantId: string
  roles: readonly string[]
  avatarUrl?: string
  initials: string // 2 chars, uppercased, pre-computed
}

interface TenantOption {
  id: string
  name: string
}

interface UserMenuProps {
  user: UserMenuUser
  tenants?: TenantOption[] // if length > 1, "Switch tenant" submenu shows
  isPlatformAdmin?: boolean // controls "Platform admin →" visibility
  profileHref: string // e.g. "/people/me"
  settingsHref?: string
  platformAdminHref?: string // defaults to "/admin"
  onSwitchTenant?: (tenantId: string) => void
  onLogout?: () => void // defaults to window.location.href = '/auth/logout'
}
```

Menu layout top-to-bottom:

1. Header row: tenant name (caption), display name, email (all truncate-safe).
2. Role chip (Neutral Pill).
3. Divider.
4. `My profile` → `profileHref` (cross-zone hard `<a>`).
5. `Settings` → `settingsHref` (if provided).
6. `Switch tenant` submenu (if `tenants.length > 1`).
7. `Platform admin →` (if `isPlatformAdmin`).
8. Divider.
9. `Logout`.

### 4.2 `NotificationsPopover` (`@future/ui`)

```ts
interface NotificationItem {
  id: string
  title: string
  body?: string
  href?: string // click target; cross-zone = hard nav
  createdAt: string // ISO
  read: boolean
  severity?: 'info' | 'warning' | 'critical'
}

interface NotificationsPopoverProps {
  notifications: readonly NotificationItem[]
  unreadCount: number
  isLoading?: boolean
  onRead: (id: string) => void
  onReadAll: () => void
  onOpenAll?: () => void // "See all →" footer; hidden if undefined
  emptyStateHint?: string // default: "You're all caught up"
}
```

Behavior:

- Bell trigger with unread badge (hidden at 0; "9+" when > 9).
- List caps at 20 items (most recent first). Items have `min-h-11` (44px) touch target.
- Header: "Notifications" title + "Mark all read" action.
- Footer: "See all →" only if `onOpenAll` provided; otherwise silent truncation past 20.
- Empty state: centered hint text, no illustration.
- On `<md` breakpoints: renders as a `Sheet` (right-edge drawer) instead of a `Popover`.

### 4.3 `SessionUserMenu` (`@future/app-layout`)

- On mount: `GET /api/auth/me`.
  - 401 → `window.location.href = '/auth/login'`.
  - 5xx or network error → render fallback `UserMenu` with initials `?` and only the Logout item.
- Derives `initials` from `displayName` (first letters of first two words, uppercased; empty name → `?`).
- Derives `isPlatformAdmin = roles.includes('platform_admin')`.
- `tenants` is `undefined` for now (no backend data). Switcher stays hidden until populated.
- Supplies `profileHref`, `settingsHref`, `platformAdminHref` from `ZONE_ROUTES`.

### 4.4 `StubNotificationsPopover` (`@future/app-layout`)

- Holds `useState<NotificationItem[]>([])`.
- If `process.env.NEXT_PUBLIC_LOCAL_DEV === 'true'`, seeds 3 sample items (info, warning, critical) for dev-only visual testing.
- `onRead(id)` marks one item read; `onReadAll()` marks every item read; `unreadCount` derives from state.
- `onOpenAll` is `undefined` until the backend exists.

### 4.5 Sidebar

Change `SidebarRenderer` to render `<Sidebar collapsible="icon">`. Pipe `SidebarMenuButton tooltip={item.label}` so tooltips appear on hover when collapsed. `SidebarProvider`'s cookie persistence (`sidebar_state`) stays enabled — per-origin, which is acceptable.

On `<md`: shadcn falls back to off-canvas drawer automatically via its internal `useIsMobile()`. No custom logic.

### 4.6 Zone routes module

New file `packages/app-layout/src/zone-routes.ts`:

```ts
export const ZONE_ROUTES = {
  profile: '/people/me',
  accountSettings: '/people/settings/me',
  platformAdmin: '/admin',
} as const
```

`UserMenu` never references these directly; only `SessionUserMenu` imports them.

## 5. Data flow

### 5.1 User menu

1. `AppLayout` mounts `<SessionUserMenu />` once per zone.
2. `GET /api/auth/me` returns `{ actorId, tenantId, tenantName, roles, displayName, email, provider }`.
   - **`tenantName` is new**: baked into JWT claims at login by the identity module. `@future/auth` `parseToken` returns it. The BFF endpoint stays a pure token parser — no DB call, no cross-module leak.
3. Click `My profile` → `<a href="/people/me">` (hard nav, works from any zone).
4. Click `Logout` → `window.location.href = '/auth/logout'` (full-page nav). Cookie is cleared by the existing route, browser redirects to `/auth/login`.
5. Click `Platform admin →` → `<a href="/admin">`.
6. Click `Switch tenant` (hidden today) → `onSwitchTenant(tenantId)`; implementation deferred to the future multi-tenant spec.

### 5.2 Notifications

1. `AppLayout` mounts `<StubNotificationsPopover />`.
2. State lives in React; no fetch, no event subscription.
3. When the notifications module exists, zones swap to a new wrapper that calls `trpc.notifications.list.useQuery`; the `NotificationsPopover` primitive stays unchanged.

### 5.3 Sidebar

1. Default state expanded on desktop; value read from `sidebar_state` cookie (shadcn default).
2. `SidebarTrigger` in the navbar toggles expanded ↔ icon-only.
3. On `<md`, `SidebarTrigger` toggles off-canvas drawer.

## 6. Error handling and edge cases

| Scenario                                         | Behavior                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `/api/auth/me` 401                               | Hard redirect to `/auth/login`.                                                |
| `/api/auth/me` 5xx / network error               | Fallback `UserMenu` with `?` avatar; only Logout item visible.                 |
| `/auth/logout` network failure                   | Browser navigation error surfaces to user; no in-app rollback needed.          |
| Unknown `onRead(id)`                             | No-op.                                                                         |
| More than 20 notifications                       | Show 20 most recent; footer indicates truncation only if `onOpenAll` supplied. |
| Display name empty                               | Initials render as `?`.                                                        |
| Display name one word                            | Initials = first 2 chars uppercased.                                           |
| Email longer than container                      | `truncate` ellipsis; full value in `title` attribute.                          |
| `sidebar_state` cookie corrupted                 | shadcn reverts to default (expanded).                                          |
| `tenantName` missing from token (legacy session) | Show tenant ID as fallback; warn in console once. Will not crash.              |

## 7. DDD compliance

- `/api/auth/me` stays a Next.js BFF endpoint that parses the session JWT via `@future/auth`. It never imports from any module's `domain/` or `infrastructure/`.
- `tenantName` is added to the session JWT at mint time by the identity module. This keeps the data flow within identity's bounded context; no synchronous cross-module call.
- No `NotificationsRepository`, `NotificationsService`, or NestJS provider is created. The stub lives entirely in the UI layer; it is explicitly a UI placeholder, not a silent domain stub (no `useValue: {}` anywhere).
- The future notifications module will follow the standard module template (schema `notifications`, QueryFacade, outbox subscriber) and is the subject of a separate spec.
- `packages/ui` components have zero knowledge of zones, auth, or data fetching — strict presentation-only layer.
- Cross-zone links are raw `<a>` elements. No `next/link` across zones (per CLAUDE.md).

## 8. DESIGN.md compliance

All styling uses existing Tailwind tokens mapped to DESIGN.md. Zero arbitrary values (per commit `104573c`: "enforce design system tokens, ban arbitrary Tailwind values").

### User menu styling

- Trigger avatar: `bg-primary text-primary-foreground h-7 w-7 rounded-full text-micro font-510` (matches existing `GlobalNav` avatar).
- Dropdown container: shadcn `DropdownMenuContent` (`bg-popover`, `border-border`, `rounded-md`, Dialog-level shadow).
- Tenant label: `text-caption font-510 text-muted-foreground`.
- Display name: `text-sm font-510 text-foreground`.
- Email: `text-xs text-muted-foreground truncate`.
- Role chip (Neutral Pill): `border border-border rounded-full px-2 text-label font-510 text-secondary-foreground`.
- Accent items (`Platform admin →`, `Switch tenant`): `text-accent`.
- Logout row: neutral at rest; `text-destructive` on hover.
- Separators: `bg-border` via `DropdownMenuSeparator`.

### Notifications popover styling

- Unread badge: `absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground rounded-full h-4 min-w-4 text-tiny font-510 px-1`.
- Panel: `w-96 rounded-lg border-border bg-popover` (`md+`); `w-full sm:w-96` as `Sheet` (`<md`).
- Max height: `h-[28rem]` (448px) with `ScrollArea`.
- Item row: `px-4 py-3 gap-3 border-b border-border/40 hover:bg-overlay/4 min-h-11`.
- Unread dot: 8px circle `bg-accent`.
- Severity pill (Subtle Badge): `bg-overlay/5 text-label font-510 rounded-sm px-2` with status tokens for warning/critical.
- Empty state: `text-muted-foreground text-sm` centered.
- Header: `border-b border-border px-4 py-3`; title `text-sm font-510`; action `text-xs text-accent`.
- Footer: `border-t border-border px-4 py-2 text-center text-xs text-accent`.

### Typography

- All text uses existing size/weight utilities (`text-sm`, `text-xs`, `text-micro`, `text-tiny`, `font-510`, `font-590`).
- `font-feature-settings "cv01", "ss03"` is inherited globally from `globals.css`.
- No `font-bold` / weight 700 (banned in DESIGN.md); use `font-590` for strong emphasis.

## 9. Responsive behavior

Breakpoints per DESIGN.md §8. Tailwind tokens: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.

### User menu

- 28px avatar trigger on all breakpoints.
- `md+`: right-aligned popover, `w-64`.
- `<md`: same popover with `max-w-[calc(100vw-theme(spacing.4))]` so content never overflows.
- Email uses `truncate` to fit narrow dropdowns.

### Notifications popover

- `md+`: floating popover, `w-96`, `h-[28rem]` max.
- `<md`: `Sheet` right-edge drawer, full viewport height minus navbar, `w-full sm:w-96`.
- Detection via the existing `useIsMobile()` hook in `packages/ui/src/hooks/use-mobile.ts` (same hook shadcn's `Sidebar` already uses for its mobile switch).
- Every item `min-h-11` (44px touch target).

### Sidebar

- `md+`: `collapsible="icon"`; `SidebarTrigger` toggles expanded ↔ icon-only; tooltips on hover.
- `<md`: shadcn's built-in off-canvas drawer via `useIsMobile()`.

### Navbar (`GlobalNav`, `NavbarRenderer`)

- Search button: visible on `sm+`; icon-only on `<sm`.
- Agent strip text: `truncate text-xs sm:text-micro`.
- Zone action button: collapses to icon-only on `<md`.
- Bell and avatar are always visible (mandatory touchpoints).

## 10. Testing plan

TDD-first, co-located `.spec.tsx` files (no `__tests__/` directories). Target ≥70% coverage per CLAUDE.md.

### Unit tests

1. `packages/ui/src/components/user-menu.spec.tsx`
   - Renders display name, email, tenant name, initials.
   - Hides "Switch tenant" when `tenants` empty/undefined; shows it with items when `tenants.length > 1`.
   - Shows "Platform admin →" only when `isPlatformAdmin`.
   - `onLogout` fires on click; default handler sets `window.location.href` to `/auth/logout`.
   - `profileHref` renders as `<a>` (never a `next/link`).

2. `packages/ui/src/components/notifications-popover.spec.tsx`
   - Bell badge hidden at 0.
   - Badge shows "9+" when `unreadCount > 9`.
   - Empty state text renders when `notifications.length === 0`.
   - Click item fires `onRead(id)`; "Mark all read" fires `onReadAll`.
   - "See all →" only visible when `onOpenAll` provided.
   - Severity pills render for `warning` and `critical`.
   - At `<md` viewport, component renders as `Sheet`; at `md+`, as `Popover`.

3. `packages/app-layout/src/session-user-menu.spec.tsx` (with MSW)
   - Fetches `/api/auth/me` and renders `UserMenu` with derived props.
   - 401 triggers `window.location` change to `/auth/login`.
   - 500 renders fallback menu with `?` initials and only Logout.
   - `isPlatformAdmin` derived correctly from roles.

4. `packages/app-layout/src/stub-notifications-popover.spec.tsx`
   - Empty state by default; dev flag seeds 3 items.
   - `onRead(id)` marks one item; `unreadCount` decrements.
   - `onReadAll` zeroes `unreadCount`.

5. `packages/app-layout/src/sidebar/sidebar-renderer.spec.tsx` (update existing)
   - Asserts `collapsible="icon"` prop.
   - Asserts `tooltip={item.label}` on `SidebarMenuButton`.

6. `apps/web-people/src/navigation.spec.ts` (update existing)
   - Asserts `My Profile` is no longer in the sidebar.

### Integration test

- One test per zone that mounts `AppLayout` and asserts `userMenuSlot` and `notificationsSlot` render. Smoke-only.

### E2E (Playwright)

- Login → open user menu → click Logout → lands on `/auth/login` with session cookie cleared.
- Viewport matrix: 375×667 (mobile), 768×1024 (tablet), 1440×900 (desktop).
- Toggle sidebar on desktop; confirm icon-only + tooltip-on-hover.
- Open notifications; confirm `Sheet` on mobile and `Popover` on desktop.

### Non-test verification

- Start dev server; click through user menu (logout, profile link from a non-people zone); open notifications in both empty and dev-seeded states; collapse sidebar; hover icons for tooltips.

## 11. Rollout

1. Land token-claim changes for `tenantName` (identity module) — prerequisite.
2. Land `UserMenu`, `NotificationsPopover` in `@future/ui` with tests.
3. Land `SessionUserMenu`, `StubNotificationsPopover`, `ZONE_ROUTES` in `@future/app-layout` with tests.
4. Update `GlobalNav` and `NavbarRenderer` to accept slot props; remove callback props in the same PR.
5. Update `AppLayout` to mount both wrappers; `web-shell/src/app/page.tsx` to mount them directly.
6. Remove `My Profile` from `apps/web-people/src/navigation.ts`.
7. Update `SidebarRenderer` for `collapsible="icon"` and tooltips.
8. Run `/design-review` against live screens at all three viewports.

## 12. Open questions

None resolved as of draft; all prior decisions locked via brainstorming session:

- Scope = shared via `packages/ui` + `packages/app-layout` (not web-shell-only).
- User menu = tenant-aware with role-conditional entries; `My profile` moves here from `people` sidebar.
- Notifications = UI-only stub with a pluggable data source.
- Sidebar = icon-collapse on desktop, off-canvas on mobile.
- Responsive required across all breakpoints.

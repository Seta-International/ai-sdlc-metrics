# Shared Shell Package (`packages/shell`)

**Date:** 2026-04-14
**Status:** Draft

## Problem

The 11 Next.js zones each wire up their own GlobalNav with no sidebar navigation and no RBAC-aware UI filtering. Navigation is inconsistent, there's no in-zone sidebar, and the app launcher shows all modules regardless of the user's permissions.

## Decisions

| Decision              | Choice                                       | Rationale                                                                     |
| --------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| Sidebar content model | Zone-specific via config                     | DDD — each zone owns its navigation, shell owns rendering                     |
| RBAC behavior         | Hidden entirely (not disabled)               | SaaS/ERP standard — don't show what you can't use                             |
| Config coupling       | Typed config object (`NavigationConfig`)     | Loose coupling — zones declare what, shell renders how                        |
| Navbar customization  | Zone title + breadcrumbs + optional action   | Global elements (search, notifications, avatar, app launcher) stay consistent |
| Permission fetching   | Eager load on mount, cached in React context | One API call per zone load; cross-zone navigation refreshes naturally         |
| Mobile behavior       | Sidebar collapses to drawer                  | ERP standard; existing sidebar component already supports this                |
| Package name          | `packages/shell`                             | Created via `turbo gen workspace`                                             |

## Architecture

### Package Structure

```
packages/shell/
  src/
    index.ts                  → public exports
    types.ts                  → NavigationConfig, NavItem, NavGroup, NavbarConfig
    shell.tsx                 → <Shell config={...}>{children}</Shell>
    permission-provider.tsx   → fetches & caches effective permissions in context
    use-can-access.ts         → useCanAccess(permissionKey?) → boolean
    sidebar/
      sidebar-renderer.tsx    → reads config, filters by permissions, renders
    navbar/
      navbar-renderer.tsx     → zone title, breadcrumbs, optional action, global elements
```

### Config Contract

```typescript
interface NavItem {
  label: string
  icon: LucideIcon
  href: string
  permission?: string // e.g. 'people:profile:read' — omit = always visible
  children?: NavItem[] // nested submenu
  badge?: () => ReactNode // dynamic badge (count, status dot)
}

interface NavGroup {
  label?: string // optional section header
  items: NavItem[]
}

interface NavbarConfig {
  title: string // zone display name, e.g. "People"
  icon: LucideIcon
  action?: {
    // optional primary action button
    label: string
    href: string
    permission?: string
  }
}

interface NavigationConfig {
  navbar: NavbarConfig
  sidebar: NavGroup[]
}
```

### Zone Usage

Each zone provides a `navigation.ts` config file and wraps its layout with `<Shell>`:

```typescript
// apps/web-people/src/navigation.ts
import { Users, Network, UserMinus } from 'lucide-react'
import type { NavigationConfig } from '@future/shell'

export const peopleNavConfig: NavigationConfig = {
  navbar: {
    title: 'People',
    icon: Users,
    action: { label: 'Add Employee', href: '/new', permission: 'people:profile:create' },
  },
  sidebar: [
    {
      label: 'Directory',
      items: [
        { label: 'Employees', icon: Users, href: '/employees', permission: 'people:profile:read' },
        { label: 'Org Chart', icon: Network, href: '/org-chart', permission: 'people:org:read' },
      ],
    },
    {
      label: 'Admin',
      items: [
        {
          label: 'Offboarding',
          icon: UserMinus,
          href: '/offboarding',
          permission: 'people:offboard:manage',
        },
      ],
    },
  ],
}
```

```tsx
// apps/web-people/src/app/layout.tsx
import { Shell } from '@future/shell'
import { peopleNavConfig } from '../navigation'

export default function RootLayout({ children }) {
  return (
    <ThemeProvider>
      <Shell config={peopleNavConfig}>{children}</Shell>
    </ThemeProvider>
  )
}
```

### Permission Provider

```typescript
interface PermissionContext {
  permissions: Set<string>
  roles: string[]
  isLoading: boolean
}
```

**Flow:**

1. `<Shell>` mounts `<PermissionProvider>`
2. Provider calls `kernel.getEffectivePermissions()` via tRPC
3. Response stored as `Set<string>` in React context
4. `useCanAccess(key)` reads from context: undefined key = true, key in set = true, else false

### Shell Component

```tsx
function Shell({ config, children }: ShellProps) {
  return (
    <PermissionProvider>
      <SidebarProvider>
        <NavbarRenderer config={config.navbar} />
        <div className="flex">
          <SidebarRenderer groups={config.sidebar} />
          <main className="flex-1">{children}</main>
        </div>
      </SidebarProvider>
    </PermissionProvider>
  )
}
```

### Navbar Renderer

- **Left:** hamburger toggle (mobile) + zone icon + zone title + breadcrumbs
- **Center:** global search (Cmd+K)
- **Right:** notifications, theme toggle, user avatar, app launcher
- **Action button:** rendered next to zone title if `config.navbar.action` is defined and user has permission
- Global elements extracted from existing `GlobalNav` internals

### Sidebar Renderer

- Iterates `NavGroup[]`, filters each item via `useCanAccess(item.permission)`
- Groups where all items are filtered out are hidden entirely (including header)
- Active item highlighted by matching `href` against current pathname
- Nested children rendered as collapsible submenus
- **Desktop:** persistent sidebar, collapsible via Ctrl+B, icon-only collapsed state, cookie-persisted
- **Mobile:** drawer overlay triggered by hamburger in navbar

### Breadcrumbs

Automatic based on current URL path segments matched against sidebar config. For routes not in the sidebar (e.g. `/employees/123`), the renderer walks up the path to find the nearest match and appends the dynamic segment.

## Dependency Graph

```
apps/web-people  ──→  @future/shell  ──→  @future/ui (sidebar components, icons)
apps/web-time    ──→  @future/shell  ──→  @future/auth (useSession, roles)
apps/web-hiring  ──→  @future/shell  ──→  @future/api-client (tRPC for permissions)
...
```

`web-shell` (auth zone) does NOT use `<Shell>` — it handles login/SSO flows only.

## What Happens to Existing GlobalNav

The standalone `GlobalNav` component in `packages/ui` remains available for backward compatibility during migration. Its internal pieces (app launcher trigger, search, notifications, avatar) are extracted and reused inside `packages/shell`'s navbar renderer. Once all zones migrate to `<Shell>`, the standalone `GlobalNav` can be removed.

## Testing

### Unit Tests (co-located in `packages/shell/src/`)

- `use-can-access.spec.ts` — true when permission present, false when absent, true when key undefined
- `sidebar-renderer.spec.ts` — renders items, hides unauthorized items, hides empty groups, renders nested children
- `navbar-renderer.spec.ts` — renders zone title, breadcrumbs from path, hides action without permission
- `permission-provider.spec.ts` — fetches on mount, provides context, handles loading state

### Integration Tests

- Shell renders correctly with full `NavigationConfig` and mocked permission set
- Sidebar collapse/expand persists cookie state
- Mobile drawer opens/closes

### E2E (Playwright)

- User with `employee` role sees limited sidebar items
- User with `hr_ops` role sees full People sidebar
- Cross-zone navigation via app launcher works
- Mobile drawer interaction

### Coverage Target

≥70% lines, functions, branches.

## Out of Scope

- App launcher RBAC filtering (showing only authorized modules) — separate effort
- Request-access flow for unauthorized modules
- Zone-specific keyboard shortcuts beyond existing Ctrl+B and Cmd+K

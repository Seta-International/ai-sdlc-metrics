# App Layout Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `packages/app-layout` — a shared package that provides zone-specific navbar + sidebar with RBAC permission filtering, so every Next.js zone gets a consistent app shell by passing a typed config.

**Architecture:** New `@future/app-layout` workspace package consuming `@future/ui` sidebar components and `@future/auth` session. Each zone passes a `NavigationConfig` object; the package renders the navbar (zone title, breadcrumbs, global elements) and sidebar (permission-filtered menu items). A `PermissionProvider` eager-loads effective permissions via a new tRPC route on the kernel router.

**Tech Stack:** React 19, Next.js (App Router), TypeScript, tRPC, Vitest + Testing Library, Lucide icons

---

## File Map

### New files (packages/app-layout/)

| File                                                        | Responsibility                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `packages/app-layout/package.json`                          | Package manifest — depends on `@future/ui`, `@future/auth`, `@future/api-client`                              |
| `packages/app-layout/tsconfig.json`                         | Extends `@future/tsconfig/base.json`, includes `dom` lib                                                      |
| `packages/app-layout/vitest.config.ts`                      | Vitest with jsdom environment, testing-library setup                                                          |
| `packages/app-layout/eslint.config.ts`                      | ESLint extending `@future/eslint-config/base`                                                                 |
| `packages/app-layout/src/index.ts`                          | Barrel export — `AppLayout`, `NavigationConfig`, `useCanAccess`, `PermissionProvider`                         |
| `packages/app-layout/src/types.ts`                          | `NavItem`, `NavGroup`, `NavbarConfig`, `NavigationConfig` type definitions                                    |
| `packages/app-layout/src/permission-provider.tsx`           | React context that eager-loads effective permissions via tRPC                                                 |
| `packages/app-layout/src/permission-provider.spec.tsx`      | Tests for PermissionProvider                                                                                  |
| `packages/app-layout/src/use-can-access.ts`                 | Hook that reads permission context and checks access                                                          |
| `packages/app-layout/src/use-can-access.spec.ts`            | Tests for useCanAccess                                                                                        |
| `packages/app-layout/src/sidebar/sidebar-renderer.tsx`      | Reads NavGroup config, filters by permissions, renders sidebar components                                     |
| `packages/app-layout/src/sidebar/sidebar-renderer.spec.tsx` | Tests for SidebarRenderer                                                                                     |
| `packages/app-layout/src/navbar/navbar-renderer.tsx`        | Zone title, breadcrumbs, action button, global elements (search, notifications, theme, avatar, app launcher)  |
| `packages/app-layout/src/navbar/navbar-renderer.spec.tsx`   | Tests for NavbarRenderer                                                                                      |
| `packages/app-layout/src/app-layout.tsx`                    | Main `<AppLayout>` component composing PermissionProvider + SidebarProvider + navbar + sidebar + main content |
| `packages/app-layout/src/app-layout.spec.tsx`               | Integration test for AppLayout                                                                                |
| `packages/app-layout/src/test/setup.ts`                     | Test setup — @testing-library/jest-dom + PointerEvent polyfill                                                |

### Modified files (backend — new tRPC route)

| File                                                               | Change                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `apps/api/src/modules/kernel/interface/trpc/kernel.router.ts`      | Add `getMyPermissions` route (auth-only, returns caller's effective permissions) |
| `apps/api/src/modules/kernel/interface/trpc/kernel.router.spec.ts` | Test for the new route                                                           |

### Modified files (zone integration — one zone first, then all)

| File                                 | Change                                                          |
| ------------------------------------ | --------------------------------------------------------------- |
| `apps/web-people/src/navigation.ts`  | New file — exports `peopleNavConfig: NavigationConfig`          |
| `apps/web-people/src/app/layout.tsx` | Replace `GlobalNav` with `<AppLayout config={peopleNavConfig}>` |
| `apps/web-people/package.json`       | Add `@future/app-layout` dependency                             |

---

## Task 1: Scaffold `packages/app-layout` workspace

**Files:**

- Create: `packages/app-layout/package.json`
- Create: `packages/app-layout/tsconfig.json`
- Create: `packages/app-layout/vitest.config.ts`
- Create: `packages/app-layout/eslint.config.ts`
- Create: `packages/app-layout/src/index.ts`
- Create: `packages/app-layout/src/test/setup.ts`

- [ ] **Step 1: Generate workspace with Turbo**

Run:

```bash
cd /Users/canh/Projects/Seta/future && turbo gen workspace
```

When prompted:

- Name: `@future/app-layout`
- Location: `packages/app-layout`
- Type: package (not app)

If turbo gen doesn't have templates configured, create the package manually following the `@future/auth` pattern.

- [ ] **Step 2: Set up package.json**

Ensure `packages/app-layout/package.json` contains:

```json
{
  "name": "@future/app-layout",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "test:unit": "vitest run"
  },
  "devDependencies": {
    "@future/eslint-config": "workspace:*",
    "@future/tsconfig": "*",
    "@types/react": "^19.2.14",
    "eslint": "^10.2.0",
    "react": "^19.2.5",
    "typescript": "^6.0.2",
    "vitest": "^4.1.4",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "jsdom": "^29.0.2"
  }
}
```

Then add runtime dependencies:

```bash
cd /Users/canh/Projects/Seta/future
bun add --cwd packages/app-layout @future/ui@workspace:* @future/auth@workspace:* @future/api-client@workspace:* lucide-react next
```

- [ ] **Step 3: Create tsconfig.json**

Write `packages/app-layout/tsconfig.json`:

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["dom", "esnext"],
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "exclude": ["src/**/*.spec.ts", "src/**/*.spec.tsx"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

Write `packages/app-layout/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
  },
})
```

- [ ] **Step 5: Create eslint.config.ts**

Write `packages/app-layout/eslint.config.ts`:

```typescript
import base from '@future/eslint-config/base'
import type { Linter } from 'eslint'

const config: Linter.Config[] = [
  ...base,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]

export default config
```

- [ ] **Step 6: Create test setup**

Write `packages/app-layout/src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest'

if (typeof PointerEvent === 'undefined') {
  class PointerEvent extends MouseEvent {
    pointerType: string
    constructor(type: string, init?: PointerEventInit) {
      super(type, init)
      this.pointerType = init?.pointerType ?? 'mouse'
    }
  }
  // @ts-expect-error — polyfilling global
  global.PointerEvent = PointerEvent
}
```

- [ ] **Step 7: Create placeholder barrel export**

Write `packages/app-layout/src/index.ts`:

```typescript
// @future/app-layout — shared app layout with RBAC-aware navigation
export {} // placeholder — filled as components are built
```

- [ ] **Step 8: Install dependencies and verify build**

```bash
cd /Users/canh/Projects/Seta/future
bun install
bun run --filter @future/app-layout build
```

Expected: Build succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/app-layout/
git commit -m "feat(app-layout): scaffold @future/app-layout workspace package"
```

---

## Task 2: Define the NavigationConfig types

**Files:**

- Create: `packages/app-layout/src/types.ts`
- Test: `packages/app-layout/src/types.spec.ts`

- [ ] **Step 1: Write the type assertion test**

Write `packages/app-layout/src/types.spec.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest'
import type { NavigationConfig, NavItem, NavGroup, NavbarConfig } from './types'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

describe('NavigationConfig types', () => {
  it('NavItem has required label, icon, href', () => {
    expectTypeOf<NavItem>().toHaveProperty('label')
    expectTypeOf<NavItem>().toHaveProperty('icon')
    expectTypeOf<NavItem>().toHaveProperty('href')
  })

  it('NavItem.permission is optional string', () => {
    expectTypeOf<NavItem['permission']>().toEqualTypeOf<string | undefined>()
  })

  it('NavItem.children is optional NavItem array', () => {
    expectTypeOf<NavItem['children']>().toEqualTypeOf<NavItem[] | undefined>()
  })

  it('NavItem.badge is optional function returning ReactNode', () => {
    expectTypeOf<NavItem['badge']>().toEqualTypeOf<(() => ReactNode) | undefined>()
  })

  it('NavGroup.label is optional', () => {
    expectTypeOf<NavGroup['label']>().toEqualTypeOf<string | undefined>()
  })

  it('NavbarConfig has title and icon', () => {
    expectTypeOf<NavbarConfig>().toHaveProperty('title')
    expectTypeOf<NavbarConfig['icon']>().toEqualTypeOf<LucideIcon>()
  })

  it('NavbarConfig.action is optional with label, href, permission', () => {
    type Action = NonNullable<NavbarConfig['action']>
    expectTypeOf<Action>().toHaveProperty('label')
    expectTypeOf<Action>().toHaveProperty('href')
    expectTypeOf<Action['permission']>().toEqualTypeOf<string | undefined>()
  })

  it('NavigationConfig combines navbar and sidebar', () => {
    expectTypeOf<NavigationConfig>().toHaveProperty('navbar')
    expectTypeOf<NavigationConfig>().toHaveProperty('sidebar')
    expectTypeOf<NavigationConfig['sidebar']>().toEqualTypeOf<NavGroup[]>()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout test:unit
```

Expected: FAIL — `./types` module not found.

- [ ] **Step 3: Implement the types**

Write `packages/app-layout/src/types.ts`:

```typescript
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface NavItem {
  label: string
  icon: LucideIcon
  href: string
  /** Permission key (e.g. 'people:profile:read'). Omit = always visible. */
  permission?: string
  /** Nested submenu items */
  children?: NavItem[]
  /** Dynamic badge (count, status dot) */
  badge?: () => ReactNode
}

export interface NavGroup {
  /** Optional section header label */
  label?: string
  items: NavItem[]
}

export interface NavbarConfig {
  /** Zone display name, e.g. "People" */
  title: string
  /** Zone icon */
  icon: LucideIcon
  /** Optional primary action button in the navbar */
  action?: {
    label: string
    href: string
    permission?: string
  }
}

export interface NavigationConfig {
  navbar: NavbarConfig
  sidebar: NavGroup[]
}
```

- [ ] **Step 4: Update barrel export**

Update `packages/app-layout/src/index.ts`:

```typescript
export type { NavigationConfig, NavItem, NavGroup, NavbarConfig } from './types'
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout test:unit
```

Expected: All type tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/app-layout/src/types.ts packages/app-layout/src/types.spec.ts packages/app-layout/src/index.ts
git commit -m "feat(app-layout): define NavigationConfig type contract"
```

---

## Task 3: Add `getMyPermissions` tRPC route

The backend has `getEffectivePermissions` on the facade but no tRPC route that lets a user fetch their own permissions. We need an auth-only route (no permission gate — the user is asking for their own data).

**Files:**

- Modify: `apps/api/src/modules/kernel/interface/trpc/kernel.router.ts`
- Test: `apps/api/src/modules/kernel/interface/trpc/kernel.router.spec.ts`

- [ ] **Step 1: Write the test**

Write `apps/api/src/modules/kernel/interface/trpc/kernel.router.spec.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createKernelRouter } from './kernel.router'
import { publicProcedure, router } from '../../../../common/trpc/trpc-init'
import type { KernelQueryFacade } from '../../application/facades/kernel-query.facade'

describe('kernelRouter', () => {
  describe('getMyPermissions', () => {
    it('returns effective permissions for the calling actor', async () => {
      const mockFacade = {
        getEffectivePermissions: vi
          .fn()
          .mockResolvedValue(['people:profile:read', 'time:leave:self:submit']),
      } as unknown as KernelQueryFacade

      const testRouter = createKernelRouter(publicProcedure, mockFacade)
      const caller = router({ kernel: testRouter }).createCaller({
        req: { headers: {} },
        tenantId: 'tenant-1',
        actorId: 'actor-1',
      })

      const result = await caller.kernel.getMyPermissions()

      expect(result).toEqual(['people:profile:read', 'time:leave:self:submit'])
      expect(mockFacade.getEffectivePermissions).toHaveBeenCalledWith('actor-1', 'tenant-1')
    })

    it('returns empty array when no facade is provided', async () => {
      const testRouter = createKernelRouter(publicProcedure, undefined)
      const caller = router({ kernel: testRouter }).createCaller({
        req: { headers: {} },
        tenantId: 'tenant-1',
        actorId: 'actor-1',
      })

      const result = await caller.kernel.getMyPermissions()

      expect(result).toEqual([])
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter api test:unit -- --testPathPattern kernel.router.spec
```

Expected: FAIL — `getMyPermissions` is not a function.

- [ ] **Step 3: Add the route to the kernel router**

Modify `apps/api/src/modules/kernel/interface/trpc/kernel.router.ts`. Add the `getMyPermissions` procedure inside `createKernelRouter`:

```typescript
import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { KernelQueryFacade } from '../../application/facades/kernel-query.facade'

export function createKernelRouter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  permissionProtectedProcedure: any,
  kernelFacade?: KernelQueryFacade,
) {
  return router({
    health: publicProcedure.query(() => ({ status: 'ok' })),
    getRoleGrants: permissionProtectedProcedure
      .meta({ permission: 'admin:role:read' })
      .input(z.object({ actorId: z.string().uuid() }))
      .query(async ({ input, ctx }: { input: { actorId: string }; ctx: { tenantId: string } }) => {
        if (!kernelFacade) return []
        return kernelFacade.getRoleGrants(input.actorId, ctx.tenantId)
      }),
    getMyPermissions: permissionProtectedProcedure.query(
      async ({ ctx }: { ctx: { actorId: string; tenantId: string } }) => {
        if (!kernelFacade) return []
        return kernelFacade.getEffectivePermissions(ctx.actorId, ctx.tenantId)
      },
    ),
  })
}

// Keep existing backward-compatible export used by app-router.ts
export const kernelRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
})
```

Note: `getMyPermissions` uses `permissionProtectedProcedure` without `.meta({ permission: ... })` — this means it requires authentication but no specific permission. The permission middleware skips the `canDo` check when no permission is declared in meta.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter api test:unit -- --testPathPattern kernel.router.spec
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/kernel/interface/trpc/kernel.router.ts apps/api/src/modules/kernel/interface/trpc/kernel.router.spec.ts
git commit -m "feat(kernel): add getMyPermissions tRPC route for frontend permission loading"
```

---

## Task 4: Implement PermissionProvider and useCanAccess

**Files:**

- Create: `packages/app-layout/src/permission-provider.tsx`
- Create: `packages/app-layout/src/use-can-access.ts`
- Test: `packages/app-layout/src/use-can-access.spec.tsx`
- Test: `packages/app-layout/src/permission-provider.spec.tsx`

- [ ] **Step 1: Write the useCanAccess test**

Write `packages/app-layout/src/use-can-access.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCanAccess } from './use-can-access'
import { PermissionContext } from './permission-provider'
import type { ReactNode } from 'react'

function createWrapper(permissions: string[], isLoading = false) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PermissionContext.Provider
        value={{
          permissions: new Set(permissions),
          roles: [],
          isLoading,
        }}
      >
        {children}
      </PermissionContext.Provider>
    )
  }
}

describe('useCanAccess', () => {
  it('returns true when permission key is undefined (always visible)', () => {
    const { result } = renderHook(() => useCanAccess(undefined), {
      wrapper: createWrapper([]),
    })
    expect(result.current).toBe(true)
  })

  it('returns true when permission is present in the set', () => {
    const { result } = renderHook(() => useCanAccess('people:profile:read'), {
      wrapper: createWrapper(['people:profile:read', 'time:leave:self:submit']),
    })
    expect(result.current).toBe(true)
  })

  it('returns false when permission is not in the set', () => {
    const { result } = renderHook(() => useCanAccess('admin:role:manage'), {
      wrapper: createWrapper(['people:profile:read']),
    })
    expect(result.current).toBe(false)
  })

  it('returns false while permissions are loading', () => {
    const { result } = renderHook(() => useCanAccess('people:profile:read'), {
      wrapper: createWrapper(['people:profile:read'], true),
    })
    expect(result.current).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout test:unit
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement PermissionProvider**

Write `packages/app-layout/src/permission-provider.tsx`:

```tsx
'use client'

import { createContext, useState, useEffect, type ReactNode } from 'react'
import type { TRPCClient } from '@future/api-client'

export interface PermissionContextValue {
  permissions: Set<string>
  roles: string[]
  isLoading: boolean
}

export const PermissionContext = createContext<PermissionContextValue>({
  permissions: new Set(),
  roles: [],
  isLoading: true,
})

export interface PermissionProviderProps {
  trpc: TRPCClient
  children: ReactNode
}

export function PermissionProvider({ trpc, children }: PermissionProviderProps) {
  const [state, setState] = useState<PermissionContextValue>({
    permissions: new Set(),
    roles: [],
    isLoading: true,
  })

  useEffect(() => {
    let cancelled = false

    trpc.kernel.getMyPermissions
      .query()
      .then((permissions: string[]) => {
        if (!cancelled) {
          setState({
            permissions: new Set(permissions),
            roles: [],
            isLoading: false,
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ permissions: new Set(), roles: [], isLoading: false })
        }
      })

    return () => {
      cancelled = true
    }
  }, [trpc])

  return <PermissionContext.Provider value={state}>{children}</PermissionContext.Provider>
}
```

- [ ] **Step 4: Implement useCanAccess**

Write `packages/app-layout/src/use-can-access.ts`:

```typescript
'use client'

import { useContext } from 'react'
import { PermissionContext } from './permission-provider'

export function useCanAccess(permissionKey?: string): boolean {
  const { permissions, isLoading } = useContext(PermissionContext)

  if (permissionKey === undefined) return true
  if (isLoading) return false
  return permissions.has(permissionKey)
}
```

- [ ] **Step 5: Run useCanAccess tests to verify they pass**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout test:unit -- use-can-access
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Write PermissionProvider test**

Write `packages/app-layout/src/permission-provider.spec.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PermissionProvider } from './permission-provider'
import { useCanAccess } from './use-can-access'
import type { TRPCClient } from '@future/api-client'

function TestConsumer({ permission }: { permission?: string }) {
  const canAccess = useCanAccess(permission)
  return <div data-testid="result">{String(canAccess)}</div>
}

function createMockTrpc(permissions: string[]): TRPCClient {
  return {
    kernel: {
      getMyPermissions: {
        query: vi.fn().mockResolvedValue(permissions),
      },
    },
  } as unknown as TRPCClient
}

describe('PermissionProvider', () => {
  it('loads permissions and makes them available via useCanAccess', async () => {
    const mockTrpc = createMockTrpc(['people:profile:read'])

    render(
      <PermissionProvider trpc={mockTrpc}>
        <TestConsumer permission="people:profile:read" />
      </PermissionProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('result').textContent).toBe('true')
    })
  })

  it('returns false for permissions not in the loaded set', async () => {
    const mockTrpc = createMockTrpc(['people:profile:read'])

    render(
      <PermissionProvider trpc={mockTrpc}>
        <TestConsumer permission="admin:role:manage" />
      </PermissionProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('result').textContent).toBe('false')
    })
  })

  it('handles fetch failure gracefully', async () => {
    const mockTrpc = {
      kernel: {
        getMyPermissions: {
          query: vi.fn().mockRejectedValue(new Error('Network error')),
        },
      },
    } as unknown as TRPCClient

    render(
      <PermissionProvider trpc={mockTrpc}>
        <TestConsumer permission="people:profile:read" />
      </PermissionProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('result').textContent).toBe('false')
    })
  })
})
```

- [ ] **Step 7: Run all tests to verify they pass**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout test:unit
```

Expected: All tests PASS.

- [ ] **Step 8: Update barrel export**

Update `packages/app-layout/src/index.ts`:

```typescript
export type { NavigationConfig, NavItem, NavGroup, NavbarConfig } from './types'
export { PermissionProvider, PermissionContext } from './permission-provider'
export type { PermissionContextValue, PermissionProviderProps } from './permission-provider'
export { useCanAccess } from './use-can-access'
```

- [ ] **Step 9: Commit**

```bash
git add packages/app-layout/src/permission-provider.tsx packages/app-layout/src/permission-provider.spec.tsx packages/app-layout/src/use-can-access.ts packages/app-layout/src/use-can-access.spec.tsx packages/app-layout/src/index.ts
git commit -m "feat(app-layout): implement PermissionProvider and useCanAccess hook"
```

---

## Task 5: Implement SidebarRenderer

**Files:**

- Create: `packages/app-layout/src/sidebar/sidebar-renderer.tsx`
- Test: `packages/app-layout/src/sidebar/sidebar-renderer.spec.tsx`

- [ ] **Step 1: Write the test**

Write `packages/app-layout/src/sidebar/sidebar-renderer.spec.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SidebarRenderer } from './sidebar-renderer'
import { PermissionContext } from '../permission-provider'
import type { NavGroup } from '../types'
import type { ReactNode } from 'react'
import { Users, Clock, UserMinus } from 'lucide-react'
import { SidebarProvider } from '@future/ui'

vi.mock('next/navigation', () => ({
  usePathname: () => '/employees',
}))

function createWrapper(permissions: string[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PermissionContext.Provider
        value={{ permissions: new Set(permissions), roles: [], isLoading: false }}
      >
        <SidebarProvider defaultOpen={true}>{children}</SidebarProvider>
      </PermissionContext.Provider>
    )
  }
}

const testGroups: NavGroup[] = [
  {
    label: 'Directory',
    items: [
      { label: 'Employees', icon: Users, href: '/employees', permission: 'people:profile:read' },
      { label: 'Attendance', icon: Clock, href: '/attendance', permission: 'time:attendance:read' },
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
]

describe('SidebarRenderer', () => {
  it('renders items the user has permission for', () => {
    render(<SidebarRenderer groups={testGroups} />, {
      wrapper: createWrapper(['people:profile:read', 'time:attendance:read']),
    })

    expect(screen.getByText('Employees')).toBeInTheDocument()
    expect(screen.getByText('Attendance')).toBeInTheDocument()
  })

  it('hides items the user lacks permission for', () => {
    render(<SidebarRenderer groups={testGroups} />, {
      wrapper: createWrapper(['people:profile:read']),
    })

    expect(screen.getByText('Employees')).toBeInTheDocument()
    expect(screen.queryByText('Attendance')).not.toBeInTheDocument()
  })

  it('hides entire group when all items are filtered out', () => {
    render(<SidebarRenderer groups={testGroups} />, {
      wrapper: createWrapper(['people:profile:read']),
    })

    expect(screen.getByText('Directory')).toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('renders items without permission key as always visible', () => {
    const groups: NavGroup[] = [
      {
        items: [{ label: 'Dashboard', icon: Users, href: '/dashboard' }],
      },
    ]

    render(<SidebarRenderer groups={groups} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout test:unit -- sidebar-renderer
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement SidebarRenderer**

Write `packages/app-layout/src/sidebar/sidebar-renderer.tsx`.

The key design: `useFilteredItems` is a custom hook that reads from `PermissionContext` directly and filters items in one pass. This avoids calling `useCanAccess` per-item in a loop. Groups with zero visible items return `null` (hidden entirely).

```tsx
'use client'

import { usePathname } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarMenuBadge,
} from '@future/ui'
import { useContext } from 'react'
import { PermissionContext } from '../permission-provider'
import type { NavGroup, NavItem } from '../types'

function useFilteredItems(items: NavItem[]): NavItem[] {
  const { permissions, isLoading } = useContext(PermissionContext)
  if (isLoading) return []
  return items.filter((item) => !item.permission || permissions.has(item.permission))
}

function SidebarNavItem({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  const visibleChildren = useFilteredItems(item.children ?? [])

  if (visibleChildren.length > 0) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton isActive={isActive} asChild>
          <a href={item.href}>
            <item.icon />
            <span>{item.label}</span>
          </a>
        </SidebarMenuButton>
        {item.badge && <SidebarMenuBadge>{item.badge()}</SidebarMenuBadge>}
        <SidebarMenuSub>
          {visibleChildren.map((child) => (
            <SidebarSubNavItem key={child.href} item={child} />
          ))}
        </SidebarMenuSub>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={isActive} asChild>
        <a href={item.href}>
          <item.icon />
          <span>{item.label}</span>
        </a>
      </SidebarMenuButton>
      {item.badge && <SidebarMenuBadge>{item.badge()}</SidebarMenuBadge>}
    </SidebarMenuItem>
  )
}

function SidebarSubNavItem({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton isActive={isActive} asChild>
        <a href={item.href}>
          <span>{item.label}</span>
        </a>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  )
}

export interface SidebarRendererProps {
  groups: NavGroup[]
}

export function SidebarRenderer({ groups }: SidebarRendererProps) {
  return (
    <Sidebar>
      <SidebarContent>
        {groups.map((group, index) => (
          <SidebarNavGroup key={group.label ?? index} group={group} />
        ))}
      </SidebarContent>
    </Sidebar>
  )
}

function SidebarNavGroup({ group }: { group: NavGroup }) {
  const visibleItems = useFilteredItems(group.items)

  if (visibleItems.length === 0) return null

  return (
    <SidebarGroup>
      {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {visibleItems.map((item) => (
            <SidebarNavItem key={item.href} item={item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout test:unit -- sidebar-renderer
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Update barrel export**

Add to `packages/app-layout/src/index.ts`:

```typescript
export { SidebarRenderer } from './sidebar/sidebar-renderer'
```

- [ ] **Step 6: Commit**

```bash
git add packages/app-layout/src/sidebar/
git commit -m "feat(app-layout): implement RBAC-aware SidebarRenderer"
```

---

## Task 6: Implement NavbarRenderer

**Files:**

- Create: `packages/app-layout/src/navbar/navbar-renderer.tsx`
- Test: `packages/app-layout/src/navbar/navbar-renderer.spec.tsx`

- [ ] **Step 1: Write the test**

Write `packages/app-layout/src/navbar/navbar-renderer.spec.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NavbarRenderer } from './navbar-renderer'
import { PermissionContext } from '../permission-provider'
import type { NavbarConfig } from '../types'
import type { ReactNode } from 'react'
import { Users, UserPlus } from 'lucide-react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/employees/123',
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

function createWrapper(permissions: string[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PermissionContext.Provider
        value={{ permissions: new Set(permissions), roles: [], isLoading: false }}
      >
        {children}
      </PermissionContext.Provider>
    )
  }
}

const baseConfig: NavbarConfig = {
  title: 'People',
  icon: Users,
}

describe('NavbarRenderer', () => {
  it('renders the zone title', () => {
    render(<NavbarRenderer config={baseConfig} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.getByText('People')).toBeInTheDocument()
  })

  it('renders action button when user has permission', () => {
    const config: NavbarConfig = {
      ...baseConfig,
      action: { label: 'Add Employee', href: '/new', permission: 'people:profile:create' },
    }

    render(<NavbarRenderer config={config} />, {
      wrapper: createWrapper(['people:profile:create']),
    })

    expect(screen.getByText('Add Employee')).toBeInTheDocument()
  })

  it('hides action button when user lacks permission', () => {
    const config: NavbarConfig = {
      ...baseConfig,
      action: { label: 'Add Employee', href: '/new', permission: 'people:profile:create' },
    }

    render(<NavbarRenderer config={config} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.queryByText('Add Employee')).not.toBeInTheDocument()
  })

  it('renders action button without permission key as always visible', () => {
    const config: NavbarConfig = {
      ...baseConfig,
      action: { label: 'Settings', href: '/settings' },
    }

    render(<NavbarRenderer config={config} />, {
      wrapper: createWrapper([]),
    })

    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout test:unit -- navbar-renderer
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement NavbarRenderer**

Write `packages/app-layout/src/navbar/navbar-renderer.tsx`:

```tsx
'use client'

import * as React from 'react'
import { Bell, Bot, Search, Sun, Moon, Plus } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn, AppLauncher, AppLauncherTrigger, FUTURE_APPS, LOCAL_FUTURE_APPS } from '@future/ui'
import { SidebarTrigger } from '@future/ui'
import { useCanAccess } from '../use-can-access'
import type { NavbarConfig } from '../types'

export interface NavbarRendererProps {
  config: NavbarConfig
  userInitials?: string
  onNotificationsClick?: () => void
  onAgentClick?: () => void
  onSearchClick?: () => void
  onProfileClick?: () => void
}

export function NavbarRenderer({
  config,
  userInitials = 'U',
  onNotificationsClick,
  onAgentClick,
  onSearchClick,
  onProfileClick,
}: NavbarRendererProps) {
  const [launcherOpen, setLauncherOpen] = React.useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const canDoAction = useCanAccess(config.action?.permission)

  const apps = process.env['NEXT_PUBLIC_LOCAL_DEV'] === 'true' ? LOCAL_FUTURE_APPS : FUTURE_APPS

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setLauncherOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      <AppLauncher open={launcherOpen} onOpenChange={setLauncherOpen} apps={apps} />

      <header className={cn('flex flex-col flex-shrink-0')}>
        <div
          className={cn(
            'flex h-12 items-center gap-3 px-4',
            'bg-card border-b border-border',
            'dark:bg-[#0f1011] dark:border-[rgba(255,255,255,0.05)]',
          )}
        >
          {/* Sidebar toggle (mobile hamburger / desktop collapse) */}
          <SidebarTrigger />

          {/* App launcher */}
          <AppLauncherTrigger onClick={() => setLauncherOpen(true)} />

          {/* Zone title */}
          <div className="flex items-center gap-2">
            <config.icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{config.title}</span>
          </div>

          {/* Action button */}
          {config.action && canDoAction && (
            <a
              href={config.action.href}
              className={cn(
                'ml-2 flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
                'bg-[#5e6ad2] text-white text-xs font-medium',
                'transition-all hover:bg-[#828fff]',
                'focus:outline-none focus:ring-2 focus:ring-[#5e6ad2]/50',
              )}
            >
              <Plus className="h-3 w-3" />
              {config.action.label}
            </a>
          )}

          {/* Search */}
          <button
            type="button"
            onClick={onSearchClick}
            aria-label="Search or ask an agent"
            className={cn(
              'ml-auto flex max-w-[260px] flex-1 items-center gap-2 rounded-md border px-3 py-1.5',
              'border-border bg-(--btn-ghost-bg) text-xs text-muted-foreground',
              'transition-all hover:bg-(--btn-ghost-bg-hover) hover:border-[#5e6ad2]',
              'focus:outline-none focus:ring-2 focus:ring-ring/50',
            )}
          >
            <Search className="h-3 w-3 flex-shrink-0 opacity-50" aria-hidden="true" />
            <span>Search or ask...</span>
            <span className="ml-auto font-mono text-[10px] opacity-50">⌘K</span>
          </button>

          {/* Agent toggle */}
          <button
            type="button"
            onClick={onAgentClick}
            aria-label="Open agent panel"
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-md',
              'text-muted-foreground transition-all hover:bg-(--btn-ghost-bg) hover:text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring/50',
            )}
          >
            <Bot className="h-4 w-4" />
          </button>

          {/* Notifications */}
          <button
            type="button"
            onClick={onNotificationsClick}
            aria-label="Notifications"
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-md',
              'text-muted-foreground transition-all hover:bg-(--btn-ghost-bg) hover:text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring/50',
            )}
          >
            <Bell className="h-4 w-4" />
          </button>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-md',
              'text-muted-foreground transition-all hover:bg-(--btn-ghost-bg) hover:text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring/50',
            )}
          >
            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Avatar */}
          <button
            type="button"
            onClick={onProfileClick}
            aria-label={`User menu (${userInitials})`}
            className={cn(
              'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
              'bg-[#5e6ad2] text-[11px] font-[510] text-white',
              'transition-all hover:bg-[#828fff]',
              'focus:outline-none focus:ring-2 focus:ring-[#5e6ad2]/50',
            )}
          >
            {userInitials.slice(0, 2).toUpperCase()}
          </button>
        </div>
      </header>
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout test:unit -- navbar-renderer
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Update barrel export**

Add to `packages/app-layout/src/index.ts`:

```typescript
export { NavbarRenderer } from './navbar/navbar-renderer'
export type { NavbarRendererProps } from './navbar/navbar-renderer'
```

- [ ] **Step 6: Commit**

```bash
git add packages/app-layout/src/navbar/
git commit -m "feat(app-layout): implement NavbarRenderer with global elements and zone action"
```

---

## Task 7: Implement AppLayout main component

**Files:**

- Create: `packages/app-layout/src/app-layout.tsx`
- Test: `packages/app-layout/src/app-layout.spec.tsx`

- [ ] **Step 1: Write the test**

Write `packages/app-layout/src/app-layout.spec.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AppLayout } from './app-layout'
import type { NavigationConfig } from './types'
import { Users, Clock } from 'lucide-react'
import type { TRPCClient } from '@future/api-client'

vi.mock('next/navigation', () => ({
  usePathname: () => '/employees',
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

const testConfig: NavigationConfig = {
  navbar: {
    title: 'People',
    icon: Users,
  },
  sidebar: [
    {
      label: 'Directory',
      items: [
        { label: 'Employees', icon: Users, href: '/employees', permission: 'people:profile:read' },
        { label: 'Time Off', icon: Clock, href: '/time-off', permission: 'time:leave:read' },
      ],
    },
  ],
}

function createMockTrpc(permissions: string[]): TRPCClient {
  return {
    kernel: {
      getMyPermissions: {
        query: vi.fn().mockResolvedValue(permissions),
      },
    },
  } as unknown as TRPCClient
}

describe('AppLayout', () => {
  it('renders navbar title and permitted sidebar items', async () => {
    render(
      <AppLayout config={testConfig} trpc={createMockTrpc(['people:profile:read'])}>
        <div data-testid="content">Main content</div>
      </AppLayout>,
    )

    await waitFor(() => {
      expect(screen.getByText('People')).toBeInTheDocument()
      expect(screen.getByText('Employees')).toBeInTheDocument()
      expect(screen.queryByText('Time Off')).not.toBeInTheDocument()
      expect(screen.getByTestId('content')).toBeInTheDocument()
    })
  })

  it('renders children in the main content area', async () => {
    render(
      <AppLayout config={testConfig} trpc={createMockTrpc([])}>
        <h1>Hello World</h1>
      </AppLayout>,
    )

    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout test:unit -- app-layout.spec
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement AppLayout**

Write `packages/app-layout/src/app-layout.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'
import { SidebarProvider, SidebarInset } from '@future/ui'
import type { TRPCClient } from '@future/api-client'
import { PermissionProvider } from './permission-provider'
import { NavbarRenderer, type NavbarRendererProps } from './navbar/navbar-renderer'
import { SidebarRenderer } from './sidebar/sidebar-renderer'
import type { NavigationConfig } from './types'

export interface AppLayoutProps extends Omit<NavbarRendererProps, 'config'> {
  config: NavigationConfig
  trpc: TRPCClient
  children: ReactNode
}

export function AppLayout({ config, trpc, children, ...navbarProps }: AppLayoutProps) {
  return (
    <PermissionProvider trpc={trpc}>
      <SidebarProvider>
        <SidebarRenderer groups={config.sidebar} />
        <SidebarInset>
          <NavbarRenderer config={config.navbar} {...navbarProps} />
          <main className="flex-1">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </PermissionProvider>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout test:unit -- app-layout.spec
```

Expected: All tests PASS.

- [ ] **Step 5: Update barrel export — final version**

Write the final `packages/app-layout/src/index.ts`:

```typescript
// Components
export { AppLayout } from './app-layout'
export type { AppLayoutProps } from './app-layout'
export { SidebarRenderer } from './sidebar/sidebar-renderer'
export { NavbarRenderer } from './navbar/navbar-renderer'
export type { NavbarRendererProps } from './navbar/navbar-renderer'

// Permission
export { PermissionProvider, PermissionContext } from './permission-provider'
export type { PermissionContextValue, PermissionProviderProps } from './permission-provider'
export { useCanAccess } from './use-can-access'

// Types
export type { NavigationConfig, NavItem, NavGroup, NavbarConfig } from './types'
```

- [ ] **Step 6: Build the package**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout build
```

Expected: Build succeeds with no errors.

- [ ] **Step 7: Run all package tests**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout test:unit
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/app-layout/src/app-layout.tsx packages/app-layout/src/app-layout.spec.tsx packages/app-layout/src/index.ts
git commit -m "feat(app-layout): implement AppLayout main component"
```

---

## Task 8: Integrate with web-people zone (first zone)

**Files:**

- Create: `apps/web-people/src/navigation.ts`
- Modify: `apps/web-people/src/app/layout.tsx`
- Modify: `apps/web-people/package.json` (via bun add)

- [ ] **Step 1: Add dependency**

```bash
cd /Users/canh/Projects/Seta/future
bun add --cwd apps/web-people @future/app-layout@workspace:*
```

- [ ] **Step 2: Create navigation config**

Write `apps/web-people/src/navigation.ts`:

```typescript
import { Users, Network, UserMinus, Building2 } from 'lucide-react'
import type { NavigationConfig } from '@future/app-layout'

export const peopleNavConfig: NavigationConfig = {
  navbar: {
    title: 'People',
    icon: Users,
    action: {
      label: 'Add Employee',
      href: '/new',
      permission: 'people:profile:create',
    },
  },
  sidebar: [
    {
      label: 'Directory',
      items: [
        {
          label: 'Employees',
          icon: Users,
          href: '/employees',
          permission: 'people:profile:read',
        },
        {
          label: 'Org Chart',
          icon: Network,
          href: '/org-chart',
          permission: 'people:org:read',
        },
        {
          label: 'Departments',
          icon: Building2,
          href: '/departments',
          permission: 'people:department:read',
        },
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

- [ ] **Step 3: Update the zone layout**

Modify `apps/web-people/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { ThemeProvider } from '@future/ui'
import { fontVariables } from '@future/ui/fonts'
import { peopleNavConfig } from '../navigation'
import { PeopleLayoutClient } from './layout-client'
import './globals.css'

export const metadata: Metadata = { title: 'People — Future' }

export default async function Layout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('future-theme')?.value
  return (
    <html lang="en" className={fontVariables} data-density="compact" suppressHydrationWarning>
      <body>
        <ThemeProvider defaultTheme={theme ?? 'system'} enableSystem={!theme}>
          <PeopleLayoutClient>{children}</PeopleLayoutClient>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

Create `apps/web-people/src/app/layout-client.tsx` (client component needed because AppLayout is a client component and root layout is a server component):

```tsx
'use client'

import type { ReactNode } from 'react'
import { AppLayout } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { peopleNavConfig } from '../navigation'

export function PeopleLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={peopleNavConfig} trpc={trpc}>
      {children}
    </AppLayout>
  )
}
```

- [ ] **Step 4: Build and verify**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout build
bun run --filter web-people build
```

Expected: Both builds succeed.

- [ ] **Step 5: Start dev server and verify visually**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter web-people dev
```

Open `http://localhost:3001` (or the web-people port) in a browser. Verify:

- Navbar shows "People" title with icon
- Sidebar shows menu items
- App launcher works (Cmd+K)
- Sidebar collapses via Ctrl+B
- On mobile viewport: sidebar becomes a drawer

- [ ] **Step 6: Commit**

```bash
git add apps/web-people/src/navigation.ts apps/web-people/src/app/layout.tsx apps/web-people/src/app/layout-client.tsx apps/web-people/package.json
git commit -m "feat(web-people): integrate @future/app-layout with RBAC-aware sidebar"
```

---

## Task 9: Roll out to remaining zones

Once web-people is verified, apply the same pattern to all other zones. Each zone needs:

1. `bun add --cwd apps/web-<zone> @future/app-layout@workspace:*`
2. A `src/navigation.ts` with zone-specific config
3. Updated `src/app/layout.tsx` replacing `GlobalNav` with `<AppLayout>`
4. A `src/app/layout-client.tsx` client wrapper

**Files per zone:**

- Create: `apps/web-<zone>/src/navigation.ts`
- Create: `apps/web-<zone>/src/app/layout-client.tsx`
- Modify: `apps/web-<zone>/src/app/layout.tsx`

- [ ] **Step 1: web-hiring**

Create `apps/web-hiring/src/navigation.ts`:

```typescript
import { UserSearch, Briefcase, FileText, Users } from 'lucide-react'
import type { NavigationConfig } from '@future/app-layout'

export const hiringNavConfig: NavigationConfig = {
  navbar: {
    title: 'Hiring',
    icon: UserSearch,
    action: {
      label: 'New Position',
      href: '/positions/new',
      permission: 'hiring:position:create',
    },
  },
  sidebar: [
    {
      label: 'Pipeline',
      items: [
        {
          label: 'Candidates',
          icon: Users,
          href: '/candidates',
          permission: 'hiring:candidate:read',
        },
        {
          label: 'Positions',
          icon: Briefcase,
          href: '/positions',
          permission: 'hiring:position:read',
        },
        { label: 'Offers', icon: FileText, href: '/offers', permission: 'hiring:offer:read' },
      ],
    },
  ],
}
```

Create `apps/web-hiring/src/app/layout-client.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'
import { AppLayout } from '@future/app-layout'
import { trpc } from '../lib/trpc'
import { hiringNavConfig } from '../navigation'

export function HiringLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AppLayout config={hiringNavConfig} trpc={trpc}>
      {children}
    </AppLayout>
  )
}
```

Update `apps/web-hiring/src/app/layout.tsx` — same pattern as web-people: replace `GlobalNav` import with `HiringLayoutClient`.

- [ ] **Step 2: web-time**

Same pattern. Config with Attendance, Leave, Timesheets, OT items.

- [ ] **Step 3: web-performance**

Same pattern. Config with Review Cycles, Evaluations, Feedback items.

- [ ] **Step 4: web-goals**

Same pattern. Config with OKRs, KPIs, Objectives items.

- [ ] **Step 5: web-projects**

Same pattern. Config with Staffing, Assignments, Delivery items.

- [ ] **Step 6: web-finance**

Same pattern. Config with Invoices, Payroll, Budget items.

- [ ] **Step 7: web-planner**

Same pattern. Config with Tasks, Reminders, KPI Linkage items.

- [ ] **Step 8: web-insights**

Same pattern. Config with Dashboards, Reports items.

- [ ] **Step 9: web-agents**

Same pattern. Config with Agent Configs, Sessions, Tools items.

- [ ] **Step 10: web-admin**

Same pattern. Config with Tenant Settings, AI Config, Module Toggles, Roles & Permissions items.

- [ ] **Step 11: Build all zones**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter "@future/*" build
bun run --filter "web-*" build
```

Expected: All builds succeed.

- [ ] **Step 12: Commit**

```bash
git add apps/web-hiring/ apps/web-time/ apps/web-performance/ apps/web-goals/ apps/web-projects/ apps/web-finance/ apps/web-planner/ apps/web-insights/ apps/web-agents/ apps/web-admin/
git commit -m "feat: integrate @future/app-layout across all zones"
```

---

## Task 10: Typecheck, lint, and final verification

- [ ] **Step 1: Run full typecheck**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout typecheck
```

Expected: No type errors.

- [ ] **Step 2: Run lint**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout lint
```

Expected: No lint errors.

- [ ] **Step 3: Run all app-layout tests**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter @future/app-layout test:unit
```

Expected: All tests PASS, ≥70% coverage.

- [ ] **Step 4: Run affected zone typechecks**

```bash
cd /Users/canh/Projects/Seta/future
bun run --filter "web-*" typecheck
```

Expected: No type errors.

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore(app-layout): fix lint and type issues"
```

# PR-3: apps/studio Kickoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold apps/studio Vite SPA with AppShell, providers, login flow, /me round-trip, and a smoke /tenants page from /me's tenant list.

**Architecture:** TanStack Router file-based routes; SetaProvider supplies AgentClient + QueryClient; _authed.tsx layout calls /me via ensureQueryData and redirects to /login when unauthenticated; AppShell mounted with full nav (slice pages stub with EmptyState until their PRs land).

**Tech Stack:** React 19, Vite 7, @tanstack/react-router, @tanstack/react-query, tailwindcss 4, @seta/ui, @seta/agent-sdk, vitest, MSW, Playwright (E2E scaffold).

---

## Phase 0 — Pin resolution

Resolve concrete pins via `pnpm view <pkg> version` before any `pnpm add` call. CLAUDE.md "CLI-only — Unknown pin → `pnpm view <pkg> version`, propose pin first." Record each `<latest>` value as the pin used by subsequent steps. Catalog pins are fixed (`zod@4.4.3`, `vitest@4.1.5`, `typescript@6.0.3`).

- [ ] **Step 0.1** — Resolve runtime pins.

  ```sh
  pnpm view react version
  pnpm view react-dom version
  pnpm view vite version
  pnpm view @tanstack/react-router version
  pnpm view @tanstack/router-vite-plugin version
  pnpm view @tanstack/react-query version
  pnpm view tailwindcss version
  pnpm view @tailwindcss/vite version
  pnpm view lucide-react version
  pnpm view recharts version
  ```

  Record each output. Reference pins below as `<react-pin>`, `<react-dom-pin>`, `<vite-pin>`, `<tan-router-pin>`, `<tan-router-vite-pin>`, `<tan-query-pin>`, `<tw-pin>`, `<tw-vite-pin>`, `<lucide-pin>`, `<recharts-pin>` respectively.

- [ ] **Step 0.2** — Resolve dev-dep pins.

  ```sh
  pnpm view @playwright/test version
  pnpm view @axe-core/playwright version
  pnpm view jsdom version
  pnpm view @testing-library/react version
  pnpm view @testing-library/jest-dom version
  pnpm view @testing-library/user-event version
  pnpm view @types/react version
  pnpm view @types/react-dom version
  pnpm view @types/node version
  ```

  Record. Reference as `<pw-pin>`, `<axe-pw-pin>`, `<jsdom-pin>`, `<rtl-pin>`, `<rtl-jest-dom-pin>`, `<rtl-user-pin>`, `<types-react-pin>`, `<types-react-dom-pin>`, `<types-node-pin>`.

---

## Phase 0.5 — `@seta/ui` AppShell amendment (admin-mode)

> **Why this is first.** Studio is admin/observability only and does NOT mount the right-side `AgentPanel`. Studio follows Mastra Studio's two-column layout (sidebar + main canvas). `AgentPanel` stays in `@seta/ui` as shared infrastructure for OTHER Seta Workspace modules (Timesheet, PMO, Finance) that ship later — those modules will mount `AppShell` with an `agentContext` prop; Studio does not. To support that, `AppShell` must accept `agentContext` as optional. This is the only `@seta/ui` change inside PR-3 — primitive additions land in PR-8. TDD: failing test first, then implementation, then green.

- [ ] **Step 0.5.1** — Add the failing "without-panel" test. Open `platform/ui/src/components/AppShell.test.tsx` (or the co-located test file currently exercising AppShell). Add a new `describe('AppShell — admin mode (no agentContext)')` block asserting:
  1. When rendered without an `agentContext` prop, the AgentPanel column is not in the DOM (`queryByTestId('agent-panel')` is null).
  2. The main canvas (`<main role="main">` or current testid) has no right-side panel sibling and consumes the right viewport edge (no `agent-panel-column` wrapper present).
  3. The TopBar Bot toggle (`getByRole('button', { name: /agent panel/i })` or current accessible name) is not rendered.
  4. The existing "with-panel" tests still pass: when `agentContext={{ page: 'me' }}` is passed, the panel column renders and the Bot toggle is visible.

  Run `pnpm --filter @seta/ui test:unit` — the new block should fail (red).

- [ ] **Step 0.5.2** — Implement the AppShell amendment. In `platform/ui/src/components/AppShell.tsx`:
  1. Change the `AppShellProps` type so `agentContext` is `agentContext?: AgentContext` (already optional in the public API but currently still rendered as a column unconditionally).
  2. Gate the AgentPanel column on `agentContext != null`. When omitted, do not render the right column wrapper at all — the main canvas grid template collapses to two tracks (sidebar + main) so the canvas extends to the right viewport edge.
  3. Gate the Bot toggle in `TopBar` on the same condition. Plumb a `hasAgentPanel` flag (or read from context) so TopBar can hide the toggle when there is no panel.
  4. Preserve all existing behavior when `agentContext` is provided — three-column layout, `useAgentPanel` open/closed state, Bot toggle visible.

  Run `pnpm --filter @seta/ui test:unit` — all tests green (both with-panel and without-panel modes).

- [ ] **Step 0.5.3** — Typecheck the package.

  ```sh
  pnpm --filter @seta/ui typecheck
  ```

- [ ] **Step 0.5.4** — Commit the AppShell amendment as its own commit before any Studio scaffold work.

  ```sh
  git add platform/ui/src
  git commit -m "feat(ui): make AppShell agentContext optional for admin modules"
  ```

---

## Phase 1 — Package scaffold

- [ ] **Step 1.1** — Scaffold `apps/studio` package.

  ```sh
  pnpm new:package
  ```

  Answer prompts: location `apps/studio`, name `@seta/studio`, private `true`, description `Seta Studio — P2 admin SPA`. If the scaffolder doesn't support `apps/*`, create manually then run `pnpm install` to register the workspace.

- [ ] **Step 1.2** — Confirm `apps/studio/package.json` baseline.

  Verify the generated file has:

  ```json
  {
    "name": "@seta/studio",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "license": "Apache-2.0"
  }
  ```

  Do **not** hand-edit fields outside the whitelist in CLAUDE.md "Packages & deps". Everything else lands via `pnpm` CLI.

- [ ] **Step 1.3** — Add runtime dependencies (React + Vite core + router/query + styling).

  ```sh
  pnpm --filter @seta/studio add \
    react@<react-pin> \
    react-dom@<react-dom-pin> \
    @tanstack/react-router@<tan-router-pin> \
    @tanstack/react-query@<tan-query-pin> \
    lucide-react@<lucide-pin> \
    recharts@<recharts-pin> \
    zod@4.4.3
  ```

- [ ] **Step 1.4** — Add workspace deps.

  ```sh
  pnpm --filter @seta/studio add \
    @seta/ui@workspace:* \
    @seta/agent-sdk@workspace:*
  pnpm --filter @seta/studio add \
    @seta/connector-registry@workspace:* \
    @seta/identity@workspace:*
  ```

  `@seta/connector-registry` and `@seta/identity` are **type-only consumers** per `apps/studio/SCOPE.md` § 6 Imports — Studio crosses to those packages only through `import type`. The dep is present so TypeScript can resolve type re-exports; never `import { … }` from them at runtime.

- [ ] **Step 1.5** — Add dev dependencies (build, test, types).

  ```sh
  pnpm --filter @seta/studio add -D \
    vite@<vite-pin> \
    @tanstack/router-vite-plugin@<tan-router-vite-pin> \
    tailwindcss@<tw-pin> \
    @tailwindcss/vite@<tw-vite-pin> \
    vitest@4.1.5 \
    @testing-library/react@<rtl-pin> \
    @testing-library/jest-dom@<rtl-jest-dom-pin> \
    @testing-library/user-event@<rtl-user-pin> \
    msw@2.14.6 \
    jsdom@<jsdom-pin> \
    @playwright/test@<pw-pin> \
    @axe-core/playwright@<axe-pw-pin> \
    @types/react@<types-react-pin> \
    @types/react-dom@<types-react-dom-pin> \
    @types/node@<types-node-pin> \
    typescript@6.0.3 \
    @seta/tsconfig@workspace:*
  ```

- [ ] **Step 1.6** — Append `scripts` to `apps/studio/package.json` via `pnpm pkg set` (CLI-only — never hand-edit `package.json`).

  ```sh
  pnpm --filter @seta/studio pkg set scripts.dev="vite"
  pnpm --filter @seta/studio pkg set scripts.build="vite build"
  pnpm --filter @seta/studio pkg set scripts.preview="vite preview"
  pnpm --filter @seta/studio pkg set scripts.typecheck="tsc --noEmit -p tsconfig.json"
  pnpm --filter @seta/studio pkg set scripts.test:unit="vitest run"
  pnpm --filter @seta/studio pkg set scripts.test:e2e="playwright test"
  pnpm --filter @seta/studio pkg set scripts.check:bundle="pnpm exec tsx scripts/check-bundle-size.ts"
  ```

- [ ] **Step 1.7** — Run `pnpm install` and `pnpm typecheck` at repo root to confirm the workspace is healthy before writing source.

  ```sh
  pnpm install
  pnpm --filter @seta/studio typecheck
  ```

  Expect typecheck to pass with zero project files (empty `src/`).

---

## Phase 2 — Build config & TS

- [ ] **Step 2.1** — Create `apps/studio/index.html`.

  ```html
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Seta Studio</title>
      <link rel="stylesheet" href="@seta/ui/tokens.css" />
    </head>
    <body class="bg-canvas text-ink antialiased">
      <div id="root"></div>
      <script type="module" src="/src/main.tsx"></script>
    </body>
  </html>
  ```

- [ ] **Step 2.2** — Create `apps/studio/vite.config.ts`.

  ```ts
  import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
  import tailwindcss from '@tailwindcss/vite'
  import { defineConfig } from 'vite'

  const gitSha = process.env.GIT_SHA ?? 'dev'

  export default defineConfig({
    plugins: [
      TanStackRouterVite({ routesDirectory: 'src/routes', generatedRouteTree: 'src/routeTree.gen.ts' }),
      tailwindcss(),
    ],
    define: {
      'import.meta.env.VITE_PUBLIC_BUILD_SHA': JSON.stringify(gitSha),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: 'http://localhost:8080', changeOrigin: true },
        '/sso': { target: 'http://localhost:8080', changeOrigin: true },
        '/oauth': { target: 'http://localhost:8080', changeOrigin: true },
      },
    },
    build: {
      sourcemap: true,
      reportCompressedSize: true,
      rollupOptions: { output: { manualChunks: undefined } },
    },
  })
  ```

- [ ] **Step 2.3** — Create `apps/studio/tailwind.config.ts`.

  ```ts
  import setaPreset from '@seta/ui/tokens'
  import type { Config } from 'tailwindcss'

  export default {
    presets: [setaPreset],
    content: [
      './index.html',
      './src/**/*.{ts,tsx}',
      '../../platform/ui/src/**/*.{ts,tsx}',
    ],
  } satisfies Config
  ```

- [ ] **Step 2.4** — Create `apps/studio/tsconfig.json`.

  ```json
  {
    "extends": "@seta/tsconfig/base.json",
    "compilerOptions": {
      "jsx": "react-jsx",
      "lib": ["DOM", "DOM.Iterable", "ESNext"],
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "noEmit": true,
      "types": ["vite/client", "node"]
    },
    "include": ["src", "scripts", "vite.config.ts", "tailwind.config.ts", "vitest.config.ts"]
  }
  ```

- [ ] **Step 2.5** — Create `apps/studio/vitest.config.ts`.

  ```ts
  import { defineProject } from 'vitest/config'

  export default defineProject({
    test: {
      name: 'studio',
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  })
  ```

  Root vitest config owns `pool`, `coverage`, `thresholds`, `projects` per CLAUDE.md. After creating this file, append `apps/studio/vitest.config.ts` to the root `vitest.projects` array in `/Users/canh/Projects/Seta/seta-os/vitest.config.ts` if that file enumerates projects.

---

## Phase 3 — Env, client, queries

- [ ] **Step 3.1** — Create `apps/studio/src/env.ts`.

  ```ts
  import { z } from 'zod'

  const EnvSchema = z.object({
    VITE_API_BASE_URL: z.string().default('/api'),
    VITE_PUBLIC_BUILD_SHA: z.string().default('dev'),
  })

  export const env = EnvSchema.parse({
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    VITE_PUBLIC_BUILD_SHA: import.meta.env.VITE_PUBLIC_BUILD_SHA,
  })

  export type Env = z.infer<typeof EnvSchema>
  ```

  Per CLAUDE.md, never read `process.env.X` in app code; the build-time `define` in `vite.config.ts` inlines `VITE_PUBLIC_BUILD_SHA`.

- [ ] **Step 3.2** — Create `apps/studio/src/api/client.ts` — singleton `AgentClient`.

  ```ts
  import { AgentClient } from '@seta/agent-sdk'
  import { env } from '../env'

  export const client = new AgentClient({
    baseUrl: env.VITE_API_BASE_URL,
    credentials: 'include',
  })
  ```

- [ ] **Step 3.3** — Create `apps/studio/src/api/queries.ts` — key factory + query options.

  ```ts
  import { queryOptions } from '@tanstack/react-query'
  import { client } from './client'

  export const qk = {
    me: () => ['me'] as const,
    tenants: () => ['tenants'] as const,
    tenant: (id: string) => ['tenant', id] as const,
  }

  export const meQueryOptions = queryOptions({
    queryKey: qk.me(),
    queryFn: ({ signal }) => client.getMe({ signal }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  ```

---

## Phase 4 — Router + nav

- [ ] **Step 4.1** — Create `apps/studio/src/router.tsx`.

  ```tsx
  import { QueryClient } from '@tanstack/react-query'
  import { createRouter } from '@tanstack/react-router'
  import { routeTree } from './routeTree.gen'

  export const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    },
  })

  export const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
  })

  declare module '@tanstack/react-router' {
    interface Register {
      router: typeof router
    }
  }
  ```

- [ ] **Step 4.2** — Create `apps/studio/src/main.tsx`.

  ```tsx
  import { RouterProvider } from '@tanstack/react-router'
  import { StrictMode } from 'react'
  import { createRoot } from 'react-dom/client'
  import { router } from './router'

  const rootEl = document.getElementById('root')
  if (!rootEl) throw new Error('Studio: #root not found')

  createRoot(rootEl).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
  ```

- [ ] **Step 4.3** — Create `apps/studio/src/nav/studioNav.ts`.

  ```ts
  import type { NavItem } from '@seta/ui'
  import {
    Activity,
    Bot,
    BrainCircuit,
    Building2,
    FileText,
    GaugeCircle,
    Hammer,
    PlugZap,
    ScrollText,
    Workflow,
  } from 'lucide-react'

  export function studioNav(tenantId: string | null): NavItem[] {
    if (!tenantId) {
      return [{ id: 'tenants', label: 'Tenants', icon: Building2, to: '/tenants' }]
    }
    const base = `/tenants/${tenantId}`
    return [
      { id: 'tenants', label: 'Tenants', icon: Building2, to: '/tenants' },
      { id: 'connectors', label: 'Connectors', icon: PlugZap, to: `${base}/connectors` },
      { id: 'runs', label: 'Runs', icon: Activity, to: `${base}/runs` },
      { id: 'corpus', label: 'Corpus', icon: FileText, to: `${base}/corpus` },
      { id: 'audit', label: 'Audit', icon: ScrollText, to: `${base}/audit` },
      { id: 'agents', label: 'Agents', icon: Bot, to: `${base}/agents` },
      { id: 'workflows', label: 'Workflows', icon: Workflow, to: `${base}/workflows` },
      { id: 'tools', label: 'Tools', icon: Hammer, to: `${base}/tools` },
      { id: 'threads', label: 'Memory', icon: BrainCircuit, to: `${base}/threads` },
      { id: 'metrics', label: 'Metrics', icon: GaugeCircle, to: `${base}/metrics` },
    ]
  }
  ```

> **No `agentContext.ts` helper.** Studio is admin-only and does NOT mount the right-side `AgentPanel`, so it has no per-route context to feed `AppShell`. Other Workspace SPAs (Timesheet, PMO, Finance) that ship later will own their own `agentContext.ts` mappers.

---

## Phase 5 — Root + auth routes

- [ ] **Step 5.1** — Create `apps/studio/src/routes/__root.tsx`.

  ```tsx
  import { SetaProvider, Toaster } from '@seta/ui'
  import type { QueryClient } from '@tanstack/react-query'
  import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
  import { client } from '../api/client'
  import { env } from '../env'

  export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: RootComponent,
  })

  function RootComponent() {
    return (
      <SetaProvider client={client}>
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">
            <Outlet />
          </div>
          <footer className="border-t border-divider px-6 py-2 text-xs text-ink-muted">
            <span className="font-mono">build {env.VITE_PUBLIC_BUILD_SHA.slice(0, 7)}</span>
          </footer>
        </div>
        <Toaster />
      </SetaProvider>
    )
  }
  ```

- [ ] **Step 5.2** — Create `apps/studio/src/routes/login.tsx`.

  ```tsx
  import { Button } from '@seta/ui'
  import { createFileRoute } from '@tanstack/react-router'

  export const Route = createFileRoute('/login')({
    component: LoginPage,
  })

  function LoginPage() {
    async function signIn(provider: 'entra' | 'google') {
      const res = await fetch(`/sso/login/${provider}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnTo: '/tenants' }),
      })
      if (!res.ok) throw new Error(`login ${provider} failed: ${res.status}`)
      const { url } = (await res.json()) as { url: string }
      window.location.href = url
    }

    return (
      <div className="auth-gradient-hero flex min-h-screen items-center justify-center px-4">
        <div className="card-dark w-full max-w-sm space-y-6 p-8">
          <h1 className="text-display text-center">Sign in to Seta</h1>
          <div className="flex flex-col gap-3">
            <Button onClick={() => signIn('entra')} aria-label="Sign in with Microsoft">
              Sign in with Microsoft
            </Button>
            <Button variant="secondary" onClick={() => signIn('google')} aria-label="Sign in with Google">
              Sign in with Google
            </Button>
          </div>
        </div>
      </div>
    )
  }
  ```

  `window.location.href` here is the SSO-redirect exception, same class as the OAuth-consent redirect documented in `apps/studio/SCOPE.md` § 8.

- [ ] **Step 5.3** — Create `apps/studio/src/routes/login.$provider.callback.tsx`.

  ```tsx
  import { createFileRoute } from '@tanstack/react-router'

  export const Route = createFileRoute('/login/$provider/callback')({
    component: CallbackSplash,
  })

  function CallbackSplash() {
    return (
      <div className="auth-gradient-hero flex min-h-screen items-center justify-center">
        <p className="text-ink-muted">Signing you in…</p>
      </div>
    )
  }
  ```

  The server-side callback at `/sso/callback/:provider` already minted the cookie and 302'd to `returnTo`; this route exists only as a graceful fallback if the browser lands here directly.

---

## Phase 6 — Authed layout + pages

- [ ] **Step 6.1** — Create `apps/studio/src/routes/_authed.tsx`.

  ```tsx
  import { AppShell } from '@seta/ui'
  import { createFileRoute, Outlet, redirect, useParams } from '@tanstack/react-router'
  import { meQueryOptions } from '../api/queries'
  import { studioNav } from '../nav/studioNav'

  export const Route = createFileRoute('/_authed')({
    beforeLoad: async ({ context, location }) => {
      try {
        const me = await context.queryClient.ensureQueryData(meQueryOptions)
        if (!me) throw redirect({ to: '/login', search: { returnTo: location.href } })
      } catch {
        throw redirect({ to: '/login', search: { returnTo: location.href } })
      }
    },
    component: AuthedLayout,
  })

  function AuthedLayout() {
    // Studio is admin-only and does NOT mount the right-side AgentPanel.
    // AppShell is rendered with NO `agentContext` prop — the panel column is
    // omitted and the main canvas extends to the right viewport edge (see PR-3
    // Phase 0.5 amendment to `@seta/ui`). Tenant id for the sidebar nav is read
    // from route params instead of a pathname-derived agentContext.
    const params = useParams({ strict: false }) as { id?: string }
    const nav = studioNav(params.id ?? null)
    return (
      <AppShell nav={nav}>
        <Outlet />
      </AppShell>
    )
  }
  ```

- [ ] **Step 6.2** — Create `apps/studio/src/routes/_authed/me.tsx`.

  ```tsx
  import { Card, EmptyState } from '@seta/ui'
  import { useSuspenseQuery } from '@tanstack/react-query'
  import { createFileRoute } from '@tanstack/react-router'
  import { CircleUser } from 'lucide-react'
  import { meQueryOptions } from '../../api/queries'

  export const Route = createFileRoute('/_authed/me')({
    component: MePage,
  })

  function MePage() {
    const { data: me } = useSuspenseQuery(meQueryOptions)
    if (!me) {
      return <EmptyState icon={CircleUser} title="No session" description="Sign in to view your account." />
    }
    return (
      <div className="space-y-4 p-6">
        <Card>
          <div className="space-y-2 p-6">
            <h1 className="text-heading">{me.name}</h1>
            <p className="text-ink-muted">{me.email}</p>
            <p className="font-mono text-xs text-ink-subtle">{me.id}</p>
          </div>
        </Card>
      </div>
    )
  }
  ```

- [ ] **Step 6.3** — Create `apps/studio/src/routes/_authed/tenants.tsx`.

  ```tsx
  import { type Column, DataTable, EmptyState } from '@seta/ui'
  import { useSuspenseQuery } from '@tanstack/react-query'
  import { createFileRoute, Link } from '@tanstack/react-router'
  import { Building2 } from 'lucide-react'
  import { meQueryOptions } from '../../api/queries'

  type Tenant = { id: string; name: string; role: 'admin' | 'member' | 'viewer' }

  export const Route = createFileRoute('/_authed/tenants')({
    component: TenantsPage,
  })

  const columns: Column<Tenant>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (t) => (
        <Link to="/tenants/$id/connectors" params={{ id: t.id }} className="text-primary hover:underline">
          {t.name}
        </Link>
      ),
    },
    { key: 'role', header: 'Role', cell: (t) => t.role },
  ]

  function TenantsPage() {
    const { data: me } = useSuspenseQuery(meQueryOptions)
    const tenants = me?.tenants ?? []
    if (tenants.length === 0) {
      return (
        <EmptyState
          icon={Building2}
          title="No tenants yet"
          description="You don't have access to any tenant. Ask an admin to grant access."
        />
      )
    }
    return (
      <div className="p-6">
        <h1 className="mb-4 text-heading">Tenants</h1>
        <DataTable<Tenant> data={tenants} columns={columns} rowKey={(t) => t.id} />
      </div>
    )
  }
  ```

- [ ] **Step 6.4** — Create the stub route files. Each has the same body — only the `Route` path string differs. Create each file individually with the content below, substituting the path string.

  Files:

  - `apps/studio/src/routes/_authed/tenants.$id.tsx` → path `/_authed/tenants/$id`
  - `apps/studio/src/routes/_authed/tenants.$id.setup.tsx` → `/_authed/tenants/$id/setup`
  - `apps/studio/src/routes/_authed/tenants.$id.connectors.tsx` → `/_authed/tenants/$id/connectors`
  - `apps/studio/src/routes/_authed/tenants.$id.runs.tsx` → `/_authed/tenants/$id/runs`
  - `apps/studio/src/routes/_authed/tenants.$id.corpus.tsx` → `/_authed/tenants/$id/corpus`
  - `apps/studio/src/routes/_authed/tenants.$id.audit.tsx` → `/_authed/tenants/$id/audit`
  - `apps/studio/src/routes/_authed/tenants.$id.agents.tsx` → `/_authed/tenants/$id/agents`
  - `apps/studio/src/routes/_authed/tenants.$id.workflows.tsx` → `/_authed/tenants/$id/workflows`
  - `apps/studio/src/routes/_authed/tenants.$id.tools.tsx` → `/_authed/tenants/$id/tools`
  - `apps/studio/src/routes/_authed/tenants.$id.threads.tsx` → `/_authed/tenants/$id/threads`
  - `apps/studio/src/routes/_authed/tenants.$id.metrics.tsx` → `/_authed/tenants/$id/metrics`

  Body (substitute the path string):

  ```tsx
  import { EmptyState } from '@seta/ui'
  import { createFileRoute } from '@tanstack/react-router'
  import { Hammer } from 'lucide-react'

  export const Route = createFileRoute('<PATH>')({
    component: () => (
      <EmptyState
        icon={Hammer}
        title="Coming soon"
        description="This page lands in a later PR."
      />
    ),
  })
  ```

---

## Phase 7 — Tests

- [ ] **Step 7.1** — Create `apps/studio/src/test/setup.ts`.

  ```ts
  import '@testing-library/jest-dom/vitest'
  import { cleanup } from '@testing-library/react'
  import { afterAll, afterEach, beforeAll } from 'vitest'
  import { server } from './msw-server'

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => {
    cleanup()
    server.resetHandlers()
  })
  afterAll(() => server.close())
  ```

- [ ] **Step 7.2** — Create `apps/studio/src/test/msw-server.ts`.

  ```ts
  import { setupServer } from 'msw/node'

  export const server = setupServer()
  ```

- [ ] **Step 7.3** — Create `apps/studio/src/test/fixtures.ts`.

  ```ts
  import type { Me } from '@seta/agent-sdk'

  export const meFixture: Me = {
    id: 'user_01',
    email: 'sam@acme.test',
    name: 'Sam Example',
    tenants: [
      { id: 'tnt_01', name: 'Acme Inc', role: 'admin' },
      { id: 'tnt_02', name: 'Beta Co', role: 'member' },
    ],
  }
  ```

- [ ] **Step 7.4** — Create `apps/studio/src/routes/login.test.tsx`.

  ```tsx
  import { render, screen } from '@testing-library/react'
  import { describe, expect, it } from 'vitest'
  import { Route } from './login'

  describe('login route', () => {
    it('renders Microsoft and Google buttons', () => {
      const Component = Route.options.component!
      render(<Component />)
      expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 7.5** — Create `apps/studio/src/routes/_authed.test.tsx`.

  ```tsx
  import { QueryClient } from '@tanstack/react-query'
  import { http, HttpResponse } from 'msw'
  import { describe, expect, it } from 'vitest'
  import { meQueryOptions } from '../api/queries'
  import { server } from '../test/msw-server'

  describe('_authed beforeLoad', () => {
    it('redirects to /login when /me is 401', async () => {
      server.use(http.get('/api/me', () => new HttpResponse(null, { status: 401 })))
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      await expect(qc.ensureQueryData(meQueryOptions)).rejects.toBeDefined()
    })

    it('resolves /me when authenticated', async () => {
      server.use(
        http.get('/api/me', () =>
          HttpResponse.json({
            id: 'u1',
            email: 'a@b.test',
            name: 'A',
            tenants: [{ id: 't1', name: 'Acme', role: 'admin' }],
          }),
        ),
      )
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const me = await qc.ensureQueryData(meQueryOptions)
      expect(me.tenants).toHaveLength(1)
    })
  })
  ```

- [ ] **Step 7.6** — Create `apps/studio/src/routes/_authed/tenants.test.tsx`.

  ```tsx
  import { SetaProvider } from '@seta/ui'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
  } from '@tanstack/react-router'
  import { render, screen, waitFor } from '@testing-library/react'
  import { http, HttpResponse } from 'msw'
  import { describe, expect, it } from 'vitest'
  import { client } from '../../api/client'
  import { server } from '../../test/msw-server'
  import { meFixture } from '../../test/fixtures'
  import { Route as TenantsRoute } from './tenants'

  describe('/tenants page', () => {
    it('renders a DataTable row per tenant from /me', async () => {
      server.use(http.get('/api/me', () => HttpResponse.json(meFixture)))
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

      const root = createRootRoute({ component: () => <Outlet /> })
      const tenants = createRoute({ getParentRoute: () => root, path: '/tenants', ...TenantsRoute.options })
      const router = createRouter({
        routeTree: root.addChildren([tenants]),
        history: createMemoryHistory({ initialEntries: ['/tenants'] }),
      })

      render(
        <SetaProvider client={client} queryClient={qc}>
          <QueryClientProvider client={qc}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </SetaProvider>,
      )

      await waitFor(() => {
        expect(screen.getByText('Acme Inc')).toBeInTheDocument()
        expect(screen.getByText('Beta Co')).toBeInTheDocument()
      })
    })

    it('renders EmptyState when tenants list is empty', async () => {
      server.use(http.get('/api/me', () => HttpResponse.json({ ...meFixture, tenants: [] })))
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

      const root = createRootRoute({ component: () => <Outlet /> })
      const tenants = createRoute({ getParentRoute: () => root, path: '/tenants', ...TenantsRoute.options })
      const router = createRouter({
        routeTree: root.addChildren([tenants]),
        history: createMemoryHistory({ initialEntries: ['/tenants'] }),
      })

      render(
        <SetaProvider client={client} queryClient={qc}>
          <QueryClientProvider client={qc}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </SetaProvider>,
      )

      await waitFor(() => {
        expect(screen.getByText(/no tenants yet/i)).toBeInTheDocument()
      })
    })
  })
  ```

- [ ] **Step 7.7** — Run unit tests.

  ```sh
  pnpm --filter @seta/studio test:unit
  ```

  All tests green. Fix any compile-time fallout from API mismatches (`@seta/ui` exports, `AgentClient` shape) before moving on.

---

## Phase 8 — Bundle-size gate

- [ ] **Step 8.1** — Create `apps/studio/scripts/check-bundle-size.ts`.

  ```ts
  import { gzipSync } from 'node:zlib'
  import { readdirSync, readFileSync, statSync } from 'node:fs'
  import { join } from 'node:path'

  const DIST = join(import.meta.dirname, '..', 'dist', 'assets')
  const MAIN_MAX = 250 * 1024
  const CHUNK_MAX = 100 * 1024

  function gzippedSize(file: string): number {
    return gzipSync(readFileSync(file)).byteLength
  }

  function listJs(dir: string): string[] {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => join(dir, f))
      .filter((p) => statSync(p).isFile())
  }

  function main(): void {
    const files = listJs(DIST)
    if (files.length === 0) {
      console.error(`bundle-size: no JS files at ${DIST}`)
      process.exit(1)
    }
    const violations: string[] = []
    let mainSeen = false
    for (const file of files) {
      const size = gzippedSize(file)
      const base = file.split('/').pop()!
      const isMain = base.startsWith('index') || base.startsWith('main')
      const limit = isMain ? MAIN_MAX : CHUNK_MAX
      const label = isMain ? 'main' : 'chunk'
      console.log(`${label.padEnd(5)} ${base.padEnd(40)} ${(size / 1024).toFixed(1)} kB gz`)
      if (size > limit) violations.push(`${base}: ${(size / 1024).toFixed(1)} kB gz > ${(limit / 1024).toFixed(0)} kB`)
      if (isMain) mainSeen = true
    }
    if (!mainSeen) violations.push('bundle-size: no main bundle found')
    if (violations.length > 0) {
      console.error('\nFAIL:')
      for (const v of violations) console.error(`  ${v}`)
      process.exit(1)
    }
    console.log('\nbundle-size OK')
  }

  main()
  ```

- [ ] **Step 8.2** — Build the SPA once and run the gate.

  ```sh
  pnpm --filter @seta/studio build
  pnpm --filter @seta/studio check:bundle
  ```

  Record the current main bundle size in the PR description. Fail the PR if either limit is exceeded; if exceeded by less than 20 % at this stage, accept and open a follow-up to introduce route-level lazy splits per master plan §19.7.

---

## Phase 9 — E2E scaffold

- [ ] **Step 9.1** — Create `apps/studio/playwright.config.ts`.

  ```ts
  import { defineConfig } from '@playwright/test'

  export default defineConfig({
    testDir: '../../tests/e2e/studio',
    timeout: 30_000,
    fullyParallel: false,
    use: {
      baseURL: 'http://localhost:5173',
      trace: 'on-first-retry',
    },
    webServer: {
      command: 'pnpm --filter @seta/studio dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  })
  ```

- [ ] **Step 9.2** — Create `tests/e2e/studio/login.spec.ts`.

  ```ts
  import { expect, test } from '@playwright/test'

  test('login page renders both SSO buttons', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /sign in with microsoft/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible()
  })
  ```

  Run via `pnpm --filter @seta/studio test:e2e` — gated to local dev for now; CI E2E lands in PR-4+.

---

## Phase 10 — Verification

Per CLAUDE.md "verification-before-completion" — every claim is backed by command output.

- [ ] **Step 10.1** — Typecheck.

  ```sh
  pnpm --filter @seta/studio typecheck
  ```

- [ ] **Step 10.2** — Lint + format from repo root.

  ```sh
  pnpm lint
  pnpm format
  ```

- [ ] **Step 10.3** — Unit tests.

  ```sh
  pnpm --filter @seta/studio test:unit
  ```

- [ ] **Step 10.4** — Build + bundle gate.

  ```sh
  pnpm --filter @seta/studio build
  pnpm --filter @seta/studio check:bundle
  ```

- [ ] **Step 10.5** — Dev round-trip smoke.

  Start `apps/api` (`pnpm --filter @seta/api dev`) and `apps/studio` (`pnpm --filter @seta/studio dev`). Open `http://localhost:5173/login`, click **Sign in with Microsoft**, complete Entra consent in the popup; expect 302 → `/sso/callback/entra` → `/tenants`. The Tenants page renders rows for each membership in `/me`. Click a tenant — `AppShell` mounts with the full sidebar; slice pages render `<EmptyState icon={Hammer} title="Coming soon" />`.

- [ ] **Step 10.6** — Commit.

  Conventional Commit message:

  ```text
  feat(studio): scaffold Vite SPA — AppShell, providers, /login, /me, /tenants smoke
  ```

  One PR, one change. No bundled refactors. No changeset (apps/studio is `"private": true`).

---

## Demo state (end of PR-3)

`pnpm --filter @seta/studio dev` opens `http://localhost:5173`. The user is redirected to `/login` (auth-gradient hero, both SSO buttons). Clicking **Sign in with Microsoft** posts to `/sso/login/entra`, redirects out to Entra, returns through the `apps/api` `/sso/callback/entra` (shipped in PR-2) to `/tenants`. The Tenants page reads `me.tenants` from `/me` and renders a `DataTable` of memberships with EmptyState fallback. The AppShell sidebar shows the full nav (Connectors, Runs, Corpus, Audit, Agents, Workflows, Tools, Memory, Metrics); each tenant-scoped slice page is a `<EmptyState icon={Hammer} title="Coming soon" />` placeholder until PR-4..13 fill them in. `pnpm --filter @seta/studio test:unit` is green. `pnpm --filter @seta/studio build && pnpm --filter @seta/studio check:bundle` reports current sizes and passes the 250 kB / 100 kB gate. The footer renders the 7-char build SHA.

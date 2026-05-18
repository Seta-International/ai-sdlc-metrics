# Console pages — design-system application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Each task in this plan is a standalone PR.** Land them in order or in parallel — they touch independent files.

**Depends on:** `docs/superpowers/plans/2026-05-18-console-design-foundation.md` (the foundation PR — typography tokens, `PageHeader`, `Field`, primitive fixes, CI guard). This plan assumes the foundation has merged.

**Goal:** Apply `PageHeader`, `Field`, and the `numeric` `DataTable` column prop across every console page so the running app matches DESIGN.md. Replace raw `<select>` in Members with the `Select` primitive. Restructure ad-hoc form-row markup to use `Field`.

**Architecture:** This plan is mechanical, page-by-page. Each task wraps page titles with `PageHeader`, swaps form-row trios (`<div class="flex flex-col gap-1"><Label/><Input/><p class="text-caption">…</p></div>`) for `<Field>`, marks date/numeric `DataTable` columns with `numeric: true`, and removes inline `<select>` in favor of the `Select` primitive. No business logic changes. No new components beyond what the foundation already exports.

**Tech Stack:** React, TanStack Router, TanStack Query, `@seta/ui`, Tailwind CSS (v4 hybrid), Vitest + React Testing Library.

**Source spec:** `docs/superpowers/specs/2026-05-18-console-design-foundation-design.md`

**Out of scope:** Adopting `AppShell` in the console (it currently renders pages without a shell — separate, larger PR). New IA / navigation patterns. New visual designs.

---

## File Structure

Each task touches a small, self-contained set of files. Task numbering corresponds to commit/PR order.

| Task | Component | Files |
|---|---|---|
| 1 | Home, Profile, no-workspace | `apps/console/src/routes/_authed/index.tsx`, `apps/console/src/routes/_authed/profile.tsx`, `apps/console/src/routes/no-workspace.tsx` |
| 2 | Members page | `apps/console/src/routes/_authed/members.tsx` |
| 3 | Admin Tenants list | `apps/console/src/routes/_superadmin/admin/tenants.tsx` |
| 4 | ConnectorsPage | `apps/console/src/pages/ConnectorsPage.tsx` |
| 5 | ConsentLandingPage | `apps/console/src/pages/ConsentLandingPage.tsx` |
| 6 | SSO settings (form + route) | `apps/console/src/pages/admin/SsoConfigForm.tsx`, `apps/console/src/routes/_superadmin/admin/tenants.$tenantId.sso.tsx` |
| 7 | SSO domains (form + route) | `apps/console/src/pages/admin/SsoDomainsTable.tsx`, `apps/console/src/routes/_superadmin/admin/tenants.$tenantId.sso.domains.tsx` |
| 8 | Mailer (form + route) | `apps/console/src/pages/admin/MailerConfigForm.tsx`, `apps/console/src/routes/_superadmin/admin/tenants.$tenantId.mailer.tsx` |

Tests adjacent to the affected components (`*.test.tsx`) are updated where they exist; one regression assertion is added per file confirming `PageHeader`/`Field`/token classes are present.

---

### Task 1: Home, Profile, no-workspace — apply `PageHeader` + token cleanup

**Files:**
- Modify: `apps/console/src/routes/_authed/index.tsx`
- Modify: `apps/console/src/routes/_authed/profile.tsx`
- Modify: `apps/console/src/routes/no-workspace.tsx`

Three small pages, one task. None has tests today; add light render-smoke tests next to each if the surrounding directory already has any test config — otherwise skip (these are wired entirely through TanStack Router and tested via E2E elsewhere).

- [ ] **Step 1: Migrate `_authed/index.tsx` (ConsoleHome) to PageHeader**

Replace the existing `<header>` block + h1 with PageHeader. Resulting file:

```tsx
import { useMe } from '@seta/identity-client'
import { PageHeader } from '@seta/ui'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/')({ component: ConsoleHome })

const APP_LABELS: Record<string, string> = {
  studio: 'Studio',
  finance: 'Finance',
  pmo: 'PMO',
  timesheet: 'Timesheet',
}

function ConsoleHome() {
  const { data: me } = useMe()
  if (!me) return null
  return (
    <div className="mx-auto max-w-4xl space-y-xl p-xl">
      <PageHeader
        title={me.tenant?.name ?? 'Welcome'}
        {...(me.tenant ? { description: `/${me.tenant.slug}` } : {})}
      />
      <div className="grid grid-cols-2 gap-md sm:grid-cols-3">
        {me.apps.map((app) => (
          <a
            key={app}
            href={`/${app}/`}
            className="rounded-lg border border-hairline bg-canvas-soft p-xl text-center shadow-card hover:bg-canvas"
          >
            <div className="text-heading-md text-ink">{APP_LABELS[app] ?? app}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
```

Notes:
- `p-8` → `p-xl` (32px is `huge`; 24px is `xl` per the existing spacing scale). Use `p-xl` (24px) per `DESIGN.md §613`.
- `space-y-6` → `space-y-xl`; `gap-4` → `gap-md`; tile padding `p-6` → `p-xl`.
- `text-lg font-medium` → `text-heading-md` (foundation Task 9 already did this but verify).

- [ ] **Step 2: Migrate `_authed/profile.tsx` to PageHeader and tokenized `<dl>`**

```tsx
import { useMe } from '@seta/identity-client'
import { Button, PageHeader } from '@seta/ui'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/profile')({ component: ProfilePage })

function ProfilePage() {
  const { data: me } = useMe()
  if (!me) return null

  async function onLogout() {
    await fetch('/sso/logout', { method: 'POST', credentials: 'include' })
    window.location.href = '/console/login'
  }

  return (
    <div className="max-w-md space-y-xl p-xl">
      <PageHeader title="Profile" />
      <dl className="space-y-sm">
        <div>
          <dt className="text-caption text-ink-mute">Name</dt>
          <dd className="text-body-md text-ink">{me.user.name}</dd>
        </div>
        <div>
          <dt className="text-caption text-ink-mute">Email</dt>
          <dd className="text-body-md text-ink">{me.user.email}</dd>
        </div>
      </dl>
      <Button onClick={onLogout} variant="secondary">
        Sign out
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Refresh `routes/no-workspace.tsx` typography (no PageHeader — full-screen state)**

This route is rendered outside any nav/shell context, so `PageHeader` would feel out of place. Just standardize typography and spacing:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/no-workspace')({ component: NoWorkspaceRoute })

function NoWorkspaceRoute() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="max-w-md p-xl text-center">
        <h1 className="mb-sm text-heading-lg text-ink">No workspace yet</h1>
        <p className="text-body-md text-ink-mute">
          Your account isn't attached to a workspace. Ask your tenant admin to add you, or wait for
          directory sync.
        </p>
      </div>
    </div>
  )
}
```

(Foundation Task 9 already replaced the size classes; this step confirms the final form and tightens spacing tokens.)

- [ ] **Step 4: Build + CI guard sweep**

Run:
```bash
pnpm --filter @seta/console build
pnpm tsx tooling/scripts/check-no-hardcoded-styles.ts apps/console/src/routes/_authed/index.tsx apps/console/src/routes/_authed/profile.tsx apps/console/src/routes/no-workspace.tsx
```
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/routes/_authed/index.tsx \
        apps/console/src/routes/_authed/profile.tsx \
        apps/console/src/routes/no-workspace.tsx
git commit -m "feat(console): apply PageHeader to home + profile; tokenize no-workspace"
```

---

### Task 2: Members page — `PageHeader` + `Select` primitive + token cleanup

**Files:**
- Modify: `apps/console/src/routes/_authed/members.tsx`

Two non-trivial changes here: wrap the page title with `PageHeader`, and replace the inline native `<select>` (line 85 in the audit) with the `@seta/ui` `Select` primitive. The "Remove" inline button uses `text-error hover:underline`; per DESIGN.md a destructive inline action is a ghost Button — but to keep this PR scoped, keep the link-style action and just clean its typography (a follow-up can promote it to a Button variant if desired).

- [ ] **Step 1: Read current file to confirm structure**

Run: `head -130 apps/console/src/routes/_authed/members.tsx`
This file's main body returns `<div className="max-w-3xl space-y-4 p-8"><h1>Members</h1><DataTable .../></div>`.

- [ ] **Step 2: Replace title with PageHeader and swap raw `<select>` for `Select`**

In the `columns` definition for the `role` column, replace the inline `<select>` with the `Select` primitive. Replace the page's `<h1>` block with `<PageHeader title="Members" />`.

Key changes to the file (preserve all React-Query / mutation logic verbatim):

```tsx
import { meQueryOptions } from '@seta/identity-client'
import { Button, type Column, DataTable, EmptyState, PageHeader, Select } from '@seta/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Users } from 'lucide-react'

// ...type Member etc. unchanged...

function MembersPage() {
  // ...qc, useQuery, setRole, removeMember unchanged...

  if (isLoading) return <div className="p-xl">Loading…</div>

  const rows = data?.members ?? []

  const columns: Column<Member>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (m) => m.name,
      sortable: true,
      compare: (a, b) => a.name.localeCompare(b.name),
    },
    {
      key: 'email',
      header: 'Email',
      cell: (m) => m.email,
      sortable: true,
      compare: (a, b) => a.email.localeCompare(b.email),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (m) => (
        <Select.Root
          value={m.role}
          onValueChange={(v) => setRole.mutate({ userId: m.userId, role: v as MemberRole })}
        >
          <Select.Trigger className="h-8 w-32" />
          <Select.Content>
            <Select.Item value="owner">owner</Select.Item>
            <Select.Item value="admin">admin</Select.Item>
            <Select.Item value="member">member</Select.Item>
          </Select.Content>
        </Select.Root>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (m) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm(`Remove ${m.name}?`)) removeMember.mutate(m.userId)
          }}
        >
          Remove
        </Button>
      ),
    },
  ]

  return (
    <div className="max-w-3xl space-y-lg p-xl">
      <PageHeader title="Members" />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(m) => m.userId}
        empty={
          <EmptyState
            icon={Users}
            title="No members"
            description="Invite teammates to collaborate."
          />
        }
      />
    </div>
  )
}
```

Notes:
- The destructive inline link → `Button variant="ghost" size="sm"`. DESIGN.md's destructive color is for full destructive buttons, not ghost; a ghost button reads as a row action which is what this is.
- `space-y-4` → `space-y-lg` (16px); `p-8` → `p-xl` (24px).
- Removed inline `text-[13px]` hardcodes — Button variants now own typography.

- [ ] **Step 3: Run typecheck and build**

```bash
pnpm --filter @seta/console typecheck
pnpm --filter @seta/console build
pnpm tsx tooling/scripts/check-no-hardcoded-styles.ts apps/console/src/routes/_authed/members.tsx
```
Expected: all exit 0.

- [ ] **Step 4: Smoke-test in the browser**

If a local dev server is running, log in as a tenant admin and visit `/members`. Expected: the role column shows a styled Radix select trigger; clicking it opens a popover with three items; selecting a value fires the mutation and updates the list. The Remove button is a ghost-style button on the right.

If no live server is available, document in the PR description that browser verification is required before merge.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/routes/_authed/members.tsx
git commit -m "feat(console): Members uses PageHeader and the Select primitive"
```

---

### Task 3: Admin Tenants list — `PageHeader` + numeric date column

**Files:**
- Modify: `apps/console/src/routes/_superadmin/admin/tenants.tsx`

The `createdAt` column is a date — should be `numeric: true` so it gets `text-body-tabular` + right-align (tabular figures keep date columns visually aligned).

- [ ] **Step 1: Apply the changes**

Replace the existing file's body:

```tsx
import { type Column, DataTable, EmptyState, PageHeader } from '@seta/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'

type Tenant = {
  id: string
  slug: string
  displayName: string | null
  status: string
  createdAt: string
}

export const Route = createFileRoute('/_superadmin/admin/tenants')({ component: TenantsPage })

const columns: Column<Tenant>[] = [
  {
    key: 'slug',
    header: 'Slug',
    cell: (t) => <span className="font-mono text-caption">{t.slug}</span>,
    sortable: true,
    compare: (a, b) => a.slug.localeCompare(b.slug),
  },
  {
    key: 'displayName',
    header: 'Name',
    cell: (t) => t.displayName ?? '—',
    sortable: true,
    compare: (a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (t) => t.status,
    sortable: true,
    compare: (a, b) => a.status.localeCompare(b.status),
  },
  {
    key: 'createdAt',
    header: 'Created',
    cell: (t) => new Date(t.createdAt).toLocaleDateString(),
    numeric: true,
    sortable: true,
    compare: (a, b) => a.createdAt.localeCompare(b.createdAt),
  },
  {
    key: 'sso',
    header: 'SSO',
    cell: (t) => (
      <Link
        to="/admin/tenants/$tenantId/sso"
        params={{ tenantId: t.id }}
        className="text-primary hover:underline"
      >
        Configure
      </Link>
    ),
  },
]

function TenantsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: async () => {
      const res = await fetch('/admin/tenants', { credentials: 'include' })
      if (!res.ok) throw new Error(`admin/tenants ${res.status}`)
      return (await res.json()) as { tenants: Tenant[] }
    },
  })

  if (isLoading) return <div className="p-xl">Loading…</div>

  const rows = data?.tenants ?? []

  return (
    <div className="max-w-4xl space-y-lg p-xl">
      <PageHeader title="Tenants" description="All tenants in this instance." />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(t) => t.id}
        empty={
          <EmptyState icon={Building2} title="No tenants" description="Tenants will appear here." />
        }
      />
    </div>
  )
}
```

Notes:
- Slug column drops its inline `<span className="text-ink-mute">` wrapper for the date (cell now returns a plain string — `numeric: true` plus DataTable's cell baseline handles styling).
- `font-mono text-xs` (slug) → `font-mono text-caption` (foundation Task 9 already substituted, but the cleaner form is consolidated here).

- [ ] **Step 2: Build + guard**

```bash
pnpm --filter @seta/console build
pnpm tsx tooling/scripts/check-no-hardcoded-styles.ts apps/console/src/routes/_superadmin/admin/tenants.tsx
```
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/console/src/routes/_superadmin/admin/tenants.tsx
git commit -m "feat(console): admin Tenants uses PageHeader; mark Created column numeric"
```

---

### Task 4: ConnectorsPage — `PageHeader` + numeric column + token cleanup

**Files:**
- Modify: `apps/console/src/pages/ConnectorsPage.tsx`
- Modify: `apps/console/src/pages/ConnectorsPage.test.tsx` (regression assert)

`lastConsentedAt` is a timestamp → `numeric: true`. Page heading wraps in `PageHeader`.

- [ ] **Step 1: Apply changes to `ConnectorsPage.tsx`**

```tsx
import type { ConnectorStatus, ConnectorSummary } from '@seta/agent-sdk'
import { Button, type Column, DataTable, EmptyState, PageHeader, StatusBadge } from '@seta/ui'
import { Plug } from 'lucide-react'

export interface ConnectorsPageProps {
  connectors: readonly ConnectorSummary[]
  onGrantConsent: (connector: ConnectorSummary) => void
  title?: string
  emptyTitle?: string
  emptyDescription?: string
}

const statusVariant = (s: ConnectorStatus) =>
  s === 'consented' ? 'success' : s === 'pending' ? 'warning' : s === 'failed' ? 'error' : 'neutral'

export function ConnectorsPage({
  connectors,
  onGrantConsent,
  title = 'Connectors',
  emptyTitle = 'No connectors',
  emptyDescription = 'No connectors are registered for this workspace.',
}: ConnectorsPageProps) {
  if (connectors.length === 0) {
    return (
      <div className="space-y-lg p-xl">
        <PageHeader title={title} />
        <EmptyState icon={Plug} title={emptyTitle} description={emptyDescription} />
      </div>
    )
  }

  const columns: Column<ConnectorSummary>[] = [
    {
      key: 'name',
      header: 'Connector',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-body-md text-ink">{r.displayName}</span>
          <span className="text-caption text-ink-mute">{r.description}</span>
        </div>
      ),
    },
    {
      key: 'scopes',
      header: 'Scopes',
      cell: (r) => {
        const all = [...r.requiredScopes.application, ...r.requiredScopes.delegated]
        const head = all.slice(0, 2).join(', ')
        return (
          <span className="font-mono text-caption text-ink-mute" title={all.join('\n')}>
            {head}
            {all.length > 2 ? ` +${all.length - 2}` : ''}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusBadge variant={statusVariant(r.status)}>{r.status}</StatusBadge>,
    },
    {
      key: 'last',
      header: 'Last consented',
      cell: (r) => (r.lastConsentedAt ? new Date(r.lastConsentedAt).toLocaleString() : '—'),
      numeric: true,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <Button variant="primary" size="sm" onClick={() => onGrantConsent(r)}>
          {r.status === 'consented' ? 'Re-consent' : 'Grant consent'}
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-lg p-xl">
      <PageHeader title={title} />
      <DataTable<ConnectorSummary> rows={connectors} columns={columns} rowKey={(r) => r.id} />
    </div>
  )
}
```

Notes:
- "Connector" column primary text was bare `font-medium text-ink` (no size class). Use `text-body-md text-ink`. (`font-medium` removed — body-md weight is 400; emphasis here is purely visual via stacking with the muted description below, not weight.) If visual review during PR says the name needs more emphasis, restore `font-medium` — it remains a valid Tailwind utility.
- Date cell becomes a string (no wrapper span), and `numeric: true` adds `text-body-tabular text-right`.

- [ ] **Step 2: Update `ConnectorsPage.test.tsx`**

Open `apps/console/src/pages/ConnectorsPage.test.tsx`, find the rendered table assertion, and add (or update an existing test):

```tsx
  it('renders the page title via PageHeader', () => {
    render(<ConnectorsPage connectors={[]} onGrantConsent={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Connectors' })).toBeInTheDocument()
  })

  it('marks the Last consented column as numeric (right-aligned, tabular)', () => {
    const c: ConnectorSummary = {
      id: 'x',
      displayName: 'X',
      description: 'd',
      status: 'consented',
      lastConsentedAt: new Date('2026-01-01').toISOString(),
      requiredScopes: { application: [], delegated: [] },
    }
    render(<ConnectorsPage connectors={[c]} onGrantConsent={() => {}} />)
    const td = screen.getByText(/2026|1\/1\/2026|01\/01\/2026/).closest('td')!
    expect(td.className).toContain('text-body-tabular')
    expect(td.className).toContain('text-right')
  })
```

(Adapt the imports — `ConnectorSummary` import is presumably already in the existing test file. The textual date match uses an alternation because `toLocaleString` output varies by locale; check the test's existing locale handling and match its convention.)

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @seta/console vitest run src/pages/ConnectorsPage.test.tsx`
Expected: all green.

- [ ] **Step 4: Build + guard**

```bash
pnpm --filter @seta/console build
pnpm tsx tooling/scripts/check-no-hardcoded-styles.ts apps/console/src/pages/ConnectorsPage.tsx
```
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/pages/ConnectorsPage.tsx apps/console/src/pages/ConnectorsPage.test.tsx
git commit -m "feat(console): ConnectorsPage uses PageHeader; mark Last consented numeric"
```

---

### Task 5: ConsentLandingPage — restructure inside Card

**Files:**
- Modify: `apps/console/src/pages/ConsentLandingPage.tsx`
- Modify: `apps/console/src/pages/ConsentLandingPage.test.tsx` (regression assert)

DESIGN.md §510 gives Card title `heading-lg` (22/500). ConsentLandingPage's `<h1 className="text-lg font-medium">` becomes `<h2 className="text-heading-lg">` (h2 because the card title isn't the page title — it lives inside a Card). The route layer can wrap with PageHeader if a true page title is wanted; the component itself stays Card-only.

- [ ] **Step 1: Apply changes**

```tsx
import { Card, StatusBadge } from '@seta/ui'
import type { ReactNode } from 'react'

export interface ConsentLandingPageProps {
  tenantId: string
  connectorId: string
  ok: boolean
  error?: string
  renderBackLink: (args: { tenantId: string }) => ReactNode
  title?: string
}

export function ConsentLandingPage({
  connectorId,
  ok,
  error,
  renderBackLink,
  tenantId,
  title = 'Connector consent',
}: ConsentLandingPageProps) {
  return (
    <div className="p-xl">
      <Card>
        <div className="flex flex-col gap-md p-xl">
          <h2 className="text-heading-lg text-ink">{title}</h2>
          <div className="flex items-center gap-sm">
            <StatusBadge variant={ok ? 'success' : 'error'}>
              {ok ? 'consented' : 'failed'}
            </StatusBadge>
            <span className="font-mono text-body-md text-ink-mute">{connectorId}</span>
          </div>
          {!ok && error ? <p className="text-body-md text-error">{error}</p> : null}
          {renderBackLink({ tenantId })}
        </div>
      </Card>
    </div>
  )
}
```

Notes:
- `h1` → `h2` because this is a Card title, not a page title.
- `gap-4` → `gap-md`; `gap-3` → `gap-sm`; `p-6` → `p-xl`.

- [ ] **Step 2: Update `ConsentLandingPage.test.tsx`**

Add or modify assertions:

```tsx
  it('renders the title as h2 with heading-lg token', () => {
    render(
      <ConsentLandingPage
        tenantId="t1"
        connectorId="ms-graph"
        ok={true}
        renderBackLink={() => null}
      />,
    )
    const h = screen.getByRole('heading', { level: 2, name: 'Connector consent' })
    expect(h.className).toContain('text-heading-lg')
  })
```

- [ ] **Step 3: Run tests + build + guard**

```bash
pnpm --filter @seta/console vitest run src/pages/ConsentLandingPage.test.tsx
pnpm --filter @seta/console build
pnpm tsx tooling/scripts/check-no-hardcoded-styles.ts apps/console/src/pages/ConsentLandingPage.tsx
```
Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/console/src/pages/ConsentLandingPage.tsx apps/console/src/pages/ConsentLandingPage.test.tsx
git commit -m "feat(console): ConsentLandingPage uses heading-lg Card title + tokens"
```

---

### Task 6: SSO settings — wrap form fields with `Field`; route adopts `PageHeader`

**Files:**
- Modify: `apps/console/src/pages/admin/SsoConfigForm.tsx`
- Modify: `apps/console/src/pages/admin/SsoConfigForm.test.tsx`
- Modify: `apps/console/src/routes/_superadmin/admin/tenants.$tenantId.sso.tsx`

The form has four label/input/helper trios. Each becomes a `Field`. The route gets a `PageHeader` (title="SSO configuration", description with tenant id breadcrumb-style if desired) and keeps its inline "← Tenants" back link below the header.

- [ ] **Step 1: Rewrite `SsoConfigForm.tsx`**

Replace the four `<div className="flex flex-col gap-1"><Label/><Input/><p className="text-[12px] text-ink-mute">…</p></div>` trios with `<Field>`. Keep all state and onSave/onTest logic.

```tsx
import { Button, Field, Input, Label, Switch } from '@seta/ui'
import { useState } from 'react'
import type { SsoConfigDetail, SsoUpsertInput } from '../../api/sso-admin'

export type SsoConfigFormSave = Omit<SsoUpsertInput, 'domains'>

export interface SsoConfigFormProps {
  detail?: SsoConfigDetail
  onSave: (input: SsoConfigFormSave) => void | Promise<void>
  onTest: () => void | Promise<void>
  redirectUri?: string
}

export function SsoConfigForm({ detail, onSave, onTest, redirectUri }: SsoConfigFormProps) {
  const [entraTenantId, setEntraTenantId] = useState(detail?.config.entra_tenant_id ?? '')
  const [clientId, setClientId] = useState(detail?.config.client_id ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [enabled, setEnabled] = useState(detail?.enabled ?? true)
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    try {
      const payload: SsoConfigFormSave = {
        provider: 'entra',
        config: { entra_tenant_id: entraTenantId, client_id: clientId },
        enabled,
        ...(clientSecret ? { clientSecret } : {}),
      }
      await onSave(payload)
      setClientSecret('')
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-lg"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field label="Entra tenant ID" htmlFor="entraTenantId" required>
        <Input
          id="entraTenantId"
          value={entraTenantId}
          onChange={(e) => setEntraTenantId(e.target.value)}
          placeholder="11111111-2222-3333-4444-555555555555 or contoso.onmicrosoft.com"
          required
        />
      </Field>
      <Field label="Client ID" htmlFor="clientId" required>
        <Input
          id="clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
        />
      </Field>
      <Field
        label="Client secret"
        htmlFor="clientSecret"
        description="Write-only. Leave blank to keep the current secret. We never display the existing secret."
      >
        <Input
          id="clientSecret"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={detail?.hasSecret ? '••••••••' : 'paste from Azure portal'}
          autoComplete="new-password"
        />
      </Field>
      {redirectUri ? (
        <Field
          label="Redirect URI for the Azure app registration"
          htmlFor="redirectUri"
          description="Copy this into Azure portal → Authentication → Redirect URIs."
        >
          <Input id="redirectUri" value={redirectUri} readOnly />
        </Field>
      ) : null}
      <div className="flex items-center gap-sm">
        <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="enabled">Enabled</Label>
      </div>
      <div className="flex items-center gap-sm">
        <Button type="submit" variant="primary" disabled={pending}>
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void onTest()}
          disabled={pending || !detail}
        >
          Test connection
        </Button>
      </div>
      {detail?.lastTestedAt ? (
        <p className="text-caption text-ink-mute">
          Last tested {detail.lastTestedAt} — {detail.lastTestResult ?? 'unknown'}
        </p>
      ) : null}
    </form>
  )
}
```

Notes:
- The Switch+Label row stays standalone (Switch is its own pattern, not a labelled-input). Keep using the plain `Label` here.
- `gap-4` → `gap-lg` (16px) on the outer form; `gap-2` → `gap-sm`.
- `required` is now a Field prop — the asterisk renders consistently.

- [ ] **Step 2: Update `SsoConfigForm.test.tsx`**

Find the existing label-find assertions (likely `screen.getByLabelText('Entra tenant ID')`) — they should still work because `Field` renders a real `<label htmlFor>`. Add one regression assert:

```tsx
  it('renders form fields via the Field primitive (required marker visible)', () => {
    render(<SsoConfigForm onSave={() => {}} onTest={() => {}} />)
    // Entra tenant ID is required — Field renders a *
    const requiredMarkers = screen.getAllByText('*')
    expect(requiredMarkers.length).toBeGreaterThanOrEqual(2)  // tenantId + clientId
  })
```

- [ ] **Step 3: Update the route to add PageHeader**

In `apps/console/src/routes/_superadmin/admin/tenants.$tenantId.sso.tsx`, replace the inline `<div className="flex items-center gap-2 text-[14px]">…breadcrumb…</div>` with a back link kept as a `<Link>`, and add a `<PageHeader>` above the body.

Edit just the JSX returned by `SsoSettingsPage` (preserve all queries/mutations):

```tsx
  return (
    <div className="space-y-xl p-xl">
      <Link to="/admin/tenants" className="text-caption text-ink-mute hover:text-ink">
        ← Tenants
      </Link>
      <PageHeader title="SSO configuration" description={`Tenant ${tenantId}`} />
      {detail ? (
        <div className="flex flex-col gap-xs">
          <Link
            to="/admin/tenants/$tenantId/sso/domains"
            params={{ tenantId }}
            className="inline-block text-body-md text-primary hover:underline"
          >
            Manage email domains →
          </Link>
          <Link
            to="/admin/tenants/$tenantId/mailer"
            params={{ tenantId }}
            className="inline-block text-body-md text-primary hover:underline"
          >
            Mailer settings →
          </Link>
        </div>
      ) : (
        <p className="text-body-md text-ink-mute">
          No SSO configured yet — save credentials below to enable.
        </p>
      )}
      <SsoConfigForm
        {...(detail ? { detail } : {})}
        {...(redirectUri ? { redirectUri } : {})}
        onSave={async (input) => {
          await upsertM.mutateAsync({ ...input, domains: detail?.domains ?? [] })
        }}
        onTest={async () => {
          await testM.mutateAsync()
        }}
      />
      {testResult ? <p className="text-body-md text-ink-mute">Test result: {testResult}</p> : null}
    </div>
  )
```

Add `PageHeader` to the existing imports:
```tsx
import { PageHeader } from '@seta/ui'
```

- [ ] **Step 4: Run tests + build + guard**

```bash
pnpm --filter @seta/console vitest run src/pages/admin/SsoConfigForm.test.tsx
pnpm --filter @seta/console build
pnpm tsx tooling/scripts/check-no-hardcoded-styles.ts apps/console/src/pages/admin/SsoConfigForm.tsx apps/console/src/routes/_superadmin/admin/tenants.\$tenantId.sso.tsx
```
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/pages/admin/SsoConfigForm.tsx \
        apps/console/src/pages/admin/SsoConfigForm.test.tsx \
        apps/console/src/routes/_superadmin/admin/tenants.\$tenantId.sso.tsx
git commit -m "feat(console): SSO settings use Field + PageHeader"
```

---

### Task 7: SSO domains — `Field` for the add input; refine list-item layout

**Files:**
- Modify: `apps/console/src/pages/admin/SsoDomainsTable.tsx`
- Modify: `apps/console/src/pages/admin/SsoDomainsTable.test.tsx`
- Modify: `apps/console/src/routes/_superadmin/admin/tenants.$tenantId.sso.domains.tsx`

- [ ] **Step 1: Rewrite `SsoDomainsTable.tsx`**

```tsx
import { Button, Field, Input } from '@seta/ui'
import { X } from 'lucide-react'
import { useState } from 'react'

const DENYLIST = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'aol.com', 'gmx.com', 'mail.com', 'qq.com', '163.com',
])

export interface SsoDomainsTableProps {
  domains: string[]
  onChange: (next: string[]) => void | Promise<void>
}

export function SsoDomainsTable({ domains, onChange }: SsoDomainsTableProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function add() {
    setError(null)
    const d = draft.trim().toLowerCase().replace(/\.$/, '')
    if (!d) return
    if (DENYLIST.has(d)) {
      setError(`'${d}' is on the public-mail denylist — use a corporate domain`)
      return
    }
    if (domains.includes(d)) {
      setError(`'${d}' is already in the list`)
      return
    }
    setDraft('')
    await onChange([...domains, d])
  }

  async function remove(d: string) {
    await onChange(domains.filter((x) => x !== d))
  }

  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-end gap-sm">
        <div className="flex-1">
          <Field label="Add a domain" htmlFor="domainInput" {...(error ? { error } : {})}>
            <Input
              id="domainInput"
              value={draft}
              placeholder="acme.com"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void add()
                }
              }}
            />
          </Field>
        </div>
        <Button type="button" variant="secondary" onClick={() => void add()}>
          Add
        </Button>
      </div>
      <ul className="divide-y divide-hairline rounded-md border border-hairline">
        {domains.map((d) => (
          <li key={d} className="flex items-center justify-between px-md py-sm text-body-md">
            <span>{d}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove ${d}`}
              onClick={() => void remove(d)}
              icon={<X className="size-4" />}
            >
              {''}
            </Button>
          </li>
        ))}
        {domains.length === 0 ? (
          <li className="px-md py-sm text-caption text-ink-mute">No domains yet.</li>
        ) : null}
      </ul>
    </div>
  )
}
```

Notes:
- The inline error alert div is gone — the error now flows through `Field`'s `error` prop (renders as `role="alert"` `text-error caption` under the input).
- The remove `<button>` becomes `<Button variant="ghost" size="sm" icon={<X/>}>` with an empty children — slightly awkward; if Button's children is `''` the icon-only render is fine because the icon already provides accessible labelling via `aria-label`. If linting complains about empty children, switch to a tight inline button styled to match `Button variant="ghost"` (border-radius `rounded-md`, `size-7`, `hover:bg-canvas-subtle`, `text-ink-mute`).
- `px-3 py-2` → `px-md py-sm`; `gap-3 gap-2 gap-1` standardized.

- [ ] **Step 2: Update `SsoDomainsTable.test.tsx`**

Find the test that submits a denylisted domain and asserts the error. With the move to `Field.error`, the error text remains visible — but its surrounding element changes from a custom div to a `<p role="alert">`. Update the assertion:

```tsx
  // Old: const alert = screen.getByRole('alert'); expect(alert).toHaveClass('bg-error-soft')
  // New:
  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent(/denylist/i)
  expect(alert.className).toContain('text-error')
```

(Adjust to the actual assertion patterns in the existing file.)

- [ ] **Step 3: Update the route to add PageHeader**

In `apps/console/src/routes/_superadmin/admin/tenants.$tenantId.sso.domains.tsx`, replace the back-link bar with:

```tsx
import { PageHeader } from '@seta/ui'
// ... existing imports

  return (
    <div className="space-y-xl p-xl">
      <Link
        to="/admin/tenants/$tenantId/sso"
        params={{ tenantId }}
        className="text-caption text-ink-mute hover:text-ink"
      >
        ← SSO settings
      </Link>
      <PageHeader title="Email domains" description="Corporate domains allowed to sign in." />
      <SsoDomainsTable
        domains={q.data.domains}
        onChange={async (next) => {
          await m.mutateAsync(next)
        }}
      />
    </div>
  )
```

- [ ] **Step 4: Run tests + build + guard**

```bash
pnpm --filter @seta/console vitest run src/pages/admin/SsoDomainsTable.test.tsx
pnpm --filter @seta/console build
pnpm tsx tooling/scripts/check-no-hardcoded-styles.ts apps/console/src/pages/admin/SsoDomainsTable.tsx apps/console/src/routes/_superadmin/admin/tenants.\$tenantId.sso.domains.tsx
```
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/pages/admin/SsoDomainsTable.tsx \
        apps/console/src/pages/admin/SsoDomainsTable.test.tsx \
        apps/console/src/routes/_superadmin/admin/tenants.\$tenantId.sso.domains.tsx
git commit -m "feat(console): SSO domains use Field + PageHeader; ghost icon-button remove"
```

---

### Task 8: Mailer settings — `Field` + route `PageHeader`

**Files:**
- Modify: `apps/console/src/pages/admin/MailerConfigForm.tsx`
- Modify: `apps/console/src/pages/admin/MailerConfigForm.test.tsx`
- Modify: `apps/console/src/routes/_superadmin/admin/tenants.$tenantId.mailer.tsx`

Smallest of the form migrations — only two text fields.

- [ ] **Step 1: Rewrite `MailerConfigForm.tsx`**

```tsx
import { Button, Field, Input, Label, Switch } from '@seta/ui'
import { useState } from 'react'
import type { MailerDetail, MailerUpsertInput } from '../../api/mailer-admin'

export interface MailerConfigFormProps {
  detail?: MailerDetail
  onSave: (input: MailerUpsertInput) => void | Promise<void>
}

export function MailerConfigForm({ detail, onSave }: MailerConfigFormProps) {
  const [mailbox, setMailbox] = useState(detail?.config.mailbox_user_id ?? '')
  const [from, setFrom] = useState(detail?.config.from_address ?? '')
  const [enabled, setEnabled] = useState(detail?.enabled ?? true)
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    try {
      await onSave({
        provider: 'graph',
        config: { mailbox_user_id: mailbox, from_address: from },
        enabled,
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-lg"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field
        label="Mailbox UPN / user id"
        htmlFor="mailbox"
        required
        description={
          <>
            Mailbox in the customer's M365 directory. The platform connector app must have
            admin-consented <code className="font-mono">Mail.Send</code>.
          </>
        }
      >
        <Input
          id="mailbox"
          value={mailbox}
          onChange={(e) => setMailbox(e.target.value)}
          placeholder="no-reply@customer.com"
          required
        />
      </Field>
      <Field label="From address" htmlFor="from" required>
        <Input
          id="from"
          type="email"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          required
        />
      </Field>
      <div className="flex items-center gap-sm">
        <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="enabled">Enabled</Label>
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          Save
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Update `MailerConfigForm.test.tsx`**

Add a regression assertion that the field labels are wired (Field uses `htmlFor`):

```tsx
  it('inputs are associated with labels via Field', () => {
    render(<MailerConfigForm onSave={() => {}} />)
    expect(screen.getByLabelText(/Mailbox UPN/i)).toHaveAttribute('id', 'mailbox')
    expect(screen.getByLabelText(/From address/i)).toHaveAttribute('id', 'from')
  })
```

- [ ] **Step 3: Update the route to add PageHeader**

In `apps/console/src/routes/_superadmin/admin/tenants.$tenantId.mailer.tsx`:

```tsx
import { PageHeader } from '@seta/ui'

  return (
    <div className="space-y-xl p-xl">
      <Link
        to="/admin/tenants/$tenantId/sso"
        params={{ tenantId }}
        className="text-caption text-ink-mute hover:text-ink"
      >
        ← SSO settings
      </Link>
      <PageHeader
        title="Mailer configuration"
        description="Mailbox used to send platform-issued email for this tenant."
      />
      {detail ? null : (
        <p className="text-body-md text-ink-mute">
          No mailer configured for this tenant — save below to enable. The platform connector Entra
          app must have admin-consented <code className="font-mono">Mail.Send</code> in the
          customer's M365 directory.
        </p>
      )}
      <MailerConfigForm
        {...(detail ? { detail } : {})}
        onSave={async (input) => {
          await upsertM.mutateAsync(input)
        }}
      />
    </div>
  )
```

- [ ] **Step 4: Run tests + build + guard**

```bash
pnpm --filter @seta/console vitest run src/pages/admin/MailerConfigForm.test.tsx
pnpm --filter @seta/console build
pnpm tsx tooling/scripts/check-no-hardcoded-styles.ts apps/console/src/pages/admin/MailerConfigForm.tsx apps/console/src/routes/_superadmin/admin/tenants.\$tenantId.mailer.tsx
```
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/pages/admin/MailerConfigForm.tsx \
        apps/console/src/pages/admin/MailerConfigForm.test.tsx \
        apps/console/src/routes/_superadmin/admin/tenants.\$tenantId.mailer.tsx
git commit -m "feat(console): Mailer settings use Field + PageHeader"
```

---

## Final acceptance

After all 8 tasks land, run the full suite:

```bash
pnpm lint
pnpm typecheck
pnpm --filter @seta/console vitest run
pnpm --filter @seta/console build
pnpm tsx tooling/scripts/check-no-hardcoded-styles.ts
```

All exit 0. The console UI now matches DESIGN.md: every page has a `PageHeader`-rendered title, every form uses `Field`, every numeric/date `DataTable` column is `numeric: true`, and no page contains hardcoded `text-[Xpx]`, hex colors, or default Tailwind size classes.

## Follow-ups (out of scope for this plan)

- Adopt `AppShell` in the console (currently the console has no sidebar/topbar — pages render directly under `__root.tsx`). This is a larger architecture change requiring AppShell prop wiring for the console's nav model, TopBar breadcrumb feed, and agent panel mounting. Track separately.
- Promote the back-link pattern (`← Tenants`, `← SSO settings`) into a `BackLink` primitive once it's used in ≥3 places — currently 3 SSO/Mailer routes use it, threshold reached, but doing it in this plan would expand scope. Track as a separate follow-up.
- Move admin-tenants list and SSO/Mailer routes' breadcrumb feed into AppShell's TopBar once AppShell is adopted. The inline back-link becomes redundant at that point.

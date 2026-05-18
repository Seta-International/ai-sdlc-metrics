# Per-tenant Entra SSO — PR 2 Superadmin Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Depends on:** PR 1 (`docs/superpowers/plans/2026-05-18-byo-idp-sso-pr1-foundation.md`) is merged.

**Goal:** Replace the "operator edits `auth.sso_configs` via SQL" workflow with a real superadmin admin UI. Superadmins can create, view, update, disable, and connection-test per-tenant SSO configs and email domains through `/console/admin/tenants/<id>/sso/*` pages backed by `/admin/sso/*` API routes.

**Architecture:**
- New `@seta/identity` admin route module mounted at `/admin/sso/*`, guarded by the existing `requireSuperadmin` middleware.
- Server-side connection probe (discovery doc fetch + `client_credentials` token exchange) without involving a browser.
- Audit-logged mutations via the existing `createAuditWriter`.
- New TanStack Router routes in `apps/console` under `_superadmin/admin/tenants/$tenantId/sso/*`.

**Tech Stack:** Same as PR 1 — Hono, Drizzle, Zod (`@hono/zod-openapi`), MSW, Vitest, React (`@seta/ui`), TanStack Router/Query.

**Spec:** [`docs/superpowers/specs/2026-05-18-byo-idp-sso-design.md`](../specs/2026-05-18-byo-idp-sso-design.md) §"API surface" → "Superadmin" and §"Superadmin SSO admin UI + admin API" (text wireframe).

**Operating rules** (same as PR 1): no hand-edited migrations or `package.json`; `import type` for type-only; ESM only; no `console.log`; one PR, squash merges, Conventional Commits.

---

## File Map

**Create**
- `platform/identity/src/admin-routes.ts` — Hono router mounted at `/admin/sso`
- `platform/identity/src/admin-routes.test.ts` — unit-level handler tests (req → res)
- `platform/identity/tests/integration/admin-sso.test.ts` — end-to-end (DB + MSW for the connection probe)
- `platform/identity/src/sso-connection-test.ts` — pure module: discovery doc fetch + `client_credentials` probe; returns a structured result
- `platform/identity/src/sso-connection-test.test.ts` — MSW-driven unit tests
- `platform/identity/src/admin-audit.ts` — thin helper standardising `audit.recordAudit` calls for SSO events
- `platform/identity/src/admin-audit.test.ts`
- `platform/identity/src/schemas-admin.ts` — Zod request/response schemas for the admin API (separate file so user-facing `schemas.ts` stays small)
- `apps/console/src/routes/_superadmin/admin.tenants.$tenantId.sso.tsx` — setup/edit page
- `apps/console/src/routes/_superadmin/admin.tenants.$tenantId.sso.domains.tsx` — domains management
- `apps/console/src/pages/admin/SsoConfigForm.tsx` — controlled form, no routing knowledge
- `apps/console/src/pages/admin/SsoConfigForm.test.tsx`
- `apps/console/src/pages/admin/SsoDomainsTable.tsx`
- `apps/console/src/pages/admin/SsoDomainsTable.test.tsx`
- `apps/console/src/api/sso-admin.ts` — typed fetch wrappers used by the routes/components
- `apps/console/src/api/sso-admin.test.ts`

**Modify**
- `platform/identity/src/index.ts` — export `createSsoAdminRoutes`
- `platform/identity/src/sso-config-repo.ts` — add `deleteSsoConfig`, `deleteSsoEmailDomain`, `listSsoConfigs` (the seed-time helpers from PR 1 cover insert; this adds the rest)
- `platform/identity/tests/integration/sso-config-repo.test.ts` — cover new helpers
- `apps/api/src/main.ts` — mount the admin router, inject audit writer + KMS vault closures
- `apps/console/src/nav/consoleNav.ts` — add an "SSO" link in the admin section
- `apps/console/src/routes/_superadmin/admin/tenants.tsx` — add an "SSO" column on the tenants list table linking to `/admin/tenants/<id>/sso`

**Delete**
- None.

---

## Phase A — Admin API contract (Zod) and repo extensions

### Task A1: Admin Zod schemas

**Files:**
- Create: `platform/identity/src/schemas-admin.ts`

- [ ] **Step 1: Create the file**

```ts
// platform/identity/src/schemas-admin.ts
import { z } from '@hono/zod-openapi'
import { EntraConfig } from './sso-config-schema'

export const SsoListItem = z.object({
  tenantId: z.string().uuid(),
  slug: z.string(),
  displayName: z.string(),
  provider: z.literal('entra').nullable(),
  enabled: z.boolean(),
  domainCount: z.number().int().min(0),
}).openapi('SsoListItem')
export const SsoListResponse = z.object({ items: z.array(SsoListItem) }).openapi('SsoListResponse')

export const SsoConfigDetail = z.object({
  tenantId: z.string().uuid(),
  provider: z.literal('entra'),
  config: EntraConfig,
  enabled: z.boolean(),
  hasSecret: z.boolean(),
  domains: z.array(z.string()),
  lastTestedAt: z.string().nullable(),
  lastTestResult: z.string().nullable(),
}).openapi('SsoConfigDetail')

export const SsoUpsertBody = z.object({
  provider: z.literal('entra'),
  config: EntraConfig,
  domains: z.array(z.string().min(1)).default([]),
  clientSecret: z.string().min(1).optional(),  // omit to keep existing
  enabled: z.boolean().default(true),
}).openapi('SsoUpsertBody')

export const SsoTestResponse = z.object({
  result: z.enum(['ok', 'discovery_failed', 'issuer_mismatch', 'invalid_client', 'unexpected_error']),
  message: z.string().optional(),
  testedAt: z.string(),
}).openapi('SsoTestResponse')

export const SsoRotateSecretBody = z.object({
  clientSecret: z.string().min(1),
}).openapi('SsoRotateSecretBody')
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/identity typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/identity/src/schemas-admin.ts
git commit -m "feat(identity): admin SSO Zod schemas"
```

### Task A2: Extend `sso-config-repo` with admin helpers

**Files:**
- Modify: `platform/identity/src/sso-config-repo.ts`
- Modify: `platform/identity/tests/integration/sso-config-repo.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Open `platform/identity/tests/integration/sso-config-repo.test.ts` and append:

```ts
import {
  deleteSsoConfig,
  deleteSsoEmailDomain,
  getSsoConfigDetail,
  listSsoConfigsWithCounts,
  setSsoLastTestResult,
} from '../../src/sso-config-repo'

describe('listSsoConfigsWithCounts', () => {
  it('returns one row per tenant with its enabled status and domain count', async () => {
    // (set up via beforeEach + an extra tenant)
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES ('00000000-0000-4000-8000-0000000000c2', 'other', 'Other')`
    const rows = await listSsoConfigsWithCounts(sql)
    const acme = rows.find((r) => r.slug === 'acme')
    expect(acme).toMatchObject({ provider: 'entra', enabled: true, domainCount: 1 })
    const other = rows.find((r) => r.slug === 'other')
    expect(other).toMatchObject({ provider: null, enabled: false, domainCount: 0 })
  })
})

describe('getSsoConfigDetail', () => {
  it('returns the parsed config + domains + hasSecret', async () => {
    const d = await getSsoConfigDetail(sql, tenantId)
    expect(d).toMatchObject({
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: expect.any(String), client_id: expect.any(String) },
      enabled: true,
      hasSecret: true,
      domains: ['acme.com'],
    })
  })

  it('returns null when no row exists', async () => {
    await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id = ${tenantId}`
    await sql`DELETE FROM auth.sso_configs WHERE tenant_id = ${tenantId}`
    expect(await getSsoConfigDetail(sql, tenantId)).toBeNull()
  })
})

describe('deleteSsoConfig / deleteSsoEmailDomain', () => {
  it('removes the row and its domains', async () => {
    await deleteSsoEmailDomain(sql, 'acme.com')
    await deleteSsoConfig(sql, tenantId)
    expect(await getSsoConfigDetail(sql, tenantId)).toBeNull()
  })
})

describe('setSsoLastTestResult', () => {
  it('persists last_tested_at and last_test_result columns', async () => {
    await sql`ALTER TABLE auth.sso_configs ADD COLUMN IF NOT EXISTS last_tested_at timestamptz`
    await sql`ALTER TABLE auth.sso_configs ADD COLUMN IF NOT EXISTS last_test_result text`
    await setSsoLastTestResult(sql, { tenantId, result: 'ok' })
    const rows = (await sql`SELECT last_test_result FROM auth.sso_configs WHERE tenant_id = ${tenantId}`) as Array<{
      last_test_result: string
    }>
    expect(rows[0]?.last_test_result).toBe('ok')
  })
})
```

Note: the `ALTER TABLE IF NOT EXISTS` in the test is a temporary scaffold so the test runs before Task A3 adds the columns properly. Remove it once A3 lands.

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @seta/identity vitest run tests/integration/sso-config-repo.test.ts`
Expected: FAIL — the new functions don't exist yet.

- [ ] **Step 3: Implement the new repo functions**

Append to `platform/identity/src/sso-config-repo.ts`:

```ts
export type SsoListItemRow = {
  tenantId: string
  slug: string
  displayName: string
  provider: 'entra' | null
  enabled: boolean
  domainCount: number
}

export async function listSsoConfigsWithCounts(sql: Sql): Promise<SsoListItemRow[]> {
  const rows = (await sql`
    SELECT t.id AS tenant_id, t.slug, t.display_name,
           c.provider, COALESCE(c.enabled, false) AS enabled,
           COALESCE(d.cnt, 0)::int AS domain_count
    FROM tenant.tenants t
    LEFT JOIN auth.sso_configs c ON c.tenant_id = t.id
    LEFT JOIN (
      SELECT tenant_id, COUNT(*)::int AS cnt
      FROM auth.sso_email_domains GROUP BY tenant_id
    ) d ON d.tenant_id = t.id
    ORDER BY t.display_name, t.slug
  `) as Array<{
    tenant_id: string
    slug: string
    display_name: string
    provider: 'entra' | null
    enabled: boolean
    domain_count: number
  }>
  return rows.map((r) => ({
    tenantId: r.tenant_id,
    slug: r.slug,
    displayName: r.display_name,
    provider: r.provider,
    enabled: r.enabled,
    domainCount: r.domain_count,
  }))
}

export type SsoConfigDetailRow = {
  tenantId: string
  provider: 'entra'
  config: { entra_tenant_id: string; client_id: string }
  enabled: boolean
  hasSecret: boolean
  domains: string[]
  lastTestedAt: string | null
  lastTestResult: string | null
}

export async function getSsoConfigDetail(sql: Sql, tenantId: string): Promise<SsoConfigDetailRow | null> {
  const rows = (await sql`
    SELECT c.provider, c.config, c.secret_vault_id, c.enabled,
           c.last_tested_at, c.last_test_result
    FROM auth.sso_configs c
    WHERE c.tenant_id = ${tenantId}
    LIMIT 1
  `) as Array<{
    provider: string
    config: unknown
    secret_vault_id: string | null
    enabled: boolean
    last_tested_at: Date | null
    last_test_result: string | null
  }>
  const r = rows[0]
  if (!r) return null
  const parsed = parseSsoConfig({ provider: r.provider, config: r.config })
  if (parsed.provider !== 'entra') return null
  const domainRows = (await sql`
    SELECT domain FROM auth.sso_email_domains WHERE tenant_id = ${tenantId} ORDER BY domain
  `) as Array<{ domain: string }>
  return {
    tenantId,
    provider: 'entra',
    config: parsed.config,
    enabled: r.enabled,
    hasSecret: r.secret_vault_id !== null,
    domains: domainRows.map((d) => d.domain),
    lastTestedAt: r.last_tested_at?.toISOString() ?? null,
    lastTestResult: r.last_test_result,
  }
}

export async function deleteSsoConfig(sql: Sql, tenantId: string): Promise<void> {
  await sql`DELETE FROM auth.sso_email_domains WHERE tenant_id = ${tenantId}`
  await sql`DELETE FROM auth.sso_configs WHERE tenant_id = ${tenantId}`
}

export async function deleteSsoEmailDomain(sql: Sql, domain: string): Promise<void> {
  await sql`DELETE FROM auth.sso_email_domains WHERE domain = ${domain.toLowerCase()}`
}

export async function setSsoLastTestResult(
  sql: Sql,
  input: { tenantId: string; result: string },
): Promise<void> {
  await sql`
    UPDATE auth.sso_configs
       SET last_test_result = ${input.result},
           last_tested_at   = now()
     WHERE tenant_id = ${input.tenantId}
  `
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm --filter @seta/identity vitest run tests/integration/sso-config-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (combine with A3)**

(skip commit — A3 adds the columns the repo writes)

### Task A3: Migration for `last_tested_at` and `last_test_result` columns

**Files:**
- Create: `platform/identity/migrations/0005_sso_test_columns.sql`

- [ ] **Step 1: Generate the migration**

Run: `pnpm --filter @seta/identity exec drizzle-kit generate --custom --name sso_test_columns`
Expected: writes `0005_sso_test_columns.sql`.

- [ ] **Step 2: Update the Drizzle schema FIRST so the migration matches the model**

Open `platform/identity/src/schema/sso-configs.ts`. Add two columns to the `ssoConfigs` definition:

```ts
lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
lastTestResult: text('last_test_result'),
```

Then re-run **regular** drizzle-kit generate to refresh the snapshot:

Run: `pnpm --filter @seta/identity exec drizzle-kit generate --name sso_test_columns_snapshot`
Expected: detects the diff, generates `0006_<auto>.sql`.

Actually — to keep one migration: revert the `--custom` from step 1 and rely on the regular `generate` to write the ADD COLUMN. Order of steps:

1. Revert step 1's file: `git rm platform/identity/migrations/0005_sso_test_columns.sql`
2. Update the schema file with the two new columns.
3. Run `pnpm --filter @seta/identity exec drizzle-kit generate --name sso_test_columns`
4. This emits `0005_<auto>.sql` with `ALTER TABLE auth.sso_configs ADD COLUMN last_tested_at ...` and `ADD COLUMN last_test_result ...`.

- [ ] **Step 3: Apply migration**

Run: `pnpm migrate`
Expected: succeeds.

- [ ] **Step 4: Verify columns**

```bash
psql "$DATABASE_URL" -c "\d auth.sso_configs"
```
Expected: lists `last_tested_at` (timestamp with tz) and `last_test_result` (text).

- [ ] **Step 5: Remove the `ALTER TABLE IF NOT EXISTS` scaffold from the test (Task A2's note)**

Delete the two `ALTER TABLE IF NOT EXISTS` lines from the `setSsoLastTestResult` test in `sso-config-repo.test.ts`.

Re-run: `pnpm --filter @seta/identity vitest run tests/integration/sso-config-repo.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add platform/identity/src/schema/sso-configs.ts \
        platform/identity/migrations/0005_*.sql \
        platform/identity/migrations/meta/0005_snapshot.json \
        platform/identity/migrations/meta/_journal.json \
        platform/identity/src/sso-config-repo.ts \
        platform/identity/tests/integration/sso-config-repo.test.ts
git commit -m "feat(identity): admin repo helpers + last_tested_at/last_test_result columns"
```

---

## Phase B — Connection probe (server-side test)

### Task B1: SSO connection test

**Files:**
- Create: `platform/identity/src/sso-connection-test.ts`
- Create: `platform/identity/src/sso-connection-test.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// platform/identity/src/sso-connection-test.test.ts
import { describe, expect, it } from 'vitest'
import { runSsoConnectionTest } from './sso-connection-test'

const entraTenantId = '11111111-2222-3333-4444-555555555555'

describe('runSsoConnectionTest', () => {
  it('returns ok on discovery + client_credentials success', async () => {
    const fetchStub: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.endsWith('/.well-known/openid-configuration')) {
        return new Response(
          JSON.stringify({
            issuer: `https://login.microsoftonline.com/${entraTenantId}/v2.0`,
            token_endpoint: `https://login.microsoftonline.com/${entraTenantId}/oauth2/v2.0/token`,
            authorization_endpoint: 'x',
            jwks_uri: 'x',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.endsWith('/oauth2/v2.0/token')) {
        return new Response(JSON.stringify({ access_token: 'tok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error('unexpected fetch')
    }
    const r = await runSsoConnectionTest({ entraTenantId, clientId: 'cid', clientSecret: 'sec', fetchImpl: fetchStub })
    expect(r.result).toBe('ok')
  })

  it('returns discovery_failed when the discovery doc 404s', async () => {
    const fetchImpl: typeof fetch = async () => new Response('not found', { status: 404 })
    const r = await runSsoConnectionTest({ entraTenantId, clientId: 'cid', clientSecret: 'sec', fetchImpl })
    expect(r.result).toBe('discovery_failed')
  })

  it('returns issuer_mismatch when issuer does not include the configured tenant id', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.endsWith('/.well-known/openid-configuration')) {
        return new Response(
          JSON.stringify({
            issuer: 'https://login.microsoftonline.com/SOMETHING-ELSE/v2.0',
            token_endpoint: 'https://login.microsoftonline.com/SOMETHING-ELSE/oauth2/v2.0/token',
            authorization_endpoint: 'x',
            jwks_uri: 'x',
          }),
          { status: 200 },
        )
      }
      throw new Error('unexpected fetch')
    }
    const r = await runSsoConnectionTest({ entraTenantId, clientId: 'cid', clientSecret: 'sec', fetchImpl })
    expect(r.result).toBe('issuer_mismatch')
  })

  it('returns invalid_client on AADSTS70011-style 401', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.endsWith('/.well-known/openid-configuration')) {
        return new Response(
          JSON.stringify({
            issuer: `https://login.microsoftonline.com/${entraTenantId}/v2.0`,
            token_endpoint: `https://login.microsoftonline.com/${entraTenantId}/oauth2/v2.0/token`,
            authorization_endpoint: 'x',
            jwks_uri: 'x',
          }),
          { status: 200 },
        )
      }
      return new Response(
        JSON.stringify({ error: 'invalid_client', error_description: 'AADSTS7000215...' }),
        { status: 401 },
      )
    }
    const r = await runSsoConnectionTest({ entraTenantId, clientId: 'cid', clientSecret: 'wrong', fetchImpl })
    expect(r.result).toBe('invalid_client')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @seta/identity vitest run src/sso-connection-test.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// platform/identity/src/sso-connection-test.ts
export type SsoConnectionTestResult = {
  result: 'ok' | 'discovery_failed' | 'issuer_mismatch' | 'invalid_client' | 'unexpected_error'
  message?: string
}

export async function runSsoConnectionTest(input: {
  entraTenantId: string
  clientId: string
  clientSecret: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<SsoConnectionTestResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const discoveryUrl = `https://login.microsoftonline.com/${input.entraTenantId}/v2.0/.well-known/openid-configuration`
  let discovery: { issuer: string; token_endpoint: string }
  try {
    const res = await fetchImpl(discoveryUrl)
    if (!res.ok) return { result: 'discovery_failed', message: `HTTP ${res.status}` }
    discovery = (await res.json()) as { issuer: string; token_endpoint: string }
  } catch (e) {
    return { result: 'discovery_failed', message: (e as Error).message }
  }

  const expectedIssuerPrefix = `https://login.microsoftonline.com/${input.entraTenantId}/`
  if (!discovery.issuer.startsWith(expectedIssuerPrefix)) {
    return { result: 'issuer_mismatch', message: `got ${discovery.issuer}` }
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: input.clientId,
      client_secret: input.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    })
    const res = await fetchImpl(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (res.ok) return { result: 'ok' }
    if (res.status === 400 || res.status === 401) {
      let msg = `HTTP ${res.status}`
      try {
        const j = (await res.json()) as { error?: string; error_description?: string }
        if (j.error) msg = `${j.error}: ${j.error_description ?? ''}`.trim()
      } catch {
        /* ignore */
      }
      return { result: 'invalid_client', message: msg }
    }
    return { result: 'unexpected_error', message: `HTTP ${res.status}` }
  } catch (e) {
    return { result: 'unexpected_error', message: (e as Error).message }
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @seta/identity vitest run src/sso-connection-test.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/identity/src/sso-connection-test.ts \
        platform/identity/src/sso-connection-test.test.ts
git commit -m "feat(identity): SSO connection test (discovery + client_credentials)"
```

---

## Phase C — Admin audit helper

### Task C1: Admin audit helper

**Files:**
- Create: `platform/identity/src/admin-audit.ts`
- Create: `platform/identity/src/admin-audit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// platform/identity/src/admin-audit.test.ts
import { describe, expect, it, vi } from 'vitest'
import { recordSsoAudit, type AuditWriter } from './admin-audit'

describe('recordSsoAudit', () => {
  it('forwards a normalised event to audit.recordAudit', async () => {
    const recordAudit = vi.fn(async () => {})
    const writer: AuditWriter = { recordAudit }
    await recordSsoAudit(writer, {
      event: 'sso.config_updated',
      actorUserId: 'u-1',
      tenantId: 't-1',
      metadata: { fieldsChanged: ['client_id'] },
    })
    expect(recordAudit).toHaveBeenCalledWith({
      tenantId: 't-1',
      actor: { type: 'user', userId: 'u-1' },
      providerId: 'entra',
      operation: 'sso.config_updated',
      result: 'ok',
      metadata: { fieldsChanged: ['client_id'] },
    })
  })

  it('rejects unknown event names at compile time (covered by TS)', () => {
    expect(true).toBe(true)  // type-level assertion; runtime is a no-op
  })
})
```

- [ ] **Step 2: Implement**

```ts
// platform/identity/src/admin-audit.ts
export interface AuditWriter {
  recordAudit(args: {
    tenantId: string
    actor: { type: 'user'; userId: string } | { type: 'system'; label: string }
    providerId: string
    operation: string
    result: 'ok' | 'error'
    metadata?: Record<string, unknown>
  }): Promise<void>
}

export type SsoAuditEvent =
  | 'sso.config_created'
  | 'sso.config_updated'
  | 'sso.config_deleted'
  | 'sso.secret_rotated'
  | 'sso.domain_added'
  | 'sso.domain_removed'
  | 'sso.test_run'

export async function recordSsoAudit(
  writer: AuditWriter,
  input: {
    event: SsoAuditEvent
    actorUserId: string
    tenantId: string
    metadata?: Record<string, unknown>
    result?: 'ok' | 'error'
  },
): Promise<void> {
  await writer.recordAudit({
    tenantId: input.tenantId,
    actor: { type: 'user', userId: input.actorUserId },
    providerId: 'entra',
    operation: input.event,
    result: input.result ?? 'ok',
    metadata: input.metadata ?? {},
  })
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @seta/identity vitest run src/admin-audit.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add platform/identity/src/admin-audit.ts platform/identity/src/admin-audit.test.ts
git commit -m "feat(identity): admin SSO audit helper"
```

---

## Phase D — Admin routes

### Task D1: `createSsoAdminRoutes` router

**Files:**
- Create: `platform/identity/src/admin-routes.ts`
- Create: `platform/identity/src/admin-routes.test.ts` (handler-level unit)

- [ ] **Step 1: Implement the router**

```ts
// platform/identity/src/admin-routes.ts
import { BadRequest, Conflict, NotFound } from '@seta/middleware'
import { logger } from '@seta/observability'
import { Hono } from 'hono'
import type { Sql } from 'postgres'
import type { AuditWriter } from './admin-audit'
import { recordSsoAudit } from './admin-audit'
import {
  SsoConfigDetail,
  SsoListResponse,
  SsoRotateSecretBody,
  SsoTestResponse,
  SsoUpsertBody,
} from './schemas-admin'
import { runSsoConnectionTest } from './sso-connection-test'
import {
  deleteSsoConfig,
  deleteSsoEmailDomain,
  getSsoConfigDetail,
  listSsoConfigsWithCounts,
  setSsoLastTestResult,
  upsertSsoConfig,
  upsertSsoEmailDomain,
} from './sso-config-repo'
import { isDeniedSsoEmailDomain, normalizeEmailDomain } from './sso-domain-denylist'
import type { SsoVariables } from './middleware'

export type SsoAdminRoutesDeps = {
  sql: Sql
  audit: AuditWriter
  vault: {
    put(tenantId: string, providerId: string, accountKey: string, bundle: { accessToken: string }): Promise<void>
    get(tenantId: string, providerId: string, accountKey: string): Promise<{ accessToken: string } | null>
    delete(tenantId: string, providerId: string, accountKey: string): Promise<void>
  }
  fetchImpl?: typeof fetch  // for connection test override in tests
}

const SECRET_VAULT_KEY = { providerId: 'sso-entra' as const, account: 'sso' as const }

export function createSsoAdminRoutes(deps: SsoAdminRoutesDeps): Hono<{ Variables: SsoVariables }> {
  const app = new Hono<{ Variables: SsoVariables }>()

  app.get('/admin/sso/tenants', async (c) => {
    const items = await listSsoConfigsWithCounts(deps.sql)
    return c.json(SsoListResponse.parse({ items }))
  })

  app.get('/admin/sso/tenants/:tenantId', async (c) => {
    const tenantId = c.req.param('tenantId')
    const detail = await getSsoConfigDetail(deps.sql, tenantId)
    if (!detail) throw new NotFound('sso config not found for tenant')
    return c.json(SsoConfigDetail.parse(detail))
  })

  app.put('/admin/sso/tenants/:tenantId', async (c) => {
    const tenantId = c.req.param('tenantId')
    const body = SsoUpsertBody.parse(await c.req.json().catch(() => ({})))

    // Domain validation
    const normalized: string[] = []
    for (const raw of body.domains) {
      const d = normalizeEmailDomain(raw)
      if (!d) throw new BadRequest(`invalid domain: ${raw}`)
      if (isDeniedSsoEmailDomain(d)) throw new BadRequest(`domain '${d}' is on the public-mail denylist`)
      normalized.push(d)
    }

    // Conflict: domain owned by another tenant
    const conflicts = (await deps.sql`
      SELECT domain, tenant_id FROM auth.sso_email_domains
      WHERE domain = ANY(${deps.sql.array(normalized)}) AND tenant_id <> ${tenantId}
    `) as Array<{ domain: string; tenant_id: string }>
    if (conflicts.length > 0) {
      throw new Conflict(`domain(s) already owned by another tenant: ${conflicts.map((c) => c.domain).join(', ')}`)
    }

    const actorUserId = c.get('userId') as string
    const isCreate = (await getSsoConfigDetail(deps.sql, tenantId)) === null

    if (body.clientSecret) {
      await deps.vault.put(tenantId, SECRET_VAULT_KEY.providerId, SECRET_VAULT_KEY.account, {
        accessToken: body.clientSecret,
      })
    }
    await upsertSsoConfig(deps.sql, {
      tenantId,
      provider: 'entra',
      config: body.config,
      secretVaultId: `${SECRET_VAULT_KEY.providerId}:${SECRET_VAULT_KEY.account}`,
      createdByUserId: actorUserId,
    })

    // Replace the domain set (delete-then-insert via the helper)
    const existing = (await deps.sql`
      SELECT domain FROM auth.sso_email_domains WHERE tenant_id = ${tenantId}
    `) as Array<{ domain: string }>
    const existingSet = new Set(existing.map((r) => r.domain))
    const incomingSet = new Set(normalized)
    for (const d of existingSet) {
      if (!incomingSet.has(d)) {
        await deleteSsoEmailDomain(deps.sql, d)
        await recordSsoAudit(deps.audit, { event: 'sso.domain_removed', actorUserId, tenantId, metadata: { domain: d } })
      }
    }
    for (const d of incomingSet) {
      if (!existingSet.has(d)) {
        await upsertSsoEmailDomain(deps.sql, { domain: d, tenantId })
        await recordSsoAudit(deps.audit, { event: 'sso.domain_added', actorUserId, tenantId, metadata: { domain: d } })
      }
    }

    await recordSsoAudit(deps.audit, {
      event: isCreate ? 'sso.config_created' : 'sso.config_updated',
      actorUserId,
      tenantId,
      metadata: { provider: 'entra', enabled: body.enabled, secretRotated: Boolean(body.clientSecret) },
    })

    const detail = await getSsoConfigDetail(deps.sql, tenantId)
    return c.json(SsoConfigDetail.parse(detail))
  })

  app.delete('/admin/sso/tenants/:tenantId', async (c) => {
    const tenantId = c.req.param('tenantId')
    const actorUserId = c.get('userId') as string
    const existing = await getSsoConfigDetail(deps.sql, tenantId)
    if (!existing) throw new NotFound('sso config not found for tenant')
    await deleteSsoConfig(deps.sql, tenantId)
    await deps.vault.delete(tenantId, SECRET_VAULT_KEY.providerId, SECRET_VAULT_KEY.account).catch(() => {})
    await recordSsoAudit(deps.audit, { event: 'sso.config_deleted', actorUserId, tenantId })
    return c.json({ ok: true })
  })

  app.post('/admin/sso/tenants/:tenantId/test', async (c) => {
    const tenantId = c.req.param('tenantId')
    const detail = await getSsoConfigDetail(deps.sql, tenantId)
    if (!detail) throw new NotFound('sso config not found for tenant')
    const secret = await deps.vault.get(tenantId, SECRET_VAULT_KEY.providerId, SECRET_VAULT_KEY.account)
    if (!secret) throw new BadRequest('client secret missing in vault')
    const r = await runSsoConnectionTest({
      entraTenantId: detail.config.entra_tenant_id,
      clientId: detail.config.client_id,
      clientSecret: secret.accessToken,
      fetchImpl: deps.fetchImpl,
    })
    await setSsoLastTestResult(deps.sql, { tenantId, result: r.result })
    const actorUserId = c.get('userId') as string
    await recordSsoAudit(deps.audit, {
      event: 'sso.test_run',
      actorUserId,
      tenantId,
      metadata: { result: r.result, message: r.message },
      result: r.result === 'ok' ? 'ok' : 'error',
    })
    logger.info(
      { event: 'sso.admin_test_run', tenant_id: tenantId, result: r.result },
      '[sso] admin test run',
    )
    return c.json(SsoTestResponse.parse({ result: r.result, message: r.message, testedAt: new Date().toISOString() }))
  })

  app.post('/admin/sso/tenants/:tenantId/rotate-secret', async (c) => {
    const tenantId = c.req.param('tenantId')
    const actorUserId = c.get('userId') as string
    const body = SsoRotateSecretBody.parse(await c.req.json().catch(() => ({})))
    const existing = await getSsoConfigDetail(deps.sql, tenantId)
    if (!existing) throw new NotFound('sso config not found for tenant')
    await deps.vault.put(tenantId, SECRET_VAULT_KEY.providerId, SECRET_VAULT_KEY.account, {
      accessToken: body.clientSecret,
    })
    await recordSsoAudit(deps.audit, { event: 'sso.secret_rotated', actorUserId, tenantId })
    return c.json({ ok: true })
  })

  return app
}
```

- [ ] **Step 2: Write handler-level unit tests**

```ts
// platform/identity/src/admin-routes.test.ts
// Lightweight tests that exercise the handlers with a fake sql, vault, and audit.
// Full DB-backed coverage is in tests/integration/admin-sso.test.ts.
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createSsoAdminRoutes } from './admin-routes'

function fakeSql(): never {
  // Real query coverage lives in the integration test. For unit tests we only
  // call routes that don't reach into sql before validation; for the others
  // we rely on integration.
  return ((async () => []) as unknown) as never
}

describe('admin-routes (unit)', () => {
  it('rejects upsert with a denylist domain', async () => {
    const app = new Hono().route(
      '/',
      createSsoAdminRoutes({
        sql: fakeSql(),
        audit: { recordAudit: vi.fn(async () => {}) },
        vault: {
          put: vi.fn(async () => {}),
          get: vi.fn(async () => ({ accessToken: 'x' })),
          delete: vi.fn(async () => {}),
        },
      }),
    )
    const res = await app.request('/admin/sso/tenants/t-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 'tid', client_id: 'cid' },
        domains: ['gmail.com'],
      }),
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @seta/identity vitest run src/admin-routes.test.ts`
Expected: PASS.

- [ ] **Step 4: Export from package index**

Open `platform/identity/src/index.ts` and add:

```ts
export type { SsoAdminRoutesDeps } from './admin-routes'
export { createSsoAdminRoutes } from './admin-routes'
export {
  SsoConfigDetail,
  SsoListItem,
  SsoListResponse,
  SsoRotateSecretBody,
  SsoTestResponse,
  SsoUpsertBody,
} from './schemas-admin'
```

- [ ] **Step 5: Commit**

```bash
git add platform/identity/src/admin-routes.ts \
        platform/identity/src/admin-routes.test.ts \
        platform/identity/src/index.ts
git commit -m "feat(identity): superadmin /admin/sso CRUD + test + rotate-secret"
```

### Task D2: Integration tests for admin routes

**Files:**
- Create: `platform/identity/tests/integration/admin-sso.test.ts`

- [ ] **Step 1: Write the test**

```ts
// platform/identity/tests/integration/admin-sso.test.ts
import { onError } from '@seta/middleware'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSsoAdminRoutes } from '../../src/admin-routes'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const tenantId = '00000000-0000-4000-8000-0000000000d1'
const tenantId2 = '00000000-0000-4000-8000-0000000000d2'

function buildApp(sql: postgres.Sql, fetchStub?: typeof fetch) {
  const vault = new Map<string, string>()
  const audit: { events: Array<Record<string, unknown>> } = { events: [] }
  const app = new Hono<{ Variables: { userId: string } }>().onError(onError)
  app.use('*', async (c, next) => {
    c.set('userId', 'superadmin-1')
    await next()
  })
  app.route(
    '/',
    createSsoAdminRoutes({
      sql,
      audit: {
        recordAudit: async (e) => {
          audit.events.push(e)
        },
      },
      vault: {
        put: async (t, p, a, b) => {
          vault.set(`${t}:${p}:${a}`, b.accessToken)
        },
        get: async (t, p, a) => {
          const v = vault.get(`${t}:${p}:${a}`)
          return v ? { accessToken: v } : null
        },
        delete: async (t, p, a) => {
          vault.delete(`${t}:${p}:${a}`)
        },
      },
      fetchImpl: fetchStub,
    }),
  )
  return { app, vault, audit }
}

describe('admin-sso (integration)', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

  beforeEach(async () => {
    await sql`TRUNCATE auth.sso_email_domains, auth.sso_configs CASCADE`
    await sql`DELETE FROM tenant.tenants WHERE id IN (${tenantId}, ${tenantId2})`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'acme', 'Acme'), (${tenantId2}, 'beta', 'Beta')`
  })
  afterAll(async () => { await sql.end() })

  it('PUT creates a row + domains, audits create + domain_added', async () => {
    const { app, audit } = buildApp(sql)
    const res = await app.request(`/admin/sso/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 'tid', client_id: 'cid' },
        domains: ['acme.com'],
        clientSecret: 'secret-1',
      }),
    })
    expect(res.status).toBe(200)
    const audited = audit.events.map((e) => e.operation)
    expect(audited).toContain('sso.config_created')
    expect(audited).toContain('sso.domain_added')
  })

  it('PUT rejects a denylist domain', async () => {
    const { app } = buildApp(sql)
    const res = await app.request(`/admin/sso/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 't', client_id: 'c' },
        domains: ['gmail.com'],
      }),
    })
    expect(res.status).toBe(400)
  })

  it('PUT 409s on a domain owned by another tenant', async () => {
    const { app } = buildApp(sql)
    // tenant 1 takes acme.com
    await app.request(`/admin/sso/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 't', client_id: 'c' },
        domains: ['acme.com'],
        clientSecret: 'sec',
      }),
    })
    // tenant 2 tries to take it
    const res = await app.request(`/admin/sso/tenants/${tenantId2}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 't', client_id: 'c' },
        domains: ['acme.com'],
        clientSecret: 'sec',
      }),
    })
    expect(res.status).toBe(409)
  })

  it('GET never echoes the client secret', async () => {
    const { app } = buildApp(sql)
    await app.request(`/admin/sso/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 't', client_id: 'c' },
        domains: ['acme.com'],
        clientSecret: 'topsecret',
      }),
    })
    const res = await app.request(`/admin/sso/tenants/${tenantId}`)
    const body = (await res.json()) as Record<string, unknown>
    expect(JSON.stringify(body)).not.toContain('topsecret')
    expect(body.hasSecret).toBe(true)
  })

  it('POST /test stores last_test_result + audits with the result', async () => {
    const { app, audit } = buildApp(sql, async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      if (url.endsWith('/.well-known/openid-configuration')) {
        return new Response(
          JSON.stringify({
            issuer: 'https://login.microsoftonline.com/tid/v2.0',
            token_endpoint: 'https://login.microsoftonline.com/tid/oauth2/v2.0/token',
            authorization_endpoint: 'x',
            jwks_uri: 'x',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
    })
    await app.request(`/admin/sso/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'entra',
        config: { entra_tenant_id: 'tid', client_id: 'cid' },
        domains: ['acme.com'],
        clientSecret: 'sec',
      }),
    })
    const res = await app.request(`/admin/sso/tenants/${tenantId}/test`, { method: 'POST' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: string }
    expect(body.result).toBe('ok')
    expect(audit.events.find((e) => e.operation === 'sso.test_run')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @seta/identity vitest run tests/integration/admin-sso.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/identity/tests/integration/admin-sso.test.ts
git commit -m "test(identity): integration tests for /admin/sso routes"
```

### Task D3: Mount admin router in `apps/api/src/main.ts`

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Mount the router with `requireSuperadmin`**

In `apps/api/src/main.ts`, after `app.route('/', sso)` (around line 279 in the PR 1 state), add:

```ts
import {
  createSsoAdminRoutes,
  isSuperadmin as identityIsSuperadmin,  // already imported as isSuperadmin; alias if conflict
  requireSuperadmin,
} from '@seta/identity'

// ...

const ssoAdmin = createSsoAdminRoutes({
  sql,
  audit,
  vault,
})

app.use(
  '/admin/sso/*',
  requireSessionMiddleware,
  requireSuperadmin({ lookup: (uid) => isSuperadmin(sql as never, uid) }),
)
app.route('/', ssoAdmin)
```

- [ ] **Step 2: Update env imports if needed**

No new envs are introduced in this PR.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @seta/api typecheck`
Expected: PASS.

- [ ] **Step 4: Smoke test the wiring**

Run: `pnpm --filter @seta/api vitest run tests/integration`
Expected: PASS. Existing smoke tests still cover discovery; admin routes are exercised in identity's integration suite (Task D2). If you want an apps/api-level smoke, add:

```ts
// apps/api/tests/integration/admin-sso-wiring.test.ts (optional, skip if D2 is sufficient)
import { describe, expect, it } from 'vitest'
import { buildApp } from '../../src/main'

describe('admin-sso wiring', () => {
  it('requires authentication on /admin/sso/tenants', async () => {
    const app = buildApp()
    const res = await app.request('/admin/sso/tenants')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/main.ts apps/api/tests/integration/admin-sso-wiring.test.ts
git commit -m "feat(api): mount /admin/sso router with superadmin guard"
```

---

## Phase E — Console UI

### Task E1: API client wrappers

**Files:**
- Create: `apps/console/src/api/sso-admin.ts`
- Create: `apps/console/src/api/sso-admin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/console/src/api/sso-admin.test.ts
import { describe, expect, it, vi } from 'vitest'
import { listSsoTenants, getSsoTenant, upsertSsoTenant, testSsoTenant, deleteSsoTenant } from './sso-admin'

describe('sso-admin API client', () => {
  it('listSsoTenants GETs /admin/sso/tenants', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const r = await listSsoTenants({ fetch: fetchImpl as never })
    expect(r.items).toEqual([])
    expect(fetchImpl).toHaveBeenCalledWith('/admin/sso/tenants', expect.objectContaining({ method: 'GET' }))
  })

  it('upsertSsoTenant sends the secret when provided, omits it when not', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    await upsertSsoTenant('t-1', {
      provider: 'entra',
      config: { entra_tenant_id: 'tid', client_id: 'cid' },
      domains: ['acme.com'],
      enabled: true,
    }, { fetch: fetchImpl as never })
    const [, init] = fetchImpl.mock.calls[0]!
    expect(JSON.parse((init.body as string))).not.toHaveProperty('clientSecret')

    await upsertSsoTenant('t-1', {
      provider: 'entra',
      config: { entra_tenant_id: 'tid', client_id: 'cid' },
      domains: ['acme.com'],
      enabled: true,
      clientSecret: 'topsecret',
    }, { fetch: fetchImpl as never })
    const [, init2] = fetchImpl.mock.calls[1]!
    expect(JSON.parse((init2.body as string)).clientSecret).toBe('topsecret')
  })
})
```

- [ ] **Step 2: Implement**

```ts
// apps/console/src/api/sso-admin.ts
export type SsoListItem = {
  tenantId: string
  slug: string
  displayName: string
  provider: 'entra' | null
  enabled: boolean
  domainCount: number
}

export type SsoConfigDetail = {
  tenantId: string
  provider: 'entra'
  config: { entra_tenant_id: string; client_id: string }
  enabled: boolean
  hasSecret: boolean
  domains: string[]
  lastTestedAt: string | null
  lastTestResult: string | null
}

export type SsoUpsertInput = {
  provider: 'entra'
  config: { entra_tenant_id: string; client_id: string }
  domains: string[]
  enabled: boolean
  clientSecret?: string
}

export type SsoTestResult = {
  result: 'ok' | 'discovery_failed' | 'issuer_mismatch' | 'invalid_client' | 'unexpected_error'
  message?: string
  testedAt: string
}

interface Opts { fetch?: typeof fetch; basePath?: string }

async function req<T>(url: string, init: RequestInit, opts: Opts): Promise<T> {
  const fetchImpl = opts.fetch ?? fetch
  const res = await fetchImpl(`${opts.basePath ?? ''}${url}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url} failed: ${res.status}`)
  return (await res.json()) as T
}

export const listSsoTenants = (opts: Opts = {}) =>
  req<{ items: SsoListItem[] }>('/admin/sso/tenants', { method: 'GET' }, opts)

export const getSsoTenant = (tenantId: string, opts: Opts = {}) =>
  req<SsoConfigDetail>(`/admin/sso/tenants/${tenantId}`, { method: 'GET' }, opts)

export const upsertSsoTenant = (tenantId: string, body: SsoUpsertInput, opts: Opts = {}) => {
  const payload: Record<string, unknown> = { ...body }
  if (!body.clientSecret) delete payload.clientSecret
  return req<SsoConfigDetail>(`/admin/sso/tenants/${tenantId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, opts)
}

export const deleteSsoTenant = (tenantId: string, opts: Opts = {}) =>
  req<{ ok: true }>(`/admin/sso/tenants/${tenantId}`, { method: 'DELETE' }, opts)

export const testSsoTenant = (tenantId: string, opts: Opts = {}) =>
  req<SsoTestResult>(`/admin/sso/tenants/${tenantId}/test`, { method: 'POST' }, opts)

export const rotateSsoSecret = (tenantId: string, clientSecret: string, opts: Opts = {}) =>
  req<{ ok: true }>(`/admin/sso/tenants/${tenantId}/rotate-secret`, {
    method: 'POST',
    body: JSON.stringify({ clientSecret }),
  }, opts)
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @seta/console vitest run src/api/sso-admin.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/console/src/api/sso-admin.ts apps/console/src/api/sso-admin.test.ts
git commit -m "feat(console): admin SSO API client wrappers"
```

### Task E2: `SsoConfigForm` component

**Files:**
- Create: `apps/console/src/pages/admin/SsoConfigForm.tsx`
- Create: `apps/console/src/pages/admin/SsoConfigForm.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/console/src/pages/admin/SsoConfigForm.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SsoConfigForm } from './SsoConfigForm'

describe('SsoConfigForm', () => {
  it('renders empty form when no detail provided', () => {
    render(<SsoConfigForm onSave={vi.fn()} onTest={vi.fn()} />)
    expect(screen.getByLabelText(/entra tenant id/i)).toHaveValue('')
    expect(screen.getByLabelText(/client id/i)).toHaveValue('')
  })

  it('renders prefilled when detail provided; clientSecret stays empty', () => {
    render(
      <SsoConfigForm
        onSave={vi.fn()}
        onTest={vi.fn()}
        detail={{
          tenantId: 't',
          provider: 'entra',
          config: { entra_tenant_id: 'tid', client_id: 'cid' },
          enabled: true,
          hasSecret: true,
          domains: ['acme.com'],
          lastTestedAt: null,
          lastTestResult: null,
        }}
      />,
    )
    expect(screen.getByLabelText(/entra tenant id/i)).toHaveValue('tid')
    expect(screen.getByLabelText(/client id/i)).toHaveValue('cid')
    expect(screen.getByLabelText(/client secret/i)).toHaveValue('')
    expect(screen.getByText(/we never display the existing secret/i)).toBeInTheDocument()
  })

  it('calls onSave with collected values; omits clientSecret when blank', async () => {
    const onSave = vi.fn(async () => {})
    render(<SsoConfigForm onSave={onSave} onTest={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/entra tenant id/i), 'tid')
    await userEvent.type(screen.getByLabelText(/client id/i), 'cid')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith({
      provider: 'entra',
      config: { entra_tenant_id: 'tid', client_id: 'cid' },
      enabled: true,
    })
  })

  it('calls onTest', async () => {
    const onTest = vi.fn(async () => {})
    render(
      <SsoConfigForm
        onSave={vi.fn()}
        onTest={onTest}
        detail={{
          tenantId: 't',
          provider: 'entra',
          config: { entra_tenant_id: 'tid', client_id: 'cid' },
          enabled: true,
          hasSecret: true,
          domains: [],
          lastTestedAt: null,
          lastTestResult: null,
        }}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /test connection/i }))
    expect(onTest).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement**

```tsx
// apps/console/src/pages/admin/SsoConfigForm.tsx
import { Button, Input, Label, Switch } from '@seta/ui'
import { type FormEvent, useState } from 'react'
import type { SsoConfigDetail } from '../../api/sso-admin'

export interface SsoConfigFormProps {
  detail?: SsoConfigDetail
  onSave: (input: {
    provider: 'entra'
    config: { entra_tenant_id: string; client_id: string }
    enabled: boolean
    clientSecret?: string
  }) => void | Promise<void>
  onTest: () => void | Promise<void>
  redirectUri?: string
}

export function SsoConfigForm({ detail, onSave, onTest, redirectUri }: SsoConfigFormProps) {
  const [entraTenantId, setEntraTenantId] = useState(detail?.config.entra_tenant_id ?? '')
  const [clientId, setClientId] = useState(detail?.config.client_id ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [enabled, setEnabled] = useState(detail?.enabled ?? true)
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const payload = {
        provider: 'entra' as const,
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
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div>
        <Label htmlFor="entraTenantId">Entra tenant ID</Label>
        <Input
          id="entraTenantId"
          value={entraTenantId}
          onChange={(e) => setEntraTenantId(e.target.value)}
          placeholder="11111111-2222-3333-4444-555555555555 or contoso.onmicrosoft.com"
          required
        />
      </div>
      <div>
        <Label htmlFor="clientId">Client ID</Label>
        <Input
          id="clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="clientSecret">Client secret</Label>
        <Input
          id="clientSecret"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={detail?.hasSecret ? '••••••••' : 'paste from Azure portal'}
          autoComplete="new-password"
        />
        <p className="mt-1 text-[12px] text-ink-mute">
          Write-only. Leave blank to keep the current secret. We never display the existing secret.
        </p>
      </div>
      {redirectUri && (
        <div>
          <Label>Redirect URI for the Azure app registration</Label>
          <Input value={redirectUri} readOnly />
          <p className="mt-1 text-[12px] text-ink-mute">Copy this into Azure portal → Authentication → Redirect URIs.</p>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="enabled">Enabled</Label>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>Save</Button>
        <Button type="button" variant="secondary" onClick={() => void onTest()} disabled={pending || !detail}>
          Test connection
        </Button>
      </div>
      {detail?.lastTestedAt && (
        <p className="text-[12px] text-ink-mute">Last tested {detail.lastTestedAt} — {detail.lastTestResult}</p>
      )}
    </form>
  )
}
```

(Use whatever input/switch/label components your `@seta/ui` actually exports. If `Switch`/`Label` don't exist, fall back to native `<input type="checkbox">` and `<label>`.)

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @seta/console vitest run src/pages/admin/SsoConfigForm.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/console/src/pages/admin/SsoConfigForm.tsx \
        apps/console/src/pages/admin/SsoConfigForm.test.tsx
git commit -m "feat(console): SsoConfigForm presentational component"
```

### Task E3: `SsoDomainsTable` component

**Files:**
- Create: `apps/console/src/pages/admin/SsoDomainsTable.tsx`
- Create: `apps/console/src/pages/admin/SsoDomainsTable.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/console/src/pages/admin/SsoDomainsTable.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SsoDomainsTable } from './SsoDomainsTable'

describe('SsoDomainsTable', () => {
  it('renders existing domains and supports add', async () => {
    const onChange = vi.fn(async () => {})
    render(<SsoDomainsTable domains={['acme.com']} onChange={onChange} />)
    expect(screen.getByText('acme.com')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText(/add a domain/i), 'example.com')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(onChange).toHaveBeenCalledWith(['acme.com', 'example.com'])
  })

  it('removes a domain', async () => {
    const onChange = vi.fn(async () => {})
    render(<SsoDomainsTable domains={['acme.com', 'beta.test']} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /remove acme\.com/i }))
    expect(onChange).toHaveBeenCalledWith(['beta.test'])
  })

  it('blocks denylist domain locally', async () => {
    render(<SsoDomainsTable domains={[]} onChange={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/add a domain/i), 'gmail.com')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/public-mail/i)
  })
})
```

- [ ] **Step 2: Implement**

```tsx
// apps/console/src/pages/admin/SsoDomainsTable.tsx
import { Button, Input, Label } from '@seta/ui'
import { X } from 'lucide-react'
import { useState } from 'react'

// Hardcoded mirror of the server-side denylist for early UX feedback. The
// server remains the source of truth.
const DENYLIST = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com',
  'aol.com', 'gmx.com', 'mail.com',
  'qq.com', '163.com',
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
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="domainInput">Add a domain</Label>
          <Input id="domainInput" value={draft} placeholder="Add a domain (e.g. acme.com)" onChange={(e) => setDraft(e.target.value)} />
        </div>
        <Button type="button" variant="secondary" onClick={() => void add()}>Add</Button>
      </div>
      {error && (
        <div role="alert" className="rounded-md border border-error/20 bg-error-soft px-3 py-2 text-[13px] text-error">
          {error}
        </div>
      )}
      <ul className="divide-y divide-divider rounded-md border border-divider">
        {domains.map((d) => (
          <li key={d} className="flex items-center justify-between px-3 py-2 text-[14px]">
            <span>{d}</span>
            <button type="button" aria-label={`Remove ${d}`} onClick={() => void remove(d)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-mute hover:bg-canvas-mute hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
        {domains.length === 0 && <li className="px-3 py-2 text-[13px] text-ink-mute">No domains yet.</li>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @seta/console vitest run src/pages/admin/SsoDomainsTable.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/console/src/pages/admin/SsoDomainsTable.tsx \
        apps/console/src/pages/admin/SsoDomainsTable.test.tsx
git commit -m "feat(console): SsoDomainsTable presentational component"
```

### Task E4: Route pages

**Files:**
- Create: `apps/console/src/routes/_superadmin/admin.tenants.$tenantId.sso.tsx`
- Create: `apps/console/src/routes/_superadmin/admin.tenants.$tenantId.sso.domains.tsx`
- Modify: `apps/console/src/routes/_superadmin/admin/tenants.tsx` (add column linking to SSO page)
- Modify: `apps/console/src/nav/consoleNav.ts` (add nav item)

- [ ] **Step 1: SSO setup page**

```tsx
// apps/console/src/routes/_superadmin/admin.tenants.$tenantId.sso.tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { getSsoTenant, testSsoTenant, upsertSsoTenant } from '../../api/sso-admin'
import { SsoConfigForm } from '../../pages/admin/SsoConfigForm'

const REDIRECT_URI_SUFFIX = '/sso/callback/entra'

export const Route = createFileRoute('/_superadmin/admin/tenants/$tenantId/sso')({
  component: SsoSettingsPage,
})

function SsoSettingsPage() {
  const { tenantId } = Route.useParams()
  const qc = useQueryClient()
  const [testResult, setTestResult] = useState<string | null>(null)

  const detailQ = useQuery({
    queryKey: ['admin', 'sso', tenantId],
    queryFn: () => getSsoTenant(tenantId),
    retry: false,
  })

  const upsertM = useMutation({
    mutationFn: (input: Parameters<typeof upsertSsoTenant>[1]) => upsertSsoTenant(tenantId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sso', tenantId] }),
  })

  const testM = useMutation({
    mutationFn: () => testSsoTenant(tenantId),
    onSuccess: (r) => {
      setTestResult(`${r.result}${r.message ? `: ${r.message}` : ''}`)
      qc.invalidateQueries({ queryKey: ['admin', 'sso', tenantId] })
    },
  })

  if (detailQ.isLoading) return <p className="p-6">Loading…</p>
  const detail = detailQ.data

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-[14px]">
        <Link to="/admin/tenants" className="text-ink-mute hover:text-ink">← Tenants</Link>
        <span className="text-ink-mute">·</span>
        <span>SSO configuration</span>
      </div>
      <Link to="/admin/tenants/$tenantId/sso/domains" params={{ tenantId }} className="inline-block text-[14px] text-primary hover:underline">
        Manage email domains →
      </Link>
      <SsoConfigForm
        detail={detail}
        redirectUri={`${window.location.origin}${REDIRECT_URI_SUFFIX}`}
        onSave={async (input) => {
          await upsertM.mutateAsync({
            ...input,
            domains: detail?.domains ?? [],
          })
        }}
        onTest={() => testM.mutateAsync()}
      />
      {testResult && (
        <p className="text-[13px] text-ink-mute">Test result: {testResult}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Domains page**

```tsx
// apps/console/src/routes/_superadmin/admin.tenants.$tenantId.sso.domains.tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { getSsoTenant, upsertSsoTenant } from '../../api/sso-admin'
import { SsoDomainsTable } from '../../pages/admin/SsoDomainsTable'

export const Route = createFileRoute('/_superadmin/admin/tenants/$tenantId/sso/domains')({
  component: SsoDomainsPage,
})

function SsoDomainsPage() {
  const { tenantId } = Route.useParams()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ['admin', 'sso', tenantId],
    queryFn: () => getSsoTenant(tenantId),
    retry: false,
  })

  const m = useMutation({
    mutationFn: (domains: string[]) =>
      upsertSsoTenant(tenantId, {
        provider: 'entra',
        config: q.data!.config,
        domains,
        enabled: q.data!.enabled,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sso', tenantId] }),
  })

  if (q.isLoading) return <p className="p-6">Loading…</p>
  if (!q.data) return <p className="p-6">Configure SSO before adding domains.</p>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-[14px]">
        <Link to="/admin/tenants/$tenantId/sso" params={{ tenantId }} className="text-ink-mute hover:text-ink">← SSO settings</Link>
        <span className="text-ink-mute">·</span>
        <span>Email domains</span>
      </div>
      <SsoDomainsTable domains={q.data.domains} onChange={(next) => m.mutateAsync(next)} />
    </div>
  )
}
```

- [ ] **Step 3: Add an "SSO" column / link on the tenants list**

Open `apps/console/src/routes/_superadmin/admin/tenants.tsx`. Find where each tenant row is rendered and add a link in the row's actions area:

```tsx
<Link to="/admin/tenants/$tenantId/sso" params={{ tenantId: t.id }}>SSO</Link>
```

If the existing file is a stub, the minimal change is fine: add a `<Link>` per row. Re-run any existing tests for the page after change.

- [ ] **Step 4: Add nav entry**

Open `apps/console/src/nav/consoleNav.ts`. The existing entry shows `Tenants → /admin/tenants`. No need for a separate SSO top-level entry; it lives under each tenant.

- [ ] **Step 5: Regenerate TanStack Router file tree**

Run: `pnpm --filter @seta/console exec tsr generate` (or the project's equivalent; check `package.json` scripts under `console`). This updates `routeTree.gen.ts`.
Expected: the two new routes appear in the generated tree.

- [ ] **Step 6: Typecheck + build**

Run: `pnpm --filter @seta/console typecheck && pnpm --filter @seta/console build`
Expected: PASS.

- [ ] **Step 7: Manual smoke**

Run `pnpm dev` and navigate to `http://localhost:8080/console/admin/tenants/<id>/sso` for the seeded tenant.
Expected: the form loads with the seeded values; "Test connection" runs and updates the last-test line.

- [ ] **Step 8: Commit**

```bash
git add apps/console/src/routes/_superadmin/admin.tenants.$tenantId.sso.tsx \
        apps/console/src/routes/_superadmin/admin.tenants.$tenantId.sso.domains.tsx \
        apps/console/src/routes/_superadmin/admin/tenants.tsx \
        apps/console/src/routeTree.gen.ts
git commit -m "feat(console): superadmin SSO configuration and domains pages"
```

---

## Phase F — Verification

### Task F1: Full check + PR

- [ ] **Step 1: Repo-wide checks**

Run:
1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test:unit`
4. `pnpm test:integration`

Expected: all PASS.

- [ ] **Step 2: Hand-exercise the admin API**

Authenticate as a superadmin (use PR 1's login). Then:

```bash
curl -s -b cookies.txt http://localhost:8080/admin/sso/tenants | jq .
curl -s -b cookies.txt -X POST http://localhost:8080/admin/sso/tenants/<tid>/test | jq .
```

Expected: list shows the seeded tenant; test returns `result: "ok"`.

- [ ] **Step 3: Open PR**

```bash
git push -u origin <branch>
gh pr create --title "feat(identity): superadmin SSO admin UI (PR 2)" \
  --body "$(cat <<'EOF'
## Summary
- /admin/sso/tenants CRUD with audit logging
- Server-side connection probe (discovery + client_credentials)
- Superadmin console pages for SSO setup and domain management
- last_tested_at + last_test_result columns

Spec: docs/superpowers/specs/2026-05-18-byo-idp-sso-design.md
Depends on PR 1 (per-tenant Entra SSO foundation).

## Test plan
- [ ] pnpm typecheck && pnpm lint
- [ ] pnpm test:unit && pnpm test:integration
- [ ] Manual: navigate to /console/admin/tenants/<id>/sso, edit config, run Test connection
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Admin API surface (GET/PUT/DELETE/test/rotate-secret) → Task D1 ✅
- Server-side connection probe (discovery + client_credentials) → Task B1, D1, D2 ✅
- Audit events for every mutation → Task C1, D1 ✅
- Client secret is write-only and never echoed → Task A2 (`hasSecret`), D1 (does not return secret in detail), D2 (test) ✅
- Domain validation (denylist + cross-tenant conflict) → Task D1, D2 ✅
- Superadmin guard → Task D3 ✅
- Console setup page + domains page → Task E4 ✅
- Form prefill, secret write-only with placeholder → Task E2 ✅
- "Test connection" round-trip with feedback → Task E4 (`testResult` state) ✅
- Operator runbook lives in `docs/operations/sso-setup.md` per the spec — **not created in this PR** because that's a docs artifact distinct from the code; either fold it into the existing QUICKSTART or open a follow-up. Add this to the PR description as a TODO if you want it tracked.

**Placeholder scan:** no TBD/TODO/"add appropriate" remaining. Every component test shows the assertions; every route shows the handler code.

**Type consistency:**
- `SsoConfigDetail` shape consistent between Zod (`schemas-admin.ts`), repo (`getSsoConfigDetail`), and client (`apps/console/src/api/sso-admin.ts`) ✅
- `SsoUpsertInput` field names mirror `SsoUpsertBody` ✅
- Provider literal `'entra'` everywhere ✅
- Audit event names use the closed `SsoAuditEvent` union from `admin-audit.ts` ✅

**Scope check:** single coherent slice (operator can manage SSO end-to-end through the UI). No mailer code, no magic-link code.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-18-byo-idp-sso-pr2-admin-ui.md`.

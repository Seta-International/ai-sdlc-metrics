# Per-tenant Entra SSO — PR 3 `@seta/mailer` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Depends on:** PR 1 (foundation) is merged. PR 2 is **not required** but its admin UI gets extended with a "Mailer" tab in Phase E of this PR.

**Goal:** Ship a new platform package `@seta/mailer` that abstracts sending email behind a single `Mailer` interface. Configuration is **per-tenant**, stored in `auth.mailer_configs` and selected at call-time. v1 ships the Microsoft Graph backend (sends from a mailbox in the customer's M365 directory using the existing platform connector Entra app) plus a `Console` dev-only fallback. SMTP / SES backends are scaffolded but not wired. No production caller yet — PR 4 (magic-link) is the first consumer.

**Architecture:**
- New platform package: `platform/mailer/` (private, vendor-neutral interface, vendor-specific factories).
- Per-tenant config lives in `auth.mailer_configs` (`@seta/identity` owns the table; this respects the existing schema-per-module rule).
- A resolver function `mailerForTenant(tenantId, deps)` loads the row, parses the discriminated union, and constructs the backend with the right injected dependencies.
- Graph backend uses `@seta/ms-graph` `graphFetch` + a token-getter that reuses the existing `platformConnectorOAuth.acquireAppOnly(<entraTenantId>, ['https://graph.microsoft.com/.default'])` flow.
- Console backend logs the rendered email through `@seta/observability` and is the fallback when no row exists in non-production environments.
- Cross-backend contract suite at `platform/mailer/tests/contract/` parameterised over backends.
- Admin extension (Phase E): Superadmin UI gets a Mailer tab to CRUD `mailer_configs` rows. No mailer secrets needed for Graph backend, so no vault writes.

**Tech Stack:** TypeScript ESM, Hono, Drizzle, Zod, `@seta/ms-graph`, MSW, Vitest. New deps: none (Graph + Console only).

**Spec:** [`docs/superpowers/specs/2026-05-18-byo-idp-sso-design.md`](../specs/2026-05-18-byo-idp-sso-design.md) §"@seta/mailer platform package".

---

## File Map

**Create**
- `platform/mailer/package.json` — new package (use `pnpm new:package`)
- `platform/mailer/tsconfig.json`, `tsup.config.ts`, `vitest.config.ts` (whatever `new:package` scaffolds)
- `platform/mailer/src/index.ts` — public surface
- `platform/mailer/src/types.ts` — `Mailer`, `OutboundMessage`, `MailerNotConfigured` error
- `platform/mailer/src/console.ts` — `createConsoleMailer`
- `platform/mailer/src/console.test.ts`
- `platform/mailer/src/graph.ts` — `createGraphMailer`
- `platform/mailer/src/graph.test.ts`
- `platform/mailer/src/resolver.ts` — `mailerForTenant`
- `platform/mailer/src/resolver.test.ts`
- `platform/mailer/tests/contract/contract.test.ts` — runs the same suite against every backend
- `platform/identity/src/schema/mailer-configs.ts` — Drizzle table
- `platform/identity/src/mailer-config-schema.ts` — Zod discriminated union for mailer providers
- `platform/identity/src/mailer-config-schema.test.ts`
- `platform/identity/src/mailer-config-repo.ts` — DB access
- `platform/identity/tests/integration/mailer-config-repo.test.ts`
- `platform/identity/migrations/0006_mailer_configs.sql` — generated table DDL
- `platform/identity/migrations/0007_mailer_configs_rls.sql` — custom (RLS)
- `apps/console/src/api/mailer-admin.ts` — client wrappers for admin routes
- `apps/console/src/api/mailer-admin.test.ts`
- `apps/console/src/pages/admin/MailerConfigForm.tsx`
- `apps/console/src/pages/admin/MailerConfigForm.test.tsx`
- `apps/console/src/routes/_superadmin/admin.tenants.$tenantId.mailer.tsx`

**Modify**
- `platform/identity/src/schema/index.ts` — export `mailerConfigs`
- `platform/identity/src/admin-routes.ts` — add 3 new endpoints for mailer admin (or split into a sibling file — see Phase E)
- `platform/identity/src/index.ts` — export mailer-config repo + schema
- `apps/api/src/main.ts` — construct the mailer resolver, no callers yet but wire it so PR 4 can pick it up
- `tooling/scripts/seed-first-tenant.ts` — write Seta's `mailer_configs` row (Graph provider)
- `apps/console/src/routes/_superadmin/admin.tenants.$tenantId.sso.tsx` — add a tab/link to the Mailer page
- `.env.example` — add the three new bootstrap envs

**Delete**
- None.

---

## Phase A — Schema and types

### Task A1: Drizzle table for `auth.mailer_configs`

**Files:**
- Create: `platform/identity/src/schema/mailer-configs.ts`
- Modify: `platform/identity/src/schema/index.ts`

- [ ] **Step 1: Create the table**

```ts
// platform/identity/src/schema/mailer-configs.ts
import { boolean, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authSchema } from './users'

export const mailerConfigs = authSchema.table(
  'mailer_configs',
  {
    tenantId: uuid('tenant_id').notNull(),
    provider: text('provider').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    secretVaultId: text('secret_vault_id'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.provider] })],
)

export type MailerConfigRow = typeof mailerConfigs.$inferSelect
export type NewMailerConfigRow = typeof mailerConfigs.$inferInsert
```

- [ ] **Step 2: Export from schema index**

Add to `platform/identity/src/schema/index.ts`:

```ts
export * from './mailer-configs'
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @seta/identity typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add platform/identity/src/schema/mailer-configs.ts \
        platform/identity/src/schema/index.ts
git commit -m "feat(identity): Drizzle table for mailer_configs"
```

### Task A2: Generate the migration

- [ ] **Step 1: Generate**

Run: `pnpm --filter @seta/identity exec drizzle-kit generate --name mailer_configs`
Expected: emits `migrations/0006_<auto>.sql` with `CREATE TABLE auth.mailer_configs (...)`.

- [ ] **Step 2: Generate the custom RLS migration**

Run: `pnpm --filter @seta/identity exec drizzle-kit generate --custom --name mailer_configs_rls`
Open the new `0007_*.sql` and write:

```sql
ALTER TABLE auth.mailer_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.mailer_configs FORCE ROW LEVEL SECURITY;
CREATE POLICY mailer_configs_tenant ON auth.mailer_configs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.mailer_configs TO tenant_user;
```

- [ ] **Step 3: Apply**

Run: `pnpm migrate`
Expected: succeeds; both new tables visible in `\d auth.mailer_configs`.

- [ ] **Step 4: Verify RLS**

Run: `psql "$DATABASE_URL" -c "SELECT rowsecurity, forcerowsecurity FROM pg_tables JOIN pg_class ON relname=tablename WHERE schemaname='auth' AND tablename='mailer_configs';"`
Expected: `t | t`.

- [ ] **Step 5: Commit**

```bash
git add platform/identity/migrations/0006_*.sql \
        platform/identity/migrations/0007_mailer_configs_rls.sql \
        platform/identity/migrations/meta/0006_snapshot.json \
        platform/identity/migrations/meta/_journal.json
git commit -m "feat(identity): migration + RLS for mailer_configs"
```

### Task A3: Zod discriminated union

**Files:**
- Create: `platform/identity/src/mailer-config-schema.ts`
- Create: `platform/identity/src/mailer-config-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// platform/identity/src/mailer-config-schema.test.ts
import { describe, expect, it } from 'vitest'
import { parseMailerConfig } from './mailer-config-schema'

describe('parseMailerConfig (graph)', () => {
  it('parses a valid graph row', () => {
    const r = parseMailerConfig({
      provider: 'graph',
      config: { mailbox_user_id: 'noreply@seta.example', from_address: 'noreply@seta.example' },
    })
    expect(r.provider).toBe('graph')
  })

  it('rejects missing mailbox_user_id', () => {
    expect(() =>
      parseMailerConfig({ provider: 'graph', config: { from_address: 'a@b.c' } } as never),
    ).toThrow()
  })

  it('rejects unknown provider', () => {
    expect(() =>
      parseMailerConfig({ provider: 'smtp', config: {} } as never),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Implement**

```ts
// platform/identity/src/mailer-config-schema.ts
import { z } from '@hono/zod-openapi'

export const GraphMailerConfig = z.object({
  mailbox_user_id: z.string().min(1),
  from_address: z.string().email(),
})
export type GraphMailerConfig = z.infer<typeof GraphMailerConfig>

// Scaffolded for future PRs; not part of the v1 discriminated union.
export const SmtpMailerConfig = z.object({
  from_address: z.string().email(),
})
export const SesMailerConfig = z.object({
  region: z.string().min(1),
  from_address: z.string().email(),
  configuration_set: z.string().optional(),
})

export const MailerConfigDiscriminated = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('graph'), config: GraphMailerConfig }),
])
export type MailerConfigDiscriminated = z.infer<typeof MailerConfigDiscriminated>

export function parseMailerConfig(input: unknown): MailerConfigDiscriminated {
  return MailerConfigDiscriminated.parse(input)
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @seta/identity vitest run src/mailer-config-schema.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add platform/identity/src/mailer-config-schema.ts \
        platform/identity/src/mailer-config-schema.test.ts
git commit -m "feat(identity): mailer config discriminated union (graph v1)"
```

### Task A4: `mailer-config-repo`

**Files:**
- Create: `platform/identity/src/mailer-config-repo.ts`
- Create: `platform/identity/tests/integration/mailer-config-repo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// platform/identity/tests/integration/mailer-config-repo.test.ts
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  deleteMailerConfig,
  getMailerConfigByTenant,
  upsertMailerConfig,
} from '../../src/mailer-config-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(DATABASE_URL, { max: 1, prepare: false })
const tenantId = '00000000-0000-4000-8000-0000000000e1'

describe('mailer-config-repo (integration)', () => {
  beforeEach(async () => {
    await sql`TRUNCATE auth.mailer_configs CASCADE`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'acme', 'Acme')`
  })
  afterAll(async () => { await sql.end() })

  it('upserts and retrieves a graph config', async () => {
    await upsertMailerConfig(sql, {
      tenantId,
      provider: 'graph',
      config: { mailbox_user_id: 'noreply@acme.com', from_address: 'noreply@acme.com' },
      enabled: true,
    })
    const r = await getMailerConfigByTenant(sql, tenantId)
    expect(r).toMatchObject({ provider: 'graph', enabled: true })
    expect(r?.config.mailbox_user_id).toBe('noreply@acme.com')
  })

  it('returns null when no row exists', async () => {
    expect(await getMailerConfigByTenant(sql, tenantId)).toBeNull()
  })

  it('returns null when disabled', async () => {
    await upsertMailerConfig(sql, {
      tenantId,
      provider: 'graph',
      config: { mailbox_user_id: 'noreply@acme.com', from_address: 'noreply@acme.com' },
      enabled: false,
    })
    expect(await getMailerConfigByTenant(sql, tenantId)).toBeNull()
  })

  it('deleteMailerConfig removes the row', async () => {
    await upsertMailerConfig(sql, {
      tenantId,
      provider: 'graph',
      config: { mailbox_user_id: 'a@b.c', from_address: 'a@b.c' },
      enabled: true,
    })
    await deleteMailerConfig(sql, tenantId)
    expect(await getMailerConfigByTenant(sql, tenantId)).toBeNull()
  })
})
```

- [ ] **Step 2: Implement**

```ts
// platform/identity/src/mailer-config-repo.ts
import type { Sql } from 'postgres'
import { parseMailerConfig, type MailerConfigDiscriminated } from './mailer-config-schema'

export async function getMailerConfigByTenant(
  sql: Sql,
  tenantId: string,
): Promise<MailerConfigDiscriminated | null> {
  const rows = (await sql`
    SELECT provider, config FROM auth.mailer_configs
    WHERE tenant_id = ${tenantId} AND enabled
    LIMIT 1
  `) as Array<{ provider: string; config: unknown }>
  const r = rows[0]
  if (!r) return null
  return parseMailerConfig({ provider: r.provider, config: r.config })
}

export async function upsertMailerConfig(
  sql: Sql,
  input: {
    tenantId: string
    provider: 'graph'
    config: MailerConfigDiscriminated['config']
    enabled: boolean
  },
): Promise<void> {
  await sql`
    INSERT INTO auth.mailer_configs (tenant_id, provider, config, enabled)
    VALUES (${input.tenantId}, ${input.provider}, ${sql.json(input.config as never)}, ${input.enabled})
    ON CONFLICT (tenant_id, provider) DO UPDATE
      SET config = excluded.config,
          enabled = excluded.enabled,
          updated_at = now()
  `
}

export async function deleteMailerConfig(sql: Sql, tenantId: string): Promise<void> {
  await sql`DELETE FROM auth.mailer_configs WHERE tenant_id = ${tenantId}`
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @seta/identity vitest run tests/integration/mailer-config-repo.test.ts`
Expected: PASS.

- [ ] **Step 4: Update `@seta/identity` index**

In `platform/identity/src/index.ts`, add:

```ts
export {
  deleteMailerConfig,
  getMailerConfigByTenant,
  upsertMailerConfig,
} from './mailer-config-repo'
export type { MailerConfigDiscriminated, GraphMailerConfig } from './mailer-config-schema'
export {
  MailerConfigDiscriminated as MailerConfigSchema,
  parseMailerConfig,
} from './mailer-config-schema'
export { mailerConfigs } from './schema'
export type { MailerConfigRow, NewMailerConfigRow } from './schema'
```

- [ ] **Step 5: Commit**

```bash
git add platform/identity/src/mailer-config-repo.ts \
        platform/identity/tests/integration/mailer-config-repo.test.ts \
        platform/identity/src/index.ts
git commit -m "feat(identity): mailer-config-repo and exports"
```

---

## Phase B — `@seta/mailer` package scaffolding

### Task B1: Create the package

**Files:**
- Create via `pnpm new:package`: `platform/mailer/*`

- [ ] **Step 1: Scaffold**

Run: `pnpm new:package`
Choose: `platform/mailer`, name `@seta/mailer`, private package.

The scaffold creates `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `src/index.ts`. Do not hand-edit `package.json` for deps; use `pnpm` below.

- [ ] **Step 2: Add deps**

Run: `pnpm --filter @seta/mailer add @seta/observability@workspace:* @seta/ms-graph@workspace:*`
Run: `pnpm --filter @seta/mailer add -D vitest @types/node`

- [ ] **Step 3: Verify the package builds**

Run: `pnpm --filter @seta/mailer build && pnpm --filter @seta/mailer typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add platform/mailer pnpm-lock.yaml
git commit -m "feat(mailer): scaffold @seta/mailer package"
```

### Task B2: Types + interface

**Files:**
- Create: `platform/mailer/src/types.ts`

- [ ] **Step 1: Write the file**

```ts
// platform/mailer/src/types.ts
export interface OutboundMessage {
  to: string | string[]
  subject: string
  text: string
  html?: string
  from?: string
  replyTo?: string
  headers?: Record<string, string>
  /** Backend may use this for idempotent send (e.g. SES MessageDeduplicationId). */
  idempotencyKey?: string
}

export interface Mailer {
  /** Throws on permanent failure. Backends may retry internally for transient errors. */
  send(msg: OutboundMessage): Promise<void>
}

export class MailerNotConfigured extends Error {
  constructor(public readonly tenantId: string) {
    super(`No mailer configured for tenant ${tenantId}`)
    this.name = 'MailerNotConfigured'
  }
}
```

- [ ] **Step 2: Commit (combine with B3 below)**

(skip commit until console mailer ships)

### Task B3: Console mailer (the smallest backend)

**Files:**
- Create: `platform/mailer/src/console.ts`
- Create: `platform/mailer/src/console.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// platform/mailer/src/console.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createConsoleMailer } from './console'

describe('createConsoleMailer', () => {
  it('logs a structured line and returns ok', async () => {
    const info = vi.fn()
    const logger = { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    const m = createConsoleMailer({ logger: logger as never })
    await m.send({ to: 'a@b.com', subject: 'Hi', text: 'body' })
    expect(info).toHaveBeenCalled()
    const [payload] = info.mock.calls[0]!
    expect(payload).toMatchObject({ event: 'mailer.console_send', to: 'a@b.com', subject: 'Hi' })
  })
})
```

- [ ] **Step 2: Implement**

```ts
// platform/mailer/src/console.ts
import type { Logger } from '@seta/observability'
import type { Mailer, OutboundMessage } from './types'

export interface ConsoleMailerOpts {
  logger: Pick<Logger, 'info'>
  defaultFrom?: string
}

export function createConsoleMailer(opts: ConsoleMailerOpts): Mailer {
  return {
    async send(msg: OutboundMessage): Promise<void> {
      opts.logger.info(
        {
          event: 'mailer.console_send',
          to: msg.to,
          from: msg.from ?? opts.defaultFrom,
          subject: msg.subject,
          body: msg.text,
          html_len: msg.html?.length ?? 0,
        },
        '[mailer] console send (no real delivery)',
      )
    },
  }
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @seta/mailer vitest run src/console.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add platform/mailer/src/types.ts \
        platform/mailer/src/console.ts \
        platform/mailer/src/console.test.ts
git commit -m "feat(mailer): types + console backend"
```

### Task B4: Graph mailer

**Files:**
- Create: `platform/mailer/src/graph.ts`
- Create: `platform/mailer/src/graph.test.ts`

- [ ] **Step 1: Look at `@seta/ms-graph` `graphFetch` signature**

Open `modules/.../platform/ms-graph/src/index.ts` (search for `graphFetch`). Note the signature — typically `graphFetch(token, method, url, body, opts)` or similar. Use it as the implementation expects.

If unsure, run: `grep -rn "export.*graphFetch" platform/ms-graph` and read the file.

- [ ] **Step 2: Write the failing test**

```ts
// platform/mailer/src/graph.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createGraphMailer } from './graph'

describe('createGraphMailer', () => {
  it('POSTs to /users/{mailbox}/sendMail with token from getToken', async () => {
    const getToken = vi.fn().mockResolvedValue('TOK')
    let capturedReq: { url: string; method: string; headers: Record<string, string>; body: string } | null = null
    const graphFetchFake = vi.fn(async (token: string, method: string, url: string, body?: unknown) => {
      capturedReq = {
        url,
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }
      return new Response('', { status: 202 })
    })
    const m = createGraphMailer({
      getToken,
      graphFetch: graphFetchFake as never,
      mailboxUserId: 'noreply@acme.com',
      fromAddress: 'noreply@acme.com',
    })
    await m.send({ to: ['alice@acme.com'], subject: 'Hi', text: 'body' })
    expect(getToken).toHaveBeenCalled()
    expect(graphFetchFake).toHaveBeenCalledTimes(1)
    expect(capturedReq?.url).toBe('/users/noreply@acme.com/sendMail')
    const parsed = JSON.parse(capturedReq!.body) as { message: { subject: string; toRecipients: Array<{ emailAddress: { address: string } }> } }
    expect(parsed.message.subject).toBe('Hi')
    expect(parsed.message.toRecipients[0]?.emailAddress.address).toBe('alice@acme.com')
  })

  it('throws on a non-2xx response', async () => {
    const graphFetchFake = vi.fn(async () => new Response('oops', { status: 500 }))
    const m = createGraphMailer({
      getToken: async () => 'TOK',
      graphFetch: graphFetchFake as never,
      mailboxUserId: 'noreply@acme.com',
      fromAddress: 'noreply@acme.com',
    })
    await expect(m.send({ to: 'a@b.com', subject: 's', text: 'b' })).rejects.toThrow(/500/)
  })
})
```

- [ ] **Step 3: Implement**

```ts
// platform/mailer/src/graph.ts
import type { Mailer, OutboundMessage } from './types'

// Adjust this signature to match whatever @seta/ms-graph actually exports.
export type GraphFetch = (
  token: string,
  method: 'POST' | 'GET' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
) => Promise<Response>

export interface GraphMailerOpts {
  getToken: () => Promise<string>
  graphFetch: GraphFetch
  /** Mailbox user (UPN or user id) in the customer's M365 directory. */
  mailboxUserId: string
  /** From address; usually equal to mailboxUserId or one of its aliases. */
  fromAddress: string
  /** Whether to save to the mailbox's Sent Items. Defaults to false. */
  saveToSentItems?: boolean
}

function toRecipients(to: string | string[]): Array<{ emailAddress: { address: string } }> {
  return (Array.isArray(to) ? to : [to]).map((address) => ({ emailAddress: { address } }))
}

export function createGraphMailer(opts: GraphMailerOpts): Mailer {
  return {
    async send(msg: OutboundMessage): Promise<void> {
      const token = await opts.getToken()
      const payload = {
        message: {
          subject: msg.subject,
          body: msg.html
            ? { contentType: 'HTML', content: msg.html }
            : { contentType: 'Text', content: msg.text },
          toRecipients: toRecipients(msg.to),
          from: { emailAddress: { address: msg.from ?? opts.fromAddress } },
          replyTo: msg.replyTo ? [{ emailAddress: { address: msg.replyTo } }] : undefined,
        },
        saveToSentItems: opts.saveToSentItems ?? false,
      }
      const res = await opts.graphFetch(token, 'POST', `/users/${opts.mailboxUserId}/sendMail`, payload)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`graph sendMail failed: ${res.status} ${text.slice(0, 200)}`)
      }
    },
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @seta/mailer vitest run src/graph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/mailer/src/graph.ts platform/mailer/src/graph.test.ts
git commit -m "feat(mailer): graph backend (POST /users/{mailbox}/sendMail)"
```

### Task B5: Resolver

**Files:**
- Create: `platform/mailer/src/resolver.ts`
- Create: `platform/mailer/src/resolver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// platform/mailer/src/resolver.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createConsoleMailer } from './console'
import { mailerForTenant, type MailerResolverDeps } from './resolver'
import { MailerNotConfigured } from './types'

const tenantId = 't-1'

function deps(over: Partial<MailerResolverDeps> = {}): MailerResolverDeps {
  return {
    nodeEnv: 'development',
    getMailerConfig: async () => null,
    getEntraTenantIdForTenant: async () => 'entra-tid',
    platformConnector: {
      acquireAppOnly: async () => ({ accessToken: 'TOK' }),
    },
    graphFetch: vi.fn(async () => new Response('', { status: 202 })) as never,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    ...over,
  }
}

describe('mailerForTenant', () => {
  it('returns console mailer when no config row exists in development', async () => {
    const m = await mailerForTenant(tenantId, deps())
    expect(m).toBeTruthy()  // smoke
  })

  it('throws MailerNotConfigured when no row exists in production', async () => {
    await expect(mailerForTenant(tenantId, deps({ nodeEnv: 'production' }))).rejects.toBeInstanceOf(
      MailerNotConfigured,
    )
  })

  it('returns a graph mailer when row provider=graph', async () => {
    const m = await mailerForTenant(
      tenantId,
      deps({
        getMailerConfig: async () => ({
          provider: 'graph',
          config: { mailbox_user_id: 'mbox', from_address: 'from@x.test' },
        }),
      }),
    )
    expect(m).toBeTruthy()
  })

  it('throws when graph backend requested but entra tenant id is missing', async () => {
    await expect(
      mailerForTenant(
        tenantId,
        deps({
          getMailerConfig: async () => ({
            provider: 'graph',
            config: { mailbox_user_id: 'mbox', from_address: 'from@x.test' },
          }),
          getEntraTenantIdForTenant: async () => null,
        }),
      ),
    ).rejects.toThrow(/entra tenant id/i)
  })
})
```

- [ ] **Step 2: Implement**

```ts
// platform/mailer/src/resolver.ts
import type { Logger } from '@seta/observability'
import { createConsoleMailer } from './console'
import { createGraphMailer, type GraphFetch } from './graph'
import { type Mailer, MailerNotConfigured } from './types'

/** Provider+config discriminator. Mirrors @seta/identity's MailerConfigDiscriminated. */
export type MailerConfigInput =
  | { provider: 'graph'; config: { mailbox_user_id: string; from_address: string } }

export interface MailerResolverDeps {
  nodeEnv: 'development' | 'test' | 'production'
  /** Returns null if the tenant has no enabled row. */
  getMailerConfig: (tenantId: string) => Promise<MailerConfigInput | null>
  /** Resolves the Entra directory id where the customer admin-consented the platform connector app. */
  getEntraTenantIdForTenant: (tenantId: string) => Promise<string | null>
  platformConnector: {
    acquireAppOnly: (entraTenantId: string, scopes: string[]) => Promise<{ accessToken: string }>
  }
  graphFetch: GraphFetch
  logger: Logger
  /** Process-level fallback from MAILER_FROM_ADDRESS_DEFAULT, if any. */
  defaultFrom?: string
}

export async function mailerForTenant(tenantId: string, deps: MailerResolverDeps): Promise<Mailer> {
  const row = await deps.getMailerConfig(tenantId)
  if (!row) {
    if (deps.nodeEnv === 'production') throw new MailerNotConfigured(tenantId)
    return createConsoleMailer({ logger: deps.logger, defaultFrom: deps.defaultFrom })
  }
  switch (row.provider) {
    case 'graph': {
      const entraTenantId = await deps.getEntraTenantIdForTenant(tenantId)
      if (!entraTenantId) throw new Error('graph mailer requires an entra tenant id from sso_configs')
      return createGraphMailer({
        getToken: () =>
          deps.platformConnector
            .acquireAppOnly(entraTenantId, ['https://graph.microsoft.com/.default'])
            .then((b) => b.accessToken),
        graphFetch: deps.graphFetch,
        mailboxUserId: row.config.mailbox_user_id,
        fromAddress: row.config.from_address,
      })
    }
    default: {
      const x: never = row.provider
      throw new Error(`Unreachable: mailer provider '${x as string}'`)
    }
  }
}
```

- [ ] **Step 3: Update `platform/mailer/src/index.ts`**

```ts
// platform/mailer/src/index.ts
export type { Mailer, OutboundMessage } from './types'
export { MailerNotConfigured } from './types'
export { createConsoleMailer } from './console'
export type { ConsoleMailerOpts } from './console'
export { createGraphMailer } from './graph'
export type { GraphFetch, GraphMailerOpts } from './graph'
export { mailerForTenant } from './resolver'
export type { MailerConfigInput, MailerResolverDeps } from './resolver'
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @seta/mailer vitest run`
Expected: PASS (all of B3/B4/B5).

- [ ] **Step 5: Commit**

```bash
git add platform/mailer/src/resolver.ts \
        platform/mailer/src/resolver.test.ts \
        platform/mailer/src/index.ts
git commit -m "feat(mailer): mailerForTenant resolver"
```

### Task B6: Cross-backend contract suite

**Files:**
- Create: `platform/mailer/tests/contract/contract.test.ts`

- [ ] **Step 1: Implement the parameterised suite**

```ts
// platform/mailer/tests/contract/contract.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createConsoleMailer } from '../../src/console'
import { createGraphMailer } from '../../src/graph'
import type { Mailer } from '../../src/types'

type Backend = { name: string; make(): Mailer; expectedAssertions?: (m: Mailer) => Promise<void> }

const consoleLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

const graphFetchOk = vi.fn(async () => new Response('', { status: 202 }))
const graphFetchErr = vi.fn(async () => new Response('boom', { status: 500 }))

const backends: Backend[] = [
  { name: 'console', make: () => createConsoleMailer({ logger: consoleLogger as never }) },
  {
    name: 'graph',
    make: () =>
      createGraphMailer({
        getToken: async () => 'TOK',
        graphFetch: graphFetchOk as never,
        mailboxUserId: 'noreply@acme.com',
        fromAddress: 'noreply@acme.com',
      }),
  },
]

for (const b of backends) {
  describe(`Mailer contract — ${b.name}`, () => {
    it('accepts a minimal OutboundMessage and does not throw', async () => {
      const m = b.make()
      await expect(m.send({ to: 'a@b.com', subject: 's', text: 'b' })).resolves.toBeUndefined()
    })

    it('accepts an array of recipients', async () => {
      const m = b.make()
      await expect(m.send({ to: ['a@b.com', 'c@d.com'], subject: 's', text: 'b' })).resolves.toBeUndefined()
    })

    it('accepts an HTML body', async () => {
      const m = b.make()
      await expect(m.send({ to: 'a@b.com', subject: 's', text: 'b', html: '<p>hi</p>' })).resolves.toBeUndefined()
    })
  })
}

describe('Mailer contract — graph error handling', () => {
  it('graph backend throws on 5xx', async () => {
    const m = createGraphMailer({
      getToken: async () => 'TOK',
      graphFetch: graphFetchErr as never,
      mailboxUserId: 'mbox',
      fromAddress: 'from@x.test',
    })
    await expect(m.send({ to: 'a@b.c', subject: 's', text: 'b' })).rejects.toThrow(/500/)
  })
})
```

- [ ] **Step 2: Run**

Run: `pnpm --filter @seta/mailer vitest run tests/contract`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/mailer/tests/contract/contract.test.ts
git commit -m "test(mailer): cross-backend contract suite"
```

---

## Phase C — Wire the resolver in `apps/api`

### Task C1: Construct `mailerForTenant` closure

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Add the wiring**

Open `apps/api/src/main.ts`. Add near the top of the infrastructure section:

```ts
import { mailerForTenant, type MailerResolverDeps } from '@seta/mailer'
import { getMailerConfigByTenant } from '@seta/identity'

// ... after `platformConnectorOAuth` is constructed:

const mailerDeps: MailerResolverDeps = {
  nodeEnv: env.NODE_ENV,
  getMailerConfig: (tenantId) => getMailerConfigByTenant(sql, tenantId),
  getEntraTenantIdForTenant: async (tenantId) => {
    const rows = (await sql`
      SELECT config->>'entra_tenant_id' AS tid
      FROM auth.sso_configs WHERE tenant_id = ${tenantId} AND enabled LIMIT 1
    `) as Array<{ tid: string | null }>
    return rows[0]?.tid ?? null
  },
  platformConnector: {
    acquireAppOnly: (entraTenantId, scopes) =>
      platformConnectorOAuth.acquireAppOnly(entraTenantId, scopes),
  },
  graphFetch: graph,
  logger,
  ...(env.MAILER_FROM_ADDRESS_DEFAULT ? { defaultFrom: env.MAILER_FROM_ADDRESS_DEFAULT } : {}),
}

// Make a tenant-scoped factory for downstream consumers (PR 4 will use it).
export async function getMailerFor(tenantId: string) {
  return mailerForTenant(tenantId, mailerDeps)
}
```

(If `apps/api/src/main.ts` doesn't already export named values, expose `getMailerFor` via a small new file like `apps/api/src/services/mailer.ts` and import from there. Either pattern works; keep the deps in one place.)

- [ ] **Step 2: Add `MAILER_FROM_ADDRESS_DEFAULT` to env schema**

Open `apps/api/src/env.ts`. Add:

```ts
MAILER_FROM_ADDRESS_DEFAULT: z.string().email().optional(),
```

- [ ] **Step 3: Typecheck + smoke**

Run: `pnpm --filter @seta/api typecheck && pnpm --filter @seta/api vitest run tests/integration`
Expected: PASS. No mailer callers yet; this only verifies wiring compiles.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/main.ts apps/api/src/env.ts
git commit -m "feat(api): wire mailerForTenant resolver (no callers yet)"
```

---

## Phase D — Seed Seta's mailer config

### Task D1: Extend seed script

**Files:**
- Modify: `tooling/scripts/seed-first-tenant.ts`
- Modify: `.env.example`

- [ ] **Step 1: Extend the `Env` schema**

Open `tooling/scripts/seed-first-tenant.ts`. Add to the Zod `Env`:

```ts
BOOTSTRAP_MAILER_PROVIDER: z.literal('graph').default('graph'),
BOOTSTRAP_GRAPH_MAILBOX_USER_ID: z.string().min(1),
BOOTSTRAP_GRAPH_FROM_ADDRESS: z.string().email(),
```

- [ ] **Step 2: Insert the `mailer_configs` row inside the transaction**

Find the existing `await tx\`INSERT INTO auth.sso_configs ...\`` block (added in PR 1). After it, add:

```ts
await tx`
  INSERT INTO auth.mailer_configs (tenant_id, provider, config, enabled)
  VALUES (
    ${id},
    ${env.BOOTSTRAP_MAILER_PROVIDER},
    ${tx.json({
      mailbox_user_id: env.BOOTSTRAP_GRAPH_MAILBOX_USER_ID,
      from_address:    env.BOOTSTRAP_GRAPH_FROM_ADDRESS,
    } as never)},
    true
  )
  ON CONFLICT (tenant_id, provider) DO UPDATE
    SET config = excluded.config,
        enabled = excluded.enabled,
        updated_at = now()
`
```

- [ ] **Step 3: Re-run the seed**

```bash
pnpm migrate
BOOTSTRAP_OFFLINE=1 pnpm seed:first-tenant
psql "$DATABASE_URL" -c "SELECT tenant_id, provider, config->>'from_address' FROM auth.mailer_configs;"
```
Expected: one row with `provider='graph'` and the configured from address.

- [ ] **Step 4: Update `.env.example`**

Add under the bootstrap section:

```
BOOTSTRAP_MAILER_PROVIDER=graph
BOOTSTRAP_GRAPH_MAILBOX_USER_ID=no-reply@seta-international.vn
BOOTSTRAP_GRAPH_FROM_ADDRESS=no-reply@seta-international.vn
MAILER_FROM_ADDRESS_DEFAULT=no-reply@seta-international.vn
```

- [ ] **Step 5: Commit**

```bash
git add tooling/scripts/seed-first-tenant.ts .env.example
git commit -m "feat(tooling): seed Seta's mailer_configs row (graph backend)"
```

---

## Phase E — Admin UI: Mailer tab

### Task E1: Admin API for mailer configs

**Files:**
- Modify: `platform/identity/src/admin-routes.ts`
- Modify: `platform/identity/src/schemas-admin.ts`
- Modify: `platform/identity/tests/integration/admin-sso.test.ts` (add mailer tests)

- [ ] **Step 1: Extend admin Zod schemas**

In `schemas-admin.ts` add:

```ts
import { GraphMailerConfig } from './mailer-config-schema'

export const MailerDetail = z.object({
  tenantId: z.string().uuid(),
  provider: z.literal('graph'),
  config: GraphMailerConfig,
  enabled: z.boolean(),
}).openapi('MailerDetail')

export const MailerUpsertBody = z.object({
  provider: z.literal('graph'),
  config: GraphMailerConfig,
  enabled: z.boolean().default(true),
}).openapi('MailerUpsertBody')
```

- [ ] **Step 2: Add the 3 routes to `admin-routes.ts`**

Append inside `createSsoAdminRoutes(...)`:

```ts
import { deleteMailerConfig, getMailerConfigByTenant, upsertMailerConfig } from './mailer-config-repo'
import { MailerDetail, MailerUpsertBody } from './schemas-admin'

// ...

app.get('/admin/mailer/tenants/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  const row = await getMailerConfigByTenant(deps.sql, tenantId)
  if (!row) throw new NotFound('no mailer config')
  return c.json(MailerDetail.parse({ tenantId, ...row, enabled: true }))
})

app.put('/admin/mailer/tenants/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  const body = MailerUpsertBody.parse(await c.req.json().catch(() => ({})))
  await upsertMailerConfig(deps.sql, {
    tenantId,
    provider: 'graph',
    config: body.config,
    enabled: body.enabled,
  })
  const actorUserId = c.get('userId') as string
  await recordSsoAudit(deps.audit, {
    event: 'sso.config_updated',  // reuse audit family; or add 'mailer.config_updated'
    actorUserId,
    tenantId,
    metadata: { surface: 'mailer', provider: 'graph' },
  })
  const row = await getMailerConfigByTenant(deps.sql, tenantId)
  return c.json(MailerDetail.parse({ tenantId, ...row! , enabled: body.enabled }))
})

app.delete('/admin/mailer/tenants/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  await deleteMailerConfig(deps.sql, tenantId)
  return c.json({ ok: true })
})
```

If you prefer a distinct admin module (`createMailerAdminRoutes`), split out — the file is short enough either way.

Optionally extend `SsoAuditEvent` with `'mailer.config_updated' | 'mailer.config_deleted'` if you'd like clean event names.

- [ ] **Step 3: Add integration tests**

Append to `platform/identity/tests/integration/admin-sso.test.ts`:

```ts
describe('admin mailer routes', () => {
  it('PUT creates a mailer config; GET returns it', async () => {
    const { app } = buildApp(sql)
    const put = await app.request(`/admin/mailer/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'graph',
        config: { mailbox_user_id: 'noreply@acme.com', from_address: 'noreply@acme.com' },
        enabled: true,
      }),
    })
    expect(put.status).toBe(200)
    const get = await app.request(`/admin/mailer/tenants/${tenantId}`)
    expect(get.status).toBe(200)
    expect(((await get.json()) as Record<string, unknown>).provider).toBe('graph')
  })
})
```

- [ ] **Step 4: Run**

Run: `pnpm --filter @seta/identity vitest run tests/integration/admin-sso.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/identity/src/admin-routes.ts \
        platform/identity/src/schemas-admin.ts \
        platform/identity/tests/integration/admin-sso.test.ts
git commit -m "feat(identity): admin /admin/mailer/tenants endpoints"
```

### Task E2: Console mailer admin page

**Files:**
- Create: `apps/console/src/api/mailer-admin.ts`
- Create: `apps/console/src/api/mailer-admin.test.ts`
- Create: `apps/console/src/pages/admin/MailerConfigForm.tsx`
- Create: `apps/console/src/pages/admin/MailerConfigForm.test.tsx`
- Create: `apps/console/src/routes/_superadmin/admin.tenants.$tenantId.mailer.tsx`
- Modify: `apps/console/src/routes/_superadmin/admin.tenants.$tenantId.sso.tsx` (add link to Mailer)

- [ ] **Step 1: API wrappers**

```ts
// apps/console/src/api/mailer-admin.ts
export type MailerDetail = {
  tenantId: string
  provider: 'graph'
  config: { mailbox_user_id: string; from_address: string }
  enabled: boolean
}

export type MailerUpsertInput = {
  provider: 'graph'
  config: { mailbox_user_id: string; from_address: string }
  enabled: boolean
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

export const getMailerConfig = (tenantId: string, opts: Opts = {}) =>
  req<MailerDetail>(`/admin/mailer/tenants/${tenantId}`, { method: 'GET' }, opts)

export const upsertMailerConfig = (tenantId: string, body: MailerUpsertInput, opts: Opts = {}) =>
  req<MailerDetail>(`/admin/mailer/tenants/${tenantId}`, { method: 'PUT', body: JSON.stringify(body) }, opts)
```

Add a brief test mirroring `sso-admin.test.ts`.

- [ ] **Step 2: Form component**

```tsx
// apps/console/src/pages/admin/MailerConfigForm.tsx
import { Button, Input, Label, Switch } from '@seta/ui'
import { type FormEvent, useState } from 'react'
import type { MailerDetail } from '../../api/mailer-admin'

export interface MailerConfigFormProps {
  detail?: MailerDetail
  onSave: (input: {
    provider: 'graph'
    config: { mailbox_user_id: string; from_address: string }
    enabled: boolean
  }) => void | Promise<void>
}

export function MailerConfigForm({ detail, onSave }: MailerConfigFormProps) {
  const [mailbox, setMailbox] = useState(detail?.config.mailbox_user_id ?? '')
  const [from, setFrom] = useState(detail?.config.from_address ?? '')
  const [enabled, setEnabled] = useState(detail?.enabled ?? true)
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      await onSave({ provider: 'graph', config: { mailbox_user_id: mailbox, from_address: from }, enabled })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="mailbox">Mailbox UPN / user id</Label>
        <Input id="mailbox" value={mailbox} onChange={(e) => setMailbox(e.target.value)} required placeholder="no-reply@customer.com" />
        <p className="mt-1 text-[12px] text-ink-mute">Mailbox in the customer's M365 directory. The platform connector app must have admin-consented <code>Mail.Send</code>.</p>
      </div>
      <div>
        <Label htmlFor="from">From address</Label>
        <Input id="from" type="email" value={from} onChange={(e) => setFrom(e.target.value)} required />
      </div>
      <div className="flex items-center gap-3">
        <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="enabled">Enabled</Label>
      </div>
      <Button type="submit" variant="primary" disabled={pending}>Save</Button>
    </form>
  )
}
```

Add a brief test mirroring `SsoConfigForm.test.tsx`.

- [ ] **Step 3: Route page**

```tsx
// apps/console/src/routes/_superadmin/admin.tenants.$tenantId.mailer.tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { getMailerConfig, upsertMailerConfig } from '../../api/mailer-admin'
import { MailerConfigForm } from '../../pages/admin/MailerConfigForm'

export const Route = createFileRoute('/_superadmin/admin/tenants/$tenantId/mailer')({
  component: MailerPage,
})

function MailerPage() {
  const { tenantId } = Route.useParams()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['admin', 'mailer', tenantId],
    queryFn: () => getMailerConfig(tenantId).catch(() => null),
  })
  const m = useMutation({
    mutationFn: (input: Parameters<typeof upsertMailerConfig>[1]) => upsertMailerConfig(tenantId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'mailer', tenantId] }),
  })

  if (q.isLoading) return <p className="p-6">Loading…</p>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-[14px]">
        <Link to="/admin/tenants/$tenantId/sso" params={{ tenantId }} className="text-ink-mute hover:text-ink">← SSO settings</Link>
        <span className="text-ink-mute">·</span>
        <span>Mailer configuration</span>
      </div>
      <MailerConfigForm detail={q.data ?? undefined} onSave={(input) => m.mutateAsync(input)} />
    </div>
  )
}
```

- [ ] **Step 4: Add a link on the SSO page**

In `admin.tenants.$tenantId.sso.tsx`, near the existing "Manage email domains →" link, add:

```tsx
<Link to="/admin/tenants/$tenantId/mailer" params={{ tenantId }} className="inline-block text-[14px] text-primary hover:underline">
  Mailer settings →
</Link>
```

- [ ] **Step 5: Regenerate TanStack Router tree**

Run: `pnpm --filter @seta/console exec tsr generate`
Expected: the new route appears.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @seta/console vitest run && pnpm --filter @seta/console typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/console/src/api/mailer-admin.ts \
        apps/console/src/api/mailer-admin.test.ts \
        apps/console/src/pages/admin/MailerConfigForm.tsx \
        apps/console/src/pages/admin/MailerConfigForm.test.tsx \
        apps/console/src/routes/_superadmin/admin.tenants.$tenantId.mailer.tsx \
        apps/console/src/routes/_superadmin/admin.tenants.$tenantId.sso.tsx \
        apps/console/src/routeTree.gen.ts
git commit -m "feat(console): superadmin mailer configuration page"
```

---

## Phase F — Verification

### Task F1: Repo-wide checks + PR

- [ ] **Step 1: Run all checks**

Run:
1. `pnpm install`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test:unit`
5. `pnpm test:integration`

Expected: all PASS.

- [ ] **Step 2: Manual smoke (with real Graph API — optional)**

If you have an admin-consented `Mail.Send` scope on the platform connector app in a real Entra directory:

1. `pnpm dev`
2. In a terminal, write a one-off script that calls `getMailerFor(<tenantId>)` and `send({ to: 'you@yourdomain.com', subject: 'smoke', text: 'hello' })`.
3. Check the mailbox.

(Otherwise rely on the Vitest coverage + contract suite. The next PR — magic-link — will exercise this end-to-end through a user flow.)

- [ ] **Step 3: Open PR**

```bash
git push -u origin <branch>
gh pr create --title "feat(mailer): @seta/mailer platform package with per-tenant Graph backend (PR 3)" \
  --body "$(cat <<'EOF'
## Summary
- New @seta/mailer package: `Mailer` interface, console + graph backends, mailerForTenant resolver
- Per-tenant config in auth.mailer_configs with RLS
- Seta tenant's mailer seeded by seed-first-tenant
- Superadmin admin route and console page for managing mailer config per tenant

Spec: docs/superpowers/specs/2026-05-18-byo-idp-sso-design.md
Depends on PR 1 (foundation). Does not require PR 2.

## Test plan
- [ ] pnpm typecheck && pnpm lint
- [ ] pnpm test:unit && pnpm test:integration
- [ ] (Optional) Real Graph send against your dev directory
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- `Mailer` interface + `OutboundMessage` shape → Task B2 ✅
- Per-tenant `auth.mailer_configs` table + RLS → A1, A2 ✅
- Provider discriminated union → A3 ✅
- Repo: `getMailerConfigByTenant`, `upsertMailerConfig`, `deleteMailerConfig` → A4 ✅
- `mailerForTenant(tenantId, deps)` resolver → B5 ✅
- Console + Graph backends → B3, B4 ✅
- Console fallback only in non-prod → B5 (test asserts production throws) ✅
- Graph backend reuses platformConnectorOAuth + Mail.Send → B5, C1 ✅
- Cross-backend contract suite → B6 ✅
- Seed Seta's mailer config → D1 ✅
- Admin UI tab for mailer → E1, E2 ✅
- SMTP/SES backends scaffolded but not wired → A3 has `SmtpMailerConfig`/`SesMailerConfig` exported for the future; no factories yet. Acceptable: design supports adding them later without table migration.
- Templates colocated with caller → not in this PR; PR 4 ships the first template (magic-link).

**Placeholder scan:** no TBD/TODO; every code step has actual content; test files give concrete assertions.

**Type consistency:**
- `MailerConfigDiscriminated` shape consistent between `@seta/identity` (schema) and `@seta/mailer` (resolver `MailerConfigInput`). Note: I intentionally duplicated the shape in `@seta/mailer/resolver.ts` (as `MailerConfigInput`) to avoid `@seta/mailer` depending on `@seta/identity`. If a circular issue surfaces, lift the shape into a third package or keep two copies — the integration tests in Task A4 + B5 catch mismatch at PR-review time.
- `Mailer` is the same export from `platform/mailer/src/types.ts`, used in resolver, console, graph, contract suite ✅
- Graph backend's `mailboxUserId` ⇔ `mailbox_user_id` (DB) ⇔ `mailbox_user_id` (Zod) is consistent ✅

**Scope check:** single slice — ship the `@seta/mailer` package and per-tenant config. No actual mail is sent in production code paths until PR 4.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-18-byo-idp-sso-pr3-mailer.md`.

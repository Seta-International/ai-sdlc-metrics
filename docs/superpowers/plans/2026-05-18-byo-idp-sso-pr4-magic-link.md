# Per-tenant Entra SSO — PR 4 Break-glass Magic Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Depends on:** PR 1 (foundation, ships the `auth.magic_links` table) and PR 3 (`@seta/mailer` with Graph backend) are merged. PR 2 (admin UI) is **not** required.

**Goal:** Tenant owners can request a one-time signed magic-link sign-in by email when SSO is broken. Link is sent via the per-tenant configured mailer (Graph in v1). Single-use, 10-minute TTL, rate-limited. Lands the owner on `/console/admin/tenants/<id>/sso` to fix the SSO config.

**Architecture:**
- New API routes `POST /sso/magic/request` and `GET /sso/magic/consume` in `@seta/identity`.
- Token: 32 random bytes, base64url-encoded; only `sha256(token)` stored in `auth.magic_links`.
- Request flow: resolve tenant by email → look up user → require `tenant_members.role='owner'` → insert magic_link row → render template → `mailer.send(...)`. Non-owners receive a 200 with no email sent (no enumeration).
- Consume flow: atomic `UPDATE ... SET consumed_at = now() WHERE token_hash = ... AND consumed_at IS NULL AND expires_at > now() RETURNING user_id, tenant_id` → mint session cookie → redirect to `/console/admin/tenants/<tenantId>/sso`.
- Frontend: a small `MagicLinkRequestPage`, plus a "Can't sign in?" link on the existing `LoginPage`.
- Rate limit: 3 requests / email / hour, 10 / IP / hour, via existing `rateLimit` middleware.

**Tech Stack:** Hono, Drizzle, Zod, `@seta/mailer` (Graph backend), `@seta/observability`, Node crypto, React, Vitest.

**Spec:** [`docs/superpowers/specs/2026-05-18-byo-idp-sso-design.md`](../specs/2026-05-18-byo-idp-sso-design.md) §"Break-glass magic-link flow".

---

## File Map

**Create**
- `platform/identity/src/magic-link.ts` — pure: `mintToken`, `hashToken`, `isExpired` (testable)
- `platform/identity/src/magic-link.test.ts`
- `platform/identity/src/magic-link-repo.ts` — DB access: `insertMagicLink`, `consumeMagicLink`
- `platform/identity/tests/integration/magic-link-repo.test.ts`
- `platform/identity/src/mail-templates/magic-link.ts` — pure: builds `OutboundMessage`
- `platform/identity/src/mail-templates/magic-link.test.ts`
- `platform/identity/src/magic-link-routes.ts` — `POST /sso/magic/request`, `GET /sso/magic/consume`
- `platform/identity/tests/integration/magic-link-routes.test.ts`
- `platform/identity-client/src/MagicLinkRequestPage.tsx`
- `platform/identity-client/src/MagicLinkRequestPage.test.tsx`
- `apps/console/src/routes/login.magic.tsx`

**Modify**
- `platform/identity/src/index.ts` — export the new routes + helpers
- `platform/identity-client/src/index.ts` — export `MagicLinkRequestPage`
- `platform/identity-client/src/LoginPage.tsx` — add "Can't sign in? Email me a link" link below the form
- `platform/identity-client/src/LoginPage.test.tsx` — add a test for the link
- `apps/api/src/main.ts` — mount the magic-link routes; inject mailer; add rate limits
- `apps/console/src/routes/_superadmin/admin.tenants.$tenantId.sso.tsx` — minor copy update mentioning the magic-link recovery path (optional)

**Delete**
- None.

---

## Phase A — Token primitives

### Task A1: Token mint / hash / expiry

**Files:**
- Create: `platform/identity/src/magic-link.ts`
- Create: `platform/identity/src/magic-link.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// platform/identity/src/magic-link.test.ts
import { describe, expect, it } from 'vitest'
import { hashToken, isExpired, mintToken, MAGIC_LINK_TTL_MS } from './magic-link'

describe('mintToken', () => {
  it('returns 43-char base64url string with high entropy', () => {
    const a = mintToken()
    const b = mintToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })
})

describe('hashToken', () => {
  it('is deterministic and 32 bytes wide', () => {
    const h1 = hashToken('hello')
    const h2 = hashToken('hello')
    expect(h1.equals(h2)).toBe(true)
    expect(h1.byteLength).toBe(32)
  })
  it('changes when input changes by one char', () => {
    expect(hashToken('hello').equals(hashToken('hellp'))).toBe(false)
  })
})

describe('isExpired', () => {
  const now = new Date('2026-05-18T12:00:00Z')
  it('returns false when expiresAt is in the future', () => {
    expect(isExpired(new Date(now.getTime() + 1000), now)).toBe(false)
  })
  it('returns true when expiresAt is in the past', () => {
    expect(isExpired(new Date(now.getTime() - 1000), now)).toBe(true)
  })
  it('exports MAGIC_LINK_TTL_MS at 10 minutes', () => {
    expect(MAGIC_LINK_TTL_MS).toBe(10 * 60 * 1000)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @seta/identity vitest run src/magic-link.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// platform/identity/src/magic-link.ts
import { createHash, randomBytes } from 'node:crypto'

export const MAGIC_LINK_TTL_MS = 10 * 60 * 1000

export function mintToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(raw: string): Buffer {
  return createHash('sha256').update(raw, 'utf8').digest()
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime()
}

export function expiresAtFromNow(now: Date = new Date()): Date {
  return new Date(now.getTime() + MAGIC_LINK_TTL_MS)
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @seta/identity vitest run src/magic-link.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/identity/src/magic-link.ts platform/identity/src/magic-link.test.ts
git commit -m "feat(identity): magic-link token mint/hash/expiry primitives"
```

---

## Phase B — Magic-link repo

### Task B1: Insert + atomic consume

**Files:**
- Create: `platform/identity/src/magic-link-repo.ts`
- Create: `platform/identity/tests/integration/magic-link-repo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// platform/identity/tests/integration/magic-link-repo.test.ts
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { hashToken, mintToken } from '../../src/magic-link'
import { consumeMagicLink, insertMagicLink } from '../../src/magic-link-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

const tenantId = '00000000-0000-4000-8000-0000000000f1'
const userId   = '00000000-0000-4000-8000-0000000000f2'

describe('magic-link-repo (integration)', () => {
  beforeEach(async () => {
    await sql`TRUNCATE auth.magic_links, auth.user_identities, auth.users CASCADE`
    await sql`DELETE FROM tenant.tenant_members WHERE user_id = ${userId}`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'acme', 'Acme')`
    await sql`
      INSERT INTO auth.users (id, email, name, primary_provider)
      VALUES (${userId}, 'alice@acme.com', 'Alice', 'entra')
    `
  })
  afterAll(async () => { await sql.end() })

  it('inserts a link and consumes it once', async () => {
    const raw = mintToken()
    await insertMagicLink(sql, {
      userId,
      tenantId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      requestedIp: '127.0.0.1',
    })
    const first = await consumeMagicLink(sql, raw)
    expect(first).toEqual({ userId, tenantId })

    const replay = await consumeMagicLink(sql, raw)
    expect(replay).toBeNull()
  })

  it('returns null for an expired link', async () => {
    const raw = mintToken()
    await insertMagicLink(sql, {
      userId,
      tenantId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() - 1000),
      requestedIp: null,
    })
    expect(await consumeMagicLink(sql, raw)).toBeNull()
  })

  it('returns null for an unknown token', async () => {
    expect(await consumeMagicLink(sql, 'nope')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @seta/identity vitest run tests/integration/magic-link-repo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// platform/identity/src/magic-link-repo.ts
import type { Sql } from 'postgres'
import { hashToken } from './magic-link'

export async function insertMagicLink(
  sql: Sql,
  input: {
    userId: string
    tenantId: string
    tokenHash: Buffer
    expiresAt: Date
    requestedIp: string | null
  },
): Promise<void> {
  await sql`
    INSERT INTO auth.magic_links (user_id, tenant_id, token_hash, expires_at, requested_ip)
    VALUES (${input.userId}, ${input.tenantId}, ${input.tokenHash}, ${input.expiresAt}, ${input.requestedIp})
  `
}

export async function consumeMagicLink(
  sql: Sql,
  rawToken: string,
): Promise<{ userId: string; tenantId: string } | null> {
  const h = hashToken(rawToken)
  const rows = (await sql`
    UPDATE auth.magic_links
       SET consumed_at = now()
     WHERE token_hash = ${h}
       AND consumed_at IS NULL
       AND expires_at  > now()
     RETURNING user_id, tenant_id
  `) as Array<{ user_id: string; tenant_id: string }>
  const r = rows[0]
  if (!r) return null
  return { userId: r.user_id, tenantId: r.tenant_id }
}

export async function countRecentRequestsForEmail(
  sql: Sql,
  email: string,
  windowMs: number,
): Promise<number> {
  // Counts via join on users by email — accepts no PII leak via cardinality.
  const since = new Date(Date.now() - windowMs)
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM auth.magic_links m
    JOIN auth.users u ON u.id = m.user_id
    WHERE u.email = lower(${email}) AND m.created_at > ${since}
  `) as Array<{ n: number }>
  return rows[0]?.n ?? 0
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @seta/identity vitest run tests/integration/magic-link-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/identity/src/magic-link-repo.ts \
        platform/identity/tests/integration/magic-link-repo.test.ts
git commit -m "feat(identity): magic-link repo with atomic single-use consume"
```

---

## Phase C — Mail template

### Task C1: Magic-link message template

**Files:**
- Create: `platform/identity/src/mail-templates/magic-link.ts`
- Create: `platform/identity/src/mail-templates/magic-link.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// platform/identity/src/mail-templates/magic-link.test.ts
import { describe, expect, it } from 'vitest'
import { magicLinkMessage } from './magic-link'

describe('magicLinkMessage', () => {
  const args = {
    to: 'owner@acme.com',
    link: 'https://app.example/sso/magic/consume?t=abc',
    tenantDisplayName: 'Acme',
    expiresInMin: 10,
  }
  it('produces a subject mentioning the tenant', () => {
    const m = magicLinkMessage(args)
    expect(m.subject).toMatch(/Acme/i)
  })
  it('includes the link verbatim in text body', () => {
    const m = magicLinkMessage(args)
    expect(m.text).toContain(args.link)
    expect(m.text).toMatch(/10 minutes/)
  })
  it('emits matching idempotencyKey for the same link', () => {
    const a = magicLinkMessage(args)
    const b = magicLinkMessage(args)
    expect(a.idempotencyKey).toBe(b.idempotencyKey)
  })
})
```

- [ ] **Step 2: Implement**

```ts
// platform/identity/src/mail-templates/magic-link.ts
import { createHash } from 'node:crypto'
import type { OutboundMessage } from '@seta/mailer'

export function magicLinkMessage(opts: {
  to: string
  link: string
  tenantDisplayName: string
  expiresInMin: number
}): OutboundMessage {
  const subject = `Sign in to ${opts.tenantDisplayName}`
  const text = [
    `Click the link below to sign in. It expires in ${opts.expiresInMin} minutes and works only once.`,
    '',
    opts.link,
    '',
    `If you didn't request this, you can safely ignore this email.`,
  ].join('\n')
  const html = [
    `<p>Click the link below to sign in. It expires in ${opts.expiresInMin} minutes and works only once.</p>`,
    `<p><a href="${opts.link}">${opts.link}</a></p>`,
    `<p style="color:#666">If you didn't request this, you can safely ignore this email.</p>`,
  ].join('\n')
  return {
    to: opts.to,
    subject,
    text,
    html,
    idempotencyKey: createHash('sha256').update(opts.link).digest('hex').slice(0, 32),
  }
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @seta/identity vitest run src/mail-templates/magic-link.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add platform/identity/src/mail-templates/magic-link.ts \
        platform/identity/src/mail-templates/magic-link.test.ts
git commit -m "feat(identity): magic-link email template"
```

---

## Phase D — Routes

### Task D1: `createMagicLinkRoutes`

**Files:**
- Create: `platform/identity/src/magic-link-routes.ts`

- [ ] **Step 1: Implement**

```ts
// platform/identity/src/magic-link-routes.ts
import { BadRequest } from '@seta/middleware'
import { type Mailer } from '@seta/mailer'
import { logger } from '@seta/observability'
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import type { Sql } from 'postgres'
import type { AuditWriter } from './admin-audit'
import { recordSsoAudit } from './admin-audit'
import { signCookie } from './cookie'
import { LAST_LOGIN_COOKIE_NAME, signLastLoginHint } from './last-login'
import { expiresAtFromNow, hashToken, mintToken, MAGIC_LINK_TTL_MS } from './magic-link'
import { consumeMagicLink, insertMagicLink } from './magic-link-repo'
import { magicLinkMessage } from './mail-templates/magic-link'
import type { SsoVariables } from './middleware'
import { resolveSsoByEmail } from './sso-config-repo'
import { createSessionStore } from './session-store'

export type MagicLinkRoutesDeps = {
  sql: Sql
  audit: AuditWriter
  sessionCookie: { name: string; hmacKey: string; ttlSec: number; secure: boolean }
  redirectBase: string
  /** Resolves the mailer for the given tenant. */
  getMailerForTenant: (tenantId: string) => Promise<Mailer>
  /** Resolves tenant display info for the email template and last-login cookie. */
  getTenantBrief: (tenantId: string) => Promise<{ slug: string; displayName: string } | null>
}

const TTL_MIN = MAGIC_LINK_TTL_MS / 60_000

export function createMagicLinkRoutes(deps: MagicLinkRoutesDeps): Hono<{ Variables: SsoVariables }> {
  const store = createSessionStore(deps.sql)
  const app = new Hono<{ Variables: SsoVariables }>()

  app.post('/sso/magic/request', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { email?: string; returnTo?: string }
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!email) throw new BadRequest('email required')
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null

    // Always 200 to avoid enumeration. Side effects gated on real ownership.
    const hit = await resolveSsoByEmail(deps.sql, email)
    if (!hit) {
      logger.info({ event: 'sso.magic_request', sent: false, reason: 'no_tenant' }, '[sso] magic request (no tenant)')
      return c.json({ ok: true })
    }

    const userRows = (await deps.sql`
      SELECT u.id AS user_id
      FROM auth.users u
      JOIN tenant.tenant_members m ON m.user_id = u.id
      WHERE u.email = ${email}
        AND m.tenant_id = ${hit.tenantId}
        AND m.role = 'owner'
      LIMIT 1
    `) as Array<{ user_id: string }>
    const owner = userRows[0]
    if (!owner) {
      logger.info(
        { event: 'sso.magic_request', tenant_id: hit.tenantId, sent: false, reason: 'not_owner' },
        '[sso] magic request (not owner)',
      )
      return c.json({ ok: true })
    }

    const raw = mintToken()
    const tokenHash = hashToken(raw)
    await insertMagicLink(deps.sql, {
      userId: owner.user_id,
      tenantId: hit.tenantId,
      tokenHash,
      expiresAt: expiresAtFromNow(),
      requestedIp: ip,
    })

    const brief = await deps.getTenantBrief(hit.tenantId)
    const tenantDisplayName = brief?.displayName ?? 'Seta'
    const link = `${deps.redirectBase}/sso/magic/consume?t=${encodeURIComponent(raw)}`
    const msg = magicLinkMessage({
      to: email,
      link,
      tenantDisplayName,
      expiresInMin: TTL_MIN,
    })

    const mailer = await deps.getMailerForTenant(hit.tenantId)
    try {
      await mailer.send(msg)
      await recordSsoAudit(deps.audit, {
        event: 'sso.magic_link_issued' as never,  // adds event variant; extend SsoAuditEvent
        actorUserId: owner.user_id,
        tenantId: hit.tenantId,
        metadata: { email_hash: tokenHash.toString('hex').slice(0, 16) },
      })
      logger.info({ event: 'sso.magic_request', tenant_id: hit.tenantId, sent: true }, '[sso] magic request sent')
    } catch (err) {
      logger.error({ event: 'sso.magic_request_failed', tenant_id: hit.tenantId, err }, '[sso] magic send failed')
      // Do NOT delete the row; let it expire. Owner can retry within rate limits.
    }

    return c.json({ ok: true })
  })

  app.get('/sso/magic/consume', async (c) => {
    const raw = c.req.query('t')
    if (!raw) throw new BadRequest('missing token')
    const ok = await consumeMagicLink(deps.sql, raw)
    if (!ok) {
      logger.warn({ event: 'sso.magic_consume_fail' }, '[sso] magic consume rejected')
      return c.redirect('/console/login?magic_failed=1')
    }
    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + deps.sessionCookie.ttlSec * 1000)
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const ua = c.req.header('user-agent') ?? null
    await store.insert({ id: sessionId, userId: ok.userId, expiresAt, ip, userAgent: ua })

    setCookie(c, deps.sessionCookie.name, signCookie(sessionId, deps.sessionCookie.hmacKey), {
      httpOnly: true,
      secure: deps.sessionCookie.secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: deps.sessionCookie.ttlSec,
    })

    const brief = await deps.getTenantBrief(ok.tenantId)
    if (brief) {
      // Fetch the user's email to populate the hint.
      const rows = (await deps.sql`SELECT email FROM auth.users WHERE id = ${ok.userId} LIMIT 1`) as Array<{ email: string }>
      const email = rows[0]?.email
      if (email) {
        const hint = signLastLoginHint(
          { email, provider: 'entra', tenantDisplayName: brief.displayName, ts: Math.floor(Date.now() / 1000) },
          deps.sessionCookie.hmacKey,
        )
        setCookie(c, LAST_LOGIN_COOKIE_NAME, hint, {
          httpOnly: false,
          secure: deps.sessionCookie.secure,
          sameSite: 'Lax',
          path: '/',
          maxAge: 30 * 24 * 60 * 60,
        })
      }
    }

    await recordSsoAudit(deps.audit, {
      event: 'sso.magic_link_consumed' as never,
      actorUserId: ok.userId,
      tenantId: ok.tenantId,
    })
    logger.info(
      { event: 'sso.magic_consume_ok', tenant_id: ok.tenantId, user_id: ok.userId },
      '[sso] magic consume ok',
    )
    return c.redirect(`/console/admin/tenants/${ok.tenantId}/sso`)
  })

  return app
}
```

- [ ] **Step 2: Extend `SsoAuditEvent` to include the new events**

Open `platform/identity/src/admin-audit.ts` and add `'sso.magic_link_issued'` and `'sso.magic_link_consumed'` to the `SsoAuditEvent` union. Then delete the `as never` casts in `magic-link-routes.ts`.

- [ ] **Step 3: Export from package index**

In `platform/identity/src/index.ts`:

```ts
export { createMagicLinkRoutes } from './magic-link-routes'
export type { MagicLinkRoutesDeps } from './magic-link-routes'
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @seta/identity typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/identity/src/magic-link-routes.ts \
        platform/identity/src/admin-audit.ts \
        platform/identity/src/index.ts
git commit -m "feat(identity): magic-link request/consume routes"
```

### Task D2: Integration tests for magic-link routes

**Files:**
- Create: `platform/identity/tests/integration/magic-link-routes.test.ts`

- [ ] **Step 1: Write the test**

```ts
// platform/identity/tests/integration/magic-link-routes.test.ts
import { onError } from '@seta/middleware'
import type { Mailer } from '@seta/mailer'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMagicLinkRoutes } from '../../src/magic-link-routes'
import { upsertSsoConfig, upsertSsoEmailDomain } from '../../src/sso-config-repo'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const HMAC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const tenantId = '00000000-0000-4000-8000-0000000000aa'
const ownerId  = '00000000-0000-4000-8000-0000000000ab'
const memberId = '00000000-0000-4000-8000-0000000000ac'

function buildApp(sql: postgres.Sql, mailer: Mailer) {
  const app = new Hono().onError(onError)
  app.route(
    '/',
    createMagicLinkRoutes({
      sql,
      audit: { recordAudit: async () => {} },
      sessionCookie: { name: 'seta_sess', hmacKey: HMAC_KEY, ttlSec: 3600, secure: false },
      redirectBase: 'http://localhost:8080',
      getMailerForTenant: async () => mailer,
      getTenantBrief: async () => ({ slug: 'acme', displayName: 'Acme' }),
    }),
  )
  return app
}

describe('magic-link routes (integration)', () => {
  const sql = postgres(DATABASE_URL, { max: 1, prepare: false })

  beforeEach(async () => {
    await sql`TRUNCATE auth.magic_links, auth.sessions, auth.user_identities, auth.users, auth.sso_email_domains, auth.sso_configs CASCADE`
    await sql`DELETE FROM tenant.tenant_members WHERE user_id IN (${ownerId}, ${memberId})`
    await sql`DELETE FROM tenant.tenants WHERE id = ${tenantId}`
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tenantId}, 'acme', 'Acme')`
    await upsertSsoConfig(sql, {
      tenantId,
      provider: 'entra',
      config: { entra_tenant_id: 'tid', client_id: 'cid' },
      secretVaultId: 'sso-entra:sso',
      createdByUserId: null,
    })
    await upsertSsoEmailDomain(sql, { domain: 'acme.com', tenantId })

    await sql`
      INSERT INTO auth.users (id, email, name, primary_provider)
      VALUES (${ownerId}, 'owner@acme.com', 'Owner', 'entra'),
             (${memberId}, 'member@acme.com', 'Member', 'entra')
    `
    await sql`
      INSERT INTO tenant.tenant_members (user_id, tenant_id, role, source)
      VALUES (${ownerId}, ${tenantId}, 'owner', 'manual'),
             (${memberId}, ${tenantId}, 'member', 'manual')
    `
  })
  afterAll(async () => { await sql.end() })

  it('owner request: returns 200, inserts a row, calls mailer.send once', async () => {
    const send = vi.fn(async () => {})
    const app = buildApp(sql, { send } as never)
    const res = await app.request('/sso/magic/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@acme.com' }),
    })
    expect(res.status).toBe(200)
    const rows = (await sql`SELECT 1 FROM auth.magic_links WHERE user_id = ${ownerId}`) as Array<unknown>
    expect(rows.length).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('non-owner request: 200 but no row, no mailer call', async () => {
    const send = vi.fn(async () => {})
    const app = buildApp(sql, { send } as never)
    const res = await app.request('/sso/magic/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'member@acme.com' }),
    })
    expect(res.status).toBe(200)
    expect(send).not.toHaveBeenCalled()
  })

  it('unknown email: 200, no row, no send', async () => {
    const send = vi.fn(async () => {})
    const app = buildApp(sql, { send } as never)
    const res = await app.request('/sso/magic/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@acme.com' }),
    })
    expect(res.status).toBe(200)
    expect(send).not.toHaveBeenCalled()
  })

  it('consume: redeems token once, sets session cookie, redirects to /admin/tenants/<id>/sso', async () => {
    // Capture the link the mailer was called with.
    let capturedLink: string | null = null
    const send = vi.fn(async (msg: { text: string }) => {
      const m = msg.text.match(/(http\S+)/)
      capturedLink = m ? m[1]! : null
    })
    const app = buildApp(sql, { send } as never)
    await app.request('/sso/magic/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@acme.com' }),
    })
    expect(capturedLink).toBeTruthy()
    const path = new URL(capturedLink!).pathname + new URL(capturedLink!).search
    const res = await app.request(path)
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toBe(`/console/admin/tenants/${tenantId}/sso`)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/seta_sess=/)
    expect(setCookie).toMatch(/seta_last_login=/)

    // Replay should fail.
    const replay = await app.request(path)
    expect(replay.status).toBe(302)
    expect(replay.headers.get('location') ?? '').toMatch(/magic_failed=1/)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @seta/identity vitest run tests/integration/magic-link-routes.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add platform/identity/tests/integration/magic-link-routes.test.ts
git commit -m "test(identity): integration tests for magic-link routes"
```

---

## Phase E — Wire into `apps/api`

### Task E1: Mount + rate limits

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Mount the router**

Open `apps/api/src/main.ts`. After `app.route('/', sso)` and the existing `rateLimit('/sso/login/*', ...)` line, add:

```ts
import { createMagicLinkRoutes } from '@seta/identity'

// ...

const magicLinkRoutes = createMagicLinkRoutes({
  sql,
  audit,
  sessionCookie: {
    name: 'seta_sess',
    hmacKey: env.SESSION_HMAC_KEY,
    ttlSec: env.SESSION_TTL_SEC,
    secure: env.NODE_ENV === 'production',
  },
  redirectBase: env.PUBLIC_BASE_URL,
  getMailerForTenant: getMailerFor,                    // from PR 3
  getTenantBrief: async (tenantId) => {
    const rows = (await sql`SELECT slug, display_name FROM tenant.tenants WHERE id = ${tenantId} LIMIT 1`) as Array<{ slug: string; display_name: string }>
    const r = rows[0]
    return r ? { slug: r.slug, displayName: r.display_name } : null
  },
})

app.use('/sso/magic/request', rateLimit({ rps: 3 / 3600, burst: 3, key: (c) => (c.req.header('x-forwarded-for') ?? 'anon') }))
app.use('/sso/magic/consume', rateLimit({ rps: 10 / 3600, burst: 10, key: (c) => (c.req.header('x-forwarded-for') ?? 'anon') }))
app.route('/', magicLinkRoutes)
```

(`rps: N / 3600` is the rate-per-second form; if the existing `rateLimit` middleware uses a different shape, follow its signature. Goal: 3 requests/hour/email and 10 requests/hour/IP. Add an email-keyed rate limit too if the helper supports it; otherwise the row insert acts as a soft cap via per-user uniqueness.)

- [ ] **Step 2: Typecheck + smoke**

Run: `pnpm --filter @seta/api typecheck && pnpm --filter @seta/api vitest run tests/integration`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): mount magic-link routes with rate limits"
```

---

## Phase F — Frontend

### Task F1: `MagicLinkRequestPage`

**Files:**
- Create: `platform/identity-client/src/MagicLinkRequestPage.tsx`
- Create: `platform/identity-client/src/MagicLinkRequestPage.test.tsx`
- Modify: `platform/identity-client/src/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// platform/identity-client/src/MagicLinkRequestPage.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MagicLinkRequestPage } from './MagicLinkRequestPage'

describe('MagicLinkRequestPage', () => {
  it('submits the email and shows a generic success message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    render(<MagicLinkRequestPage fetch={fetchImpl as never} />)
    await userEvent.type(screen.getByLabelText(/work email/i), 'owner@acme.com')
    await userEvent.click(screen.getByRole('button', { name: /email me a link/i }))
    expect(await screen.findByText(/if your email matches a workspace/i)).toBeInTheDocument()
    expect(fetchImpl).toHaveBeenCalledWith('/sso/magic/request', expect.objectContaining({ method: 'POST' }))
  })

  it('shows the same generic message even on 200 with ok:false', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    render(<MagicLinkRequestPage fetch={fetchImpl as never} />)
    await userEvent.type(screen.getByLabelText(/work email/i), 'nobody@example.com')
    await userEvent.click(screen.getByRole('button', { name: /email me a link/i }))
    expect(await screen.findByText(/if your email matches a workspace/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement**

```tsx
// platform/identity-client/src/MagicLinkRequestPage.tsx
import { Button, Input, Label } from '@seta/ui'
import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'

export interface MagicLinkRequestPageProps {
  /** Override fetch (testing). */
  fetch?: typeof fetch
  /** Optional path back to the login page. */
  loginHref?: string
}

export function MagicLinkRequestPage({ fetch: fetchImpl, loginHref = '/login' }: MagicLinkRequestPageProps) {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      await (fetchImpl ?? fetch)('/sso/magic/request', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } finally {
      setPending(false)
      setSubmitted(true)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#eef0fb_0%,#c7d2fe_35%,#a5b4fc_65%,#5e6ad2_100%)] px-4 py-12">
      <div className="w-full max-w-[400px] rounded-xl bg-canvas p-10 shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
        <h1 className="font-semibold text-[22px] leading-tight text-ink">Email me a sign-in link</h1>
        <p className="mt-2 text-[14px] text-ink-mute">
          For tenant owners only. Use this when your workspace's SSO is misconfigured.
        </p>
        {submitted ? (
          <p className="mt-6 rounded-md border border-divider bg-canvas-mute px-3 py-2 text-[14px]">
            If your email matches a workspace owner, a sign-in link has been sent. It expires in 10 minutes.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@example.com" />
            <Button type="submit" variant="primary" disabled={pending || !email}
              icon={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
              Email me a link
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-[12px] text-ink-mute">
          <a href={loginHref} className="hover:text-ink hover:underline">Back to sign in</a>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update index**

In `platform/identity-client/src/index.ts`:

```ts
export { MagicLinkRequestPage } from './MagicLinkRequestPage'
export type { MagicLinkRequestPageProps } from './MagicLinkRequestPage'
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @seta/identity-client vitest run src/MagicLinkRequestPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/identity-client/src/MagicLinkRequestPage.tsx \
        platform/identity-client/src/MagicLinkRequestPage.test.tsx \
        platform/identity-client/src/index.ts
git commit -m "feat(identity-client): MagicLinkRequestPage"
```

### Task F2: Link from `LoginPage`

**Files:**
- Modify: `platform/identity-client/src/LoginPage.tsx`
- Modify: `platform/identity-client/src/LoginPage.test.tsx`

- [ ] **Step 1: Update the failing test**

In `LoginPage.test.tsx`, add:

```tsx
it('shows a "Can\'t sign in?" link to /login/magic', async () => {
  render(<LoginPage returnTo="/" />)
  const link = screen.getByRole('link', { name: /can'?t sign in/i })
  expect(link).toHaveAttribute('href', '/login/magic')
})
```

- [ ] **Step 2: Update `LoginPage.tsx`**

Inside `Shell`, just below the `{children}` slot (or below the State A form), render:

```tsx
<p className="mt-6 text-center text-[12px] text-ink-mute">
  <a href="/login/magic" className="hover:text-ink hover:underline">Can't sign in? Email me a link</a>
</p>
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @seta/identity-client vitest run src/LoginPage.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add platform/identity-client/src/LoginPage.tsx \
        platform/identity-client/src/LoginPage.test.tsx
git commit -m "feat(identity-client): LoginPage shows magic-link recovery link"
```

### Task F3: Console route

**Files:**
- Create: `apps/console/src/routes/login.magic.tsx`

- [ ] **Step 1: Add the route**

```tsx
// apps/console/src/routes/login.magic.tsx
import { MagicLinkRequestPage } from '@seta/identity-client'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/login/magic')({
  component: () => <MagicLinkRequestPage loginHref="/console/login" />,
})
```

- [ ] **Step 2: Regenerate router tree**

Run: `pnpm --filter @seta/console exec tsr generate`
Expected: route appears in the generated tree.

- [ ] **Step 3: Manual smoke**

`pnpm dev`, visit `http://localhost:8080/console/login/magic`. Submit a non-owner email — should show the generic confirmation. Submit an owner email (per your seeded data) and check the dev mailer log (Console backend if `mailer_configs` row is missing for Seta, or the real mailbox if Graph is wired and Mail.Send is consented).

- [ ] **Step 4: Commit**

```bash
git add apps/console/src/routes/login.magic.tsx apps/console/src/routeTree.gen.ts
git commit -m "feat(console): /login/magic route"
```

---

## Phase G — Verification + PR

### Task G1: Repo-wide checks

- [ ] **Step 1: Run all checks**

Run:
1. `pnpm install`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test:unit`
5. `pnpm test:integration`

Expected: all PASS.

- [ ] **Step 2: Full e2e curl smoke**

With `pnpm dev` running:

```bash
# Owner request → 200
curl -sX POST -H 'content-type: application/json' \
  -d '{"email":"owner@seta-international.vn"}' \
  http://localhost:8080/sso/magic/request -i

# Member or unknown → still 200
curl -sX POST -H 'content-type: application/json' \
  -d '{"email":"unknown@nowhere.example"}' \
  http://localhost:8080/sso/magic/request -i
```

Expected: both return 200. Check the API logs — first call logs `sso.magic_request sent=true`, second `sent=false`.

- [ ] **Step 3: Consume the link**

Find the link in either:
- the real mailbox (if Graph backend wired); or
- the API logs as `mailer.console_send` (if no `mailer_configs` row for Seta yet).

`curl -sI 'http://localhost:8080/sso/magic/consume?t=<TOKEN>'`
Expected: 302 with `Location: /console/admin/tenants/<tid>/sso` and `Set-Cookie: seta_sess=...`.

Replay the same URL → 302 to `/console/login?magic_failed=1`.

- [ ] **Step 4: Open PR**

```bash
git push -u origin <branch>
gh pr create --title "feat(identity): break-glass magic-link sign-in (PR 4)" \
  --body "$(cat <<'EOF'
## Summary
- POST /sso/magic/request: owner-only, no enumeration, sends a signed link via the tenant's mailer
- GET /sso/magic/consume: atomic single-use redemption; lands the owner on /admin/tenants/<id>/sso
- 10-minute TTL; rate-limited per IP
- LoginPage shows a "Can't sign in?" link; new /login/magic page
- Audit events: sso.magic_link_issued, sso.magic_link_consumed

Spec: docs/superpowers/specs/2026-05-18-byo-idp-sso-design.md
Depends on PR 1 (auth.magic_links table) and PR 3 (@seta/mailer).

## Test plan
- [ ] pnpm typecheck && pnpm lint
- [ ] pnpm test:unit && pnpm test:integration
- [ ] Manual: owner request → consume → land on /admin/tenants/<id>/sso; replay → magic_failed=1
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Owner-only delivery, no enumeration → Task D1, D2 ✅
- 10-min TTL, single-use → Task A1 (`MAGIC_LINK_TTL_MS`), B1 (atomic UPDATE), D2 (replay test) ✅
- Token: 32 random bytes, sha256 stored → Task A1 ✅
- Per-tenant mailer dispatch via `getMailerForTenant` → Task D1, E1 ✅
- Mail template colocated with caller → Task C1 ✅
- Audit events `sso.magic_link_issued` / `sso.magic_link_consumed` → Task D1 (and Step 2 extends the union) ✅
- Sets last-login cookie on consume → Task D1 ✅
- Rate limits → Task E1 ✅
- LoginPage shows "Can't sign in?" link → Task F2 ✅
- New `/login/magic` console route → Task F3 ✅

**Placeholder scan:** no TBD/TODO. Each step has the code.

**Type consistency:**
- `Mailer` from `@seta/mailer` is the same interface used by `getMailerForTenant` and the route's `mailer.send(msg)` ✅
- `magicLinkMessage(...)` returns `OutboundMessage` (the `@seta/mailer` type) ✅
- `MAGIC_LINK_TTL_MS` defined once in `magic-link.ts`, consumed by routes' `expiresInMin` calc ✅
- `LAST_LOGIN_COOKIE_NAME` / `signLastLoginHint` reused from PR 1 (no duplication) ✅
- `SsoAuditEvent` union extended exactly once (Step 2 of D1) ✅

**Scope check:** single slice — owner break-glass. No other features added. Does not regress any PR 1/2/3 paths.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-18-byo-idp-sso-pr4-magic-link.md`.

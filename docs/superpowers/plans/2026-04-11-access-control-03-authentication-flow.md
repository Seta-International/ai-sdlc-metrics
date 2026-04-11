# Access Control 03 — Authentication Flow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement SSO (Microsoft Entra + Google Workspace) and magic link authentication flows, JWT session management, and tRPC auth middleware so every API request is authenticated with an IdP-agnostic session token.

**Architecture:** web-shell handles OIDC redirect flows and magic link UI. The API signs IdP-agnostic JWT session tokens after identity resolution. tRPC `authMiddleware` verifies JWT on every request, creating `protectedProcedure`. All zones read the session from a shared httpOnly cookie (`_future_session`).

**Tech Stack:** Next.js (web-shell), NestJS, tRPC, jose (JWT HS256), OIDC, vitest

**Depends on:** Plan 02 (Identity Module) — needs `resolveLogin`, `requestMagicLink`, `validateMagicLink` query/command infrastructure in the kernel
**Blocks:** Plan 04 (Permission Enforcement) — needs `protectedProcedure` and auth context (`actorId`, `tenantId`, `roles`)

**Status:** planned

---

## Task 1: JWT Signing and Verification Service

**Files:**

- Create: `apps/api/src/common/auth/jwt.service.ts`
- Create: `apps/api/src/common/auth/jwt.service.spec.ts`
- Create: `apps/api/src/common/auth/session-payload.ts`
- Create: `apps/api/src/common/auth/auth.module.ts`

### Types

- [ ] **Step 1: Define SessionPayload interface**

Create `apps/api/src/common/auth/session-payload.ts`:

```typescript
export interface SessionPayload {
  /** actor.id (UUID v7) */
  sub: string
  /** tenant.id (UUID v7) */
  tid: string
  /** role_grant.role_key values */
  roles: string[]
  /** Identity provider: 'microsoft' | 'google' | 'magic_link' */
  provider: string
  /** Issued at (epoch seconds) */
  iat: number
  /** Expires at (epoch seconds) */
  exp: number
}

export const SESSION_COOKIE_NAME = '_future_session'
export const SESSION_MAX_AGE_SECONDS = 28800 // 8 hours
```

### Tests first

- [ ] **Step 2: Write unit tests**

Create `apps/api/src/common/auth/jwt.service.spec.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { JwtService } from './jwt.service'
import type { SessionPayload } from './session-payload'

const TEST_SECRET = 'test-secret-key-that-is-at-least-32-bytes-long!'

const VALID_PAYLOAD: Omit<SessionPayload, 'iat' | 'exp'> = {
  sub: '01900000-0000-7000-8000-000000000001',
  tid: '01900000-0000-7000-8000-000000000002',
  roles: ['employee', 'line_manager'],
  provider: 'microsoft',
}

describe('JwtService', () => {
  let service: JwtService

  beforeEach(() => {
    service = new JwtService(TEST_SECRET)
  })

  it('sign and verify round-trip returns the same claims', async () => {
    const token = await service.sign(VALID_PAYLOAD)
    expect(typeof token).toBe('string')

    const result = await service.verify(token)
    expect(result).not.toBeNull()
    expect(result!.sub).toBe(VALID_PAYLOAD.sub)
    expect(result!.tid).toBe(VALID_PAYLOAD.tid)
    expect(result!.roles).toEqual(VALID_PAYLOAD.roles)
    expect(result!.provider).toBe(VALID_PAYLOAD.provider)
    expect(result!.iat).toBeTypeOf('number')
    expect(result!.exp).toBeTypeOf('number')
    expect(result!.exp - result!.iat).toBe(28800)
  })

  it('verify returns null for expired token', async () => {
    const expiredService = new JwtService(TEST_SECRET, -1) // negative TTL = already expired
    const token = await expiredService.sign(VALID_PAYLOAD)

    const result = await service.verify(token)
    expect(result).toBeNull()
  })

  it('verify returns null for tampered token', async () => {
    const token = await service.sign(VALID_PAYLOAD)
    // Flip a character in the signature portion
    const parts = token.split('.')
    parts[2] = parts[2]!.slice(0, -1) + (parts[2]!.endsWith('A') ? 'B' : 'A')
    const tampered = parts.join('.')

    const result = await service.verify(tampered)
    expect(result).toBeNull()
  })

  it('verify returns null for garbage string', async () => {
    const result = await service.verify('not-a-jwt')
    expect(result).toBeNull()
  })

  it('verify returns null for token signed with different secret', async () => {
    const otherService = new JwtService('other-secret-key-that-is-at-least-32-bytes!')
    const token = await otherService.sign(VALID_PAYLOAD)

    const result = await service.verify(token)
    expect(result).toBeNull()
  })
})
```

### Implementation

- [ ] **Step 3: Implement JwtService**

Create `apps/api/src/common/auth/jwt.service.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { SignJWT, jwtVerify } from 'jose'
import type { SessionPayload } from './session-payload'
import { SESSION_MAX_AGE_SECONDS } from './session-payload'

@Injectable()
export class JwtService {
  private readonly secret: Uint8Array

  constructor(
    secretString: string,
    private readonly ttlSeconds: number = SESSION_MAX_AGE_SECONDS,
  ) {
    this.secret = new TextEncoder().encode(secretString)
  }

  async sign(payload: Omit<SessionPayload, 'iat' | 'exp'>): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    return new SignJWT({
      ...payload,
      iat: now,
      exp: now + this.ttlSeconds,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + this.ttlSeconds)
      .sign(this.secret)
  }

  async verify(token: string): Promise<SessionPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
      })
      return {
        sub: payload.sub as string,
        tid: payload['tid'] as string,
        roles: payload['roles'] as string[],
        provider: payload['provider'] as string,
        iat: payload.iat as number,
        exp: payload.exp as number,
      }
    } catch {
      return null
    }
  }
}
```

- [ ] **Step 4: Create auth module**

Create `apps/api/src/common/auth/auth.module.ts`:

```typescript
import { Module, Global } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from './jwt.service'

export const JWT_SERVICE = Symbol('JwtService')

@Global()
@Module({
  providers: [
    {
      provide: JWT_SERVICE,
      useFactory: (config: ConfigService) => {
        const secret = config.getOrThrow<string>('JWT_SECRET')
        return new JwtService(secret)
      },
      inject: [ConfigService],
    },
  ],
  exports: [JWT_SERVICE],
})
export class AuthModule {}
```

- [ ] **Step 5: Install jose dependency**

```bash
cd apps/api && bun add jose
```

- [ ] **Step 6: Run tests**

```bash
cd apps/api && bun test jwt.service.spec
```

Expected: all 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/auth/
git commit -m "feat(auth): add JwtService for session token signing and verification"
```

---

## Task 2: ResolveLogin Command Handler

**Files:**

- Create: `apps/api/src/modules/kernel/application/commands/resolve-login.command.ts`
- Create: `apps/api/src/modules/kernel/application/commands/resolve-login.handler.ts`
- Create: `apps/api/src/modules/kernel/application/commands/resolve-login.handler.spec.ts`
- Modify: `apps/api/src/modules/kernel/kernel.module.ts` (register handler)

This command is the core of the authentication flow. It takes IdP claims from SSO callback or magic link validation and returns the data needed to sign a session JWT.

### Types

- [ ] **Step 1: Define the command**

Create `apps/api/src/modules/kernel/application/commands/resolve-login.command.ts`:

```typescript
export class ResolveLoginCommand {
  constructor(
    public readonly provider: 'microsoft' | 'google' | 'magic_link',
    public readonly ssoSubject: string,
    public readonly email: string,
    public readonly displayName: string,
    public readonly tenantId: string,
  ) {}
}

export interface ResolveLoginResult {
  actorId: string
  tenantId: string
  roles: string[]
  provider: string
}
```

### Tests first

- [ ] **Step 2: Write unit tests**

Create `apps/api/src/modules/kernel/application/commands/resolve-login.handler.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResolveLoginCommand, type ResolveLoginResult } from './resolve-login.command'
import { ResolveLoginHandler } from './resolve-login.handler'
import type { IUserIdentityRepository } from '../../domain/repositories/user-identity.repository.port'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'
import type { IAuditEventRepository } from '../../domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const IDENTITY_ID = '01900000-0000-7000-8000-000000000003'

describe('ResolveLoginHandler', () => {
  let handler: ResolveLoginHandler
  let userIdentityRepo: IUserIdentityRepository
  let actorRepo: IActorRepository
  let roleGrantRepo: IRoleGrantRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    userIdentityRepo = {
      findBySsoSubject: vi.fn(),
      findByEmail: vi.fn(),
      insert: vi.fn(),
      updateLastLogin: vi.fn(),
    }
    actorRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
    }
    roleGrantRepo = {
      findByActorId: vi.fn(),
      insert: vi.fn(),
    }
    auditRepo = { insert: vi.fn() }

    handler = new ResolveLoginHandler(userIdentityRepo, actorRepo, roleGrantRepo, auditRepo)
  })

  it('returns session data for existing active user', async () => {
    vi.mocked(userIdentityRepo.findBySsoSubject).mockResolvedValue({
      id: IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'alice@seta.vn',
      ssoSubject: 'entra-oid-123',
      provider: 'microsoft',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(actorRepo.findById).mockResolvedValue({
      id: ACTOR_ID,
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Alice',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      {
        id: '01900000-0000-7000-8000-000000000010',
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        roleKey: 'employee',
        scopeType: 'global',
        scopeId: null,
        grantedBy: ACTOR_ID,
        validFrom: new Date(),
        validUntil: null,
      },
    ])

    const command = new ResolveLoginCommand(
      'microsoft',
      'entra-oid-123',
      'alice@seta.vn',
      'Alice',
      TENANT_ID,
    )

    const result: ResolveLoginResult = await handler.execute(command)

    expect(result.actorId).toBe(ACTOR_ID)
    expect(result.tenantId).toBe(TENANT_ID)
    expect(result.roles).toEqual(['employee'])
    expect(result.provider).toBe('microsoft')
    expect(userIdentityRepo.updateLastLogin).toHaveBeenCalledWith(IDENTITY_ID)
    expect(auditRepo.insert).toHaveBeenCalled()
  })

  it('JIT creates actor + user_identity for new SSO user', async () => {
    vi.mocked(userIdentityRepo.findBySsoSubject).mockResolvedValue(null)
    vi.mocked(actorRepo.insert).mockResolvedValue({
      id: ACTOR_ID,
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Bob',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(userIdentityRepo.insert).mockResolvedValue({
      id: IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'bob@seta.vn',
      ssoSubject: 'entra-oid-456',
      provider: 'microsoft',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([])

    const command = new ResolveLoginCommand(
      'microsoft',
      'entra-oid-456',
      'bob@seta.vn',
      'Bob',
      TENANT_ID,
    )

    const result = await handler.execute(command)

    expect(actorRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Bob',
      status: 'active',
    })
    expect(userIdentityRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'bob@seta.vn',
      ssoSubject: 'entra-oid-456',
      provider: 'microsoft',
      status: 'active',
    })
    expect(result.actorId).toBe(ACTOR_ID)
    expect(result.roles).toEqual([])
  })

  it('throws for suspended user identity', async () => {
    vi.mocked(userIdentityRepo.findBySsoSubject).mockResolvedValue({
      id: IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'charlie@seta.vn',
      ssoSubject: 'entra-oid-789',
      provider: 'microsoft',
      status: 'suspended',
      lastLoginAt: null,
      createdAt: new Date(),
    })

    const command = new ResolveLoginCommand(
      'microsoft',
      'entra-oid-789',
      'charlie@seta.vn',
      'Charlie',
      TENANT_ID,
    )

    await expect(handler.execute(command)).rejects.toThrow('Account is suspended')
  })

  it('throws for suspended actor', async () => {
    vi.mocked(userIdentityRepo.findBySsoSubject).mockResolvedValue({
      id: IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'dana@seta.vn',
      ssoSubject: 'entra-oid-999',
      provider: 'microsoft',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(actorRepo.findById).mockResolvedValue({
      id: ACTOR_ID,
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Dana',
      status: 'suspended',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const command = new ResolveLoginCommand(
      'microsoft',
      'entra-oid-999',
      'dana@seta.vn',
      'Dana',
      TENANT_ID,
    )

    await expect(handler.execute(command)).rejects.toThrow('Account is suspended')
  })
})
```

### Implementation

- [ ] **Step 3: Implement ResolveLoginHandler**

Create `apps/api/src/modules/kernel/application/commands/resolve-login.handler.ts`:

```typescript
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { ResolveLoginCommand, type ResolveLoginResult } from './resolve-login.command'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
} from '../../domain/repositories/user-identity.repository.port'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port'
import {
  ROLE_GRANT_REPOSITORY,
  type IRoleGrantRepository,
} from '../../domain/repositories/role-grant.repository.port'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../domain/repositories/audit-event.repository.port'
import { AccountSuspendedException } from '../../domain/exceptions/kernel.exceptions'

@CommandHandler(ResolveLoginCommand)
export class ResolveLoginHandler implements ICommandHandler<
  ResolveLoginCommand,
  ResolveLoginResult
> {
  constructor(
    @Inject(USER_IDENTITY_REPOSITORY)
    private readonly userIdentityRepo: IUserIdentityRepository,
    @Inject(ACTOR_REPOSITORY)
    private readonly actorRepo: IActorRepository,
    @Inject(ROLE_GRANT_REPOSITORY)
    private readonly roleGrantRepo: IRoleGrantRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: ResolveLoginCommand): Promise<ResolveLoginResult> {
    // 1. Find existing identity by SSO subject
    let identity = await this.userIdentityRepo.findBySsoSubject(
      command.ssoSubject,
      command.tenantId,
    )

    let actorId: string

    if (identity) {
      // Existing user — check not suspended
      if (identity.status === 'suspended' || identity.status === 'deprovisioned') {
        throw new AccountSuspendedException(identity.actorId)
      }

      // Check actor status
      const actor = await this.actorRepo.findById(identity.actorId, command.tenantId)
      if (!actor || actor.status === 'suspended' || actor.status === 'archived') {
        throw new AccountSuspendedException(identity.actorId)
      }

      actorId = identity.actorId
      await this.userIdentityRepo.updateLastLogin(identity.id)
    } else {
      // JIT provisioning — create actor + user_identity
      const actor = await this.actorRepo.insert({
        tenantId: command.tenantId,
        type: 'person',
        displayName: command.displayName,
        status: 'active',
      })

      await this.userIdentityRepo.insert({
        tenantId: command.tenantId,
        actorId: actor.id,
        email: command.email,
        ssoSubject: command.ssoSubject,
        provider: command.provider,
        status: 'active',
      })

      actorId = actor.id
    }

    // 2. Fetch role grants
    const grants = await this.roleGrantRepo.findByActorId(actorId, command.tenantId)
    const roles = grants.map((g) => g.roleKey)

    // 3. Audit log
    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId,
      eventType: 'user_login',
      module: 'kernel',
      subjectId: actorId,
      payload: { provider: command.provider, email: command.email },
    })

    return {
      actorId,
      tenantId: command.tenantId,
      roles,
      provider: command.provider,
    }
  }
}
```

- [ ] **Step 4: Create AccountSuspendedException if not exists**

Check if `apps/api/src/modules/kernel/domain/exceptions/kernel.exceptions.ts` already has this exception. If not, add:

```typescript
import { DomainException } from './domain.exception'

export class AccountSuspendedException extends DomainException {
  readonly code = 'ACCOUNT_SUSPENDED'
  constructor(actorId: string) {
    super(`Account is suspended: ${actorId}`)
  }
}
```

- [ ] **Step 5: Register handler in kernel module**

Add `ResolveLoginHandler` to the `providers` array in `apps/api/src/modules/kernel/kernel.module.ts`.

- [ ] **Step 6: Run tests**

```bash
cd apps/api && bun test resolve-login.handler.spec
```

Expected: all 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/kernel/application/commands/resolve-login* apps/api/src/modules/kernel/domain/exceptions/ apps/api/src/modules/kernel/kernel.module.ts
git commit -m "feat(kernel): add ResolveLogin command handler with JIT provisioning"
```

---

## Task 3: tRPC Auth Middleware + protectedProcedure

**Files:**

- Create: `apps/api/src/common/trpc/auth-middleware.ts`
- Create: `apps/api/src/common/trpc/auth-middleware.spec.ts`
- Modify: `apps/api/src/common/trpc/trpc-init.ts`

### Tests first

- [ ] **Step 1: Write unit tests**

Create `apps/api/src/common/trpc/auth-middleware.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC, TRPCError } from '@trpc/server'
import { createAuthMiddleware } from './auth-middleware'
import type { JwtService } from '../auth/jwt.service'
import type { SessionPayload } from '../auth/session-payload'

const VALID_PAYLOAD: SessionPayload = {
  sub: '01900000-0000-7000-8000-000000000001',
  tid: '01900000-0000-7000-8000-000000000002',
  roles: ['employee'],
  provider: 'microsoft',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 28800,
}

describe('authMiddleware', () => {
  let jwtService: JwtService
  let middleware: ReturnType<typeof createAuthMiddleware>

  beforeEach(() => {
    jwtService = {
      sign: vi.fn(),
      verify: vi.fn(),
    } as unknown as JwtService
    middleware = createAuthMiddleware(jwtService)
  })

  function createMockContext(cookie?: string) {
    return {
      req: {
        headers: {
          cookie: cookie ? `_future_session=${cookie}` : '',
        },
      },
    }
  }

  function createNext() {
    return vi.fn().mockResolvedValue({ ok: true })
  }

  it('passes valid token and injects auth context', async () => {
    vi.mocked(jwtService.verify).mockResolvedValue(VALID_PAYLOAD)
    const next = createNext()

    await middleware({
      ctx: createMockContext('valid-token'),
      next,
      type: 'query',
      path: 'test',
      input: undefined,
      rawInput: undefined,
      meta: undefined,
    })

    expect(next).toHaveBeenCalledWith({
      ctx: expect.objectContaining({
        actorId: VALID_PAYLOAD.sub,
        tenantId: VALID_PAYLOAD.tid,
        roles: VALID_PAYLOAD.roles,
      }),
    })
  })

  it('throws UNAUTHORIZED when cookie is missing', async () => {
    const next = createNext()

    await expect(
      middleware({
        ctx: createMockContext(),
        next,
        type: 'query',
        path: 'test',
        input: undefined,
        rawInput: undefined,
        meta: undefined,
      }),
    ).rejects.toThrow(TRPCError)
  })

  it('throws UNAUTHORIZED when token is expired or invalid', async () => {
    vi.mocked(jwtService.verify).mockResolvedValue(null)
    const next = createNext()

    await expect(
      middleware({
        ctx: createMockContext('expired-token'),
        next,
        type: 'query',
        path: 'test',
        input: undefined,
        rawInput: undefined,
        meta: undefined,
      }),
    ).rejects.toThrow(TRPCError)
  })
})
```

### Implementation

- [ ] **Step 2: Implement auth middleware**

Create `apps/api/src/common/trpc/auth-middleware.ts`:

```typescript
import { TRPCError } from '@trpc/server'
import type { JwtService } from '../auth/jwt.service'
import { SESSION_COOKIE_NAME } from '../auth/session-payload'

export interface AuthContext {
  actorId: string
  tenantId: string
  roles: string[]
}

/**
 * Parse a specific cookie from a raw Cookie header string.
 */
function parseCookie(cookieHeader: string, name: string): string | undefined {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match?.[1]
}

export function createAuthMiddleware(jwtService: JwtService) {
  return async function authMiddleware(opts: {
    ctx: { req: { headers: { cookie?: string } } }
    next: (opts: { ctx: AuthContext & Record<string, unknown> }) => Promise<unknown>
    [key: string]: unknown
  }) {
    const cookieHeader = opts.ctx.req.headers.cookie ?? ''
    const token = parseCookie(cookieHeader, SESSION_COOKIE_NAME)

    if (!token) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      })
    }

    const payload = await jwtService.verify(token)
    if (!payload) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired session',
      })
    }

    return opts.next({
      ctx: {
        ...opts.ctx,
        actorId: payload.sub,
        tenantId: payload.tid,
        roles: payload.roles,
      },
    })
  }
}
```

- [ ] **Step 3: Update trpc-init.ts to export protectedProcedure**

Modify `apps/api/src/common/trpc/trpc-init.ts`:

```typescript
import { initTRPC, type TRPCError } from '@trpc/server'
import { createAuthMiddleware, type AuthContext } from './auth-middleware'
import type { JwtService } from '../auth/jwt.service'

export interface TrpcContext {
  req: { headers: { cookie?: string } }
}

const t = initTRPC.context<TrpcContext>().create()

export const router = t.router
export const publicProcedure = t.procedure

/**
 * Create a protectedProcedure that requires a valid session JWT.
 * Must be initialized with the JwtService at app bootstrap.
 */
let _protectedProcedure: typeof t.procedure | null = null

export function initProtectedProcedure(jwtService: JwtService): void {
  const authMiddleware = createAuthMiddleware(jwtService)
  _protectedProcedure = t.procedure.use(authMiddleware as Parameters<typeof t.procedure.use>[0])
}

export function getProtectedProcedure() {
  if (!_protectedProcedure) {
    throw new Error('protectedProcedure not initialized. Call initProtectedProcedure() at startup.')
  }
  return _protectedProcedure
}
```

**Note:** The `getProtectedProcedure()` pattern is needed because `JwtService` is a NestJS injectable that resolves at runtime via DI container, while tRPC router definitions are static module-level code. The lazy accessor bridges this gap. Router files call `getProtectedProcedure()` at request time, not at import time.

- [ ] **Step 4: Run tests**

```bash
cd apps/api && bun test auth-middleware.spec
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/trpc/
git commit -m "feat(auth): add tRPC auth middleware and protectedProcedure"
```

---

## Task 4: Identity tRPC Router

**Files:**

- Create: `apps/api/src/modules/kernel/interface/trpc/identity.router.ts`
- Create: `apps/api/src/modules/kernel/interface/trpc/identity.router.spec.ts`
- Modify: `apps/api/src/common/trpc/app-router.ts`

### Tests first

- [ ] **Step 1: Write unit tests**

Create `apps/api/src/modules/kernel/interface/trpc/identity.router.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Test that router procedures exist and have correct types
// Full integration tests require a running tRPC server — here we test the handler wiring

describe('identityRouter', () => {
  it('exports resolveLogin, requestMagicLink, and validateMagicLink procedures', async () => {
    // Dynamic import to avoid module init issues in tests
    const { identityRouter } = await import('./identity.router')

    // Verify router shape has the expected procedures
    expect(identityRouter).toBeDefined()
    expect(identityRouter._def.procedures).toHaveProperty('resolveLogin')
    expect(identityRouter._def.procedures).toHaveProperty('requestMagicLink')
    expect(identityRouter._def.procedures).toHaveProperty('validateMagicLink')
  })
})
```

### Implementation

- [ ] **Step 2: Create identity router**

Create `apps/api/src/modules/kernel/interface/trpc/identity.router.ts`:

```typescript
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { CommandBus } from '@nestjs/cqrs'
import {
  ResolveLoginCommand,
  type ResolveLoginResult,
} from '../../application/commands/resolve-login.command'

// Input schemas
const resolveLoginInput = z.object({
  provider: z.enum(['microsoft', 'google', 'magic_link']),
  ssoSubject: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  tenantId: z.string().uuid(),
})

const requestMagicLinkInput = z.object({
  email: z.string().email(),
  tenantId: z.string().uuid(),
})

const validateMagicLinkInput = z.object({
  token: z.string().min(1),
  tenantId: z.string().uuid(),
})

/**
 * Identity router — all procedures are public because they are called
 * during the authentication flow, before a session exists.
 *
 * The CommandBus is injected at module bootstrap time via setIdentityCommandBus().
 */
let commandBus: CommandBus | null = null

export function setIdentityCommandBus(bus: CommandBus): void {
  commandBus = bus
}

function getCommandBus(): CommandBus {
  if (!commandBus) {
    throw new Error('Identity router CommandBus not initialized')
  }
  return commandBus
}

export const identityRouter = router({
  resolveLogin: publicProcedure
    .input(resolveLoginInput)
    .mutation(async ({ input }): Promise<ResolveLoginResult> => {
      try {
        return await getCommandBus().execute(
          new ResolveLoginCommand(
            input.provider,
            input.ssoSubject,
            input.email,
            input.displayName,
            input.tenantId,
          ),
        )
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Login failed'
        if (message.includes('suspended')) {
          throw new TRPCError({ code: 'FORBIDDEN', message })
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
      }
    }),

  requestMagicLink: publicProcedure.input(requestMagicLinkInput).mutation(async ({ input }) => {
    // Delegates to RequestMagicLinkCommand from Plan 02
    // Sends magic link email via pg-boss job
    const bus = getCommandBus()
    await bus.execute(
      // Command class from Plan 02 — RequestMagicLinkCommand
      { email: input.email, tenantId: input.tenantId },
    )
    // Always return success to prevent email enumeration
    return { sent: true }
  }),

  validateMagicLink: publicProcedure.input(validateMagicLinkInput).mutation(async ({ input }) => {
    // Delegates to ValidateMagicLinkCommand from Plan 02
    // Returns same ResolveLoginResult shape
    const bus = getCommandBus()
    const result: ResolveLoginResult = await bus.execute(
      // Command class from Plan 02 — ValidateMagicLinkCommand
      { token: input.token, tenantId: input.tenantId },
    )
    return result
  }),
})
```

- [ ] **Step 3: Wire identity router into appRouter**

Modify `apps/api/src/common/trpc/app-router.ts` — add import and router entry:

```typescript
import { identityRouter } from '../../modules/kernel/interface/trpc/identity.router'

export const appRouter = router({
  identity: identityRouter,
  kernel: kernelRouter,
  // ... all existing routers unchanged
})
```

- [ ] **Step 4: Install zod if not already present**

```bash
cd apps/api && bun add zod
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && bun test identity.router.spec
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/kernel/interface/trpc/identity.router* apps/api/src/common/trpc/app-router.ts
git commit -m "feat(kernel): add identity tRPC router with resolveLogin, requestMagicLink, validateMagicLink"
```

---

## Task 5: Update `packages/auth`

**Files:**

- Modify: `packages/auth/src/parse-token.ts`
- Modify: `packages/auth/src/use-session.ts`
- Modify: `packages/auth/src/index.ts`
- Modify: `packages/auth/package.json` (add jose dep)
- Create: `packages/auth/src/parse-token.spec.ts`
- Create: `packages/auth/src/use-session.spec.ts`

The `packages/auth` library runs client-side in Next.js zones. It does NOT verify JWT signatures (the server does that). It only decodes the JWT payload for UI rendering (display name, roles, etc.). The `useSession` hook fetches verified claims from `/api/auth/me`.

### Tests first

- [ ] **Step 1: Write parse-token tests**

Create `packages/auth/src/parse-token.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { parseToken, type FutureTokenClaims } from './parse-token'

// Create a base64url-encoded JWT payload (no signature verification — client-side only)
function createFakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  return `${header}.${body}.fake-signature`
}

describe('parseToken', () => {
  it('decodes JWT payload into FutureTokenClaims', () => {
    const token = createFakeJwt({
      sub: '01900000-0000-7000-8000-000000000001',
      tid: '01900000-0000-7000-8000-000000000002',
      roles: ['employee', 'line_manager'],
      provider: 'microsoft',
      displayName: 'Alice',
      email: 'alice@seta.vn',
    })

    const claims = parseToken(token)

    expect(claims.actorId).toBe('01900000-0000-7000-8000-000000000001')
    expect(claims.tenantId).toBe('01900000-0000-7000-8000-000000000002')
    expect(claims.roles).toEqual(['employee', 'line_manager'])
    expect(claims.provider).toBe('microsoft')
    expect(claims.displayName).toBe('Alice')
  })

  it('returns null for malformed token', () => {
    const result = parseToken('not-a-jwt')
    expect(result).toBeNull()
  })

  it('returns null for empty string', () => {
    const result = parseToken('')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Write use-session tests**

Create `packages/auth/src/use-session.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// useSession is a React hook — test it in a simplified way
// Full hook testing requires @testing-library/react, deferred to zone-level tests

describe('useSession types', () => {
  it('Session interface has required fields', async () => {
    const { type Session } = await import('./use-session')
    // TypeScript compilation is the test — if this file compiles, the interface is correct
    const session: Session = {
      actorId: '01900000-0000-7000-8000-000000000001',
      tenantId: '01900000-0000-7000-8000-000000000002',
      roles: ['employee'],
      displayName: 'Alice',
      email: 'alice@seta.vn',
      provider: 'microsoft',
    }
    expect(session.actorId).toBeDefined()
  })
})
```

### Implementation

- [ ] **Step 3: Replace parse-token.ts stub**

Replace contents of `packages/auth/src/parse-token.ts`:

```typescript
export interface FutureTokenClaims {
  actorId: string
  tenantId: string
  roles: string[]
  provider: string
  displayName: string
  email?: string
}

/**
 * Client-side JWT decode — extracts payload claims without signature verification.
 * Signature is verified server-side by JwtService. This is for UI rendering only.
 *
 * Returns null if the token is malformed.
 */
export function parseToken(token: string): FutureTokenClaims | null {
  try {
    if (!token || !token.includes('.')) {
      return null
    }

    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    // Base64url decode the payload (second part)
    const payload = parts[1]!
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded)
    const claims = JSON.parse(json) as Record<string, unknown>

    return {
      actorId: claims['sub'] as string,
      tenantId: claims['tid'] as string,
      roles: (claims['roles'] as string[]) ?? [],
      provider: (claims['provider'] as string) ?? 'unknown',
      displayName: (claims['displayName'] as string) ?? '',
      email: claims['email'] as string | undefined,
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Replace use-session.ts stub**

Replace contents of `packages/auth/src/use-session.ts`:

```typescript
'use client'

import { useState, useEffect } from 'react'

export interface Session {
  actorId: string
  tenantId: string
  roles: string[]
  displayName: string
  email: string
  provider: string
}

let cachedSession: Session | null = null
let fetchPromise: Promise<Session | null> | null = null

async function fetchSession(): Promise<Session | null> {
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
    })
    if (!res.ok) {
      cachedSession = null
      return null
    }
    const data = (await res.json()) as Session
    cachedSession = data
    return data
  } catch {
    cachedSession = null
    return null
  }
}

/**
 * React hook that returns the current session.
 * Fetches from /api/auth/me (server validates JWT) and caches the result.
 * Returns null while loading or if not authenticated.
 */
export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(cachedSession)

  useEffect(() => {
    if (cachedSession) {
      setSession(cachedSession)
      return
    }

    if (!fetchPromise) {
      fetchPromise = fetchSession()
    }

    fetchPromise
      .then((result) => {
        setSession(result)
        fetchPromise = null
      })
      .catch(() => {
        setSession(null)
        fetchPromise = null
      })
  }, [])

  return session
}

/**
 * Imperative session invalidation — clears the cache.
 * Call after logout to force re-fetch on next useSession().
 */
export function clearSessionCache(): void {
  cachedSession = null
  fetchPromise = null
}
```

- [ ] **Step 5: Update index.ts exports**

Replace contents of `packages/auth/src/index.ts`:

```typescript
export type { FutureTokenClaims } from './parse-token'
export { parseToken } from './parse-token'
export type { Session } from './use-session'
export { useSession, clearSessionCache } from './use-session'
```

- [ ] **Step 6: Remove `@azure/msal-browser` dependency, no longer needed**

The authentication flow now uses IdP-agnostic JWT. MSAL is not used directly in `packages/auth`. If web-shell needs MSAL for the Entra OIDC redirect, it will depend on it directly.

```bash
cd packages/auth && bun remove @azure/msal-browser
```

- [ ] **Step 7: Run tests**

```bash
cd packages/auth && bun test
```

Expected: parse-token tests pass. use-session type test passes.

- [ ] **Step 8: Commit**

```bash
git add packages/auth/
git commit -m "feat(auth): replace stubs with real parseToken and useSession implementations"
```

---

## Task 6: web-shell Auth Routes

**Files:**

- Create: `apps/web-shell/src/app/auth/login/page.tsx`
- Create: `apps/web-shell/src/app/auth/callback/microsoft/route.ts`
- Create: `apps/web-shell/src/app/auth/callback/google/route.ts`
- Create: `apps/web-shell/src/app/auth/magic/[token]/route.ts`
- Create: `apps/web-shell/src/app/auth/logout/route.ts`
- Modify: `apps/web-shell/src/app/api/auth/me/route.ts`
- Create: `apps/web-shell/src/lib/auth-config.ts`

### Shared configuration

- [ ] **Step 1: Create auth config**

Create `apps/web-shell/src/lib/auth-config.ts`:

```typescript
export const SESSION_COOKIE_NAME = '_future_session'

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 28800, // 8 hours
  domain: process.env.COOKIE_DOMAIN ?? undefined, // .seta-international.com in prod
}

export const MICROSOFT_CONFIG = {
  clientId: process.env.MICROSOFT_CLIENT_ID!,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  tenantId: process.env.MICROSOFT_TENANT_ID!,
  redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
  get authorizeUrl() {
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize`
  },
  get tokenUrl() {
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`
  },
  get logoutUrl() {
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/logout`
  },
  scope: 'openid profile email',
}

export const GOOGLE_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scope: 'openid profile email',
}

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
```

### Login page

- [ ] **Step 2: Create login page**

Create `apps/web-shell/src/app/auth/login/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { MICROSOFT_CONFIG, GOOGLE_CONFIG } from '../../../lib/auth-config'

function buildMicrosoftAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: MICROSOFT_CONFIG.redirectUri,
    scope: MICROSOFT_CONFIG.scope,
    response_mode: 'query',
    state,
  })
  return `${MICROSOFT_CONFIG.authorizeUrl}?${params.toString()}`
}

function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: GOOGLE_CONFIG.redirectUri,
    scope: GOOGLE_CONFIG.scope,
    state,
  })
  return `${GOOGLE_CONFIG.authorizeUrl}?${params.toString()}`
}

export default function LoginPage() {
  // In production, state would include CSRF token + tenant slug
  const state = encodeURIComponent(JSON.stringify({ ts: Date.now() }))
  const microsoftUrl = buildMicrosoftAuthUrl(state)
  const googleUrl = buildGoogleAuthUrl(state)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0F1E]">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-white/10 bg-[#0F1B2D] p-8">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-white">Sign in to Future</h1>
          <p className="mt-2 text-sm text-white/60">Enterprise OS by SETA</p>
        </div>

        <div className="space-y-3">
          <a
            href={microsoftUrl}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#1D4ED8] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#1E40AF]"
          >
            Sign in with Microsoft
          </a>

          <a
            href={googleUrl}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-white/20 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/5"
          >
            Sign in with Google
          </a>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[#0F1B2D] px-2 text-white/40">or</span>
          </div>
        </div>

        <form action="/api/auth/magic-link" method="POST">
          <label htmlFor="email" className="block text-sm font-medium text-white/80">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@company.com"
            className="mt-1 w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#1D4ED8] focus:outline-none focus:ring-1 focus:ring-[#1D4ED8]"
          />
          <button
            type="submit"
            className="mt-3 w-full rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/5"
          >
            Send magic link
          </button>
        </form>
      </div>
    </div>
  )
}
```

### Microsoft callback

- [ ] **Step 3: Create Microsoft OIDC callback**

Create `apps/web-shell/src/app/auth/callback/microsoft/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import {
  MICROSOFT_CONFIG,
  SESSION_COOKIE_NAME,
  COOKIE_OPTIONS,
  API_BASE_URL,
} from '../../../../lib/auth-config'

interface MicrosoftTokenResponse {
  access_token: string
  id_token: string
  token_type: string
  expires_in: number
}

interface MicrosoftUserInfo {
  sub: string // Entra Object ID (oid)
  email?: string
  preferred_username?: string
  name?: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL(`/auth/login?error=${error ?? 'no_code'}`, request.url))
  }

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch(MICROSOFT_CONFIG.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MICROSOFT_CONFIG.clientId,
        client_secret: MICROSOFT_CONFIG.clientSecret,
        code,
        redirect_uri: MICROSOFT_CONFIG.redirectUri,
        grant_type: 'authorization_code',
        scope: MICROSOFT_CONFIG.scope,
      }),
    })

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL('/auth/login?error=token_exchange_failed', request.url))
    }

    const tokens = (await tokenRes.json()) as MicrosoftTokenResponse

    // 2. Decode ID token to get user info (Entra ID tokens are JWTs)
    const idPayload = JSON.parse(
      atob(tokens.id_token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
    ) as MicrosoftUserInfo

    // 3. Call API to resolve login — returns session JWT
    const resolveRes = await fetch(`${API_BASE_URL}/trpc/identity.resolveLogin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'microsoft',
        ssoSubject: idPayload.sub,
        email: idPayload.email ?? idPayload.preferred_username ?? '',
        displayName: idPayload.name ?? 'Unknown',
        tenantId: process.env.DEFAULT_TENANT_ID!, // Multi-tenant: resolve from state param or domain
      }),
    })

    if (!resolveRes.ok) {
      const err = await resolveRes.text()
      return NextResponse.redirect(
        new URL(`/auth/login?error=resolve_failed&detail=${encodeURIComponent(err)}`, request.url),
      )
    }

    const { result } = (await resolveRes.json()) as {
      result: { data: { sessionToken: string } }
    }
    const sessionToken = result.data.sessionToken

    // 4. Set session cookie
    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, COOKIE_OPTIONS)

    return NextResponse.redirect(new URL('/', request.url))
  } catch (err) {
    console.error('Microsoft callback error:', err)
    return NextResponse.redirect(new URL('/auth/login?error=unexpected', request.url))
  }
}
```

### Google callback

- [ ] **Step 4: Create Google OIDC callback**

Create `apps/web-shell/src/app/auth/callback/google/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import {
  GOOGLE_CONFIG,
  SESSION_COOKIE_NAME,
  COOKIE_OPTIONS,
  API_BASE_URL,
} from '../../../../lib/auth-config'

interface GoogleTokenResponse {
  access_token: string
  id_token: string
  token_type: string
  expires_in: number
}

interface GoogleUserInfo {
  sub: string
  email: string
  name: string
  email_verified: boolean
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL(`/auth/login?error=${error ?? 'no_code'}`, request.url))
  }

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_CONFIG.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CONFIG.clientId,
        client_secret: GOOGLE_CONFIG.clientSecret,
        code,
        redirect_uri: GOOGLE_CONFIG.redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL('/auth/login?error=token_exchange_failed', request.url))
    }

    const tokens = (await tokenRes.json()) as GoogleTokenResponse

    // 2. Decode ID token
    const idPayload = JSON.parse(
      atob(tokens.id_token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
    ) as GoogleUserInfo

    // 3. Call API to resolve login
    const resolveRes = await fetch(`${API_BASE_URL}/trpc/identity.resolveLogin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'google',
        ssoSubject: idPayload.sub,
        email: idPayload.email,
        displayName: idPayload.name ?? 'Unknown',
        tenantId: process.env.DEFAULT_TENANT_ID!,
      }),
    })

    if (!resolveRes.ok) {
      const err = await resolveRes.text()
      return NextResponse.redirect(
        new URL(`/auth/login?error=resolve_failed&detail=${encodeURIComponent(err)}`, request.url),
      )
    }

    const { result } = (await resolveRes.json()) as {
      result: { data: { sessionToken: string } }
    }
    const sessionToken = result.data.sessionToken

    // 4. Set session cookie
    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, COOKIE_OPTIONS)

    return NextResponse.redirect(new URL('/', request.url))
  } catch (err) {
    console.error('Google callback error:', err)
    return NextResponse.redirect(new URL('/auth/login?error=unexpected', request.url))
  }
}
```

### Magic link validation

- [ ] **Step 5: Create magic link validation route**

Create `apps/web-shell/src/app/auth/magic/[token]/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, COOKIE_OPTIONS, API_BASE_URL } from '../../../../lib/auth-config'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  if (!token) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_token', request.url))
  }

  try {
    // Call API to validate magic link and get session
    const validateRes = await fetch(`${API_BASE_URL}/trpc/identity.validateMagicLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        tenantId: process.env.DEFAULT_TENANT_ID!,
      }),
    })

    if (!validateRes.ok) {
      return NextResponse.redirect(new URL('/auth/login?error=invalid_magic_link', request.url))
    }

    const { result } = (await validateRes.json()) as {
      result: { data: { sessionToken: string } }
    }
    const sessionToken = result.data.sessionToken

    // Set session cookie
    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, COOKIE_OPTIONS)

    return NextResponse.redirect(new URL('/', request.url))
  } catch (err) {
    console.error('Magic link validation error:', err)
    return NextResponse.redirect(new URL('/auth/login?error=unexpected', request.url))
  }
}
```

### Logout

- [ ] **Step 6: Create logout route**

Create `apps/web-shell/src/app/auth/logout/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, MICROSOFT_CONFIG } from '../../../lib/auth-config'

export async function GET(request: NextRequest) {
  // 1. Clear session cookie
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // Expire immediately
  })

  // 2. Determine post-logout redirect
  const postLogoutUrl = new URL('/auth/login', request.url).toString()

  // 3. If Microsoft, redirect to Entra front-channel logout
  // Google does not support front-channel logout — just clear cookie
  const provider = request.cookies.get('_future_provider')?.value

  if (provider === 'microsoft' && MICROSOFT_CONFIG.clientId) {
    const logoutUrl = new URL(MICROSOFT_CONFIG.logoutUrl)
    logoutUrl.searchParams.set('post_logout_redirect_uri', postLogoutUrl)
    return NextResponse.redirect(logoutUrl)
  }

  return NextResponse.redirect(postLogoutUrl)
}
```

### /api/auth/me endpoint

- [ ] **Step 7: Replace 501 stub with real implementation**

Replace `apps/web-shell/src/app/api/auth/me/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { parseToken } from '@future/auth'
import { SESSION_COOKIE_NAME } from '../../../../lib/auth-config'

/**
 * GET /api/auth/me — returns session claims from the JWT cookie.
 *
 * The JWT is signed by the API server. This endpoint decodes the payload
 * for the frontend to render user context. The API server re-verifies
 * the signature on every tRPC call via authMiddleware.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const claims = parseToken(token)
  if (!claims) {
    return NextResponse.json({ error: 'Invalid session token' }, { status: 401 })
  }

  return NextResponse.json({
    actorId: claims.actorId,
    tenantId: claims.tenantId,
    roles: claims.roles,
    displayName: claims.displayName,
    email: claims.email ?? '',
    provider: claims.provider,
  })
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/web-shell/src/app/auth/ apps/web-shell/src/app/api/auth/ apps/web-shell/src/lib/
git commit -m "feat(web-shell): add SSO callback routes, magic link, logout, and /api/auth/me"
```

---

## Task 7: Bootstrap Integration + Verification

**Files:**

- Modify: `apps/api/src/main.ts` or `apps/api/src/app.module.ts` — register AuthModule, init protectedProcedure
- Modify: `apps/api/src/common/trpc/trpc.module.ts` — wire JwtService into tRPC init

### Wiring

- [ ] **Step 1: Register AuthModule in app module**

Add `AuthModule` to the `imports` array in `apps/api/src/app.module.ts`:

```typescript
import { AuthModule } from './common/auth/auth.module'

@Module({
  imports: [
    // ... existing imports
    AuthModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Initialize protectedProcedure at bootstrap**

In `apps/api/src/common/trpc/trpc.module.ts`, use `onModuleInit` to wire the JwtService:

```typescript
import { Inject, Module, type OnModuleInit } from '@nestjs/common'
import { JWT_SERVICE } from '../auth/auth.module'
import type { JwtService } from '../auth/jwt.service'
import { initProtectedProcedure } from './trpc-init'

@Module({})
export class TrpcModule implements OnModuleInit {
  constructor(@Inject(JWT_SERVICE) private readonly jwtService: JwtService) {}

  onModuleInit() {
    initProtectedProcedure(this.jwtService)
  }
}
```

- [ ] **Step 3: Wire identity router CommandBus**

In `apps/api/src/modules/kernel/kernel.module.ts`, initialize the identity router's CommandBus in `onModuleInit`:

```typescript
import { CommandBus } from '@nestjs/cqrs'
import { setIdentityCommandBus } from './interface/trpc/identity.router'

// In the class body:
constructor(private readonly commandBus: CommandBus) {}

onModuleInit() {
  setIdentityCommandBus(this.commandBus)
}
```

- [ ] **Step 4: Add JWT_SECRET to environment**

Add to `.env.example` (do NOT create or modify `.env`):

```
JWT_SECRET=change-me-to-a-random-32-byte-string
```

### Verification

- [ ] **Step 5: Run all unit tests**

```bash
cd apps/api && bun test
```

Expected: all tests pass, including jwt.service.spec, resolve-login.handler.spec, auth-middleware.spec.

- [ ] **Step 6: Run typecheck across the monorepo**

```bash
bun run typecheck
```

Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/common/trpc/trpc.module.ts apps/api/src/modules/kernel/kernel.module.ts .env.example
git commit -m "feat(auth): wire AuthModule, protectedProcedure bootstrap, and identity router CommandBus"
```

---

## Summary of Auth Flow

```
User → /auth/login → clicks "Sign in with Microsoft"
  → Microsoft Entra OIDC → /auth/callback/microsoft
    → Exchange code → Decode ID token
    → POST trpc.identity.resolveLogin({ provider, ssoSubject, email, displayName, tenantId })
      → Find/JIT-create actor + user_identity
      → Fetch role_grants
      → JwtService.sign({ sub: actorId, tid: tenantId, roles, provider })
    ← Set _future_session cookie (httpOnly, Secure, SameSite=Lax, 8h)
  → Redirect to /

Any zone → tRPC call → authMiddleware reads _future_session cookie
  → JwtService.verify(token)
  → Injects { actorId, tenantId, roles } into tRPC context
  → Handler runs with authenticated context

Zone UI → useSession() hook → GET /api/auth/me → parseToken(cookie) → { actorId, roles, ... }

Logout → /auth/logout → Clear cookie → Microsoft front-channel logout → /auth/login
```

---

## Key Decisions

| Decision                                      | Rationale                                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| HS256 (symmetric) over RS256                  | Single API server signs and verifies. No need for public key distribution. Simpler. Upgrade path to RS256 is one config change.                      |
| Client-side decode without verification       | `parseToken` in `packages/auth` is for UI display only. Every API call re-verifies via `authMiddleware`.                                             |
| JIT provisioning on first login               | Reduces admin burden. New Entra/Google users get an actor record automatically. Roles are empty until granted by admin.                              |
| Cookie domain `.seta-international.com`       | Shared across all Next.js zones (multi-zone architecture). Each zone reads the same session cookie.                                                  |
| `getProtectedProcedure()` lazy accessor       | tRPC router files are static (imported at module load). JwtService is a NestJS injectable (resolved at runtime). The lazy accessor bridges this gap. |
| Always return `{ sent: true }` for magic link | Prevents email enumeration. Attacker cannot discover which emails are registered.                                                                    |

---

**End of Plan 03.** Proceed to Plan 04 (Permission Enforcement) after this plan is implemented.

# Access Control 05 — Admin Configuration API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build tRPC API endpoints for admin configuration of identity providers, role permissions, local accounts, sync monitoring, audit log, and agent access.

**Architecture:** New tRPC procedures in identity and admin module routers, protected by `admin:*` permissions. All mutations go through command handlers. Read endpoints use query handlers via facades.

**Tech Stack:** tRPC, NestJS CQRS, Zod, vitest

**Depends on:** Plans 01-04 (all authorization and authentication infrastructure)
**Blocks:** Frontend admin UI (separate plan)

**Spec:** `docs/superpowers/specs/2026-04-11-access-control-strategy-design.md` — Section 5

**Status:** pending

---

## Task 1: IdP Configuration Endpoints

**Files:**

- Create: `apps/api/src/modules/identity/application/commands/configure-identity-provider.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/configure-identity-provider.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/configure-identity-provider.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/commands/test-idp-connection.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/test-idp-connection.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/test-idp-connection.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-identity-provider.query.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-identity-provider.handler.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-identity-provider.handler.spec.ts`
- Modify: `apps/api/src/modules/identity/interface/trpc/identity.router.ts`

### Step-by-step

- [ ] **Step 1: Create command DTO — ConfigureIdentityProviderCommand**

```typescript
// apps/api/src/modules/identity/application/commands/configure-identity-provider.command.ts
export type ProviderTypeValue = 'microsoft' | 'google'

export class ConfigureIdentityProviderCommand {
  constructor(
    readonly tenantId: string,
    readonly providerType: ProviderTypeValue,
    readonly displayName: string,
    readonly clientId: string,
    readonly clientSecretRef: string,
    readonly directoryId: string,
    readonly syncEnabled: boolean,
    readonly configuredBy: string,
    readonly existingProviderId?: string,
  ) {}
}
```

- [ ] **Step 2: Create domain port — IIdentityProviderRepository**

```typescript
// apps/api/src/modules/identity/domain/repositories/identity-provider.repository.port.ts
import type { IdentityProvider } from '../entities/identity-provider.entity'

export const IDENTITY_PROVIDER_REPOSITORY = Symbol('IIdentityProviderRepository')

export interface IIdentityProviderRepository {
  findById(id: string, tenantId: string): Promise<IdentityProvider | null>
  findPrimaryByTenantId(tenantId: string): Promise<IdentityProvider | null>
  insert(data: {
    tenantId: string
    providerType: IdentityProvider['providerType']
    displayName: string
    clientId: string
    clientSecretRef: string
    directoryId: string
    isPrimary: boolean
    syncEnabled: boolean
  }): Promise<IdentityProvider>
  update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        IdentityProvider,
        | 'displayName'
        | 'clientId'
        | 'clientSecretRef'
        | 'directoryId'
        | 'syncEnabled'
        | 'syncStatus'
        | 'lastSyncAt'
      >
    >,
  ): Promise<void>
}
```

- [ ] **Step 3: Create domain entity — IdentityProvider**

```typescript
// apps/api/src/modules/identity/domain/entities/identity-provider.entity.ts
export type ProviderType = 'microsoft' | 'google'
export type SyncStatus = 'idle' | 'running' | 'failed'

export interface IdentityProvider {
  id: string
  tenantId: string
  providerType: ProviderType
  displayName: string
  clientId: string
  clientSecretRef: string
  directoryId: string
  isPrimary: boolean
  syncEnabled: boolean
  lastSyncAt: Date | null
  syncStatus: SyncStatus
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 4: Create domain port — IDirectoryProvider**

```typescript
// apps/api/src/modules/identity/domain/ports/directory-provider.port.ts
export const DIRECTORY_PROVIDER = Symbol('IDirectoryProvider')

export interface DirectoryGroup {
  externalGroupId: string
  displayName: string
  memberCount: number
}

export interface DirectoryUser {
  ssoSubject: string
  email: string
  displayName: string
  isEnabled: boolean
  groups: string[]
}

export interface IDirectoryProvider {
  testConnection(
    providerType: 'microsoft' | 'google',
    clientId: string,
    clientSecretRef: string,
    directoryId: string,
  ): Promise<{ success: boolean; error?: string; userCount?: number }>

  listGroups(
    providerType: 'microsoft' | 'google',
    clientId: string,
    clientSecretRef: string,
    directoryId: string,
  ): Promise<DirectoryGroup[]>

  listUsers(
    providerType: 'microsoft' | 'google',
    clientId: string,
    clientSecretRef: string,
    directoryId: string,
  ): Promise<DirectoryUser[]>
}
```

- [ ] **Step 5: Write failing test — ConfigureIdentityProviderHandler**

```typescript
// apps/api/src/modules/identity/application/commands/configure-identity-provider.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigureIdentityProviderCommand } from './configure-identity-provider.command'
import { ConfigureIdentityProviderHandler } from './configure-identity-provider.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IdentityProvider } from '../../domain/entities/identity-provider.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeProvider: IdentityProvider = {
  id: PROVIDER_ID,
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'client-id-123',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
  directoryId: 'directory-id-456',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: null,
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('ConfigureIdentityProviderHandler', () => {
  let handler: ConfigureIdentityProviderHandler
  let providerRepo: IIdentityProviderRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new ConfigureIdentityProviderHandler(providerRepo, auditRepo)
  })

  it('creates a new identity provider when no existingProviderId', async () => {
    vi.mocked(providerRepo.insert).mockResolvedValue(fakeProvider)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(
      new ConfigureIdentityProviderCommand(
        TENANT_ID,
        'microsoft',
        'SETA Entra',
        'client-id-123',
        'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
        'directory-id-456',
        true,
        ACTOR_ID,
      ),
    )

    expect(result).toBe(PROVIDER_ID)
    expect(providerRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      providerType: 'microsoft',
      displayName: 'SETA Entra',
      clientId: 'client-id-123',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
      directoryId: 'directory-id-456',
      isPrimary: true,
      syncEnabled: true,
    })
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'identity_provider.configured',
      module: 'identity',
      subjectId: PROVIDER_ID,
      payload: { action: 'create', providerType: 'microsoft' },
    })
  })

  it('updates an existing identity provider when existingProviderId is set', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(fakeProvider)
    vi.mocked(providerRepo.update).mockResolvedValue(undefined)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(
      new ConfigureIdentityProviderCommand(
        TENANT_ID,
        'microsoft',
        'SETA Entra Updated',
        'new-client-id',
        'arn:aws:secretsmanager:ap-southeast-1:123:secret:new-secret',
        'directory-id-456',
        false,
        ACTOR_ID,
        PROVIDER_ID,
      ),
    )

    expect(result).toBe(PROVIDER_ID)
    expect(providerRepo.update).toHaveBeenCalledWith(PROVIDER_ID, TENANT_ID, {
      displayName: 'SETA Entra Updated',
      clientId: 'new-client-id',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:new-secret',
      directoryId: 'directory-id-456',
      syncEnabled: false,
    })
  })

  it('throws when updating a non-existent provider', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new ConfigureIdentityProviderCommand(
          TENANT_ID,
          'microsoft',
          'SETA Entra',
          'client-id',
          'arn:aws:secretsmanager:ap-southeast-1:123:secret:s',
          'dir-id',
          true,
          ACTOR_ID,
          'non-existent-id',
        ),
      ),
    ).rejects.toThrow('Identity provider not found')
  })
})
```

- [ ] **Step 6: Run test to verify failure**

```bash
cd apps/api && bunx vitest run src/modules/identity/application/commands/configure-identity-provider.handler.spec.ts
```

- [ ] **Step 7: Write handler — ConfigureIdentityProviderHandler**

```typescript
// apps/api/src/modules/identity/application/commands/configure-identity-provider.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository.port'
import { ConfigureIdentityProviderCommand } from './configure-identity-provider.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class IdentityProviderNotFoundException extends DomainException {
  readonly code = 'IDENTITY_PROVIDER_NOT_FOUND'
  constructor(id: string) {
    super(`Identity provider not found: ${id}`)
  }
}

@CommandHandler(ConfigureIdentityProviderCommand)
export class ConfigureIdentityProviderHandler implements ICommandHandler<
  ConfigureIdentityProviderCommand,
  string
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: ConfigureIdentityProviderCommand): Promise<string> {
    if (command.existingProviderId) {
      const existing = await this.providerRepo.findById(
        command.existingProviderId,
        command.tenantId,
      )
      if (!existing) {
        throw new IdentityProviderNotFoundException(command.existingProviderId)
      }

      await this.providerRepo.update(command.existingProviderId, command.tenantId, {
        displayName: command.displayName,
        clientId: command.clientId,
        clientSecretRef: command.clientSecretRef,
        directoryId: command.directoryId,
        syncEnabled: command.syncEnabled,
      })

      await this.auditRepo.insert({
        tenantId: command.tenantId,
        actorId: command.configuredBy,
        eventType: 'identity_provider.configured',
        module: 'identity',
        subjectId: command.existingProviderId,
        payload: { action: 'update', providerType: command.providerType },
      })

      return command.existingProviderId
    }

    const provider = await this.providerRepo.insert({
      tenantId: command.tenantId,
      providerType: command.providerType,
      displayName: command.displayName,
      clientId: command.clientId,
      clientSecretRef: command.clientSecretRef,
      directoryId: command.directoryId,
      isPrimary: true,
      syncEnabled: command.syncEnabled,
    })

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.configuredBy,
      eventType: 'identity_provider.configured',
      module: 'identity',
      subjectId: provider.id,
      payload: { action: 'create', providerType: command.providerType },
    })

    return provider.id
  }
}
```

- [ ] **Step 8: Run test to verify pass**

- [ ] **Step 9: Write query — GetIdentityProviderQuery + Handler**

```typescript
// apps/api/src/modules/identity/application/queries/get-identity-provider.query.ts
export class GetIdentityProviderQuery {
  constructor(readonly tenantId: string) {}
}
```

```typescript
// apps/api/src/modules/identity/application/queries/get-identity-provider.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { IdentityProvider } from '../../domain/entities/identity-provider.entity'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository.port'
import { GetIdentityProviderQuery } from './get-identity-provider.query'

export interface IdentityProviderDto {
  id: string
  providerType: string
  displayName: string
  clientId: string
  directoryId: string
  isPrimary: boolean
  syncEnabled: boolean
  lastSyncAt: string | null
  syncStatus: string
}

@QueryHandler(GetIdentityProviderQuery)
export class GetIdentityProviderHandler implements IQueryHandler<
  GetIdentityProviderQuery,
  IdentityProviderDto | null
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
  ) {}

  async execute(query: GetIdentityProviderQuery): Promise<IdentityProviderDto | null> {
    const provider = await this.providerRepo.findPrimaryByTenantId(query.tenantId)
    if (!provider) return null

    return {
      id: provider.id,
      providerType: provider.providerType,
      displayName: provider.displayName,
      clientId: provider.clientId,
      directoryId: provider.directoryId,
      isPrimary: provider.isPrimary,
      syncEnabled: provider.syncEnabled,
      lastSyncAt: provider.lastSyncAt?.toISOString() ?? null,
      syncStatus: provider.syncStatus,
    }
  }
}
```

- [ ] **Step 10: Write failing test — GetIdentityProviderHandler**

```typescript
// apps/api/src/modules/identity/application/queries/get-identity-provider.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetIdentityProviderQuery } from './get-identity-provider.query'
import { GetIdentityProviderHandler } from './get-identity-provider.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository.port'
import type { IdentityProvider } from '../../domain/entities/identity-provider.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeProvider: IdentityProvider = {
  id: '01900000-0000-7000-8000-000000000010',
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'client-id-123',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
  directoryId: 'directory-id-456',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: new Date('2026-04-10T10:00:00Z'),
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('GetIdentityProviderHandler', () => {
  let handler: GetIdentityProviderHandler
  let providerRepo: IIdentityProviderRepository

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    handler = new GetIdentityProviderHandler(providerRepo)
  })

  it('returns provider DTO when one exists for tenant', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(fakeProvider)

    const result = await handler.execute(new GetIdentityProviderQuery(TENANT_ID))

    expect(result).toEqual({
      id: fakeProvider.id,
      providerType: 'microsoft',
      displayName: 'SETA Entra',
      clientId: 'client-id-123',
      directoryId: 'directory-id-456',
      isPrimary: true,
      syncEnabled: true,
      lastSyncAt: '2026-04-10T10:00:00.000Z',
      syncStatus: 'idle',
    })
    expect(result).not.toHaveProperty('clientSecretRef')
  })

  it('returns null when no provider configured for tenant', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(null)

    const result = await handler.execute(new GetIdentityProviderQuery(TENANT_ID))

    expect(result).toBeNull()
  })
})
```

- [ ] **Step 11: Run test to verify pass**

- [ ] **Step 12: Write TestIdpConnection command + handler + test**

```typescript
// apps/api/src/modules/identity/application/commands/test-idp-connection.command.ts
export class TestIdpConnectionCommand {
  constructor(
    readonly tenantId: string,
    readonly providerId: string,
    readonly testedBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/identity/application/commands/test-idp-connection.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TestIdpConnectionCommand } from './test-idp-connection.command'
import { TestIdpConnectionHandler } from './test-idp-connection.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository.port'
import type { IDirectoryProvider } from '../../domain/ports/directory-provider.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IdentityProvider } from '../../domain/entities/identity-provider.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeProvider: IdentityProvider = {
  id: PROVIDER_ID,
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'client-id-123',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
  directoryId: 'directory-id-456',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: null,
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('TestIdpConnectionHandler', () => {
  let handler: TestIdpConnectionHandler
  let providerRepo: IIdentityProviderRepository
  let directoryProvider: IDirectoryProvider
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    directoryProvider = {
      testConnection: vi.fn(),
      listGroups: vi.fn(),
      listUsers: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new TestIdpConnectionHandler(providerRepo, directoryProvider, auditRepo)
  })

  it('returns success when connection test passes', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(fakeProvider)
    vi.mocked(directoryProvider.testConnection).mockResolvedValue({
      success: true,
      userCount: 312,
    })
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(
      new TestIdpConnectionCommand(TENANT_ID, PROVIDER_ID, ACTOR_ID),
    )

    expect(result).toEqual({ success: true, userCount: 312 })
    expect(directoryProvider.testConnection).toHaveBeenCalledWith(
      'microsoft',
      'client-id-123',
      'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
      'directory-id-456',
    )
  })

  it('returns failure with error message when connection test fails', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(fakeProvider)
    vi.mocked(directoryProvider.testConnection).mockResolvedValue({
      success: false,
      error: 'Invalid client credentials',
    })
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(
      new TestIdpConnectionCommand(TENANT_ID, PROVIDER_ID, ACTOR_ID),
    )

    expect(result).toEqual({ success: false, error: 'Invalid client credentials' })
  })

  it('throws when provider not found', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new TestIdpConnectionCommand(TENANT_ID, PROVIDER_ID, ACTOR_ID)),
    ).rejects.toThrow('Identity provider not found')
  })
})
```

```typescript
// apps/api/src/modules/identity/application/commands/test-idp-connection.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  DIRECTORY_PROVIDER,
  type IDirectoryProvider,
} from '../../domain/ports/directory-provider.port'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository.port'
import { TestIdpConnectionCommand } from './test-idp-connection.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class IdentityProviderNotFoundException extends DomainException {
  readonly code = 'IDENTITY_PROVIDER_NOT_FOUND'
  constructor(id: string) {
    super(`Identity provider not found: ${id}`)
  }
}

export interface TestConnectionResult {
  success: boolean
  error?: string
  userCount?: number
}

@CommandHandler(TestIdpConnectionCommand)
export class TestIdpConnectionHandler implements ICommandHandler<
  TestIdpConnectionCommand,
  TestConnectionResult
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(DIRECTORY_PROVIDER)
    private readonly directoryProvider: IDirectoryProvider,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: TestIdpConnectionCommand): Promise<TestConnectionResult> {
    const provider = await this.providerRepo.findById(command.providerId, command.tenantId)
    if (!provider) {
      throw new IdentityProviderNotFoundException(command.providerId)
    }

    const result = await this.directoryProvider.testConnection(
      provider.providerType,
      provider.clientId,
      provider.clientSecretRef,
      provider.directoryId,
    )

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.testedBy,
      eventType: 'identity_provider.connection_tested',
      module: 'identity',
      subjectId: command.providerId,
      payload: { success: result.success, error: result.error },
    })

    return result
  }
}
```

- [ ] **Step 13: Run tests to verify pass**

- [ ] **Step 14: Wire tRPC procedures into identity router**

```typescript
// Add to apps/api/src/modules/identity/interface/trpc/identity.router.ts
import { z } from 'zod'
import { router, protectedProcedure } from '../../../../common/trpc/trpc-init'

const configureProviderInput = z.object({
  providerType: z.enum(['microsoft', 'google']),
  displayName: z.string().min(1).max(100),
  clientId: z.string().min(1).max(255),
  clientSecretRef: z.string().min(1).max(512).startsWith('arn:aws:secretsmanager:'),
  directoryId: z.string().min(1).max(255),
  syncEnabled: z.boolean(),
  existingProviderId: z.string().uuid().optional(),
})

const testConnectionInput = z.object({
  providerId: z.string().uuid(),
})

// These procedures are nested under identityAdminRouter
export const identityAdminRouter = router({
  configureProvider: protectedProcedure
    .meta({ permission: 'admin:tenant:manage' })
    .input(configureProviderInput)
    .mutation(async ({ ctx, input }) => {
      const providerId = await ctx.commandBus.execute(
        new ConfigureIdentityProviderCommand(
          ctx.tenantId,
          input.providerType,
          input.displayName,
          input.clientId,
          input.clientSecretRef,
          input.directoryId,
          input.syncEnabled,
          ctx.actorId,
          input.existingProviderId,
        ),
      )
      return { providerId }
    }),

  getProvider: protectedProcedure
    .meta({ permission: 'admin:tenant:manage' })
    .query(async ({ ctx }) => {
      return ctx.queryBus.execute(new GetIdentityProviderQuery(ctx.tenantId))
    }),

  testConnection: protectedProcedure
    .meta({ permission: 'admin:tenant:manage' })
    .input(testConnectionInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.commandBus.execute(
        new TestIdpConnectionCommand(ctx.tenantId, input.providerId, ctx.actorId),
      )
    }),
})
```

- [ ] **Step 15: Run all identity tests to verify pass**
- [ ] **Step 16: Commit**

```bash
git add apps/api/src/modules/identity/
git commit -m "feat(identity): add IdP configuration endpoints with TDD"
```

---

## Task 2: Group Mapping Endpoints

**Files:**

- Create: `apps/api/src/modules/identity/domain/entities/idp-group-mapping.entity.ts`
- Create: `apps/api/src/modules/identity/domain/repositories/idp-group-mapping.repository.port.ts`
- Create: `apps/api/src/modules/identity/application/commands/sync-idp-groups.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/sync-idp-groups.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/sync-idp-groups.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/commands/upsert-group-mapping.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/upsert-group-mapping.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/upsert-group-mapping.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/commands/remove-group-mapping.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/remove-group-mapping.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/remove-group-mapping.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/queries/list-group-mappings.query.ts`
- Create: `apps/api/src/modules/identity/application/queries/list-group-mappings.handler.ts`
- Create: `apps/api/src/modules/identity/application/queries/list-group-mappings.handler.spec.ts`
- Modify: `apps/api/src/modules/identity/interface/trpc/identity.router.ts`

### Step-by-step

- [ ] **Step 1: Create domain entity — IdpGroupMapping**

```typescript
// apps/api/src/modules/identity/domain/entities/idp-group-mapping.entity.ts
export interface IdpGroupMapping {
  id: string
  tenantId: string
  identityProviderId: string
  externalGroupId: string
  externalGroupName: string
  roleKey: string
  scopeType: 'global' | 'department' | 'project' | 'account'
  scopeId: string | null
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Create domain port — IIdpGroupMappingRepository**

```typescript
// apps/api/src/modules/identity/domain/repositories/idp-group-mapping.repository.port.ts
import type { IdpGroupMapping } from '../entities/idp-group-mapping.entity'

export const IDP_GROUP_MAPPING_REPOSITORY = Symbol('IIdpGroupMappingRepository')

export interface IIdpGroupMappingRepository {
  findById(id: string, tenantId: string): Promise<IdpGroupMapping | null>
  findByProviderId(providerId: string, tenantId: string): Promise<IdpGroupMapping[]>
  listByTenantId(tenantId: string): Promise<IdpGroupMapping[]>
  upsert(data: {
    tenantId: string
    identityProviderId: string
    externalGroupId: string
    externalGroupName: string
    roleKey: string
    scopeType: IdpGroupMapping['scopeType']
    scopeId: string | null
  }): Promise<IdpGroupMapping>
  remove(id: string, tenantId: string): Promise<void>
}
```

- [ ] **Step 3: Write failing test — SyncIdpGroupsHandler**

```typescript
// apps/api/src/modules/identity/application/commands/sync-idp-groups.command.ts
export class SyncIdpGroupsCommand {
  constructor(
    readonly tenantId: string,
    readonly syncedBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/identity/application/commands/sync-idp-groups.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncIdpGroupsCommand } from './sync-idp-groups.command'
import { SyncIdpGroupsHandler } from './sync-idp-groups.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository.port'
import type { IDirectoryProvider, DirectoryGroup } from '../../domain/ports/directory-provider.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IdentityProvider } from '../../domain/entities/identity-provider.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeProvider: IdentityProvider = {
  id: PROVIDER_ID,
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'client-id-123',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
  directoryId: 'directory-id-456',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: null,
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeGroups: DirectoryGroup[] = [
  { externalGroupId: 'group-001', displayName: 'Engineering', memberCount: 45 },
  { externalGroupId: 'group-002', displayName: 'HR', memberCount: 12 },
]

describe('SyncIdpGroupsHandler', () => {
  let handler: SyncIdpGroupsHandler
  let providerRepo: IIdentityProviderRepository
  let directoryProvider: IDirectoryProvider
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    directoryProvider = {
      testConnection: vi.fn(),
      listGroups: vi.fn(),
      listUsers: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new SyncIdpGroupsHandler(providerRepo, directoryProvider, auditRepo)
  })

  it('fetches groups from IdP and returns them', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(fakeProvider)
    vi.mocked(directoryProvider.listGroups).mockResolvedValue(fakeGroups)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(new SyncIdpGroupsCommand(TENANT_ID, ACTOR_ID))

    expect(result).toEqual({
      providerId: PROVIDER_ID,
      groups: fakeGroups,
    })
    expect(directoryProvider.listGroups).toHaveBeenCalledWith(
      'microsoft',
      'client-id-123',
      'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
      'directory-id-456',
    )
  })

  it('throws when no provider is configured for tenant', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(null)

    await expect(handler.execute(new SyncIdpGroupsCommand(TENANT_ID, ACTOR_ID))).rejects.toThrow(
      'No identity provider configured',
    )
  })
})
```

- [ ] **Step 4: Run test to verify failure**

- [ ] **Step 5: Write handler — SyncIdpGroupsHandler**

```typescript
// apps/api/src/modules/identity/application/commands/sync-idp-groups.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  DIRECTORY_PROVIDER,
  type IDirectoryProvider,
  type DirectoryGroup,
} from '../../domain/ports/directory-provider.port'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository.port'
import { SyncIdpGroupsCommand } from './sync-idp-groups.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class NoIdentityProviderConfiguredException extends DomainException {
  readonly code = 'NO_IDENTITY_PROVIDER_CONFIGURED'
  constructor() {
    super('No identity provider configured for this tenant')
  }
}

export interface SyncGroupsResult {
  providerId: string
  groups: DirectoryGroup[]
}

@CommandHandler(SyncIdpGroupsCommand)
export class SyncIdpGroupsHandler implements ICommandHandler<
  SyncIdpGroupsCommand,
  SyncGroupsResult
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(DIRECTORY_PROVIDER)
    private readonly directoryProvider: IDirectoryProvider,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: SyncIdpGroupsCommand): Promise<SyncGroupsResult> {
    const provider = await this.providerRepo.findPrimaryByTenantId(command.tenantId)
    if (!provider) {
      throw new NoIdentityProviderConfiguredException()
    }

    const groups = await this.directoryProvider.listGroups(
      provider.providerType,
      provider.clientId,
      provider.clientSecretRef,
      provider.directoryId,
    )

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.syncedBy,
      eventType: 'idp_groups.synced',
      module: 'identity',
      subjectId: provider.id,
      payload: { groupCount: groups.length },
    })

    return { providerId: provider.id, groups }
  }
}
```

- [ ] **Step 6: Run test to verify pass**

- [ ] **Step 7: Write UpsertGroupMapping command + handler + test**

```typescript
// apps/api/src/modules/identity/application/commands/upsert-group-mapping.command.ts
export class UpsertGroupMappingCommand {
  constructor(
    readonly tenantId: string,
    readonly identityProviderId: string,
    readonly externalGroupId: string,
    readonly externalGroupName: string,
    readonly roleKey: string,
    readonly scopeType: 'global' | 'department' | 'project' | 'account',
    readonly scopeId: string | null,
    readonly updatedBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/identity/application/commands/upsert-group-mapping.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpsertGroupMappingCommand } from './upsert-group-mapping.command'
import { UpsertGroupMappingHandler } from './upsert-group-mapping.handler'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'
const MAPPING_ID = '01900000-0000-7000-8000-000000000020'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeMapping: IdpGroupMapping = {
  id: MAPPING_ID,
  tenantId: TENANT_ID,
  identityProviderId: PROVIDER_ID,
  externalGroupId: 'group-001',
  externalGroupName: 'Engineering',
  roleKey: 'employee',
  scopeType: 'global',
  scopeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('UpsertGroupMappingHandler', () => {
  let handler: UpsertGroupMappingHandler
  let mappingRepo: IIdpGroupMappingRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    mappingRepo = {
      findById: vi.fn(),
      findByProviderId: vi.fn(),
      listByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new UpsertGroupMappingHandler(mappingRepo, auditRepo)
  })

  it('upserts a group mapping and returns its id', async () => {
    vi.mocked(mappingRepo.upsert).mockResolvedValue(fakeMapping)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(
      new UpsertGroupMappingCommand(
        TENANT_ID,
        PROVIDER_ID,
        'group-001',
        'Engineering',
        'employee',
        'global',
        null,
        ACTOR_ID,
      ),
    )

    expect(result).toBe(MAPPING_ID)
    expect(mappingRepo.upsert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      identityProviderId: PROVIDER_ID,
      externalGroupId: 'group-001',
      externalGroupName: 'Engineering',
      roleKey: 'employee',
      scopeType: 'global',
      scopeId: null,
    })
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'group_mapping.upserted',
      module: 'identity',
      subjectId: MAPPING_ID,
      payload: { externalGroupId: 'group-001', roleKey: 'employee', scopeType: 'global' },
    })
  })

  it('requires scopeId when scopeType is not global', async () => {
    await expect(
      handler.execute(
        new UpsertGroupMappingCommand(
          TENANT_ID,
          PROVIDER_ID,
          'group-001',
          'Engineering',
          'line_manager',
          'department',
          null,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow('scopeId is required')
  })
})
```

```typescript
// apps/api/src/modules/identity/application/commands/upsert-group-mapping.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository.port'
import { UpsertGroupMappingCommand } from './upsert-group-mapping.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class MissingScopeIdException extends DomainException {
  readonly code = 'MISSING_SCOPE_ID'
  constructor() {
    super('scopeId is required when scopeType is not global')
  }
}

@CommandHandler(UpsertGroupMappingCommand)
export class UpsertGroupMappingHandler implements ICommandHandler<
  UpsertGroupMappingCommand,
  string
> {
  constructor(
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: UpsertGroupMappingCommand): Promise<string> {
    if (command.scopeType !== 'global' && command.scopeId === null) {
      throw new MissingScopeIdException()
    }

    const mapping = await this.mappingRepo.upsert({
      tenantId: command.tenantId,
      identityProviderId: command.identityProviderId,
      externalGroupId: command.externalGroupId,
      externalGroupName: command.externalGroupName,
      roleKey: command.roleKey,
      scopeType: command.scopeType,
      scopeId: command.scopeId,
    })

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.updatedBy,
      eventType: 'group_mapping.upserted',
      module: 'identity',
      subjectId: mapping.id,
      payload: {
        externalGroupId: command.externalGroupId,
        roleKey: command.roleKey,
        scopeType: command.scopeType,
      },
    })

    return mapping.id
  }
}
```

- [ ] **Step 8: Run tests to verify pass**

- [ ] **Step 9: Write RemoveGroupMapping command + handler + test**

```typescript
// apps/api/src/modules/identity/application/commands/remove-group-mapping.command.ts
export class RemoveGroupMappingCommand {
  constructor(
    readonly tenantId: string,
    readonly mappingId: string,
    readonly removedBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/identity/application/commands/remove-group-mapping.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoveGroupMappingCommand } from './remove-group-mapping.command'
import { RemoveGroupMappingHandler } from './remove-group-mapping.handler'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const MAPPING_ID = '01900000-0000-7000-8000-000000000020'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeMapping: IdpGroupMapping = {
  id: MAPPING_ID,
  tenantId: TENANT_ID,
  identityProviderId: '01900000-0000-7000-8000-000000000010',
  externalGroupId: 'group-001',
  externalGroupName: 'Engineering',
  roleKey: 'employee',
  scopeType: 'global',
  scopeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('RemoveGroupMappingHandler', () => {
  let handler: RemoveGroupMappingHandler
  let mappingRepo: IIdpGroupMappingRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    mappingRepo = {
      findById: vi.fn(),
      findByProviderId: vi.fn(),
      listByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new RemoveGroupMappingHandler(mappingRepo, auditRepo)
  })

  it('removes a group mapping', async () => {
    vi.mocked(mappingRepo.findById).mockResolvedValue(fakeMapping)
    vi.mocked(mappingRepo.remove).mockResolvedValue(undefined)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    await handler.execute(new RemoveGroupMappingCommand(TENANT_ID, MAPPING_ID, ACTOR_ID))

    expect(mappingRepo.remove).toHaveBeenCalledWith(MAPPING_ID, TENANT_ID)
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'group_mapping.removed',
      module: 'identity',
      subjectId: MAPPING_ID,
      payload: { externalGroupId: 'group-001', roleKey: 'employee' },
    })
  })

  it('throws when mapping not found', async () => {
    vi.mocked(mappingRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new RemoveGroupMappingCommand(TENANT_ID, MAPPING_ID, ACTOR_ID)),
    ).rejects.toThrow('Group mapping not found')
  })
})
```

```typescript
// apps/api/src/modules/identity/application/commands/remove-group-mapping.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository.port'
import { RemoveGroupMappingCommand } from './remove-group-mapping.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class GroupMappingNotFoundException extends DomainException {
  readonly code = 'GROUP_MAPPING_NOT_FOUND'
  constructor(id: string) {
    super(`Group mapping not found: ${id}`)
  }
}

@CommandHandler(RemoveGroupMappingCommand)
export class RemoveGroupMappingHandler implements ICommandHandler<RemoveGroupMappingCommand, void> {
  constructor(
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: RemoveGroupMappingCommand): Promise<void> {
    const mapping = await this.mappingRepo.findById(command.mappingId, command.tenantId)
    if (!mapping) {
      throw new GroupMappingNotFoundException(command.mappingId)
    }

    await this.mappingRepo.remove(command.mappingId, command.tenantId)

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.removedBy,
      eventType: 'group_mapping.removed',
      module: 'identity',
      subjectId: command.mappingId,
      payload: {
        externalGroupId: mapping.externalGroupId,
        roleKey: mapping.roleKey,
      },
    })
  }
}
```

- [ ] **Step 10: Write ListGroupMappings query + handler + test**

```typescript
// apps/api/src/modules/identity/application/queries/list-group-mappings.query.ts
export class ListGroupMappingsQuery {
  constructor(readonly tenantId: string) {}
}
```

```typescript
// apps/api/src/modules/identity/application/queries/list-group-mappings.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository.port'
import { ListGroupMappingsQuery } from './list-group-mappings.query'

@QueryHandler(ListGroupMappingsQuery)
export class ListGroupMappingsHandler implements IQueryHandler<
  ListGroupMappingsQuery,
  IdpGroupMapping[]
> {
  constructor(
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
  ) {}

  async execute(query: ListGroupMappingsQuery): Promise<IdpGroupMapping[]> {
    return this.mappingRepo.listByTenantId(query.tenantId)
  }
}
```

```typescript
// apps/api/src/modules/identity/application/queries/list-group-mappings.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListGroupMappingsQuery } from './list-group-mappings.query'
import { ListGroupMappingsHandler } from './list-group-mappings.handler'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository.port'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeMappings: IdpGroupMapping[] = [
  {
    id: '01900000-0000-7000-8000-000000000020',
    tenantId: TENANT_ID,
    identityProviderId: '01900000-0000-7000-8000-000000000010',
    externalGroupId: 'group-001',
    externalGroupName: 'Engineering',
    roleKey: 'employee',
    scopeType: 'global',
    scopeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '01900000-0000-7000-8000-000000000021',
    tenantId: TENANT_ID,
    identityProviderId: '01900000-0000-7000-8000-000000000010',
    externalGroupId: 'group-002',
    externalGroupName: 'HR',
    roleKey: 'hr_ops',
    scopeType: 'global',
    scopeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

describe('ListGroupMappingsHandler', () => {
  let handler: ListGroupMappingsHandler
  let mappingRepo: IIdpGroupMappingRepository

  beforeEach(() => {
    mappingRepo = {
      findById: vi.fn(),
      findByProviderId: vi.fn(),
      listByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    handler = new ListGroupMappingsHandler(mappingRepo)
  })

  it('returns all group mappings for the tenant', async () => {
    vi.mocked(mappingRepo.listByTenantId).mockResolvedValue(fakeMappings)

    const result = await handler.execute(new ListGroupMappingsQuery(TENANT_ID))

    expect(result).toEqual(fakeMappings)
    expect(mappingRepo.listByTenantId).toHaveBeenCalledWith(TENANT_ID)
  })

  it('returns empty array when no mappings exist', async () => {
    vi.mocked(mappingRepo.listByTenantId).mockResolvedValue([])

    const result = await handler.execute(new ListGroupMappingsQuery(TENANT_ID))

    expect(result).toEqual([])
  })
})
```

- [ ] **Step 11: Run all tests to verify pass**

- [ ] **Step 12: Wire tRPC procedures for group mappings**

Add to `identityAdminRouter` in `apps/api/src/modules/identity/interface/trpc/identity.router.ts`:

```typescript
const upsertGroupMappingInput = z.object({
  identityProviderId: z.string().uuid(),
  externalGroupId: z.string().min(1).max(255),
  externalGroupName: z.string().min(1).max(255),
  roleKey: z.enum([
    'hr_ops', 'line_manager', 'project_manager', 'staffing_owner',
    'account_manager', 'finance_operator', 'executive', 'employee',
    'review_operator', 'recruiter', 'tenant_admin',
  ]),
  scopeType: z.enum(['global', 'department', 'project', 'account']),
  scopeId: z.string().uuid().nullable(),
})

const removeGroupMappingInput = z.object({
  mappingId: z.string().uuid(),
})

// Add these procedures to identityAdminRouter:
syncGroups: protectedProcedure
  .meta({ permission: 'admin:role:manage' })
  .mutation(async ({ ctx }) => {
    return ctx.commandBus.execute(
      new SyncIdpGroupsCommand(ctx.tenantId, ctx.actorId),
    )
  }),

listGroupMappings: protectedProcedure
  .meta({ permission: 'admin:role:manage' })
  .query(async ({ ctx }) => {
    return ctx.queryBus.execute(new ListGroupMappingsQuery(ctx.tenantId))
  }),

upsertGroupMapping: protectedProcedure
  .meta({ permission: 'admin:role:manage' })
  .input(upsertGroupMappingInput)
  .mutation(async ({ ctx, input }) => {
    const mappingId = await ctx.commandBus.execute(
      new UpsertGroupMappingCommand(
        ctx.tenantId,
        input.identityProviderId,
        input.externalGroupId,
        input.externalGroupName,
        input.roleKey,
        input.scopeType,
        input.scopeId,
        ctx.actorId,
      ),
    )
    return { mappingId }
  }),

removeGroupMapping: protectedProcedure
  .meta({ permission: 'admin:role:manage' })
  .input(removeGroupMappingInput)
  .mutation(async ({ ctx, input }) => {
    await ctx.commandBus.execute(
      new RemoveGroupMappingCommand(ctx.tenantId, input.mappingId, ctx.actorId),
    )
    return { success: true }
  }),
```

- [ ] **Step 13: Run all tests to verify pass**
- [ ] **Step 14: Commit**

```bash
git add apps/api/src/modules/identity/
git commit -m "feat(identity): add group-to-role mapping endpoints with TDD"
```

---

## Task 3: Permission Management Endpoints

**Files:**

- Create: `apps/api/src/modules/kernel/domain/entities/role-permission.entity.ts`
- Create: `apps/api/src/modules/kernel/domain/repositories/role-permission.repository.port.ts`
- Create: `apps/api/src/modules/admin/application/commands/add-role-permission.command.ts`
- Create: `apps/api/src/modules/admin/application/commands/add-role-permission.handler.ts`
- Create: `apps/api/src/modules/admin/application/commands/add-role-permission.handler.spec.ts`
- Create: `apps/api/src/modules/admin/application/commands/remove-role-permission.command.ts`
- Create: `apps/api/src/modules/admin/application/commands/remove-role-permission.handler.ts`
- Create: `apps/api/src/modules/admin/application/commands/remove-role-permission.handler.spec.ts`
- Create: `apps/api/src/modules/admin/application/commands/reset-role-permissions.command.ts`
- Create: `apps/api/src/modules/admin/application/commands/reset-role-permissions.handler.ts`
- Create: `apps/api/src/modules/admin/application/commands/reset-role-permissions.handler.spec.ts`
- Create: `apps/api/src/modules/admin/application/queries/list-roles.query.ts`
- Create: `apps/api/src/modules/admin/application/queries/list-roles.handler.ts`
- Create: `apps/api/src/modules/admin/application/queries/list-roles.handler.spec.ts`
- Create: `apps/api/src/modules/admin/application/queries/get-role-permissions.query.ts`
- Create: `apps/api/src/modules/admin/application/queries/get-role-permissions.handler.ts`
- Create: `apps/api/src/modules/admin/application/queries/get-role-permissions.handler.spec.ts`
- Modify: `apps/api/src/modules/admin/interface/trpc/admin.router.ts`

### Step-by-step

- [ ] **Step 1: Create domain entity — RolePermission**

```typescript
// apps/api/src/modules/kernel/domain/entities/role-permission.entity.ts
export interface RolePermission {
  id: string
  tenantId: string
  roleKey: string
  permissionKey: string
  isLocked: boolean
  createdAt: Date
}
```

- [ ] **Step 2: Create domain port — IRolePermissionRepository**

```typescript
// apps/api/src/modules/kernel/domain/repositories/role-permission.repository.port.ts
import type { RolePermission } from '../entities/role-permission.entity'

export const ROLE_PERMISSION_REPOSITORY = Symbol('IRolePermissionRepository')

export interface IRolePermissionRepository {
  findByRoleKey(roleKey: string, tenantId: string): Promise<RolePermission[]>
  findByTenantId(tenantId: string): Promise<RolePermission[]>
  findByRoleKeyAndPermissionKey(
    roleKey: string,
    permissionKey: string,
    tenantId: string,
  ): Promise<RolePermission | null>
  insert(data: {
    tenantId: string
    roleKey: string
    permissionKey: string
    isLocked: boolean
  }): Promise<RolePermission>
  remove(id: string, tenantId: string): Promise<void>
  removeAllForRole(roleKey: string, tenantId: string): Promise<void>
  insertMany(
    data: Array<{
      tenantId: string
      roleKey: string
      permissionKey: string
      isLocked: boolean
    }>,
  ): Promise<void>
}
```

- [ ] **Step 3: Write failing test — ListRolesHandler**

```typescript
// apps/api/src/modules/admin/application/queries/list-roles.query.ts
export class ListRolesQuery {
  constructor(readonly tenantId: string) {}
}
```

```typescript
// apps/api/src/modules/admin/application/queries/list-roles.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListRolesQuery } from './list-roles.query'
import { ListRolesHandler } from './list-roles.handler'
import type { IRolePermissionRepository } from '../../../kernel/domain/repositories/role-permission.repository.port'
import type { RolePermission } from '../../../kernel/domain/entities/role-permission.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakePermissions: RolePermission[] = [
  {
    id: '01900000-0000-7000-8000-000000000030',
    tenantId: TENANT_ID,
    roleKey: 'employee',
    permissionKey: 'people:profile:self:read',
    isLocked: true,
    createdAt: new Date(),
  },
  {
    id: '01900000-0000-7000-8000-000000000031',
    tenantId: TENANT_ID,
    roleKey: 'employee',
    permissionKey: 'planner:task:self:manage',
    isLocked: false,
    createdAt: new Date(),
  },
  {
    id: '01900000-0000-7000-8000-000000000032',
    tenantId: TENANT_ID,
    roleKey: 'hr_ops',
    permissionKey: 'people:profile:read',
    isLocked: false,
    createdAt: new Date(),
  },
]

describe('ListRolesHandler', () => {
  let handler: ListRolesHandler
  let permissionRepo: IRolePermissionRepository

  beforeEach(() => {
    permissionRepo = {
      findByRoleKey: vi.fn(),
      findByTenantId: vi.fn(),
      findByRoleKeyAndPermissionKey: vi.fn(),
      insert: vi.fn(),
      remove: vi.fn(),
      removeAllForRole: vi.fn(),
      insertMany: vi.fn(),
    }
    handler = new ListRolesHandler(permissionRepo)
  })

  it('returns roles grouped with their permission counts', async () => {
    vi.mocked(permissionRepo.findByTenantId).mockResolvedValue(fakePermissions)

    const result = await handler.execute(new ListRolesQuery(TENANT_ID))

    expect(result).toEqual([
      {
        roleKey: 'employee',
        permissionCount: 2,
        lockedPermissionCount: 1,
      },
      {
        roleKey: 'hr_ops',
        permissionCount: 1,
        lockedPermissionCount: 0,
      },
    ])
  })

  it('returns empty array when no permissions exist', async () => {
    vi.mocked(permissionRepo.findByTenantId).mockResolvedValue([])

    const result = await handler.execute(new ListRolesQuery(TENANT_ID))

    expect(result).toEqual([])
  })
})
```

- [ ] **Step 4: Run test to verify failure**

- [ ] **Step 5: Write handler — ListRolesHandler**

```typescript
// apps/api/src/modules/admin/application/queries/list-roles.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../../kernel/domain/repositories/role-permission.repository.port'
import { ListRolesQuery } from './list-roles.query'

export interface RoleSummaryDto {
  roleKey: string
  permissionCount: number
  lockedPermissionCount: number
}

@QueryHandler(ListRolesQuery)
export class ListRolesHandler implements IQueryHandler<ListRolesQuery, RoleSummaryDto[]> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly permissionRepo: IRolePermissionRepository,
  ) {}

  async execute(query: ListRolesQuery): Promise<RoleSummaryDto[]> {
    const all = await this.permissionRepo.findByTenantId(query.tenantId)

    const grouped = new Map<string, { total: number; locked: number }>()
    for (const p of all) {
      const entry = grouped.get(p.roleKey) ?? { total: 0, locked: 0 }
      entry.total++
      if (p.isLocked) entry.locked++
      grouped.set(p.roleKey, entry)
    }

    return Array.from(grouped.entries()).map(([roleKey, counts]) => ({
      roleKey,
      permissionCount: counts.total,
      lockedPermissionCount: counts.locked,
    }))
  }
}
```

- [ ] **Step 6: Run test to verify pass**

- [ ] **Step 7: Write GetRolePermissions query + handler + test**

```typescript
// apps/api/src/modules/admin/application/queries/get-role-permissions.query.ts
export class GetRolePermissionsQuery {
  constructor(
    readonly tenantId: string,
    readonly roleKey: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/admin/application/queries/get-role-permissions.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetRolePermissionsQuery } from './get-role-permissions.query'
import { GetRolePermissionsHandler } from './get-role-permissions.handler'
import type { IRolePermissionRepository } from '../../../kernel/domain/repositories/role-permission.repository.port'
import type { RolePermission } from '../../../kernel/domain/entities/role-permission.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakePermissions: RolePermission[] = [
  {
    id: '01900000-0000-7000-8000-000000000030',
    tenantId: TENANT_ID,
    roleKey: 'employee',
    permissionKey: 'people:profile:self:read',
    isLocked: true,
    createdAt: new Date(),
  },
  {
    id: '01900000-0000-7000-8000-000000000031',
    tenantId: TENANT_ID,
    roleKey: 'employee',
    permissionKey: 'planner:task:self:manage',
    isLocked: false,
    createdAt: new Date(),
  },
]

describe('GetRolePermissionsHandler', () => {
  let handler: GetRolePermissionsHandler
  let permissionRepo: IRolePermissionRepository

  beforeEach(() => {
    permissionRepo = {
      findByRoleKey: vi.fn(),
      findByTenantId: vi.fn(),
      findByRoleKeyAndPermissionKey: vi.fn(),
      insert: vi.fn(),
      remove: vi.fn(),
      removeAllForRole: vi.fn(),
      insertMany: vi.fn(),
    }
    handler = new GetRolePermissionsHandler(permissionRepo)
  })

  it('returns permissions for a role grouped by module', async () => {
    vi.mocked(permissionRepo.findByRoleKey).mockResolvedValue(fakePermissions)

    const result = await handler.execute(new GetRolePermissionsQuery(TENANT_ID, 'employee'))

    expect(result).toEqual({
      roleKey: 'employee',
      permissions: [
        { permissionKey: 'people:profile:self:read', isLocked: true, module: 'people' },
        { permissionKey: 'planner:task:self:manage', isLocked: false, module: 'planner' },
      ],
    })
  })

  it('returns empty permissions for unknown role', async () => {
    vi.mocked(permissionRepo.findByRoleKey).mockResolvedValue([])

    const result = await handler.execute(new GetRolePermissionsQuery(TENANT_ID, 'unknown_role'))

    expect(result).toEqual({ roleKey: 'unknown_role', permissions: [] })
  })
})
```

```typescript
// apps/api/src/modules/admin/application/queries/get-role-permissions.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../../kernel/domain/repositories/role-permission.repository.port'
import { GetRolePermissionsQuery } from './get-role-permissions.query'

export interface PermissionDto {
  permissionKey: string
  isLocked: boolean
  module: string
}

export interface RolePermissionsDto {
  roleKey: string
  permissions: PermissionDto[]
}

@QueryHandler(GetRolePermissionsQuery)
export class GetRolePermissionsHandler implements IQueryHandler<
  GetRolePermissionsQuery,
  RolePermissionsDto
> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly permissionRepo: IRolePermissionRepository,
  ) {}

  async execute(query: GetRolePermissionsQuery): Promise<RolePermissionsDto> {
    const permissions = await this.permissionRepo.findByRoleKey(query.roleKey, query.tenantId)

    return {
      roleKey: query.roleKey,
      permissions: permissions.map((p) => ({
        permissionKey: p.permissionKey,
        isLocked: p.isLocked,
        module: p.permissionKey.split(':')[0],
      })),
    }
  }
}
```

- [ ] **Step 8: Run tests to verify pass**

- [ ] **Step 9: Write AddRolePermission command + handler + test**

```typescript
// apps/api/src/modules/admin/application/commands/add-role-permission.command.ts
export class AddRolePermissionCommand {
  constructor(
    readonly tenantId: string,
    readonly roleKey: string,
    readonly permissionKey: string,
    readonly addedBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/admin/application/commands/add-role-permission.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddRolePermissionCommand } from './add-role-permission.command'
import { AddRolePermissionHandler } from './add-role-permission.handler'
import type { IRolePermissionRepository } from '../../../kernel/domain/repositories/role-permission.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { RolePermission } from '../../../kernel/domain/entities/role-permission.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PERMISSION_ID = '01900000-0000-7000-8000-000000000040'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

describe('AddRolePermissionHandler', () => {
  let handler: AddRolePermissionHandler
  let permissionRepo: IRolePermissionRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    permissionRepo = {
      findByRoleKey: vi.fn(),
      findByTenantId: vi.fn(),
      findByRoleKeyAndPermissionKey: vi.fn(),
      insert: vi.fn(),
      remove: vi.fn(),
      removeAllForRole: vi.fn(),
      insertMany: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new AddRolePermissionHandler(permissionRepo, auditRepo)
  })

  it('adds a permission to a role', async () => {
    vi.mocked(permissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue(null)
    vi.mocked(permissionRepo.insert).mockResolvedValue({
      id: PERMISSION_ID,
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'time:attendance:self:read',
      isLocked: false,
      createdAt: new Date(),
    })
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(
      new AddRolePermissionCommand(TENANT_ID, 'employee', 'time:attendance:self:read', ACTOR_ID),
    )

    expect(result).toBe(PERMISSION_ID)
    expect(permissionRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'time:attendance:self:read',
      isLocked: false,
    })
  })

  it('throws when permission already exists for role', async () => {
    vi.mocked(permissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue({
      id: PERMISSION_ID,
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'time:attendance:self:read',
      isLocked: false,
      createdAt: new Date(),
    })

    await expect(
      handler.execute(
        new AddRolePermissionCommand(TENANT_ID, 'employee', 'time:attendance:self:read', ACTOR_ID),
      ),
    ).rejects.toThrow('Permission already assigned')
  })
})
```

```typescript
// apps/api/src/modules/admin/application/commands/add-role-permission.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../../kernel/domain/repositories/role-permission.repository.port'
import { AddRolePermissionCommand } from './add-role-permission.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class PermissionAlreadyAssignedException extends DomainException {
  readonly code = 'PERMISSION_ALREADY_ASSIGNED'
  constructor(roleKey: string, permissionKey: string) {
    super(`Permission already assigned to role: ${roleKey} -> ${permissionKey}`)
  }
}

@CommandHandler(AddRolePermissionCommand)
export class AddRolePermissionHandler implements ICommandHandler<AddRolePermissionCommand, string> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly permissionRepo: IRolePermissionRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: AddRolePermissionCommand): Promise<string> {
    const existing = await this.permissionRepo.findByRoleKeyAndPermissionKey(
      command.roleKey,
      command.permissionKey,
      command.tenantId,
    )
    if (existing) {
      throw new PermissionAlreadyAssignedException(command.roleKey, command.permissionKey)
    }

    const permission = await this.permissionRepo.insert({
      tenantId: command.tenantId,
      roleKey: command.roleKey,
      permissionKey: command.permissionKey,
      isLocked: false,
    })

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.addedBy,
      eventType: 'role_permission.added',
      module: 'admin',
      subjectId: permission.id,
      payload: { roleKey: command.roleKey, permissionKey: command.permissionKey },
    })

    return permission.id
  }
}
```

- [ ] **Step 10: Run tests to verify pass**

- [ ] **Step 11: Write RemoveRolePermission command + handler + test**

```typescript
// apps/api/src/modules/admin/application/commands/remove-role-permission.command.ts
export class RemoveRolePermissionCommand {
  constructor(
    readonly tenantId: string,
    readonly roleKey: string,
    readonly permissionKey: string,
    readonly removedBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/admin/application/commands/remove-role-permission.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoveRolePermissionCommand } from './remove-role-permission.command'
import { RemoveRolePermissionHandler } from './remove-role-permission.handler'
import type { IRolePermissionRepository } from '../../../kernel/domain/repositories/role-permission.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { RolePermission } from '../../../kernel/domain/entities/role-permission.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PERMISSION_ID = '01900000-0000-7000-8000-000000000040'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

describe('RemoveRolePermissionHandler', () => {
  let handler: RemoveRolePermissionHandler
  let permissionRepo: IRolePermissionRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    permissionRepo = {
      findByRoleKey: vi.fn(),
      findByTenantId: vi.fn(),
      findByRoleKeyAndPermissionKey: vi.fn(),
      insert: vi.fn(),
      remove: vi.fn(),
      removeAllForRole: vi.fn(),
      insertMany: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new RemoveRolePermissionHandler(permissionRepo, auditRepo)
  })

  it('removes a non-locked permission from a role', async () => {
    vi.mocked(permissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue({
      id: PERMISSION_ID,
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'planner:task:self:manage',
      isLocked: false,
      createdAt: new Date(),
    })
    vi.mocked(permissionRepo.remove).mockResolvedValue(undefined)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    await handler.execute(
      new RemoveRolePermissionCommand(TENANT_ID, 'employee', 'planner:task:self:manage', ACTOR_ID),
    )

    expect(permissionRepo.remove).toHaveBeenCalledWith(PERMISSION_ID, TENANT_ID)
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'role_permission.removed',
      module: 'admin',
      subjectId: PERMISSION_ID,
      payload: { roleKey: 'employee', permissionKey: 'planner:task:self:manage' },
    })
  })

  it('throws when permission not found', async () => {
    vi.mocked(permissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue(null)

    await expect(
      handler.execute(
        new RemoveRolePermissionCommand(TENANT_ID, 'employee', 'nonexistent:perm', ACTOR_ID),
      ),
    ).rejects.toThrow('Permission not found')
  })

  it('throws when trying to remove a locked permission', async () => {
    vi.mocked(permissionRepo.findByRoleKeyAndPermissionKey).mockResolvedValue({
      id: PERMISSION_ID,
      tenantId: TENANT_ID,
      roleKey: 'employee',
      permissionKey: 'people:profile:self:read',
      isLocked: true,
      createdAt: new Date(),
    })

    await expect(
      handler.execute(
        new RemoveRolePermissionCommand(
          TENANT_ID,
          'employee',
          'people:profile:self:read',
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow('Cannot remove locked permission')
  })
})
```

```typescript
// apps/api/src/modules/admin/application/commands/remove-role-permission.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../../kernel/domain/repositories/role-permission.repository.port'
import { RemoveRolePermissionCommand } from './remove-role-permission.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class PermissionNotFoundException extends DomainException {
  readonly code = 'PERMISSION_NOT_FOUND'
  constructor(roleKey: string, permissionKey: string) {
    super(`Permission not found for role: ${roleKey} -> ${permissionKey}`)
  }
}

class LockedPermissionException extends DomainException {
  readonly code = 'LOCKED_PERMISSION'
  constructor(permissionKey: string) {
    super(`Cannot remove locked permission: ${permissionKey}`)
  }
}

@CommandHandler(RemoveRolePermissionCommand)
export class RemoveRolePermissionHandler implements ICommandHandler<
  RemoveRolePermissionCommand,
  void
> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly permissionRepo: IRolePermissionRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: RemoveRolePermissionCommand): Promise<void> {
    const existing = await this.permissionRepo.findByRoleKeyAndPermissionKey(
      command.roleKey,
      command.permissionKey,
      command.tenantId,
    )

    if (!existing) {
      throw new PermissionNotFoundException(command.roleKey, command.permissionKey)
    }

    if (existing.isLocked) {
      throw new LockedPermissionException(command.permissionKey)
    }

    await this.permissionRepo.remove(existing.id, command.tenantId)

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.removedBy,
      eventType: 'role_permission.removed',
      module: 'admin',
      subjectId: existing.id,
      payload: { roleKey: command.roleKey, permissionKey: command.permissionKey },
    })
  }
}
```

- [ ] **Step 12: Run tests to verify pass**

- [ ] **Step 13: Write ResetRolePermissions command + handler + test**

```typescript
// apps/api/src/modules/admin/application/commands/reset-role-permissions.command.ts
export class ResetRolePermissionsCommand {
  constructor(
    readonly tenantId: string,
    readonly roleKey: string,
    readonly resetBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/admin/application/commands/reset-role-permissions.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResetRolePermissionsCommand } from './reset-role-permissions.command'
import {
  ResetRolePermissionsHandler,
  DEFAULT_ROLE_PERMISSIONS,
} from './reset-role-permissions.handler'
import type { IRolePermissionRepository } from '../../../kernel/domain/repositories/role-permission.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'

describe('ResetRolePermissionsHandler', () => {
  let handler: ResetRolePermissionsHandler
  let permissionRepo: IRolePermissionRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    permissionRepo = {
      findByRoleKey: vi.fn(),
      findByTenantId: vi.fn(),
      findByRoleKeyAndPermissionKey: vi.fn(),
      insert: vi.fn(),
      remove: vi.fn(),
      removeAllForRole: vi.fn(),
      insertMany: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new ResetRolePermissionsHandler(permissionRepo, auditRepo)
  })

  it('removes all permissions for role and re-inserts defaults', async () => {
    vi.mocked(permissionRepo.removeAllForRole).mockResolvedValue(undefined)
    vi.mocked(permissionRepo.insertMany).mockResolvedValue(undefined)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    await handler.execute(new ResetRolePermissionsCommand(TENANT_ID, 'employee', ACTOR_ID))

    expect(permissionRepo.removeAllForRole).toHaveBeenCalledWith('employee', TENANT_ID)
    expect(permissionRepo.insertMany).toHaveBeenCalledWith(
      DEFAULT_ROLE_PERMISSIONS['employee'].map((p) => ({
        tenantId: TENANT_ID,
        roleKey: 'employee',
        permissionKey: p.permissionKey,
        isLocked: p.isLocked,
      })),
    )
    expect(auditRepo.insert).toHaveBeenCalled()
  })

  it('throws when role has no default permissions defined', async () => {
    await expect(
      handler.execute(new ResetRolePermissionsCommand(TENANT_ID, 'nonexistent_role', ACTOR_ID)),
    ).rejects.toThrow('No default permissions defined')
  })
})
```

```typescript
// apps/api/src/modules/admin/application/commands/reset-role-permissions.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../../kernel/domain/repositories/role-permission.repository.port'
import { ResetRolePermissionsCommand } from './reset-role-permissions.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class NoDefaultPermissionsException extends DomainException {
  readonly code = 'NO_DEFAULT_PERMISSIONS'
  constructor(roleKey: string) {
    super(`No default permissions defined for role: ${roleKey}`)
  }
}

export const DEFAULT_ROLE_PERMISSIONS: Record<
  string,
  Array<{ permissionKey: string; isLocked: boolean }>
> = {
  employee: [
    { permissionKey: 'people:profile:self:read', isLocked: true },
    { permissionKey: 'time:leave:self:submit', isLocked: true },
    { permissionKey: 'time:attendance:self:read', isLocked: true },
    { permissionKey: 'planner:task:self:manage', isLocked: false },
  ],
  line_manager: [
    { permissionKey: 'people:profile:self:read', isLocked: true },
    { permissionKey: 'time:leave:self:submit', isLocked: true },
    { permissionKey: 'time:attendance:self:read', isLocked: true },
    { permissionKey: 'people:profile:team:read', isLocked: true },
    { permissionKey: 'time:leave:approve', isLocked: false },
    { permissionKey: 'performance:review:submit', isLocked: false },
  ],
  hr_ops: [
    { permissionKey: 'people:profile:self:read', isLocked: true },
    { permissionKey: 'time:leave:self:submit', isLocked: true },
    { permissionKey: 'time:attendance:self:read', isLocked: true },
    { permissionKey: 'people:profile:read', isLocked: false },
    { permissionKey: 'people:profile:update', isLocked: false },
    { permissionKey: 'time:leave:read', isLocked: false },
    { permissionKey: 'hiring:candidate:read', isLocked: false },
  ],
  tenant_admin: [
    { permissionKey: 'admin:role:manage', isLocked: true },
    { permissionKey: 'admin:tenant:read', isLocked: true },
    { permissionKey: 'admin:tenant:manage', isLocked: false },
    { permissionKey: 'admin:audit:read', isLocked: false },
    { permissionKey: 'admin:agent:manage', isLocked: false },
  ],
  recruiter: [
    { permissionKey: 'people:profile:self:read', isLocked: true },
    { permissionKey: 'time:leave:self:submit', isLocked: true },
    { permissionKey: 'time:attendance:self:read', isLocked: true },
    { permissionKey: 'hiring:candidate:read', isLocked: false },
    { permissionKey: 'hiring:candidate:create', isLocked: false },
    { permissionKey: 'hiring:pipeline:manage', isLocked: false },
  ],
  finance_operator: [
    { permissionKey: 'people:profile:self:read', isLocked: true },
    { permissionKey: 'time:leave:self:submit', isLocked: true },
    { permissionKey: 'time:attendance:self:read', isLocked: true },
    { permissionKey: 'finance:invoice:read', isLocked: false },
    { permissionKey: 'finance:payroll:read', isLocked: false },
    { permissionKey: 'finance:budget:manage', isLocked: false },
  ],
  project_manager: [
    { permissionKey: 'people:profile:self:read', isLocked: true },
    { permissionKey: 'time:leave:self:submit', isLocked: true },
    { permissionKey: 'time:attendance:self:read', isLocked: true },
    { permissionKey: 'projects:assignment:manage', isLocked: false },
    { permissionKey: 'projects:staffing:read', isLocked: false },
  ],
  platform_admin: [
    { permissionKey: 'admin:role:manage', isLocked: true },
    { permissionKey: 'admin:tenant:read', isLocked: true },
    { permissionKey: 'admin:tenant:manage', isLocked: true },
    { permissionKey: 'admin:audit:read', isLocked: true },
    { permissionKey: 'admin:agent:manage', isLocked: true },
  ],
}

@CommandHandler(ResetRolePermissionsCommand)
export class ResetRolePermissionsHandler implements ICommandHandler<
  ResetRolePermissionsCommand,
  void
> {
  constructor(
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly permissionRepo: IRolePermissionRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: ResetRolePermissionsCommand): Promise<void> {
    const defaults = DEFAULT_ROLE_PERMISSIONS[command.roleKey]
    if (!defaults) {
      throw new NoDefaultPermissionsException(command.roleKey)
    }

    await this.permissionRepo.removeAllForRole(command.roleKey, command.tenantId)

    await this.permissionRepo.insertMany(
      defaults.map((p) => ({
        tenantId: command.tenantId,
        roleKey: command.roleKey,
        permissionKey: p.permissionKey,
        isLocked: p.isLocked,
      })),
    )

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.resetBy,
      eventType: 'role_permissions.reset',
      module: 'admin',
      subjectId: command.tenantId,
      payload: {
        roleKey: command.roleKey,
        permissionCount: defaults.length,
      },
    })
  }
}
```

- [ ] **Step 14: Run all tests to verify pass**

- [ ] **Step 15: Wire tRPC procedures into admin router**

```typescript
// apps/api/src/modules/admin/interface/trpc/admin.router.ts
import { z } from 'zod'
import { router, protectedProcedure } from '../../../../common/trpc/trpc-init'
import { ListRolesQuery } from '../../application/queries/list-roles.query'
import { GetRolePermissionsQuery } from '../../application/queries/get-role-permissions.query'
import { AddRolePermissionCommand } from '../../application/commands/add-role-permission.command'
import { RemoveRolePermissionCommand } from '../../application/commands/remove-role-permission.command'
import { ResetRolePermissionsCommand } from '../../application/commands/reset-role-permissions.command'

const roleKeyInput = z.enum([
  'hr_ops',
  'line_manager',
  'project_manager',
  'staffing_owner',
  'account_manager',
  'finance_operator',
  'executive',
  'employee',
  'review_operator',
  'recruiter',
  'tenant_admin',
  'platform_admin',
])

const addPermissionInput = z.object({
  roleKey: roleKeyInput,
  permissionKey: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z]+:[a-z_]+(?::[a-z_]+)*$/),
})

const removePermissionInput = z.object({
  roleKey: roleKeyInput,
  permissionKey: z.string().min(1).max(255),
})

const resetPermissionsInput = z.object({
  roleKey: roleKeyInput,
})

export const adminRolesRouter = router({
  list: protectedProcedure.meta({ permission: 'admin:role:manage' }).query(async ({ ctx }) => {
    return ctx.queryBus.execute(new ListRolesQuery(ctx.tenantId))
  }),

  getPermissions: protectedProcedure
    .meta({ permission: 'admin:role:manage' })
    .input(z.object({ roleKey: roleKeyInput }))
    .query(async ({ ctx, input }) => {
      return ctx.queryBus.execute(new GetRolePermissionsQuery(ctx.tenantId, input.roleKey))
    }),

  addPermission: protectedProcedure
    .meta({ permission: 'admin:role:manage' })
    .input(addPermissionInput)
    .mutation(async ({ ctx, input }) => {
      const permissionId = await ctx.commandBus.execute(
        new AddRolePermissionCommand(ctx.tenantId, input.roleKey, input.permissionKey, ctx.actorId),
      )
      return { permissionId }
    }),

  removePermission: protectedProcedure
    .meta({ permission: 'admin:role:manage' })
    .input(removePermissionInput)
    .mutation(async ({ ctx, input }) => {
      await ctx.commandBus.execute(
        new RemoveRolePermissionCommand(
          ctx.tenantId,
          input.roleKey,
          input.permissionKey,
          ctx.actorId,
        ),
      )
      return { success: true }
    }),

  resetToDefaults: protectedProcedure
    .meta({ permission: 'admin:role:manage' })
    .input(resetPermissionsInput)
    .mutation(async ({ ctx, input }) => {
      await ctx.commandBus.execute(
        new ResetRolePermissionsCommand(ctx.tenantId, input.roleKey, ctx.actorId),
      )
      return { success: true }
    }),
})

export const adminRouter = router({
  roles: adminRolesRouter,
})
```

- [ ] **Step 16: Run all tests to verify pass**
- [ ] **Step 17: Commit**

```bash
git add apps/api/src/modules/admin/ apps/api/src/modules/kernel/domain/entities/role-permission.entity.ts apps/api/src/modules/kernel/domain/repositories/role-permission.repository.port.ts
git commit -m "feat(admin): add permission management endpoints with TDD"
```

---

## Task 4: Local Account Management Endpoints

**Files:**

- Create: `apps/api/src/modules/identity/application/commands/invite-local-user.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/invite-local-user.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/invite-local-user.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/commands/deactivate-local-user.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/deactivate-local-user.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/deactivate-local-user.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/queries/list-local-users.query.ts`
- Create: `apps/api/src/modules/identity/application/queries/list-local-users.handler.ts`
- Create: `apps/api/src/modules/identity/application/queries/list-local-users.handler.spec.ts`
- Create: `apps/api/src/modules/identity/domain/ports/magic-link-sender.port.ts`
- Modify: `apps/api/src/modules/identity/interface/trpc/identity.router.ts`

### Step-by-step

- [ ] **Step 1: Create port — IMagicLinkSender**

```typescript
// apps/api/src/modules/identity/domain/ports/magic-link-sender.port.ts
export const MAGIC_LINK_SENDER = Symbol('IMagicLinkSender')

export interface IMagicLinkSender {
  sendInvitation(params: {
    email: string
    displayName: string
    tenantSlug: string
    token: string
  }): Promise<void>
}
```

- [ ] **Step 2: Write failing test — InviteLocalUserHandler**

```typescript
// apps/api/src/modules/identity/application/commands/invite-local-user.command.ts
export class InviteLocalUserCommand {
  constructor(
    readonly tenantId: string,
    readonly email: string,
    readonly displayName: string,
    readonly roleAssignments: Array<{
      roleKey: string
      scopeType: 'global' | 'department' | 'project' | 'account'
      scopeId: string | null
    }>,
    readonly invitedBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/identity/application/commands/invite-local-user.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { InviteLocalUserCommand } from './invite-local-user.command'
import { InviteLocalUserHandler } from './invite-local-user.handler'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IMagicLinkSender } from '../../domain/ports/magic-link-sender.port'
import type { IUserIdentityRepository } from '../../../kernel/domain/repositories/user-identity.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'
const NEW_ACTOR_ID = '01900000-0000-7000-8000-000000000050'
const NEW_IDENTITY_ID = '01900000-0000-7000-8000-000000000051'
const ROLE_GRANT_ID = '01900000-0000-7000-8000-000000000052'

describe('InviteLocalUserHandler', () => {
  let handler: InviteLocalUserHandler
  let commandBus: CommandBus
  let userIdentityRepo: IUserIdentityRepository
  let auditRepo: IAuditEventRepository
  let magicLinkSender: IMagicLinkSender

  beforeEach(() => {
    commandBus = {
      execute: vi.fn(),
    } as unknown as CommandBus

    userIdentityRepo = {
      findById: vi.fn(),
      findBySsoSubject: vi.fn(),
      insert: vi.fn(),
      deprovisionByActorId: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    magicLinkSender = {
      sendInvitation: vi.fn(),
    }
    handler = new InviteLocalUserHandler(commandBus, userIdentityRepo, auditRepo, magicLinkSender)
  })

  it('creates actor, identity, role grants, and sends magic link', async () => {
    // CommandBus.execute returns actorId for CreateActorCommand, grantId for GrantRoleCommand
    vi.mocked(commandBus.execute)
      .mockResolvedValueOnce(NEW_ACTOR_ID) // CreateActorCommand
      .mockResolvedValueOnce(ROLE_GRANT_ID) // GrantRoleCommand
    vi.mocked(userIdentityRepo.insert).mockResolvedValue({
      id: NEW_IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: NEW_ACTOR_ID,
      email: 'contractor@example.com',
      ssoSubject: `local:contractor@example.com`,
      provider: 'local',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)
    vi.mocked(magicLinkSender.sendInvitation).mockResolvedValue(undefined)

    const result = await handler.execute(
      new InviteLocalUserCommand(
        TENANT_ID,
        'contractor@example.com',
        'John Contractor',
        [{ roleKey: 'employee', scopeType: 'global', scopeId: null }],
        ACTOR_ID,
      ),
    )

    expect(result).toEqual({ actorId: NEW_ACTOR_ID })
    expect(commandBus.execute).toHaveBeenCalledTimes(2) // CreateActor + 1 GrantRole
    expect(userIdentityRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: NEW_ACTOR_ID,
      email: 'contractor@example.com',
      ssoSubject: 'local:contractor@example.com',
      provider: 'local',
    })
    expect(magicLinkSender.sendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'contractor@example.com',
        displayName: 'John Contractor',
      }),
    )
    expect(auditRepo.insert).toHaveBeenCalled()
  })

  it('creates multiple role grants when multiple roles provided', async () => {
    vi.mocked(commandBus.execute)
      .mockResolvedValueOnce(NEW_ACTOR_ID) // CreateActorCommand
      .mockResolvedValueOnce(ROLE_GRANT_ID) // GrantRoleCommand #1
      .mockResolvedValueOnce(ROLE_GRANT_ID) // GrantRoleCommand #2
    vi.mocked(userIdentityRepo.insert).mockResolvedValue({
      id: NEW_IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: NEW_ACTOR_ID,
      email: 'contractor@example.com',
      ssoSubject: 'local:contractor@example.com',
      provider: 'local',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)
    vi.mocked(magicLinkSender.sendInvitation).mockResolvedValue(undefined)

    await handler.execute(
      new InviteLocalUserCommand(
        TENANT_ID,
        'contractor@example.com',
        'John Contractor',
        [
          { roleKey: 'employee', scopeType: 'global', scopeId: null },
          { roleKey: 'project_manager', scopeType: 'project', scopeId: 'proj-001' },
        ],
        ACTOR_ID,
      ),
    )

    // CreateActor + 2 GrantRole
    expect(commandBus.execute).toHaveBeenCalledTimes(3)
  })
})
```

- [ ] **Step 3: Run test to verify failure**

- [ ] **Step 4: Write handler — InviteLocalUserHandler**

```typescript
// apps/api/src/modules/identity/application/commands/invite-local-user.handler.ts
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
} from '../../../kernel/domain/repositories/user-identity.repository.port'
import { CreateActorCommand } from '../../../kernel/application/commands/create-actor.command'
import { GrantRoleCommand } from '../../../kernel/application/commands/grant-role.command'
import { MAGIC_LINK_SENDER, type IMagicLinkSender } from '../../domain/ports/magic-link-sender.port'
import { InviteLocalUserCommand } from './invite-local-user.command'
import type {
  RoleKeyValue,
  ScopeTypeValue,
} from '../../../kernel/domain/entities/role-grant.entity'

@CommandHandler(InviteLocalUserCommand)
export class InviteLocalUserHandler implements ICommandHandler<
  InviteLocalUserCommand,
  { actorId: string }
> {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(USER_IDENTITY_REPOSITORY)
    private readonly userIdentityRepo: IUserIdentityRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
    @Inject(MAGIC_LINK_SENDER)
    private readonly magicLinkSender: IMagicLinkSender,
  ) {}

  async execute(command: InviteLocalUserCommand): Promise<{ actorId: string }> {
    // 1. Create actor via kernel command bus
    const actorId = await this.commandBus.execute(
      new CreateActorCommand(command.tenantId, 'person', command.displayName),
    )

    // 2. Create user_identity with provider='local'
    await this.userIdentityRepo.insert({
      tenantId: command.tenantId,
      actorId,
      email: command.email,
      ssoSubject: `local:${command.email}`,
      provider: 'local',
    })

    // 3. Grant roles via kernel command bus
    for (const role of command.roleAssignments) {
      await this.commandBus.execute(
        new GrantRoleCommand(
          command.tenantId,
          actorId,
          role.roleKey as RoleKeyValue,
          role.scopeType as ScopeTypeValue,
          role.scopeId,
          command.invitedBy,
        ),
      )
    }

    // 4. Send magic link invitation
    await this.magicLinkSender.sendInvitation({
      email: command.email,
      displayName: command.displayName,
      tenantSlug: command.tenantId, // resolved to slug in infra layer
      token: '', // token generated in infra layer
    })

    // 5. Audit
    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.invitedBy,
      eventType: 'local_user.invited',
      module: 'identity',
      subjectId: actorId,
      payload: {
        email: command.email,
        displayName: command.displayName,
        roles: command.roleAssignments.map((r) => r.roleKey),
      },
    })

    return { actorId }
  }
}
```

- [ ] **Step 5: Run test to verify pass**

- [ ] **Step 6: Write DeactivateLocalUser command + handler + test**

```typescript
// apps/api/src/modules/identity/application/commands/deactivate-local-user.command.ts
export class DeactivateLocalUserCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly deactivatedBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/identity/application/commands/deactivate-local-user.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { DeactivateLocalUserCommand } from './deactivate-local-user.command'
import { DeactivateLocalUserHandler } from './deactivate-local-user.handler'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const TARGET_ACTOR_ID = '01900000-0000-7000-8000-000000000050'
const ADMIN_ACTOR_ID = '01900000-0000-7000-8000-000000000005'

describe('DeactivateLocalUserHandler', () => {
  let handler: DeactivateLocalUserHandler
  let commandBus: CommandBus
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    commandBus = {
      execute: vi.fn(),
    } as unknown as CommandBus
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new DeactivateLocalUserHandler(commandBus, auditRepo)
  })

  it('deactivates user identity, revokes roles, and updates actor status', async () => {
    vi.mocked(commandBus.execute).mockResolvedValue(undefined)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    await handler.execute(
      new DeactivateLocalUserCommand(TENANT_ID, TARGET_ACTOR_ID, ADMIN_ACTOR_ID),
    )

    // DeprovisionUserIdentity + RevokeAllRoleGrants + UpdateActorStatus
    expect(commandBus.execute).toHaveBeenCalledTimes(3)
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ADMIN_ACTOR_ID,
      eventType: 'local_user.deactivated',
      module: 'identity',
      subjectId: TARGET_ACTOR_ID,
      payload: {},
    })
  })
})
```

```typescript
// apps/api/src/modules/identity/application/commands/deactivate-local-user.handler.ts
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import { DeprovisionUserIdentityCommand } from '../../../kernel/application/commands/deprovision-user-identity.command'
import { RevokeAllRoleGrantsCommand } from '../../../kernel/application/commands/revoke-all-role-grants.command'
import { UpdateActorStatusCommand } from '../../../kernel/application/commands/update-actor-status.command'
import { DeactivateLocalUserCommand } from './deactivate-local-user.command'

@CommandHandler(DeactivateLocalUserCommand)
export class DeactivateLocalUserHandler implements ICommandHandler<
  DeactivateLocalUserCommand,
  void
> {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: DeactivateLocalUserCommand): Promise<void> {
    // 1. Deprovision user identity
    await this.commandBus.execute(
      new DeprovisionUserIdentityCommand(command.tenantId, command.actorId),
    )

    // 2. Revoke all role grants
    await this.commandBus.execute(
      new RevokeAllRoleGrantsCommand(command.tenantId, command.actorId, new Date()),
    )

    // 3. Update actor status to inactive
    await this.commandBus.execute(
      new UpdateActorStatusCommand(command.tenantId, command.actorId, 'inactive'),
    )

    // 4. Audit
    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.deactivatedBy,
      eventType: 'local_user.deactivated',
      module: 'identity',
      subjectId: command.actorId,
      payload: {},
    })
  }
}
```

- [ ] **Step 7: Run tests to verify pass**

- [ ] **Step 8: Write ListLocalUsers query + handler + test**

```typescript
// apps/api/src/modules/identity/application/queries/list-local-users.query.ts
export class ListLocalUsersQuery {
  constructor(readonly tenantId: string) {}
}
```

```typescript
// apps/api/src/modules/identity/application/queries/list-local-users.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListLocalUsersQuery } from './list-local-users.query'
import { ListLocalUsersHandler } from './list-local-users.handler'
import type { ILocalUserQueryPort } from '../../domain/ports/local-user-query.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeLocalUsers = [
  {
    actorId: '01900000-0000-7000-8000-000000000050',
    email: 'contractor@example.com',
    displayName: 'John Contractor',
    status: 'active' as const,
    lastLoginAt: null,
    createdAt: new Date('2026-04-10T10:00:00Z'),
  },
]

describe('ListLocalUsersHandler', () => {
  let handler: ListLocalUsersHandler
  let localUserQuery: ILocalUserQueryPort

  beforeEach(() => {
    localUserQuery = {
      listByTenantId: vi.fn(),
    }
    handler = new ListLocalUsersHandler(localUserQuery)
  })

  it('returns local users for the tenant', async () => {
    vi.mocked(localUserQuery.listByTenantId).mockResolvedValue(fakeLocalUsers)

    const result = await handler.execute(new ListLocalUsersQuery(TENANT_ID))

    expect(result).toEqual(fakeLocalUsers)
    expect(localUserQuery.listByTenantId).toHaveBeenCalledWith(TENANT_ID)
  })

  it('returns empty array when no local users exist', async () => {
    vi.mocked(localUserQuery.listByTenantId).mockResolvedValue([])

    const result = await handler.execute(new ListLocalUsersQuery(TENANT_ID))

    expect(result).toEqual([])
  })
})
```

```typescript
// apps/api/src/modules/identity/domain/ports/local-user-query.port.ts
export const LOCAL_USER_QUERY_PORT = Symbol('ILocalUserQueryPort')

export interface LocalUserDto {
  actorId: string
  email: string
  displayName: string
  status: 'active' | 'suspended' | 'deprovisioned'
  lastLoginAt: Date | null
  createdAt: Date
}

export interface ILocalUserQueryPort {
  listByTenantId(tenantId: string): Promise<LocalUserDto[]>
}
```

```typescript
// apps/api/src/modules/identity/application/queries/list-local-users.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  LOCAL_USER_QUERY_PORT,
  type ILocalUserQueryPort,
  type LocalUserDto,
} from '../../domain/ports/local-user-query.port'
import { ListLocalUsersQuery } from './list-local-users.query'

@QueryHandler(ListLocalUsersQuery)
export class ListLocalUsersHandler implements IQueryHandler<ListLocalUsersQuery, LocalUserDto[]> {
  constructor(
    @Inject(LOCAL_USER_QUERY_PORT)
    private readonly localUserQuery: ILocalUserQueryPort,
  ) {}

  async execute(query: ListLocalUsersQuery): Promise<LocalUserDto[]> {
    return this.localUserQuery.listByTenantId(query.tenantId)
  }
}
```

- [ ] **Step 9: Run all tests to verify pass**

- [ ] **Step 10: Wire tRPC procedures for local accounts**

Add to `identityAdminRouter` in `apps/api/src/modules/identity/interface/trpc/identity.router.ts`:

```typescript
const inviteLocalUserInput = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(200),
  roleAssignments: z.array(
    z.object({
      roleKey: z.enum([
        'hr_ops', 'line_manager', 'project_manager', 'staffing_owner',
        'account_manager', 'finance_operator', 'executive', 'employee',
        'review_operator', 'recruiter', 'tenant_admin',
      ]),
      scopeType: z.enum(['global', 'department', 'project', 'account']),
      scopeId: z.string().uuid().nullable(),
    }),
  ).min(1),
})

const deactivateLocalUserInput = z.object({
  actorId: z.string().uuid(),
})

// Add these procedures to identityAdminRouter:
inviteLocalUser: protectedProcedure
  .meta({ permission: 'admin:tenant:manage' })
  .input(inviteLocalUserInput)
  .mutation(async ({ ctx, input }) => {
    return ctx.commandBus.execute(
      new InviteLocalUserCommand(
        ctx.tenantId,
        input.email,
        input.displayName,
        input.roleAssignments,
        ctx.actorId,
      ),
    )
  }),

listLocalUsers: protectedProcedure
  .meta({ permission: 'admin:tenant:manage' })
  .query(async ({ ctx }) => {
    return ctx.queryBus.execute(new ListLocalUsersQuery(ctx.tenantId))
  }),

deactivateLocalUser: protectedProcedure
  .meta({ permission: 'admin:tenant:manage' })
  .input(deactivateLocalUserInput)
  .mutation(async ({ ctx, input }) => {
    await ctx.commandBus.execute(
      new DeactivateLocalUserCommand(ctx.tenantId, input.actorId, ctx.actorId),
    )
    return { success: true }
  }),
```

- [ ] **Step 11: Run all tests to verify pass**
- [ ] **Step 12: Commit**

```bash
git add apps/api/src/modules/identity/
git commit -m "feat(identity): add local account management endpoints with TDD"
```

---

## Task 5: Sync Monitoring Endpoints

**Files:**

- Create: `apps/api/src/modules/identity/domain/entities/sync-history.entity.ts`
- Create: `apps/api/src/modules/identity/domain/repositories/sync-history.repository.port.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-sync-status.query.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-sync-status.handler.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-sync-status.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-sync-history.query.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-sync-history.handler.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-sync-history.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/commands/trigger-directory-sync.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/trigger-directory-sync.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/trigger-directory-sync.handler.spec.ts`
- Modify: `apps/api/src/modules/identity/interface/trpc/identity.router.ts`

### Step-by-step

- [ ] **Step 1: Create domain entity and port — SyncHistory**

```typescript
// apps/api/src/modules/identity/domain/entities/sync-history.entity.ts
export interface SyncHistory {
  id: string
  tenantId: string
  identityProviderId: string
  status: 'completed' | 'failed'
  usersCreated: number
  usersDeactivated: number
  rolesChanged: number
  errorMessage: string | null
  startedAt: Date
  completedAt: Date
}
```

```typescript
// apps/api/src/modules/identity/domain/repositories/sync-history.repository.port.ts
import type { SyncHistory } from '../entities/sync-history.entity'

export const SYNC_HISTORY_REPOSITORY = Symbol('ISyncHistoryRepository')

export interface ISyncHistoryRepository {
  findLatestByTenantId(tenantId: string, limit: number): Promise<SyncHistory[]>
  insert(data: {
    tenantId: string
    identityProviderId: string
    status: SyncHistory['status']
    usersCreated: number
    usersDeactivated: number
    rolesChanged: number
    errorMessage: string | null
    startedAt: Date
    completedAt: Date
  }): Promise<SyncHistory>
}
```

- [ ] **Step 2: Create port — IJobScheduler**

```typescript
// apps/api/src/modules/identity/domain/ports/job-scheduler.port.ts
export const JOB_SCHEDULER = Symbol('IJobScheduler')

export interface IJobScheduler {
  enqueueDirectorySync(tenantId: string): Promise<string>
  getNextScheduledSync(tenantId: string): Promise<Date | null>
}
```

- [ ] **Step 3: Write failing test — GetSyncStatusHandler**

```typescript
// apps/api/src/modules/identity/application/queries/get-sync-status.query.ts
export class GetSyncStatusQuery {
  constructor(readonly tenantId: string) {}
}
```

```typescript
// apps/api/src/modules/identity/application/queries/get-sync-status.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetSyncStatusQuery } from './get-sync-status.query'
import { GetSyncStatusHandler } from './get-sync-status.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository.port'
import type { ISyncHistoryRepository } from '../../domain/repositories/sync-history.repository.port'
import type { IJobScheduler } from '../../domain/ports/job-scheduler.port'
import type { IdentityProvider } from '../../domain/entities/identity-provider.entity'
import type { SyncHistory } from '../../domain/entities/sync-history.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'

const fakeProvider: IdentityProvider = {
  id: PROVIDER_ID,
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'client-id-123',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
  directoryId: 'directory-id-456',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: new Date('2026-04-11T08:00:00Z'),
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeLastSync: SyncHistory = {
  id: '01900000-0000-7000-8000-000000000060',
  tenantId: TENANT_ID,
  identityProviderId: PROVIDER_ID,
  status: 'completed',
  usersCreated: 5,
  usersDeactivated: 1,
  rolesChanged: 12,
  errorMessage: null,
  startedAt: new Date('2026-04-11T08:00:00Z'),
  completedAt: new Date('2026-04-11T08:00:45Z'),
}

describe('GetSyncStatusHandler', () => {
  let handler: GetSyncStatusHandler
  let providerRepo: IIdentityProviderRepository
  let syncHistoryRepo: ISyncHistoryRepository
  let jobScheduler: IJobScheduler

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    syncHistoryRepo = {
      findLatestByTenantId: vi.fn(),
      insert: vi.fn(),
    }
    jobScheduler = {
      enqueueDirectorySync: vi.fn(),
      getNextScheduledSync: vi.fn(),
    }
    handler = new GetSyncStatusHandler(providerRepo, syncHistoryRepo, jobScheduler)
  })

  it('returns sync status with last sync and next scheduled', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(fakeProvider)
    vi.mocked(syncHistoryRepo.findLatestByTenantId).mockResolvedValue([fakeLastSync])
    vi.mocked(jobScheduler.getNextScheduledSync).mockResolvedValue(new Date('2026-04-11T09:00:00Z'))

    const result = await handler.execute(new GetSyncStatusQuery(TENANT_ID))

    expect(result).toEqual({
      syncEnabled: true,
      syncStatus: 'idle',
      lastSyncAt: '2026-04-11T08:00:00.000Z',
      nextScheduledAt: '2026-04-11T09:00:00.000Z',
      lastSyncStats: {
        usersCreated: 5,
        usersDeactivated: 1,
        rolesChanged: 12,
        status: 'completed',
        errorMessage: null,
      },
    })
  })

  it('returns null fields when no provider configured', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(null)

    const result = await handler.execute(new GetSyncStatusQuery(TENANT_ID))

    expect(result).toEqual({
      syncEnabled: false,
      syncStatus: null,
      lastSyncAt: null,
      nextScheduledAt: null,
      lastSyncStats: null,
    })
  })
})
```

- [ ] **Step 4: Run test to verify failure**

- [ ] **Step 5: Write handler — GetSyncStatusHandler**

```typescript
// apps/api/src/modules/identity/application/queries/get-sync-status.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository.port'
import {
  SYNC_HISTORY_REPOSITORY,
  type ISyncHistoryRepository,
} from '../../domain/repositories/sync-history.repository.port'
import { JOB_SCHEDULER, type IJobScheduler } from '../../domain/ports/job-scheduler.port'
import { GetSyncStatusQuery } from './get-sync-status.query'

export interface SyncStatusDto {
  syncEnabled: boolean
  syncStatus: string | null
  lastSyncAt: string | null
  nextScheduledAt: string | null
  lastSyncStats: {
    usersCreated: number
    usersDeactivated: number
    rolesChanged: number
    status: string
    errorMessage: string | null
  } | null
}

@QueryHandler(GetSyncStatusQuery)
export class GetSyncStatusHandler implements IQueryHandler<GetSyncStatusQuery, SyncStatusDto> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(SYNC_HISTORY_REPOSITORY)
    private readonly syncHistoryRepo: ISyncHistoryRepository,
    @Inject(JOB_SCHEDULER)
    private readonly jobScheduler: IJobScheduler,
  ) {}

  async execute(query: GetSyncStatusQuery): Promise<SyncStatusDto> {
    const provider = await this.providerRepo.findPrimaryByTenantId(query.tenantId)

    if (!provider) {
      return {
        syncEnabled: false,
        syncStatus: null,
        lastSyncAt: null,
        nextScheduledAt: null,
        lastSyncStats: null,
      }
    }

    const history = await this.syncHistoryRepo.findLatestByTenantId(query.tenantId, 1)
    const lastSync = history[0] ?? null
    const nextScheduled = await this.jobScheduler.getNextScheduledSync(query.tenantId)

    return {
      syncEnabled: provider.syncEnabled,
      syncStatus: provider.syncStatus,
      lastSyncAt: provider.lastSyncAt?.toISOString() ?? null,
      nextScheduledAt: nextScheduled?.toISOString() ?? null,
      lastSyncStats: lastSync
        ? {
            usersCreated: lastSync.usersCreated,
            usersDeactivated: lastSync.usersDeactivated,
            rolesChanged: lastSync.rolesChanged,
            status: lastSync.status,
            errorMessage: lastSync.errorMessage,
          }
        : null,
    }
  }
}
```

- [ ] **Step 6: Run test to verify pass**

- [ ] **Step 7: Write GetSyncHistory query + handler + test**

```typescript
// apps/api/src/modules/identity/application/queries/get-sync-history.query.ts
export class GetSyncHistoryQuery {
  constructor(
    readonly tenantId: string,
    readonly limit: number,
    readonly offset: number,
  ) {}
}
```

```typescript
// apps/api/src/modules/identity/application/queries/get-sync-history.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetSyncHistoryQuery } from './get-sync-history.query'
import { GetSyncHistoryHandler } from './get-sync-history.handler'
import type { ISyncHistoryRepository } from '../../domain/repositories/sync-history.repository.port'
import type { SyncHistory } from '../../domain/entities/sync-history.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeSyncHistory: SyncHistory[] = [
  {
    id: '01900000-0000-7000-8000-000000000060',
    tenantId: TENANT_ID,
    identityProviderId: '01900000-0000-7000-8000-000000000010',
    status: 'completed',
    usersCreated: 5,
    usersDeactivated: 1,
    rolesChanged: 12,
    errorMessage: null,
    startedAt: new Date('2026-04-11T08:00:00Z'),
    completedAt: new Date('2026-04-11T08:00:45Z'),
  },
]

describe('GetSyncHistoryHandler', () => {
  let handler: GetSyncHistoryHandler
  let syncHistoryRepo: ISyncHistoryRepository

  beforeEach(() => {
    syncHistoryRepo = {
      findLatestByTenantId: vi.fn(),
      insert: vi.fn(),
    }
    handler = new GetSyncHistoryHandler(syncHistoryRepo)
  })

  it('returns paginated sync history', async () => {
    vi.mocked(syncHistoryRepo.findLatestByTenantId).mockResolvedValue(fakeSyncHistory)

    const result = await handler.execute(new GetSyncHistoryQuery(TENANT_ID, 20, 0))

    expect(result).toEqual(fakeSyncHistory)
    expect(syncHistoryRepo.findLatestByTenantId).toHaveBeenCalledWith(TENANT_ID, 20)
  })
})
```

```typescript
// apps/api/src/modules/identity/application/queries/get-sync-history.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  SYNC_HISTORY_REPOSITORY,
  type ISyncHistoryRepository,
} from '../../domain/repositories/sync-history.repository.port'
import type { SyncHistory } from '../../domain/entities/sync-history.entity'
import { GetSyncHistoryQuery } from './get-sync-history.query'

@QueryHandler(GetSyncHistoryQuery)
export class GetSyncHistoryHandler implements IQueryHandler<GetSyncHistoryQuery, SyncHistory[]> {
  constructor(
    @Inject(SYNC_HISTORY_REPOSITORY)
    private readonly syncHistoryRepo: ISyncHistoryRepository,
  ) {}

  async execute(query: GetSyncHistoryQuery): Promise<SyncHistory[]> {
    return this.syncHistoryRepo.findLatestByTenantId(query.tenantId, query.limit)
  }
}
```

- [ ] **Step 8: Run tests to verify pass**

- [ ] **Step 9: Write TriggerDirectorySync command + handler + test**

```typescript
// apps/api/src/modules/identity/application/commands/trigger-directory-sync.command.ts
export class TriggerDirectorySyncCommand {
  constructor(
    readonly tenantId: string,
    readonly triggeredBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/identity/application/commands/trigger-directory-sync.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TriggerDirectorySyncCommand } from './trigger-directory-sync.command'
import { TriggerDirectorySyncHandler } from './trigger-directory-sync.handler'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository.port'
import type { IJobScheduler } from '../../domain/ports/job-scheduler.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IdentityProvider } from '../../domain/entities/identity-provider.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'
const JOB_ID = 'job-12345'

const fakeProvider: IdentityProvider = {
  id: PROVIDER_ID,
  tenantId: TENANT_ID,
  providerType: 'microsoft',
  displayName: 'SETA Entra',
  clientId: 'client-id-123',
  clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:entra-client-secret',
  directoryId: 'directory-id-456',
  isPrimary: true,
  syncEnabled: true,
  lastSyncAt: null,
  syncStatus: 'idle',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('TriggerDirectorySyncHandler', () => {
  let handler: TriggerDirectorySyncHandler
  let providerRepo: IIdentityProviderRepository
  let jobScheduler: IJobScheduler
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findPrimaryByTenantId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    jobScheduler = {
      enqueueDirectorySync: vi.fn(),
      getNextScheduledSync: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new TriggerDirectorySyncHandler(providerRepo, jobScheduler, auditRepo)
  })

  it('enqueues a sync job and returns job id', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(fakeProvider)
    vi.mocked(jobScheduler.enqueueDirectorySync).mockResolvedValue(JOB_ID)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(new TriggerDirectorySyncCommand(TENANT_ID, ACTOR_ID))

    expect(result).toEqual({ jobId: JOB_ID })
    expect(jobScheduler.enqueueDirectorySync).toHaveBeenCalledWith(TENANT_ID)
  })

  it('throws when no provider configured', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue(null)

    await expect(
      handler.execute(new TriggerDirectorySyncCommand(TENANT_ID, ACTOR_ID)),
    ).rejects.toThrow('No identity provider configured')
  })

  it('throws when sync is already running', async () => {
    vi.mocked(providerRepo.findPrimaryByTenantId).mockResolvedValue({
      ...fakeProvider,
      syncStatus: 'running',
    })

    await expect(
      handler.execute(new TriggerDirectorySyncCommand(TENANT_ID, ACTOR_ID)),
    ).rejects.toThrow('Sync is already running')
  })
})
```

```typescript
// apps/api/src/modules/identity/application/commands/trigger-directory-sync.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository.port'
import { JOB_SCHEDULER, type IJobScheduler } from '../../domain/ports/job-scheduler.port'
import { TriggerDirectorySyncCommand } from './trigger-directory-sync.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class NoIdentityProviderConfiguredException extends DomainException {
  readonly code = 'NO_IDENTITY_PROVIDER_CONFIGURED'
  constructor() {
    super('No identity provider configured for this tenant')
  }
}

class SyncAlreadyRunningException extends DomainException {
  readonly code = 'SYNC_ALREADY_RUNNING'
  constructor() {
    super('Sync is already running')
  }
}

@CommandHandler(TriggerDirectorySyncCommand)
export class TriggerDirectorySyncHandler implements ICommandHandler<
  TriggerDirectorySyncCommand,
  { jobId: string }
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(JOB_SCHEDULER)
    private readonly jobScheduler: IJobScheduler,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: TriggerDirectorySyncCommand): Promise<{ jobId: string }> {
    const provider = await this.providerRepo.findPrimaryByTenantId(command.tenantId)
    if (!provider) {
      throw new NoIdentityProviderConfiguredException()
    }

    if (provider.syncStatus === 'running') {
      throw new SyncAlreadyRunningException()
    }

    const jobId = await this.jobScheduler.enqueueDirectorySync(command.tenantId)

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.triggeredBy,
      eventType: 'directory_sync.triggered',
      module: 'identity',
      subjectId: provider.id,
      payload: { jobId },
    })

    return { jobId }
  }
}
```

- [ ] **Step 10: Run all tests to verify pass**

- [ ] **Step 11: Wire tRPC procedures for sync monitoring**

Add to `identityAdminRouter` in `apps/api/src/modules/identity/interface/trpc/identity.router.ts`:

```typescript
const syncHistoryInput = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
})

// Add these procedures to identityAdminRouter:
getSyncStatus: protectedProcedure
  .meta({ permission: 'admin:tenant:manage' })
  .query(async ({ ctx }) => {
    return ctx.queryBus.execute(new GetSyncStatusQuery(ctx.tenantId))
  }),

getSyncHistory: protectedProcedure
  .meta({ permission: 'admin:tenant:manage' })
  .input(syncHistoryInput)
  .query(async ({ ctx, input }) => {
    return ctx.queryBus.execute(
      new GetSyncHistoryQuery(ctx.tenantId, input.limit, input.offset),
    )
  }),

triggerSync: protectedProcedure
  .meta({ permission: 'admin:tenant:manage' })
  .mutation(async ({ ctx }) => {
    return ctx.commandBus.execute(
      new TriggerDirectorySyncCommand(ctx.tenantId, ctx.actorId),
    )
  }),
```

- [ ] **Step 12: Run all tests to verify pass**
- [ ] **Step 13: Commit**

```bash
git add apps/api/src/modules/identity/
git commit -m "feat(identity): add sync monitoring endpoints with TDD"
```

---

## Task 6: Audit Log Endpoints

**Files:**

- Create: `apps/api/src/modules/admin/application/queries/query-audit-log.query.ts`
- Create: `apps/api/src/modules/admin/application/queries/query-audit-log.handler.ts`
- Create: `apps/api/src/modules/admin/application/queries/query-audit-log.handler.spec.ts`
- Create: `apps/api/src/modules/admin/application/queries/export-audit-log.query.ts`
- Create: `apps/api/src/modules/admin/application/queries/export-audit-log.handler.ts`
- Create: `apps/api/src/modules/admin/application/queries/export-audit-log.handler.spec.ts`
- Create: `apps/api/src/modules/kernel/domain/repositories/audit-event-query.repository.port.ts`
- Modify: `apps/api/src/modules/admin/interface/trpc/admin.router.ts`

### Step-by-step

- [ ] **Step 1: Create query port — IAuditEventQueryRepository**

The existing `IAuditEventRepository` is insert-only (per audit immutability). We need a separate read port for querying.

```typescript
// apps/api/src/modules/kernel/domain/repositories/audit-event-query.repository.port.ts
export const AUDIT_EVENT_QUERY_REPOSITORY = Symbol('IAuditEventQueryRepository')

export interface AuditEventFilter {
  tenantId: string
  actorId?: string
  eventType?: string
  module?: string
  dateFrom?: Date
  dateTo?: Date
  limit: number
  offset: number
}

export interface AuditEventRow {
  id: string
  tenantId: string
  actorId: string
  eventType: string
  module: string
  subjectId: string
  payload: unknown
  createdAt: Date
}

export interface IAuditEventQueryRepository {
  query(filter: AuditEventFilter): Promise<{ items: AuditEventRow[]; total: number }>
}
```

- [ ] **Step 2: Write failing test — QueryAuditLogHandler**

```typescript
// apps/api/src/modules/admin/application/queries/query-audit-log.query.ts
export class QueryAuditLogQuery {
  constructor(
    readonly tenantId: string,
    readonly actorId?: string,
    readonly eventType?: string,
    readonly module?: string,
    readonly dateFrom?: Date,
    readonly dateTo?: Date,
    readonly limit: number = 50,
    readonly offset: number = 0,
  ) {}
}
```

```typescript
// apps/api/src/modules/admin/application/queries/query-audit-log.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryAuditLogQuery } from './query-audit-log.query'
import { QueryAuditLogHandler } from './query-audit-log.handler'
import type {
  IAuditEventQueryRepository,
  AuditEventRow,
} from '../../../kernel/domain/repositories/audit-event-query.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeEvents: AuditEventRow[] = [
  {
    id: '01900000-0000-7000-8000-000000000070',
    tenantId: TENANT_ID,
    actorId: '01900000-0000-7000-8000-000000000005',
    eventType: 'permission_check',
    module: 'kernel',
    subjectId: '01900000-0000-7000-8000-000000000050',
    payload: { permission: 'people:profile:read', result: 'denied' },
    createdAt: new Date('2026-04-11T10:00:00Z'),
  },
]

describe('QueryAuditLogHandler', () => {
  let handler: QueryAuditLogHandler
  let auditQueryRepo: IAuditEventQueryRepository

  beforeEach(() => {
    auditQueryRepo = {
      query: vi.fn(),
    }
    handler = new QueryAuditLogHandler(auditQueryRepo)
  })

  it('returns paginated audit events matching filters', async () => {
    vi.mocked(auditQueryRepo.query).mockResolvedValue({
      items: fakeEvents,
      total: 1,
    })

    const result = await handler.execute(
      new QueryAuditLogQuery(TENANT_ID, undefined, 'permission_check', 'kernel'),
    )

    expect(result).toEqual({ items: fakeEvents, total: 1 })
    expect(auditQueryRepo.query).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: undefined,
      eventType: 'permission_check',
      module: 'kernel',
      dateFrom: undefined,
      dateTo: undefined,
      limit: 50,
      offset: 0,
    })
  })

  it('returns empty results when no events match', async () => {
    vi.mocked(auditQueryRepo.query).mockResolvedValue({ items: [], total: 0 })

    const result = await handler.execute(new QueryAuditLogQuery(TENANT_ID))

    expect(result).toEqual({ items: [], total: 0 })
  })
})
```

- [ ] **Step 3: Run test to verify failure**

- [ ] **Step 4: Write handler — QueryAuditLogHandler**

```typescript
// apps/api/src/modules/admin/application/queries/query-audit-log.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_QUERY_REPOSITORY,
  type IAuditEventQueryRepository,
  type AuditEventRow,
} from '../../../kernel/domain/repositories/audit-event-query.repository.port'
import { QueryAuditLogQuery } from './query-audit-log.query'

export interface AuditLogResultDto {
  items: AuditEventRow[]
  total: number
}

@QueryHandler(QueryAuditLogQuery)
export class QueryAuditLogHandler implements IQueryHandler<QueryAuditLogQuery, AuditLogResultDto> {
  constructor(
    @Inject(AUDIT_EVENT_QUERY_REPOSITORY)
    private readonly auditQueryRepo: IAuditEventQueryRepository,
  ) {}

  async execute(query: QueryAuditLogQuery): Promise<AuditLogResultDto> {
    return this.auditQueryRepo.query({
      tenantId: query.tenantId,
      actorId: query.actorId,
      eventType: query.eventType,
      module: query.module,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.limit,
      offset: query.offset,
    })
  }
}
```

- [ ] **Step 5: Run test to verify pass**

- [ ] **Step 6: Write ExportAuditLog query + handler + test**

```typescript
// apps/api/src/modules/admin/application/queries/export-audit-log.query.ts
export class ExportAuditLogQuery {
  constructor(
    readonly tenantId: string,
    readonly actorId?: string,
    readonly eventType?: string,
    readonly module?: string,
    readonly dateFrom?: Date,
    readonly dateTo?: Date,
  ) {}
}
```

```typescript
// apps/api/src/modules/admin/application/queries/export-audit-log.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportAuditLogQuery } from './export-audit-log.query'
import { ExportAuditLogHandler } from './export-audit-log.handler'
import type {
  IAuditEventQueryRepository,
  AuditEventRow,
} from '../../../kernel/domain/repositories/audit-event-query.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeEvents: AuditEventRow[] = [
  {
    id: '01900000-0000-7000-8000-000000000070',
    tenantId: TENANT_ID,
    actorId: '01900000-0000-7000-8000-000000000005',
    eventType: 'permission_check',
    module: 'kernel',
    subjectId: '01900000-0000-7000-8000-000000000050',
    payload: { permission: 'people:profile:read', result: 'denied' },
    createdAt: new Date('2026-04-11T10:00:00Z'),
  },
]

describe('ExportAuditLogHandler', () => {
  let handler: ExportAuditLogHandler
  let auditQueryRepo: IAuditEventQueryRepository

  beforeEach(() => {
    auditQueryRepo = {
      query: vi.fn(),
    }
    handler = new ExportAuditLogHandler(auditQueryRepo)
  })

  it('returns CSV string with headers and data rows', async () => {
    vi.mocked(auditQueryRepo.query).mockResolvedValue({
      items: fakeEvents,
      total: 1,
    })

    const result = await handler.execute(new ExportAuditLogQuery(TENANT_ID))

    expect(result).toContain('id,actor_id,event_type,module,subject_id,payload,created_at')
    expect(result).toContain('01900000-0000-7000-8000-000000000070')
    expect(result).toContain('permission_check')
    expect(result).toContain('kernel')
  })

  it('returns only headers when no events match', async () => {
    vi.mocked(auditQueryRepo.query).mockResolvedValue({ items: [], total: 0 })

    const result = await handler.execute(new ExportAuditLogQuery(TENANT_ID))

    expect(result).toBe('id,actor_id,event_type,module,subject_id,payload,created_at')
  })
})
```

```typescript
// apps/api/src/modules/admin/application/queries/export-audit-log.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_QUERY_REPOSITORY,
  type IAuditEventQueryRepository,
} from '../../../kernel/domain/repositories/audit-event-query.repository.port'
import { ExportAuditLogQuery } from './export-audit-log.query'

const CSV_HEADER = 'id,actor_id,event_type,module,subject_id,payload,created_at'
const MAX_EXPORT_ROWS = 10_000

@QueryHandler(ExportAuditLogQuery)
export class ExportAuditLogHandler implements IQueryHandler<ExportAuditLogQuery, string> {
  constructor(
    @Inject(AUDIT_EVENT_QUERY_REPOSITORY)
    private readonly auditQueryRepo: IAuditEventQueryRepository,
  ) {}

  async execute(query: ExportAuditLogQuery): Promise<string> {
    const { items } = await this.auditQueryRepo.query({
      tenantId: query.tenantId,
      actorId: query.actorId,
      eventType: query.eventType,
      module: query.module,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: MAX_EXPORT_ROWS,
      offset: 0,
    })

    if (items.length === 0) return CSV_HEADER

    const rows = items.map((event) => {
      const payloadStr = JSON.stringify(event.payload).replace(/"/g, '""')
      return [
        event.id,
        event.actorId,
        event.eventType,
        event.module,
        event.subjectId,
        `"${payloadStr}"`,
        event.createdAt.toISOString(),
      ].join(',')
    })

    return [CSV_HEADER, ...rows].join('\n')
  }
}
```

- [ ] **Step 7: Run all tests to verify pass**

- [ ] **Step 8: Wire tRPC procedures for audit log**

Add to `apps/api/src/modules/admin/interface/trpc/admin.router.ts`:

```typescript
import { QueryAuditLogQuery } from '../../application/queries/query-audit-log.query'
import { ExportAuditLogQuery } from '../../application/queries/export-audit-log.query'

const auditLogFilterInput = z.object({
  actorId: z.string().uuid().optional(),
  eventType: z.string().max(100).optional(),
  module: z.string().max(50).optional(),
  dateFrom: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  dateTo: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
})

const auditLogExportInput = z.object({
  actorId: z.string().uuid().optional(),
  eventType: z.string().max(100).optional(),
  module: z.string().max(50).optional(),
  dateFrom: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  dateTo: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
})

export const adminAuditLogRouter = router({
  query: protectedProcedure
    .meta({ permission: 'admin:audit:read' })
    .input(auditLogFilterInput)
    .query(async ({ ctx, input }) => {
      return ctx.queryBus.execute(
        new QueryAuditLogQuery(
          ctx.tenantId,
          input.actorId,
          input.eventType,
          input.module,
          input.dateFrom,
          input.dateTo,
          input.limit,
          input.offset,
        ),
      )
    }),

  export: protectedProcedure
    .meta({ permission: 'admin:audit:read' })
    .input(auditLogExportInput)
    .query(async ({ ctx, input }) => {
      const csv = await ctx.queryBus.execute(
        new ExportAuditLogQuery(
          ctx.tenantId,
          input.actorId,
          input.eventType,
          input.module,
          input.dateFrom,
          input.dateTo,
        ),
      )
      return { csv }
    }),
})

// Update the adminRouter to include auditLog
export const adminRouter = router({
  roles: adminRolesRouter,
  auditLog: adminAuditLogRouter,
})
```

- [ ] **Step 9: Run all tests to verify pass**
- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/admin/ apps/api/src/modules/kernel/domain/repositories/audit-event-query.repository.port.ts
git commit -m "feat(admin): add audit log query and export endpoints with TDD"
```

---

## Task 7: Agent Access Endpoints

**Files:**

- Create: `apps/api/src/modules/identity/domain/entities/api-key.entity.ts`
- Create: `apps/api/src/modules/identity/domain/repositories/api-key.repository.port.ts`
- Create: `apps/api/src/modules/identity/application/commands/create-system-actor.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/create-system-actor.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/create-system-actor.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/commands/create-api-key.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/create-api-key.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/create-api-key.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/commands/revoke-api-key.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/revoke-api-key.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/revoke-api-key.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/queries/list-api-keys.query.ts`
- Create: `apps/api/src/modules/identity/application/queries/list-api-keys.handler.ts`
- Create: `apps/api/src/modules/identity/application/queries/list-api-keys.handler.spec.ts`
- Modify: `apps/api/src/modules/identity/interface/trpc/identity.router.ts`

### Step-by-step

- [ ] **Step 1: Create domain entity — ApiKey**

```typescript
// apps/api/src/modules/identity/domain/entities/api-key.entity.ts
export interface ApiKey {
  id: string
  tenantId: string
  actorId: string
  keyHash: string
  name: string
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}
```

- [ ] **Step 2: Create domain port — IApiKeyRepository**

```typescript
// apps/api/src/modules/identity/domain/repositories/api-key.repository.port.ts
import type { ApiKey } from '../entities/api-key.entity'

export const API_KEY_REPOSITORY = Symbol('IApiKeyRepository')

export interface ApiKeyListItem {
  id: string
  actorId: string
  name: string
  keyLastFour: string
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

export interface IApiKeyRepository {
  findById(id: string, tenantId: string): Promise<ApiKey | null>
  findByKeyHash(keyHash: string, tenantId: string): Promise<ApiKey | null>
  listByTenantId(tenantId: string): Promise<ApiKeyListItem[]>
  insert(data: {
    tenantId: string
    actorId: string
    keyHash: string
    name: string
    expiresAt: Date | null
  }): Promise<ApiKey>
  revoke(id: string, tenantId: string, revokedAt: Date): Promise<void>
  updateLastUsedAt(id: string, tenantId: string, lastUsedAt: Date): Promise<void>
}
```

- [ ] **Step 3: Create port — ICryptoProvider**

```typescript
// apps/api/src/modules/identity/domain/ports/crypto-provider.port.ts
export const CRYPTO_PROVIDER = Symbol('ICryptoProvider')

export interface ICryptoProvider {
  generateApiKey(): { plaintext: string; hash: string; lastFour: string }
  hashApiKey(plaintext: string): string
}
```

- [ ] **Step 4: Write failing test — CreateSystemActorHandler**

```typescript
// apps/api/src/modules/identity/application/commands/create-system-actor.command.ts
export class CreateSystemActorCommand {
  constructor(
    readonly tenantId: string,
    readonly displayName: string,
    readonly createdBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/identity/application/commands/create-system-actor.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { CreateSystemActorCommand } from './create-system-actor.command'
import { CreateSystemActorHandler } from './create-system-actor.handler'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'
const NEW_SYSTEM_ACTOR_ID = '01900000-0000-7000-8000-000000000080'

describe('CreateSystemActorHandler', () => {
  let handler: CreateSystemActorHandler
  let commandBus: CommandBus
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    commandBus = {
      execute: vi.fn(),
    } as unknown as CommandBus
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new CreateSystemActorHandler(commandBus, auditRepo)
  })

  it('creates a system actor via kernel command bus', async () => {
    vi.mocked(commandBus.execute).mockResolvedValue(NEW_SYSTEM_ACTOR_ID)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(
      new CreateSystemActorCommand(TENANT_ID, 'Nightly Report Bot', ACTOR_ID),
    )

    expect(result).toEqual({ actorId: NEW_SYSTEM_ACTOR_ID })
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        type: 'system',
        displayName: 'Nightly Report Bot',
      }),
    )
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'system_actor.created',
      module: 'identity',
      subjectId: NEW_SYSTEM_ACTOR_ID,
      payload: { displayName: 'Nightly Report Bot' },
    })
  })
})
```

- [ ] **Step 5: Run test to verify failure**

- [ ] **Step 6: Write handler — CreateSystemActorHandler**

```typescript
// apps/api/src/modules/identity/application/commands/create-system-actor.handler.ts
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import { CreateActorCommand } from '../../../kernel/application/commands/create-actor.command'
import { CreateSystemActorCommand } from './create-system-actor.command'

@CommandHandler(CreateSystemActorCommand)
export class CreateSystemActorHandler implements ICommandHandler<
  CreateSystemActorCommand,
  { actorId: string }
> {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: CreateSystemActorCommand): Promise<{ actorId: string }> {
    const actorId = await this.commandBus.execute(
      new CreateActorCommand(command.tenantId, 'system', command.displayName),
    )

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.createdBy,
      eventType: 'system_actor.created',
      module: 'identity',
      subjectId: actorId,
      payload: { displayName: command.displayName },
    })

    return { actorId }
  }
}
```

- [ ] **Step 7: Run test to verify pass**

- [ ] **Step 8: Write CreateApiKey command + handler + test**

```typescript
// apps/api/src/modules/identity/application/commands/create-api-key.command.ts
export class CreateApiKeyCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly name: string,
    readonly expiresAt: Date | null,
    readonly createdBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/identity/application/commands/create-api-key.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateApiKeyCommand } from './create-api-key.command'
import { CreateApiKeyHandler } from './create-api-key.handler'
import type { IApiKeyRepository } from '../../domain/repositories/api-key.repository.port'
import type { ICryptoProvider } from '../../domain/ports/crypto-provider.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { ApiKey } from '../../domain/entities/api-key.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const SYSTEM_ACTOR_ID = '01900000-0000-7000-8000-000000000080'
const API_KEY_ID = '01900000-0000-7000-8000-000000000090'
const ADMIN_ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeApiKey: ApiKey = {
  id: API_KEY_ID,
  tenantId: TENANT_ID,
  actorId: SYSTEM_ACTOR_ID,
  keyHash: 'sha256-hash-of-key',
  name: 'CI/CD Integration',
  lastUsedAt: null,
  expiresAt: new Date('2027-04-11T00:00:00Z'),
  revokedAt: null,
  createdAt: new Date(),
}

describe('CreateApiKeyHandler', () => {
  let handler: CreateApiKeyHandler
  let apiKeyRepo: IApiKeyRepository
  let cryptoProvider: ICryptoProvider
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    apiKeyRepo = {
      findById: vi.fn(),
      findByKeyHash: vi.fn(),
      listByTenantId: vi.fn(),
      insert: vi.fn(),
      revoke: vi.fn(),
      updateLastUsedAt: vi.fn(),
    }
    cryptoProvider = {
      generateApiKey: vi.fn(),
      hashApiKey: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new CreateApiKeyHandler(apiKeyRepo, cryptoProvider, auditRepo)
  })

  it('generates an API key, stores the hash, and returns the plaintext once', async () => {
    vi.mocked(cryptoProvider.generateApiKey).mockReturnValue({
      plaintext: 'fut_live_abc123xyz789',
      hash: 'sha256-hash-of-key',
      lastFour: '9789',
    })
    vi.mocked(apiKeyRepo.insert).mockResolvedValue(fakeApiKey)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    const result = await handler.execute(
      new CreateApiKeyCommand(
        TENANT_ID,
        SYSTEM_ACTOR_ID,
        'CI/CD Integration',
        new Date('2027-04-11T00:00:00Z'),
        ADMIN_ACTOR_ID,
      ),
    )

    expect(result).toEqual({
      apiKeyId: API_KEY_ID,
      plaintext: 'fut_live_abc123xyz789',
    })
    expect(apiKeyRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: SYSTEM_ACTOR_ID,
      keyHash: 'sha256-hash-of-key',
      name: 'CI/CD Integration',
      expiresAt: new Date('2027-04-11T00:00:00Z'),
    })
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ADMIN_ACTOR_ID,
      eventType: 'api_key.created',
      module: 'identity',
      subjectId: API_KEY_ID,
      payload: {
        name: 'CI/CD Integration',
        systemActorId: SYSTEM_ACTOR_ID,
        keyLastFour: '9789',
      },
    })
  })
})
```

```typescript
// apps/api/src/modules/identity/application/commands/create-api-key.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  API_KEY_REPOSITORY,
  type IApiKeyRepository,
} from '../../domain/repositories/api-key.repository.port'
import { CRYPTO_PROVIDER, type ICryptoProvider } from '../../domain/ports/crypto-provider.port'
import { CreateApiKeyCommand } from './create-api-key.command'

export interface CreateApiKeyResult {
  apiKeyId: string
  plaintext: string
}

@CommandHandler(CreateApiKeyCommand)
export class CreateApiKeyHandler implements ICommandHandler<
  CreateApiKeyCommand,
  CreateApiKeyResult
> {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
    @Inject(CRYPTO_PROVIDER)
    private readonly cryptoProvider: ICryptoProvider,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: CreateApiKeyCommand): Promise<CreateApiKeyResult> {
    const { plaintext, hash, lastFour } = this.cryptoProvider.generateApiKey()

    const apiKey = await this.apiKeyRepo.insert({
      tenantId: command.tenantId,
      actorId: command.actorId,
      keyHash: hash,
      name: command.name,
      expiresAt: command.expiresAt,
    })

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.createdBy,
      eventType: 'api_key.created',
      module: 'identity',
      subjectId: apiKey.id,
      payload: {
        name: command.name,
        systemActorId: command.actorId,
        keyLastFour: lastFour,
      },
    })

    return { apiKeyId: apiKey.id, plaintext }
  }
}
```

- [ ] **Step 9: Run tests to verify pass**

- [ ] **Step 10: Write RevokeApiKey command + handler + test**

```typescript
// apps/api/src/modules/identity/application/commands/revoke-api-key.command.ts
export class RevokeApiKeyCommand {
  constructor(
    readonly tenantId: string,
    readonly apiKeyId: string,
    readonly revokedBy: string,
  ) {}
}
```

```typescript
// apps/api/src/modules/identity/application/commands/revoke-api-key.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RevokeApiKeyCommand } from './revoke-api-key.command'
import { RevokeApiKeyHandler } from './revoke-api-key.handler'
import type { IApiKeyRepository } from '../../domain/repositories/api-key.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { ApiKey } from '../../domain/entities/api-key.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const API_KEY_ID = '01900000-0000-7000-8000-000000000090'
const ADMIN_ACTOR_ID = '01900000-0000-7000-8000-000000000005'

const fakeApiKey: ApiKey = {
  id: API_KEY_ID,
  tenantId: TENANT_ID,
  actorId: '01900000-0000-7000-8000-000000000080',
  keyHash: 'sha256-hash',
  name: 'CI/CD Integration',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date(),
}

describe('RevokeApiKeyHandler', () => {
  let handler: RevokeApiKeyHandler
  let apiKeyRepo: IApiKeyRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    apiKeyRepo = {
      findById: vi.fn(),
      findByKeyHash: vi.fn(),
      listByTenantId: vi.fn(),
      insert: vi.fn(),
      revoke: vi.fn(),
      updateLastUsedAt: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    handler = new RevokeApiKeyHandler(apiKeyRepo, auditRepo)
  })

  it('revokes an API key', async () => {
    vi.mocked(apiKeyRepo.findById).mockResolvedValue(fakeApiKey)
    vi.mocked(apiKeyRepo.revoke).mockResolvedValue(undefined)
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)

    await handler.execute(new RevokeApiKeyCommand(TENANT_ID, API_KEY_ID, ADMIN_ACTOR_ID))

    expect(apiKeyRepo.revoke).toHaveBeenCalledWith(API_KEY_ID, TENANT_ID, expect.any(Date))
    expect(auditRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ADMIN_ACTOR_ID,
      eventType: 'api_key.revoked',
      module: 'identity',
      subjectId: API_KEY_ID,
      payload: { name: 'CI/CD Integration' },
    })
  })

  it('throws when API key not found', async () => {
    vi.mocked(apiKeyRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new RevokeApiKeyCommand(TENANT_ID, API_KEY_ID, ADMIN_ACTOR_ID)),
    ).rejects.toThrow('API key not found')
  })

  it('throws when API key already revoked', async () => {
    vi.mocked(apiKeyRepo.findById).mockResolvedValue({
      ...fakeApiKey,
      revokedAt: new Date(),
    })

    await expect(
      handler.execute(new RevokeApiKeyCommand(TENANT_ID, API_KEY_ID, ADMIN_ACTOR_ID)),
    ).rejects.toThrow('API key already revoked')
  })
})
```

```typescript
// apps/api/src/modules/identity/application/commands/revoke-api-key.handler.ts
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  API_KEY_REPOSITORY,
  type IApiKeyRepository,
} from '../../domain/repositories/api-key.repository.port'
import { RevokeApiKeyCommand } from './revoke-api-key.command'
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

class ApiKeyNotFoundException extends DomainException {
  readonly code = 'API_KEY_NOT_FOUND'
  constructor(id: string) {
    super(`API key not found: ${id}`)
  }
}

class ApiKeyAlreadyRevokedException extends DomainException {
  readonly code = 'API_KEY_ALREADY_REVOKED'
  constructor(id: string) {
    super(`API key already revoked: ${id}`)
  }
}

@CommandHandler(RevokeApiKeyCommand)
export class RevokeApiKeyHandler implements ICommandHandler<RevokeApiKeyCommand, void> {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: RevokeApiKeyCommand): Promise<void> {
    const apiKey = await this.apiKeyRepo.findById(command.apiKeyId, command.tenantId)
    if (!apiKey) {
      throw new ApiKeyNotFoundException(command.apiKeyId)
    }

    if (apiKey.revokedAt) {
      throw new ApiKeyAlreadyRevokedException(command.apiKeyId)
    }

    await this.apiKeyRepo.revoke(command.apiKeyId, command.tenantId, new Date())

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.revokedBy,
      eventType: 'api_key.revoked',
      module: 'identity',
      subjectId: command.apiKeyId,
      payload: { name: apiKey.name },
    })
  }
}
```

- [ ] **Step 11: Run tests to verify pass**

- [ ] **Step 12: Write ListApiKeys query + handler + test**

```typescript
// apps/api/src/modules/identity/application/queries/list-api-keys.query.ts
export class ListApiKeysQuery {
  constructor(readonly tenantId: string) {}
}
```

```typescript
// apps/api/src/modules/identity/application/queries/list-api-keys.handler.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListApiKeysQuery } from './list-api-keys.query'
import { ListApiKeysHandler } from './list-api-keys.handler'
import type {
  IApiKeyRepository,
  ApiKeyListItem,
} from '../../domain/repositories/api-key.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeApiKeys: ApiKeyListItem[] = [
  {
    id: '01900000-0000-7000-8000-000000000090',
    actorId: '01900000-0000-7000-8000-000000000080',
    name: 'CI/CD Integration',
    keyLastFour: '9789',
    lastUsedAt: new Date('2026-04-10T15:00:00Z'),
    expiresAt: new Date('2027-04-11T00:00:00Z'),
    revokedAt: null,
    createdAt: new Date('2026-04-01T10:00:00Z'),
  },
]

describe('ListApiKeysHandler', () => {
  let handler: ListApiKeysHandler
  let apiKeyRepo: IApiKeyRepository

  beforeEach(() => {
    apiKeyRepo = {
      findById: vi.fn(),
      findByKeyHash: vi.fn(),
      listByTenantId: vi.fn(),
      insert: vi.fn(),
      revoke: vi.fn(),
      updateLastUsedAt: vi.fn(),
    }
    handler = new ListApiKeysHandler(apiKeyRepo)
  })

  it('returns API keys with masked key values', async () => {
    vi.mocked(apiKeyRepo.listByTenantId).mockResolvedValue(fakeApiKeys)

    const result = await handler.execute(new ListApiKeysQuery(TENANT_ID))

    expect(result).toEqual(fakeApiKeys)
    expect(result[0].keyLastFour).toBe('9789')
    // Ensure no full key hash is returned
    expect(result[0]).not.toHaveProperty('keyHash')
  })

  it('returns empty array when no API keys exist', async () => {
    vi.mocked(apiKeyRepo.listByTenantId).mockResolvedValue([])

    const result = await handler.execute(new ListApiKeysQuery(TENANT_ID))

    expect(result).toEqual([])
  })
})
```

```typescript
// apps/api/src/modules/identity/application/queries/list-api-keys.handler.ts
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  API_KEY_REPOSITORY,
  type IApiKeyRepository,
  type ApiKeyListItem,
} from '../../domain/repositories/api-key.repository.port'
import { ListApiKeysQuery } from './list-api-keys.query'

@QueryHandler(ListApiKeysQuery)
export class ListApiKeysHandler implements IQueryHandler<ListApiKeysQuery, ApiKeyListItem[]> {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
  ) {}

  async execute(query: ListApiKeysQuery): Promise<ApiKeyListItem[]> {
    return this.apiKeyRepo.listByTenantId(query.tenantId)
  }
}
```

- [ ] **Step 13: Run all tests to verify pass**

- [ ] **Step 14: Wire tRPC procedures for agent access**

Add to `identityAdminRouter` in `apps/api/src/modules/identity/interface/trpc/identity.router.ts`:

```typescript
const createSystemActorInput = z.object({
  displayName: z.string().min(1).max(200),
})

const createApiKeyInput = z.object({
  actorId: z.string().uuid(),
  name: z.string().min(1).max(200),
  expiresAt: z.string().datetime().nullable().transform((v) => (v ? new Date(v) : null)),
})

const revokeApiKeyInput = z.object({
  apiKeyId: z.string().uuid(),
})

// Add these procedures to identityAdminRouter:
createSystemActor: protectedProcedure
  .meta({ permission: 'admin:agent:manage' })
  .input(createSystemActorInput)
  .mutation(async ({ ctx, input }) => {
    return ctx.commandBus.execute(
      new CreateSystemActorCommand(ctx.tenantId, input.displayName, ctx.actorId),
    )
  }),

createApiKey: protectedProcedure
  .meta({ permission: 'admin:agent:manage' })
  .input(createApiKeyInput)
  .mutation(async ({ ctx, input }) => {
    return ctx.commandBus.execute(
      new CreateApiKeyCommand(
        ctx.tenantId,
        input.actorId,
        input.name,
        input.expiresAt,
        ctx.actorId,
      ),
    )
  }),

listApiKeys: protectedProcedure
  .meta({ permission: 'admin:agent:manage' })
  .query(async ({ ctx }) => {
    return ctx.queryBus.execute(new ListApiKeysQuery(ctx.tenantId))
  }),

revokeApiKey: protectedProcedure
  .meta({ permission: 'admin:agent:manage' })
  .input(revokeApiKeyInput)
  .mutation(async ({ ctx, input }) => {
    await ctx.commandBus.execute(
      new RevokeApiKeyCommand(ctx.tenantId, input.apiKeyId, ctx.actorId),
    )
    return { success: true }
  }),
```

- [ ] **Step 15: Run all tests to verify pass**
- [ ] **Step 16: Commit**

```bash
git add apps/api/src/modules/identity/
git commit -m "feat(identity): add agent access endpoints (system actors, API keys) with TDD"
```

---

## Task 8: Wire All Routers and Final Integration

**Files:**

- Modify: `apps/api/src/modules/identity/interface/trpc/identity.router.ts` (final assembly)
- Modify: `apps/api/src/modules/admin/interface/trpc/admin.router.ts` (final assembly)
- Modify: `apps/api/src/modules/identity/identity.module.ts`
- Modify: `apps/api/src/modules/admin/admin.module.ts`

### Step-by-step

- [ ] **Step 1: Assemble the full identity admin router**

```typescript
// apps/api/src/modules/identity/interface/trpc/identity.router.ts
import { z } from 'zod'
import { router, protectedProcedure } from '../../../../common/trpc/trpc-init'
import { ConfigureIdentityProviderCommand } from '../../application/commands/configure-identity-provider.command'
import { TestIdpConnectionCommand } from '../../application/commands/test-idp-connection.command'
import { SyncIdpGroupsCommand } from '../../application/commands/sync-idp-groups.command'
import { UpsertGroupMappingCommand } from '../../application/commands/upsert-group-mapping.command'
import { RemoveGroupMappingCommand } from '../../application/commands/remove-group-mapping.command'
import { InviteLocalUserCommand } from '../../application/commands/invite-local-user.command'
import { DeactivateLocalUserCommand } from '../../application/commands/deactivate-local-user.command'
import { TriggerDirectorySyncCommand } from '../../application/commands/trigger-directory-sync.command'
import { CreateSystemActorCommand } from '../../application/commands/create-system-actor.command'
import { CreateApiKeyCommand } from '../../application/commands/create-api-key.command'
import { RevokeApiKeyCommand } from '../../application/commands/revoke-api-key.command'
import { GetIdentityProviderQuery } from '../../application/queries/get-identity-provider.query'
import { ListGroupMappingsQuery } from '../../application/queries/list-group-mappings.query'
import { ListLocalUsersQuery } from '../../application/queries/list-local-users.query'
import { GetSyncStatusQuery } from '../../application/queries/get-sync-status.query'
import { GetSyncHistoryQuery } from '../../application/queries/get-sync-history.query'
import { ListApiKeysQuery } from '../../application/queries/list-api-keys.query'

const roleKeyEnum = z.enum([
  'hr_ops',
  'line_manager',
  'project_manager',
  'staffing_owner',
  'account_manager',
  'finance_operator',
  'executive',
  'employee',
  'review_operator',
  'recruiter',
  'tenant_admin',
])

const scopeTypeEnum = z.enum(['global', 'department', 'project', 'account'])

export const identityAdminRouter = router({
  // --- IdP Configuration ---
  configureProvider: protectedProcedure
    .meta({ permission: 'admin:tenant:manage' })
    .input(
      z.object({
        providerType: z.enum(['microsoft', 'google']),
        displayName: z.string().min(1).max(100),
        clientId: z.string().min(1).max(255),
        clientSecretRef: z.string().min(1).max(512).startsWith('arn:aws:secretsmanager:'),
        directoryId: z.string().min(1).max(255),
        syncEnabled: z.boolean(),
        existingProviderId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const providerId = await ctx.commandBus.execute(
        new ConfigureIdentityProviderCommand(
          ctx.tenantId,
          input.providerType,
          input.displayName,
          input.clientId,
          input.clientSecretRef,
          input.directoryId,
          input.syncEnabled,
          ctx.actorId,
          input.existingProviderId,
        ),
      )
      return { providerId }
    }),

  getProvider: protectedProcedure
    .meta({ permission: 'admin:tenant:manage' })
    .query(async ({ ctx }) => {
      return ctx.queryBus.execute(new GetIdentityProviderQuery(ctx.tenantId))
    }),

  testConnection: protectedProcedure
    .meta({ permission: 'admin:tenant:manage' })
    .input(z.object({ providerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.commandBus.execute(
        new TestIdpConnectionCommand(ctx.tenantId, input.providerId, ctx.actorId),
      )
    }),

  // --- Group Mappings ---
  syncGroups: protectedProcedure
    .meta({ permission: 'admin:role:manage' })
    .mutation(async ({ ctx }) => {
      return ctx.commandBus.execute(new SyncIdpGroupsCommand(ctx.tenantId, ctx.actorId))
    }),

  listGroupMappings: protectedProcedure
    .meta({ permission: 'admin:role:manage' })
    .query(async ({ ctx }) => {
      return ctx.queryBus.execute(new ListGroupMappingsQuery(ctx.tenantId))
    }),

  upsertGroupMapping: protectedProcedure
    .meta({ permission: 'admin:role:manage' })
    .input(
      z.object({
        identityProviderId: z.string().uuid(),
        externalGroupId: z.string().min(1).max(255),
        externalGroupName: z.string().min(1).max(255),
        roleKey: roleKeyEnum,
        scopeType: scopeTypeEnum,
        scopeId: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const mappingId = await ctx.commandBus.execute(
        new UpsertGroupMappingCommand(
          ctx.tenantId,
          input.identityProviderId,
          input.externalGroupId,
          input.externalGroupName,
          input.roleKey,
          input.scopeType,
          input.scopeId,
          ctx.actorId,
        ),
      )
      return { mappingId }
    }),

  removeGroupMapping: protectedProcedure
    .meta({ permission: 'admin:role:manage' })
    .input(z.object({ mappingId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.commandBus.execute(
        new RemoveGroupMappingCommand(ctx.tenantId, input.mappingId, ctx.actorId),
      )
      return { success: true }
    }),

  // --- Local Accounts ---
  inviteLocalUser: protectedProcedure
    .meta({ permission: 'admin:tenant:manage' })
    .input(
      z.object({
        email: z.string().email(),
        displayName: z.string().min(1).max(200),
        roleAssignments: z
          .array(
            z.object({
              roleKey: roleKeyEnum,
              scopeType: scopeTypeEnum,
              scopeId: z.string().uuid().nullable(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.commandBus.execute(
        new InviteLocalUserCommand(
          ctx.tenantId,
          input.email,
          input.displayName,
          input.roleAssignments,
          ctx.actorId,
        ),
      )
    }),

  listLocalUsers: protectedProcedure
    .meta({ permission: 'admin:tenant:manage' })
    .query(async ({ ctx }) => {
      return ctx.queryBus.execute(new ListLocalUsersQuery(ctx.tenantId))
    }),

  deactivateLocalUser: protectedProcedure
    .meta({ permission: 'admin:tenant:manage' })
    .input(z.object({ actorId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.commandBus.execute(
        new DeactivateLocalUserCommand(ctx.tenantId, input.actorId, ctx.actorId),
      )
      return { success: true }
    }),

  // --- Sync Monitoring ---
  getSyncStatus: protectedProcedure
    .meta({ permission: 'admin:tenant:manage' })
    .query(async ({ ctx }) => {
      return ctx.queryBus.execute(new GetSyncStatusQuery(ctx.tenantId))
    }),

  getSyncHistory: protectedProcedure
    .meta({ permission: 'admin:tenant:manage' })
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.queryBus.execute(new GetSyncHistoryQuery(ctx.tenantId, input.limit, input.offset))
    }),

  triggerSync: protectedProcedure
    .meta({ permission: 'admin:tenant:manage' })
    .mutation(async ({ ctx }) => {
      return ctx.commandBus.execute(new TriggerDirectorySyncCommand(ctx.tenantId, ctx.actorId))
    }),

  // --- Agent Access ---
  createSystemActor: protectedProcedure
    .meta({ permission: 'admin:agent:manage' })
    .input(z.object({ displayName: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.commandBus.execute(
        new CreateSystemActorCommand(ctx.tenantId, input.displayName, ctx.actorId),
      )
    }),

  createApiKey: protectedProcedure
    .meta({ permission: 'admin:agent:manage' })
    .input(
      z.object({
        actorId: z.string().uuid(),
        name: z.string().min(1).max(200),
        expiresAt: z
          .string()
          .datetime()
          .nullable()
          .transform((v) => (v ? new Date(v) : null)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.commandBus.execute(
        new CreateApiKeyCommand(
          ctx.tenantId,
          input.actorId,
          input.name,
          input.expiresAt,
          ctx.actorId,
        ),
      )
    }),

  listApiKeys: protectedProcedure
    .meta({ permission: 'admin:agent:manage' })
    .query(async ({ ctx }) => {
      return ctx.queryBus.execute(new ListApiKeysQuery(ctx.tenantId))
    }),

  revokeApiKey: protectedProcedure
    .meta({ permission: 'admin:agent:manage' })
    .input(z.object({ apiKeyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.commandBus.execute(
        new RevokeApiKeyCommand(ctx.tenantId, input.apiKeyId, ctx.actorId),
      )
      return { success: true }
    }),
})
```

- [ ] **Step 2: Assemble the full admin router**

```typescript
// apps/api/src/modules/admin/interface/trpc/admin.router.ts
import { z } from 'zod'
import { router, protectedProcedure } from '../../../../common/trpc/trpc-init'
import { ListRolesQuery } from '../../application/queries/list-roles.query'
import { GetRolePermissionsQuery } from '../../application/queries/get-role-permissions.query'
import { AddRolePermissionCommand } from '../../application/commands/add-role-permission.command'
import { RemoveRolePermissionCommand } from '../../application/commands/remove-role-permission.command'
import { ResetRolePermissionsCommand } from '../../application/commands/reset-role-permissions.command'
import { QueryAuditLogQuery } from '../../application/queries/query-audit-log.query'
import { ExportAuditLogQuery } from '../../application/queries/export-audit-log.query'

const roleKeyEnum = z.enum([
  'hr_ops',
  'line_manager',
  'project_manager',
  'staffing_owner',
  'account_manager',
  'finance_operator',
  'executive',
  'employee',
  'review_operator',
  'recruiter',
  'tenant_admin',
  'platform_admin',
])

const permissionKeyRegex = /^[a-z]+:[a-z_]+(?::[a-z_]+)*$/

export const adminRolesRouter = router({
  list: protectedProcedure.meta({ permission: 'admin:role:manage' }).query(async ({ ctx }) => {
    return ctx.queryBus.execute(new ListRolesQuery(ctx.tenantId))
  }),

  getPermissions: protectedProcedure
    .meta({ permission: 'admin:role:manage' })
    .input(z.object({ roleKey: roleKeyEnum }))
    .query(async ({ ctx, input }) => {
      return ctx.queryBus.execute(new GetRolePermissionsQuery(ctx.tenantId, input.roleKey))
    }),

  addPermission: protectedProcedure
    .meta({ permission: 'admin:role:manage' })
    .input(
      z.object({
        roleKey: roleKeyEnum,
        permissionKey: z.string().min(1).max(255).regex(permissionKeyRegex),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const permissionId = await ctx.commandBus.execute(
        new AddRolePermissionCommand(ctx.tenantId, input.roleKey, input.permissionKey, ctx.actorId),
      )
      return { permissionId }
    }),

  removePermission: protectedProcedure
    .meta({ permission: 'admin:role:manage' })
    .input(
      z.object({
        roleKey: roleKeyEnum,
        permissionKey: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.commandBus.execute(
        new RemoveRolePermissionCommand(
          ctx.tenantId,
          input.roleKey,
          input.permissionKey,
          ctx.actorId,
        ),
      )
      return { success: true }
    }),

  resetToDefaults: protectedProcedure
    .meta({ permission: 'admin:role:manage' })
    .input(z.object({ roleKey: roleKeyEnum }))
    .mutation(async ({ ctx, input }) => {
      await ctx.commandBus.execute(
        new ResetRolePermissionsCommand(ctx.tenantId, input.roleKey, ctx.actorId),
      )
      return { success: true }
    }),
})

export const adminAuditLogRouter = router({
  query: protectedProcedure
    .meta({ permission: 'admin:audit:read' })
    .input(
      z.object({
        actorId: z.string().uuid().optional(),
        eventType: z.string().max(100).optional(),
        module: z.string().max(50).optional(),
        dateFrom: z
          .string()
          .datetime()
          .optional()
          .transform((v) => (v ? new Date(v) : undefined)),
        dateTo: z
          .string()
          .datetime()
          .optional()
          .transform((v) => (v ? new Date(v) : undefined)),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.queryBus.execute(
        new QueryAuditLogQuery(
          ctx.tenantId,
          input.actorId,
          input.eventType,
          input.module,
          input.dateFrom,
          input.dateTo,
          input.limit,
          input.offset,
        ),
      )
    }),

  export: protectedProcedure
    .meta({ permission: 'admin:audit:read' })
    .input(
      z.object({
        actorId: z.string().uuid().optional(),
        eventType: z.string().max(100).optional(),
        module: z.string().max(50).optional(),
        dateFrom: z
          .string()
          .datetime()
          .optional()
          .transform((v) => (v ? new Date(v) : undefined)),
        dateTo: z
          .string()
          .datetime()
          .optional()
          .transform((v) => (v ? new Date(v) : undefined)),
      }),
    )
    .query(async ({ ctx, input }) => {
      const csv = await ctx.queryBus.execute(
        new ExportAuditLogQuery(
          ctx.tenantId,
          input.actorId,
          input.eventType,
          input.module,
          input.dateFrom,
          input.dateTo,
        ),
      )
      return { csv }
    }),
})

export const adminRouter = router({
  roles: adminRolesRouter,
  auditLog: adminAuditLogRouter,
})
```

- [ ] **Step 3: Update identity.module.ts to register all handlers**

```typescript
// apps/api/src/modules/identity/identity.module.ts
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { IdentityQueryFacade } from './application/facades/identity-query.facade'
import { ConfigureIdentityProviderHandler } from './application/commands/configure-identity-provider.handler'
import { TestIdpConnectionHandler } from './application/commands/test-idp-connection.handler'
import { SyncIdpGroupsHandler } from './application/commands/sync-idp-groups.handler'
import { UpsertGroupMappingHandler } from './application/commands/upsert-group-mapping.handler'
import { RemoveGroupMappingHandler } from './application/commands/remove-group-mapping.handler'
import { InviteLocalUserHandler } from './application/commands/invite-local-user.handler'
import { DeactivateLocalUserHandler } from './application/commands/deactivate-local-user.handler'
import { TriggerDirectorySyncHandler } from './application/commands/trigger-directory-sync.handler'
import { CreateSystemActorHandler } from './application/commands/create-system-actor.handler'
import { CreateApiKeyHandler } from './application/commands/create-api-key.handler'
import { RevokeApiKeyHandler } from './application/commands/revoke-api-key.handler'
import { GetIdentityProviderHandler } from './application/queries/get-identity-provider.handler'
import { ListGroupMappingsHandler } from './application/queries/list-group-mappings.handler'
import { ListLocalUsersHandler } from './application/queries/list-local-users.handler'
import { GetSyncStatusHandler } from './application/queries/get-sync-status.handler'
import { GetSyncHistoryHandler } from './application/queries/get-sync-history.handler'
import { ListApiKeysHandler } from './application/queries/list-api-keys.handler'

const CommandHandlers = [
  ConfigureIdentityProviderHandler,
  TestIdpConnectionHandler,
  SyncIdpGroupsHandler,
  UpsertGroupMappingHandler,
  RemoveGroupMappingHandler,
  InviteLocalUserHandler,
  DeactivateLocalUserHandler,
  TriggerDirectorySyncHandler,
  CreateSystemActorHandler,
  CreateApiKeyHandler,
  RevokeApiKeyHandler,
]

const QueryHandlers = [
  GetIdentityProviderHandler,
  ListGroupMappingsHandler,
  ListLocalUsersHandler,
  GetSyncStatusHandler,
  GetSyncHistoryHandler,
  ListApiKeysHandler,
]

@Module({
  imports: [CqrsModule],
  providers: [
    IdentityQueryFacade,
    ...CommandHandlers,
    ...QueryHandlers,
    // Infrastructure providers (repos, directory provider, etc.) registered here
    // when infrastructure layer is implemented
  ],
  exports: [IdentityQueryFacade],
})
export class IdentityModule {}
```

- [ ] **Step 4: Update admin.module.ts to register all handlers**

```typescript
// apps/api/src/modules/admin/admin.module.ts
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { AdminQueryFacade } from './application/facades/admin-query.facade'
import { AddRolePermissionHandler } from './application/commands/add-role-permission.handler'
import { RemoveRolePermissionHandler } from './application/commands/remove-role-permission.handler'
import { ResetRolePermissionsHandler } from './application/commands/reset-role-permissions.handler'
import { ListRolesHandler } from './application/queries/list-roles.handler'
import { GetRolePermissionsHandler } from './application/queries/get-role-permissions.handler'
import { QueryAuditLogHandler } from './application/queries/query-audit-log.handler'
import { ExportAuditLogHandler } from './application/queries/export-audit-log.handler'

const CommandHandlers = [
  AddRolePermissionHandler,
  RemoveRolePermissionHandler,
  ResetRolePermissionsHandler,
]

const QueryHandlers = [
  ListRolesHandler,
  GetRolePermissionsHandler,
  QueryAuditLogHandler,
  ExportAuditLogHandler,
]

@Module({
  imports: [CqrsModule],
  providers: [
    AdminQueryFacade,
    ...CommandHandlers,
    ...QueryHandlers,
    // Infrastructure providers registered here when infra layer is implemented
  ],
  exports: [AdminQueryFacade],
})
export class AdminModule {}
```

- [ ] **Step 5: Run full test suite**

```bash
cd apps/api && bunx vitest run src/modules/identity/ src/modules/admin/
```

- [ ] **Step 6: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/identity/ apps/api/src/modules/admin/ apps/api/src/modules/kernel/domain/
git commit -m "feat(admin): wire all admin configuration routers and module registrations"
```

---

## Summary of All Endpoints

| Router Path                          | Method   | Permission            | Description                    |
| ------------------------------------ | -------- | --------------------- | ------------------------------ |
| `identity.admin.configureProvider`   | mutation | `admin:tenant:manage` | Create/update IdP config       |
| `identity.admin.getProvider`         | query    | `admin:tenant:manage` | Get current IdP config         |
| `identity.admin.testConnection`      | mutation | `admin:tenant:manage` | Test IdP credentials           |
| `identity.admin.syncGroups`          | mutation | `admin:role:manage`   | Fetch groups from IdP          |
| `identity.admin.listGroupMappings`   | query    | `admin:role:manage`   | List group-to-role mappings    |
| `identity.admin.upsertGroupMapping`  | mutation | `admin:role:manage`   | Create/update mapping          |
| `identity.admin.removeGroupMapping`  | mutation | `admin:role:manage`   | Delete a mapping               |
| `identity.admin.inviteLocalUser`     | mutation | `admin:tenant:manage` | Invite local account           |
| `identity.admin.listLocalUsers`      | query    | `admin:tenant:manage` | List local accounts            |
| `identity.admin.deactivateLocalUser` | mutation | `admin:tenant:manage` | Deactivate local account       |
| `identity.admin.getSyncStatus`       | query    | `admin:tenant:manage` | Current sync status            |
| `identity.admin.getSyncHistory`      | query    | `admin:tenant:manage` | Paginated sync history         |
| `identity.admin.triggerSync`         | mutation | `admin:tenant:manage` | Trigger immediate sync         |
| `identity.admin.createSystemActor`   | mutation | `admin:agent:manage`  | Create system actor            |
| `identity.admin.createApiKey`        | mutation | `admin:agent:manage`  | Generate API key               |
| `identity.admin.listApiKeys`         | query    | `admin:agent:manage`  | List API keys (masked)         |
| `identity.admin.revokeApiKey`        | mutation | `admin:agent:manage`  | Revoke API key                 |
| `admin.roles.list`                   | query    | `admin:role:manage`   | List roles with counts         |
| `admin.roles.getPermissions`         | query    | `admin:role:manage`   | Get permissions for role       |
| `admin.roles.addPermission`          | mutation | `admin:role:manage`   | Add permission to role         |
| `admin.roles.removePermission`       | mutation | `admin:role:manage`   | Remove non-locked permission   |
| `admin.roles.resetToDefaults`        | mutation | `admin:role:manage`   | Reset role to seed permissions |
| `admin.auditLog.query`               | query    | `admin:audit:read`    | Filterable audit log           |
| `admin.auditLog.export`              | query    | `admin:audit:read`    | Export audit log as CSV        |

**End of Plan 5.** The frontend admin UI consuming these endpoints is a separate plan.

# Plan 4.1 — Tenant Connect Flow + Admin Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the tenant-admin-facing connect / disconnect flow. Admin enters Entra credentials, Future validates against Microsoft Graph, stores the secret in Secrets Manager, and wires up the tRPC + UI scaffolding that every later plan extends.

**Architecture:** Minimal planner-side `msSync.*` tRPC namespace. `MsSyncEnabledEvent` / `MsSyncDisabledEvent` / `MsSyncCredentialInvalidatedEvent` contracts in `@future/event-contracts`. A new `web-admin/integrations/microsoft` route with three states (not-connected, active, invalid). No sync logic in this plan — only connect / disconnect lifecycle + events other plans subscribe to.

**Tech Stack:** NestJS CQRS, tRPC, React Server Components, `@future/ui`, Zod.

**Source spec:** [`2026-04-21-planner-ms-sync-4a-design.md`](../../specs/2026-04-21-planner-ms-sync-4a-design.md) §3.3, §8.1, §9.1, §9.2, §10.2 (Plan 4.1).

**Depends on:** Plan 4.0 complete.

---

## Task 1: Feature flag + kernel permissions

**Files:**

- Modify: `apps/api/src/modules/admin/infrastructure/seed/feature-flags.seed.ts` (or equivalent)
- Modify: `apps/api/src/modules/kernel/infrastructure/seed/permissions.seed.ts`

- [ ] **Step 1: Add the flag**

Locate the feature-flag seed/registry. Add `planner.ms_sync.enabled` with default `false`. Follow the same pattern as `planner.personal.enabled` (added in Sub-project #3).

- [ ] **Step 2: Add the kernel permissions**

Add four permission strings:

- `planner.ms_sync.connect`
- `planner.ms_sync.link_group`
- `planner.ms_sync.conflict.resolve`
- `planner.ms_sync.force_resync`

Grant all four to the `tenant_admin` role in the default role-permission seed.

- [ ] **Step 3: Migration (if your flag/permission infra uses DB seeds)**

If your infra applies changes via migration, generate one:

```bash
bun run --cwd packages/db db:generate
```

Otherwise, document the flag/permission addition in the PR description so it's applied at deploy.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(flags,kernel): planner.ms_sync.enabled + ms_sync permissions"
```

---

## Task 2: Event contracts — enabled, disabled, credential-invalidated

**Files:**

- Create: `packages/event-contracts/src/planner/ms-sync/ms-sync-enabled.event.ts`
- Create: `packages/event-contracts/src/planner/ms-sync/ms-sync-disabled.event.ts`
- Create: `packages/event-contracts/src/planner/ms-sync/ms-sync-credential-invalidated.event.ts`
- Create: `packages/event-contracts/src/planner/ms-sync/index.ts`
- Modify: `packages/event-contracts/src/index.ts`

Per CLAUDE.md: event contracts are plain TS, zero NestJS imports, frozen shapes.

- [ ] **Step 1: `MsSyncEnabledEvent`**

```typescript
export const MS_SYNC_ENABLED_EVENT = 'planner.ms_sync.enabled'

export interface MsSyncEnabledEvent {
  readonly type: typeof MS_SYNC_ENABLED_EVENT
  readonly tenantId: string
  readonly actorId: string
  readonly tenantAdId: string
  readonly clientId: string
  readonly occurredAt: string // ISO
}

export function createMsSyncEnabledEvent(
  input: Omit<MsSyncEnabledEvent, 'type'>,
): MsSyncEnabledEvent {
  return { type: MS_SYNC_ENABLED_EVENT, ...input }
}
```

- [ ] **Step 2: `MsSyncDisabledEvent`**

```typescript
export const MS_SYNC_DISABLED_EVENT = 'planner.ms_sync.disabled'

export interface MsSyncDisabledEvent {
  readonly type: typeof MS_SYNC_DISABLED_EVENT
  readonly tenantId: string
  readonly actorId: string
  readonly reason: 'paused' | 'destroyed'
  readonly occurredAt: string
}

export function createMsSyncDisabledEvent(
  input: Omit<MsSyncDisabledEvent, 'type'>,
): MsSyncDisabledEvent {
  return { type: MS_SYNC_DISABLED_EVENT, ...input }
}
```

- [ ] **Step 3: `MsSyncCredentialInvalidatedEvent`**

```typescript
export const MS_SYNC_CREDENTIAL_INVALIDATED_EVENT = 'planner.ms_sync.credential_invalidated'

export interface MsSyncCredentialInvalidatedEvent {
  readonly type: typeof MS_SYNC_CREDENTIAL_INVALIDATED_EVENT
  readonly tenantId: string
  readonly reason: string
  readonly occurredAt: string
}

export function createMsSyncCredentialInvalidatedEvent(
  input: Omit<MsSyncCredentialInvalidatedEvent, 'type'>,
): MsSyncCredentialInvalidatedEvent {
  return { type: MS_SYNC_CREDENTIAL_INVALIDATED_EVENT, ...input }
}
```

- [ ] **Step 4: Barrel exports**

```typescript
// packages/event-contracts/src/planner/ms-sync/index.ts
export * from './ms-sync-enabled.event'
export * from './ms-sync-disabled.event'
export * from './ms-sync-credential-invalidated.event'
```

Add `export * from './planner/ms-sync'` to `packages/event-contracts/src/index.ts`.

- [ ] **Step 5: Build**

```bash
bun run --filter @future/event-contracts build
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A packages/event-contracts
git commit -m "feat(event-contracts): planner ms-sync lifecycle events"
```

---

## Task 3: `ConnectMsSyncCommand` handler — validate + store + emit

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/ms-sync/connect-ms-sync.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/connect-ms-sync.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/connect-ms-sync.handler.spec.ts`

- [ ] **Step 1: Command**

```typescript
export class ConnectMsSyncCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly input: {
      clientId: string
      tenantAdId: string
      clientSecret: string
    },
  ) {}
}
```

- [ ] **Step 2: Handler test**

```typescript
import { ConnectMsSyncHandler } from './connect-ms-sync.handler'
import { ConnectMsSyncCommand } from './connect-ms-sync.command'

describe('ConnectMsSyncHandler', () => {
  let secretsStore: any
  let credRepo: any
  let graphProvider: any
  let directoryFactory: any
  let eventBus: any

  beforeEach(() => {
    secretsStore = {
      putSecret: vi.fn().mockResolvedValue({ ref: 'arn:aws:secretsmanager:...:abc' }),
      deleteSecret: vi.fn(),
    }
    credRepo = { upsert: vi.fn(), get: vi.fn().mockResolvedValue(null) }
    graphProvider = { testConnection: vi.fn() }
    directoryFactory = { create: vi.fn().mockResolvedValue(graphProvider) }
    eventBus = { publish: vi.fn() }
  })

  const baseInput = {
    tenantId: 't1',
    actorId: 'a1',
    input: { clientId: 'c', tenantAdId: 'aad', clientSecret: 'shh' },
  }

  it('stores secret, upserts credential, emits MsSyncEnabledEvent on successful validation', async () => {
    graphProvider.testConnection.mockResolvedValue({ ok: true })
    const handler = new ConnectMsSyncHandler(secretsStore, credRepo, directoryFactory, eventBus)
    await handler.execute(
      new ConnectMsSyncCommand(baseInput.tenantId, baseInput.actorId, baseInput.input),
    )
    expect(secretsStore.putSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('t1'),
        value: 'shh',
      }),
    )
    expect(credRepo.upsert).toHaveBeenCalled()
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'planner.ms_sync.enabled', tenantId: 't1' }),
    )
  })

  it('deletes the stored secret and throws if Graph validation fails', async () => {
    graphProvider.testConnection.mockResolvedValue({ ok: false, error: '401 Unauthorized' })
    const handler = new ConnectMsSyncHandler(secretsStore, credRepo, directoryFactory, eventBus)
    await expect(
      handler.execute(
        new ConnectMsSyncCommand(baseInput.tenantId, baseInput.actorId, baseInput.input),
      ),
    ).rejects.toThrow(/401/)
    expect(secretsStore.deleteSecret).toHaveBeenCalledWith('arn:aws:secretsmanager:...:abc')
    expect(credRepo.upsert).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('rejects connect when credential already exists (must disconnect first)', async () => {
    credRepo.get.mockResolvedValue({ tenantId: 't1' })
    const handler = new ConnectMsSyncHandler(secretsStore, credRepo, directoryFactory, eventBus)
    await expect(
      handler.execute(
        new ConnectMsSyncCommand(baseInput.tenantId, baseInput.actorId, baseInput.input),
      ),
    ).rejects.toThrow(/already connected/i)
    expect(secretsStore.putSecret).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Handler implementation**

```typescript
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { ConnectMsSyncCommand } from './connect-ms-sync.command'
import { createMsSyncEnabledEvent } from '@future/event-contracts'
import {
  MS_GRAPH_CREDENTIAL_REPOSITORY,
  type IMsGraphCredentialRepository,
} from '../../../../identity/domain/repositories/ms-graph-credential.repository'
import {
  SECRETS_STORE,
  type ISecretsStore,
} from '../../../../identity/domain/ports/secrets-store.port'
import {
  DIRECTORY_PROVIDER_FACTORY,
  type IDirectoryProviderFactory,
} from '../../../../identity/domain/ports/directory-provider.port'
import { MsGraphCredentialEntity } from '../../../../identity/domain/entities/ms-graph-credential.entity'

const DEFAULT_SCOPES = ['https://graph.microsoft.com/.default']

@CommandHandler(ConnectMsSyncCommand)
export class ConnectMsSyncHandler implements ICommandHandler<ConnectMsSyncCommand> {
  constructor(
    @Inject(SECRETS_STORE) private readonly secrets: ISecretsStore,
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY)
    private readonly credRepo: IMsGraphCredentialRepository,
    @Inject(DIRECTORY_PROVIDER_FACTORY)
    private readonly directoryFactory: IDirectoryProviderFactory,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ConnectMsSyncCommand): Promise<void> {
    const existing = await this.credRepo.get(command.tenantId)
    if (existing) {
      throw new Error('Microsoft 365 is already connected for this tenant; disconnect first')
    }

    // Store secret in Secrets Manager
    const secretName = `future/tenant/${command.tenantId}/ms-graph-client-secret`
    const { ref } = await this.secrets.putSecret({
      name: secretName,
      value: command.input.clientSecret,
    })

    const credential = MsGraphCredentialEntity.create({
      tenantId: command.tenantId,
      clientId: command.input.clientId,
      clientSecretRef: ref,
      tenantAdId: command.input.tenantAdId,
      scopes: DEFAULT_SCOPES,
      consentedAt: new Date(),
    })

    // Validate via test connection — without persisting first, so a failure
    // leaves no garbage rows. If test passes, persist; if it fails, clean up.
    const provider = await this.directoryFactory.create({
      tenantId: command.tenantId,
      kind: 'microsoft',
    } as any)
    // Re-wire provider with the in-hand credential (factory expects repo-stored):
    // simplest way — inject acquirer + credential directly. For MVP in this plan,
    // we upsert then test; if test fails we roll back.
    await this.credRepo.upsert(credential)

    const result = await provider.testConnection()
    if (!result.ok) {
      await this.credRepo.delete(command.tenantId)
      await this.secrets.deleteSecret(ref)
      throw new Error(`Microsoft Graph validation failed: ${result.error}`)
    }

    credential.markActive()
    await this.credRepo.upsert(credential)

    this.eventBus.publish(
      createMsSyncEnabledEvent({
        tenantId: command.tenantId,
        actorId: command.actorId,
        tenantAdId: command.input.tenantAdId,
        clientId: command.input.clientId,
        occurredAt: new Date().toISOString(),
      }),
    )
  }
}
```

Note: `DirectoryConnectionService.create(...)` reads the credential from the repo (per Plan 4.0). We upsert first, then test. If test fails, we delete. Not ideal but acceptable in this plan; refine in 4.7 if needed.

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add -A apps/api/src/modules/planner/application/commands/ms-sync
git commit -m "feat(planner): ConnectMsSyncCommand + handler — validate + store + emit"
```

---

## Task 4: `DisconnectMsSyncCommand` — pause and destroy variants

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/ms-sync/disconnect-ms-sync.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/disconnect-ms-sync.handler.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/disconnect-ms-sync.handler.spec.ts`

- [ ] **Step 1: Command**

```typescript
export class DisconnectMsSyncCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly mode: 'pause' | 'destroy',
  ) {}
}
```

- [ ] **Step 2: Test**

```typescript
describe('DisconnectMsSyncHandler', () => {
  it('pause: marks credential paused; keeps secret; emits event with reason=paused', async () => {
    const cred = MsGraphCredentialEntity.create({
      tenantId: 't1',
      clientId: 'c',
      clientSecretRef: 'arn',
      tenantAdId: 'aad',
      scopes: [],
      consentedAt: new Date(),
    })
    const credRepo = { get: vi.fn().mockResolvedValue(cred), upsert: vi.fn(), delete: vi.fn() }
    const secrets = { deleteSecret: vi.fn() }
    const eventBus = { publish: vi.fn() }

    const handler = new DisconnectMsSyncHandler(credRepo as any, secrets as any, eventBus as any)
    await handler.execute(new DisconnectMsSyncCommand('t1', 'a1', 'pause'))

    expect(credRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'paused' }))
    expect(secrets.deleteSecret).not.toHaveBeenCalled()
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'planner.ms_sync.disabled', reason: 'paused' }),
    )
  })

  it('destroy: deletes credential + secret; emits event with reason=destroyed', async () => {
    const cred = MsGraphCredentialEntity.create({
      tenantId: 't1',
      clientId: 'c',
      clientSecretRef: 'arn',
      tenantAdId: 'aad',
      scopes: [],
      consentedAt: new Date(),
    })
    const credRepo = { get: vi.fn().mockResolvedValue(cred), upsert: vi.fn(), delete: vi.fn() }
    const secrets = { deleteSecret: vi.fn() }
    const eventBus = { publish: vi.fn() }

    const handler = new DisconnectMsSyncHandler(credRepo as any, secrets as any, eventBus as any)
    await handler.execute(new DisconnectMsSyncCommand('t1', 'a1', 'destroy'))

    expect(credRepo.delete).toHaveBeenCalledWith('t1')
    expect(secrets.deleteSecret).toHaveBeenCalledWith('arn')
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'planner.ms_sync.disabled', reason: 'destroyed' }),
    )
  })

  it('no-ops + no event when no credential exists', async () => {
    const credRepo = { get: vi.fn().mockResolvedValue(null), upsert: vi.fn(), delete: vi.fn() }
    const secrets = { deleteSecret: vi.fn() }
    const eventBus = { publish: vi.fn() }

    const handler = new DisconnectMsSyncHandler(credRepo as any, secrets as any, eventBus as any)
    await handler.execute(new DisconnectMsSyncCommand('t1', 'a1', 'pause'))

    expect(credRepo.upsert).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Handler**

```typescript
@CommandHandler(DisconnectMsSyncCommand)
export class DisconnectMsSyncHandler implements ICommandHandler<DisconnectMsSyncCommand> {
  constructor(
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY)
    private readonly credRepo: IMsGraphCredentialRepository,
    @Inject(SECRETS_STORE) private readonly secrets: ISecretsStore,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DisconnectMsSyncCommand): Promise<void> {
    const cred = await this.credRepo.get(command.tenantId)
    if (!cred) return

    if (command.mode === 'pause') {
      cred.markPaused()
      await this.credRepo.upsert(cred)
    } else {
      // destroy
      await this.credRepo.delete(command.tenantId)
      await this.secrets.deleteSecret(cred.clientSecretRef)
    }

    this.eventBus.publish(
      createMsSyncDisabledEvent({
        tenantId: command.tenantId,
        actorId: command.actorId,
        reason: command.mode === 'pause' ? 'paused' : 'destroyed',
        occurredAt: new Date().toISOString(),
      }),
    )
  }
}
```

Plan 4.2 later adds: when destroy is invoked, convert all MS-linked plans to `container_type='future_only'`. In this plan, `ms_linked_group` table doesn't yet exist, so there's nothing to convert.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src/modules/planner/application/commands/ms-sync
git commit -m "feat(planner): DisconnectMsSyncCommand pause + destroy"
```

---

## Task 5: tRPC router — `msSync.connect` / `msSync.disconnect.*` / `msSync.status`

**Files:**

- Create: `apps/api/src/modules/planner/interface/trpc/ms-sync.router.ts`
- Create: `apps/api/src/modules/planner/interface/trpc/ms-sync.router.spec.ts`
- Modify: `apps/api/src/modules/planner/interface/trpc/planner.router.ts` (or wherever sub-routers are composed)

- [ ] **Step 1: Router with Zod inputs**

```typescript
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { procedure, router, tenantAdminProcedure } from '../../../../trpc/init'
import { ConnectMsSyncCommand } from '../../application/commands/ms-sync/connect-ms-sync.command'
import { DisconnectMsSyncCommand } from '../../application/commands/ms-sync/disconnect-ms-sync.command'
import { GetMsSyncStatusQuery } from '../../application/queries/ms-sync/get-ms-sync-status.query'

const connectInput = z.object({
  tenantAdId: z.string().uuid({ message: 'Tenant (directory) ID must be a UUID' }),
  clientId: z.string().uuid({ message: 'Application (client) ID must be a UUID' }),
  clientSecret: z.string().min(1),
})

export const msSyncRouter = router({
  connect: tenantAdminProcedure.input(connectInput).mutation(async ({ input, ctx }) => {
    await ctx.commandBus.execute(new ConnectMsSyncCommand(ctx.tenantId, ctx.actorId, input))
  }),

  disconnect: router({
    pause: tenantAdminProcedure.mutation(async ({ ctx }) => {
      await ctx.commandBus.execute(new DisconnectMsSyncCommand(ctx.tenantId, ctx.actorId, 'pause'))
    }),
    destroy: tenantAdminProcedure.mutation(async ({ ctx }) => {
      await ctx.commandBus.execute(
        new DisconnectMsSyncCommand(ctx.tenantId, ctx.actorId, 'destroy'),
      )
    }),
  }),

  status: tenantAdminProcedure.query(async ({ ctx }) => {
    return ctx.queryBus.execute(new GetMsSyncStatusQuery(ctx.tenantId))
  }),
})
```

The `tenantAdminProcedure` is presumed to enforce `planner.ms_sync.connect` permission via existing permission middleware. Verify by grepping how `personal.enabled`-scoped procedures guard themselves and mirror.

- [ ] **Step 2: `GetMsSyncStatusQuery` + handler**

```typescript
export class GetMsSyncStatusQuery {
  constructor(public readonly tenantId: string) {}
}

export interface MsSyncStatus {
  connected: boolean
  status: 'active' | 'invalid' | 'paused' | null
  tenantAdId: string | null
  clientId: string | null
  connectedAt: string | null
  lastError: string | null
}

@QueryHandler(GetMsSyncStatusQuery)
export class GetMsSyncStatusHandler implements IQueryHandler<GetMsSyncStatusQuery> {
  constructor(
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY)
    private readonly credRepo: IMsGraphCredentialRepository,
  ) {}

  async execute(query: GetMsSyncStatusQuery): Promise<MsSyncStatus> {
    const cred = await this.credRepo.get(query.tenantId)
    if (!cred) {
      return {
        connected: false,
        status: null,
        tenantAdId: null,
        clientId: null,
        connectedAt: null,
        lastError: null,
      }
    }
    return {
      connected: true,
      status: cred.status,
      tenantAdId: cred.tenantAdId,
      clientId: cred.clientId,
      connectedAt: cred.consentedAt.toISOString(),
      lastError: cred.lastError,
    }
  }
}
```

Handler + query file paths mirror repo convention (see existing queries in planner module).

- [ ] **Step 3: Register the sub-router**

In the planner router index, add:

```typescript
import { msSyncRouter } from './ms-sync.router'

export const plannerRouter = router({
  // ...existing sub-routers,
  msSync: msSyncRouter,
})
```

- [ ] **Step 4: Integration test**

```typescript
describe('msSyncRouter', () => {
  it('connect persists credential + status returns connected=true', async () => {
    // harness spins up tRPC with real handlers + in-memory db + mocked Graph factory
    await caller.msSync.connect({
      tenantAdId: 'aad-uuid',
      clientId: 'client-uuid',
      clientSecret: 'secret',
    })
    const status = await caller.msSync.status()
    expect(status.connected).toBe(true)
    expect(status.status).toBe('active')
  })

  it('disconnect.pause returns status=paused', async () => {
    // seed credential
    await caller.msSync.disconnect.pause()
    const status = await caller.msSync.status()
    expect(status.status).toBe('paused')
  })

  it('disconnect.destroy returns connected=false', async () => {
    await caller.msSync.disconnect.destroy()
    const status = await caller.msSync.status()
    expect(status.connected).toBe(false)
  })
})
```

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add -A apps/api/src/modules/planner/interface/trpc apps/api/src/modules/planner/application/queries/ms-sync
git commit -m "feat(planner): msSync tRPC router — connect/disconnect/status"
```

---

## Task 6: Notifications wiring — credential invalidated email

**Files:**

- Create: `apps/api/src/modules/planner/application/event-handlers/ms-sync-credential-invalidated.listener.ts`
- Create: `apps/api/src/modules/planner/application/event-handlers/ms-sync-credential-invalidated.listener.spec.ts`

- [ ] **Step 1: Listener test**

```typescript
import { MsSyncCredentialInvalidatedListener } from './ms-sync-credential-invalidated.listener'

describe('MsSyncCredentialInvalidatedListener', () => {
  it('sends email to every tenant_admin', async () => {
    const notifications = { sendEmail: vi.fn() }
    const kernelFacade = {
      listActorsWithRole: vi.fn().mockResolvedValue([
        { actorId: 'a1', email: 'admin1@t.com' },
        { actorId: 'a2', email: 'admin2@t.com' },
      ]),
    }
    const listener = new MsSyncCredentialInvalidatedListener(
      notifications as any,
      kernelFacade as any,
    )

    await listener.handle({
      type: 'planner.ms_sync.credential_invalidated',
      tenantId: 't1',
      reason: 'invalid_grant',
      occurredAt: new Date().toISOString(),
    })

    expect(notifications.sendEmail).toHaveBeenCalledTimes(2)
    expect(notifications.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin1@t.com',
        subject: expect.stringContaining('Microsoft 365'),
      }),
    )
  })
})
```

- [ ] **Step 2: Listener implementation**

```typescript
import { Injectable } from '@nestjs/common'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import {
  MS_SYNC_CREDENTIAL_INVALIDATED_EVENT,
  type MsSyncCredentialInvalidatedEvent,
} from '@future/event-contracts'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { NotificationsFacade } from '../../../notifications/application/facades/notifications.facade'

@EventsHandler({ type: MS_SYNC_CREDENTIAL_INVALIDATED_EVENT } as any)
@Injectable()
export class MsSyncCredentialInvalidatedListener implements IEventHandler<MsSyncCredentialInvalidatedEvent> {
  constructor(
    private readonly notifications: NotificationsFacade,
    private readonly kernelFacade: KernelQueryFacade,
  ) {}

  async handle(event: MsSyncCredentialInvalidatedEvent): Promise<void> {
    const admins = await this.kernelFacade.listActorsWithRole(event.tenantId, 'tenant_admin')
    for (const admin of admins) {
      if (!admin.email) continue
      await this.notifications.sendEmail({
        to: admin.email,
        subject: 'Microsoft 365 sync is disconnected — action required',
        body: `Microsoft 365 integration has been disconnected from Future. Reason: ${event.reason}.\n\nPlans are still editable but changes will not sync until reconnected.\n\nReconnect in Future → Admin → Integrations → Microsoft 365.`,
      })
    }
  }
}
```

Note: `listActorsWithRole` signature may differ — match the existing kernel facade. If missing, add the minimal read to `KernelQueryFacade` as a precondition.

- [ ] **Step 3: Register listener in planner module**

Add `MsSyncCredentialInvalidatedListener` to `providers:` in `planner.module.ts`. Nest CQRS event bus auto-registers `@EventsHandler`.

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src/modules/planner/application/event-handlers
git commit -m "feat(planner): email tenant_admins on ms_sync credential invalidation"
```

---

## Task 7: web-admin — `/integrations/microsoft` route scaffolding

**Files:**

- Create: `apps/web-admin/src/app/integrations/microsoft/page.tsx`
- Create: `apps/web-admin/src/app/integrations/microsoft/page.spec.tsx`
- Create: `apps/web-admin/src/app/integrations/microsoft/connect-form.tsx`
- Create: `apps/web-admin/src/app/integrations/microsoft/connect-form.spec.tsx`
- Create: `apps/web-admin/src/app/integrations/microsoft/status-card.tsx`
- Create: `apps/web-admin/src/app/integrations/microsoft/status-card.spec.tsx`
- Create: `apps/web-admin/src/app/integrations/microsoft/invalid-banner.tsx`
- Create: `apps/web-admin/src/app/integrations/microsoft/invalid-banner.spec.tsx`
- Modify: `apps/web-admin/src/navigation.ts` (or wherever admin nav is declared)

- [ ] **Step 1: Add nav entry**

Add "Integrations" → "Microsoft 365" to the admin nav, flagged behind `planner.ms_sync.enabled` being visible (or always visible if flag-off shows a "Coming soon" message). Match Sub-project #3's pattern of flag-gated sidebar sections.

- [ ] **Step 2: `ConnectForm` — test**

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectForm } from './connect-form'

function setup(onSubmit = vi.fn()) {
  const user = userEvent.setup()
  render(<ConnectForm onSubmit={onSubmit} isSubmitting={false} error={null} />)
  return { user, onSubmit }
}

describe('<ConnectForm />', () => {
  it('renders three inputs and submit', () => {
    setup()
    expect(screen.getByLabelText(/Tenant \(directory\) ID/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Application \(client\) ID/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Client secret/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Test & Save/ })).toBeInTheDocument()
  })

  it('calls onSubmit with trimmed values', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText(/Tenant \(directory\) ID/), '11111111-1111-1111-1111-111111111111')
    await user.type(screen.getByLabelText(/Application \(client\) ID/), '22222222-2222-2222-2222-222222222222')
    await user.type(screen.getByLabelText(/Client secret/), ' shhhh ')
    await user.click(screen.getByRole('button', { name: /Test & Save/ }))
    expect(onSubmit).toHaveBeenCalledWith({
      tenantAdId: '11111111-1111-1111-1111-111111111111',
      clientId: '22222222-2222-2222-2222-222222222222',
      clientSecret: 'shhhh',
    })
  })

  it('shows error prominently when provided', () => {
    render(<ConnectForm onSubmit={vi.fn()} isSubmitting={false} error="401 Unauthorized" />)
    expect(screen.getByRole('alert')).toHaveTextContent('401 Unauthorized')
  })
})
```

- [ ] **Step 3: `ConnectForm` implementation**

```tsx
'use client'

import { useState } from 'react'
import { Button, Input, Label, Alert, AlertDescription } from '@future/ui'

export interface ConnectFormProps {
  onSubmit: (values: { tenantAdId: string; clientId: string; clientSecret: string }) => void
  isSubmitting: boolean
  error: string | null
}

export function ConnectForm({ onSubmit, isSubmitting, error }: ConnectFormProps) {
  const [tenantAdId, setTenantAdId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          tenantAdId: tenantAdId.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="tenantAdId">Tenant (directory) ID</Label>
        <Input
          id="tenantAdId"
          value={tenantAdId}
          onChange={(e) => setTenantAdId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          disabled={isSubmitting}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="clientId">Application (client) ID</Label>
        <Input
          id="clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          disabled={isSubmitting}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="clientSecret">Client secret</Label>
        <Input
          id="clientSecret"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          disabled={isSubmitting}
          required
        />
      </div>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Validating…' : 'Test & Save'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 4: `StatusCard`**

Renders the "Active" state. Shows `status.connectedAt`, directory ID, a last-sync line (placeholder "—" until 4.3 ships polling), a row of tabs (`Linked Groups` / `Rosters` / `Conflicts` — all placeholder links for now), and a `Disconnect ▾` dropdown with Pause / Disconnect-destroy options.

```tsx
import {
  Card,
  CardHeader,
  CardContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Button,
} from '@future/ui'
import { ChevronDown } from 'lucide-react'

export interface StatusCardProps {
  connectedAt: string
  tenantAdId: string
  onPause: () => void
  onDestroy: () => void
}

export function StatusCard({ connectedAt, tenantAdId, onPause, onDestroy }: StatusCardProps) {
  return (
    <Card>
      <CardHeader className="flex justify-between items-start">
        <div>
          <h2 className="text-lg font-semibold">Microsoft 365 integration</h2>
          <p className="text-sm text-muted-foreground">
            Connected {new Date(connectedAt).toLocaleString()} · Directory {tenantAdId}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              Disconnect <ChevronDown className="size-4 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onPause}>Pause sync</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDestroy} variant="destructive">
              Disconnect (keep data as Future-only)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Linked Groups, Rosters, and Conflicts tabs will appear here as sync features ship.
        </p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: `InvalidBanner`**

```tsx
import { Alert, AlertTitle, AlertDescription, Button } from '@future/ui'
import { AlertTriangle } from 'lucide-react'

export interface InvalidBannerProps {
  reason: string | null
  onReconnect: () => void
}

export function InvalidBanner({ reason, onReconnect }: InvalidBannerProps) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-5" />
      <AlertTitle>Microsoft 365 sync is disconnected</AlertTitle>
      <AlertDescription>
        Reason: {reason ?? 'authentication failed'}. Plans are still editable; changes push when you
        reconnect.
      </AlertDescription>
      <Button onClick={onReconnect} className="mt-4">
        Reconnect Microsoft 365
      </Button>
    </Alert>
  )
}
```

- [ ] **Step 6: `page.tsx` — the state router**

```tsx
'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { ConnectForm } from './connect-form'
import { StatusCard } from './status-card'
import { InvalidBanner } from './invalid-banner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, Button } from '@future/ui'

export default function MsSyncPage() {
  const { data: status, refetch } = trpc.planner.msSync.status.useQuery()
  const connect = trpc.planner.msSync.connect.useMutation()
  const pause = trpc.planner.msSync.disconnect.pause.useMutation()
  const destroy = trpc.planner.msSync.disconnect.destroy.useMutation()

  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!status) return null

  if (!status.connected) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Microsoft 365</h1>
        <p className="text-muted-foreground">
          Connect Future to your organization's Microsoft 365 Planner. Tasks, plans, assignments,
          and attachments sync bidirectionally.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Connect Microsoft 365</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect Microsoft 365</DialogTitle>
            </DialogHeader>
            <ConnectForm
              isSubmitting={connect.isPending}
              error={error}
              onSubmit={async (values) => {
                try {
                  setError(null)
                  await connect.mutateAsync(values)
                  setOpen(false)
                  refetch()
                } catch (e) {
                  setError((e as Error).message)
                }
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  if (status.status === 'invalid') {
    return (
      <div className="max-w-2xl space-y-6">
        <InvalidBanner
          reason={status.lastError}
          onReconnect={() => {
            // Reconnect flow: open the connect dialog after destroying the invalid cred.
            destroy.mutate(undefined, {
              onSuccess: () => {
                setOpen(true)
                refetch()
              },
            })
          }}
        />
      </div>
    )
  }

  // Active or paused
  return (
    <div className="max-w-3xl space-y-6">
      <StatusCard
        connectedAt={status.connectedAt!}
        tenantAdId={status.tenantAdId!}
        onPause={() => pause.mutate(undefined, { onSuccess: refetch })}
        onDestroy={() => {
          if (!confirm('Disconnect and keep data as Future-only? This cannot be undone.')) return
          destroy.mutate(undefined, { onSuccess: refetch })
        }}
      />
    </div>
  )
}
```

- [ ] **Step 7: Component tests for each**

Each component already has its spec skeleton above. Run:

```bash
bun run --filter @future/web-admin test
```

Fix mocks + assertions until green.

- [ ] **Step 8: Commit**

```bash
git add -A apps/web-admin/src/app/integrations/microsoft apps/web-admin/src/navigation.ts
git commit -m "feat(web-admin): integrations/microsoft page — connect / active / invalid"
```

---

## Task 8: E2E smoke — admin connects, sees active state

**Files:**

- Create: `apps/e2e/tests/admin-ms-sync-connect.spec.ts`

- [ ] **Step 1: Playwright test**

```typescript
import { test, expect } from '@playwright/test'

test('tenant_admin connects Microsoft 365 and sees active state', async ({ page }) => {
  await page.goto('/admin/integrations/microsoft')
  await page.getByRole('button', { name: /Connect Microsoft 365/ }).click()

  await page.getByLabel('Tenant (directory) ID').fill(process.env.TEST_MS_TENANT_AD_ID!)
  await page.getByLabel('Application (client) ID').fill(process.env.TEST_MS_CLIENT_ID!)
  await page.getByLabel('Client secret').fill(process.env.TEST_MS_CLIENT_SECRET!)
  await page.getByRole('button', { name: 'Test & Save' }).click()

  await expect(page.getByText(/Connected/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: /Disconnect/ })).toBeVisible()
})
```

- [ ] **Step 2: Environment setup**

The env vars point at a test MS tenant SETA controls. CI step provisions them from GitHub Secrets. Document in `apps/e2e/README.md`.

- [ ] **Step 3: Run E2E locally (if credentials available)**

```bash
bun run --filter @future/e2e test -- admin-ms-sync-connect
```

Skip this locally if no test tenant; rely on CI.

- [ ] **Step 4: Commit**

```bash
git add -A apps/e2e
git commit -m "test(e2e): admin connect flow for Microsoft 365"
```

---

## Task 9: Coverage + PR prep

- [ ] **Step 1: Run full test suite + coverage**

```bash
bun run test:unit
bun run --filter @future/api test:coverage -- apps/api/src/modules/planner/application/commands/ms-sync
```

Expected: ≥70% on the new surface.

- [ ] **Step 2: Lint + format**

```bash
bun run lint
bun run format
```

- [ ] **Step 3: Open PR**

Branch: `feat/planner-ms-sync-connect`. PR description template:

```markdown
## What

Closes Plan 4.1 of Sub-project #4a. Ships the tenant-admin connect / disconnect flow for
Microsoft 365 Planner sync plus the `web-admin/integrations/microsoft` page scaffolding
every later plan extends. No sync traffic yet — that begins in Plan 4.2.

## Spec re-read deltas

No deltas — implementation matches design spec §3.3, §8.1, §9.1, §9.2, §10.2 (Plan 4.1).

## DDD compliance

- Cross-module facades used: `KernelQueryFacade.listActorsWithRole`, `IdentityQueryFacade.getGraphCredential`.
- New ports added: none.
- New repositories added: none (reuses 4.0's).
- New events added: `MsSyncEnabledEvent`, `MsSyncDisabledEvent`, `MsSyncCredentialInvalidatedEvent`.
- Stubs used: none.

## Tests

- Unit: `connect-ms-sync.handler.spec.ts`, `disconnect-ms-sync.handler.spec.ts`, `ms-sync-credential-invalidated.listener.spec.ts`, `connect-form.spec.tsx`, `status-card.spec.tsx`, `invalid-banner.spec.tsx`, `page.spec.tsx`.
- Integration: `ms-sync.router.spec.ts` against real Graph test credentials.
- E2E: `admin-ms-sync-connect.spec.ts` (Playwright).

## Exit criteria

- [x] `msSync.connect/disconnect.*/status` tRPC procedures work end-to-end.
- [x] Connect validates against real Graph; rolls back on failure.
- [x] Events published on connect + disconnect + credential-invalidated.
- [x] `web-admin/integrations/microsoft` renders all three states.
- [x] Coverage ≥ 70%.
```

## Completion criteria

- `planner.ms_sync.enabled` flag and four permissions exist.
- `msSync.connect` / `disconnect.pause` / `disconnect.destroy` / `status` tRPC procedures work end-to-end.
- Connect validates against real Graph; failure rolls back credential + secret.
- `MsSyncEnabledEvent` / `MsSyncDisabledEvent` / `MsSyncCredentialInvalidatedEvent` contracts published.
- `web-admin/integrations/microsoft` renders connect / active / invalid states.
- Credential-invalidation emits email to tenant admins.
- E2E connect flow green in CI.
- Coverage ≥ 70%.
- No sync polling/push implemented yet — explicit scope boundary for this plan.

# Plan 4.0 — Identity Module Microsoft Graph Completion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the `MicrosoftGraphProvider` stub with a real app-only Graph client, add per-tenant credential storage, materialize AAD group membership into `identity.idp_group_member`, and extend `IdentityQueryFacade` with the two read methods planner needs for sync.

**Architecture:** Native `fetch` with hand-rolled token caching (no Microsoft SDK — NodeNext+CJS compatibility + etag header control). Credentials stored by reference: `client_secret` in AWS Secrets Manager, ARN in Postgres. Group membership synced by the existing `sync-idp-groups.handler` cron — extended to populate `idp_group_member`.

**Tech Stack:** Drizzle, NestJS CQRS, Vitest, Testcontainers, `@aws-sdk/client-secrets-manager`, native `fetch`.

**Source spec:** [`2026-04-21-planner-ms-sync-4a-design.md`](../../specs/2026-04-21-planner-ms-sync-4a-design.md) §3.3, §4.1, §10.2 (Plan 4.0).

**Current state audit (must read before starting):**

- `apps/api/src/modules/identity/domain/ports/directory-provider.port.ts` — canonical port. Has `testConnection`, `listGroups` (member count only), `listUsers`.
- `apps/api/src/modules/identity/infrastructure/providers/directory-provider.interface.ts` — **DUPLICATE** separate interface with `listUsers`, `listGroupsWithMembers`. `MicrosoftGraphProvider` currently implements this one.
- `apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.ts` — stub that logs "not yet implemented" and returns `[]`.
- `apps/api/src/modules/identity/infrastructure/providers/google-directory.provider.ts` — probably implements the same infrastructure interface.

**First task below consolidates these.** Do not proceed to credentials/Graph work until the port is unified.

---

## Task 1: Unify `IDirectoryProvider` — single canonical port

**Files:**

- Modify: `apps/api/src/modules/identity/domain/ports/directory-provider.port.ts`
- Delete: `apps/api/src/modules/identity/infrastructure/providers/directory-provider.interface.ts`
- Modify: `apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.ts`
- Modify: `apps/api/src/modules/identity/infrastructure/providers/google-directory.provider.ts`
- Modify: `apps/api/src/modules/identity/infrastructure/providers/directory-connection.service.ts`
- Modify: any other file that imports from the deleted infrastructure interface

- [ ] **Step 1: Rewrite the domain port to be the single source of truth**

Replace `apps/api/src/modules/identity/domain/ports/directory-provider.port.ts`:

```typescript
export const DIRECTORY_PROVIDER_FACTORY = Symbol('IDirectoryProviderFactory')

export interface IdpUser {
  externalId: string
  email: string
  displayName: string
  isActive: boolean
}

export interface IdpGroup {
  externalGroupId: string
  displayName: string
  memberExternalIds: string[]
}

export interface IDirectoryProvider {
  testConnection(): Promise<{ ok: true } | { ok: false; error: string }>
  listUsers(): Promise<IdpUser[]>
  listGroupsWithMembers(): Promise<IdpGroup[]>
}

export interface IDirectoryProviderFactory {
  create(provider: IdentityProviderEntity): IDirectoryProvider
}
```

Note: `IdentityProviderEntity` import goes at top.

- [ ] **Step 2: Delete the duplicate infrastructure interface**

```bash
rm apps/api/src/modules/identity/infrastructure/providers/directory-provider.interface.ts
```

- [ ] **Step 3: Update imports in `microsoft-graph.provider.ts` and `google-directory.provider.ts`**

Change every `from './directory-provider.interface'` to `from '../../domain/ports/directory-provider.port'`.

- [ ] **Step 4: Find remaining stale imports**

```bash
grep -r "directory-provider.interface" apps/api/src
```

Expected: zero matches. Update any other file that imported the deleted interface.

- [ ] **Step 5: Compile check**

```bash
bun run --filter @future/api typecheck
```

Expected: passes. Fix any type breaks from the interface consolidation.

- [ ] **Step 6: Commit**

```bash
git add -A apps/api/src/modules/identity
git commit -m "refactor(identity): unify IDirectoryProvider into single domain port"
```

---

## Task 2: Drizzle schema — `identity.ms_graph_credential` and `identity.idp_group_member`

**Files:**

- Modify: `apps/api/src/modules/identity/infrastructure/schema/identity.schema.ts`
- Generate: `packages/db/drizzle/migrations/NNNN_identity_ms_graph.sql`

- [ ] **Step 1: Extend the Drizzle schema file with the two new tables**

Append to `apps/api/src/modules/identity/infrastructure/schema/identity.schema.ts`:

```typescript
export const msGraphCredential = identitySchema.table('ms_graph_credential', {
  tenantId: uuid('tenant_id').primaryKey().notNull(),
  clientId: text('client_id').notNull(),
  clientSecretRef: text('client_secret_ref').notNull(),
  tenantAdId: text('tenant_ad_id').notNull(),
  scopes: text('scopes').array().notNull(),
  status: text('status').notNull().default('active'),
  consentedAt: timestamp('consented_at', { withTimezone: true }).notNull(),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const idpGroupMember = identitySchema.table(
  'idp_group_member',
  {
    tenantId: uuid('tenant_id').notNull(),
    externalGroupId: text('external_group_id').notNull(),
    ssoSubject: text('sso_subject').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.externalGroupId, t.ssoSubject] }),
    lookup: index('idx_idp_group_member_lookup').on(t.tenantId, t.externalGroupId),
  }),
)
```

Ensure `primaryKey` and `index` are imported from `drizzle-orm/pg-core`.

- [ ] **Step 2: Generate the migration**

```bash
bun run --cwd packages/db db:generate
```

Expected: a new file in `packages/db/drizzle/migrations/` like `0010_<adjective_name>.sql`.

- [ ] **Step 3: Add RLS to the generated migration**

Edit the generated migration. Append:

```sql
ALTER TABLE identity.ms_graph_credential ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.idp_group_member ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON identity.ms_graph_credential
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation ON identity.idp_group_member
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

- [ ] **Step 4: Apply the migration to a local DB and verify**

```bash
bun run --cwd packages/db db:migrate
```

Then:

```bash
psql "$DATABASE_URL" -c "\d identity.ms_graph_credential"
psql "$DATABASE_URL" -c "\d identity.idp_group_member"
```

Expected: tables exist with the declared columns; `Policies` section shows `tenant_isolation`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/infrastructure/schema/identity.schema.ts \
        packages/db/drizzle/migrations
git commit -m "feat(identity): add ms_graph_credential and idp_group_member tables"
```

---

## Task 3: Domain entity — `IdpGroupMemberEntity`

**Files:**

- Create: `apps/api/src/modules/identity/domain/entities/idp-group-member.entity.ts`
- Create: `apps/api/src/modules/identity/domain/entities/idp-group-member.entity.spec.ts`

- [ ] **Step 1: Write the failing spec**

```typescript
import { IdpGroupMemberEntity } from './idp-group-member.entity'

describe('IdpGroupMemberEntity', () => {
  it('constructs with tenant, group, and subject', () => {
    const m = IdpGroupMemberEntity.create({
      tenantId: 't1',
      externalGroupId: 'g1',
      ssoSubject: 'aad-oid-1',
    })
    expect(m.tenantId).toBe('t1')
    expect(m.externalGroupId).toBe('g1')
    expect(m.ssoSubject).toBe('aad-oid-1')
    expect(m.syncedAt).toBeInstanceOf(Date)
  })

  it('rejects empty ids', () => {
    expect(() =>
      IdpGroupMemberEntity.create({ tenantId: '', externalGroupId: 'g', ssoSubject: 's' }),
    ).toThrow()
    expect(() =>
      IdpGroupMemberEntity.create({ tenantId: 't', externalGroupId: '', ssoSubject: 's' }),
    ).toThrow()
    expect(() =>
      IdpGroupMemberEntity.create({ tenantId: 't', externalGroupId: 'g', ssoSubject: '' }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test apps/api/src/modules/identity/domain/entities/idp-group-member.entity.spec.ts
```

- [ ] **Step 3: Implement the entity**

```typescript
export class IdpGroupMemberEntity {
  private constructor(
    public readonly tenantId: string,
    public readonly externalGroupId: string,
    public readonly ssoSubject: string,
    public readonly syncedAt: Date,
  ) {}

  static create(props: {
    tenantId: string
    externalGroupId: string
    ssoSubject: string
    syncedAt?: Date
  }): IdpGroupMemberEntity {
    if (!props.tenantId) throw new Error('tenantId required')
    if (!props.externalGroupId) throw new Error('externalGroupId required')
    if (!props.ssoSubject) throw new Error('ssoSubject required')
    return new IdpGroupMemberEntity(
      props.tenantId,
      props.externalGroupId,
      props.ssoSubject,
      props.syncedAt ?? new Date(),
    )
  }
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/domain/entities/idp-group-member.entity*.ts
git commit -m "feat(identity): IdpGroupMemberEntity domain entity"
```

---

## Task 4: Repository interface + Drizzle adapter for `idp_group_member`

**Files:**

- Create: `apps/api/src/modules/identity/domain/repositories/idp-group-member.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-idp-group-member.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-idp-group-member.repository.integration.spec.ts`

- [ ] **Step 1: Define the repository interface**

```typescript
import type { IdpGroupMemberEntity } from '../entities/idp-group-member.entity'

export const IDP_GROUP_MEMBER_REPOSITORY = Symbol('IIdpGroupMemberRepository')

export interface IIdpGroupMemberRepository {
  replaceForGroup(input: {
    tenantId: string
    externalGroupId: string
    ssoSubjects: string[]
  }): Promise<void>

  listMembers(input: { tenantId: string; externalGroupId: string }): Promise<IdpGroupMemberEntity[]>
}
```

- [ ] **Step 2: Write the integration spec against Testcontainers**

```typescript
import { Test } from '@nestjs/testing'
import { DrizzleIdpGroupMemberRepository } from './drizzle-idp-group-member.repository'
import { withTestDb } from '../../../../test/with-test-db'
import { DB_TOKEN } from '../../../../shared/db/db.token'

describe('DrizzleIdpGroupMemberRepository', () => {
  withTestDb(({ getDb }) => {
    let repo: DrizzleIdpGroupMemberRepository

    beforeEach(async () => {
      const mod = await Test.createTestingModule({
        providers: [DrizzleIdpGroupMemberRepository, { provide: DB_TOKEN, useValue: getDb() }],
      }).compile()
      repo = mod.get(DrizzleIdpGroupMemberRepository)
    })

    it('replaces members atomically — add + remove in one call', async () => {
      await repo.replaceForGroup({
        tenantId: 't1',
        externalGroupId: 'g1',
        ssoSubjects: ['a', 'b', 'c'],
      })
      let members = await repo.listMembers({ tenantId: 't1', externalGroupId: 'g1' })
      expect(members.map((m) => m.ssoSubject).sort()).toEqual(['a', 'b', 'c'])

      await repo.replaceForGroup({
        tenantId: 't1',
        externalGroupId: 'g1',
        ssoSubjects: ['b', 'c', 'd'],
      })
      members = await repo.listMembers({ tenantId: 't1', externalGroupId: 'g1' })
      expect(members.map((m) => m.ssoSubject).sort()).toEqual(['b', 'c', 'd'])
    })

    it('isolates members per tenant', async () => {
      await repo.replaceForGroup({ tenantId: 't1', externalGroupId: 'g1', ssoSubjects: ['a'] })
      await repo.replaceForGroup({ tenantId: 't2', externalGroupId: 'g1', ssoSubjects: ['z'] })
      const t1 = await repo.listMembers({ tenantId: 't1', externalGroupId: 'g1' })
      expect(t1.map((m) => m.ssoSubject)).toEqual(['a'])
    })
  })
})
```

- [ ] **Step 3: Run — expect FAIL (repository doesn't exist)**

- [ ] **Step 4: Implement the repository**

```typescript
import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../shared/db/db.token'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../schema/identity.schema'
import { IdpGroupMemberEntity } from '../../domain/entities/idp-group-member.entity'
import type { IIdpGroupMemberRepository } from '../../domain/repositories/idp-group-member.repository'

@Injectable()
export class DrizzleIdpGroupMemberRepository implements IIdpGroupMemberRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: NodePgDatabase<typeof schema>) {}

  async replaceForGroup(input: {
    tenantId: string
    externalGroupId: string
    ssoSubjects: string[]
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.idpGroupMember)
        .where(
          and(
            eq(schema.idpGroupMember.tenantId, input.tenantId),
            eq(schema.idpGroupMember.externalGroupId, input.externalGroupId),
          ),
        )
      if (input.ssoSubjects.length === 0) return
      await tx.insert(schema.idpGroupMember).values(
        input.ssoSubjects.map((ssoSubject) => ({
          tenantId: input.tenantId,
          externalGroupId: input.externalGroupId,
          ssoSubject,
        })),
      )
    })
  }

  async listMembers(input: {
    tenantId: string
    externalGroupId: string
  }): Promise<IdpGroupMemberEntity[]> {
    const rows = await this.db
      .select()
      .from(schema.idpGroupMember)
      .where(
        and(
          eq(schema.idpGroupMember.tenantId, input.tenantId),
          eq(schema.idpGroupMember.externalGroupId, input.externalGroupId),
        ),
      )
    return rows.map((r) =>
      IdpGroupMemberEntity.create({
        tenantId: r.tenantId,
        externalGroupId: r.externalGroupId,
        ssoSubject: r.ssoSubject,
        syncedAt: r.syncedAt,
      }),
    )
  }
}
```

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add -A apps/api/src/modules/identity/domain/repositories \
            apps/api/src/modules/identity/infrastructure/repositories
git commit -m "feat(identity): IIdpGroupMemberRepository + Drizzle adapter"
```

---

## Task 5: AWS Secrets Manager adapter for `client_secret` handling

**Files:**

- Create: `apps/api/src/modules/identity/domain/ports/secrets-store.port.ts`
- Create: `apps/api/src/modules/identity/infrastructure/secrets/aws-secrets-store.adapter.ts`
- Create: `apps/api/src/modules/identity/infrastructure/secrets/aws-secrets-store.adapter.spec.ts`

Dependency: ensure `@aws-sdk/client-secrets-manager` is installed.

- [ ] **Step 1: Add the dependency**

```bash
bun add -F @future/api @aws-sdk/client-secrets-manager
```

Verify it lands in `apps/api/package.json` dependencies.

- [ ] **Step 2: Define the port**

```typescript
export const SECRETS_STORE = Symbol('ISecretsStore')

export interface ISecretsStore {
  putSecret(input: { name: string; value: string }): Promise<{ ref: string }>
  getSecret(ref: string): Promise<string>
  deleteSecret(ref: string): Promise<void>
}
```

- [ ] **Step 3: Write the adapter with a mocked SDK**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AwsSecretsStoreAdapter } from './aws-secrets-store.adapter'
import {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  DeleteSecretCommand,
} from '@aws-sdk/client-secrets-manager'

vi.mock('@aws-sdk/client-secrets-manager')

describe('AwsSecretsStoreAdapter', () => {
  let send: ReturnType<typeof vi.fn>

  beforeEach(() => {
    send = vi.fn()
    ;(SecretsManagerClient as any).mockImplementation(() => ({ send }))
  })

  it('putSecret returns ARN as ref', async () => {
    send.mockResolvedValue({ ARN: 'arn:aws:secretsmanager:...:abc' })
    const store = new AwsSecretsStoreAdapter({ region: 'ap-southeast-1' })
    const result = await store.putSecret({ name: 'n', value: 'v' })
    expect(result.ref).toBe('arn:aws:secretsmanager:...:abc')
    expect(send).toHaveBeenCalledWith(expect.any(CreateSecretCommand))
  })

  it('getSecret returns stored string', async () => {
    send.mockResolvedValue({ SecretString: 'plaintext-value' })
    const store = new AwsSecretsStoreAdapter({ region: 'ap-southeast-1' })
    expect(await store.getSecret('arn:xxx')).toBe('plaintext-value')
  })

  it('deleteSecret forces immediate removal', async () => {
    send.mockResolvedValue({})
    const store = new AwsSecretsStoreAdapter({ region: 'ap-southeast-1' })
    await store.deleteSecret('arn:xxx')
    expect(send).toHaveBeenCalledWith(expect.any(DeleteSecretCommand))
  })
})
```

- [ ] **Step 4: Run — expect FAIL (adapter not yet written)**

- [ ] **Step 5: Implement the adapter**

```typescript
import { Injectable } from '@nestjs/common'
import {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  DeleteSecretCommand,
} from '@aws-sdk/client-secrets-manager'
import type { ISecretsStore } from '../../domain/ports/secrets-store.port'

@Injectable()
export class AwsSecretsStoreAdapter implements ISecretsStore {
  private readonly client: SecretsManagerClient

  constructor(opts: { region: string }) {
    this.client = new SecretsManagerClient({ region: opts.region })
  }

  async putSecret(input: { name: string; value: string }): Promise<{ ref: string }> {
    const response = await this.client.send(
      new CreateSecretCommand({ Name: input.name, SecretString: input.value }),
    )
    if (!response.ARN) throw new Error('Secrets Manager did not return ARN')
    return { ref: response.ARN }
  }

  async getSecret(ref: string): Promise<string> {
    const response = await this.client.send(new GetSecretValueCommand({ SecretId: ref }))
    if (!response.SecretString) throw new Error(`Secret ${ref} has no SecretString`)
    return response.SecretString
  }

  async deleteSecret(ref: string): Promise<void> {
    await this.client.send(
      new DeleteSecretCommand({ SecretId: ref, ForceDeleteWithoutRecovery: true }),
    )
  }
}
```

- [ ] **Step 6: Run — expect PASS**

- [ ] **Step 7: Commit**

```bash
git add -A apps/api/src/modules/identity/domain/ports/secrets-store.port.ts \
            apps/api/src/modules/identity/infrastructure/secrets \
            apps/api/package.json bun.lock
git commit -m "feat(identity): AWS Secrets Manager adapter for ISecretsStore"
```

---

## Task 6: `MsGraphCredentialEntity` + repository

**Files:**

- Create: `apps/api/src/modules/identity/domain/entities/ms-graph-credential.entity.ts`
- Create: `apps/api/src/modules/identity/domain/entities/ms-graph-credential.entity.spec.ts`
- Create: `apps/api/src/modules/identity/domain/repositories/ms-graph-credential.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-ms-graph-credential.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-ms-graph-credential.repository.integration.spec.ts`

- [ ] **Step 1: Entity test**

```typescript
import { MsGraphCredentialEntity } from './ms-graph-credential.entity'

describe('MsGraphCredentialEntity', () => {
  const base = {
    tenantId: 't1',
    clientId: 'c',
    clientSecretRef: 'arn',
    tenantAdId: 'aad-1',
    scopes: ['Tasks.ReadWrite.All'],
    consentedAt: new Date(),
  }

  it('defaults status to active', () => {
    const cred = MsGraphCredentialEntity.create(base)
    expect(cred.status).toBe('active')
  })

  it('markInvalid sets status and error', () => {
    const cred = MsGraphCredentialEntity.create(base)
    cred.markInvalid('invalid_grant')
    expect(cred.status).toBe('invalid')
    expect(cred.lastError).toBe('invalid_grant')
  })

  it('markActive clears error', () => {
    const cred = MsGraphCredentialEntity.create(base)
    cred.markInvalid('x')
    cred.markActive()
    expect(cred.status).toBe('active')
    expect(cred.lastError).toBeNull()
  })
})
```

- [ ] **Step 2: Entity implementation**

```typescript
export type MsGraphCredentialStatus = 'active' | 'invalid' | 'paused'

export class MsGraphCredentialEntity {
  constructor(
    public readonly tenantId: string,
    public readonly clientId: string,
    public readonly clientSecretRef: string,
    public readonly tenantAdId: string,
    public readonly scopes: readonly string[],
    public status: MsGraphCredentialStatus,
    public readonly consentedAt: Date,
    public lastValidatedAt: Date | null,
    public lastError: string | null,
  ) {}

  static create(props: {
    tenantId: string
    clientId: string
    clientSecretRef: string
    tenantAdId: string
    scopes: readonly string[]
    consentedAt: Date
    status?: MsGraphCredentialStatus
    lastValidatedAt?: Date | null
    lastError?: string | null
  }): MsGraphCredentialEntity {
    return new MsGraphCredentialEntity(
      props.tenantId,
      props.clientId,
      props.clientSecretRef,
      props.tenantAdId,
      props.scopes,
      props.status ?? 'active',
      props.consentedAt,
      props.lastValidatedAt ?? null,
      props.lastError ?? null,
    )
  }

  markInvalid(reason: string): void {
    this.status = 'invalid'
    this.lastError = reason
  }

  markActive(): void {
    this.status = 'active'
    this.lastError = null
    this.lastValidatedAt = new Date()
  }

  markPaused(): void {
    this.status = 'paused'
  }
}
```

- [ ] **Step 3: Repository interface**

```typescript
import type { MsGraphCredentialEntity } from '../entities/ms-graph-credential.entity'

export const MS_GRAPH_CREDENTIAL_REPOSITORY = Symbol('IMsGraphCredentialRepository')

export interface IMsGraphCredentialRepository {
  get(tenantId: string): Promise<MsGraphCredentialEntity | null>
  upsert(credential: MsGraphCredentialEntity): Promise<void>
  delete(tenantId: string): Promise<void>
}
```

- [ ] **Step 4: Repository integration test**

```typescript
import { Test } from '@nestjs/testing'
import { DrizzleMsGraphCredentialRepository } from './drizzle-ms-graph-credential.repository'
import { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import { withTestDb } from '../../../../test/with-test-db'
import { DB_TOKEN } from '../../../../shared/db/db.token'

describe('DrizzleMsGraphCredentialRepository', () => {
  withTestDb(({ getDb }) => {
    let repo: DrizzleMsGraphCredentialRepository

    beforeEach(async () => {
      const mod = await Test.createTestingModule({
        providers: [DrizzleMsGraphCredentialRepository, { provide: DB_TOKEN, useValue: getDb() }],
      }).compile()
      repo = mod.get(DrizzleMsGraphCredentialRepository)
    })

    it('upsert persists and get returns the entity', async () => {
      const cred = MsGraphCredentialEntity.create({
        tenantId: 't1',
        clientId: 'c',
        clientSecretRef: 'arn',
        tenantAdId: 'aad',
        scopes: ['Tasks.ReadWrite.All'],
        consentedAt: new Date('2026-04-21T00:00:00Z'),
      })
      await repo.upsert(cred)
      const got = await repo.get('t1')
      expect(got?.clientId).toBe('c')
      expect(got?.status).toBe('active')
    })

    it('delete removes the row', async () => {
      const cred = MsGraphCredentialEntity.create({
        tenantId: 't2',
        clientId: 'c',
        clientSecretRef: 'arn',
        tenantAdId: 'aad',
        scopes: [],
        consentedAt: new Date(),
      })
      await repo.upsert(cred)
      await repo.delete('t2')
      expect(await repo.get('t2')).toBeNull()
    })
  })
})
```

- [ ] **Step 5: Repository implementation**

```typescript
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { DB_TOKEN } from '../../../../shared/db/db.token'
import * as schema from '../schema/identity.schema'
import { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import type { IMsGraphCredentialRepository } from '../../domain/repositories/ms-graph-credential.repository'

@Injectable()
export class DrizzleMsGraphCredentialRepository implements IMsGraphCredentialRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: NodePgDatabase<typeof schema>) {}

  async get(tenantId: string): Promise<MsGraphCredentialEntity | null> {
    const [row] = await this.db
      .select()
      .from(schema.msGraphCredential)
      .where(eq(schema.msGraphCredential.tenantId, tenantId))
      .limit(1)
    if (!row) return null
    return MsGraphCredentialEntity.create({
      tenantId: row.tenantId,
      clientId: row.clientId,
      clientSecretRef: row.clientSecretRef,
      tenantAdId: row.tenantAdId,
      scopes: row.scopes,
      status: row.status as 'active' | 'invalid' | 'paused',
      consentedAt: row.consentedAt,
      lastValidatedAt: row.lastValidatedAt,
      lastError: row.lastError,
    })
  }

  async upsert(credential: MsGraphCredentialEntity): Promise<void> {
    await this.db
      .insert(schema.msGraphCredential)
      .values({
        tenantId: credential.tenantId,
        clientId: credential.clientId,
        clientSecretRef: credential.clientSecretRef,
        tenantAdId: credential.tenantAdId,
        scopes: [...credential.scopes],
        status: credential.status,
        consentedAt: credential.consentedAt,
        lastValidatedAt: credential.lastValidatedAt,
        lastError: credential.lastError,
      })
      .onConflictDoUpdate({
        target: schema.msGraphCredential.tenantId,
        set: {
          clientId: credential.clientId,
          clientSecretRef: credential.clientSecretRef,
          tenantAdId: credential.tenantAdId,
          scopes: [...credential.scopes],
          status: credential.status,
          lastValidatedAt: credential.lastValidatedAt,
          lastError: credential.lastError,
          updatedAt: new Date(),
        },
      })
  }

  async delete(tenantId: string): Promise<void> {
    await this.db
      .delete(schema.msGraphCredential)
      .where(eq(schema.msGraphCredential.tenantId, tenantId))
  }
}
```

- [ ] **Step 6: Run all tests; expect PASS**

- [ ] **Step 7: Commit**

```bash
git add -A apps/api/src/modules/identity
git commit -m "feat(identity): MsGraphCredentialEntity + repository"
```

---

## Task 7: Token acquisition — `MsGraphTokenAcquirer` with in-memory cache

**Files:**

- Create: `apps/api/src/modules/identity/infrastructure/providers/microsoft/ms-graph-token-acquirer.ts`
- Create: `apps/api/src/modules/identity/infrastructure/providers/microsoft/ms-graph-token-acquirer.spec.ts`

- [ ] **Step 1: Test — happy path + caching + expiry + error**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MsGraphTokenAcquirer } from './ms-graph-token-acquirer'
import type { ISecretsStore } from '../../../domain/ports/secrets-store.port'

describe('MsGraphTokenAcquirer', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let secrets: ISecretsStore

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    secrets = {
      getSecret: vi.fn().mockResolvedValue('secret-value'),
      putSecret: vi.fn(),
      deleteSecret: vi.fn(),
    }
  })

  const cred = {
    tenantAdId: 'aad-1',
    clientId: 'c',
    clientSecretRef: 'arn',
    scopes: ['https://graph.microsoft.com/.default'],
  } as const

  it('POSTs to token endpoint with client_credentials flow', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok', expires_in: 3600 }),
    })
    const acquirer = new MsGraphTokenAcquirer(secrets, () => new Date('2026-04-21T00:00:00Z'))
    const token = await acquirer.acquire(cred)
    expect(token).toBe('tok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://login.microsoftonline.com/aad-1/oauth2/v2.0/token',
      expect.objectContaining({ method: 'POST' }),
    )
    const call = fetchMock.mock.calls[0][1] as RequestInit
    const body = String(call.body)
    expect(body).toContain('grant_type=client_credentials')
    expect(body).toContain('client_id=c')
    expect(body).toContain('client_secret=secret-value')
    expect(body).toContain('scope=https%3A%2F%2Fgraph.microsoft.com%2F.default')
  })

  it('caches token until near expiry', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok1', expires_in: 3600 }),
    })
    let clockNow = new Date('2026-04-21T00:00:00Z')
    const acquirer = new MsGraphTokenAcquirer(secrets, () => clockNow)

    const a = await acquirer.acquire(cred)
    const b = await acquirer.acquire(cred)
    expect(a).toBe('tok1')
    expect(b).toBe('tok1')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    clockNow = new Date('2026-04-21T00:56:00Z') // 56 min later, within 5-min safety
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok2', expires_in: 3600 }),
    })
    const c = await acquirer.acquire(cred)
    expect(c).toBe('tok2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws on non-2xx with body included', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'invalid_grant' }),
    })
    const acquirer = new MsGraphTokenAcquirer(secrets, () => new Date())
    await expect(acquirer.acquire(cred)).rejects.toThrow(/invalid_grant/)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import { Injectable } from '@nestjs/common'
import type { ISecretsStore } from '../../../domain/ports/secrets-store.port'

interface CacheEntry {
  token: string
  expiresAt: Date
}

@Injectable()
export class MsGraphTokenAcquirer {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly expirySkewMs = 5 * 60 * 1000

  constructor(
    private readonly secrets: ISecretsStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async acquire(cred: {
    tenantAdId: string
    clientId: string
    clientSecretRef: string
    scopes: readonly string[]
  }): Promise<string> {
    const key = `${cred.tenantAdId}:${cred.clientId}`
    const now = this.clock()
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt.getTime() - now.getTime() > this.expirySkewMs) {
      return cached.token
    }

    const secret = await this.secrets.getSecret(cred.clientSecretRef)
    const scope =
      cred.scopes.length > 0 ? cred.scopes.join(' ') : 'https://graph.microsoft.com/.default'

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cred.clientId,
      client_secret: secret,
      scope,
    })

    const response = await fetch(
      `https://login.microsoftonline.com/${cred.tenantAdId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Token acquisition failed (${response.status}): ${text}`)
    }

    const json = (await response.json()) as { access_token: string; expires_in: number }
    const expiresAt = new Date(now.getTime() + json.expires_in * 1000)
    this.cache.set(key, { token: json.access_token, expiresAt })
    return json.access_token
  }

  invalidate(tenantAdId: string, clientId: string): void {
    this.cache.delete(`${tenantAdId}:${clientId}`)
  }
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src/modules/identity/infrastructure/providers/microsoft
git commit -m "feat(identity): MsGraphTokenAcquirer with in-memory token cache"
```

---

## Task 8: Real `MicrosoftGraphProvider` — list users, list groups with members

**Files:**

- Modify: `apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.ts`
- Create: `apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.spec.ts`

- [ ] **Step 1: Test — uses mocked fetch**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MicrosoftGraphProvider } from './microsoft-graph.provider'
import type { MsGraphTokenAcquirer } from './microsoft/ms-graph-token-acquirer'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'

describe('MicrosoftGraphProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let acquirer: MsGraphTokenAcquirer
  const cred = {
    tenantId: 't1',
    clientId: 'c',
    clientSecretRef: 'arn',
    tenantAdId: 'aad',
    scopes: ['https://graph.microsoft.com/.default'],
  } as MsGraphCredentialEntity
  const providerEntity = {} as IdentityProviderEntity

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    acquirer = { acquire: vi.fn().mockResolvedValue('tok') } as unknown as MsGraphTokenAcquirer
  })

  it('listUsers paginates @odata.nextLink and maps fields', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [
            { id: 'u1', mail: 'a@x.com', displayName: 'A', accountEnabled: true },
            {
              id: 'u2',
              mail: null,
              userPrincipalName: 'b@x.com',
              displayName: 'B',
              accountEnabled: false,
            },
          ],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skip=2',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [{ id: 'u3', mail: 'c@x.com', displayName: 'C', accountEnabled: true }],
        }),
      })

    const provider = new MicrosoftGraphProvider(providerEntity, cred, acquirer)
    const users = await provider.listUsers()
    expect(users.map((u) => u.externalId)).toEqual(['u1', 'u2', 'u3'])
    expect(users[1].email).toBe('b@x.com')
    expect(users[1].isActive).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('listGroupsWithMembers fetches each group members', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [{ id: 'g1', displayName: 'Marketing' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [{ id: 'u1' }, { id: 'u2' }] }),
      })

    const provider = new MicrosoftGraphProvider(providerEntity, cred, acquirer)
    const groups = await provider.listGroupsWithMembers()
    expect(groups).toEqual([
      { externalGroupId: 'g1', displayName: 'Marketing', memberExternalIds: ['u1', 'u2'] },
    ])
  })

  it('testConnection returns ok:true on 200', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ value: [] }) })
    const provider = new MicrosoftGraphProvider(providerEntity, cred, acquirer)
    expect(await provider.testConnection()).toEqual({ ok: true })
  })

  it('testConnection returns ok:false with body on 403', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => '{"error":"Forbidden"}',
    })
    const provider = new MicrosoftGraphProvider(providerEntity, cred, acquirer)
    expect(await provider.testConnection()).toEqual({
      ok: false,
      error: expect.stringContaining('403'),
    })
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import { Injectable, Logger } from '@nestjs/common'
import type {
  IDirectoryProvider,
  IdpUser,
  IdpGroup,
} from '../../domain/ports/directory-provider.port'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { MsGraphCredentialEntity } from '../../domain/entities/ms-graph-credential.entity'
import type { MsGraphTokenAcquirer } from './microsoft/ms-graph-token-acquirer'

interface GraphList<T> {
  value: T[]
  '@odata.nextLink'?: string
}

interface GraphUser {
  id: string
  mail?: string | null
  userPrincipalName?: string
  displayName?: string
  accountEnabled?: boolean
}

interface GraphGroup {
  id: string
  displayName: string
}

interface GraphDirectoryObject {
  id: string
}

@Injectable()
export class MicrosoftGraphProvider implements IDirectoryProvider {
  private readonly logger = new Logger(MicrosoftGraphProvider.name)
  private readonly baseUrl = 'https://graph.microsoft.com/v1.0'

  constructor(
    private readonly providerConfig: IdentityProviderEntity,
    private readonly credential: MsGraphCredentialEntity,
    private readonly tokenAcquirer: MsGraphTokenAcquirer,
  ) {}

  async testConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await this.graphFetch('/groups?$top=1')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  async listUsers(): Promise<IdpUser[]> {
    const collected: GraphUser[] = []
    let url: string | undefined =
      `${this.baseUrl}/users?$select=id,mail,userPrincipalName,displayName,accountEnabled&$top=999`
    while (url) {
      const page: GraphList<GraphUser> = await this.graphFetchAbsolute(url)
      collected.push(...page.value)
      url = page['@odata.nextLink']
    }
    return collected.map((u) => ({
      externalId: u.id,
      email: u.mail ?? u.userPrincipalName ?? '',
      displayName: u.displayName ?? '',
      isActive: u.accountEnabled !== false,
    }))
  }

  async listGroupsWithMembers(): Promise<IdpGroup[]> {
    const groups: GraphGroup[] = []
    let url: string | undefined = `${this.baseUrl}/groups?$select=id,displayName&$top=999`
    while (url) {
      const page: GraphList<GraphGroup> = await this.graphFetchAbsolute(url)
      groups.push(...page.value)
      url = page['@odata.nextLink']
    }

    const results: IdpGroup[] = []
    for (const group of groups) {
      const members = await this.listGroupMembers(group.id)
      results.push({
        externalGroupId: group.id,
        displayName: group.displayName,
        memberExternalIds: members,
      })
    }
    return results
  }

  private async listGroupMembers(externalGroupId: string): Promise<string[]> {
    const ids: string[] = []
    let url: string | undefined =
      `${this.baseUrl}/groups/${encodeURIComponent(externalGroupId)}/members?$select=id&$top=999`
    while (url) {
      const page: GraphList<GraphDirectoryObject> = await this.graphFetchAbsolute(url)
      ids.push(...page.value.map((m) => m.id))
      url = page['@odata.nextLink']
    }
    return ids
  }

  private async graphFetch<T>(path: string): Promise<T> {
    return this.graphFetchAbsolute<T>(`${this.baseUrl}${path}`)
  }

  private async graphFetchAbsolute<T>(url: string): Promise<T> {
    const token = await this.tokenAcquirer.acquire({
      tenantAdId: this.credential.tenantAdId,
      clientId: this.credential.clientId,
      clientSecretRef: this.credential.clientSecretRef,
      scopes: this.credential.scopes,
    })
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Graph ${response.status}: ${text.slice(0, 500)}`)
    }
    return (await response.json()) as T
  }
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider*
git commit -m "feat(identity): real MicrosoftGraphProvider — list users and groups with members"
```

---

## Task 9: Wire the factory — `DirectoryProviderFactory` returns correct provider

**Files:**

- Modify: `apps/api/src/modules/identity/infrastructure/providers/directory-connection.service.ts`
- Modify: `apps/api/src/modules/identity/identity.module.ts`

- [ ] **Step 1: Update the factory implementation**

Open `directory-connection.service.ts`. The existing shape creates a provider from an `IdentityProviderEntity`. Extend so the Microsoft branch also loads the credential + token acquirer.

```typescript
import { Inject, Injectable } from '@nestjs/common'
import type {
  IDirectoryProvider,
  IDirectoryProviderFactory,
} from '../../domain/ports/directory-provider.port'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import { MicrosoftGraphProvider } from './microsoft-graph.provider'
import { GoogleDirectoryProvider } from './google-directory.provider'
import {
  MS_GRAPH_CREDENTIAL_REPOSITORY,
  type IMsGraphCredentialRepository,
} from '../../domain/repositories/ms-graph-credential.repository'
import { MsGraphTokenAcquirer } from './microsoft/ms-graph-token-acquirer'

@Injectable()
export class DirectoryConnectionService implements IDirectoryProviderFactory {
  constructor(
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY)
    private readonly credRepo: IMsGraphCredentialRepository,
    private readonly tokenAcquirer: MsGraphTokenAcquirer,
  ) {}

  async create(provider: IdentityProviderEntity): Promise<IDirectoryProvider> {
    switch (provider.kind) {
      case 'microsoft': {
        const credential = await this.credRepo.get(provider.tenantId)
        if (!credential) {
          throw new Error(
            `No ms_graph_credential for tenant ${provider.tenantId}; admin must connect Microsoft 365 first`,
          )
        }
        return new MicrosoftGraphProvider(provider, credential, this.tokenAcquirer)
      }
      case 'google':
        return new GoogleDirectoryProvider(provider)
      default:
        throw new Error(`Unsupported IDP kind: ${provider.kind}`)
    }
  }
}
```

Note: `IDirectoryProviderFactory.create` is now async. Update the port signature to match. Update callers.

- [ ] **Step 2: Update the port to make `create` async**

In `directory-provider.port.ts`:

```typescript
export interface IDirectoryProviderFactory {
  create(provider: IdentityProviderEntity): Promise<IDirectoryProvider>
}
```

- [ ] **Step 3: Find and fix callers**

```bash
grep -rn "DIRECTORY_PROVIDER_FACTORY" apps/api/src/modules/identity
```

Every call site now needs `await` on `.create(...)`.

- [ ] **Step 4: Register the new providers in `identity.module.ts`**

Add to the `providers:` array:

- `MsGraphTokenAcquirer`
- `AwsSecretsStoreAdapter` (with `{ provide: SECRETS_STORE, useClass: AwsSecretsStoreAdapter }`)
- `DrizzleMsGraphCredentialRepository` (with `{ provide: MS_GRAPH_CREDENTIAL_REPOSITORY, useClass: DrizzleMsGraphCredentialRepository }`)
- `DrizzleIdpGroupMemberRepository` (with `{ provide: IDP_GROUP_MEMBER_REPOSITORY, useClass: DrizzleIdpGroupMemberRepository }`)

Do not export repository tokens — only facades are exported (per CLAUDE.md).

- [ ] **Step 5: Typecheck + tests**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api test
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A apps/api/src/modules/identity
git commit -m "feat(identity): factory selects MS Graph provider with credential + token"
```

---

## Task 10: Extend `sync-idp-groups.handler` to populate `idp_group_member`

**Files:**

- Modify: `apps/api/src/modules/identity/application/commands/sync-idp-groups.handler.ts`
- Modify: `apps/api/src/modules/identity/application/commands/sync-idp-groups.handler.spec.ts`

- [ ] **Step 1: Read the current handler** (5 min)

```bash
cat apps/api/src/modules/identity/application/commands/sync-idp-groups.handler.ts
```

Note existing flow — it already calls `listGroupsWithMembers()` and writes something. We're adding a call to `idpGroupMemberRepository.replaceForGroup(...)` for each group.

- [ ] **Step 2: Extend the test to assert members are persisted**

```typescript
it('replaces idp_group_member rows for each returned group', async () => {
  const providerMock = {
    listGroupsWithMembers: vi.fn().mockResolvedValue([
      { externalGroupId: 'g1', displayName: 'G1', memberExternalIds: ['u1', 'u2'] },
      { externalGroupId: 'g2', displayName: 'G2', memberExternalIds: ['u3'] },
    ]),
    testConnection: vi.fn(),
    listUsers: vi.fn(),
  }
  const factory = { create: vi.fn().mockResolvedValue(providerMock) }
  const memberRepo = { replaceForGroup: vi.fn(), listMembers: vi.fn() }
  const handler = new SyncIdpGroupsHandler(
    factory as any,
    /* existing deps */,
    memberRepo as any,
  )

  await handler.execute({ tenantId: 't1', providerId: 'p1' } as any)

  expect(memberRepo.replaceForGroup).toHaveBeenCalledTimes(2)
  expect(memberRepo.replaceForGroup).toHaveBeenCalledWith({
    tenantId: 't1',
    externalGroupId: 'g1',
    ssoSubjects: ['u1', 'u2'],
  })
})
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Extend the handler**

Inject `@Inject(IDP_GROUP_MEMBER_REPOSITORY) memberRepo: IIdpGroupMemberRepository` in the constructor. In the loop that currently iterates groups, add:

```typescript
await memberRepo.replaceForGroup({
  tenantId: command.tenantId,
  externalGroupId: group.externalGroupId,
  ssoSubjects: group.memberExternalIds,
})
```

Remember: handlers must not use `Promise.all` for DB writes (CLAUDE.md). Iterate sequentially with `for...of` + `await`.

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add -A apps/api/src/modules/identity/application/commands
git commit -m "feat(identity): sync-idp-groups populates idp_group_member"
```

---

## Task 11: Extend `IdentityQueryFacade` — `listGroupMembers` + `getGraphCredential`

**Files:**

- Modify: `apps/api/src/modules/identity/application/facades/identity-query.facade.ts`
- Modify: `apps/api/src/modules/identity/application/facades/identity-query.facade.spec.ts`
- Create: `apps/api/src/modules/identity/application/queries/list-group-members.query.ts`
- Create: `apps/api/src/modules/identity/application/queries/list-group-members.handler.ts`
- Create: `apps/api/src/modules/identity/application/queries/list-group-members.handler.spec.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-graph-credential.query.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-graph-credential.handler.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-graph-credential.handler.spec.ts`

- [ ] **Step 1: Define the `ListGroupMembersQuery`**

```typescript
export class ListGroupMembersQuery {
  constructor(
    public readonly externalGroupId: string,
    public readonly tenantId: string,
  ) {}
}
```

- [ ] **Step 2: Handler spec**

```typescript
import { ListGroupMembersHandler } from './list-group-members.handler'
import { IdpGroupMemberEntity } from '../../domain/entities/idp-group-member.entity'

describe('ListGroupMembersHandler', () => {
  it('returns { actorId, ssoSubject }[] for resolved members', async () => {
    const memberRepo = {
      listMembers: vi
        .fn()
        .mockResolvedValue([
          IdpGroupMemberEntity.create({ tenantId: 't', externalGroupId: 'g', ssoSubject: 'oid-a' }),
          IdpGroupMemberEntity.create({ tenantId: 't', externalGroupId: 'g', ssoSubject: 'oid-b' }),
        ]),
    }
    const kernelFacade = {
      getUserIdentityBySsoSubject: vi
        .fn()
        .mockImplementation(async (sub) => (sub === 'oid-a' ? { actorId: 'actor-1' } : null)),
    }
    const handler = new ListGroupMembersHandler(memberRepo as any, kernelFacade as any)
    const result = await handler.execute(new ListGroupMembersQuery('g', 't'))
    expect(result).toEqual([
      { actorId: 'actor-1', ssoSubject: 'oid-a' },
      { actorId: null, ssoSubject: 'oid-b' },
    ])
  })
})
```

- [ ] **Step 3: Handler implementation**

```typescript
import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ListGroupMembersQuery } from './list-group-members.query'
import {
  IDP_GROUP_MEMBER_REPOSITORY,
  type IIdpGroupMemberRepository,
} from '../../domain/repositories/idp-group-member.repository'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'

export interface GroupMemberResolution {
  actorId: string | null
  ssoSubject: string
}

@QueryHandler(ListGroupMembersQuery)
export class ListGroupMembersHandler implements IQueryHandler<ListGroupMembersQuery> {
  constructor(
    @Inject(IDP_GROUP_MEMBER_REPOSITORY)
    private readonly memberRepo: IIdpGroupMemberRepository,
    private readonly kernelFacade: KernelQueryFacade,
  ) {}

  async execute(query: ListGroupMembersQuery): Promise<GroupMemberResolution[]> {
    const members = await this.memberRepo.listMembers({
      tenantId: query.tenantId,
      externalGroupId: query.externalGroupId,
    })
    const results: GroupMemberResolution[] = []
    for (const m of members) {
      const identity = await this.kernelFacade.getUserIdentityBySsoSubject(
        m.ssoSubject,
        query.tenantId,
      )
      results.push({ actorId: identity?.actorId ?? null, ssoSubject: m.ssoSubject })
    }
    return results
  }
}
```

Sequential `for...of` — no `Promise.all` per CLAUDE.md (single RLS client).

- [ ] **Step 4: `GetGraphCredentialQuery` + handler — similar pattern**

Query:

```typescript
export class GetGraphCredentialQuery {
  constructor(public readonly tenantId: string) {}
}
```

Handler:

```typescript
@QueryHandler(GetGraphCredentialQuery)
export class GetGraphCredentialHandler implements IQueryHandler<GetGraphCredentialQuery> {
  constructor(
    @Inject(MS_GRAPH_CREDENTIAL_REPOSITORY)
    private readonly repo: IMsGraphCredentialRepository,
  ) {}

  execute(query: GetGraphCredentialQuery): Promise<MsGraphCredentialEntity | null> {
    return this.repo.get(query.tenantId)
  }
}
```

- [ ] **Step 5: Extend `IdentityQueryFacade`**

```typescript
async listGroupMembers(
  externalGroupId: string,
  tenantId: string,
): Promise<GroupMemberResolution[]> {
  return this.queryBus.execute(new ListGroupMembersQuery(externalGroupId, tenantId))
}

async getGraphCredential(tenantId: string): Promise<MsGraphCredentialEntity | null> {
  return this.queryBus.execute(new GetGraphCredentialQuery(tenantId))
}
```

Export `GroupMemberResolution` and `MsGraphCredentialEntity` types so downstream callers (planner) can import them.

- [ ] **Step 6: Register handlers in identity module**

Add `ListGroupMembersHandler` and `GetGraphCredentialHandler` to the `providers:` array of `identity.module.ts` (CQRS auto-registers via `@QueryHandler`).

- [ ] **Step 7: Run tests + typecheck**

```bash
bun run --filter @future/api test
bun run --filter @future/api typecheck
```

- [ ] **Step 8: Commit**

```bash
git add -A apps/api/src/modules/identity
git commit -m "feat(identity): IdentityQueryFacade.listGroupMembers + getGraphCredential"
```

---

## Task 12: Integration contract test — real Postgres, mocked Graph HTTP

**Files:**

- Create: `apps/api/src/modules/identity/application/facades/identity-query.facade.integration.spec.ts` (extend existing)

- [ ] **Step 1: Add an integration case that exercises the full chain**

```typescript
it('listGroupMembers resolves to actorIds when kernel has the identity mapping', async () => {
  // Seed ms_graph_credential
  await credentialRepo.upsert(
    MsGraphCredentialEntity.create({
      tenantId: 't1',
      clientId: 'c',
      clientSecretRef: 'arn',
      tenantAdId: 'aad',
      scopes: ['Tasks.ReadWrite.All'],
      consentedAt: new Date(),
    }),
  )

  // Seed idp_group_member directly
  await memberRepo.replaceForGroup({
    tenantId: 't1',
    externalGroupId: 'g1',
    ssoSubjects: ['oid-a', 'oid-b'],
  })

  // Seed user identity in kernel for oid-a only
  await kernelSeeder.seedUserIdentity({
    tenantId: 't1',
    ssoSubject: 'oid-a',
    actorId: 'actor-a',
  })

  const result = await facade.listGroupMembers('g1', 't1')
  expect(result).toEqual([
    { actorId: 'actor-a', ssoSubject: 'oid-a' },
    { actorId: null, ssoSubject: 'oid-b' },
  ])
})
```

- [ ] **Step 2: Run — expect PASS**

- [ ] **Step 3: Commit**

```bash
git add -A apps/api/src/modules/identity/application/facades/identity-query.facade.integration.spec.ts
git commit -m "test(identity): integration test for listGroupMembers end-to-end"
```

---

## Task 13: Coverage + final PR prep

- [ ] **Step 1: Run the full identity test suite with coverage**

```bash
bun run --filter @future/api test:coverage -- apps/api/src/modules/identity
```

Expected: lines/functions/branches ≥ 70% per CLAUDE.md. If below, add missing error-path tests.

- [ ] **Step 2: Run linters + formatters**

```bash
bun run --filter @future/api lint
bun run format
```

Fix any issues.

- [ ] **Step 3: Verify no stray references to the deleted infrastructure interface**

```bash
grep -rn "directory-provider.interface" apps/api/src
```

Expected: zero matches.

- [ ] **Step 4: Push branch and open PR**

Branch name: `feat/identity-graph-completion`. PR description follows the template:

```markdown
## What

Closes Plan 4.0 of Sub-project #4a. Implements the identity-side prerequisites for
planner MS sync: real `MicrosoftGraphProvider`, per-tenant credential storage in
`ms_graph_credential`, materialized group membership in `idp_group_member`, and the
two new `IdentityQueryFacade` read methods planner will consume.

## Spec re-read deltas

No deltas — implementation matches design spec §3.3, §4.1, §10.2 (Plan 4.0) exactly.

## DDD compliance

- Cross-module facades used: `KernelQueryFacade` (existing, for SSO subject → actor).
- New ports added: `ISecretsStore`, extended `IDirectoryProvider`.
- New repositories added: `IIdpGroupMemberRepository`, `IMsGraphCredentialRepository`.
- New events added: none in this plan (events arrive in 4.1).
- Stubs used: none. `MicrosoftGraphProvider.listUsers` / `listGroupsWithMembers` now fully implemented.

## Tests

- Unit: 9 spec files, all co-located.
- Integration: `drizzle-idp-group-member.repository.integration.spec.ts`, `drizzle-ms-graph-credential.repository.integration.spec.ts`, `identity-query.facade.integration.spec.ts` extended.
- E2E: none in this plan.

## Exit criteria (from plan)

- [x] `listGroupMembers` returns correct members for a seeded scenario end-to-end.
- [x] Unit + integration tests green.
- [x] Coverage ≥ 70%.
```

## Completion criteria

- `identity.ms_graph_credential` and `identity.idp_group_member` tables present with RLS.
- `MicrosoftGraphProvider` fully implemented — no logger warnings about stubs.
- `IdentityQueryFacade.listGroupMembers` and `getGraphCredential` present.
- Directory sync populates `idp_group_member` on each run.
- Single unified `IDirectoryProvider` port; duplicate interface deleted.
- Coverage ≥ 70%.
- PR merged to main.

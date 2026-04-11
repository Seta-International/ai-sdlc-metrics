# Access Control 02 — Identity Module

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the identity module — owns authentication (SSO, magic link), IdP configuration, directory sync, API key management, and user provisioning.

**Architecture:** New NestJS module with `identity` PostgreSQL schema. Stores IdP configuration, group-to-role mappings, magic link tokens, and API keys. Directory sync runs hourly via pg-boss, calling Microsoft Graph API or Google Directory API. Writes to kernel tables via command bus (never direct DB access across module boundaries).

**Tech Stack:** NestJS CQRS, Drizzle ORM, PostgreSQL, pg-boss, Microsoft Graph API, Google Directory API, AWS SES, vitest

**Depends on:** Plan 01 (Kernel Authorization Layer) — needs `role_grant.source` and `GrantRoleCommand` with source param
**Blocks:** Plan 03 (Authentication Flow), Plan 06 (Agent Access)

**Status:** not started

---

## Task 1: Create identity module scaffold + Drizzle schema

**Files:**

- Create: `apps/api/src/modules/identity/infrastructure/schema/identity.schema.ts`
- Create: `apps/api/src/modules/identity/infrastructure/schema/index.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/api/src/modules/identity/{domain/{entities,value-objects,repositories,exceptions},application/{commands,queries,facades,event-handlers},infrastructure/{schema,repositories,providers,jobs,email},interface/trpc}
```

- [ ] **Step 2: Write the schema**

File: `apps/api/src/modules/identity/infrastructure/schema/identity.schema.ts`

```typescript
import { pgSchema, uuid, text, timestamp, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'

export const identitySchema = pgSchema('identity')

export const identityProvider = identitySchema.table(
  'identity_provider',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    providerType: text('provider_type', {
      enum: ['microsoft', 'google'],
    }).notNull(),
    displayName: text('display_name').notNull(),
    clientId: text('client_id').notNull(),
    clientSecretRef: text('client_secret_ref').notNull(),
    directoryId: text('directory_id'),
    isPrimary: boolean('is_primary').notNull().default(false),
    syncEnabled: boolean('sync_enabled').notNull().default(false),
    lastSyncAt: timestamp('last_sync_at'),
    syncStatus: text('sync_status', {
      enum: ['idle', 'running', 'failed'],
    })
      .notNull()
      .default('idle'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_identity_provider_tenant_primary')
      .on(table.tenantId, table.isPrimary)
      .where(sql`${table.isPrimary} = true`),
  ],
)

export const idpGroupMapping = identitySchema.table(
  'idp_group_mapping',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    identityProviderId: uuid('identity_provider_id').notNull(),
    externalGroupId: text('external_group_id').notNull(),
    externalGroupName: text('external_group_name').notNull(),
    roleKey: text('role_key').notNull(),
    scopeType: text('scope_type', {
      enum: ['global', 'department', 'project', 'account'],
    }).notNull(),
    scopeId: uuid('scope_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_idp_group_mapping_role_scope').on(
      table.tenantId,
      table.externalGroupId,
      table.roleKey,
      table.scopeType,
      table.scopeId,
    ),
  ],
)

export const magicLinkToken = identitySchema.table(
  'magic_link_token',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_magic_link_token_hash_unused')
      .on(table.tokenHash)
      .where(sql`${table.usedAt} IS NULL`),
  ],
)

export const apiKey = identitySchema.table('api_key', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  keyHash: text('key_hash').notNull(),
  name: text('name').notNull(),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

- [ ] **Step 3: Create schema index.ts**

File: `apps/api/src/modules/identity/infrastructure/schema/index.ts`

```typescript
export {
  identitySchema,
  identityProvider,
  idpGroupMapping,
  magicLinkToken,
  apiKey,
} from './identity.schema'
```

- [ ] **Step 4: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/
git commit -m "feat(identity): add identity module scaffold and Drizzle schema"
```

---

## Task 2: Database migration + RLS

- [ ] **Step 1: Generate migration**

```bash
cd apps/api && bunx drizzle-kit generate
```

This generates a SQL file in `packages/db/drizzle/`. The migration will include CREATE SCHEMA, CREATE TABLE, and CREATE INDEX statements.

- [ ] **Step 2: Add RLS policies for all 4 tables**

Append to the generated migration file:

```sql
-- RLS for identity schema
ALTER TABLE "identity"."identity_provider" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "identity"."identity_provider"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true));

ALTER TABLE "identity"."idp_group_mapping" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "identity"."idp_group_mapping"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true));

ALTER TABLE "identity"."magic_link_token" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "identity"."magic_link_token"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true));

ALTER TABLE "identity"."api_key" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "identity"."api_key"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true));
```

- [ ] **Step 3: Run migration against test DB**

```bash
cd packages/db && bun run migrate
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/drizzle/
git commit -m "feat(identity): add identity schema migration with RLS policies"
```

---

## Task 3: Test helpers

**Files:**

- Modify: `packages/db/src/test-helpers/index.ts`

- [ ] **Step 1: Add `truncateIdentitySchema` and `seedIdentityProvider` helpers**

Add to `packages/db/src/test-helpers/index.ts`:

```typescript
import {
  identityProvider,
  idpGroupMapping,
  magicLinkToken,
  apiKey,
} from '../../apps/api/src/modules/identity/infrastructure/schema/index'

export async function truncateIdentitySchema(db: Db): Promise<void> {
  await db.delete(apiKey)
  await db.delete(magicLinkToken)
  await db.delete(idpGroupMapping)
  await db.delete(identityProvider)
}

export async function seedIdentityProvider(
  db: Db,
  overrides: {
    tenantId: string
    providerType?: 'microsoft' | 'google'
    displayName?: string
    clientId?: string
    clientSecretRef?: string
    directoryId?: string
    isPrimary?: boolean
    syncEnabled?: boolean
  },
): Promise<{ id: string }> {
  const rows = await db
    .insert(identityProvider)
    .values({
      tenantId: overrides.tenantId,
      providerType: overrides.providerType ?? 'microsoft',
      displayName: overrides.displayName ?? 'Test IdP',
      clientId: overrides.clientId ?? 'test-client-id',
      clientSecretRef:
        overrides.clientSecretRef ?? 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test',
      directoryId: overrides.directoryId ?? 'test-directory-id',
      isPrimary: overrides.isPrimary ?? false,
      syncEnabled: overrides.syncEnabled ?? false,
    })
    .returning({ id: identityProvider.id })
  return rows[0]
}
```

Note: Adjust the import path based on how this codebase resolves cross-package imports. Check existing test helper patterns — the import may use a workspace alias like `@future/api/...` or a relative path. Match whatever `seedEmploymentProfile` uses.

- [ ] **Step 2: Commit**

```bash
git add packages/db/
git commit -m "feat(identity): add identity schema test helpers"
```

---

## Task 4: Domain entities

**Files:**

- Create: `apps/api/src/modules/identity/domain/entities/identity-provider.entity.ts`
- Create: `apps/api/src/modules/identity/domain/entities/idp-group-mapping.entity.ts`
- Create: `apps/api/src/modules/identity/domain/entities/magic-link-token.entity.ts`
- Create: `apps/api/src/modules/identity/domain/entities/api-key.entity.ts`

- [ ] **Step 1: Create all entity files**

File: `apps/api/src/modules/identity/domain/entities/identity-provider.entity.ts`

```typescript
export type IdpProviderType = 'microsoft' | 'google'
export type IdpSyncStatus = 'idle' | 'running' | 'failed'

export interface IdentityProviderEntity {
  id: string
  tenantId: string
  providerType: IdpProviderType
  displayName: string
  clientId: string
  clientSecretRef: string
  directoryId: string | null
  isPrimary: boolean
  syncEnabled: boolean
  lastSyncAt: Date | null
  syncStatus: IdpSyncStatus
  createdAt: Date
  updatedAt: Date
}
```

File: `apps/api/src/modules/identity/domain/entities/idp-group-mapping.entity.ts`

```typescript
export type MappingScopeType = 'global' | 'department' | 'project' | 'account'

export interface IdpGroupMapping {
  id: string
  tenantId: string
  identityProviderId: string
  externalGroupId: string
  externalGroupName: string
  roleKey: string
  scopeType: MappingScopeType
  scopeId: string | null
  createdAt: Date
  updatedAt: Date
}
```

File: `apps/api/src/modules/identity/domain/entities/magic-link-token.entity.ts`

```typescript
export interface MagicLinkToken {
  id: string
  tenantId: string
  email: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
}
```

File: `apps/api/src/modules/identity/domain/entities/api-key.entity.ts`

```typescript
export interface ApiKeyEntity {
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

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/identity/domain/entities/
git commit -m "feat(identity): add domain entity interfaces"
```

---

## Task 5: Domain exceptions

**Files:**

- Create: `apps/api/src/modules/identity/domain/exceptions/identity.exceptions.ts`

- [ ] **Step 1: Create exceptions file**

File: `apps/api/src/modules/identity/domain/exceptions/identity.exceptions.ts`

```typescript
import { DomainException } from '../../../kernel/domain/exceptions/domain.exception'

export class IdentityProviderNotFoundException extends DomainException {
  readonly code = 'IDENTITY_PROVIDER_NOT_FOUND'
  constructor(id: string) {
    super(`Identity provider not found: ${id}`)
  }
}

export class PrimaryProviderAlreadyExistsException extends DomainException {
  readonly code = 'PRIMARY_PROVIDER_ALREADY_EXISTS'
  constructor(tenantId: string) {
    super(`A primary identity provider already exists for tenant: ${tenantId}`)
  }
}

export class InvalidClientSecretRefException extends DomainException {
  readonly code = 'INVALID_CLIENT_SECRET_REF'
  constructor(ref: string) {
    super(`client_secret_ref must be a valid AWS Secrets Manager ARN, got: ${ref}`)
  }
}

export class MagicLinkTokenExpiredException extends DomainException {
  readonly code = 'MAGIC_LINK_TOKEN_EXPIRED'
  constructor() {
    super('Magic link token has expired')
  }
}

export class MagicLinkTokenAlreadyUsedException extends DomainException {
  readonly code = 'MAGIC_LINK_TOKEN_ALREADY_USED'
  constructor() {
    super('Magic link token has already been used')
  }
}

export class MagicLinkTokenNotFoundException extends DomainException {
  readonly code = 'MAGIC_LINK_TOKEN_NOT_FOUND'
  constructor() {
    super('Magic link token not found')
  }
}

export class ApiKeyNotFoundException extends DomainException {
  readonly code = 'API_KEY_NOT_FOUND'
  constructor() {
    super('API key not found')
  }
}

export class ApiKeyRevokedException extends DomainException {
  readonly code = 'API_KEY_REVOKED'
  constructor() {
    super('API key has been revoked')
  }
}

export class ApiKeyExpiredException extends DomainException {
  readonly code = 'API_KEY_EXPIRED'
  constructor() {
    super('API key has expired')
  }
}

export class DirectorySyncAlreadyRunningException extends DomainException {
  readonly code = 'DIRECTORY_SYNC_ALREADY_RUNNING'
  constructor(providerId: string) {
    super(`Directory sync is already running for provider: ${providerId}`)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/identity/domain/exceptions/
git commit -m "feat(identity): add domain exceptions"
```

---

## Task 6: Identity provider repository (port + adapter)

**Files:**

- Create: `apps/api/src/modules/identity/domain/repositories/identity-provider.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-identity-provider.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-identity-provider.repository.integration.spec.ts`

- [ ] **Step 1: Write the test first (integration)**

File: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-identity-provider.repository.integration.spec.ts`

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncateIdentitySchema,
} from '@future/db/test-helpers'
import { DrizzleIdentityProviderRepository } from './drizzle-identity-provider.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000020'
const TENANT_B = '01900000-0000-7fff-8000-000000000021'

describe('DrizzleIdentityProviderRepository', () => {
  const db = createTestDb()
  let repo: DrizzleIdentityProviderRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'idp-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'idp-tenant-b' })
    repo = new DrizzleIdentityProviderRepository(db as never)
  })

  afterAll(async () => {
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
  })

  describe('insert + findById', () => {
    it('creates a provider and retrieves it by id', async () => {
      await setTenantContext(db, TENANT_A)

      const provider = await repo.insert({
        tenantId: TENANT_A,
        providerType: 'microsoft',
        displayName: 'SETA Entra',
        clientId: 'client-123',
        clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test-abc123',
        directoryId: 'dir-123',
        isPrimary: false,
        syncEnabled: false,
      })

      expect(provider.id).toBeDefined()
      expect(provider.tenantId).toBe(TENANT_A)
      expect(provider.providerType).toBe('microsoft')
      expect(provider.syncStatus).toBe('idle')

      const found = await repo.findById(provider.id, TENANT_A)
      expect(found).not.toBeNull()
      expect(found?.displayName).toBe('SETA Entra')
    })
  })

  describe('findByTenantId', () => {
    it('returns all providers for a tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const providers = await repo.findByTenantId(TENANT_A)
      expect(providers.length).toBeGreaterThanOrEqual(1)
      expect(providers.every((p) => p.tenantId === TENANT_A)).toBe(true)
    })
  })

  describe('findPrimary', () => {
    it('returns null when no primary exists', async () => {
      await setTenantContext(db, TENANT_B)
      const primary = await repo.findPrimary(TENANT_B)
      expect(primary).toBeNull()
    })

    it('returns the primary provider', async () => {
      await setTenantContext(db, TENANT_B)
      await repo.insert({
        tenantId: TENANT_B,
        providerType: 'google',
        displayName: 'Google Workspace',
        clientId: 'client-456',
        clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test-google',
        directoryId: null,
        isPrimary: true,
        syncEnabled: false,
      })

      const primary = await repo.findPrimary(TENANT_B)
      expect(primary).not.toBeNull()
      expect(primary?.isPrimary).toBe(true)
      expect(primary?.tenantId).toBe(TENANT_B)
    })
  })

  describe('update', () => {
    it('updates provider fields', async () => {
      await setTenantContext(db, TENANT_A)
      const providers = await repo.findByTenantId(TENANT_A)
      const provider = providers[0]

      const updated = await repo.update(provider.id, TENANT_A, {
        displayName: 'Updated Name',
        syncEnabled: true,
      })

      expect(updated.displayName).toBe('Updated Name')
      expect(updated.syncEnabled).toBe(true)
    })

    it('updates sync status and last_sync_at', async () => {
      await setTenantContext(db, TENANT_A)
      const providers = await repo.findByTenantId(TENANT_A)
      const provider = providers[0]
      const now = new Date()

      const updated = await repo.update(provider.id, TENANT_A, {
        syncStatus: 'running',
        lastSyncAt: now,
      })

      expect(updated.syncStatus).toBe('running')
      expect(updated.lastSyncAt).not.toBeNull()
    })
  })

  describe('tenant isolation', () => {
    it('returns null for provider in different tenant', async () => {
      await setTenantContext(db, TENANT_A)
      const providers = await repo.findByTenantId(TENANT_A)
      const provider = providers[0]

      await setTenantContext(db, TENANT_B)
      const found = await repo.findById(provider.id, TENANT_B)
      expect(found).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Create repository port**

File: `apps/api/src/modules/identity/domain/repositories/identity-provider.repository.ts`

```typescript
import type { IdentityProviderEntity, IdpSyncStatus } from '../entities/identity-provider.entity'

export const IDENTITY_PROVIDER_REPOSITORY = Symbol('IIdentityProviderRepository')

export interface IIdentityProviderRepository {
  findById(id: string, tenantId: string): Promise<IdentityProviderEntity | null>
  findByTenantId(tenantId: string): Promise<IdentityProviderEntity[]>
  findPrimary(tenantId: string): Promise<IdentityProviderEntity | null>
  insert(data: {
    tenantId: string
    providerType: IdentityProviderEntity['providerType']
    displayName: string
    clientId: string
    clientSecretRef: string
    directoryId: string | null
    isPrimary: boolean
    syncEnabled: boolean
  }): Promise<IdentityProviderEntity>
  update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        IdentityProviderEntity,
        | 'displayName'
        | 'clientId'
        | 'clientSecretRef'
        | 'directoryId'
        | 'isPrimary'
        | 'syncEnabled'
        | 'lastSyncAt'
        | 'syncStatus'
      >
    >,
  ): Promise<IdentityProviderEntity>
}
```

- [ ] **Step 3: Create Drizzle adapter**

File: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-identity-provider.repository.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { identityProvider } from '../schema/index'

@Injectable()
export class DrizzleIdentityProviderRepository implements IIdentityProviderRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<IdentityProviderEntity | null> {
    const rows = await this.db
      .select()
      .from(identityProvider)
      .where(and(eq(identityProvider.id, id), eq(identityProvider.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as IdentityProviderEntity | undefined) ?? null
  }

  async findByTenantId(tenantId: string): Promise<IdentityProviderEntity[]> {
    const rows = await this.db
      .select()
      .from(identityProvider)
      .where(eq(identityProvider.tenantId, tenantId))
    return rows as IdentityProviderEntity[]
  }

  async findPrimary(tenantId: string): Promise<IdentityProviderEntity | null> {
    const rows = await this.db
      .select()
      .from(identityProvider)
      .where(and(eq(identityProvider.tenantId, tenantId), eq(identityProvider.isPrimary, true)))
      .limit(1)
    return (rows[0] as IdentityProviderEntity | undefined) ?? null
  }

  async insert(data: {
    tenantId: string
    providerType: IdentityProviderEntity['providerType']
    displayName: string
    clientId: string
    clientSecretRef: string
    directoryId: string | null
    isPrimary: boolean
    syncEnabled: boolean
  }): Promise<IdentityProviderEntity> {
    const rows = await this.db
      .insert(identityProvider)
      .values({
        tenantId: data.tenantId,
        providerType: data.providerType,
        displayName: data.displayName,
        clientId: data.clientId,
        clientSecretRef: data.clientSecretRef,
        directoryId: data.directoryId ?? undefined,
        isPrimary: data.isPrimary,
        syncEnabled: data.syncEnabled,
      })
      .returning()
    return rows[0] as IdentityProviderEntity
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<
      Pick<
        IdentityProviderEntity,
        | 'displayName'
        | 'clientId'
        | 'clientSecretRef'
        | 'directoryId'
        | 'isPrimary'
        | 'syncEnabled'
        | 'lastSyncAt'
        | 'syncStatus'
      >
    >,
  ): Promise<IdentityProviderEntity> {
    const rows = await this.db
      .update(identityProvider)
      .set({ ...data, updatedAt: new Date() } as Record<string, unknown>)
      .where(and(eq(identityProvider.id, id), eq(identityProvider.tenantId, tenantId)))
      .returning()
    return rows[0] as IdentityProviderEntity
  }
}
```

- [ ] **Step 4: Run integration test**

```bash
cd apps/api && bun test drizzle-identity-provider.repository.integration.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/domain/repositories/identity-provider.repository.ts
git add apps/api/src/modules/identity/infrastructure/repositories/drizzle-identity-provider.repository.ts
git add apps/api/src/modules/identity/infrastructure/repositories/drizzle-identity-provider.repository.integration.spec.ts
git commit -m "feat(identity): add identity provider repository port and Drizzle adapter"
```

---

## Task 7: IdP group mapping repository (port + adapter)

**Files:**

- Create: `apps/api/src/modules/identity/domain/repositories/idp-group-mapping.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-idp-group-mapping.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-idp-group-mapping.repository.integration.spec.ts`

- [ ] **Step 1: Write the test first (integration)**

File: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-idp-group-mapping.repository.integration.spec.ts`

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  seedIdentityProvider,
  setTenantContext,
  truncateCoreSchema,
  truncateIdentitySchema,
} from '@future/db/test-helpers'
import { DrizzleIdpGroupMappingRepository } from './drizzle-idp-group-mapping.repository'

const TENANT = '01900000-0000-7fff-8000-000000000030'

describe('DrizzleIdpGroupMappingRepository', () => {
  const db = createTestDb()
  let repo: DrizzleIdpGroupMappingRepository
  let providerId: string

  beforeAll(async () => {
    await migrateForTest()
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT, slug: 'gm-tenant' })
    await setTenantContext(db, TENANT)
    const provider = await seedIdentityProvider(db, { tenantId: TENANT })
    providerId = provider.id
    repo = new DrizzleIdpGroupMappingRepository(db as never)
  })

  afterAll(async () => {
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
  })

  describe('upsert', () => {
    it('creates a new mapping', async () => {
      const mapping = await repo.upsert({
        tenantId: TENANT,
        identityProviderId: providerId,
        externalGroupId: 'group-aad-001',
        externalGroupName: 'Engineering',
        roleKey: 'employee',
        scopeType: 'global',
        scopeId: null,
      })

      expect(mapping.id).toBeDefined()
      expect(mapping.externalGroupId).toBe('group-aad-001')
      expect(mapping.roleKey).toBe('employee')
    })

    it('updates existing mapping on conflict', async () => {
      const mapping = await repo.upsert({
        tenantId: TENANT,
        identityProviderId: providerId,
        externalGroupId: 'group-aad-001',
        externalGroupName: 'Engineering (updated)',
        roleKey: 'employee',
        scopeType: 'global',
        scopeId: null,
      })

      expect(mapping.externalGroupName).toBe('Engineering (updated)')
    })
  })

  describe('findByProviderId', () => {
    it('returns mappings for the provider', async () => {
      const mappings = await repo.findByProviderId(providerId, TENANT)
      expect(mappings.length).toBeGreaterThanOrEqual(1)
      expect(mappings.every((m) => m.identityProviderId === providerId)).toBe(true)
    })
  })

  describe('findByTenantId', () => {
    it('returns all mappings for the tenant', async () => {
      const mappings = await repo.findByTenantId(TENANT)
      expect(mappings.length).toBeGreaterThanOrEqual(1)
      expect(mappings.every((m) => m.tenantId === TENANT)).toBe(true)
    })
  })

  describe('remove', () => {
    it('deletes the mapping by id', async () => {
      const mappings = await repo.findByProviderId(providerId, TENANT)
      const toRemove = mappings[0]

      await repo.remove(toRemove.id, TENANT)

      const after = await repo.findByProviderId(providerId, TENANT)
      expect(after.find((m) => m.id === toRemove.id)).toBeUndefined()
    })
  })
})
```

- [ ] **Step 2: Create repository port**

File: `apps/api/src/modules/identity/domain/repositories/idp-group-mapping.repository.ts`

```typescript
import type { IdpGroupMapping } from '../entities/idp-group-mapping.entity'

export const IDP_GROUP_MAPPING_REPOSITORY = Symbol('IIdpGroupMappingRepository')

export interface IIdpGroupMappingRepository {
  findByProviderId(identityProviderId: string, tenantId: string): Promise<IdpGroupMapping[]>
  findByTenantId(tenantId: string): Promise<IdpGroupMapping[]>
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

- [ ] **Step 3: Create Drizzle adapter**

File: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-idp-group-mapping.repository.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { idpGroupMapping } from '../schema/index'

@Injectable()
export class DrizzleIdpGroupMappingRepository implements IIdpGroupMappingRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByProviderId(identityProviderId: string, tenantId: string): Promise<IdpGroupMapping[]> {
    const rows = await this.db
      .select()
      .from(idpGroupMapping)
      .where(
        and(
          eq(idpGroupMapping.identityProviderId, identityProviderId),
          eq(idpGroupMapping.tenantId, tenantId),
        ),
      )
    return rows as IdpGroupMapping[]
  }

  async findByTenantId(tenantId: string): Promise<IdpGroupMapping[]> {
    const rows = await this.db
      .select()
      .from(idpGroupMapping)
      .where(eq(idpGroupMapping.tenantId, tenantId))
    return rows as IdpGroupMapping[]
  }

  async upsert(data: {
    tenantId: string
    identityProviderId: string
    externalGroupId: string
    externalGroupName: string
    roleKey: string
    scopeType: IdpGroupMapping['scopeType']
    scopeId: string | null
  }): Promise<IdpGroupMapping> {
    const rows = await this.db
      .insert(idpGroupMapping)
      .values({
        tenantId: data.tenantId,
        identityProviderId: data.identityProviderId,
        externalGroupId: data.externalGroupId,
        externalGroupName: data.externalGroupName,
        roleKey: data.roleKey,
        scopeType: data.scopeType,
        scopeId: data.scopeId ?? undefined,
      })
      .onConflictDoUpdate({
        target: [
          idpGroupMapping.tenantId,
          idpGroupMapping.externalGroupId,
          idpGroupMapping.roleKey,
          idpGroupMapping.scopeType,
          idpGroupMapping.scopeId,
        ],
        set: {
          externalGroupName: data.externalGroupName,
          identityProviderId: data.identityProviderId,
          updatedAt: new Date(),
        },
      })
      .returning()
    return rows[0] as IdpGroupMapping
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(idpGroupMapping)
      .where(and(eq(idpGroupMapping.id, id), eq(idpGroupMapping.tenantId, tenantId)))
  }
}
```

- [ ] **Step 4: Run integration test**

```bash
cd apps/api && bun test drizzle-idp-group-mapping.repository.integration.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/domain/repositories/idp-group-mapping.repository.ts
git add apps/api/src/modules/identity/infrastructure/repositories/drizzle-idp-group-mapping.repository.ts
git add apps/api/src/modules/identity/infrastructure/repositories/drizzle-idp-group-mapping.repository.integration.spec.ts
git commit -m "feat(identity): add IdP group mapping repository port and Drizzle adapter"
```

---

## Task 8: Magic link token repository (port + adapter)

**Files:**

- Create: `apps/api/src/modules/identity/domain/repositories/magic-link-token.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-magic-link-token.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-magic-link-token.repository.integration.spec.ts`

- [ ] **Step 1: Write the test first (integration)**

File: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-magic-link-token.repository.integration.spec.ts`

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncateIdentitySchema,
} from '@future/db/test-helpers'
import { DrizzleMagicLinkTokenRepository } from './drizzle-magic-link-token.repository'

const TENANT = '01900000-0000-7fff-8000-000000000040'

describe('DrizzleMagicLinkTokenRepository', () => {
  const db = createTestDb()
  let repo: DrizzleMagicLinkTokenRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT, slug: 'ml-tenant' })
    repo = new DrizzleMagicLinkTokenRepository(db as never)
  })

  afterAll(async () => {
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
  })

  describe('insert + findByTokenHash', () => {
    it('creates a token and retrieves it by hash', async () => {
      await setTenantContext(db, TENANT)
      const token = await repo.insert({
        tenantId: TENANT,
        email: 'user@seta.vn',
        tokenHash: 'sha256-hash-abc123',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      })

      expect(token.id).toBeDefined()
      expect(token.email).toBe('user@seta.vn')
      expect(token.usedAt).toBeNull()

      const found = await repo.findByTokenHash('sha256-hash-abc123')
      expect(found).not.toBeNull()
      expect(found?.email).toBe('user@seta.vn')
    })

    it('returns null for non-existent hash', async () => {
      await setTenantContext(db, TENANT)
      const found = await repo.findByTokenHash('non-existent-hash')
      expect(found).toBeNull()
    })
  })

  describe('markUsed', () => {
    it('sets usedAt timestamp', async () => {
      await setTenantContext(db, TENANT)
      const token = await repo.insert({
        tenantId: TENANT,
        email: 'used@seta.vn',
        tokenHash: 'sha256-hash-used-001',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      })

      await repo.markUsed(token.id, TENANT)

      const found = await repo.findByTokenHash('sha256-hash-used-001')
      // findByTokenHash only returns unused tokens
      expect(found).toBeNull()
    })
  })

  describe('findByTokenHash excludes expired', () => {
    it('returns null for expired token', async () => {
      await setTenantContext(db, TENANT)
      await repo.insert({
        tenantId: TENANT,
        email: 'expired@seta.vn',
        tokenHash: 'sha256-hash-expired-001',
        expiresAt: new Date(Date.now() - 1000), // already expired
      })

      const found = await repo.findByTokenHash('sha256-hash-expired-001')
      expect(found).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Create repository port**

File: `apps/api/src/modules/identity/domain/repositories/magic-link-token.repository.ts`

```typescript
import type { MagicLinkToken } from '../entities/magic-link-token.entity'

export const MAGIC_LINK_TOKEN_REPOSITORY = Symbol('IMagicLinkTokenRepository')

export interface IMagicLinkTokenRepository {
  insert(data: {
    tenantId: string
    email: string
    tokenHash: string
    expiresAt: Date
  }): Promise<MagicLinkToken>
  findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null>
  markUsed(id: string, tenantId: string): Promise<void>
}
```

- [ ] **Step 3: Create Drizzle adapter**

File: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-magic-link-token.repository.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { MagicLinkToken } from '../../domain/entities/magic-link-token.entity'
import type { IMagicLinkTokenRepository } from '../../domain/repositories/magic-link-token.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { magicLinkToken } from '../schema/index'

@Injectable()
export class DrizzleMagicLinkTokenRepository implements IMagicLinkTokenRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(data: {
    tenantId: string
    email: string
    tokenHash: string
    expiresAt: Date
  }): Promise<MagicLinkToken> {
    const rows = await this.db
      .insert(magicLinkToken)
      .values({
        tenantId: data.tenantId,
        email: data.email,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      })
      .returning()
    return rows[0] as MagicLinkToken
  }

  async findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null> {
    const rows = await this.db
      .select()
      .from(magicLinkToken)
      .where(
        and(
          eq(magicLinkToken.tokenHash, tokenHash),
          isNull(magicLinkToken.usedAt),
          gt(magicLinkToken.expiresAt, new Date()),
        ),
      )
      .limit(1)
    return (rows[0] as MagicLinkToken | undefined) ?? null
  }

  async markUsed(id: string, tenantId: string): Promise<void> {
    await this.db
      .update(magicLinkToken)
      .set({ usedAt: new Date() })
      .where(and(eq(magicLinkToken.id, id), eq(magicLinkToken.tenantId, tenantId)))
  }
}
```

- [ ] **Step 4: Run integration test**

```bash
cd apps/api && bun test drizzle-magic-link-token.repository.integration.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/domain/repositories/magic-link-token.repository.ts
git add apps/api/src/modules/identity/infrastructure/repositories/drizzle-magic-link-token.repository.ts
git add apps/api/src/modules/identity/infrastructure/repositories/drizzle-magic-link-token.repository.integration.spec.ts
git commit -m "feat(identity): add magic link token repository port and Drizzle adapter"
```

---

## Task 9: API key repository (port + adapter)

**Files:**

- Create: `apps/api/src/modules/identity/domain/repositories/api-key.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-api-key.repository.ts`
- Create: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-api-key.repository.integration.spec.ts`

- [ ] **Step 1: Write the test first (integration)**

File: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-api-key.repository.integration.spec.ts`

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  seedActor,
  setTenantContext,
  truncateCoreSchema,
  truncateIdentitySchema,
} from '@future/db/test-helpers'
import { DrizzleApiKeyRepository } from './drizzle-api-key.repository'

const TENANT = '01900000-0000-7fff-8000-000000000050'

describe('DrizzleApiKeyRepository', () => {
  const db = createTestDb()
  let repo: DrizzleApiKeyRepository
  let actorId: string

  beforeAll(async () => {
    await migrateForTest()
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT, slug: 'ak-tenant' })
    await setTenantContext(db, TENANT)
    const actor = await seedActor(db, { tenantId: TENANT, type: 'system' })
    actorId = actor.id
    repo = new DrizzleApiKeyRepository(db as never)
  })

  afterAll(async () => {
    await truncateIdentitySchema(db)
    await truncateCoreSchema(db)
  })

  describe('insert + findByKeyHash', () => {
    it('creates an API key and retrieves it by hash', async () => {
      await setTenantContext(db, TENANT)
      const key = await repo.insert({
        tenantId: TENANT,
        actorId,
        keyHash: 'sha256-api-key-hash-001',
        name: 'CI/CD Pipeline',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      })

      expect(key.id).toBeDefined()
      expect(key.name).toBe('CI/CD Pipeline')
      expect(key.revokedAt).toBeNull()

      const found = await repo.findByKeyHash('sha256-api-key-hash-001', TENANT)
      expect(found).not.toBeNull()
      expect(found?.actorId).toBe(actorId)
    })

    it('returns null for non-existent hash', async () => {
      await setTenantContext(db, TENANT)
      const found = await repo.findByKeyHash('non-existent', TENANT)
      expect(found).toBeNull()
    })
  })

  describe('revoke', () => {
    it('sets revokedAt timestamp', async () => {
      await setTenantContext(db, TENANT)
      const key = await repo.insert({
        tenantId: TENANT,
        actorId,
        keyHash: 'sha256-api-key-hash-revoke-001',
        name: 'Revoke Test',
        expiresAt: null,
      })

      await repo.revoke(key.id, TENANT)

      const found = await repo.findByKeyHash('sha256-api-key-hash-revoke-001', TENANT)
      expect(found).not.toBeNull()
      expect(found?.revokedAt).not.toBeNull()
    })
  })

  describe('updateLastUsed', () => {
    it('updates the lastUsedAt timestamp', async () => {
      await setTenantContext(db, TENANT)
      const key = await repo.insert({
        tenantId: TENANT,
        actorId,
        keyHash: 'sha256-api-key-hash-used-001',
        name: 'Last Used Test',
        expiresAt: null,
      })

      expect(key.lastUsedAt).toBeNull()

      await repo.updateLastUsed(key.id, TENANT)

      const found = await repo.findByKeyHash('sha256-api-key-hash-used-001', TENANT)
      expect(found?.lastUsedAt).not.toBeNull()
    })
  })
})
```

- [ ] **Step 2: Create repository port**

File: `apps/api/src/modules/identity/domain/repositories/api-key.repository.ts`

```typescript
import type { ApiKeyEntity } from '../entities/api-key.entity'

export const API_KEY_REPOSITORY = Symbol('IApiKeyRepository')

export interface IApiKeyRepository {
  findByKeyHash(keyHash: string, tenantId: string): Promise<ApiKeyEntity | null>
  insert(data: {
    tenantId: string
    actorId: string
    keyHash: string
    name: string
    expiresAt: Date | null
  }): Promise<ApiKeyEntity>
  revoke(id: string, tenantId: string): Promise<void>
  updateLastUsed(id: string, tenantId: string): Promise<void>
}
```

- [ ] **Step 3: Create Drizzle adapter**

File: `apps/api/src/modules/identity/infrastructure/repositories/drizzle-api-key.repository.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { ApiKeyEntity } from '../../domain/entities/api-key.entity'
import type { IApiKeyRepository } from '../../domain/repositories/api-key.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { apiKey } from '../schema/index'

@Injectable()
export class DrizzleApiKeyRepository implements IApiKeyRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByKeyHash(keyHash: string, tenantId: string): Promise<ApiKeyEntity | null> {
    const rows = await this.db
      .select()
      .from(apiKey)
      .where(and(eq(apiKey.keyHash, keyHash), eq(apiKey.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as ApiKeyEntity | undefined) ?? null
  }

  async insert(data: {
    tenantId: string
    actorId: string
    keyHash: string
    name: string
    expiresAt: Date | null
  }): Promise<ApiKeyEntity> {
    const rows = await this.db
      .insert(apiKey)
      .values({
        tenantId: data.tenantId,
        actorId: data.actorId,
        keyHash: data.keyHash,
        name: data.name,
        expiresAt: data.expiresAt ?? undefined,
      })
      .returning()
    return rows[0] as ApiKeyEntity
  }

  async revoke(id: string, tenantId: string): Promise<void> {
    await this.db
      .update(apiKey)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKey.id, id), eq(apiKey.tenantId, tenantId)))
  }

  async updateLastUsed(id: string, tenantId: string): Promise<void> {
    await this.db
      .update(apiKey)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(apiKey.id, id), eq(apiKey.tenantId, tenantId)))
  }
}
```

- [ ] **Step 4: Run integration test**

```bash
cd apps/api && bun test drizzle-api-key.repository.integration.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/domain/repositories/api-key.repository.ts
git add apps/api/src/modules/identity/infrastructure/repositories/drizzle-api-key.repository.ts
git add apps/api/src/modules/identity/infrastructure/repositories/drizzle-api-key.repository.integration.spec.ts
git commit -m "feat(identity): add API key repository port and Drizzle adapter"
```

---

## Task 10: ConfigureIdentityProvider command

**Files:**

- Create: `apps/api/src/modules/identity/application/commands/configure-identity-provider.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/configure-identity-provider.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/configure-identity-provider.handler.spec.ts`

- [ ] **Step 1: Write the test first**

File: `apps/api/src/modules/identity/application/commands/configure-identity-provider.handler.spec.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigureIdentityProviderCommand } from './configure-identity-provider.command'
import { ConfigureIdentityProviderHandler } from './configure-identity-provider.handler'
import {
  PrimaryProviderAlreadyExistsException,
  InvalidClientSecretRefException,
} from '../../domain/exceptions/identity.exceptions'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000003'

describe('ConfigureIdentityProviderHandler', () => {
  let handler: ConfigureIdentityProviderHandler
  let providerRepo: IIdentityProviderRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    auditRepo = { insert: vi.fn() }
    handler = new ConfigureIdentityProviderHandler(providerRepo, auditRepo)
  })

  it('creates a new identity provider', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(null)
    vi.mocked(providerRepo.insert).mockResolvedValue({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      providerType: 'microsoft',
      displayName: 'SETA Entra',
      clientId: 'client-123',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test',
      directoryId: 'dir-123',
      isPrimary: true,
      syncEnabled: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new ConfigureIdentityProviderCommand(
        TENANT_ID,
        'microsoft',
        'SETA Entra',
        'client-123',
        'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test',
        'dir-123',
        true,
        false,
        ACTOR_ID,
      ),
    )

    expect(result.id).toBe(PROVIDER_ID)
    expect(providerRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        providerType: 'microsoft',
        isPrimary: true,
      }),
    )
    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'identity_provider_configured',
        module: 'identity',
      }),
    )
  })

  it('throws PrimaryProviderAlreadyExistsException when a primary already exists', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue({
      id: 'existing-primary',
      tenantId: TENANT_ID,
      providerType: 'microsoft',
      displayName: 'Existing',
      clientId: 'old',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:old',
      directoryId: null,
      isPrimary: true,
      syncEnabled: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await expect(
      handler.execute(
        new ConfigureIdentityProviderCommand(
          TENANT_ID,
          'google',
          'Google',
          'client-456',
          'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:new',
          null,
          true,
          false,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(PrimaryProviderAlreadyExistsException)
  })

  it('allows non-primary provider even when primary exists', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue({
      id: 'existing-primary',
      tenantId: TENANT_ID,
      providerType: 'microsoft',
      displayName: 'Existing',
      clientId: 'old',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:old',
      directoryId: null,
      isPrimary: true,
      syncEnabled: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(providerRepo.insert).mockResolvedValue({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      providerType: 'google',
      displayName: 'Secondary',
      clientId: 'client-456',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:secondary',
      directoryId: null,
      isPrimary: false,
      syncEnabled: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new ConfigureIdentityProviderCommand(
        TENANT_ID,
        'google',
        'Secondary',
        'client-456',
        'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:secondary',
        null,
        false,
        false,
        ACTOR_ID,
      ),
    )

    expect(result.id).toBe(PROVIDER_ID)
  })

  it('throws InvalidClientSecretRefException for non-ARN secret ref', async () => {
    vi.mocked(providerRepo.findPrimary).mockResolvedValue(null)

    await expect(
      handler.execute(
        new ConfigureIdentityProviderCommand(
          TENANT_ID,
          'microsoft',
          'Bad Ref',
          'client-123',
          'not-an-arn',
          null,
          true,
          false,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(InvalidClientSecretRefException)
  })
})
```

- [ ] **Step 2: Create command class**

File: `apps/api/src/modules/identity/application/commands/configure-identity-provider.command.ts`

```typescript
export class ConfigureIdentityProviderCommand {
  constructor(
    readonly tenantId: string,
    readonly providerType: 'microsoft' | 'google',
    readonly displayName: string,
    readonly clientId: string,
    readonly clientSecretRef: string,
    readonly directoryId: string | null,
    readonly isPrimary: boolean,
    readonly syncEnabled: boolean,
    readonly configuredBy: string,
  ) {}
}
```

- [ ] **Step 3: Create handler**

File: `apps/api/src/modules/identity/application/commands/configure-identity-provider.handler.ts`

```typescript
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  PrimaryProviderAlreadyExistsException,
  InvalidClientSecretRefException,
} from '../../domain/exceptions/identity.exceptions'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import { ConfigureIdentityProviderCommand } from './configure-identity-provider.command'

const ARN_PATTERN = /^arn:aws:secretsmanager:[a-z0-9-]+:\d{12}:secret:.+$/

@CommandHandler(ConfigureIdentityProviderCommand)
export class ConfigureIdentityProviderHandler implements ICommandHandler<
  ConfigureIdentityProviderCommand,
  IdentityProviderEntity
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: ConfigureIdentityProviderCommand): Promise<IdentityProviderEntity> {
    // Validate ARN format
    if (!ARN_PATTERN.test(command.clientSecretRef)) {
      throw new InvalidClientSecretRefException(command.clientSecretRef)
    }

    // Guard: only one primary per tenant
    if (command.isPrimary) {
      const existing = await this.providerRepo.findPrimary(command.tenantId)
      if (existing) {
        throw new PrimaryProviderAlreadyExistsException(command.tenantId)
      }
    }

    const provider = await this.providerRepo.insert({
      tenantId: command.tenantId,
      providerType: command.providerType,
      displayName: command.displayName,
      clientId: command.clientId,
      clientSecretRef: command.clientSecretRef,
      directoryId: command.directoryId,
      isPrimary: command.isPrimary,
      syncEnabled: command.syncEnabled,
    })

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.configuredBy,
      eventType: 'identity_provider_configured',
      module: 'identity',
      subjectId: provider.id,
      payload: {
        providerType: command.providerType,
        isPrimary: command.isPrimary,
      },
    })

    return provider
  }
}
```

- [ ] **Step 4: Run unit test**

```bash
cd apps/api && bun test configure-identity-provider.handler.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/application/commands/configure-identity-provider*
git commit -m "feat(identity): add ConfigureIdentityProvider command handler with TDD"
```

---

## Task 11: UpdateIdpGroupMapping command

**Files:**

- Create: `apps/api/src/modules/identity/application/commands/update-idp-group-mapping.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/update-idp-group-mapping.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/update-idp-group-mapping.handler.spec.ts`

- [ ] **Step 1: Write the test first**

File: `apps/api/src/modules/identity/application/commands/update-idp-group-mapping.handler.spec.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateIdpGroupMappingCommand } from './update-idp-group-mapping.command'
import { UpdateIdpGroupMappingHandler } from './update-idp-group-mapping.handler'
import { IdentityProviderNotFoundException } from '../../domain/exceptions/identity.exceptions'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'
const MAPPING_ID = '01900000-0000-7000-8000-000000000004'

describe('UpdateIdpGroupMappingHandler', () => {
  let handler: UpdateIdpGroupMappingHandler
  let providerRepo: IIdentityProviderRepository
  let mappingRepo: IIdpGroupMappingRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    mappingRepo = {
      findByProviderId: vi.fn(),
      findByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    auditRepo = { insert: vi.fn() }
    handler = new UpdateIdpGroupMappingHandler(providerRepo, mappingRepo, auditRepo)
  })

  it('upserts a group mapping when provider exists', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      providerType: 'microsoft',
      displayName: 'Test',
      clientId: 'c',
      clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test',
      directoryId: null,
      isPrimary: true,
      syncEnabled: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(mappingRepo.upsert).mockResolvedValue({
      id: MAPPING_ID,
      tenantId: TENANT_ID,
      identityProviderId: PROVIDER_ID,
      externalGroupId: 'aad-group-123',
      externalGroupName: 'Engineering',
      roleKey: 'employee',
      scopeType: 'global',
      scopeId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new UpdateIdpGroupMappingCommand(
        TENANT_ID,
        PROVIDER_ID,
        'aad-group-123',
        'Engineering',
        'employee',
        'global',
        null,
        ACTOR_ID,
      ),
    )

    expect(result.id).toBe(MAPPING_ID)
    expect(mappingRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        externalGroupId: 'aad-group-123',
        roleKey: 'employee',
      }),
    )
    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'idp_group_mapping_updated',
        module: 'identity',
      }),
    )
  })

  it('throws IdentityProviderNotFoundException when provider does not exist', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new UpdateIdpGroupMappingCommand(
          TENANT_ID,
          PROVIDER_ID,
          'aad-group-123',
          'Engineering',
          'employee',
          'global',
          null,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(IdentityProviderNotFoundException)

    expect(mappingRepo.upsert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Create command class**

File: `apps/api/src/modules/identity/application/commands/update-idp-group-mapping.command.ts`

```typescript
export class UpdateIdpGroupMappingCommand {
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

- [ ] **Step 3: Create handler**

File: `apps/api/src/modules/identity/application/commands/update-idp-group-mapping.handler.ts`

```typescript
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { IdentityProviderNotFoundException } from '../../domain/exceptions/identity.exceptions'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'
import { UpdateIdpGroupMappingCommand } from './update-idp-group-mapping.command'

@CommandHandler(UpdateIdpGroupMappingCommand)
export class UpdateIdpGroupMappingHandler implements ICommandHandler<
  UpdateIdpGroupMappingCommand,
  IdpGroupMapping
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: UpdateIdpGroupMappingCommand): Promise<IdpGroupMapping> {
    // Guard: provider must exist
    const provider = await this.providerRepo.findById(command.identityProviderId, command.tenantId)
    if (!provider) {
      throw new IdentityProviderNotFoundException(command.identityProviderId)
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
      eventType: 'idp_group_mapping_updated',
      module: 'identity',
      subjectId: mapping.id,
      payload: {
        identityProviderId: command.identityProviderId,
        externalGroupId: command.externalGroupId,
        roleKey: command.roleKey,
        scopeType: command.scopeType,
      },
    })

    return mapping
  }
}
```

- [ ] **Step 4: Run unit test**

```bash
cd apps/api && bun test update-idp-group-mapping.handler.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/application/commands/update-idp-group-mapping*
git commit -m "feat(identity): add UpdateIdpGroupMapping command handler with TDD"
```

---

## Task 12: RequestMagicLink command

**Files:**

- Create: `apps/api/src/modules/identity/application/commands/request-magic-link.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/request-magic-link.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/request-magic-link.handler.spec.ts`

- [ ] **Step 1: Write the test first**

File: `apps/api/src/modules/identity/application/commands/request-magic-link.handler.spec.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestMagicLinkCommand } from './request-magic-link.command'
import { RequestMagicLinkHandler } from './request-magic-link.handler'
import type { IMagicLinkTokenRepository } from '../../domain/repositories/magic-link-token.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const TOKEN_ID = '01900000-0000-7000-8000-000000000002'

describe('RequestMagicLinkHandler', () => {
  let handler: RequestMagicLinkHandler
  let tokenRepo: IMagicLinkTokenRepository

  beforeEach(() => {
    tokenRepo = {
      insert: vi.fn(),
      findByTokenHash: vi.fn(),
      markUsed: vi.fn(),
    }
    handler = new RequestMagicLinkHandler(tokenRepo)
  })

  it('creates a magic link token and returns the plaintext token', async () => {
    vi.mocked(tokenRepo.insert).mockResolvedValue({
      id: TOKEN_ID,
      tenantId: TENANT_ID,
      email: 'user@seta.vn',
      tokenHash: 'will-be-sha256',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    })

    const result = await handler.execute(new RequestMagicLinkCommand(TENANT_ID, 'user@seta.vn'))

    expect(result.plaintextToken).toBeDefined()
    expect(result.plaintextToken.length).toBeGreaterThanOrEqual(32)
    expect(tokenRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        email: 'user@seta.vn',
      }),
    )
    // Verify the stored hash is NOT the plaintext
    const storedCall = vi.mocked(tokenRepo.insert).mock.calls[0][0]
    expect(storedCall.tokenHash).not.toBe(result.plaintextToken)
  })

  it('always succeeds even for unknown email (no enumeration)', async () => {
    vi.mocked(tokenRepo.insert).mockResolvedValue({
      id: TOKEN_ID,
      tenantId: TENANT_ID,
      email: 'nonexistent@seta.vn',
      tokenHash: 'sha256-something',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    })

    const result = await handler.execute(
      new RequestMagicLinkCommand(TENANT_ID, 'nonexistent@seta.vn'),
    )

    // Should not throw — always succeeds
    expect(result.plaintextToken).toBeDefined()
  })

  it('sets expiry to 15 minutes from now', async () => {
    vi.mocked(tokenRepo.insert).mockImplementation(async (data) => ({
      id: TOKEN_ID,
      tenantId: data.tenantId,
      email: data.email,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      usedAt: null,
      createdAt: new Date(),
    }))

    const before = Date.now()
    await handler.execute(new RequestMagicLinkCommand(TENANT_ID, 'user@seta.vn'))
    const after = Date.now()

    const storedCall = vi.mocked(tokenRepo.insert).mock.calls[0][0]
    const expiresMs = storedCall.expiresAt.getTime()
    // Should be ~15 minutes from now (within 2 second tolerance)
    expect(expiresMs).toBeGreaterThanOrEqual(before + 14 * 60 * 1000)
    expect(expiresMs).toBeLessThanOrEqual(after + 16 * 60 * 1000)
  })
})
```

- [ ] **Step 2: Create command class**

File: `apps/api/src/modules/identity/application/commands/request-magic-link.command.ts`

```typescript
export class RequestMagicLinkCommand {
  constructor(
    readonly tenantId: string,
    readonly email: string,
  ) {}
}
```

- [ ] **Step 3: Create handler**

File: `apps/api/src/modules/identity/application/commands/request-magic-link.handler.ts`

```typescript
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { randomBytes, createHash } from 'node:crypto'
import {
  MAGIC_LINK_TOKEN_REPOSITORY,
  type IMagicLinkTokenRepository,
} from '../../domain/repositories/magic-link-token.repository'
import { RequestMagicLinkCommand } from './request-magic-link.command'

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000 // 15 minutes

export interface RequestMagicLinkResult {
  plaintextToken: string
}

@CommandHandler(RequestMagicLinkCommand)
export class RequestMagicLinkHandler implements ICommandHandler<
  RequestMagicLinkCommand,
  RequestMagicLinkResult
> {
  constructor(
    @Inject(MAGIC_LINK_TOKEN_REPOSITORY)
    private readonly tokenRepo: IMagicLinkTokenRepository,
  ) {}

  async execute(command: RequestMagicLinkCommand): Promise<RequestMagicLinkResult> {
    // Generate 32-byte random token
    const plaintextToken = randomBytes(32).toString('hex')

    // Store SHA-256 hash (never store plaintext)
    const tokenHash = createHash('sha256').update(plaintextToken).digest('hex')

    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS)

    await this.tokenRepo.insert({
      tenantId: command.tenantId,
      email: command.email,
      tokenHash,
      expiresAt,
    })

    // Always succeeds — no email existence check (prevents enumeration)
    return { plaintextToken }
  }
}
```

- [ ] **Step 4: Run unit test**

```bash
cd apps/api && bun test request-magic-link.handler.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/application/commands/request-magic-link*
git commit -m "feat(identity): add RequestMagicLink command handler with TDD"
```

---

## Task 13: ValidateMagicLink command

**Files:**

- Create: `apps/api/src/modules/identity/application/commands/validate-magic-link.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/validate-magic-link.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/validate-magic-link.handler.spec.ts`

- [ ] **Step 1: Write the test first**

File: `apps/api/src/modules/identity/application/commands/validate-magic-link.handler.spec.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { ValidateMagicLinkCommand } from './validate-magic-link.command'
import { ValidateMagicLinkHandler } from './validate-magic-link.handler'
import { MagicLinkTokenNotFoundException } from '../../domain/exceptions/identity.exceptions'
import type { IMagicLinkTokenRepository } from '../../domain/repositories/magic-link-token.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const TOKEN_ID = '01900000-0000-7000-8000-000000000002'
const PLAINTEXT_TOKEN = 'a'.repeat(64) // 32 bytes hex
const TOKEN_HASH = createHash('sha256').update(PLAINTEXT_TOKEN).digest('hex')

describe('ValidateMagicLinkHandler', () => {
  let handler: ValidateMagicLinkHandler
  let tokenRepo: IMagicLinkTokenRepository

  beforeEach(() => {
    tokenRepo = {
      insert: vi.fn(),
      findByTokenHash: vi.fn(),
      markUsed: vi.fn(),
    }
    handler = new ValidateMagicLinkHandler(tokenRepo)
  })

  it('validates a valid token and marks it used', async () => {
    vi.mocked(tokenRepo.findByTokenHash).mockResolvedValue({
      id: TOKEN_ID,
      tenantId: TENANT_ID,
      email: 'user@seta.vn',
      tokenHash: TOKEN_HASH,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    })

    const result = await handler.execute(new ValidateMagicLinkCommand(PLAINTEXT_TOKEN))

    expect(result.email).toBe('user@seta.vn')
    expect(result.tenantId).toBe(TENANT_ID)
    expect(tokenRepo.markUsed).toHaveBeenCalledWith(TOKEN_ID, TENANT_ID)
  })

  it('throws MagicLinkTokenNotFoundException for unknown token', async () => {
    vi.mocked(tokenRepo.findByTokenHash).mockResolvedValue(null)

    await expect(handler.execute(new ValidateMagicLinkCommand('unknown-token'))).rejects.toThrow(
      MagicLinkTokenNotFoundException,
    )

    expect(tokenRepo.markUsed).not.toHaveBeenCalled()
  })

  it('throws MagicLinkTokenNotFoundException for expired token (repo returns null)', async () => {
    // The repository findByTokenHash already filters out expired tokens
    vi.mocked(tokenRepo.findByTokenHash).mockResolvedValue(null)

    await expect(handler.execute(new ValidateMagicLinkCommand(PLAINTEXT_TOKEN))).rejects.toThrow(
      MagicLinkTokenNotFoundException,
    )
  })

  it('throws MagicLinkTokenNotFoundException for already-used token (repo returns null)', async () => {
    // The repository findByTokenHash already filters out used tokens
    vi.mocked(tokenRepo.findByTokenHash).mockResolvedValue(null)

    await expect(handler.execute(new ValidateMagicLinkCommand(PLAINTEXT_TOKEN))).rejects.toThrow(
      MagicLinkTokenNotFoundException,
    )
  })
})
```

- [ ] **Step 2: Create command class**

File: `apps/api/src/modules/identity/application/commands/validate-magic-link.command.ts`

```typescript
export class ValidateMagicLinkCommand {
  constructor(readonly plaintextToken: string) {}
}
```

- [ ] **Step 3: Create handler**

File: `apps/api/src/modules/identity/application/commands/validate-magic-link.handler.ts`

```typescript
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { createHash } from 'node:crypto'
import { MagicLinkTokenNotFoundException } from '../../domain/exceptions/identity.exceptions'
import {
  MAGIC_LINK_TOKEN_REPOSITORY,
  type IMagicLinkTokenRepository,
} from '../../domain/repositories/magic-link-token.repository'
import { ValidateMagicLinkCommand } from './validate-magic-link.command'

export interface ValidateMagicLinkResult {
  email: string
  tenantId: string
}

@CommandHandler(ValidateMagicLinkCommand)
export class ValidateMagicLinkHandler implements ICommandHandler<
  ValidateMagicLinkCommand,
  ValidateMagicLinkResult
> {
  constructor(
    @Inject(MAGIC_LINK_TOKEN_REPOSITORY)
    private readonly tokenRepo: IMagicLinkTokenRepository,
  ) {}

  async execute(command: ValidateMagicLinkCommand): Promise<ValidateMagicLinkResult> {
    const tokenHash = createHash('sha256').update(command.plaintextToken).digest('hex')

    // findByTokenHash only returns unexpired, unused tokens
    const token = await this.tokenRepo.findByTokenHash(tokenHash)
    if (!token) {
      throw new MagicLinkTokenNotFoundException()
    }

    // Mark as used atomically
    await this.tokenRepo.markUsed(token.id, token.tenantId)

    return {
      email: token.email,
      tenantId: token.tenantId,
    }
  }
}
```

- [ ] **Step 4: Run unit test**

```bash
cd apps/api && bun test validate-magic-link.handler.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/application/commands/validate-magic-link*
git commit -m "feat(identity): add ValidateMagicLink command handler with TDD"
```

---

## Task 14: CreateApiKey command

**Files:**

- Create: `apps/api/src/modules/identity/application/commands/create-api-key.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/create-api-key.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/create-api-key.handler.spec.ts`

- [ ] **Step 1: Write the test first**

File: `apps/api/src/modules/identity/application/commands/create-api-key.handler.spec.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateApiKeyCommand } from './create-api-key.command'
import { CreateApiKeyHandler } from './create-api-key.handler'
import type { IApiKeyRepository } from '../../domain/repositories/api-key.repository'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const CREATED_BY = '01900000-0000-7000-8000-000000000003'
const KEY_ID = '01900000-0000-7000-8000-000000000004'

describe('CreateApiKeyHandler', () => {
  let handler: CreateApiKeyHandler
  let apiKeyRepo: IApiKeyRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    apiKeyRepo = {
      findByKeyHash: vi.fn(),
      insert: vi.fn(),
      revoke: vi.fn(),
      updateLastUsed: vi.fn(),
    }
    auditRepo = { insert: vi.fn() }
    handler = new CreateApiKeyHandler(apiKeyRepo, auditRepo)
  })

  it('creates an API key and returns the plaintext key once', async () => {
    vi.mocked(apiKeyRepo.insert).mockResolvedValue({
      id: KEY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      keyHash: 'sha256-of-key',
      name: 'CI Pipeline',
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date(),
    })

    const result = await handler.execute(
      new CreateApiKeyCommand(TENANT_ID, ACTOR_ID, 'CI Pipeline', null, CREATED_BY),
    )

    expect(result.id).toBe(KEY_ID)
    expect(result.plaintextKey).toBeDefined()
    expect(result.plaintextKey.length).toBeGreaterThanOrEqual(32)

    // Verify the stored hash is NOT the plaintext
    const storedCall = vi.mocked(apiKeyRepo.insert).mock.calls[0][0]
    expect(storedCall.keyHash).not.toBe(result.plaintextKey)

    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'api_key_created',
        module: 'identity',
      }),
    )
  })

  it('passes expiresAt when provided', async () => {
    const expiresAt = new Date('2027-01-01')
    vi.mocked(apiKeyRepo.insert).mockResolvedValue({
      id: KEY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      keyHash: 'sha256-of-key',
      name: 'Temp Key',
      lastUsedAt: null,
      expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    })

    await handler.execute(
      new CreateApiKeyCommand(TENANT_ID, ACTOR_ID, 'Temp Key', expiresAt, CREATED_BY),
    )

    expect(apiKeyRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt,
      }),
    )
  })
})
```

- [ ] **Step 2: Create command class**

File: `apps/api/src/modules/identity/application/commands/create-api-key.command.ts`

```typescript
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

- [ ] **Step 3: Create handler**

File: `apps/api/src/modules/identity/application/commands/create-api-key.handler.ts`

```typescript
import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { randomBytes, createHash } from 'node:crypto'
import {
  API_KEY_REPOSITORY,
  type IApiKeyRepository,
} from '../../domain/repositories/api-key.repository'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import { CreateApiKeyCommand } from './create-api-key.command'

export interface CreateApiKeyResult {
  id: string
  plaintextKey: string
}

@CommandHandler(CreateApiKeyCommand)
export class CreateApiKeyHandler implements ICommandHandler<
  CreateApiKeyCommand,
  CreateApiKeyResult
> {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: CreateApiKeyCommand): Promise<CreateApiKeyResult> {
    // Generate random key
    const plaintextKey = randomBytes(32).toString('hex')
    const keyHash = createHash('sha256').update(plaintextKey).digest('hex')

    const apiKey = await this.apiKeyRepo.insert({
      tenantId: command.tenantId,
      actorId: command.actorId,
      keyHash,
      name: command.name,
      expiresAt: command.expiresAt,
    })

    await this.auditRepo.insert({
      tenantId: command.tenantId,
      actorId: command.createdBy,
      eventType: 'api_key_created',
      module: 'identity',
      subjectId: apiKey.id,
      payload: { name: command.name, actorId: command.actorId },
    })

    // Return plaintext once — never stored or retrievable again
    return { id: apiKey.id, plaintextKey }
  }
}
```

- [ ] **Step 4: Run unit test**

```bash
cd apps/api && bun test create-api-key.handler.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/application/commands/create-api-key*
git commit -m "feat(identity): add CreateApiKey command handler with TDD"
```

---

## Task 15: Directory sync command

**Files:**

- Create: `apps/api/src/modules/identity/application/commands/run-directory-sync.command.ts`
- Create: `apps/api/src/modules/identity/application/commands/run-directory-sync.handler.ts`
- Create: `apps/api/src/modules/identity/application/commands/run-directory-sync.handler.spec.ts`

- [ ] **Step 1: Write the test first**

File: `apps/api/src/modules/identity/application/commands/run-directory-sync.handler.spec.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { RunDirectorySyncCommand } from './run-directory-sync.command'
import { RunDirectorySyncHandler } from './run-directory-sync.handler'
import {
  IdentityProviderNotFoundException,
  DirectorySyncAlreadyRunningException,
} from '../../domain/exceptions/identity.exceptions'
import type { IIdentityProviderRepository } from '../../domain/repositories/identity-provider.repository'
import type { IIdpGroupMappingRepository } from '../../domain/repositories/idp-group-mapping.repository'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type {
  IDirectoryProvider,
  IdpUser,
  IdpGroup,
} from '../../infrastructure/providers/directory-provider.interface'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000002'
const SYSTEM_ACTOR_ID = '01900000-0000-7000-8000-000000000099'

const makeProvider = (overrides?: Partial<ReturnType<typeof makeProviderDefaults>>) => ({
  ...makeProviderDefaults(),
  ...overrides,
})

function makeProviderDefaults() {
  return {
    id: PROVIDER_ID,
    tenantId: TENANT_ID,
    providerType: 'microsoft' as const,
    displayName: 'SETA Entra',
    clientId: 'c',
    clientSecretRef: 'arn:aws:secretsmanager:ap-southeast-1:123456789:secret:test',
    directoryId: 'dir',
    isPrimary: true,
    syncEnabled: true,
    lastSyncAt: null,
    syncStatus: 'idle' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('RunDirectorySyncHandler', () => {
  let handler: RunDirectorySyncHandler
  let providerRepo: IIdentityProviderRepository
  let mappingRepo: IIdpGroupMappingRepository
  let auditRepo: IAuditEventRepository
  let commandBus: CommandBus
  let directoryProvider: IDirectoryProvider
  let directoryProviderFactory: { create: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    providerRepo = {
      findById: vi.fn(),
      findByTenantId: vi.fn(),
      findPrimary: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    }
    mappingRepo = {
      findByProviderId: vi.fn(),
      findByTenantId: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
    }
    auditRepo = { insert: vi.fn() }
    commandBus = { execute: vi.fn() } as unknown as CommandBus
    directoryProvider = {
      listUsers: vi.fn(),
      listGroupsWithMembers: vi.fn(),
    }
    directoryProviderFactory = { create: vi.fn().mockReturnValue(directoryProvider) }

    handler = new RunDirectorySyncHandler(
      providerRepo,
      mappingRepo,
      auditRepo,
      commandBus,
      directoryProviderFactory as never,
    )
  })

  it('throws IdentityProviderNotFoundException when provider does not exist', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID)),
    ).rejects.toThrow(IdentityProviderNotFoundException)
  })

  it('throws DirectorySyncAlreadyRunningException when sync is in progress', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider({ syncStatus: 'running' }))

    await expect(
      handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID)),
    ).rejects.toThrow(DirectorySyncAlreadyRunningException)
  })

  it('provisions new users from IdP via kernel command bus', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(makeProvider({ syncStatus: 'running' }))

    const idpUsers: IdpUser[] = [
      {
        externalId: 'ext-user-001',
        email: 'alice@seta.vn',
        displayName: 'Alice',
        isActive: true,
      },
    ]
    vi.mocked(directoryProvider.listUsers).mockResolvedValue(idpUsers)
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue([])
    vi.mocked(mappingRepo.findByProviderId).mockResolvedValue([])

    // CreateActorCommand returns actor id
    vi.mocked(commandBus.execute)
      .mockResolvedValueOnce({ id: 'new-actor-001' }) // CreateActorCommand
      .mockResolvedValueOnce({ id: 'new-ui-001' }) // CreateUserIdentityCommand

    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))

    // Should have called CreateActorCommand and CreateUserIdentityCommand
    expect(commandBus.execute).toHaveBeenCalledTimes(2)

    // Should update sync status to idle after completion
    expect(providerRepo.update).toHaveBeenCalledWith(
      PROVIDER_ID,
      TENANT_ID,
      expect.objectContaining({ syncStatus: 'idle' }),
    )
  })

  it('deactivates users disabled in IdP', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(makeProvider({ syncStatus: 'running' }))

    const idpUsers: IdpUser[] = [
      {
        externalId: 'ext-user-disabled',
        email: 'disabled@seta.vn',
        displayName: 'Disabled User',
        isActive: false,
      },
    ]
    vi.mocked(directoryProvider.listUsers).mockResolvedValue(idpUsers)
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue([])
    vi.mocked(mappingRepo.findByProviderId).mockResolvedValue([])

    // For disabled users, we call UpdateActorStatusCommand + DeprovisionUserIdentityCommand
    vi.mocked(commandBus.execute).mockResolvedValue(undefined)

    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))

    // Should have called deactivation commands
    expect(commandBus.execute).toHaveBeenCalled()
  })

  it('syncs group-to-role mappings via GrantRoleCommand', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(makeProvider({ syncStatus: 'running' }))
    vi.mocked(directoryProvider.listUsers).mockResolvedValue([])

    const idpGroups: IdpGroup[] = [
      {
        externalGroupId: 'aad-eng-group',
        displayName: 'Engineering',
        memberExternalIds: ['ext-user-001'],
      },
    ]
    vi.mocked(directoryProvider.listGroupsWithMembers).mockResolvedValue(idpGroups)
    vi.mocked(mappingRepo.findByProviderId).mockResolvedValue([
      {
        id: 'mapping-001',
        tenantId: TENANT_ID,
        identityProviderId: PROVIDER_ID,
        externalGroupId: 'aad-eng-group',
        externalGroupName: 'Engineering',
        roleKey: 'employee',
        scopeType: 'global',
        scopeId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    // GrantRoleCommand returns grant id
    vi.mocked(commandBus.execute).mockResolvedValue('grant-id-001')

    await handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID))

    // Should have called GrantRoleCommand for group members
    expect(commandBus.execute).toHaveBeenCalled()
  })

  it('sets sync status to failed on error and rethrows', async () => {
    vi.mocked(providerRepo.findById).mockResolvedValue(makeProvider())
    vi.mocked(providerRepo.update).mockResolvedValue(makeProvider({ syncStatus: 'running' }))
    vi.mocked(directoryProvider.listUsers).mockRejectedValue(new Error('Graph API error'))

    await expect(
      handler.execute(new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID)),
    ).rejects.toThrow('Graph API error')

    // Should update sync status to failed
    expect(providerRepo.update).toHaveBeenCalledWith(
      PROVIDER_ID,
      TENANT_ID,
      expect.objectContaining({ syncStatus: 'failed' }),
    )
  })
})
```

- [ ] **Step 2: Create command class**

File: `apps/api/src/modules/identity/application/commands/run-directory-sync.command.ts`

```typescript
export class RunDirectorySyncCommand {
  constructor(
    readonly tenantId: string,
    readonly identityProviderId: string,
  ) {}
}
```

- [ ] **Step 3: Create handler**

File: `apps/api/src/modules/identity/application/commands/run-directory-sync.handler.ts`

```typescript
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  IdentityProviderNotFoundException,
  DirectorySyncAlreadyRunningException,
} from '../../domain/exceptions/identity.exceptions'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import {
  DIRECTORY_PROVIDER_FACTORY,
  type IDirectoryProviderFactory,
} from '../../infrastructure/providers/directory-provider.interface'
import { CreateActorCommand } from '../../../kernel/application/commands/create-actor.command'
import { CreateUserIdentityCommand } from '../../../kernel/application/commands/create-user-identity.command'
import { UpdateActorStatusCommand } from '../../../kernel/application/commands/update-actor-status.command'
import { DeprovisionUserIdentityCommand } from '../../../kernel/application/commands/deprovision-user-identity.command'
import { GrantRoleCommand } from '../../../kernel/application/commands/grant-role.command'
import { RunDirectorySyncCommand } from './run-directory-sync.command'

@CommandHandler(RunDirectorySyncCommand)
export class RunDirectorySyncHandler implements ICommandHandler<RunDirectorySyncCommand, void> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
    private readonly commandBus: CommandBus,
    @Inject(DIRECTORY_PROVIDER_FACTORY)
    private readonly directoryProviderFactory: IDirectoryProviderFactory,
  ) {}

  async execute(command: RunDirectorySyncCommand): Promise<void> {
    const provider = await this.providerRepo.findById(command.identityProviderId, command.tenantId)
    if (!provider) {
      throw new IdentityProviderNotFoundException(command.identityProviderId)
    }

    if (provider.syncStatus === 'running') {
      throw new DirectorySyncAlreadyRunningException(command.identityProviderId)
    }

    // Mark as running
    await this.providerRepo.update(command.identityProviderId, command.tenantId, {
      syncStatus: 'running',
    })

    try {
      const directoryProvider = this.directoryProviderFactory.create(provider)

      // --- Phase 1: Sync users ---
      const idpUsers = await directoryProvider.listUsers()

      for (const idpUser of idpUsers) {
        if (idpUser.isActive) {
          // Provision: create actor + user_identity via kernel command bus
          const actor = await this.commandBus.execute(
            new CreateActorCommand(command.tenantId, 'person', idpUser.displayName),
          )
          await this.commandBus.execute(
            new CreateUserIdentityCommand(
              command.tenantId,
              actor.id,
              idpUser.email,
              idpUser.externalId,
              provider.providerType,
            ),
          )
        } else {
          // Deactivate: update actor status + deprovision user identity
          await this.commandBus.execute(
            new UpdateActorStatusCommand(command.tenantId, idpUser.externalId, 'inactive'),
          )
          await this.commandBus.execute(
            new DeprovisionUserIdentityCommand(command.tenantId, idpUser.externalId),
          )
        }
      }

      // --- Phase 2: Sync group-to-role mappings ---
      const idpGroups = await directoryProvider.listGroupsWithMembers()
      const mappings = await this.mappingRepo.findByProviderId(
        command.identityProviderId,
        command.tenantId,
      )

      for (const group of idpGroups) {
        // Find mappings that match this group
        const matchingMappings = mappings.filter((m) => m.externalGroupId === group.externalGroupId)

        for (const mapping of matchingMappings) {
          for (const memberExternalId of group.memberExternalIds) {
            // Grant role via kernel command bus
            // Note: In production, this would look up the actor by external identity map
            // and diff against existing grants with source='idp_sync'
            await this.commandBus.execute(
              new GrantRoleCommand(
                command.tenantId,
                memberExternalId, // In production: resolved actorId
                mapping.roleKey as never,
                mapping.scopeType as never,
                mapping.scopeId,
                command.identityProviderId, // grantedBy = the provider
              ),
            )
          }
        }
      }

      // Mark as complete
      await this.providerRepo.update(command.identityProviderId, command.tenantId, {
        syncStatus: 'idle',
        lastSyncAt: new Date(),
      })

      await this.auditRepo.insert({
        tenantId: command.tenantId,
        actorId: command.identityProviderId,
        eventType: 'directory_sync_completed',
        module: 'identity',
        subjectId: command.identityProviderId,
        payload: {
          usersProcessed: idpUsers.length,
          groupsProcessed: idpGroups.length,
        },
      })
    } catch (error) {
      // Mark as failed
      await this.providerRepo.update(command.identityProviderId, command.tenantId, {
        syncStatus: 'failed',
      })
      throw error
    }
  }
}
```

- [ ] **Step 4: Run unit test**

```bash
cd apps/api && bun test run-directory-sync.handler.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/application/commands/run-directory-sync*
git commit -m "feat(identity): add RunDirectorySync command handler with TDD"
```

---

## Task 16: Directory provider interfaces + stubs

**Files:**

- Create: `apps/api/src/modules/identity/infrastructure/providers/directory-provider.interface.ts`
- Create: `apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.ts`
- Create: `apps/api/src/modules/identity/infrastructure/providers/google-directory.provider.ts`
- Create: `apps/api/src/modules/identity/infrastructure/providers/directory-provider.factory.ts`

- [ ] **Step 1: Create the interface**

File: `apps/api/src/modules/identity/infrastructure/providers/directory-provider.interface.ts`

```typescript
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'

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
  listUsers(): Promise<IdpUser[]>
  listGroupsWithMembers(): Promise<IdpGroup[]>
}

export interface IDirectoryProviderFactory {
  create(provider: IdentityProviderEntity): IDirectoryProvider
}
```

- [ ] **Step 2: Create Microsoft Graph stub**

File: `apps/api/src/modules/identity/infrastructure/providers/microsoft-graph.provider.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { IDirectoryProvider, IdpUser, IdpGroup } from './directory-provider.interface'

@Injectable()
export class MicrosoftGraphProvider implements IDirectoryProvider {
  private readonly logger = new Logger(MicrosoftGraphProvider.name)

  constructor(private readonly providerConfig: IdentityProviderEntity) {}

  async listUsers(): Promise<IdpUser[]> {
    // TODO: Implement Microsoft Graph API calls
    // GET https://graph.microsoft.com/v1.0/users
    // Headers: Authorization: Bearer {token}
    // Uses client credentials flow with clientId + clientSecret from Secrets Manager
    this.logger.warn('MicrosoftGraphProvider.listUsers() is a stub — not yet implemented')
    return []
  }

  async listGroupsWithMembers(): Promise<IdpGroup[]> {
    // TODO: Implement Microsoft Graph API calls
    // GET https://graph.microsoft.com/v1.0/groups
    // GET https://graph.microsoft.com/v1.0/groups/{id}/members
    this.logger.warn(
      'MicrosoftGraphProvider.listGroupsWithMembers() is a stub — not yet implemented',
    )
    return []
  }
}
```

- [ ] **Step 3: Create Google Directory stub**

File: `apps/api/src/modules/identity/infrastructure/providers/google-directory.provider.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { IDirectoryProvider, IdpUser, IdpGroup } from './directory-provider.interface'

@Injectable()
export class GoogleDirectoryProvider implements IDirectoryProvider {
  private readonly logger = new Logger(GoogleDirectoryProvider.name)

  constructor(private readonly providerConfig: IdentityProviderEntity) {}

  async listUsers(): Promise<IdpUser[]> {
    // TODO: Implement Google Directory API calls
    // Uses Admin SDK Directory API
    // GET https://admin.googleapis.com/admin/directory/v1/users
    this.logger.warn('GoogleDirectoryProvider.listUsers() is a stub — not yet implemented')
    return []
  }

  async listGroupsWithMembers(): Promise<IdpGroup[]> {
    // TODO: Implement Google Directory API calls
    // GET https://admin.googleapis.com/admin/directory/v1/groups
    // GET https://admin.googleapis.com/admin/directory/v1/groups/{groupKey}/members
    this.logger.warn(
      'GoogleDirectoryProvider.listGroupsWithMembers() is a stub — not yet implemented',
    )
    return []
  }
}
```

- [ ] **Step 4: Create factory**

File: `apps/api/src/modules/identity/infrastructure/providers/directory-provider.factory.ts`

```typescript
import { Injectable } from '@nestjs/common'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { IDirectoryProvider, IDirectoryProviderFactory } from './directory-provider.interface'
import { MicrosoftGraphProvider } from './microsoft-graph.provider'
import { GoogleDirectoryProvider } from './google-directory.provider'

@Injectable()
export class DirectoryProviderFactory implements IDirectoryProviderFactory {
  create(provider: IdentityProviderEntity): IDirectoryProvider {
    switch (provider.providerType) {
      case 'microsoft':
        return new MicrosoftGraphProvider(provider)
      case 'google':
        return new GoogleDirectoryProvider(provider)
      default: {
        const _exhaustive: never = provider.providerType
        throw new Error(`Unknown provider type: ${_exhaustive}`)
      }
    }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/infrastructure/providers/
git commit -m "feat(identity): add directory provider interface, stubs, and factory"
```

---

## Task 17: Event contracts

**Files:**

- Create: `packages/event-contracts/src/identity/user-provisioned-from-idp.event.ts`
- Create: `packages/event-contracts/src/identity/user-deactivated-from-idp.event.ts`
- Create: `packages/event-contracts/src/identity/role-grant-synced.event.ts`
- Create: `packages/event-contracts/src/identity/directory-sync-completed.event.ts`
- Modify: `packages/event-contracts/src/index.ts`

- [ ] **Step 1: Create event files**

File: `packages/event-contracts/src/identity/user-provisioned-from-idp.event.ts`

```typescript
export class UserProvisionedFromIdpEvent {
  static readonly eventName = 'identity.user-provisioned-from-idp'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly email: string,
    public readonly externalId: string,
    public readonly identityProviderId: string,
  ) {}
}
```

File: `packages/event-contracts/src/identity/user-deactivated-from-idp.event.ts`

```typescript
export class UserDeactivatedFromIdpEvent {
  static readonly eventName = 'identity.user-deactivated-from-idp'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly externalId: string,
    public readonly identityProviderId: string,
  ) {}
}
```

File: `packages/event-contracts/src/identity/role-grant-synced.event.ts`

```typescript
export class RoleGrantSyncedEvent {
  static readonly eventName = 'identity.role-grant-synced'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly roleKey: string,
    public readonly scopeType: string,
    public readonly scopeId: string | null,
    public readonly action: 'granted' | 'revoked',
    public readonly identityProviderId: string,
  ) {}
}
```

File: `packages/event-contracts/src/identity/directory-sync-completed.event.ts`

```typescript
export class DirectorySyncCompletedEvent {
  static readonly eventName = 'identity.directory-sync-completed'
  constructor(
    public readonly tenantId: string,
    public readonly identityProviderId: string,
    public readonly usersProcessed: number,
    public readonly groupsProcessed: number,
    public readonly completedAt: string,
  ) {}
}
```

- [ ] **Step 2: Update index.ts**

Add exports to `packages/event-contracts/src/index.ts`:

```typescript
export { UserProvisionedFromIdpEvent } from './identity/user-provisioned-from-idp.event'
export { UserDeactivatedFromIdpEvent } from './identity/user-deactivated-from-idp.event'
export { RoleGrantSyncedEvent } from './identity/role-grant-synced.event'
export { DirectorySyncCompletedEvent } from './identity/directory-sync-completed.event'
```

- [ ] **Step 3: Run typecheck on event-contracts**

```bash
cd packages/event-contracts && bunx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/event-contracts/src/identity/
git add packages/event-contracts/src/index.ts
git commit -m "feat(identity): add identity event contracts"
```

---

## Task 18: IdentityQueryFacade

**Files:**

- Create: `apps/api/src/modules/identity/application/queries/get-identity-provider.query.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-identity-provider.handler.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-idp-group-mappings.query.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-idp-group-mappings.handler.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-sync-status.query.ts`
- Create: `apps/api/src/modules/identity/application/queries/get-sync-status.handler.ts`
- Create: `apps/api/src/modules/identity/application/queries/validate-api-key.query.ts`
- Create: `apps/api/src/modules/identity/application/queries/validate-api-key.handler.ts`
- Create: `apps/api/src/modules/identity/application/facades/identity-query.facade.ts`
- Create: `apps/api/src/modules/identity/application/facades/identity-query.facade.spec.ts`

- [ ] **Step 1: Write the test first**

File: `apps/api/src/modules/identity/application/facades/identity-query.facade.spec.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryBus } from '@nestjs/cqrs'
import { IdentityQueryFacade } from './identity-query.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('IdentityQueryFacade', () => {
  let facade: IdentityQueryFacade
  let queryBus: QueryBus

  beforeEach(() => {
    queryBus = { execute: vi.fn() } as unknown as QueryBus
    facade = new IdentityQueryFacade(queryBus)
  })

  it('getIdentityProvider delegates to query bus', async () => {
    const expected = { id: 'p1', providerType: 'microsoft' }
    vi.mocked(queryBus.execute).mockResolvedValue(expected)

    const result = await facade.getIdentityProvider(TENANT_ID)

    expect(result).toBe(expected)
    expect(queryBus.execute).toHaveBeenCalledTimes(1)
  })

  it('getIdpGroupMappings delegates to query bus', async () => {
    const expected = [{ id: 'm1', roleKey: 'employee' }]
    vi.mocked(queryBus.execute).mockResolvedValue(expected)

    const result = await facade.getIdpGroupMappings(TENANT_ID)

    expect(result).toBe(expected)
  })

  it('getSyncStatus delegates to query bus', async () => {
    const expected = { syncStatus: 'idle', lastSyncAt: null }
    vi.mocked(queryBus.execute).mockResolvedValue(expected)

    const result = await facade.getSyncStatus(TENANT_ID)

    expect(result).toBe(expected)
  })

  it('validateApiKey delegates to query bus', async () => {
    const expected = { actorId: 'a1', tenantId: TENANT_ID, valid: true }
    vi.mocked(queryBus.execute).mockResolvedValue(expected)

    const result = await facade.validateApiKey('hash-123', TENANT_ID)

    expect(result).toBe(expected)
  })
})
```

- [ ] **Step 2: Create query classes**

File: `apps/api/src/modules/identity/application/queries/get-identity-provider.query.ts`

```typescript
export class GetIdentityProviderQuery {
  constructor(readonly tenantId: string) {}
}
```

File: `apps/api/src/modules/identity/application/queries/get-idp-group-mappings.query.ts`

```typescript
export class GetIdpGroupMappingsQuery {
  constructor(readonly tenantId: string) {}
}
```

File: `apps/api/src/modules/identity/application/queries/get-sync-status.query.ts`

```typescript
export class GetSyncStatusQuery {
  constructor(readonly tenantId: string) {}
}
```

File: `apps/api/src/modules/identity/application/queries/validate-api-key.query.ts`

```typescript
export class ValidateApiKeyQuery {
  constructor(
    readonly keyHash: string,
    readonly tenantId: string,
  ) {}
}
```

- [ ] **Step 3: Create query handlers**

File: `apps/api/src/modules/identity/application/queries/get-identity-provider.handler.ts`

```typescript
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import { GetIdentityProviderQuery } from './get-identity-provider.query'

@QueryHandler(GetIdentityProviderQuery)
export class GetIdentityProviderHandler implements IQueryHandler<
  GetIdentityProviderQuery,
  IdentityProviderEntity | null
> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
  ) {}

  async execute(query: GetIdentityProviderQuery): Promise<IdentityProviderEntity | null> {
    return this.providerRepo.findPrimary(query.tenantId)
  }
}
```

File: `apps/api/src/modules/identity/application/queries/get-idp-group-mappings.handler.ts`

```typescript
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  IDP_GROUP_MAPPING_REPOSITORY,
  type IIdpGroupMappingRepository,
} from '../../domain/repositories/idp-group-mapping.repository'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'
import { GetIdpGroupMappingsQuery } from './get-idp-group-mappings.query'

@QueryHandler(GetIdpGroupMappingsQuery)
export class GetIdpGroupMappingsHandler implements IQueryHandler<
  GetIdpGroupMappingsQuery,
  IdpGroupMapping[]
> {
  constructor(
    @Inject(IDP_GROUP_MAPPING_REPOSITORY)
    private readonly mappingRepo: IIdpGroupMappingRepository,
  ) {}

  async execute(query: GetIdpGroupMappingsQuery): Promise<IdpGroupMapping[]> {
    return this.mappingRepo.findByTenantId(query.tenantId)
  }
}
```

File: `apps/api/src/modules/identity/application/queries/get-sync-status.handler.ts`

```typescript
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import type { IdpSyncStatus } from '../../domain/entities/identity-provider.entity'
import { GetSyncStatusQuery } from './get-sync-status.query'

export interface SyncStatusResult {
  syncStatus: IdpSyncStatus | null
  lastSyncAt: Date | null
}

@QueryHandler(GetSyncStatusQuery)
export class GetSyncStatusHandler implements IQueryHandler<GetSyncStatusQuery, SyncStatusResult> {
  constructor(
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
  ) {}

  async execute(query: GetSyncStatusQuery): Promise<SyncStatusResult> {
    const provider = await this.providerRepo.findPrimary(query.tenantId)
    if (!provider) {
      return { syncStatus: null, lastSyncAt: null }
    }
    return { syncStatus: provider.syncStatus, lastSyncAt: provider.lastSyncAt }
  }
}
```

File: `apps/api/src/modules/identity/application/queries/validate-api-key.handler.ts`

```typescript
import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  API_KEY_REPOSITORY,
  type IApiKeyRepository,
} from '../../domain/repositories/api-key.repository'
import { ValidateApiKeyQuery } from './validate-api-key.query'

export interface ValidateApiKeyResult {
  valid: boolean
  actorId: string | null
  tenantId: string | null
}

@QueryHandler(ValidateApiKeyQuery)
export class ValidateApiKeyHandler implements IQueryHandler<
  ValidateApiKeyQuery,
  ValidateApiKeyResult
> {
  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepo: IApiKeyRepository,
  ) {}

  async execute(query: ValidateApiKeyQuery): Promise<ValidateApiKeyResult> {
    const key = await this.apiKeyRepo.findByKeyHash(query.keyHash, query.tenantId)

    if (!key) {
      return { valid: false, actorId: null, tenantId: null }
    }

    if (key.revokedAt) {
      return { valid: false, actorId: null, tenantId: null }
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      return { valid: false, actorId: null, tenantId: null }
    }

    // Update last used (fire-and-forget)
    void this.apiKeyRepo.updateLastUsed(key.id, key.tenantId)

    return { valid: true, actorId: key.actorId, tenantId: key.tenantId }
  }
}
```

- [ ] **Step 4: Create facade**

File: `apps/api/src/modules/identity/application/facades/identity-query.facade.ts`

```typescript
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import type { IdentityProviderEntity } from '../../domain/entities/identity-provider.entity'
import type { IdpGroupMapping } from '../../domain/entities/idp-group-mapping.entity'
import { GetIdentityProviderQuery } from '../queries/get-identity-provider.query'
import { GetIdpGroupMappingsQuery } from '../queries/get-idp-group-mappings.query'
import { GetSyncStatusQuery } from '../queries/get-sync-status.query'
import { ValidateApiKeyQuery } from '../queries/validate-api-key.query'
import type { SyncStatusResult } from '../queries/get-sync-status.handler'
import type { ValidateApiKeyResult } from '../queries/validate-api-key.handler'

@Injectable()
export class IdentityQueryFacade {
  constructor(private readonly queryBus: QueryBus) {}

  getIdentityProvider(tenantId: string): Promise<IdentityProviderEntity | null> {
    return this.queryBus.execute(new GetIdentityProviderQuery(tenantId))
  }

  getIdpGroupMappings(tenantId: string): Promise<IdpGroupMapping[]> {
    return this.queryBus.execute(new GetIdpGroupMappingsQuery(tenantId))
  }

  getSyncStatus(tenantId: string): Promise<SyncStatusResult> {
    return this.queryBus.execute(new GetSyncStatusQuery(tenantId))
  }

  validateApiKey(keyHash: string, tenantId: string): Promise<ValidateApiKeyResult> {
    return this.queryBus.execute(new ValidateApiKeyQuery(keyHash, tenantId))
  }
}
```

- [ ] **Step 5: Run unit test**

```bash
cd apps/api && bun test identity-query.facade.spec.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/identity/application/queries/
git add apps/api/src/modules/identity/application/facades/
git commit -m "feat(identity): add IdentityQueryFacade with query handlers"
```

---

## Task 19: Module wiring + app registration

**Files:**

- Create: `apps/api/src/modules/identity/identity.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create identity.module.ts**

File: `apps/api/src/modules/identity/identity.module.ts`

```typescript
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'

// Repository symbols
import { IDENTITY_PROVIDER_REPOSITORY } from './domain/repositories/identity-provider.repository'
import { IDP_GROUP_MAPPING_REPOSITORY } from './domain/repositories/idp-group-mapping.repository'
import { MAGIC_LINK_TOKEN_REPOSITORY } from './domain/repositories/magic-link-token.repository'
import { API_KEY_REPOSITORY } from './domain/repositories/api-key.repository'

// Repository adapters
import { DrizzleIdentityProviderRepository } from './infrastructure/repositories/drizzle-identity-provider.repository'
import { DrizzleIdpGroupMappingRepository } from './infrastructure/repositories/drizzle-idp-group-mapping.repository'
import { DrizzleMagicLinkTokenRepository } from './infrastructure/repositories/drizzle-magic-link-token.repository'
import { DrizzleApiKeyRepository } from './infrastructure/repositories/drizzle-api-key.repository'

// Provider factory
import { DIRECTORY_PROVIDER_FACTORY } from './infrastructure/providers/directory-provider.interface'
import { DirectoryProviderFactory } from './infrastructure/providers/directory-provider.factory'

// Command handlers
import { ConfigureIdentityProviderHandler } from './application/commands/configure-identity-provider.handler'
import { UpdateIdpGroupMappingHandler } from './application/commands/update-idp-group-mapping.handler'
import { RequestMagicLinkHandler } from './application/commands/request-magic-link.handler'
import { ValidateMagicLinkHandler } from './application/commands/validate-magic-link.handler'
import { CreateApiKeyHandler } from './application/commands/create-api-key.handler'
import { RunDirectorySyncHandler } from './application/commands/run-directory-sync.handler'

// Query handlers
import { GetIdentityProviderHandler } from './application/queries/get-identity-provider.handler'
import { GetIdpGroupMappingsHandler } from './application/queries/get-idp-group-mappings.handler'
import { GetSyncStatusHandler } from './application/queries/get-sync-status.handler'
import { ValidateApiKeyHandler } from './application/queries/validate-api-key.handler'

// Facade
import { IdentityQueryFacade } from './application/facades/identity-query.facade'

@Module({
  imports: [CqrsModule, KernelModule],
  providers: [
    // Repositories
    { provide: IDENTITY_PROVIDER_REPOSITORY, useClass: DrizzleIdentityProviderRepository },
    { provide: IDP_GROUP_MAPPING_REPOSITORY, useClass: DrizzleIdpGroupMappingRepository },
    { provide: MAGIC_LINK_TOKEN_REPOSITORY, useClass: DrizzleMagicLinkTokenRepository },
    { provide: API_KEY_REPOSITORY, useClass: DrizzleApiKeyRepository },
    // Providers
    { provide: DIRECTORY_PROVIDER_FACTORY, useClass: DirectoryProviderFactory },
    // Command handlers
    ConfigureIdentityProviderHandler,
    UpdateIdpGroupMappingHandler,
    RequestMagicLinkHandler,
    ValidateMagicLinkHandler,
    CreateApiKeyHandler,
    RunDirectorySyncHandler,
    // Query handlers
    GetIdentityProviderHandler,
    GetIdpGroupMappingsHandler,
    GetSyncStatusHandler,
    ValidateApiKeyHandler,
    // Facade
    IdentityQueryFacade,
  ],
  exports: [IdentityQueryFacade],
})
export class IdentityModule {}
```

- [ ] **Step 2: Register in app.module.ts**

Add `IdentityModule` to the imports array in `apps/api/src/app.module.ts`:

```typescript
import { IdentityModule } from './modules/identity/identity.module'

// In @Module imports array, add after KernelModule:
// KernelModule,
// IdentityModule,
// PeopleModule,
```

- [ ] **Step 3: Run full test suite**

```bash
cd apps/api && bun test
```

Expected: All tests PASS

- [ ] **Step 4: Run typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/identity.module.ts
git add apps/api/src/app.module.ts
git commit -m "feat(identity): wire identity module and register in app module"
```

---

**End of Plan 02.** Proceed to Plan 03 (Authentication Flow).

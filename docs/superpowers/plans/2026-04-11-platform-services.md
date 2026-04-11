# Platform Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 4 reusable packages (storage, activity-log, mail, documents) and 2 domain modules (notifications, documents) that provide production-ready AaaS infrastructure for email, file storage, activity logging, PDF/Excel generation, and in-app notifications.

**Architecture:** Pure TS packages in `packages/` (zero NestJS) consumed by hexagonal domain modules in `apps/api/src/modules/`. Packages are created via `turbo gen workspace`. Each package follows the `@future/*` naming convention, extends `@future/tsconfig/base.json`, and uses vitest for testing. Domain modules follow existing hexagonal DDD layout with Drizzle schema, CQRS handlers, and tRPC routers.

**Tech Stack:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-sesv2`, `nodemailer`, `mjml`, `handlebars`, `pdf-parse`, `puppeteer-core`, `@sparticuz/chromium`, `exceljs`, `ioredis` (SSE pub/sub)

**Spec:** `docs/superpowers/specs/2026-04-11-platform-services-design.md`

---

## Phase 1: Packages (no inter-dependencies, parallelizable)

---

### Task 1: Scaffold `packages/storage`

**Files:**

- Create: `packages/storage/package.json`
- Create: `packages/storage/tsconfig.json`
- Create: `packages/storage/eslint.config.ts`
- Create: `packages/storage/src/index.ts`
- Create: `packages/storage/src/types.ts`
- Create: `packages/storage/src/s3-storage-client.ts`
- Create: `packages/storage/src/key-builder.ts`
- Test: `packages/storage/src/__tests__/key-builder.spec.ts`
- Test: `packages/storage/src/__tests__/s3-storage-client.spec.ts`

- [ ] **Step 1: Create workspace via turbo gen**

Run from repo root:

```bash
bunx turbo gen workspace --name @future/storage --type package --directory packages/storage
```

- [ ] **Step 2: Add AWS S3 dependencies**

```bash
cd packages/storage && bun add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 3: Add dev dependencies**

```bash
cd packages/storage && bun add -d @future/eslint-config @future/tsconfig vitest typescript eslint
```

- [ ] **Step 4: Configure tsconfig.json**

Replace `packages/storage/tsconfig.json` with:

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.spec.ts"]
}
```

- [ ] **Step 5: Configure eslint.config.ts**

Replace `packages/storage/eslint.config.ts` with:

```ts
import base from '@future/eslint-config/base'
import type { Linter } from 'eslint'

const config: Linter.Config[] = [
  ...base,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]

export default config
```

- [ ] **Step 6: Update package.json exports and scripts**

Replace `packages/storage/package.json` with:

```json
{
  "name": "@future/storage",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3",
    "@aws-sdk/s3-request-presigner": "^3"
  },
  "devDependencies": {
    "@future/eslint-config": "workspace:*",
    "@future/tsconfig": "*",
    "eslint": "^10.2.0",
    "typescript": "^6.0.2",
    "vitest": "^4"
  }
}
```

- [ ] **Step 7: Write types.ts**

Create `packages/storage/src/types.ts`:

```ts
export interface StorageConfig {
  bucket: string
  region: string
}

export interface UploadOpts {
  contentType: string
  maxSizeBytes: number
  /** Presigned URL TTL in seconds. Default 900. */
  expiresIn?: number
}

export interface PresignedUrl {
  url: string
  expiresAt: Date
}

export interface ObjectMeta {
  key: string
  size: number
  contentType: string
  lastModified: Date
}

export interface StorageClient {
  getUploadUrl(key: string, opts: UploadOpts): Promise<PresignedUrl>
  getDownloadUrl(key: string, expiresIn?: number): Promise<PresignedUrl>
  deleteObject(key: string): Promise<void>
  headObject(key: string): Promise<ObjectMeta | null>
}
```

- [ ] **Step 8: Write the failing test for key-builder**

Create `packages/storage/src/__tests__/key-builder.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildKey } from '../key-builder'

describe('buildKey', () => {
  it('builds an avatar key', () => {
    const key = buildKey({
      tenantId: 'tenant-1',
      category: 'avatars',
      entityId: 'actor-1',
      fileName: 'photo.jpg',
    })
    expect(key).toMatch(/^tenant-1\/avatars\/actor-1\/[0-9a-f-]+\.jpg$/)
  })

  it('builds a document key', () => {
    const key = buildKey({
      tenantId: 'tenant-1',
      category: 'documents',
      module: 'hiring',
      entityId: 'candidate-1',
      fileName: 'resume.pdf',
    })
    expect(key).toMatch(/^tenant-1\/documents\/hiring\/candidate-1\/[0-9a-f-]+\.pdf$/)
  })

  it('builds a temp key', () => {
    const key = buildKey({
      tenantId: 'tenant-1',
      category: 'temp',
      fileName: 'upload.bin',
    })
    expect(key).toMatch(/^tenant-1\/temp\/[0-9a-f-]+\.bin$/)
  })

  it('extracts extension from fileName', () => {
    const key = buildKey({
      tenantId: 't',
      category: 'exports',
      fileName: 'report.xlsx',
    })
    expect(key).toMatch(/\.xlsx$/)
  })
})
```

- [ ] **Step 9: Run test to verify it fails**

```bash
cd packages/storage && bunx vitest run
```

Expected: FAIL — `Cannot find module '../key-builder'`

- [ ] **Step 10: Implement key-builder.ts**

Create `packages/storage/src/key-builder.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'

export interface KeyParts {
  tenantId: string
  category: 'avatars' | 'documents' | 'cv' | 'exports' | 'temp'
  module?: string
  entityId?: string
  fileName: string
}

export function buildKey(parts: KeyParts): string {
  const ext = extname(parts.fileName)
  const id = randomUUID()
  const segments = [parts.tenantId, parts.category]

  if (parts.module) segments.push(parts.module)
  if (parts.entityId) segments.push(parts.entityId)

  segments.push(`${id}${ext}`)
  return segments.join('/')
}
```

- [ ] **Step 11: Run test to verify it passes**

```bash
cd packages/storage && bunx vitest run
```

Expected: PASS — all key-builder tests green.

- [ ] **Step 12: Write the failing test for S3StorageClient**

Create `packages/storage/src/__tests__/s3-storage-client.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { S3StorageClient } from '../s3-storage-client'

// Mock the AWS SDK modules
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn()
  return {
    S3Client: vi.fn(() => ({ send: mockSend })),
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    HeadObjectCommand: vi.fn(),
    __mockSend: mockSend,
  }
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}))

describe('S3StorageClient', () => {
  let client: S3StorageClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new S3StorageClient({ bucket: 'test-bucket', region: 'ap-southeast-1' })
  })

  it('getUploadUrl returns a presigned url and expiry', async () => {
    const result = await client.getUploadUrl('tenant/file.pdf', {
      contentType: 'application/pdf',
      maxSizeBytes: 10_000_000,
      expiresIn: 600,
    })

    expect(result.url).toBe('https://signed-url.example.com')
    expect(result.expiresAt).toBeInstanceOf(Date)
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('getDownloadUrl returns a presigned url', async () => {
    const result = await client.getDownloadUrl('tenant/file.pdf', 3600)

    expect(result.url).toBe('https://signed-url.example.com')
    expect(result.expiresAt).toBeInstanceOf(Date)
  })

  it('headObject returns null when object does not exist', async () => {
    const { __mockSend } = await import('@aws-sdk/client-s3')
    const mockSend = __mockSend as ReturnType<typeof vi.fn>
    mockSend.mockRejectedValue(Object.assign(new Error('Not Found'), { name: 'NotFound' }))

    const result = await client.headObject('tenant/missing.pdf')

    expect(result).toBeNull()
  })

  it('headObject returns metadata when object exists', async () => {
    const { __mockSend } = await import('@aws-sdk/client-s3')
    const mockSend = __mockSend as ReturnType<typeof vi.fn>
    mockSend.mockResolvedValue({
      ContentLength: 12345,
      ContentType: 'application/pdf',
      LastModified: new Date('2026-04-11T00:00:00Z'),
    })

    const result = await client.headObject('tenant/file.pdf')

    expect(result).toEqual({
      key: 'tenant/file.pdf',
      size: 12345,
      contentType: 'application/pdf',
      lastModified: new Date('2026-04-11T00:00:00Z'),
    })
  })
})
```

- [ ] **Step 13: Run test to verify it fails**

```bash
cd packages/storage && bunx vitest run
```

Expected: FAIL — `Cannot find module '../s3-storage-client'`

- [ ] **Step 14: Implement s3-storage-client.ts**

Create `packages/storage/src/s3-storage-client.ts`:

```ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageClient, StorageConfig, UploadOpts, PresignedUrl, ObjectMeta } from './types'

const DEFAULT_EXPIRES_IN = 900

export class S3StorageClient implements StorageClient {
  private readonly s3: S3Client
  private readonly bucket: string

  constructor(config: StorageConfig) {
    this.s3 = new S3Client({ region: config.region })
    this.bucket = config.bucket
  }

  async getUploadUrl(key: string, opts: UploadOpts): Promise<PresignedUrl> {
    const expiresIn = opts.expiresIn ?? DEFAULT_EXPIRES_IN
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: opts.contentType,
    })
    const url = await getSignedUrl(this.s3, command, { expiresIn })
    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    }
  }

  async getDownloadUrl(key: string, expiresIn = DEFAULT_EXPIRES_IN): Promise<PresignedUrl> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })
    const url = await getSignedUrl(this.s3, command, { expiresIn })
    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    )
  }

  async headObject(key: string): Promise<ObjectMeta | null> {
    try {
      const result = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      )
      return {
        key,
        size: result.ContentLength ?? 0,
        contentType: result.ContentType ?? 'application/octet-stream',
        lastModified: result.LastModified ?? new Date(),
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'NotFound') return null
      throw err
    }
  }
}
```

- [ ] **Step 15: Run test to verify it passes**

```bash
cd packages/storage && bunx vitest run
```

Expected: PASS — all S3StorageClient tests green.

- [ ] **Step 16: Write index.ts barrel export**

Create `packages/storage/src/index.ts`:

```ts
export type { StorageClient, StorageConfig, UploadOpts, PresignedUrl, ObjectMeta } from './types'
export { S3StorageClient } from './s3-storage-client'
export { buildKey, type KeyParts } from './key-builder'
```

- [ ] **Step 17: Build and typecheck**

```bash
cd packages/storage && bun run build && bun run typecheck
```

Expected: Clean build, no type errors.

- [ ] **Step 18: Commit**

```bash
git add packages/storage/
git commit -m "feat(storage): add @future/storage package — S3 presigned URLs and key builder"
```

---

### Task 2: Scaffold `packages/activity-log`

**Files:**

- Create: `packages/activity-log/package.json`
- Create: `packages/activity-log/tsconfig.json`
- Create: `packages/activity-log/eslint.config.ts`
- Create: `packages/activity-log/src/index.ts`
- Create: `packages/activity-log/src/types.ts`
- Create: `packages/activity-log/src/dynamo-activity-log-client.ts`
- Test: `packages/activity-log/src/__tests__/dynamo-activity-log-client.spec.ts`

- [ ] **Step 1: Create workspace via turbo gen**

```bash
bunx turbo gen workspace --name @future/activity-log --type package --directory packages/activity-log
```

- [ ] **Step 2: Add AWS DynamoDB dependencies**

```bash
cd packages/activity-log && bun add @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb uuidv7
```

- [ ] **Step 3: Add dev dependencies**

```bash
cd packages/activity-log && bun add -d @future/eslint-config @future/tsconfig vitest typescript eslint
```

- [ ] **Step 4: Configure tsconfig.json**

Replace `packages/activity-log/tsconfig.json`:

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.spec.ts"]
}
```

- [ ] **Step 5: Configure eslint.config.ts**

Replace `packages/activity-log/eslint.config.ts`:

```ts
import base from '@future/eslint-config/base'
import type { Linter } from 'eslint'

const config: Linter.Config[] = [
  ...base,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]

export default config
```

- [ ] **Step 6: Update package.json**

Replace `packages/activity-log/package.json`:

```json
{
  "name": "@future/activity-log",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3",
    "@aws-sdk/lib-dynamodb": "^3",
    "uuidv7": "^1"
  },
  "devDependencies": {
    "@future/eslint-config": "workspace:*",
    "@future/tsconfig": "*",
    "eslint": "^10.2.0",
    "typescript": "^6.0.2",
    "vitest": "^4"
  }
}
```

- [ ] **Step 7: Write types.ts**

Create `packages/activity-log/src/types.ts`:

```ts
export interface ActivityEntry {
  tenantId: string
  actorId: string
  actorName: string
  action: string
  resourceType: string
  resourceId: string
  summary: string
  metadata?: Record<string, unknown>
  timestamp?: Date
}

export interface QueryOpts {
  from?: Date
  to?: Date
  limit?: number
  cursor?: string
}

export interface PaginatedResult<T> {
  items: T[]
  cursor?: string
}

export interface ActivityLogClient {
  write(entry: ActivityEntry): Promise<void>
  writeBatch(entries: ActivityEntry[]): Promise<void>
  queryByTenant(tenantId: string, opts?: QueryOpts): Promise<PaginatedResult<ActivityEntry>>
  queryByActor(
    tenantId: string,
    actorId: string,
    opts?: QueryOpts,
  ): Promise<PaginatedResult<ActivityEntry>>
  queryByResource(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    opts?: QueryOpts,
  ): Promise<PaginatedResult<ActivityEntry>>
}

export interface ActivityLogConfig {
  tableName: string
  region: string
  ttlDays?: number
}
```

- [ ] **Step 8: Write the failing test for DynamoActivityLogClient**

Create `packages/activity-log/src/__tests__/dynamo-activity-log-client.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DynamoActivityLogClient } from '../dynamo-activity-log-client'
import type { ActivityEntry } from '../types'

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({ send: mockSend })),
}))

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  PutCommand: vi.fn((input: unknown) => ({ input })),
  BatchWriteCommand: vi.fn((input: unknown) => ({ input })),
  QueryCommand: vi.fn((input: unknown) => ({ input })),
}))

const entry: ActivityEntry = {
  tenantId: 'tenant-1',
  actorId: 'actor-1',
  actorName: 'Canh Ta',
  action: 'leave.approved',
  resourceType: 'leave_request',
  resourceId: 'lr-1',
  summary: 'Canh approved leave for Nguyen',
}

describe('DynamoActivityLogClient', () => {
  let client: DynamoActivityLogClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({})
    client = new DynamoActivityLogClient({
      tableName: 'test-activity-log',
      region: 'ap-southeast-1',
    })
  })

  it('write() sends a PutCommand with correct table and keys', async () => {
    await client.write(entry)

    expect(mockSend).toHaveBeenCalledOnce()
    const putInput = mockSend.mock.calls[0]![0].input
    expect(putInput.TableName).toBe('test-activity-log')
    expect(putInput.Item.tenantId).toBe('tenant-1')
    expect(putInput.Item.actorId).toBe('actor-1')
    expect(putInput.Item.action).toBe('leave.approved')
    expect(putInput.Item.expiresAt).toBeTypeOf('number')
  })

  it('write() uses provided timestamp', async () => {
    const ts = new Date('2026-04-11T10:00:00Z')
    await client.write({ ...entry, timestamp: ts })

    const putInput = mockSend.mock.calls[0]![0].input
    expect(putInput.Item.sortKey).toContain('2026-04-11T10:00:00')
  })

  it('queryByTenant() sends a QueryCommand with correct key condition', async () => {
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined })

    const result = await client.queryByTenant('tenant-1', { limit: 10 })

    expect(result.items).toEqual([])
    expect(result.cursor).toBeUndefined()
    const queryInput = mockSend.mock.calls[0]![0].input
    expect(queryInput.TableName).toBe('test-activity-log')
    expect(queryInput.Limit).toBe(10)
  })

  it('queryByActor() uses GSI-1', async () => {
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined })

    await client.queryByActor('tenant-1', 'actor-1')

    const queryInput = mockSend.mock.calls[0]![0].input
    expect(queryInput.IndexName).toBe('gsi1-actor')
  })

  it('queryByResource() uses GSI-2', async () => {
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined })

    await client.queryByResource('tenant-1', 'leave_request', 'lr-1')

    const queryInput = mockSend.mock.calls[0]![0].input
    expect(queryInput.IndexName).toBe('gsi2-resource')
  })
})
```

- [ ] **Step 9: Run test to verify it fails**

```bash
cd packages/activity-log && bunx vitest run
```

Expected: FAIL — `Cannot find module '../dynamo-activity-log-client'`

- [ ] **Step 10: Implement dynamo-activity-log-client.ts**

Create `packages/activity-log/src/dynamo-activity-log-client.ts`:

```ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  BatchWriteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import { uuidv7 } from 'uuidv7'
import type {
  ActivityLogClient,
  ActivityLogConfig,
  ActivityEntry,
  QueryOpts,
  PaginatedResult,
} from './types'

const DEFAULT_LIMIT = 50
const DEFAULT_TTL_DAYS = 365

export class DynamoActivityLogClient implements ActivityLogClient {
  private readonly docClient: DynamoDBDocumentClient
  private readonly tableName: string
  private readonly ttlDays: number

  constructor(config: ActivityLogConfig) {
    const ddb = new DynamoDBClient({ region: config.region })
    this.docClient = DynamoDBDocumentClient.from(ddb)
    this.tableName = config.tableName
    this.ttlDays = config.ttlDays ?? DEFAULT_TTL_DAYS
  }

  async write(entry: ActivityEntry): Promise<void> {
    const now = entry.timestamp ?? new Date()
    const eventId = uuidv7()
    const sortKey = `${now.toISOString()}#${eventId}`

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          tenantId: entry.tenantId,
          sortKey,
          actorId: entry.actorId,
          actorName: entry.actorName,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          summary: entry.summary,
          metadata: entry.metadata ?? {},
          timestamp: now.toISOString(),
          // GSI keys
          gsi1pk: `${entry.tenantId}#${entry.actorId}`,
          gsi2pk: `${entry.tenantId}#${entry.resourceType}#${entry.resourceId}`,
          // TTL
          expiresAt: Math.floor(now.getTime() / 1000) + this.ttlDays * 86400,
        },
      }),
    )
  }

  async writeBatch(entries: ActivityEntry[]): Promise<void> {
    // DynamoDB BatchWriteItem supports max 25 items
    const chunks = []
    for (let i = 0; i < entries.length; i += 25) {
      chunks.push(entries.slice(i, i + 25))
    }

    for (const chunk of chunks) {
      const requests = chunk.map((entry) => {
        const now = entry.timestamp ?? new Date()
        const eventId = uuidv7()
        const sortKey = `${now.toISOString()}#${eventId}`
        return {
          PutRequest: {
            Item: {
              tenantId: entry.tenantId,
              sortKey,
              actorId: entry.actorId,
              actorName: entry.actorName,
              action: entry.action,
              resourceType: entry.resourceType,
              resourceId: entry.resourceId,
              summary: entry.summary,
              metadata: entry.metadata ?? {},
              timestamp: now.toISOString(),
              gsi1pk: `${entry.tenantId}#${entry.actorId}`,
              gsi2pk: `${entry.tenantId}#${entry.resourceType}#${entry.resourceId}`,
              expiresAt: Math.floor(now.getTime() / 1000) + this.ttlDays * 86400,
            },
          },
        }
      })

      await this.docClient.send(
        new BatchWriteCommand({
          RequestItems: { [this.tableName]: requests },
        }),
      )
    }
  }

  async queryByTenant(
    tenantId: string,
    opts: QueryOpts = {},
  ): Promise<PaginatedResult<ActivityEntry>> {
    return this.query({
      keyCondition: 'tenantId = :pk',
      expressionValues: { ':pk': tenantId },
      opts,
    })
  }

  async queryByActor(
    tenantId: string,
    actorId: string,
    opts: QueryOpts = {},
  ): Promise<PaginatedResult<ActivityEntry>> {
    return this.query({
      indexName: 'gsi1-actor',
      keyCondition: 'gsi1pk = :pk',
      expressionValues: { ':pk': `${tenantId}#${actorId}` },
      opts,
    })
  }

  async queryByResource(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    opts: QueryOpts = {},
  ): Promise<PaginatedResult<ActivityEntry>> {
    return this.query({
      indexName: 'gsi2-resource',
      keyCondition: 'gsi2pk = :pk',
      expressionValues: { ':pk': `${tenantId}#${resourceType}#${resourceId}` },
      opts,
    })
  }

  private async query(params: {
    indexName?: string
    keyCondition: string
    expressionValues: Record<string, string>
    opts: QueryOpts
  }): Promise<PaginatedResult<ActivityEntry>> {
    let keyCondition = params.keyCondition
    const exprValues: Record<string, unknown> = { ...params.expressionValues }

    if (params.opts.from) {
      keyCondition += ' AND sortKey >= :from'
      exprValues[':from'] = params.opts.from.toISOString()
    }
    if (params.opts.to) {
      keyCondition += ' AND sortKey <= :to'
      exprValues[':to'] = params.opts.to.toISOString()
    }

    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: params.indexName,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: exprValues,
        Limit: params.opts.limit ?? DEFAULT_LIMIT,
        ScanIndexForward: false, // newest first
        ExclusiveStartKey: params.opts.cursor
          ? JSON.parse(Buffer.from(params.opts.cursor, 'base64url').toString())
          : undefined,
      }),
    )

    const items: ActivityEntry[] = (result.Items ?? []).map((item) => ({
      tenantId: item['tenantId'] as string,
      actorId: item['actorId'] as string,
      actorName: item['actorName'] as string,
      action: item['action'] as string,
      resourceType: item['resourceType'] as string,
      resourceId: item['resourceId'] as string,
      summary: item['summary'] as string,
      metadata: item['metadata'] as Record<string, unknown>,
      timestamp: new Date(item['timestamp'] as string),
    }))

    return {
      items,
      cursor: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
        : undefined,
    }
  }
}
```

- [ ] **Step 11: Run test to verify it passes**

```bash
cd packages/activity-log && bunx vitest run
```

Expected: PASS — all DynamoActivityLogClient tests green.

- [ ] **Step 12: Write index.ts**

Create `packages/activity-log/src/index.ts`:

```ts
export type {
  ActivityEntry,
  ActivityLogClient,
  ActivityLogConfig,
  QueryOpts,
  PaginatedResult,
} from './types'
export { DynamoActivityLogClient } from './dynamo-activity-log-client'
```

- [ ] **Step 13: Build and typecheck**

```bash
cd packages/activity-log && bun run build && bun run typecheck
```

Expected: Clean build, no type errors.

- [ ] **Step 14: Commit**

```bash
git add packages/activity-log/
git commit -m "feat(activity-log): add @future/activity-log package — DynamoDB activity log client"
```

---

### Task 3: Scaffold `packages/mail`

**Files:**

- Create: `packages/mail/package.json`
- Create: `packages/mail/tsconfig.json`
- Create: `packages/mail/eslint.config.ts`
- Create: `packages/mail/src/index.ts`
- Create: `packages/mail/src/types.ts`
- Create: `packages/mail/src/transports/ses-transport.ts`
- Create: `packages/mail/src/transports/smtp-transport.ts`
- Create: `packages/mail/src/template.ts`
- Test: `packages/mail/src/__tests__/ses-transport.spec.ts`
- Test: `packages/mail/src/__tests__/smtp-transport.spec.ts`
- Test: `packages/mail/src/__tests__/template.spec.ts`

- [ ] **Step 1: Create workspace via turbo gen**

```bash
bunx turbo gen workspace --name @future/mail --type package --directory packages/mail
```

- [ ] **Step 2: Add dependencies**

```bash
cd packages/mail && bun add @aws-sdk/client-sesv2 nodemailer mjml handlebars
```

- [ ] **Step 3: Add dev dependencies**

```bash
cd packages/mail && bun add -d @future/eslint-config @future/tsconfig vitest typescript eslint @types/nodemailer @types/mjml
```

- [ ] **Step 4: Configure tsconfig.json**

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.spec.ts"]
}
```

- [ ] **Step 5: Configure eslint.config.ts**

```ts
import base from '@future/eslint-config/base'
import type { Linter } from 'eslint'

const config: Linter.Config[] = [
  ...base,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]

export default config
```

- [ ] **Step 6: Update package.json**

```json
{
  "name": "@future/mail",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-sesv2": "^3",
    "handlebars": "^4",
    "mjml": "^5",
    "nodemailer": "^7"
  },
  "devDependencies": {
    "@future/eslint-config": "workspace:*",
    "@future/tsconfig": "*",
    "@types/mjml": "^4",
    "@types/nodemailer": "^6",
    "eslint": "^10.2.0",
    "typescript": "^6.0.2",
    "vitest": "^4"
  }
}
```

- [ ] **Step 7: Write types.ts**

Create `packages/mail/src/types.ts`:

```ts
export interface MailMessage {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
  attachments?: MailAttachment[]
}

export interface MailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface MailResult {
  messageId: string
  accepted: string[]
  rejected: string[]
}

export interface MailTransport {
  send(message: MailMessage): Promise<MailResult>
}

export interface SesMailConfig {
  provider: 'ses'
  fromAddress: string
  region: string
}

export interface SmtpMailConfig {
  provider: 'smtp'
  fromAddress: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
}

export type MailConfig = SesMailConfig | SmtpMailConfig
```

- [ ] **Step 8: Write the failing test for template rendering**

Create `packages/mail/src/__tests__/template.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { renderMjmlTemplate } from '../template'

describe('renderMjmlTemplate', () => {
  it('renders MJML with Handlebars variables to HTML', () => {
    const mjml = `
      <mjml>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text>Hello {{name}}, your leave from {{from}} to {{to}} was approved.</mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `
    const html = renderMjmlTemplate(mjml, { name: 'Nguyen', from: 'Apr 14', to: 'Apr 18' })

    expect(html).toContain('Hello Nguyen')
    expect(html).toContain('Apr 14')
    expect(html).toContain('Apr 18')
    expect(html).toContain('<!doctype html>')
  })

  it('throws on invalid MJML with strict validation', () => {
    const invalidMjml = '<mjml><mj-body><mj-invalid /></mj-body></mjml>'

    expect(() => renderMjmlTemplate(invalidMjml, {})).toThrow()
  })
})
```

- [ ] **Step 9: Run test to verify it fails**

```bash
cd packages/mail && bunx vitest run
```

Expected: FAIL — `Cannot find module '../template'`

- [ ] **Step 10: Implement template.ts**

Create `packages/mail/src/template.ts`:

```ts
import mjml2html from 'mjml'
import Handlebars from 'handlebars'

export function renderMjmlTemplate(mjmlTemplate: string, data: Record<string, unknown>): string {
  const compiled = Handlebars.compile(mjmlTemplate)
  const mjmlString = compiled(data)

  const result = mjml2html(mjmlString, {
    validationLevel: 'strict',
    keepComments: false,
    minify: true,
  })

  if (result.errors.length > 0) {
    throw new Error(`MJML compilation errors: ${result.errors.map((e) => e.message).join(', ')}`)
  }

  return result.html
}
```

- [ ] **Step 11: Run test to verify it passes**

```bash
cd packages/mail && bunx vitest run
```

Expected: PASS — template tests green.

- [ ] **Step 12: Write the failing test for SES transport**

Create `packages/mail/src/__tests__/ses-transport.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SesTransport } from '../transports/ses-transport'

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: vi.fn(() => ({ send: mockSend })),
  SendEmailCommand: vi.fn((input: unknown) => ({ input })),
}))

describe('SesTransport', () => {
  let transport: SesTransport

  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({ MessageId: 'ses-msg-123' })
    transport = new SesTransport({
      provider: 'ses',
      fromAddress: 'noreply@seta.com',
      region: 'ap-southeast-1',
    })
  })

  it('sends email via SESv2 SendEmailCommand', async () => {
    const result = await transport.send({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    })

    expect(mockSend).toHaveBeenCalledOnce()
    expect(result.messageId).toBe('ses-msg-123')
    expect(result.accepted).toEqual(['user@example.com'])
  })

  it('uses from override when provided', async () => {
    await transport.send({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
      from: 'custom@seta.com',
    })

    const cmdInput = mockSend.mock.calls[0]![0].input
    expect(cmdInput.FromEmailAddress).toBe('custom@seta.com')
  })

  it('handles array of recipients', async () => {
    const result = await transport.send({
      to: ['a@example.com', 'b@example.com'],
      subject: 'Test',
      html: '<p>Hello</p>',
    })

    expect(result.accepted).toEqual(['a@example.com', 'b@example.com'])
  })
})
```

- [ ] **Step 13: Run test to verify it fails**

```bash
cd packages/mail && bunx vitest run
```

Expected: FAIL — `Cannot find module '../transports/ses-transport'`

- [ ] **Step 14: Implement ses-transport.ts**

Create `packages/mail/src/transports/ses-transport.ts`:

```ts
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import type { MailTransport, MailMessage, MailResult, SesMailConfig } from '../types'

export class SesTransport implements MailTransport {
  private readonly ses: SESv2Client
  private readonly fromAddress: string

  constructor(config: SesMailConfig) {
    this.ses = new SESv2Client({ region: config.region })
    this.fromAddress = config.fromAddress
  }

  async send(message: MailMessage): Promise<MailResult> {
    const toAddresses = Array.isArray(message.to) ? message.to : [message.to]

    const result = await this.ses.send(
      new SendEmailCommand({
        FromEmailAddress: message.from ?? this.fromAddress,
        ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
        Destination: { ToAddresses: toAddresses },
        Content: {
          Simple: {
            Subject: { Data: message.subject },
            Body: { Html: { Data: message.html } },
          },
        },
      }),
    )

    return {
      messageId: result.MessageId ?? '',
      accepted: toAddresses,
      rejected: [],
    }
  }
}
```

- [ ] **Step 15: Run test to verify it passes**

```bash
cd packages/mail && bunx vitest run
```

Expected: PASS — SES transport tests green.

- [ ] **Step 16: Write the failing test for SMTP transport**

Create `packages/mail/src/__tests__/smtp-transport.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SmtpTransport } from '../transports/smtp-transport'

const mockSendMail = vi.fn()

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}))

describe('SmtpTransport', () => {
  let transport: SmtpTransport

  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMail.mockResolvedValue({
      messageId: 'smtp-msg-456',
      accepted: ['user@example.com'],
      rejected: [],
    })
    transport = new SmtpTransport({
      provider: 'smtp',
      fromAddress: 'noreply@seta.com',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'user',
      smtpPass: 'pass',
    })
  })

  it('sends email via nodemailer', async () => {
    const result = await transport.send({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    })

    expect(mockSendMail).toHaveBeenCalledOnce()
    expect(result.messageId).toBe('smtp-msg-456')
  })

  it('passes attachments to nodemailer', async () => {
    await transport.send({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
      attachments: [
        {
          filename: 'report.pdf',
          content: Buffer.from('pdf-data'),
          contentType: 'application/pdf',
        },
      ],
    })

    const callArgs = mockSendMail.mock.calls[0]![0]
    expect(callArgs.attachments).toHaveLength(1)
    expect(callArgs.attachments[0].filename).toBe('report.pdf')
  })
})
```

- [ ] **Step 17: Run test to verify it fails**

```bash
cd packages/mail && bunx vitest run
```

Expected: FAIL — `Cannot find module '../transports/smtp-transport'`

- [ ] **Step 18: Implement smtp-transport.ts**

Create `packages/mail/src/transports/smtp-transport.ts`:

```ts
import nodemailer from 'nodemailer'
import type { MailTransport, MailMessage, MailResult, SmtpMailConfig } from '../types'

export class SmtpTransport implements MailTransport {
  private readonly transporter: nodemailer.Transporter
  private readonly fromAddress: string

  constructor(config: SmtpMailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    })
    this.fromAddress = config.fromAddress
  }

  async send(message: MailMessage): Promise<MailResult> {
    const result = await this.transporter.sendMail({
      from: message.from ?? this.fromAddress,
      to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
      replyTo: message.replyTo,
      subject: message.subject,
      html: message.html,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    })

    return {
      messageId: result.messageId,
      accepted: (result.accepted ?? []) as string[],
      rejected: (result.rejected ?? []) as string[],
    }
  }
}
```

- [ ] **Step 19: Run test to verify it passes**

```bash
cd packages/mail && bunx vitest run
```

Expected: PASS — all mail tests green.

- [ ] **Step 20: Write createMailTransport factory and index.ts**

Create `packages/mail/src/index.ts`:

```ts
import { SesTransport } from './transports/ses-transport'
import { SmtpTransport } from './transports/smtp-transport'
import type { MailConfig, MailTransport } from './types'

export function createMailTransport(config: MailConfig): MailTransport {
  switch (config.provider) {
    case 'ses':
      return new SesTransport(config)
    case 'smtp':
      return new SmtpTransport(config)
  }
}

export type {
  MailTransport,
  MailMessage,
  MailAttachment,
  MailResult,
  MailConfig,
  SesMailConfig,
  SmtpMailConfig,
} from './types'
export { renderMjmlTemplate } from './template'
export { SesTransport } from './transports/ses-transport'
export { SmtpTransport } from './transports/smtp-transport'
```

- [ ] **Step 21: Build and typecheck**

```bash
cd packages/mail && bun run build && bun run typecheck
```

Expected: Clean build, no type errors.

- [ ] **Step 22: Commit**

```bash
git add packages/mail/
git commit -m "feat(mail): add @future/mail package — SES + SMTP transports, MJML template engine"
```

---

### Task 4: Scaffold `packages/documents`

**Files:**

- Create: `packages/documents/package.json`
- Create: `packages/documents/tsconfig.json`
- Create: `packages/documents/eslint.config.ts`
- Create: `packages/documents/src/index.ts`
- Create: `packages/documents/src/common/branding.ts`
- Create: `packages/documents/src/pdf/parse.ts`
- Create: `packages/documents/src/pdf/generate.ts`
- Create: `packages/documents/src/pdf/chromium.ts`
- Create: `packages/documents/src/excel/generate.ts`
- Test: `packages/documents/src/__tests__/pdf-parse.spec.ts`
- Test: `packages/documents/src/__tests__/pdf-generate.spec.ts`
- Test: `packages/documents/src/__tests__/excel-generate.spec.ts`

- [ ] **Step 1: Create workspace via turbo gen**

```bash
bunx turbo gen workspace --name @future/documents --type package --directory packages/documents
```

- [ ] **Step 2: Add dependencies**

```bash
cd packages/documents && bun add pdf-parse puppeteer-core @sparticuz/chromium exceljs handlebars
```

- [ ] **Step 3: Add dev dependencies**

```bash
cd packages/documents && bun add -d @future/eslint-config @future/tsconfig vitest typescript eslint @types/exceljs
```

- [ ] **Step 4: Configure tsconfig.json**

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.spec.ts"]
}
```

- [ ] **Step 5: Configure eslint.config.ts**

```ts
import base from '@future/eslint-config/base'
import type { Linter } from 'eslint'

const config: Linter.Config[] = [
  ...base,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]

export default config
```

- [ ] **Step 6: Update package.json**

```json
{
  "name": "@future/documents",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "test": "vitest run"
  },
  "dependencies": {
    "@sparticuz/chromium": "^135",
    "exceljs": "^4",
    "handlebars": "^4",
    "pdf-parse": "^3",
    "puppeteer-core": "^24"
  },
  "devDependencies": {
    "@future/eslint-config": "workspace:*",
    "@future/tsconfig": "*",
    "eslint": "^10.2.0",
    "typescript": "^6.0.2",
    "vitest": "^4"
  }
}
```

- [ ] **Step 7: Write branding types**

Create `packages/documents/src/common/branding.ts`:

```ts
export interface TenantBranding {
  logoUrl?: string
  primaryColor?: string
  companyName: string
  fontFamily?: string
}
```

- [ ] **Step 8: Write the failing test for PDF parsing**

Create `packages/documents/src/__tests__/pdf-parse.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { parsePdf } from '../pdf/parse'

const mockGetText = vi.fn()
const mockGetInfo = vi.fn()
const mockDestroy = vi.fn()

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn(() => ({
    getText: mockGetText,
    getInfo: mockGetInfo,
    destroy: mockDestroy,
  })),
}))

describe('parsePdf', () => {
  it('extracts text and metadata from a buffer', async () => {
    mockGetText.mockResolvedValue({
      text: 'Hello World',
      pages: [{ pageNumber: 1, text: 'Hello World' }],
    })
    mockGetInfo.mockResolvedValue({
      total: 1,
      infoData: { Title: 'Test', Author: 'Canh', CreationDate: '2026-04-11' },
    })

    const result = await parsePdf(Buffer.from('fake-pdf'))

    expect(result.text).toBe('Hello World')
    expect(result.pageCount).toBe(1)
    expect(result.pages).toHaveLength(1)
    expect(result.metadata.title).toBe('Test')
    expect(result.metadata.author).toBe('Canh')
    expect(mockDestroy).toHaveBeenCalledOnce()
  })

  it('calls destroy even when getText throws', async () => {
    mockGetText.mockRejectedValue(new Error('parse error'))
    mockGetInfo.mockResolvedValue({ total: 0, infoData: {} })

    await expect(parsePdf(Buffer.from('bad'))).rejects.toThrow('parse error')
    expect(mockDestroy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 9: Run test to verify it fails**

```bash
cd packages/documents && bunx vitest run
```

Expected: FAIL — `Cannot find module '../pdf/parse'`

- [ ] **Step 10: Implement pdf/parse.ts**

Create `packages/documents/src/pdf/parse.ts`:

```ts
import { PDFParse } from 'pdf-parse'

export interface PdfMetadata {
  title?: string
  author?: string
  createdAt?: string
}

export interface PageText {
  pageNumber: number
  text: string
}

export interface ParsedPdf {
  text: string
  pages: PageText[]
  metadata: PdfMetadata
  pageCount: number
}

export async function parsePdf(input: Buffer | string): Promise<ParsedPdf> {
  const opts = typeof input === 'string' ? { url: input } : { data: input }
  const parser = new PDFParse(opts)

  try {
    const [textResult, infoResult] = await Promise.all([
      parser.getText(),
      parser.getInfo({ parsePageInfo: true }),
    ])

    return {
      text: textResult.text,
      pages: (textResult.pages ?? []).map((p: { pageNumber: number; text: string }) => ({
        pageNumber: p.pageNumber,
        text: p.text,
      })),
      pageCount: infoResult.total,
      metadata: {
        title: infoResult.infoData?.Title as string | undefined,
        author: infoResult.infoData?.Author as string | undefined,
        createdAt: infoResult.infoData?.CreationDate as string | undefined,
      },
    }
  } finally {
    await parser.destroy()
  }
}
```

- [ ] **Step 11: Run test to verify it passes**

```bash
cd packages/documents && bunx vitest run
```

Expected: PASS — PDF parse tests green.

- [ ] **Step 12: Write chromium lifecycle helper**

Create `packages/documents/src/pdf/chromium.ts`:

```ts
import chromium from '@sparticuz/chromium'
import puppeteer, { type Browser } from 'puppeteer-core'

let browserInstance: Browser | null = null

export async function getBrowser(): Promise<Browser> {
  if (browserInstance?.connected) return browserInstance

  chromium.setGraphicsMode = false

  browserInstance = await puppeteer.launch({
    args: puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  })

  return browserInstance
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance?.connected) {
    await browserInstance.close()
    browserInstance = null
  }
}
```

- [ ] **Step 13: Write the failing test for PDF generation**

Create `packages/documents/src/__tests__/pdf-generate.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { generatePdf } from '../pdf/generate'

const mockPdf = vi.fn()
const mockSetContent = vi.fn()
const mockEmulateMediaType = vi.fn()
const mockNewPage = vi.fn(() => ({
  setContent: mockSetContent,
  emulateMediaType: mockEmulateMediaType,
  pdf: mockPdf,
  close: vi.fn(),
}))

vi.mock('../pdf/chromium', () => ({
  getBrowser: vi.fn(() => ({
    newPage: mockNewPage,
  })),
}))

describe('generatePdf', () => {
  it('renders Handlebars template and returns PDF buffer', async () => {
    const pdfData = new Uint8Array([1, 2, 3])
    mockPdf.mockResolvedValue(pdfData)

    const result = await generatePdf({
      template: { html: '<h1>Hello {{name}}</h1>' },
      data: { name: 'Canh' },
    })

    expect(mockSetContent).toHaveBeenCalledWith(expect.stringContaining('Hello Canh'), {
      waitUntil: 'networkidle2',
    })
    expect(mockEmulateMediaType).toHaveBeenCalledWith('screen')
    expect(mockPdf).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'A4', printBackground: true }),
    )
    expect(Buffer.isBuffer(result)).toBe(true)
  })

  it('applies branding CSS when provided', async () => {
    mockPdf.mockResolvedValue(new Uint8Array([1]))

    await generatePdf({
      template: { html: '<h1>Report</h1>' },
      data: {},
      branding: { companyName: 'SETA', primaryColor: '#1D4ED8' },
    })

    expect(mockSetContent).toHaveBeenCalledWith(
      expect.stringContaining('#1D4ED8'),
      expect.any(Object),
    )
  })

  it('supports landscape and Letter format', async () => {
    mockPdf.mockResolvedValue(new Uint8Array([1]))

    await generatePdf({
      template: { html: '<p>Wide</p>' },
      data: {},
      format: 'Letter',
      landscape: true,
    })

    expect(mockPdf).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'Letter', landscape: true }),
    )
  })
})
```

- [ ] **Step 14: Run test to verify it fails**

```bash
cd packages/documents && bunx vitest run
```

Expected: FAIL — `Cannot find module '../pdf/generate'`

- [ ] **Step 15: Implement pdf/generate.ts**

Create `packages/documents/src/pdf/generate.ts`:

```ts
import Handlebars from 'handlebars'
import { getBrowser } from './chromium'
import type { TenantBranding } from '../common/branding'

export interface PdfTemplate {
  html: string
  css?: string
}

export interface PdfGenerateOpts {
  template: PdfTemplate
  data: Record<string, unknown>
  branding?: TenantBranding
  format?: 'A4' | 'Letter'
  landscape?: boolean
}

export async function generatePdf(opts: PdfGenerateOpts): Promise<Buffer> {
  const compiled = Handlebars.compile(opts.template.html)
  let htmlBody = compiled(opts.data)

  const cssBlocks: string[] = []
  if (opts.template.css) cssBlocks.push(opts.template.css)
  if (opts.branding?.primaryColor) {
    cssBlocks.push(`:root { --brand-color: ${opts.branding.primaryColor}; }`)
  }
  if (opts.branding?.fontFamily) {
    cssBlocks.push(`body { font-family: ${opts.branding.fontFamily}, sans-serif; }`)
  }

  const fullHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${cssBlocks.join('\n')}</style></head>
<body>${htmlBody}</body>
</html>`

  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.setContent(fullHtml, { waitUntil: 'networkidle2' })
    await page.emulateMediaType('screen')

    const pdfData = await page.pdf({
      format: opts.format ?? 'A4',
      landscape: opts.landscape ?? false,
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    })

    return Buffer.from(pdfData)
  } finally {
    await page.close()
  }
}
```

- [ ] **Step 16: Run test to verify it passes**

```bash
cd packages/documents && bunx vitest run
```

Expected: PASS — PDF generate tests green.

- [ ] **Step 17: Write the failing test for Excel generation**

Create `packages/documents/src/__tests__/excel-generate.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generateExcel } from '../excel/generate'

describe('generateExcel', () => {
  it('generates a valid xlsx buffer with one sheet', async () => {
    const result = await generateExcel({
      sheets: [
        {
          name: 'Employees',
          columns: [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Name', key: 'name', width: 25 },
          ],
          rows: [
            { id: 1, name: 'Canh Ta' },
            { id: 2, name: 'Nguyen Van' },
          ],
        },
      ],
    })

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    // XLSX magic number: PK (ZIP format)
    expect(result[0]).toBe(0x50) // 'P'
    expect(result[1]).toBe(0x4b) // 'K'
  })

  it('generates multiple sheets', async () => {
    const result = await generateExcel({
      sheets: [
        {
          name: 'Sheet1',
          columns: [{ header: 'A', key: 'a' }],
          rows: [{ a: 1 }],
        },
        {
          name: 'Sheet2',
          columns: [{ header: 'B', key: 'b' }],
          rows: [{ b: 2 }],
        },
      ],
    })

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 18: Run test to verify it fails**

```bash
cd packages/documents && bunx vitest run
```

Expected: FAIL — `Cannot find module '../excel/generate'`

- [ ] **Step 19: Implement excel/generate.ts**

Create `packages/documents/src/excel/generate.ts`:

```ts
import ExcelJS from 'exceljs'
import type { TenantBranding } from '../common/branding'

export interface ExcelColumn {
  header: string
  key: string
  width?: number
  format?: 'text' | 'number' | 'date' | 'currency'
}

export interface ExcelSheet {
  name: string
  columns: ExcelColumn[]
  rows: Record<string, unknown>[]
}

export interface ExcelGenerateOpts {
  sheets: ExcelSheet[]
  branding?: TenantBranding
}

export async function generateExcel(opts: ExcelGenerateOpts): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()

  if (opts.branding) {
    workbook.creator = opts.branding.companyName
  }
  workbook.created = new Date()

  for (const sheet of opts.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name)

    worksheet.columns = sheet.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width ?? 15,
    }))

    worksheet.addRows(sheet.rows)

    // Style header row
    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.commit()
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
```

- [ ] **Step 20: Run test to verify it passes**

```bash
cd packages/documents && bunx vitest run
```

Expected: PASS — all documents tests green.

- [ ] **Step 21: Write index.ts**

Create `packages/documents/src/index.ts`:

```ts
export type { TenantBranding } from './common/branding'
export { parsePdf, type ParsedPdf, type PageText, type PdfMetadata } from './pdf/parse'
export { generatePdf, type PdfTemplate, type PdfGenerateOpts } from './pdf/generate'
export { closeBrowser } from './pdf/chromium'
export {
  generateExcel,
  type ExcelSheet,
  type ExcelColumn,
  type ExcelGenerateOpts,
} from './excel/generate'
```

- [ ] **Step 22: Build and typecheck**

```bash
cd packages/documents && bun run build && bun run typecheck
```

Expected: Clean build, no type errors.

- [ ] **Step 23: Commit**

```bash
git add packages/documents/
git commit -m "feat(documents): add @future/documents package — PDF parse/generate, Excel generate"
```

---

## Phase 2: Admin Module Extension (email config)

---

### Task 5: Add `tenant_email_config` to admin module

**Files:**

- Modify: `apps/api/src/modules/admin/infrastructure/schema/admin.schema.ts`
- Modify: `apps/api/src/modules/admin/application/facades/admin-query.facade.ts`
- Modify: `apps/api/src/modules/admin/admin.module.ts`
- Create: `apps/api/src/modules/admin/domain/entities/tenant-email-config.entity.ts`
- Create: `apps/api/src/modules/admin/domain/repositories/tenant-email-config.repository.port.ts`
- Create: `apps/api/src/modules/admin/infrastructure/repositories/drizzle-tenant-email-config.repository.ts`
- Test: `apps/api/src/modules/admin/application/facades/admin-query.facade.spec.ts`

- [ ] **Step 1: Write the failing test for AdminQueryFacade.getEmailConfig**

Create `apps/api/src/modules/admin/application/facades/admin-query.facade.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminQueryFacade } from './admin-query.facade'
import type { ITenantEmailConfigRepository } from '../../domain/repositories/tenant-email-config.repository.port'
import type { TenantEmailConfig } from '../../domain/entities/tenant-email-config.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const tenantConfig: TenantEmailConfig = {
  id: '01900000-0000-7000-8000-000000000010',
  tenantId: TENANT_ID,
  provider: 'smtp',
  fromAddress: 'hr@acme.com',
  smtpHost: 'smtp.acme.com',
  smtpPort: 587,
  credentialRef: 'arn:aws:secretsmanager:ap-southeast-1:123:secret:acme-smtp',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('AdminQueryFacade', () => {
  let facade: AdminQueryFacade
  let emailConfigRepo: ITenantEmailConfigRepository

  beforeEach(() => {
    emailConfigRepo = {
      findByTenantId: vi.fn(),
      upsert: vi.fn(),
    }
    facade = new AdminQueryFacade(emailConfigRepo)
  })

  describe('getEmailConfig', () => {
    it('returns tenant config when it exists', async () => {
      vi.mocked(emailConfigRepo.findByTenantId).mockResolvedValue(tenantConfig)

      const result = await facade.getEmailConfig(TENANT_ID)

      expect(result).toEqual(tenantConfig)
    })

    it('returns null when tenant has no email config (platform default applies)', async () => {
      vi.mocked(emailConfigRepo.findByTenantId).mockResolvedValue(null)

      const result = await facade.getEmailConfig(TENANT_ID)

      expect(result).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bunx vitest run --project unit -- src/modules/admin/application/facades/admin-query.facade.spec.ts
```

Expected: FAIL — missing imports.

- [ ] **Step 3: Create domain entity**

Create `apps/api/src/modules/admin/domain/entities/tenant-email-config.entity.ts`:

```ts
export interface TenantEmailConfig {
  id: string
  tenantId: string
  provider: 'ses' | 'smtp'
  fromAddress: string
  smtpHost: string | null
  smtpPort: number | null
  credentialRef: string
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 4: Create repository port**

Create `apps/api/src/modules/admin/domain/repositories/tenant-email-config.repository.port.ts`:

```ts
import type { TenantEmailConfig } from '../entities/tenant-email-config.entity'

export interface ITenantEmailConfigRepository {
  findByTenantId(tenantId: string): Promise<TenantEmailConfig | null>
  upsert(
    config: Omit<TenantEmailConfig, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TenantEmailConfig>
}

export const TENANT_EMAIL_CONFIG_REPOSITORY = Symbol('ITenantEmailConfigRepository')
```

- [ ] **Step 5: Add schema table**

Replace `apps/api/src/modules/admin/infrastructure/schema/admin.schema.ts`:

```ts
import { pgSchema, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const adminSchema = pgSchema('admin')

export const tenantEmailConfig = adminSchema.table('tenant_email_config', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull().unique(),
  provider: text('provider', { enum: ['ses', 'smtp'] }).notNull(),
  fromAddress: text('from_address').notNull(),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  credentialRef: text('credential_ref').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

- [ ] **Step 6: Implement Drizzle repository**

Create `apps/api/src/modules/admin/infrastructure/repositories/drizzle-tenant-email-config.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { tenantEmailConfig } from '../schema/admin.schema'
import type { ITenantEmailConfigRepository } from '../../domain/repositories/tenant-email-config.repository.port'
import type { TenantEmailConfig } from '../../domain/entities/tenant-email-config.entity'

@Injectable()
export class DrizzleTenantEmailConfigRepository implements ITenantEmailConfigRepository {
  constructor(@Inject('DRIZZLE_DB') private readonly db: NodePgDatabase) {}

  async findByTenantId(tenantId: string): Promise<TenantEmailConfig | null> {
    const rows = await this.db
      .select()
      .from(tenantEmailConfig)
      .where(eq(tenantEmailConfig.tenantId, tenantId))
      .limit(1)

    return rows[0] ?? null
  }

  async upsert(
    config: Omit<TenantEmailConfig, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TenantEmailConfig> {
    const rows = await this.db
      .insert(tenantEmailConfig)
      .values(config)
      .onConflictDoUpdate({
        target: tenantEmailConfig.tenantId,
        set: {
          provider: config.provider,
          fromAddress: config.fromAddress,
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          credentialRef: config.credentialRef,
          updatedAt: new Date(),
        },
      })
      .returning()

    return rows[0]!
  }
}
```

- [ ] **Step 7: Update AdminQueryFacade**

Replace `apps/api/src/modules/admin/application/facades/admin-query.facade.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import type { ITenantEmailConfigRepository } from '../../domain/repositories/tenant-email-config.repository.port'
import { TENANT_EMAIL_CONFIG_REPOSITORY } from '../../domain/repositories/tenant-email-config.repository.port'
import type { TenantEmailConfig } from '../../domain/entities/tenant-email-config.entity'

@Injectable()
export class AdminQueryFacade {
  constructor(
    @Inject(TENANT_EMAIL_CONFIG_REPOSITORY)
    private readonly emailConfigRepo: ITenantEmailConfigRepository,
  ) {}

  async getEmailConfig(tenantId: string): Promise<TenantEmailConfig | null> {
    return this.emailConfigRepo.findByTenantId(tenantId)
  }
}
```

- [ ] **Step 8: Update AdminModule DI**

Replace `apps/api/src/modules/admin/admin.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { AdminQueryFacade } from './application/facades/admin-query.facade'
import { DrizzleTenantEmailConfigRepository } from './infrastructure/repositories/drizzle-tenant-email-config.repository'
import { TENANT_EMAIL_CONFIG_REPOSITORY } from './domain/repositories/tenant-email-config.repository.port'

@Module({
  providers: [
    AdminQueryFacade,
    {
      provide: TENANT_EMAIL_CONFIG_REPOSITORY,
      useClass: DrizzleTenantEmailConfigRepository,
    },
  ],
  exports: [AdminQueryFacade],
})
export class AdminModule {}
```

- [ ] **Step 9: Run test to verify it passes**

```bash
cd apps/api && bunx vitest run --project unit -- src/modules/admin/application/facades/admin-query.facade.spec.ts
```

Expected: PASS — AdminQueryFacade tests green.

- [ ] **Step 10: Delete .gitkeep files replaced by real files**

```bash
rm -f apps/api/src/modules/admin/domain/entities/.gitkeep
rm -f apps/api/src/modules/admin/domain/repositories/.gitkeep
rm -f apps/api/src/modules/admin/infrastructure/repositories/.gitkeep
```

- [ ] **Step 11: Generate migration**

```bash
bun run db:generate
```

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/modules/admin/ packages/db/
git commit -m "feat(admin): add tenant_email_config schema and AdminQueryFacade.getEmailConfig()"
```

---

## Phase 3: Domain Modules

---

### Task 6: Scaffold `modules/notifications`

**Files:**

- Create: `apps/api/src/modules/notifications/domain/entities/notification.entity.ts`
- Create: `apps/api/src/modules/notifications/domain/entities/notification-preference.entity.ts`
- Create: `apps/api/src/modules/notifications/domain/repositories/notification.repository.port.ts`
- Create: `apps/api/src/modules/notifications/domain/value-objects/category.vo.ts`
- Create: `apps/api/src/modules/notifications/infrastructure/schema/notifications.schema.ts`
- Create: `apps/api/src/modules/notifications/infrastructure/repositories/drizzle-notification.repository.ts`
- Create: `apps/api/src/modules/notifications/application/commands/send-notification.command.ts`
- Create: `apps/api/src/modules/notifications/application/commands/send-notification.handler.ts`
- Create: `apps/api/src/modules/notifications/application/commands/mark-read.command.ts`
- Create: `apps/api/src/modules/notifications/application/commands/mark-read.handler.ts`
- Create: `apps/api/src/modules/notifications/application/queries/list-notifications.query.ts`
- Create: `apps/api/src/modules/notifications/application/queries/list-notifications.handler.ts`
- Create: `apps/api/src/modules/notifications/application/queries/unread-count.query.ts`
- Create: `apps/api/src/modules/notifications/application/queries/unread-count.handler.ts`
- Create: `apps/api/src/modules/notifications/application/facades/notifications-query.facade.ts`
- Create: `apps/api/src/modules/notifications/infrastructure/redis/notification-publisher.ts`
- Create: `apps/api/src/modules/notifications/infrastructure/sse/notification-sse.controller.ts`
- Create: `apps/api/src/modules/notifications/notifications.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/modules/notifications/application/commands/send-notification.handler.spec.ts`
- Test: `apps/api/src/modules/notifications/application/commands/mark-read.handler.spec.ts`
- Test: `apps/api/src/modules/notifications/application/queries/unread-count.handler.spec.ts`

This is a large task. Following TDD, each command/query handler gets: write test → run to fail → implement → run to pass → commit.

- [ ] **Step 1: Create domain value-object for category**

Create `apps/api/src/modules/notifications/domain/value-objects/category.vo.ts`:

```ts
export const NOTIFICATION_CATEGORIES = ['approval', 'mention', 'assignment', 'system'] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]
```

- [ ] **Step 2: Create domain entity**

Create `apps/api/src/modules/notifications/domain/entities/notification.entity.ts`:

```ts
import type { NotificationCategory } from '../value-objects/category.vo'

export interface Notification {
  id: string
  tenantId: string
  recipientId: string
  senderId: string | null
  category: NotificationCategory
  title: string
  body: string | null
  resourceType: string | null
  resourceId: string | null
  resourceUrl: string | null
  readAt: Date | null
  archivedAt: Date | null
  createdAt: Date
}
```

- [ ] **Step 3: Create notification-preference entity**

Create `apps/api/src/modules/notifications/domain/entities/notification-preference.entity.ts`:

```ts
import type { NotificationCategory } from '../value-objects/category.vo'

export interface NotificationPreference {
  id: string
  tenantId: string
  actorId: string
  category: NotificationCategory
  inApp: boolean
  email: boolean
}
```

- [ ] **Step 4: Create repository port**

Create `apps/api/src/modules/notifications/domain/repositories/notification.repository.port.ts`:

```ts
import type { Notification } from '../entities/notification.entity'
import type { NotificationPreference } from '../entities/notification-preference.entity'
import type { NotificationCategory } from '../value-objects/category.vo'

export interface INotificationRepository {
  insert(
    notification: Omit<Notification, 'id' | 'readAt' | 'archivedAt' | 'createdAt'>,
  ): Promise<Notification>
  findByRecipient(
    tenantId: string,
    recipientId: string,
    opts: { category?: NotificationCategory; unreadOnly?: boolean; limit: number; offset: number },
  ): Promise<Notification[]>
  countUnread(tenantId: string, recipientId: string): Promise<number>
  markRead(tenantId: string, ids: string[]): Promise<void>
  markAllRead(tenantId: string, recipientId: string): Promise<void>
  archive(tenantId: string, ids: string[]): Promise<void>
  getPreference(
    tenantId: string,
    actorId: string,
    category: NotificationCategory,
  ): Promise<NotificationPreference | null>
}

export const NOTIFICATION_REPOSITORY = Symbol('INotificationRepository')
```

- [ ] **Step 5: Create Drizzle schema**

Create `apps/api/src/modules/notifications/infrastructure/schema/notifications.schema.ts`:

```ts
import { pgSchema, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const notificationsSchema = pgSchema('notifications')

export const notification = notificationsSchema.table('notification', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  recipientId: uuid('recipient_id').notNull(),
  senderId: uuid('sender_id'),
  category: text('category', { enum: ['approval', 'mention', 'assignment', 'system'] }).notNull(),
  title: text('title').notNull(),
  body: text('body'),
  resourceType: text('resource_type'),
  resourceId: uuid('resource_id'),
  resourceUrl: text('resource_url'),
  readAt: timestamp('read_at'),
  archivedAt: timestamp('archived_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const notificationPreference = notificationsSchema.table('notification_preference', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  category: text('category', { enum: ['approval', 'mention', 'assignment', 'system'] }).notNull(),
  inApp: boolean('in_app').notNull().default(true),
  email: boolean('email').notNull().default(true),
})
```

- [ ] **Step 6: Create send-notification command + handler**

Create `apps/api/src/modules/notifications/application/commands/send-notification.command.ts`:

```ts
import type { NotificationCategory } from '../../domain/value-objects/category.vo'

export class SendNotificationCommand {
  constructor(
    public readonly tenantId: string,
    public readonly recipientId: string,
    public readonly senderId: string | null,
    public readonly category: NotificationCategory,
    public readonly title: string,
    public readonly body: string | null,
    public readonly resourceType: string | null,
    public readonly resourceId: string | null,
    public readonly resourceUrl: string | null,
  ) {}
}
```

- [ ] **Step 7: Write the failing test for SendNotificationHandler**

Create `apps/api/src/modules/notifications/application/commands/send-notification.handler.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SendNotificationCommand } from './send-notification.command'
import { SendNotificationHandler } from './send-notification.handler'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import type { Notification } from '../../domain/entities/notification.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeNotification: Notification = {
  id: '01900000-0000-7000-8000-000000000099',
  tenantId: TENANT_ID,
  recipientId: 'actor-1',
  senderId: 'actor-2',
  category: 'approval',
  title: 'Leave approved',
  body: 'Your leave was approved',
  resourceType: 'leave_request',
  resourceId: 'lr-1',
  resourceUrl: '/time/leave/lr-1',
  readAt: null,
  archivedAt: null,
  createdAt: new Date(),
}

describe('SendNotificationHandler', () => {
  let handler: SendNotificationHandler
  let repo: INotificationRepository
  let publisher: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    repo = {
      insert: vi.fn().mockResolvedValue(fakeNotification),
      findByRecipient: vi.fn(),
      countUnread: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      archive: vi.fn(),
      getPreference: vi.fn().mockResolvedValue(null), // default: no custom prefs
    }
    publisher = { publish: vi.fn() }
    handler = new SendNotificationHandler(repo, publisher)
  })

  it('inserts notification and publishes to Redis', async () => {
    const cmd = new SendNotificationCommand(
      TENANT_ID,
      'actor-1',
      'actor-2',
      'approval',
      'Leave approved',
      'Your leave was approved',
      'leave_request',
      'lr-1',
      '/time/leave/lr-1',
    )

    const result = await handler.execute(cmd)

    expect(result).toBe(fakeNotification.id)
    expect(repo.insert).toHaveBeenCalledOnce()
    expect(publisher.publish).toHaveBeenCalledWith(
      TENANT_ID,
      'actor-1',
      expect.objectContaining({ id: fakeNotification.id }),
    )
  })

  it('skips publishing when in-app preference is disabled', async () => {
    vi.mocked(repo.getPreference).mockResolvedValue({
      id: 'pref-1',
      tenantId: TENANT_ID,
      actorId: 'actor-1',
      category: 'approval',
      inApp: false,
      email: true,
    })

    const cmd = new SendNotificationCommand(
      TENANT_ID,
      'actor-1',
      'actor-2',
      'approval',
      'Leave approved',
      null,
      null,
      null,
      null,
    )

    await handler.execute(cmd)

    expect(repo.insert).toHaveBeenCalledOnce()
    expect(publisher.publish).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 8: Run test to verify it fails**

```bash
cd apps/api && bunx vitest run --project unit -- src/modules/notifications/application/commands/send-notification.handler.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 9: Implement SendNotificationHandler**

Create `apps/api/src/modules/notifications/application/commands/send-notification.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { SendNotificationCommand } from './send-notification.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'
import type { NotificationPublisher } from '../../infrastructure/redis/notification-publisher'
import { NOTIFICATION_PUBLISHER } from '../../infrastructure/redis/notification-publisher'

@CommandHandler(SendNotificationCommand)
@Injectable()
export class SendNotificationHandler implements ICommandHandler<SendNotificationCommand, string> {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository,
    @Inject(NOTIFICATION_PUBLISHER) private readonly publisher: NotificationPublisher,
  ) {}

  async execute(command: SendNotificationCommand): Promise<string> {
    const notification = await this.repo.insert({
      tenantId: command.tenantId,
      recipientId: command.recipientId,
      senderId: command.senderId,
      category: command.category,
      title: command.title,
      body: command.body,
      resourceType: command.resourceType,
      resourceId: command.resourceId,
      resourceUrl: command.resourceUrl,
    })

    // Check preference
    const pref = await this.repo.getPreference(
      command.tenantId,
      command.recipientId,
      command.category,
    )

    const inAppEnabled = pref?.inApp ?? true // default enabled

    if (inAppEnabled) {
      await this.publisher.publish(command.tenantId, command.recipientId, notification)
    }

    return notification.id
  }
}
```

- [ ] **Step 10: Create NotificationPublisher interface**

Create `apps/api/src/modules/notifications/infrastructure/redis/notification-publisher.ts`:

```ts
import type { Notification } from '../../domain/entities/notification.entity'

export interface NotificationPublisher {
  publish(tenantId: string, recipientId: string, notification: Notification): Promise<void>
}

export const NOTIFICATION_PUBLISHER = Symbol('NotificationPublisher')
```

- [ ] **Step 11: Run test to verify it passes**

```bash
cd apps/api && bunx vitest run --project unit -- src/modules/notifications/application/commands/send-notification.handler.spec.ts
```

Expected: PASS — SendNotificationHandler tests green.

- [ ] **Step 12: Create mark-read command and handler**

Create `apps/api/src/modules/notifications/application/commands/mark-read.command.ts`:

```ts
export class MarkReadCommand {
  constructor(
    public readonly tenantId: string,
    public readonly ids: string[],
  ) {}
}

export class MarkAllReadCommand {
  constructor(
    public readonly tenantId: string,
    public readonly recipientId: string,
  ) {}
}
```

- [ ] **Step 13: Write the failing test for MarkReadHandler**

Create `apps/api/src/modules/notifications/application/commands/mark-read.handler.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkReadCommand, MarkAllReadCommand } from './mark-read.command'
import { MarkReadHandler, MarkAllReadHandler } from './mark-read.handler'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('MarkReadHandler', () => {
  let handler: MarkReadHandler
  let repo: INotificationRepository

  beforeEach(() => {
    repo = {
      insert: vi.fn(),
      findByRecipient: vi.fn(),
      countUnread: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      archive: vi.fn(),
      getPreference: vi.fn(),
    }
    handler = new MarkReadHandler(repo)
  })

  it('calls repo.markRead with correct args', async () => {
    await handler.execute(new MarkReadCommand(TENANT_ID, ['id-1', 'id-2']))

    expect(repo.markRead).toHaveBeenCalledWith(TENANT_ID, ['id-1', 'id-2'])
  })
})

describe('MarkAllReadHandler', () => {
  let handler: MarkAllReadHandler
  let repo: INotificationRepository

  beforeEach(() => {
    repo = {
      insert: vi.fn(),
      findByRecipient: vi.fn(),
      countUnread: vi.fn(),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      archive: vi.fn(),
      getPreference: vi.fn(),
    }
    handler = new MarkAllReadHandler(repo)
  })

  it('calls repo.markAllRead with correct args', async () => {
    await handler.execute(new MarkAllReadCommand(TENANT_ID, 'actor-1'))

    expect(repo.markAllRead).toHaveBeenCalledWith(TENANT_ID, 'actor-1')
  })
})
```

- [ ] **Step 14: Run test to verify it fails**

```bash
cd apps/api && bunx vitest run --project unit -- src/modules/notifications/application/commands/mark-read.handler.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 15: Implement MarkReadHandler and MarkAllReadHandler**

Create `apps/api/src/modules/notifications/application/commands/mark-read.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { MarkReadCommand, MarkAllReadCommand } from './mark-read.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'

@CommandHandler(MarkReadCommand)
@Injectable()
export class MarkReadHandler implements ICommandHandler<MarkReadCommand, void> {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository) {}

  async execute(command: MarkReadCommand): Promise<void> {
    await this.repo.markRead(command.tenantId, command.ids)
  }
}

@CommandHandler(MarkAllReadCommand)
@Injectable()
export class MarkAllReadHandler implements ICommandHandler<MarkAllReadCommand, void> {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository) {}

  async execute(command: MarkAllReadCommand): Promise<void> {
    await this.repo.markAllRead(command.tenantId, command.recipientId)
  }
}
```

- [ ] **Step 16: Run test to verify it passes**

```bash
cd apps/api && bunx vitest run --project unit -- src/modules/notifications/application/commands/mark-read.handler.spec.ts
```

Expected: PASS.

- [ ] **Step 17: Create unread-count query**

Create `apps/api/src/modules/notifications/application/queries/unread-count.query.ts`:

```ts
export class UnreadCountQuery {
  constructor(
    public readonly tenantId: string,
    public readonly recipientId: string,
  ) {}
}
```

- [ ] **Step 18: Write the failing test for UnreadCountHandler**

Create `apps/api/src/modules/notifications/application/queries/unread-count.handler.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnreadCountQuery } from './unread-count.query'
import { UnreadCountHandler } from './unread-count.handler'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'

describe('UnreadCountHandler', () => {
  let handler: UnreadCountHandler
  let repo: INotificationRepository

  beforeEach(() => {
    repo = {
      insert: vi.fn(),
      findByRecipient: vi.fn(),
      countUnread: vi.fn().mockResolvedValue(5),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      archive: vi.fn(),
      getPreference: vi.fn(),
    }
    handler = new UnreadCountHandler(repo)
  })

  it('returns the unread count from repo', async () => {
    const result = await handler.execute(new UnreadCountQuery('tenant-1', 'actor-1'))

    expect(result).toBe(5)
    expect(repo.countUnread).toHaveBeenCalledWith('tenant-1', 'actor-1')
  })
})
```

- [ ] **Step 19: Run test to verify it fails, implement, run to pass**

Create `apps/api/src/modules/notifications/application/queries/unread-count.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { UnreadCountQuery } from './unread-count.query'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'

@QueryHandler(UnreadCountQuery)
@Injectable()
export class UnreadCountHandler implements IQueryHandler<UnreadCountQuery, number> {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository) {}

  async execute(query: UnreadCountQuery): Promise<number> {
    return this.repo.countUnread(query.tenantId, query.recipientId)
  }
}
```

```bash
cd apps/api && bunx vitest run --project unit -- src/modules/notifications/application/queries/unread-count.handler.spec.ts
```

Expected: PASS.

- [ ] **Step 20: Create NotificationsQueryFacade**

Create `apps/api/src/modules/notifications/application/facades/notifications-query.facade.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'

@Injectable()
export class NotificationsQueryFacade {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: INotificationRepository,
  ) {}

  async getUnreadCount(tenantId: string, recipientId: string): Promise<number> {
    return this.repo.countUnread(tenantId, recipientId)
  }
}
```

- [ ] **Step 21: Wire up NotificationsModule**

Create `apps/api/src/modules/notifications/notifications.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { NotificationsQueryFacade } from './application/facades/notifications-query.facade'
import { SendNotificationHandler } from './application/commands/send-notification.handler'
import { MarkReadHandler, MarkAllReadHandler } from './application/commands/mark-read.handler'
import { UnreadCountHandler } from './application/queries/unread-count.handler'
import { NOTIFICATION_REPOSITORY } from './domain/repositories/notification.repository.port'
import { NOTIFICATION_PUBLISHER } from './infrastructure/redis/notification-publisher'

@Module({
  imports: [CqrsModule],
  providers: [
    NotificationsQueryFacade,
    SendNotificationHandler,
    MarkReadHandler,
    MarkAllReadHandler,
    UnreadCountHandler,
    // TODO: Wire real Drizzle repository and Redis publisher when infra is ready
    {
      provide: NOTIFICATION_REPOSITORY,
      useValue: {}, // placeholder — implement DrizzleNotificationRepository
    },
    {
      provide: NOTIFICATION_PUBLISHER,
      useValue: { publish: async () => {} }, // placeholder — implement RedisNotificationPublisher
    },
  ],
  exports: [NotificationsQueryFacade],
})
export class NotificationsModule {}
```

- [ ] **Step 22: Register in AppModule**

Add `NotificationsModule` to `apps/api/src/app.module.ts`:

```ts
// Add import at top
import { NotificationsModule } from './modules/notifications/notifications.module'

// Add to imports array after AdminModule:
// NotificationsModule,
```

- [ ] **Step 23: Remove .gitkeep files that are now replaced**

No .gitkeep files exist for notifications since it's a new module — skip this step.

- [ ] **Step 24: Generate migration**

```bash
bun run db:generate
```

- [ ] **Step 25: Commit**

```bash
git add apps/api/src/modules/notifications/ apps/api/src/app.module.ts packages/db/
git commit -m "feat(notifications): add notifications module — send, mark-read, unread-count with TDD"
```

---

### Task 7: Scaffold `modules/documents` (domain module)

**Files:**

- Create: `apps/api/src/modules/documents/domain/entities/template.entity.ts`
- Create: `apps/api/src/modules/documents/domain/entities/tenant-branding.entity.ts`
- Create: `apps/api/src/modules/documents/domain/entities/generation-job.entity.ts`
- Create: `apps/api/src/modules/documents/domain/repositories/template.repository.port.ts`
- Create: `apps/api/src/modules/documents/domain/repositories/generation-job.repository.port.ts`
- Create: `apps/api/src/modules/documents/domain/value-objects/template-format.vo.ts`
- Create: `apps/api/src/modules/documents/domain/value-objects/job-status.vo.ts`
- Create: `apps/api/src/modules/documents/infrastructure/schema/documents.schema.ts`
- Create: `apps/api/src/modules/documents/application/commands/generate-document.command.ts`
- Create: `apps/api/src/modules/documents/application/commands/generate-document.handler.ts`
- Create: `apps/api/src/modules/documents/application/facades/documents-query.facade.ts`
- Create: `apps/api/src/modules/documents/documents.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/modules/documents/application/commands/generate-document.handler.spec.ts`

- [ ] **Step 1: Create value objects**

Create `apps/api/src/modules/documents/domain/value-objects/template-format.vo.ts`:

```ts
export const TEMPLATE_FORMATS = ['pdf', 'excel'] as const
export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number]
```

Create `apps/api/src/modules/documents/domain/value-objects/job-status.vo.ts`:

```ts
export const JOB_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]
```

- [ ] **Step 2: Create domain entities**

Create `apps/api/src/modules/documents/domain/entities/template.entity.ts`:

```ts
import type { TemplateFormat } from '../value-objects/template-format.vo'

export interface Template {
  id: string
  tenantId: string
  slug: string
  name: string
  format: TemplateFormat
  content: string
  version: number
  isDefault: boolean
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}
```

Create `apps/api/src/modules/documents/domain/entities/tenant-branding.entity.ts`:

```ts
export interface TenantBranding {
  id: string
  tenantId: string
  companyName: string
  logoFileKey: string | null
  primaryColor: string | null
  fontFamily: string | null
  updatedAt: Date
}
```

Create `apps/api/src/modules/documents/domain/entities/generation-job.entity.ts`:

```ts
import type { JobStatus } from '../value-objects/job-status.vo'

export interface GenerationJob {
  id: string
  tenantId: string
  templateId: string
  requestedBy: string
  status: JobStatus
  inputData: Record<string, unknown>
  outputFileKey: string | null
  errorMessage: string | null
  createdAt: Date
  completedAt: Date | null
}
```

- [ ] **Step 3: Create repository ports**

Create `apps/api/src/modules/documents/domain/repositories/template.repository.port.ts`:

```ts
import type { Template } from '../entities/template.entity'

export interface ITemplateRepository {
  findBySlugAndTenant(tenantId: string, slug: string): Promise<Template | null>
  findByTenant(tenantId: string): Promise<Template[]>
  insert(template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<Template>
}

export const TEMPLATE_REPOSITORY = Symbol('ITemplateRepository')
```

Create `apps/api/src/modules/documents/domain/repositories/generation-job.repository.port.ts`:

```ts
import type { GenerationJob } from '../entities/generation-job.entity'
import type { JobStatus } from '../value-objects/job-status.vo'

export interface IGenerationJobRepository {
  insert(job: Omit<GenerationJob, 'id' | 'createdAt' | 'completedAt'>): Promise<GenerationJob>
  findById(tenantId: string, id: string): Promise<GenerationJob | null>
  updateStatus(
    id: string,
    status: JobStatus,
    outputFileKey?: string,
    errorMessage?: string,
  ): Promise<void>
}

export const GENERATION_JOB_REPOSITORY = Symbol('IGenerationJobRepository')
```

- [ ] **Step 4: Create Drizzle schema**

Create `apps/api/src/modules/documents/infrastructure/schema/documents.schema.ts`:

```ts
import { pgSchema, uuid, text, integer, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const documentsSchema = pgSchema('documents')

export const template = documentsSchema.table('template', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  format: text('format', { enum: ['pdf', 'excel'] }).notNull(),
  content: text('content').notNull(),
  version: integer('version').notNull().default(1),
  isDefault: boolean('is_default').notNull().default(false),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const tenantBranding = documentsSchema.table('tenant_branding', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull().unique(),
  companyName: text('company_name').notNull(),
  logoFileKey: text('logo_file_key'),
  primaryColor: text('primary_color'),
  fontFamily: text('font_family'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const generationJob = documentsSchema.table('generation_job', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => template.id),
  requestedBy: uuid('requested_by').notNull(),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] })
    .notNull()
    .default('pending'),
  inputData: jsonb('input_data').notNull(),
  outputFileKey: text('output_file_key'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
})
```

- [ ] **Step 5: Create generate-document command**

Create `apps/api/src/modules/documents/application/commands/generate-document.command.ts`:

```ts
export class GenerateDocumentCommand {
  constructor(
    public readonly tenantId: string,
    public readonly requestedBy: string,
    public readonly templateSlug: string,
    public readonly inputData: Record<string, unknown>,
  ) {}
}
```

- [ ] **Step 6: Write the failing test for GenerateDocumentHandler**

Create `apps/api/src/modules/documents/application/commands/generate-document.handler.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerateDocumentCommand } from './generate-document.command'
import { GenerateDocumentHandler } from './generate-document.handler'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import type { Template } from '../../domain/entities/template.entity'
import type { GenerationJob } from '../../domain/entities/generation-job.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeTemplate: Template = {
  id: 'tmpl-1',
  tenantId: TENANT_ID,
  slug: 'payslip',
  name: 'Monthly Payslip',
  format: 'pdf',
  content: '<h1>{{month}} Payslip</h1>',
  version: 1,
  isDefault: true,
  createdBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeJob: GenerationJob = {
  id: 'job-1',
  tenantId: TENANT_ID,
  templateId: 'tmpl-1',
  requestedBy: 'actor-1',
  status: 'pending',
  inputData: { month: 'April' },
  outputFileKey: null,
  errorMessage: null,
  createdAt: new Date(),
  completedAt: null,
}

describe('GenerateDocumentHandler', () => {
  let handler: GenerateDocumentHandler
  let templateRepo: ITemplateRepository
  let jobRepo: IGenerationJobRepository

  beforeEach(() => {
    templateRepo = {
      findBySlugAndTenant: vi.fn().mockResolvedValue(fakeTemplate),
      findByTenant: vi.fn(),
      insert: vi.fn(),
    }
    jobRepo = {
      insert: vi.fn().mockResolvedValue(fakeJob),
      findById: vi.fn(),
      updateStatus: vi.fn(),
    }
    handler = new GenerateDocumentHandler(templateRepo, jobRepo)
  })

  it('creates a generation job when template exists', async () => {
    const result = await handler.execute(
      new GenerateDocumentCommand(TENANT_ID, 'actor-1', 'payslip', { month: 'April' }),
    )

    expect(result).toBe('job-1')
    expect(templateRepo.findBySlugAndTenant).toHaveBeenCalledWith(TENANT_ID, 'payslip')
    expect(jobRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        templateId: 'tmpl-1',
        requestedBy: 'actor-1',
        status: 'pending',
        inputData: { month: 'April' },
      }),
    )
  })

  it('throws when template is not found', async () => {
    vi.mocked(templateRepo.findBySlugAndTenant).mockResolvedValue(null)

    await expect(
      handler.execute(new GenerateDocumentCommand(TENANT_ID, 'actor-1', 'missing', {})),
    ).rejects.toThrow('Template not found: missing')
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

```bash
cd apps/api && bunx vitest run --project unit -- src/modules/documents/application/commands/generate-document.handler.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 8: Implement GenerateDocumentHandler**

Create `apps/api/src/modules/documents/application/commands/generate-document.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { GenerateDocumentCommand } from './generate-document.command'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import { TEMPLATE_REPOSITORY } from '../../domain/repositories/template.repository.port'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import { GENERATION_JOB_REPOSITORY } from '../../domain/repositories/generation-job.repository.port'

@CommandHandler(GenerateDocumentCommand)
@Injectable()
export class GenerateDocumentHandler implements ICommandHandler<GenerateDocumentCommand, string> {
  constructor(
    @Inject(TEMPLATE_REPOSITORY) private readonly templateRepo: ITemplateRepository,
    @Inject(GENERATION_JOB_REPOSITORY) private readonly jobRepo: IGenerationJobRepository,
  ) {}

  async execute(command: GenerateDocumentCommand): Promise<string> {
    const template = await this.templateRepo.findBySlugAndTenant(
      command.tenantId,
      command.templateSlug,
    )

    if (!template) {
      throw new Error(`Template not found: ${command.templateSlug}`)
    }

    const job = await this.jobRepo.insert({
      tenantId: command.tenantId,
      templateId: template.id,
      requestedBy: command.requestedBy,
      status: 'pending',
      inputData: command.inputData,
      outputFileKey: null,
      errorMessage: null,
    })

    // TODO: enqueue pg-boss job 'documents.generate' with job.id
    // This will be implemented when pg-boss is wired in

    return job.id
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

```bash
cd apps/api && bunx vitest run --project unit -- src/modules/documents/application/commands/generate-document.handler.spec.ts
```

Expected: PASS.

- [ ] **Step 10: Create DocumentsQueryFacade**

Create `apps/api/src/modules/documents/application/facades/documents-query.facade.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import { TEMPLATE_REPOSITORY } from '../../domain/repositories/template.repository.port'
import type { Template } from '../../domain/entities/template.entity'

@Injectable()
export class DocumentsQueryFacade {
  constructor(@Inject(TEMPLATE_REPOSITORY) private readonly templateRepo: ITemplateRepository) {}

  async getTemplatesByTenant(tenantId: string): Promise<Template[]> {
    return this.templateRepo.findByTenant(tenantId)
  }
}
```

- [ ] **Step 11: Wire up DocumentsModule**

Create `apps/api/src/modules/documents/documents.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DocumentsQueryFacade } from './application/facades/documents-query.facade'
import { GenerateDocumentHandler } from './application/commands/generate-document.handler'
import { TEMPLATE_REPOSITORY } from './domain/repositories/template.repository.port'
import { GENERATION_JOB_REPOSITORY } from './domain/repositories/generation-job.repository.port'

@Module({
  imports: [CqrsModule],
  providers: [
    DocumentsQueryFacade,
    GenerateDocumentHandler,
    // TODO: Wire real Drizzle repositories when infra is ready
    {
      provide: TEMPLATE_REPOSITORY,
      useValue: {},
    },
    {
      provide: GENERATION_JOB_REPOSITORY,
      useValue: {},
    },
  ],
  exports: [DocumentsQueryFacade],
})
export class DocumentsModule {}
```

- [ ] **Step 12: Register in AppModule**

Add `DocumentsModule` to `apps/api/src/app.module.ts`:

```ts
// Add import at top
import { DocumentsModule } from './modules/documents/documents.module'

// Add to imports array after NotificationsModule:
// DocumentsModule,
```

- [ ] **Step 13: Add event contracts for documents**

Create `packages/event-contracts/src/documents/document-generated.event.ts`:

```ts
export class DocumentGeneratedEvent {
  static readonly eventName = 'documents.document-generated'
  constructor(
    public readonly tenantId: string,
    public readonly jobId: string,
    public readonly templateSlug: string,
    public readonly format: string,
    public readonly outputFileKey: string,
  ) {}
}
```

Create `packages/event-contracts/src/notifications/notification-sent.event.ts`:

```ts
export class NotificationSentEvent {
  static readonly eventName = 'notifications.notification-sent'
  constructor(
    public readonly tenantId: string,
    public readonly notificationId: string,
    public readonly recipientId: string,
    public readonly category: string,
  ) {}
}
```

Update `packages/event-contracts/src/index.ts` to add the new exports:

```ts
// Add to existing exports:
export { DocumentGeneratedEvent } from './documents/document-generated.event'
export { NotificationSentEvent } from './notifications/notification-sent.event'
```

- [ ] **Step 14: Generate migration**

```bash
bun run db:generate
```

- [ ] **Step 15: Commit**

```bash
git add apps/api/src/modules/documents/ apps/api/src/app.module.ts packages/event-contracts/ packages/db/
git commit -m "feat(documents): add documents module — template, branding, generation-job with TDD"
```

---

## Phase 4: Run full test suite and verify

---

### Task 8: Final verification

- [ ] **Step 1: Run all unit tests**

```bash
bun run test:unit
```

Expected: All tests pass.

- [ ] **Step 2: Run typecheck across monorepo**

```bash
bun turbo typecheck
```

Expected: No type errors.

- [ ] **Step 3: Run lint**

```bash
bun turbo lint
```

Expected: No lint errors.

- [ ] **Step 4: Run full build**

```bash
bun turbo build
```

Expected: All packages and apps build successfully.

- [ ] **Step 5: Final commit if any formatting fixes needed**

```bash
bun run format
git add -A
git commit -m "chore: format all files after platform services implementation"
```

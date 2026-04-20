# Plan 01 — Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install runtime dependencies, add hash-keyed prompt + narrative stores with RLS, wire Langfuse OTel exporter, and ship the `project_to_schema` pure-function sanitizer.

**Architecture:** Drizzle schema additions in `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts`; repositories following the existing `DrizzleAgentMessageRepository` pattern (`DB_TOKEN` DI); Langfuse wiring via `@vercel/otel` + `langfuse-vercel` registered at NestJS bootstrap; sanitizer is a pure TS module.

**Tech Stack:** Drizzle ORM, `@vercel/otel`, `langfuse-vercel`, `ai` (Vercel AI SDK), `@ai-sdk/openai`, zod, vitest.

---

## File Map

**Create:**

- `apps/api/src/modules/agents/domain/ports/prompt-store.port.ts`
- `apps/api/src/modules/agents/domain/ports/narrative-store.port.ts`
- `apps/api/src/modules/agents/infrastructure/repositories/drizzle-prompt-store.repository.ts`
- `apps/api/src/modules/agents/infrastructure/repositories/drizzle-prompt-store.repository.integration.spec.ts`
- `apps/api/src/modules/agents/infrastructure/repositories/drizzle-narrative-store.repository.ts`
- `apps/api/src/modules/agents/infrastructure/repositories/drizzle-narrative-store.repository.integration.spec.ts`
- `apps/api/src/modules/agents/infrastructure/telemetry/langfuse-wiring.ts`
- `apps/api/src/modules/agents/infrastructure/telemetry/langfuse-wiring.spec.ts`
- `apps/api/src/modules/agents/application/services/project-to-schema.ts`
- `apps/api/src/modules/agents/application/services/project-to-schema.spec.ts`

**Modify:**

- `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts` — add two tables
- `apps/api/src/modules/agents/agents.module.ts` — register new repositories
- `apps/api/src/main.ts` — call `initLangfuseOTel()` at bootstrap
- `apps/api/package.json` — via `bun add` (never hand-edit)
- `packages/db/drizzle/migrations/<generated>.sql` — append RLS + policies to generated migration

---

## Task 1: Install runtime dependencies

**Files:**

- Modify: `apps/api/package.json` (via CLI only)

- [ ] **Step 1: Add Vercel AI SDK + OpenAI provider + Langfuse + OTel**

Run from repo root (CLAUDE.md: never hand-edit package.json):

```bash
bun add ai @ai-sdk/openai @vercel/otel langfuse-vercel --filter @future/api
```

- [ ] **Step 2: Verify install**

```bash
bun run --filter @future/api typecheck
```

Expected: PASS (no usage yet, so nothing to break).

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json bun.lock
git commit -m "feat(agents): add AI SDK + Langfuse dependencies for Phase 1"
```

---

## Task 2: Add `agent_prompt_store` + `agent_narrative_store` schema

**Files:**

- Modify: `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts`

- [ ] **Step 1: Add the two tables to the schema file**

Append after the existing `agentInsights` definition in `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts`:

```ts
export const agentPromptStore = agentsSchema.table('agent_prompt_store', {
  contentHash: text('content_hash').primaryKey(),
  layer: text('layer').notNull(),
  content: text('content').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentNarrativeStore = agentsSchema.table('agent_narrative_store', {
  contentHash: text('content_hash').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  roleId: uuid('role_id').notNull(),
  content: text('content').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 2: Build the schema to catch typos**

```bash
bun run --filter @future/api typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts
git commit -m "feat(agents): add agent_prompt_store + agent_narrative_store schemas"
```

---

## Task 3: Generate migration + add RLS policies

**Files:**

- Create: `packages/db/drizzle/migrations/<next>.sql` (Drizzle will pick the number)

- [ ] **Step 1: Generate the migration**

From repo root:

```bash
cd packages/db && bun run generate && cd -
```

Expected: new file `packages/db/drizzle/migrations/<NNNN>_<slug>.sql` added. Note the number.

- [ ] **Step 2: Verify generated contents**

Open the generated SQL. It should contain `CREATE TABLE "agents"."agent_prompt_store"` and `CREATE TABLE "agents"."agent_narrative_store"`. If not, the schema file in Task 2 did not land — re-check.

- [ ] **Step 3: Append RLS and tenant isolation policies**

Append to the newly generated migration file (following the pattern of `packages/db/drizzle/migrations/0001_rls_and_extras.sql`):

```sql
--> statement-breakpoint
ALTER TABLE "agents"."agent_prompt_store" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agents"."agent_prompt_store" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "agents"."agent_prompt_store"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "agents"."agent_narrative_store" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agents"."agent_narrative_store" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "agents"."agent_narrative_store"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

- [ ] **Step 4: Run migration against local DB**

```bash
cd packages/db && bun run migrate && cd -
```

Expected: "Migrations complete" with no errors.

- [ ] **Step 5: Manual RLS verification (psql)**

```bash
psql "$DATABASE_URL" -c "\d+ agents.agent_prompt_store" | grep "Row Level Security"
```

Expected output: `Row Level Security: enabled` and `Force Row Level Security: enabled`.

- [ ] **Step 6: Commit**

```bash
git add packages/db/drizzle/migrations/
git commit -m "feat(agents): migration for agent_prompt_store + agent_narrative_store with RLS"
```

---

## Task 4: `PromptStore` port

**Files:**

- Create: `apps/api/src/modules/agents/domain/ports/prompt-store.port.ts`

- [ ] **Step 1: Define the port interface**

```ts
// apps/api/src/modules/agents/domain/ports/prompt-store.port.ts
export type PromptLayer = 'system' | 'developer' | 'user' | 'tool_catalog'

export interface PromptStoreEntry {
  contentHash: string
  layer: PromptLayer
  content: string
  tenantId: string
  firstSeenAt: Date
}

export interface PromptStore {
  /**
   * Idempotent write: if the (contentHash, tenantId) already exists, return it without rewriting.
   * Returns the stored entry and whether the write actually inserted a row.
   */
  putIfAbsent(
    entry: Omit<PromptStoreEntry, 'firstSeenAt'>,
  ): Promise<{ entry: PromptStoreEntry; inserted: boolean }>
  get(contentHash: string, tenantId: string): Promise<PromptStoreEntry | null>
}

export const PROMPT_STORE = Symbol('PROMPT_STORE')
```

- [ ] **Step 2: Typecheck**

```bash
bun run --filter @future/api typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/agents/domain/ports/prompt-store.port.ts
git commit -m "feat(agents): add PromptStore port"
```

---

## Task 5: `NarrativeStore` port

**Files:**

- Create: `apps/api/src/modules/agents/domain/ports/narrative-store.port.ts`

- [ ] **Step 1: Define the port interface**

```ts
// apps/api/src/modules/agents/domain/ports/narrative-store.port.ts
export interface NarrativeStoreEntry {
  contentHash: string
  tenantId: string
  roleId: string
  content: string
  firstSeenAt: Date
}

export interface NarrativeStore {
  putIfAbsent(
    entry: Omit<NarrativeStoreEntry, 'firstSeenAt'>,
  ): Promise<{ entry: NarrativeStoreEntry; inserted: boolean }>
  get(contentHash: string, tenantId: string): Promise<NarrativeStoreEntry | null>
}

export const NARRATIVE_STORE = Symbol('NARRATIVE_STORE')
```

- [ ] **Step 2: Typecheck + commit**

```bash
bun run --filter @future/api typecheck
git add apps/api/src/modules/agents/domain/ports/narrative-store.port.ts
git commit -m "feat(agents): add NarrativeStore port"
```

---

## Task 6: `DrizzlePromptStoreRepository` with idempotent write

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/repositories/drizzle-prompt-store.repository.ts`
- Create: `apps/api/src/modules/agents/infrastructure/repositories/drizzle-prompt-store.repository.integration.spec.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// apps/api/src/modules/agents/infrastructure/repositories/drizzle-prompt-store.repository.integration.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestDb } from '@future/db/test-helpers'
import { DrizzlePromptStoreRepository } from './drizzle-prompt-store.repository'

describe('DrizzlePromptStoreRepository (integration)', () => {
  const tenantA = '00000000-0000-4000-8000-00000000000a'
  const tenantB = '00000000-0000-4000-8000-00000000000b'

  let db: Awaited<ReturnType<typeof makeTestDb>>
  let repo: DrizzlePromptStoreRepository

  beforeEach(async () => {
    db = await makeTestDb({ tenantId: tenantA })
    repo = new DrizzlePromptStoreRepository(db.drizzle)
  })

  it('inserts when hash is absent', async () => {
    const result = await repo.putIfAbsent({
      contentHash: 'abc123',
      layer: 'system',
      content: 'role: planner',
      tenantId: tenantA,
    })
    expect(result.inserted).toBe(true)
    expect(result.entry.content).toBe('role: planner')
  })

  it('is idempotent on duplicate hash within the same tenant', async () => {
    await repo.putIfAbsent({ contentHash: 'h1', layer: 'system', content: 'A', tenantId: tenantA })
    const second = await repo.putIfAbsent({
      contentHash: 'h1',
      layer: 'system',
      content: 'A',
      tenantId: tenantA,
    })
    expect(second.inserted).toBe(false)
    expect(second.entry.content).toBe('A')
  })

  it('returns null from get() when hash is absent', async () => {
    expect(await repo.get('missing', tenantA)).toBeNull()
  })

  it('returns stored entry from get() when present', async () => {
    await repo.putIfAbsent({
      contentHash: 'h2',
      layer: 'user',
      content: 'hello',
      tenantId: tenantA,
    })
    const entry = await repo.get('h2', tenantA)
    expect(entry?.content).toBe('hello')
  })

  it('RLS isolates tenants: get() from tenantA cannot see tenantB rows', async () => {
    const dbB = await makeTestDb({ tenantId: tenantB })
    const repoB = new DrizzlePromptStoreRepository(dbB.drizzle)
    await repoB.putIfAbsent({ contentHash: 'hB', layer: 'system', content: 'B', tenantId: tenantB })

    expect(await repo.get('hB', tenantA)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run --filter @future/api test:integration -- drizzle-prompt-store
```

Expected: FAIL with "Cannot find module './drizzle-prompt-store.repository'".

- [ ] **Step 3: Implement the repository**

```ts
// apps/api/src/modules/agents/infrastructure/repositories/drizzle-prompt-store.repository.ts
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentPromptStore } from '../schema/agents.schema'
import type { PromptStore, PromptStoreEntry } from '../../domain/ports/prompt-store.port'

@Injectable()
export class DrizzlePromptStoreRepository implements PromptStore {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async putIfAbsent(
    input: Omit<PromptStoreEntry, 'firstSeenAt'>,
  ): Promise<{ entry: PromptStoreEntry; inserted: boolean }> {
    const rows = await this.db
      .insert(agentPromptStore)
      .values(input)
      .onConflictDoNothing({ target: agentPromptStore.contentHash })
      .returning()

    if (rows.length > 0) {
      return { entry: rows[0] as PromptStoreEntry, inserted: true }
    }
    const existing = await this.get(input.contentHash, input.tenantId)
    if (!existing) {
      throw new Error(
        `prompt_store race: conflict on ${input.contentHash} but row not visible to tenant`,
      )
    }
    return { entry: existing, inserted: false }
  }

  async get(contentHash: string, tenantId: string): Promise<PromptStoreEntry | null> {
    const rows = await this.db
      .select()
      .from(agentPromptStore)
      .where(
        and(eq(agentPromptStore.contentHash, contentHash), eq(agentPromptStore.tenantId, tenantId)),
      )
      .limit(1)
    return (rows[0] as PromptStoreEntry | undefined) ?? null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run --filter @future/api test:integration -- drizzle-prompt-store
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agents/infrastructure/repositories/drizzle-prompt-store.repository.ts \
        apps/api/src/modules/agents/infrastructure/repositories/drizzle-prompt-store.repository.integration.spec.ts
git commit -m "feat(agents): DrizzlePromptStoreRepository with idempotent writes + RLS coverage"
```

---

## Task 7: `DrizzleNarrativeStoreRepository` with idempotent write

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/repositories/drizzle-narrative-store.repository.ts`
- Create: `apps/api/src/modules/agents/infrastructure/repositories/drizzle-narrative-store.repository.integration.spec.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// apps/api/src/modules/agents/infrastructure/repositories/drizzle-narrative-store.repository.integration.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestDb } from '@future/db/test-helpers'
import { DrizzleNarrativeStoreRepository } from './drizzle-narrative-store.repository'

describe('DrizzleNarrativeStoreRepository (integration)', () => {
  const tenantA = '00000000-0000-4000-8000-00000000000a'
  const roleAdmin = '00000000-0000-4000-8000-000000000001'

  let db: Awaited<ReturnType<typeof makeTestDb>>
  let repo: DrizzleNarrativeStoreRepository

  beforeEach(async () => {
    db = await makeTestDb({ tenantId: tenantA })
    repo = new DrizzleNarrativeStoreRepository(db.drizzle)
  })

  it('inserts narrative when hash is absent', async () => {
    const result = await repo.putIfAbsent({
      contentHash: 'n1',
      tenantId: tenantA,
      roleId: roleAdmin,
      content: 'Acting as admin. You can read any record.',
    })
    expect(result.inserted).toBe(true)
  })

  it('is idempotent on duplicate hash', async () => {
    await repo.putIfAbsent({
      contentHash: 'n2',
      tenantId: tenantA,
      roleId: roleAdmin,
      content: 'X',
    })
    const second = await repo.putIfAbsent({
      contentHash: 'n2',
      tenantId: tenantA,
      roleId: roleAdmin,
      content: 'X',
    })
    expect(second.inserted).toBe(false)
  })

  it('returns null from get() when hash is absent', async () => {
    expect(await repo.get('missing', tenantA)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
bun run --filter @future/api test:integration -- drizzle-narrative-store
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the repository**

```ts
// apps/api/src/modules/agents/infrastructure/repositories/drizzle-narrative-store.repository.ts
import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentNarrativeStore } from '../schema/agents.schema'
import type { NarrativeStore, NarrativeStoreEntry } from '../../domain/ports/narrative-store.port'

@Injectable()
export class DrizzleNarrativeStoreRepository implements NarrativeStore {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async putIfAbsent(
    input: Omit<NarrativeStoreEntry, 'firstSeenAt'>,
  ): Promise<{ entry: NarrativeStoreEntry; inserted: boolean }> {
    const rows = await this.db
      .insert(agentNarrativeStore)
      .values(input)
      .onConflictDoNothing({ target: agentNarrativeStore.contentHash })
      .returning()

    if (rows.length > 0) {
      return { entry: rows[0] as NarrativeStoreEntry, inserted: true }
    }
    const existing = await this.get(input.contentHash, input.tenantId)
    if (!existing) {
      throw new Error(
        `narrative_store race: conflict on ${input.contentHash} but row not visible to tenant`,
      )
    }
    return { entry: existing, inserted: false }
  }

  async get(contentHash: string, tenantId: string): Promise<NarrativeStoreEntry | null> {
    const rows = await this.db
      .select()
      .from(agentNarrativeStore)
      .where(
        and(
          eq(agentNarrativeStore.contentHash, contentHash),
          eq(agentNarrativeStore.tenantId, tenantId),
        ),
      )
      .limit(1)
    return (rows[0] as NarrativeStoreEntry | undefined) ?? null
  }
}
```

- [ ] **Step 4: Run test + commit**

```bash
bun run --filter @future/api test:integration -- drizzle-narrative-store
```

Expected: 3 PASS.

```bash
git add apps/api/src/modules/agents/infrastructure/repositories/drizzle-narrative-store.repository.ts \
        apps/api/src/modules/agents/infrastructure/repositories/drizzle-narrative-store.repository.integration.spec.ts
git commit -m "feat(agents): DrizzleNarrativeStoreRepository with idempotent writes"
```

---

## Task 8: `project_to_schema` sanitizer

**Files:**

- Create: `apps/api/src/modules/agents/application/services/project-to-schema.ts`
- Create: `apps/api/src/modules/agents/application/services/project-to-schema.spec.ts`

Pure function — no DI, no NestJS. Phase 3 (router) will be its first caller; landing it now keeps the interface fresh.

- [ ] **Step 1: Write failing unit tests**

```ts
// apps/api/src/modules/agents/application/services/project-to-schema.spec.ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { projectToSchema, SchemaMismatchError } from './project-to-schema'

const Phase1Output = z.object({
  summary: z.string(),
  semantics: z.string(),
  confidence: z.enum(['high', 'med', 'low']),
  sourceToolProvenance: z.array(z.string()),
})

describe('projectToSchema', () => {
  it('projects a subset of keys (field drop only)', () => {
    const input = {
      summary: 'S',
      semantics: 'M',
      confidence: 'high',
      sourceToolProvenance: ['t1'],
    }
    const target = Phase1Output.pick({ summary: true, semantics: true })
    expect(projectToSchema(input, target)).toEqual({ summary: 'S', semantics: 'M' })
  })

  it('does not transform, coerce, or compute fields', () => {
    const input = { summary: 'S', semantics: 'M', confidence: 'high', sourceToolProvenance: [] }
    const target = Phase1Output.pick({ summary: true })
    const output = projectToSchema(input, target)
    expect(output).toEqual({ summary: 'S' })
    expect(Object.keys(output)).toHaveLength(1)
  })

  it('throws SchemaMismatchError when a required target key is absent from input', () => {
    const input = { summary: 'S' } as unknown as z.infer<typeof Phase1Output>
    const target = Phase1Output.pick({ summary: true, semantics: true })
    expect(() => projectToSchema(input, target)).toThrow(SchemaMismatchError)
  })

  it('throws SchemaMismatchError on type mismatch, never silently coerces', () => {
    const input = { summary: 'S', semantics: 42 as unknown as string }
    const target = Phase1Output.pick({ summary: true, semantics: true })
    expect(() => projectToSchema(input, target)).toThrow(SchemaMismatchError)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run --filter @future/api test:unit -- project-to-schema
```

Expected: FAIL with "Cannot find module './project-to-schema'".

- [ ] **Step 3: Implement the function**

```ts
// apps/api/src/modules/agents/application/services/project-to-schema.ts
import type { ZodObject, ZodRawShape, z } from 'zod'

export class SchemaMismatchError extends Error {
  constructor(
    message: string,
    public readonly issues: unknown,
  ) {
    super(message)
    this.name = 'SchemaMismatchError'
  }
}

/**
 * Field-drop projection. Pure function. No transformation, coercion, or computation.
 *
 * Implements the §3 phase-handoff sanitization contract from the agent-runtime spec:
 * - Project phase-1 output into the target sub-agent's declared input schema.
 * - On any mismatch (missing key, wrong type), throw — never coerce.
 */
export function projectToSchema<TShape extends ZodRawShape>(
  input: Record<string, unknown>,
  target: ZodObject<TShape>,
): z.infer<ZodObject<TShape>> {
  const picked: Record<string, unknown> = {}
  for (const key of Object.keys(target.shape)) {
    if (!(key in input)) {
      throw new SchemaMismatchError(`projectToSchema: target key "${key}" missing from input`, {
        missingKey: key,
      })
    }
    picked[key] = input[key]
  }

  const parsed = target.safeParse(picked)
  if (!parsed.success) {
    throw new SchemaMismatchError(
      'projectToSchema: target schema validation failed',
      parsed.error.issues,
    )
  }
  return parsed.data
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun run --filter @future/api test:unit -- project-to-schema
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agents/application/services/project-to-schema.ts \
        apps/api/src/modules/agents/application/services/project-to-schema.spec.ts
git commit -m "feat(agents): project_to_schema pure-function sanitizer"
```

---

## Task 9: Langfuse OTel wiring

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/telemetry/langfuse-wiring.ts`
- Create: `apps/api/src/modules/agents/infrastructure/telemetry/langfuse-wiring.spec.ts`
- Modify: `apps/api/src/main.ts` (call `initLangfuseOTel()` before NestJS bootstrap)

- [ ] **Step 1: Write failing unit test**

```ts
// apps/api/src/modules/agents/infrastructure/telemetry/langfuse-wiring.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { initLangfuseOTel } from './langfuse-wiring'

describe('initLangfuseOTel', () => {
  it('throws when LANGFUSE_SECRET_KEY is absent', () => {
    vi.stubEnv('LANGFUSE_SECRET_KEY', '')
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk_test')
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://langfuse.local')
    expect(() => initLangfuseOTel()).toThrow(/LANGFUSE_SECRET_KEY/)
    vi.unstubAllEnvs()
  })

  it('throws when LANGFUSE_PUBLIC_KEY is absent', () => {
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk_test')
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', '')
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://langfuse.local')
    expect(() => initLangfuseOTel()).toThrow(/LANGFUSE_PUBLIC_KEY/)
    vi.unstubAllEnvs()
  })

  it('throws when LANGFUSE_BASE_URL is absent', () => {
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk_test')
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk_test')
    vi.stubEnv('LANGFUSE_BASE_URL', '')
    expect(() => initLangfuseOTel()).toThrow(/LANGFUSE_BASE_URL/)
    vi.unstubAllEnvs()
  })

  it('registers OTel and returns a shutdown handle with all three envs present', () => {
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk_test')
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk_test')
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://langfuse.local')
    const handle = initLangfuseOTel()
    expect(handle).toHaveProperty('shutdown')
    expect(typeof handle.shutdown).toBe('function')
    vi.unstubAllEnvs()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run --filter @future/api test:unit -- langfuse-wiring
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the wiring**

```ts
// apps/api/src/modules/agents/infrastructure/telemetry/langfuse-wiring.ts
import { registerOTel } from '@vercel/otel'
import { LangfuseExporter } from 'langfuse-vercel'

export interface LangfuseOTelHandle {
  shutdown: () => Promise<void>
}

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`${key} env var is required for Langfuse OTel wiring`)
  return value
}

/**
 * Registers OpenTelemetry with a Langfuse exporter. Must be called at NestJS bootstrap
 * BEFORE any LLM call fires, otherwise spans emitted via `experimental_telemetry` are lost.
 *
 * Sampling is always-on at the OTel layer; stratified sampling (spec §12) is decided
 * downstream by setting `experimental_telemetry.isEnabled = true/false` per-call.
 */
export function initLangfuseOTel(): LangfuseOTelHandle {
  const exporter = new LangfuseExporter({
    secretKey: requireEnv('LANGFUSE_SECRET_KEY'),
    publicKey: requireEnv('LANGFUSE_PUBLIC_KEY'),
    baseUrl: requireEnv('LANGFUSE_BASE_URL'),
  })

  registerOTel({
    serviceName: 'future-agents',
    traceExporter: exporter,
  })

  return {
    shutdown: async () => {
      await exporter.forceFlush()
      await exporter.shutdown()
    },
  }
}
```

- [ ] **Step 4: Wire it into `main.ts`**

Open `apps/api/src/main.ts` and add at the top of the bootstrap:

```ts
import { initLangfuseOTel } from './modules/agents/infrastructure/telemetry/langfuse-wiring'

// Call BEFORE NestFactory.create — OTel must be registered before any LLM call.
const langfuse = initLangfuseOTel()

process.on('SIGTERM', () => {
  void langfuse.shutdown()
})
process.on('SIGINT', () => {
  void langfuse.shutdown()
})
```

Adjust placement to sit before the existing `NestFactory.create(...)` call and after any env/dotenv load.

- [ ] **Step 5: Run tests**

```bash
bun run --filter @future/api test:unit -- langfuse-wiring
```

Expected: 4 PASS.

- [ ] **Step 6: Verify the app still boots (smoke)**

```bash
LANGFUSE_SECRET_KEY=sk_test LANGFUSE_PUBLIC_KEY=pk_test LANGFUSE_BASE_URL=https://langfuse.local bun run --filter @future/api dev
```

Expected: NestJS starts without throwing; logs show normal bootstrap. Kill with Ctrl-C after a few seconds.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/agents/infrastructure/telemetry/langfuse-wiring.ts \
        apps/api/src/modules/agents/infrastructure/telemetry/langfuse-wiring.spec.ts \
        apps/api/src/main.ts
git commit -m "feat(agents): register Langfuse OTel exporter at app bootstrap"
```

---

## Task 10: Register repositories in `agents.module.ts`

**Files:**

- Modify: `apps/api/src/modules/agents/agents.module.ts`

- [ ] **Step 1: Add imports + providers**

Add to imports:

```ts
import { PROMPT_STORE } from './domain/ports/prompt-store.port'
import { NARRATIVE_STORE } from './domain/ports/narrative-store.port'
import { DrizzlePromptStoreRepository } from './infrastructure/repositories/drizzle-prompt-store.repository'
import { DrizzleNarrativeStoreRepository } from './infrastructure/repositories/drizzle-narrative-store.repository'
```

Add to the module's `providers` array:

```ts
{ provide: PROMPT_STORE, useClass: DrizzlePromptStoreRepository },
{ provide: NARRATIVE_STORE, useClass: DrizzleNarrativeStoreRepository },
```

Do **not** add to `exports` — these stores are internal to the agents module; cross-module access is only through the `AgentsQueryFacade`.

- [ ] **Step 2: Typecheck**

```bash
bun run --filter @future/api typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/agents/agents.module.ts
git commit -m "feat(agents): wire PromptStore + NarrativeStore providers"
```

---

## Self-check before leaving Plan 01

- [ ] All 10 tasks committed; one logical change per commit.
- [ ] `bun run --filter @future/api test:unit` green.
- [ ] `bun run --filter @future/api test:integration` green.
- [ ] Migration applied; `psql ... \d+ agents.agent_prompt_store` shows RLS enabled + forced.
- [ ] `bun run --filter @future/api dev` boots without env-related throws (requires the 3 Langfuse envs).

Next: **02-gateway.md** — refactor `AgentToolExecutor` into `ToolGateway` with the 10-step pipeline.

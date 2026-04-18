# Plan 01 — Schema Consolidation

> Covers spec §4. Ships first. Unblocks plans 02, 03, 05, 07.

**Goal:** Land one Drizzle migration that adds every schema delta the 10 feature PRs need, plus the `JobHistoryEntry` entity and `IJobHistoryRepository` port/impl wiring. No handler code, no router wiring.

**Architecture:** One migration file under `packages/db/drizzle/migrations/`. Schema additions in `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`. New entity + repo port in `domain/`. Drizzle adapter in `infrastructure/repositories/`.

**Tech stack:** Drizzle ORM, PostgreSQL 16, NestJS DI.

---

## File Map

| File                                                                                     | Action | Purpose                                                                                               |
| ---------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`                     | Modify | Add `jobHistory` table; add `previousProfileId` on `employment`; add enum values on `profile_section` |
| `apps/api/src/modules/people/infrastructure/schema/index.ts`                             | Modify | Re-export `jobHistory`                                                                                |
| `packages/db/drizzle/migrations/0002_employee_completion_schema.sql`                     | Create | Migration: table + column + enum values + GIN index                                                   |
| `packages/db/drizzle/migrations/meta/_journal.json`                                      | Modify | Drizzle regenerates when `bun run db:generate` runs                                                   |
| `apps/api/src/modules/people/domain/entities/job-history-entry.entity.ts`                | Create | `JobHistoryEntry` entity (plain TS, no NestJS)                                                        |
| `apps/api/src/modules/people/domain/repositories/job-history.repository.ts`              | Create | `IJobHistoryRepository` interface + `JOB_HISTORY_REPOSITORY` symbol                                   |
| `apps/api/src/modules/people/infrastructure/repositories/job-history.repository.ts`      | Create | Drizzle adapter                                                                                       |
| `apps/api/src/modules/people/infrastructure/repositories/job-history.repository.spec.ts` | Create | Integration test against real DB (Testcontainers)                                                     |
| `apps/api/src/modules/people/people.module.ts`                                           | Modify | Provide `JOB_HISTORY_REPOSITORY` → `JobHistoryRepositoryImpl`                                         |

---

## Open question resolved before writing the migration

**Does `job_history` backfill from `job_assignment`?** Default answer for this plan: **forward-only**. The migration creates an empty `job_history` table; history starts accumulating when handlers begin writing to it in Plan 02. Document this explicitly in the PR description. If product later requires backfill, a separate migration handles it.

---

## Task 1 — Add `jobHistory` table to Drizzle schema (TDD)

**Files:**

- Modify: `apps/api/src/modules/people/infrastructure/schema/people.schema.ts`
- Modify: `apps/api/src/modules/people/infrastructure/schema/index.ts`

- [ ] **Step 1:** Append `jobHistory` table definition at the end of `people.schema.ts`. The shape:

```ts
export const jobHistory = peopleSchema.table(
  'job_history',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    profileId: uuid('profile_id').notNull(),
    effectiveFrom: date('effective_from', { mode: 'date' }).notNull(),
    effectiveTo: date('effective_to', { mode: 'date' }),
    jobTitle: text('job_title'),
    departmentId: uuid('department_id'),
    managerProfileId: uuid('manager_profile_id'),
    changeType: text('change_type', {
      enum: [
        'hire',
        'promotion',
        'lateral',
        'demotion',
        'department_transfer',
        'manager_change',
        'termination',
        'rehire',
      ],
    }).notNull(),
    changeReason: text('change_reason'),
    recordedAt: timestamp('recorded_at').defaultNow().notNull(),
    recordedBy: uuid('recorded_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('job_history_tenant_profile_from_uidx').on(
      table.tenantId,
      table.profileId,
      table.effectiveFrom,
    ),
  ],
)
```

- [ ] **Step 2:** In the same file, add `previousProfileId: uuid('previous_profile_id')` (nullable, no FK constraint — see CLAUDE.md "no FK constraints across schema boundaries"; within-schema we can add a FK but keeping it nullable + soft-linked is simpler and matches existing `photoDocumentId` style).

- [ ] **Step 3:** Extend the `profile_section` enum where it's declared. Find it via `grep -n "profile_section" apps/api/src/modules/people/infrastructure/schema/*.ts`. Add the four new values: `work_experience`, `emergency_contact`, `project_history`, `license`.

- [ ] **Step 4:** Re-export `jobHistory` from `schema/index.ts`.

- [ ] **Step 5:** Commit.

```bash
git add apps/api/src/modules/people/infrastructure/schema/
git commit -m "feat(people): add jobHistory table + previousProfileId + profile_section enum values"
```

---

## Task 2 — Generate Drizzle migration

**Files:**

- Create: `packages/db/drizzle/migrations/0002_employee_completion_schema.sql`
- Modify: `packages/db/drizzle/migrations/meta/_journal.json` (auto)

- [ ] **Step 1:** Generate:

```bash
cd packages/db
bun run db:generate
```

The generator emits `0002_*.sql` with the new table + column + enum ALTER. Review the output — specifically confirm the enum additions use `ALTER TYPE ... ADD VALUE` (these cannot run inside a transaction in Postgres prior to 12; Postgres 16 allows it, but Drizzle may generate a separate statement).

- [ ] **Step 2:** Hand-edit the generated SQL to add:
  - RLS policy on `job_history` mirroring `employment`: enable RLS + create `tenant_isolation` policy using `current_setting('app.tenant_id')`.
  - GIN index on `employment_detail.custom_fields`: `CREATE INDEX CONCURRENTLY IF NOT EXISTS employment_detail_custom_fields_gin_idx ON people.employment_detail USING gin (custom_fields);` — this covers task 006's schema gap in the same migration.
  - Index on `job_history (tenant_id, profile_id, effective_to)` for chronological lookups: `CREATE INDEX IF NOT EXISTS job_history_tenant_profile_eto_idx ON people.job_history (tenant_id, profile_id, effective_to);`.

- [ ] **Step 3:** Apply the migration to a local dev DB:

```bash
cd packages/db
bun run db:migrate
```

Expected: migration runs clean, `psql` shows the new table with `tenant_id` and RLS enabled.

- [ ] **Step 4:** Commit.

```bash
git add packages/db/drizzle/migrations/
git commit -m "feat(db): migration 0002 - employee completion schema"
```

---

## Task 3 — Create `JobHistoryEntry` domain entity (TDD)

**Files:**

- Create: `apps/api/src/modules/people/domain/entities/job-history-entry.entity.ts`

Domain entities in this module are plain TS shapes. Look at `employment.entity.ts` for reference.

- [ ] **Step 1:** Write the entity:

```ts
export type JobHistoryChangeType =
  | 'hire'
  | 'promotion'
  | 'lateral'
  | 'demotion'
  | 'department_transfer'
  | 'manager_change'
  | 'termination'
  | 'rehire'

export interface JobHistoryEntry {
  id: string
  tenantId: string
  profileId: string
  effectiveFrom: Date
  effectiveTo: Date | null
  jobTitle: string | null
  departmentId: string | null
  managerProfileId: string | null
  changeType: JobHistoryChangeType
  changeReason: string | null
  recordedAt: Date
  recordedBy: string | null
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2:** Commit.

```bash
git add apps/api/src/modules/people/domain/entities/job-history-entry.entity.ts
git commit -m "feat(people): JobHistoryEntry domain entity"
```

---

## Task 4 — Create `IJobHistoryRepository` port (TDD)

**Files:**

- Create: `apps/api/src/modules/people/domain/repositories/job-history.repository.ts`

- [ ] **Step 1:** Write the interface:

```ts
import type { JobHistoryEntry, JobHistoryChangeType } from '../entities/job-history-entry.entity'

export const JOB_HISTORY_REPOSITORY = Symbol('IJobHistoryRepository')

export interface IJobHistoryRepository {
  findByProfile(profileId: string, tenantId: string): Promise<JobHistoryEntry[]>

  findAsOf(profileId: string, tenantId: string, asOf: Date): Promise<JobHistoryEntry | null>

  findLatest(profileId: string, tenantId: string): Promise<JobHistoryEntry | null>

  recordChange(
    entry: Omit<JobHistoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'recordedAt'>,
  ): Promise<JobHistoryEntry>

  closeOpenEntry(profileId: string, tenantId: string, effectiveTo: Date): Promise<void>
}
```

- [ ] **Step 2:** Commit.

```bash
git add apps/api/src/modules/people/domain/repositories/job-history.repository.ts
git commit -m "feat(people): IJobHistoryRepository port"
```

---

## Task 5 — Drizzle adapter for `IJobHistoryRepository` (TDD)

**Files:**

- Create: `apps/api/src/modules/people/infrastructure/repositories/job-history.repository.ts`
- Create: `apps/api/src/modules/people/infrastructure/repositories/job-history.repository.spec.ts`

Reference: `employment.repository.ts` in the same directory for the pattern — inject `DB_TOKEN`, use `drizzle-orm` query builder, convert rows to entity shape.

- [ ] **Step 1:** Write the integration test first (`*.spec.ts`). Use Testcontainers per existing pattern. Cover:
  - `recordChange` inserts a row and returns the entry with generated `id`, `recordedAt`, `createdAt`, `updatedAt`.
  - `findByProfile` returns entries ordered by `effectiveFrom` DESC.
  - `findAsOf(asOf)` returns the entry where `effectiveFrom <= asOf AND (effectiveTo IS NULL OR effectiveTo > asOf)`.
  - `findLatest` returns the entry with `effectiveTo IS NULL`, else the highest `effectiveFrom`.
  - `closeOpenEntry` sets `effectiveTo` on the open entry (where `effectiveTo IS NULL`) and leaves closed entries untouched.
  - RLS isolation: entries inserted under tenant A are invisible under tenant B's session.

- [ ] **Step 2:** Run the test:

```bash
bun run --filter @future/api test:integration -- job-history.repository
```

Expected: FAIL — file not found.

- [ ] **Step 3:** Implement `JobHistoryRepositoryImpl`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, isNull, lte, gt, or, sql } from 'drizzle-orm'
import { DB_TOKEN, type DrizzleDb } from '@future/db'
import { jobHistory } from '../schema/people.schema'
import type { IJobHistoryRepository } from '../../domain/repositories/job-history.repository'
import type { JobHistoryEntry } from '../../domain/entities/job-history-entry.entity'

@Injectable()
export class JobHistoryRepositoryImpl implements IJobHistoryRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: DrizzleDb) {}

  async findByProfile(profileId: string, tenantId: string): Promise<JobHistoryEntry[]> {
    const rows = await this.db
      .select()
      .from(jobHistory)
      .where(and(eq(jobHistory.tenantId, tenantId), eq(jobHistory.profileId, profileId)))
      .orderBy(desc(jobHistory.effectiveFrom))
    return rows.map(this.toEntity)
  }

  async findAsOf(profileId: string, tenantId: string, asOf: Date): Promise<JobHistoryEntry | null> {
    const rows = await this.db
      .select()
      .from(jobHistory)
      .where(
        and(
          eq(jobHistory.tenantId, tenantId),
          eq(jobHistory.profileId, profileId),
          lte(jobHistory.effectiveFrom, asOf),
          or(isNull(jobHistory.effectiveTo), gt(jobHistory.effectiveTo, asOf)),
        ),
      )
      .limit(1)
    return rows[0] ? this.toEntity(rows[0]) : null
  }

  async findLatest(profileId: string, tenantId: string): Promise<JobHistoryEntry | null> {
    const open = await this.db
      .select()
      .from(jobHistory)
      .where(
        and(
          eq(jobHistory.tenantId, tenantId),
          eq(jobHistory.profileId, profileId),
          isNull(jobHistory.effectiveTo),
        ),
      )
      .limit(1)
    if (open[0]) return this.toEntity(open[0])

    const closed = await this.db
      .select()
      .from(jobHistory)
      .where(and(eq(jobHistory.tenantId, tenantId), eq(jobHistory.profileId, profileId)))
      .orderBy(desc(jobHistory.effectiveFrom))
      .limit(1)
    return closed[0] ? this.toEntity(closed[0]) : null
  }

  async recordChange(entry: Parameters<IJobHistoryRepository['recordChange']>[0]) {
    const [row] = await this.db.insert(jobHistory).values(entry).returning()
    return this.toEntity(row)
  }

  async closeOpenEntry(profileId: string, tenantId: string, effectiveTo: Date): Promise<void> {
    await this.db
      .update(jobHistory)
      .set({ effectiveTo, updatedAt: new Date() })
      .where(
        and(
          eq(jobHistory.tenantId, tenantId),
          eq(jobHistory.profileId, profileId),
          isNull(jobHistory.effectiveTo),
        ),
      )
  }

  private toEntity(row: typeof jobHistory.$inferSelect): JobHistoryEntry {
    return { ...row }
  }
}
```

Note: no `Promise.all` — each query is sequential (CLAUDE.md DB rule).

- [ ] **Step 4:** Run the test again. Expected: PASS.

- [ ] **Step 5:** Commit.

```bash
git add apps/api/src/modules/people/infrastructure/repositories/job-history.repository.*
git commit -m "feat(people): Drizzle adapter for IJobHistoryRepository"
```

---

## Task 6 — Wire `JOB_HISTORY_REPOSITORY` into `people.module.ts`

**Files:**

- Modify: `apps/api/src/modules/people/people.module.ts`

- [ ] **Step 1:** Add to the module's `providers`:

```ts
{
  provide: JOB_HISTORY_REPOSITORY,
  useClass: JobHistoryRepositoryImpl,
},
```

Import the symbol from `./domain/repositories/job-history.repository` and the class from `./infrastructure/repositories/job-history.repository` (no `.js` extensions — CLAUDE.md TypeScript rule).

- [ ] **Step 2:** Run the module's test suite:

```bash
bun run --filter @future/api test:unit -- people.module
```

Expected: existing tests still pass; no new compile errors.

- [ ] **Step 3:** Commit.

```bash
git add apps/api/src/modules/people/people.module.ts
git commit -m "feat(people): wire JOB_HISTORY_REPOSITORY into module"
```

---

## Task 7 — Migration smoke test

**Files:**

- Existing: `packages/db/src/test-helpers/` (whatever lives here today)

- [ ] **Step 1:** Run the full integration suite to confirm the migration applies cleanly and no existing tests regress:

```bash
bun run --filter @future/api test:integration
```

Expected: all green. If a previously-seeded test fixture breaks due to the enum expansion, update the fixture — new values are additive so this should not occur.

- [ ] **Step 2:** Run unit tests across the monorepo to confirm nothing else broke:

```bash
bun run test:unit
```

Expected: green.

---

## Task 8 — Update PROGRESS.md and open PR

**Files:**

- Modify: `docs/clones/ems/PROGRESS.md`

- [ ] **Step 1:** In PROGRESS.md, add a note next to `employee/001-schema-evolution`:

```
| 001-schema-evolution            | in-progress (schema landed in PR #NNN) | high     | —          |
```

Leave it `in-progress` — the task fully closes in Plan 02 which adds handler wiring.

- [ ] **Step 2:** Open PR with the description template from `README.md`. Call out the forward-only backfill decision explicitly in "Spec re-read deltas".

- [ ] **Step 3:** After merge, mark `01-schema-consolidation.md` complete and begin Plan 02.

---

## Acceptance criteria

- Migration `0002_*` applied to dev + CI DB with no errors.
- `job_history` table exists with `tenant_id` + RLS enabled.
- `employment.previous_profile_id` column exists, nullable.
- `profile_section` enum contains the four new values.
- `employment_detail.custom_fields` has a GIN index.
- `IJobHistoryRepository` + `JobHistoryRepositoryImpl` exist; integration test green.
- `JOB_HISTORY_REPOSITORY` provided by `people.module.ts`.
- No handler code introduced in this PR.

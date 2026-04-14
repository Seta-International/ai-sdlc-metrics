# Future — Project Rules and Engineering Standards

**Date:** 2026-04-09
**Status:** Agreed
**Project:** Seta Future AaaS

---

## The Non-Negotiables

PRs violating any of these do not merge.

### 1. UUID v7 on every ID column

```ts
// ✓
id: uuid('id')
  .$defaultFn(() => uuidv7())
  .primaryKey()

// ✗
id: serial('id').primaryKey()
id: uuid('id')
  .$defaultFn(() => randomUUID())
  .primaryKey()
```

### 2. No FK constraints across module schemas

```ts
// ✓
actorId: uuid('actor_id').notNull()

// ✗
actorId: uuid('actor_id')
  .notNull()
  .references(() => coreSchema.actor.id)
```

### 3. audit_event is INSERT-only

```ts
// ✓
await db.insert(auditEventTable).values({ ... })

// ✗
await db.update(auditEventTable).set({ ... })
await db.delete(auditEventTable).where(...)
```

GDPR: anonymise PII fields in the payload JSONB instead of deleting records. Preserve the record structure and `actor_id`.

### 4. RLS set_config is always transaction-local

```ts
// ✓ — third arg false = transaction-local
await db.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, false)`)

// ✗ — session-local, leaks across pooled connections
await db.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
```

Outbox relay and pg-boss workers are not request-scoped — they must call `set_config` explicitly per record processed.

### 5. Bot tokens in Secrets Manager, never in the database

```ts
// ✓ — store the ARN
botTokenRef: 'arn:aws:secretsmanager:ap-southeast-1:...'

// ✗
botToken: 'xoxb-...'
```

`ChannelTokenCacheService` caches the resolved token in a process-level Map (TTL: 5 minutes).

### 6. MCP tool handlers must be concurrency-safe

OpenAI executes parallel tool calls by default — multiple tools in a single reasoning step run concurrently. All MCP tool handlers MUST be safe for concurrent execution.

```ts
// ✓ CORRECT — reads only, always safe
@Tool({ name: 'time_get_leave_balance' })
async getLeaveBalance(@Context() ctx, @Input() input: GetLeaveBalanceInput) {
  return this.timeQueryFacade.getLeaveBalance(input.actorId, ctx.tenantId)
}

// ✓ CORRECT — upsert with conflict handling is concurrency-safe
@Tool({ name: 'time_submit_leave_request' })
async submitLeaveRequest(@Context() ctx, @Input() input: SubmitLeaveInput) {
  return this.commandBus.execute(new SubmitLeaveRequestCommand(...))
  // command handler uses INSERT with conflict key — safe if called twice
}

// ✗ WRONG — blind insert races with a concurrent tool call
async someToolHandler() {
  await this.repo.insert({ ... })  // will fail or duplicate if run concurrently
}
```

**Rule:** if a tool handler writes to the database, use upsert with a natural conflict key or wrap in a serializable transaction. Never assume sequential tool execution.

---

## Module Boundary Rules

One module may only import another module's `QueryFacade`. No repositories, no domain entities, no infrastructure classes.

```ts
// ✓
import { PeopleQueryFacade } from '../../people/application/facades/people-query.facade'

// ✗
import { EmploymentContractRepository } from '../../people/infrastructure/repositories/employment-contract.repository'
import { EmploymentContract } from '../../people/domain/entities/employment-contract.entity'
```

Cross-module writes use domain events only. Events live in `packages/event-contracts` with zero NestJS/Drizzle imports.

```ts
// packages/event-contracts/src/time/timesheet-submitted.event.ts
export class TimesheetSubmittedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly timesheetId: string,
    public readonly periodEnd: Date,
  ) {}
}
```

---

## Command Handlers — Validation Contract

Validate cross-module references before writing. Always.

```ts
async execute(command: SubmitLeaveRequestCommand): Promise<LeaveRequest> {
  const actor = await this.kernelQuery.getActor(command.actorId, command.tenantId)
  if (!actor) throw new ActorNotFoundException(command.actorId)
  if (actor.status === 'archived') throw new ActorArchivedException(command.actorId)

  return this.leaveRepo.insert({ ... })
}
```

---

## Event Handler Idempotency

All cross-module event handlers must be idempotent. The outbox relay delivers at-least-once.

```ts
// ✓ — upsert, not insert
await this.peopleRepo.upsert(
  { actorId: event.actorId, tenantId: event.tenantId },
  { displayName: event.displayName, updatedAt: new Date() },
  { onConflict: 'actorId' }
)

// ✗ — fails on duplicate delivery
await this.peopleRepo.insert({ actorId: event.actorId, ... })
```

---

## Error Handling

Never swallow errors silently. Use typed domain exceptions, not generic `Error`.

```ts
// ✓
try {
  await this.leaveRepo.insert(...)
} catch (error) {
  this.logger.error('Failed to insert leave request', { error, actorId: command.actorId })
  throw new LeaveRequestPersistenceException(error)
}
```

```ts
// modules/time/domain/exceptions/leave-request.exceptions.ts
export class LeaveRequestPersistenceException extends Error {
  constructor(cause: unknown) {
    super('Failed to persist leave request')
    this.cause = cause
  }
}
```

tRPC translates domain exceptions to HTTP status codes. Never expose SQL error messages or stack traces to clients.

---

## Naming Conventions

### Database

| Thing   | Convention              | Example                         |
| ------- | ----------------------- | ------------------------------- |
| Tables  | `snake_case`, plural    | `employment_contracts`          |
| Columns | `snake_case`            | `actor_id`, `created_at`        |
| Schemas | singular module name    | `people`, `time`, `core`        |
| Indexes | `idx_{table}_{columns}` | `idx_employment_contract_actor` |
| Enums   | `snake_case`            | `full_time`, `part_time`        |

### TypeScript

- In backend packages using `moduleResolution: "nodenext"` and `module: "nodenext"`, use `.js` extensions in relative imports so the emitted Node ESM code resolves at runtime (for example `import { Foo } from './foo.js'`). In bundler-managed frontend packages, follow the local package convention.

| Thing      | Convention                   | Example                             |
| ---------- | ---------------------------- | ----------------------------------- |
| Classes    | `PascalCase`                 | `EmploymentContractRepository`      |
| Interfaces | `PascalCase`, no `I` prefix  | `LeaveRequestPort`                  |
| Files      | `kebab-case`                 | `employment-contract.repository.ts` |
| Events     | `PascalCase` + `Event`       | `TimesheetSubmittedEvent`           |
| Commands   | `PascalCase` + `Command`     | `SubmitLeaveRequestCommand`         |
| Handlers   | `PascalCase` + `Handler`     | `SubmitLeaveRequestHandler`         |
| Facades    | `PascalCase` + `QueryFacade` | `PeopleQueryFacade`                 |
| MCP tools  | `{module}_{verb}_{noun}`     | `time_submit_leave_request`         |

### tRPC routers: `module.noun.verb`

```ts
export const timeRouter = router({
  leaveRequest: router({
    submit: protectedProcedure.input(SubmitLeaveRequestSchema).mutation(...)
    list: protectedProcedure.query(...)
    approve: protectedProcedure.input(ApproveLeaveSchema).mutation(...)
  }),
})
```

---

## Git

Commit format: `type(scope): description`

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`
Scopes: module names (`people`, `time`, `kernel`) or areas (`deploy`, `ci`)

Branch: `feat/{ticket}` or `fix/{ticket}` off `main`. No long-lived branches. No `develop`.

PR requirements: CI green + one reviewer approval.

### Git Rules (No Exceptions)

- **Never push directly to `main`.** All changes go through a PR.
- **Always checkout a new branch** before starting any work. Never commit on `main`.
- **Never use `git worktree`.** Use `git checkout -b <branch>` to work on a new branch.
- **Never force-push** (`--force`) or hard-reset (`git reset --hard`) on shared branches.

### Package / Workspace Management (No Exceptions)

- **Never manually edit `package.json`, `bun.lock`, or any lockfile.**
- Install dependencies via CLI: `bun add <pkg>`, `bun add -d <pkg>`, `bun add <pkg>@<version>`, `bun remove <pkg>`.
- Add a new app or package to the monorepo via Turborepo CLI: `turbo gen workspace` — never create the directory and `package.json` by hand.
- Add a workspace dependency between packages: `bun add <pkg> --filter <workspace>`.

---

## Security

- Never log secrets or credentials.
- Ignore client-provided `tenantId`. Always derive it from the server-side session.
- Never interpolate unsanitized input into `sql` template literals. Use Drizzle's parameterized API.
- All MCP tool calls require a valid `exposure_contract` + `canDo()` permission check for the actor in that tenant.
- All tRPC mutations and sensitive queries must declare `.meta({ permission: '...' })` and use `protectedProcedure`.
- Directory sync only touches `role_grant` entries with `source = 'idp_sync'`. Manual grants are never modified by sync.
- Identity module writes to kernel tables via command bus only — never direct DB access across module boundaries.
- Never use a hardcoded OpenAI API key. Resolve via `AdminQueryFacade.getResolvedAiConfig()` — tenant BYO key takes precedence over platform default.
- `tenant_admin` role gates `web-admin` access. `platform_admin` is a SETA-internal role — never assign to tenant actors.

---

## Performance

**No N+1 queries.** Use `leftJoin` or a batch `inArray` query.

```ts
// ✓
const results = await db
  .select({ contract: employmentContractTable, actor: actorTable })
  .from(employmentContractTable)
  .leftJoin(actorTable, eq(employmentContractTable.actorId, actorTable.id))
  .where(eq(employmentContractTable.tenantId, tenantId))
```

**Current org placement:** always include `isNull(orgPlacementTable.effectiveUntil)` to hit the partial index `idx_org_placement_actor_current`.

**Analytics queries** go through `trpc.insights.*` → Athena. Never run aggregates directly against the OLTP DB or read replica.

---

## Testing (TDD — No Exceptions)

- **Write the test first.** A feature is not started until a failing test exists. A feature is not done until the test passes.
- **Minimum 70% coverage** (lines, functions, branches). PRs that drop below 70% are blocked.
- Command handlers: unit test for happy path + every error path.
- Cross-module interactions: integration test against a real database.
- Critical user flows: E2E Playwright test.
- Tests are co-located: `create-employment-contract.handler.spec.ts` next to `create-employment-contract.handler.ts`.

---

## Module Development Checklist

- [ ] Domain entity/value object in `domain/`
- [ ] Command or query class in `application/commands/` or `application/queries/`
- [ ] Handler: validate first, write second
- [ ] Domain exception classes for each failure mode
- [ ] Drizzle schema updated, migration generated (`bun run db:generate`)
- [ ] Repository implements the domain port from `domain/`
- [ ] Domain event emitted for any state change other modules may care about
- [ ] tRPC route in `interface/trpc/` with `.meta({ permission })` on protected procedures
- [ ] Permission check: `canDo()` in middleware (simple) or handler (scope-dependent)
- [ ] Unit tests: handler happy path + each error path + permission denial
- [ ] Integration test: repository + tenant RLS isolation
- [ ] `audit_event` written for compliance-significant actions
- [ ] If agent-accessible: MCP tool with `exposure_contract` check
- [ ] If admin-configurable: route protected by `AdminQueryFacade.isModuleEnabled()` check in tRPC middleware

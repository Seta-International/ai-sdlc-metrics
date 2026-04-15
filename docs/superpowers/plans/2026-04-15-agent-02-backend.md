# Embedded Agent — Plan 02: Backend Routes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tRPC routes for agent sessions, messages, insights, and config. These endpoints power all three frontend surfaces. LLM response streaming uses SSE via tRPC subscriptions (aligns with Vercel AI SDK).

**Architecture:** tRPC routes follow existing pattern (Zod input, publicProcedure/permissionProtectedProcedure). No WebSocket — client sends messages via tRPC mutations, receives streaming responses via tRPC SSE subscriptions. Agent Gateway orchestration (LLM reasoning loop) is out of scope — this plan builds the transport layer that the gateway will plug into.

**Tech Stack:** NestJS, tRPC, Zod, Vitest

**Spec Reference:** `docs/superpowers/specs/2026-04-15-agent-embedded-design.md` — Backend Changes, New tRPC Routes

**Depends On:** Plan 01 (types are shared between frontend and backend)

---

## File Structure

### Files to CREATE

```
# tRPC routes
apps/api/src/modules/agents/interface/trpc/session.router.ts
apps/api/src/modules/agents/interface/trpc/insight.router.ts
apps/api/src/modules/agents/interface/trpc/definition.router.ts

# Application layer
apps/api/src/modules/agents/application/commands/create-session.command.ts
apps/api/src/modules/agents/application/commands/create-session.handler.ts
apps/api/src/modules/agents/application/commands/create-session.handler.spec.ts
apps/api/src/modules/agents/application/commands/send-message.command.ts
apps/api/src/modules/agents/application/commands/send-message.handler.ts
apps/api/src/modules/agents/application/commands/send-message.handler.spec.ts
apps/api/src/modules/agents/application/commands/dismiss-insight.command.ts
apps/api/src/modules/agents/application/commands/dismiss-insight.handler.ts
apps/api/src/modules/agents/application/commands/dismiss-insight.handler.spec.ts
apps/api/src/modules/agents/application/queries/list-sessions.query.ts
apps/api/src/modules/agents/application/queries/list-sessions.handler.ts
apps/api/src/modules/agents/application/queries/list-sessions.handler.spec.ts
apps/api/src/modules/agents/application/queries/list-insights.query.ts
apps/api/src/modules/agents/application/queries/list-insights.handler.ts
apps/api/src/modules/agents/application/queries/list-insights.handler.spec.ts

# Domain
apps/api/src/modules/agents/domain/entities/agent-session.entity.ts
apps/api/src/modules/agents/domain/entities/agent-message.entity.ts
apps/api/src/modules/agents/domain/entities/agent-insight.entity.ts
apps/api/src/modules/agents/domain/repositories/agent-session.repository.ts
apps/api/src/modules/agents/domain/repositories/agent-message.repository.ts
apps/api/src/modules/agents/domain/repositories/agent-insight.repository.ts

# Infrastructure
apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts (rewrite)
apps/api/src/modules/agents/infrastructure/repositories/drizzle-agent-session.repository.ts
apps/api/src/modules/agents/infrastructure/repositories/drizzle-agent-message.repository.ts
apps/api/src/modules/agents/infrastructure/repositories/drizzle-agent-insight.repository.ts
```

### Files to MODIFY

```
apps/api/src/modules/agents/interface/trpc/agents.router.ts  → compose sub-routers
apps/api/src/modules/agents/agents.module.ts                  → register new providers
```

---

### Task 1: Agent database schema

**Files:**

- Modify: `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts`

- [ ] **Step 1: Read the current schema stub**

```bash
cat apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts
```

- [ ] **Step 2: Write the schema**

Rewrite `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts`:

```typescript
import { pgSchema, uuid, text, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core'

export const agentsSchema = pgSchema('agents')

export const agentSessions = agentsSchema.table('agent_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  agentId: uuid('agent_id'),
  channelType: text('channel_type').notNull().default('web_chat'),
  status: text('status').notNull().default('active'),
  contextModule: text('context_module'),
  contextEntity: text('context_entity'),
  contextEntityId: text('context_entity_id'),
  contextMetadata: jsonb('context_metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
})

export const agentMessages = agentsSchema.table('agent_message', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  toolName: text('tool_name'),
  toolArgs: jsonb('tool_args'),
  modelUsed: text('model_used'),
  tokensUsed: integer('tokens_used'),
  isError: boolean('is_error').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentInsights = agentsSchema.table('agent_insight', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  module: text('module').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  severity: text('severity').notNull().default('info'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  actionLabel: text('action_label'),
  actionHref: text('action_href'),
  isDismissed: boolean('is_dismissed').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/api && npx tsc --noEmit --pretty
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts
git commit -m "feat(agents): add database schema for sessions, messages, insights"
```

---

### Task 2: Domain entities and repository interfaces

**Files:**

- Create: `apps/api/src/modules/agents/domain/entities/agent-session.entity.ts`
- Create: `apps/api/src/modules/agents/domain/entities/agent-message.entity.ts`
- Create: `apps/api/src/modules/agents/domain/entities/agent-insight.entity.ts`
- Create: `apps/api/src/modules/agents/domain/repositories/agent-session.repository.ts`
- Create: `apps/api/src/modules/agents/domain/repositories/agent-message.repository.ts`
- Create: `apps/api/src/modules/agents/domain/repositories/agent-insight.repository.ts`

- [ ] **Step 1: Create domain entities**

Create `apps/api/src/modules/agents/domain/entities/agent-session.entity.ts`:

```typescript
export interface AgentSessionEntity {
  id: string
  tenantId: string
  actorId: string
  agentId: string | null
  channelType: string
  status: 'active' | 'completed' | 'escalated' | 'expired' | 'error'
  contextModule: string | null
  contextEntity: string | null
  contextEntityId: string | null
  contextMetadata: Record<string, unknown> | null
  createdAt: Date
  endedAt: Date | null
}
```

Create `apps/api/src/modules/agents/domain/entities/agent-message.entity.ts`:

```typescript
export interface AgentMessageEntity {
  id: string
  sessionId: string
  tenantId: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  toolName: string | null
  toolArgs: Record<string, unknown> | null
  modelUsed: string | null
  tokensUsed: number | null
  isError: boolean
  createdAt: Date
}
```

Create `apps/api/src/modules/agents/domain/entities/agent-insight.entity.ts`:

```typescript
export interface AgentInsightEntity {
  id: string
  tenantId: string
  actorId: string
  module: string
  entity: string
  entityId: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  actionLabel: string | null
  actionHref: string | null
  isDismissed: boolean
  createdAt: Date
}
```

- [ ] **Step 2: Create repository interfaces**

Create `apps/api/src/modules/agents/domain/repositories/agent-session.repository.ts`:

```typescript
import type { AgentSessionEntity } from '../entities/agent-session.entity'

export interface AgentSessionRepository {
  create(
    session: Omit<AgentSessionEntity, 'id' | 'createdAt' | 'endedAt'>,
  ): Promise<AgentSessionEntity>
  findById(id: string, tenantId: string): Promise<AgentSessionEntity | null>
  findByActor(actorId: string, tenantId: string, limit: number): Promise<AgentSessionEntity[]>
  updateStatus(id: string, tenantId: string, status: AgentSessionEntity['status']): Promise<void>
}

export const AGENT_SESSION_REPOSITORY = Symbol('AGENT_SESSION_REPOSITORY')
```

Create `apps/api/src/modules/agents/domain/repositories/agent-message.repository.ts`:

```typescript
import type { AgentMessageEntity } from '../entities/agent-message.entity'

export interface AgentMessageRepository {
  create(message: Omit<AgentMessageEntity, 'id' | 'createdAt'>): Promise<AgentMessageEntity>
  findBySession(sessionId: string, tenantId: string): Promise<AgentMessageEntity[]>
}

export const AGENT_MESSAGE_REPOSITORY = Symbol('AGENT_MESSAGE_REPOSITORY')
```

Create `apps/api/src/modules/agents/domain/repositories/agent-insight.repository.ts`:

```typescript
import type { AgentInsightEntity } from '../entities/agent-insight.entity'

export interface AgentInsightRepository {
  create(
    insight: Omit<AgentInsightEntity, 'id' | 'createdAt' | 'isDismissed'>,
  ): Promise<AgentInsightEntity>
  findByActor(actorId: string, tenantId: string): Promise<AgentInsightEntity[]>
  dismiss(id: string, tenantId: string): Promise<void>
}

export const AGENT_INSIGHT_REPOSITORY = Symbol('AGENT_INSIGHT_REPOSITORY')
```

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/api && npx tsc --noEmit --pretty
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/agents/domain/
git commit -m "feat(agents): add domain entities and repository interfaces"
```

---

### Task 3: Infrastructure repositories (Drizzle)

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/repositories/drizzle-agent-session.repository.ts`
- Create: `apps/api/src/modules/agents/infrastructure/repositories/drizzle-agent-message.repository.ts`
- Create: `apps/api/src/modules/agents/infrastructure/repositories/drizzle-agent-insight.repository.ts`

Before implementing, read an existing Drizzle repository for the injection pattern:

```bash
find apps/api/src/modules -name "drizzle-*.repository.ts" | head -3
```

Read one to get the exact pattern for `@Inject(DB_TOKEN)`, `Db` type, query builder usage.

- [ ] **Step 1: Implement DrizzleAgentSessionRepository**

Follow the existing repository pattern (inject DB_TOKEN, use Db type from @future/db, query with eq/and/desc from drizzle-orm). Implement:

- `create`: insert into agentSessions, return result
- `findById`: select where id + tenantId, limit 1
- `findByActor`: select where actorId + tenantId, order by createdAt desc, limit
- `updateStatus`: update set status + endedAt where id + tenantId

- [ ] **Step 2: Implement DrizzleAgentMessageRepository**

- `create`: insert into agentMessages, return result
- `findBySession`: select where sessionId + tenantId, order by createdAt asc

- [ ] **Step 3: Implement DrizzleAgentInsightRepository**

- `create`: insert into agentInsights, return result
- `findByActor`: select where actorId + tenantId + isDismissed=false
- `dismiss`: update set isDismissed=true where id + tenantId

- [ ] **Step 4: Verify typecheck**

```bash
cd apps/api && npx tsc --noEmit --pretty
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agents/infrastructure/repositories/
git commit -m "feat(agents): add Drizzle repository implementations"
```

---

### Task 4: Application layer — commands and queries

**Files:**

- Create all command/query files listed in File Structure (commands: create-session, send-message, dismiss-insight; queries: list-sessions, list-insights)

Before implementing, read the existing command handler pattern:

```bash
cat apps/api/src/modules/people/application/commands/create-employment-profile.handler.ts
```

Follow the same pattern: `@Injectable()`, `@Inject(REPOSITORY_TOKEN)`, `execute()` method.

- [ ] **Step 1: Create session command + handler + test**

Command: `CreateSessionCommand(tenantId, actorId, contextModule?, contextEntity?, contextEntityId?, contextMetadata?)`

Handler: injects `AGENT_SESSION_REPOSITORY`, creates session with web_chat channel, active status.

Test: mock repo, verify create called with correct args, verify session returned. Test without context (nulls).

- [ ] **Step 2: Create send-message command + handler + test**

Command: `SendMessageCommand(sessionId, tenantId, content)`

Handler: injects session + message repos. Finds session first (throws NotFoundException if missing). Creates user message.

Test: mock both repos, verify happy path + missing session throws.

- [ ] **Step 3: Create dismiss-insight command + handler + test**

Command: `DismissInsightCommand(insightId, tenantId)`

Handler: injects insight repo, calls dismiss.

Test: mock repo, verify dismiss called.

- [ ] **Step 4: Create list-sessions query + handler + test**

Query: `ListSessionsQuery(actorId, tenantId, limit=20)`

Handler: injects session repo, calls findByActor.

Test: mock repo, verify returned.

- [ ] **Step 5: Create list-insights query + handler + test**

Query: `ListInsightsQuery(actorId, tenantId)`

Handler: injects insight repo, calls findByActor.

Test: mock repo, verify returned.

- [ ] **Step 6: Run all application tests**

```bash
bun vitest run apps/api/src/modules/agents/application/
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/agents/application/
git commit -m "feat(agents): add command and query handlers for sessions, messages, insights"
```

---

### Task 5: tRPC routers

**Files:**

- Create: `apps/api/src/modules/agents/interface/trpc/session.router.ts`
- Create: `apps/api/src/modules/agents/interface/trpc/insight.router.ts`
- Create: `apps/api/src/modules/agents/interface/trpc/definition.router.ts`
- Modify: `apps/api/src/modules/agents/interface/trpc/agents.router.ts`

Before implementing, read the existing tRPC router pattern:

```bash
head -60 apps/api/src/modules/people/interface/trpc/people.router.ts
```

Follow the same pattern for handler resolution (lazy `svc()` or setter pattern).

- [ ] **Step 1: Create session router**

Procedures:

- `session.create` — mutation, input: `{ tenantId, actorId, contextModule?, contextEntity?, contextEntityId?, contextMetadata? }`, calls CreateSessionHandler
- `session.list` — query, input: `{ actorId, tenantId, limit? }`, calls ListSessionsHandler
- `session.sendMessage` — mutation, input: `{ sessionId, tenantId, content }`, calls SendMessageHandler

- [ ] **Step 2: Create insight router**

Procedures:

- `insight.list` — query, input: `{ actorId, tenantId }`, calls ListInsightsHandler
- `insight.dismiss` — mutation, input: `{ insightId, tenantId }`, calls DismissInsightHandler

- [ ] **Step 3: Create definition router stub**

Empty router with comment explaining it will be populated when agent_definition schema is implemented.

- [ ] **Step 4: Compose agents router**

Replace agents.router.ts to compose session + insight + definition sub-routers.

- [ ] **Step 5: Verify typecheck**

```bash
cd apps/api && npx tsc --noEmit --pretty
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/agents/interface/trpc/
git commit -m "feat(agents): add tRPC routers for sessions, insights, definitions"
```

---

### Task 6: Register providers in AgentsModule

**Files:**

- Modify: `apps/api/src/modules/agents/agents.module.ts`

- [ ] **Step 1: Read current module**

```bash
cat apps/api/src/modules/agents/agents.module.ts
```

- [ ] **Step 2: Update module**

Add to providers:

- Repository bindings: `{ provide: AGENT_SESSION_REPOSITORY, useClass: DrizzleAgentSessionRepository }` (same for message, insight)
- All 5 command/query handlers

Add `OnModuleInit` to wire handler setters for tRPC routers (same pattern used by people module).

Keep existing providers/exports unchanged.

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/api && npx tsc --noEmit --pretty
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/agents/agents.module.ts
git commit -m "feat(agents): register repositories and handlers in AgentsModule"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run all agent module tests**

```bash
bun vitest run apps/api/src/modules/agents/
```

- [ ] **Step 2: Verify full API typecheck**

```bash
cd apps/api && npx tsc --noEmit --pretty
```

- [ ] **Step 3: Run full test suite**

```bash
bun run --filter @future/api test:unit
```

# Embedded Agent — Plan 02: Backend Routes & WebSocket

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tRPC routes for agent sessions, messages, insights, and config. Add a WebSocket gateway for real-time streaming. These endpoints power all three frontend surfaces.

**Architecture:** tRPC routes follow existing pattern (Zod input, publicProcedure/permissionProtectedProcedure). WebSocket uses `@nestjs/websockets` with `socket.io` on the Fastify adapter. Agent Gateway orchestration (LLM reasoning loop) is out of scope — this plan builds the transport layer that the gateway will plug into.

**Tech Stack:** NestJS, tRPC, Zod, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, Vitest

**Spec Reference:** `docs/superpowers/specs/2026-04-15-agent-embedded-design.md` — Backend Changes, New tRPC Routes, WebSocket Gateway

**Depends On:** Plan 01 (types are shared between frontend and backend)

---

## File Structure

### Files to CREATE

```
# tRPC routes
apps/api/src/modules/agents/interface/trpc/session.router.ts
apps/api/src/modules/agents/interface/trpc/insight.router.ts
apps/api/src/modules/agents/interface/trpc/definition.router.ts

# WebSocket gateway
apps/api/src/modules/agents/interface/ws/agent-ws.gateway.ts
apps/api/src/modules/agents/interface/ws/agent-ws.gateway.spec.ts

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
apps/api/package.json                                          → add WS dependencies
apps/api/src/main.ts                                           → add IoAdapter
```

---

### Task 1: Install WebSocket dependencies

**Files:**

- Modify: `apps/api/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/canh/Projects/Seta/future
bun add @nestjs/websockets @nestjs/platform-socket.io socket.io --filter @future/api
```

- [ ] **Step 2: Verify installation**

```bash
grep -E "websockets|socket.io" apps/api/package.json
```

Expected: `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` in dependencies.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json bun.lock
git commit -m "chore(api): add WebSocket dependencies"
```

---

### Task 2: Agent database schema

**Files:**

- Modify: `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts`

- [ ] **Step 1: Read the current schema stub**

```bash
cat apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts
```

- [ ] **Step 2: Write the schema**

Rewrite `apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts`:

```typescript
import {
  pgSchema,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core'

export const agentsSchema = pgSchema('agents')

export const sessionStatusEnum = pgEnum('session_status', [
  'active',
  'completed',
  'escalated',
  'expired',
  'error',
])

export const messageRoleEnum = pgEnum('message_role', [
  'user',
  'assistant',
  'tool_call',
  'tool_result',
])

export const insightSeverityEnum = pgEnum('insight_severity', ['info', 'warning', 'critical'])

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

- [ ] **Step 3: Verify build**

```bash
bun run --filter @future/api build
```

Note: If building the full API is slow, at minimum verify TypeScript compiles:

```bash
cd apps/api && npx tsc --noEmit --pretty
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/agents/infrastructure/schema/agents.schema.ts
git commit -m "feat(agents): add database schema for sessions, messages, insights"
```

---

### Task 3: Domain entities and repository interfaces

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

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/agents/domain/
git commit -m "feat(agents): add domain entities and repository interfaces"
```

---

### Task 4: Infrastructure repositories (Drizzle)

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/repositories/drizzle-agent-session.repository.ts`
- Create: `apps/api/src/modules/agents/infrastructure/repositories/drizzle-agent-message.repository.ts`
- Create: `apps/api/src/modules/agents/infrastructure/repositories/drizzle-agent-insight.repository.ts`

- [ ] **Step 1: Check existing Drizzle repository pattern**

Read an existing repo for the injection + query pattern used in this codebase:

```bash
cat apps/api/src/modules/people/infrastructure/repositories/drizzle-person-profile.repository.ts
```

Use the same pattern: `@Injectable()`, `@Inject(DRIZZLE)` for the db handle, query builder with `.where()` + `eq()`.

- [ ] **Step 2: Implement DrizzleAgentSessionRepository**

Create `apps/api/src/modules/agents/infrastructure/repositories/drizzle-agent-session.repository.ts`:

```typescript
import { Injectable, Inject } from '@nestjs/common'
import { eq, and, desc } from 'drizzle-orm'
import { DRIZZLE } from '../../../../common/drizzle/drizzle.token'
import type { DrizzleDB } from '../../../../common/drizzle/drizzle.types'
import type { AgentSessionRepository } from '../../domain/repositories/agent-session.repository'
import type { AgentSessionEntity } from '../../domain/entities/agent-session.entity'
import { agentSessions } from '../schema/agents.schema'

@Injectable()
export class DrizzleAgentSessionRepository implements AgentSessionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(
    session: Omit<AgentSessionEntity, 'id' | 'createdAt' | 'endedAt'>,
  ): Promise<AgentSessionEntity> {
    const [result] = await this.db.insert(agentSessions).values(session).returning()
    return result as AgentSessionEntity
  }

  async findById(id: string, tenantId: string): Promise<AgentSessionEntity | null> {
    const [result] = await this.db
      .select()
      .from(agentSessions)
      .where(and(eq(agentSessions.id, id), eq(agentSessions.tenantId, tenantId)))
      .limit(1)
    return (result as AgentSessionEntity) ?? null
  }

  async findByActor(
    actorId: string,
    tenantId: string,
    limit: number,
  ): Promise<AgentSessionEntity[]> {
    const results = await this.db
      .select()
      .from(agentSessions)
      .where(and(eq(agentSessions.actorId, actorId), eq(agentSessions.tenantId, tenantId)))
      .orderBy(desc(agentSessions.createdAt))
      .limit(limit)
    return results as AgentSessionEntity[]
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: AgentSessionEntity['status'],
  ): Promise<void> {
    await this.db
      .update(agentSessions)
      .set({ status, endedAt: status === 'active' ? null : new Date() })
      .where(and(eq(agentSessions.id, id), eq(agentSessions.tenantId, tenantId)))
  }
}
```

- [ ] **Step 3: Implement DrizzleAgentMessageRepository**

Create `apps/api/src/modules/agents/infrastructure/repositories/drizzle-agent-message.repository.ts`:

```typescript
import { Injectable, Inject } from '@nestjs/common'
import { eq, and, asc } from 'drizzle-orm'
import { DRIZZLE } from '../../../../common/drizzle/drizzle.token'
import type { DrizzleDB } from '../../../../common/drizzle/drizzle.types'
import type { AgentMessageRepository } from '../../domain/repositories/agent-message.repository'
import type { AgentMessageEntity } from '../../domain/entities/agent-message.entity'
import { agentMessages } from '../schema/agents.schema'

@Injectable()
export class DrizzleAgentMessageRepository implements AgentMessageRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(message: Omit<AgentMessageEntity, 'id' | 'createdAt'>): Promise<AgentMessageEntity> {
    const [result] = await this.db.insert(agentMessages).values(message).returning()
    return result as AgentMessageEntity
  }

  async findBySession(sessionId: string, tenantId: string): Promise<AgentMessageEntity[]> {
    const results = await this.db
      .select()
      .from(agentMessages)
      .where(and(eq(agentMessages.sessionId, sessionId), eq(agentMessages.tenantId, tenantId)))
      .orderBy(asc(agentMessages.createdAt))
    return results as AgentMessageEntity[]
  }
}
```

- [ ] **Step 4: Implement DrizzleAgentInsightRepository**

Create `apps/api/src/modules/agents/infrastructure/repositories/drizzle-agent-insight.repository.ts`:

```typescript
import { Injectable, Inject } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DRIZZLE } from '../../../../common/drizzle/drizzle.token'
import type { DrizzleDB } from '../../../../common/drizzle/drizzle.types'
import type { AgentInsightRepository } from '../../domain/repositories/agent-insight.repository'
import type { AgentInsightEntity } from '../../domain/entities/agent-insight.entity'
import { agentInsights } from '../schema/agents.schema'

@Injectable()
export class DrizzleAgentInsightRepository implements AgentInsightRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(
    insight: Omit<AgentInsightEntity, 'id' | 'createdAt' | 'isDismissed'>,
  ): Promise<AgentInsightEntity> {
    const [result] = await this.db.insert(agentInsights).values(insight).returning()
    return result as AgentInsightEntity
  }

  async findByActor(actorId: string, tenantId: string): Promise<AgentInsightEntity[]> {
    const results = await this.db
      .select()
      .from(agentInsights)
      .where(
        and(
          eq(agentInsights.actorId, actorId),
          eq(agentInsights.tenantId, tenantId),
          eq(agentInsights.isDismissed, false),
        ),
      )
    return results as AgentInsightEntity[]
  }

  async dismiss(id: string, tenantId: string): Promise<void> {
    await this.db
      .update(agentInsights)
      .set({ isDismissed: true })
      .where(and(eq(agentInsights.id, id), eq(agentInsights.tenantId, tenantId)))
  }
}
```

- [ ] **Step 5: Verify typecheck**

```bash
cd apps/api && npx tsc --noEmit --pretty
```

Note: You may need to verify the exact Drizzle token import path (`DRIZZLE`) and `DrizzleDB` type by reading:

```bash
find apps/api/src/common/drizzle -type f -name "*.ts"
```

Adjust import paths if the codebase uses a different pattern.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/agents/infrastructure/repositories/
git commit -m "feat(agents): add Drizzle repository implementations"
```

---

### Task 5: Application layer — commands and queries

**Files:**

- Create: `apps/api/src/modules/agents/application/commands/create-session.command.ts`
- Create: `apps/api/src/modules/agents/application/commands/create-session.handler.ts`
- Create: `apps/api/src/modules/agents/application/commands/create-session.handler.spec.ts`
- Create: `apps/api/src/modules/agents/application/commands/send-message.command.ts`
- Create: `apps/api/src/modules/agents/application/commands/send-message.handler.ts`
- Create: `apps/api/src/modules/agents/application/commands/send-message.handler.spec.ts`
- Create: `apps/api/src/modules/agents/application/commands/dismiss-insight.command.ts`
- Create: `apps/api/src/modules/agents/application/commands/dismiss-insight.handler.ts`
- Create: `apps/api/src/modules/agents/application/commands/dismiss-insight.handler.spec.ts`
- Create: `apps/api/src/modules/agents/application/queries/list-sessions.query.ts`
- Create: `apps/api/src/modules/agents/application/queries/list-sessions.handler.ts`
- Create: `apps/api/src/modules/agents/application/queries/list-sessions.handler.spec.ts`
- Create: `apps/api/src/modules/agents/application/queries/list-insights.query.ts`
- Create: `apps/api/src/modules/agents/application/queries/list-insights.handler.ts`
- Create: `apps/api/src/modules/agents/application/queries/list-insights.handler.spec.ts`

Before implementing, read the existing command/query handler pattern in the codebase:

```bash
cat apps/api/src/modules/people/application/commands/create-employment-profile.handler.ts
cat apps/api/src/modules/people/application/queries/get-profile.handler.ts
```

Follow the exact same pattern (class with `execute()` method, injected repositories, NestJS `@Injectable()`).

- [ ] **Step 1: Create session command + handler**

Create `apps/api/src/modules/agents/application/commands/create-session.command.ts`:

```typescript
export class CreateSessionCommand {
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly contextModule?: string,
    public readonly contextEntity?: string,
    public readonly contextEntityId?: string,
    public readonly contextMetadata?: Record<string, unknown>,
  ) {}
}
```

Create `apps/api/src/modules/agents/application/commands/create-session.handler.ts`:

```typescript
import { Injectable, Inject } from '@nestjs/common'
import {
  AGENT_SESSION_REPOSITORY,
  type AgentSessionRepository,
} from '../../domain/repositories/agent-session.repository'
import type { AgentSessionEntity } from '../../domain/entities/agent-session.entity'
import type { CreateSessionCommand } from './create-session.command'

@Injectable()
export class CreateSessionHandler {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY)
    private readonly sessionRepo: AgentSessionRepository,
  ) {}

  async execute(command: CreateSessionCommand): Promise<AgentSessionEntity> {
    return this.sessionRepo.create({
      tenantId: command.tenantId,
      actorId: command.actorId,
      agentId: null,
      channelType: 'web_chat',
      status: 'active',
      contextModule: command.contextModule ?? null,
      contextEntity: command.contextEntity ?? null,
      contextEntityId: command.contextEntityId ?? null,
      contextMetadata: command.contextMetadata ?? null,
    })
  }
}
```

- [ ] **Step 2: Write test for CreateSessionHandler**

Create `apps/api/src/modules/agents/application/commands/create-session.handler.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreateSessionHandler } from './create-session.handler'
import { CreateSessionCommand } from './create-session.command'
import type { AgentSessionRepository } from '../../domain/repositories/agent-session.repository'

describe('CreateSessionHandler', () => {
  let handler: CreateSessionHandler
  let mockRepo: AgentSessionRepository

  beforeEach(() => {
    mockRepo = {
      create: vi.fn().mockResolvedValue({
        id: 'session-1',
        tenantId: 'tenant-1',
        actorId: 'actor-1',
        agentId: null,
        channelType: 'web_chat',
        status: 'active',
        contextModule: 'people',
        contextEntity: 'employee',
        contextEntityId: 'emp-1',
        contextMetadata: null,
        createdAt: new Date(),
        endedAt: null,
      }),
      findById: vi.fn(),
      findByActor: vi.fn(),
      updateStatus: vi.fn(),
    }
    handler = new CreateSessionHandler(mockRepo)
  })

  it('creates a session with context', async () => {
    const command = new CreateSessionCommand('tenant-1', 'actor-1', 'people', 'employee', 'emp-1')
    const result = await handler.execute(command)

    expect(mockRepo.create).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      agentId: null,
      channelType: 'web_chat',
      status: 'active',
      contextModule: 'people',
      contextEntity: 'employee',
      contextEntityId: 'emp-1',
      contextMetadata: null,
    })
    expect(result.id).toBe('session-1')
    expect(result.status).toBe('active')
  })

  it('creates a session without context', async () => {
    const command = new CreateSessionCommand('tenant-1', 'actor-1')
    await handler.execute(command)

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contextModule: null,
        contextEntity: null,
        contextEntityId: null,
        contextMetadata: null,
      }),
    )
  })
})
```

- [ ] **Step 3: Run test**

```bash
bun vitest run apps/api/src/modules/agents/application/commands/create-session.handler.spec.ts
```

Expected: All tests PASS.

- [ ] **Step 4: Create send-message command + handler + test**

Create `apps/api/src/modules/agents/application/commands/send-message.command.ts`:

```typescript
export class SendMessageCommand {
  constructor(
    public readonly sessionId: string,
    public readonly tenantId: string,
    public readonly content: string,
  ) {}
}
```

Create `apps/api/src/modules/agents/application/commands/send-message.handler.ts`:

```typescript
import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import {
  AGENT_SESSION_REPOSITORY,
  type AgentSessionRepository,
} from '../../domain/repositories/agent-session.repository'
import {
  AGENT_MESSAGE_REPOSITORY,
  type AgentMessageRepository,
} from '../../domain/repositories/agent-message.repository'
import type { AgentMessageEntity } from '../../domain/entities/agent-message.entity'
import type { SendMessageCommand } from './send-message.command'

@Injectable()
export class SendMessageHandler {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY)
    private readonly sessionRepo: AgentSessionRepository,
    @Inject(AGENT_MESSAGE_REPOSITORY)
    private readonly messageRepo: AgentMessageRepository,
  ) {}

  async execute(command: SendMessageCommand): Promise<AgentMessageEntity> {
    const session = await this.sessionRepo.findById(command.sessionId, command.tenantId)
    if (!session) throw new NotFoundException(`Session ${command.sessionId} not found`)

    return this.messageRepo.create({
      sessionId: command.sessionId,
      tenantId: command.tenantId,
      role: 'user',
      content: command.content,
      toolName: null,
      toolArgs: null,
      modelUsed: null,
      tokensUsed: null,
      isError: false,
    })
  }
}
```

Create `apps/api/src/modules/agents/application/commands/send-message.handler.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { SendMessageHandler } from './send-message.handler'
import { SendMessageCommand } from './send-message.command'
import type { AgentSessionRepository } from '../../domain/repositories/agent-session.repository'
import type { AgentMessageRepository } from '../../domain/repositories/agent-message.repository'

describe('SendMessageHandler', () => {
  let handler: SendMessageHandler
  let mockSessionRepo: AgentSessionRepository
  let mockMessageRepo: AgentMessageRepository

  beforeEach(() => {
    mockSessionRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue({ id: 'session-1', status: 'active' }),
      findByActor: vi.fn(),
      updateStatus: vi.fn(),
    }
    mockMessageRepo = {
      create: vi.fn().mockResolvedValue({
        id: 'msg-1',
        sessionId: 'session-1',
        tenantId: 'tenant-1',
        role: 'user',
        content: 'Hello',
        createdAt: new Date(),
      }),
      findBySession: vi.fn(),
    }
    handler = new SendMessageHandler(mockSessionRepo, mockMessageRepo)
  })

  it('creates a user message in an existing session', async () => {
    const command = new SendMessageCommand('session-1', 'tenant-1', 'Hello')
    const result = await handler.execute(command)

    expect(mockSessionRepo.findById).toHaveBeenCalledWith('session-1', 'tenant-1')
    expect(mockMessageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        role: 'user',
        content: 'Hello',
      }),
    )
    expect(result.id).toBe('msg-1')
  })

  it('throws NotFoundException for missing session', async () => {
    mockSessionRepo.findById = vi.fn().mockResolvedValue(null)
    const command = new SendMessageCommand('bad-id', 'tenant-1', 'Hello')

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException)
  })
})
```

- [ ] **Step 5: Run send-message test**

```bash
bun vitest run apps/api/src/modules/agents/application/commands/send-message.handler.spec.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Create dismiss-insight command + handler + test**

Create `apps/api/src/modules/agents/application/commands/dismiss-insight.command.ts`:

```typescript
export class DismissInsightCommand {
  constructor(
    public readonly insightId: string,
    public readonly tenantId: string,
  ) {}
}
```

Create `apps/api/src/modules/agents/application/commands/dismiss-insight.handler.ts`:

```typescript
import { Injectable, Inject } from '@nestjs/common'
import {
  AGENT_INSIGHT_REPOSITORY,
  type AgentInsightRepository,
} from '../../domain/repositories/agent-insight.repository'
import type { DismissInsightCommand } from './dismiss-insight.command'

@Injectable()
export class DismissInsightHandler {
  constructor(
    @Inject(AGENT_INSIGHT_REPOSITORY)
    private readonly insightRepo: AgentInsightRepository,
  ) {}

  async execute(command: DismissInsightCommand): Promise<void> {
    await this.insightRepo.dismiss(command.insightId, command.tenantId)
  }
}
```

Create `apps/api/src/modules/agents/application/commands/dismiss-insight.handler.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DismissInsightHandler } from './dismiss-insight.handler'
import { DismissInsightCommand } from './dismiss-insight.command'
import type { AgentInsightRepository } from '../../domain/repositories/agent-insight.repository'

describe('DismissInsightHandler', () => {
  let handler: DismissInsightHandler
  let mockRepo: AgentInsightRepository

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findByActor: vi.fn(),
      dismiss: vi.fn().mockResolvedValue(undefined),
    }
    handler = new DismissInsightHandler(mockRepo)
  })

  it('dismisses an insight', async () => {
    const command = new DismissInsightCommand('insight-1', 'tenant-1')
    await handler.execute(command)

    expect(mockRepo.dismiss).toHaveBeenCalledWith('insight-1', 'tenant-1')
  })
})
```

- [ ] **Step 7: Run dismiss-insight test**

```bash
bun vitest run apps/api/src/modules/agents/application/commands/dismiss-insight.handler.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Create list-sessions query + handler + test**

Create `apps/api/src/modules/agents/application/queries/list-sessions.query.ts`:

```typescript
export class ListSessionsQuery {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly limit: number = 20,
  ) {}
}
```

Create `apps/api/src/modules/agents/application/queries/list-sessions.handler.ts`:

```typescript
import { Injectable, Inject } from '@nestjs/common'
import {
  AGENT_SESSION_REPOSITORY,
  type AgentSessionRepository,
} from '../../domain/repositories/agent-session.repository'
import type { AgentSessionEntity } from '../../domain/entities/agent-session.entity'
import type { ListSessionsQuery } from './list-sessions.query'

@Injectable()
export class ListSessionsHandler {
  constructor(
    @Inject(AGENT_SESSION_REPOSITORY)
    private readonly sessionRepo: AgentSessionRepository,
  ) {}

  async execute(query: ListSessionsQuery): Promise<AgentSessionEntity[]> {
    return this.sessionRepo.findByActor(query.actorId, query.tenantId, query.limit)
  }
}
```

Create `apps/api/src/modules/agents/application/queries/list-sessions.handler.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListSessionsHandler } from './list-sessions.handler'
import { ListSessionsQuery } from './list-sessions.query'
import type { AgentSessionRepository } from '../../domain/repositories/agent-session.repository'

describe('ListSessionsHandler', () => {
  let handler: ListSessionsHandler
  let mockRepo: AgentSessionRepository

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByActor: vi.fn().mockResolvedValue([
        { id: 'session-1', status: 'active' },
        { id: 'session-2', status: 'completed' },
      ]),
      updateStatus: vi.fn(),
    }
    handler = new ListSessionsHandler(mockRepo)
  })

  it('lists sessions for an actor', async () => {
    const query = new ListSessionsQuery('actor-1', 'tenant-1', 20)
    const result = await handler.execute(query)

    expect(mockRepo.findByActor).toHaveBeenCalledWith('actor-1', 'tenant-1', 20)
    expect(result).toHaveLength(2)
  })
})
```

- [ ] **Step 9: Create list-insights query + handler + test**

Create `apps/api/src/modules/agents/application/queries/list-insights.query.ts`:

```typescript
export class ListInsightsQuery {
  constructor(
    public readonly actorId: string,
    public readonly tenantId: string,
  ) {}
}
```

Create `apps/api/src/modules/agents/application/queries/list-insights.handler.ts`:

```typescript
import { Injectable, Inject } from '@nestjs/common'
import {
  AGENT_INSIGHT_REPOSITORY,
  type AgentInsightRepository,
} from '../../domain/repositories/agent-insight.repository'
import type { AgentInsightEntity } from '../../domain/entities/agent-insight.entity'
import type { ListInsightsQuery } from './list-insights.query'

@Injectable()
export class ListInsightsHandler {
  constructor(
    @Inject(AGENT_INSIGHT_REPOSITORY)
    private readonly insightRepo: AgentInsightRepository,
  ) {}

  async execute(query: ListInsightsQuery): Promise<AgentInsightEntity[]> {
    return this.insightRepo.findByActor(query.actorId, query.tenantId)
  }
}
```

Create `apps/api/src/modules/agents/application/queries/list-insights.handler.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListInsightsHandler } from './list-insights.handler'
import { ListInsightsQuery } from './list-insights.query'
import type { AgentInsightRepository } from '../../domain/repositories/agent-insight.repository'

describe('ListInsightsHandler', () => {
  let handler: ListInsightsHandler
  let mockRepo: AgentInsightRepository

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findByActor: vi
        .fn()
        .mockResolvedValue([{ id: 'insight-1', severity: 'warning', title: 'Visa expiring' }]),
      dismiss: vi.fn(),
    }
    handler = new ListInsightsHandler(mockRepo)
  })

  it('lists active insights for an actor', async () => {
    const query = new ListInsightsQuery('actor-1', 'tenant-1')
    const result = await handler.execute(query)

    expect(mockRepo.findByActor).toHaveBeenCalledWith('actor-1', 'tenant-1')
    expect(result).toHaveLength(1)
  })
})
```

- [ ] **Step 10: Run all application tests**

```bash
bun vitest run apps/api/src/modules/agents/application/
```

Expected: All tests PASS (create-session, send-message, dismiss-insight, list-sessions, list-insights).

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/agents/application/
git commit -m "feat(agents): add command and query handlers for sessions, messages, insights"
```

---

### Task 6: tRPC routers

**Files:**

- Create: `apps/api/src/modules/agents/interface/trpc/session.router.ts`
- Create: `apps/api/src/modules/agents/interface/trpc/insight.router.ts`
- Create: `apps/api/src/modules/agents/interface/trpc/definition.router.ts`
- Modify: `apps/api/src/modules/agents/interface/trpc/agents.router.ts`

Before implementing, read the existing tRPC patterns for procedure service resolution:

```bash
head -30 apps/api/src/modules/people/interface/trpc/people.router.ts
```

The codebase uses a `svc()` or direct handler reference pattern. Match it exactly.

- [ ] **Step 1: Create session router**

Create `apps/api/src/modules/agents/interface/trpc/session.router.ts`:

```typescript
import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'

let createSessionHandler: any
let listSessionsHandler: any
let sendMessageHandler: any

export function setAgentSessionHandlers(handlers: {
  createSession: any
  listSessions: any
  sendMessage: any
}) {
  createSessionHandler = handlers.createSession
  listSessionsHandler = handlers.listSessions
  sendMessageHandler = handlers.sendMessage
}

export const sessionRouter = router({
  create: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        contextModule: z.string().optional(),
        contextEntity: z.string().optional(),
        contextEntityId: z.string().optional(),
        contextMetadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(({ input }) => {
      const { CreateSessionCommand } = require('../../application/commands/create-session.command')
      return createSessionHandler.execute(
        new CreateSessionCommand(
          input.tenantId,
          input.actorId,
          input.contextModule,
          input.contextEntity,
          input.contextEntityId,
          input.contextMetadata,
        ),
      )
    }),

  list: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(({ input }) => {
      const { ListSessionsQuery } = require('../../application/queries/list-sessions.query')
      return listSessionsHandler.execute(
        new ListSessionsQuery(input.actorId, input.tenantId, input.limit),
      )
    }),

  sendMessage: publicProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        tenantId: z.string().uuid(),
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(({ input }) => {
      const { SendMessageCommand } = require('../../application/commands/send-message.command')
      return sendMessageHandler.execute(
        new SendMessageCommand(input.sessionId, input.tenantId, input.content),
      )
    }),
})
```

Note: The exact router setup pattern (lazy service resolution via `svc()` or `require()` or handler reference) must match what the existing codebase uses. Read the people router first and adapt.

- [ ] **Step 2: Create insight router**

Create `apps/api/src/modules/agents/interface/trpc/insight.router.ts`:

```typescript
import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'

let listInsightsHandler: any
let dismissInsightHandler: any

export function setAgentInsightHandlers(handlers: { listInsights: any; dismissInsight: any }) {
  listInsightsHandler = handlers.listInsights
  dismissInsightHandler = handlers.dismissInsight
}

export const insightRouter = router({
  list: publicProcedure
    .input(
      z.object({
        actorId: z.string().uuid(),
        tenantId: z.string().uuid(),
      }),
    )
    .query(({ input }) => {
      const { ListInsightsQuery } = require('../../application/queries/list-insights.query')
      return listInsightsHandler.execute(new ListInsightsQuery(input.actorId, input.tenantId))
    }),

  dismiss: publicProcedure
    .input(
      z.object({
        insightId: z.string().uuid(),
        tenantId: z.string().uuid(),
      }),
    )
    .mutation(({ input }) => {
      const {
        DismissInsightCommand,
      } = require('../../application/commands/dismiss-insight.command')
      return dismissInsightHandler.execute(
        new DismissInsightCommand(input.insightId, input.tenantId),
      )
    }),
})
```

- [ ] **Step 3: Create definition router stub**

Create `apps/api/src/modules/agents/interface/trpc/definition.router.ts`:

```typescript
import { router } from '../../../../common/trpc/trpc-init'

// Agent definition CRUD — consumed by web-admin for Agent Builder.
// Procedures will be added when agent_definition schema is implemented
// (defined in docs/architecture/agent-runtime.md).
export const definitionRouter = router({})
```

- [ ] **Step 4: Compose agents router**

Replace `apps/api/src/modules/agents/interface/trpc/agents.router.ts`:

```typescript
import { router } from '../../../../common/trpc/trpc-init'
import { sessionRouter } from './session.router'
import { insightRouter } from './insight.router'
import { definitionRouter } from './definition.router'

export const agentsRouter = router({
  session: sessionRouter,
  insight: insightRouter,
  definition: definitionRouter,
})
```

- [ ] **Step 5: Verify typecheck**

```bash
cd apps/api && npx tsc --noEmit --pretty
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/agents/interface/trpc/
git commit -m "feat(agents): add tRPC routers for sessions, insights, definitions"
```

---

### Task 7: Register providers in AgentsModule

**Files:**

- Modify: `apps/api/src/modules/agents/agents.module.ts`

- [ ] **Step 1: Read current module**

```bash
cat apps/api/src/modules/agents/agents.module.ts
```

- [ ] **Step 2: Update module to register all new providers**

Update `apps/api/src/modules/agents/agents.module.ts` to add:

- Repository providers (bound to symbols)
- Command/query handlers
- Handler setter initialization in `onModuleInit`

```typescript
import { Module, OnModuleInit } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AgentsQueryFacade } from './application/facades/agents-query.facade'
import { AgentPermissionService } from './application/services/agent-permission.service'
import { AgentToolExecutor } from './application/services/agent-tool-executor.service'
import { McpAuthGuard } from './infrastructure/guards/mcp-auth.guard'
import { ExposureContractGuard } from './infrastructure/guards/exposure-contract.guard'
import { ToolPermissionGuard } from './infrastructure/guards/tool-permission.guard'
import { KernelModule } from '../kernel/kernel.module'
import { AGENT_SESSION_REPOSITORY } from './domain/repositories/agent-session.repository'
import { AGENT_MESSAGE_REPOSITORY } from './domain/repositories/agent-message.repository'
import { AGENT_INSIGHT_REPOSITORY } from './domain/repositories/agent-insight.repository'
import { DrizzleAgentSessionRepository } from './infrastructure/repositories/drizzle-agent-session.repository'
import { DrizzleAgentMessageRepository } from './infrastructure/repositories/drizzle-agent-message.repository'
import { DrizzleAgentInsightRepository } from './infrastructure/repositories/drizzle-agent-insight.repository'
import { CreateSessionHandler } from './application/commands/create-session.handler'
import { SendMessageHandler } from './application/commands/send-message.handler'
import { DismissInsightHandler } from './application/commands/dismiss-insight.handler'
import { ListSessionsHandler } from './application/queries/list-sessions.handler'
import { ListInsightsHandler } from './application/queries/list-insights.handler'
import { setAgentSessionHandlers } from './interface/trpc/session.router'
import { setAgentInsightHandlers } from './interface/trpc/insight.router'

@Module({
  imports: [
    KernelModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [
    // Existing
    AgentsQueryFacade,
    AgentPermissionService,
    AgentToolExecutor,
    McpAuthGuard,
    ExposureContractGuard,
    ToolPermissionGuard,
    // Repositories
    { provide: AGENT_SESSION_REPOSITORY, useClass: DrizzleAgentSessionRepository },
    { provide: AGENT_MESSAGE_REPOSITORY, useClass: DrizzleAgentMessageRepository },
    { provide: AGENT_INSIGHT_REPOSITORY, useClass: DrizzleAgentInsightRepository },
    // Handlers
    CreateSessionHandler,
    SendMessageHandler,
    DismissInsightHandler,
    ListSessionsHandler,
    ListInsightsHandler,
  ],
  exports: [
    AgentsQueryFacade,
    AgentPermissionService,
    AgentToolExecutor,
    McpAuthGuard,
    ExposureContractGuard,
    ToolPermissionGuard,
  ],
})
export class AgentsModule implements OnModuleInit {
  constructor(
    private readonly createSession: CreateSessionHandler,
    private readonly sendMessage: SendMessageHandler,
    private readonly dismissInsight: DismissInsightHandler,
    private readonly listSessions: ListSessionsHandler,
    private readonly listInsights: ListInsightsHandler,
  ) {}

  onModuleInit() {
    setAgentSessionHandlers({
      createSession: this.createSession,
      listSessions: this.listSessions,
      sendMessage: this.sendMessage,
    })
    setAgentInsightHandlers({
      listInsights: this.listInsights,
      dismissInsight: this.dismissInsight,
    })
  }
}
```

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/api && npx tsc --noEmit --pretty
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/agents/agents.module.ts
git commit -m "feat(agents): register repositories and handlers in AgentsModule"
```

---

### Task 8: WebSocket gateway

**Files:**

- Create: `apps/api/src/modules/agents/interface/ws/agent-ws.gateway.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/modules/agents/agents.module.ts`

- [ ] **Step 1: Create WebSocket gateway**

Create `apps/api/src/modules/agents/interface/ws/agent-ws.gateway.ts`:

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger } from '@nestjs/common'

@WebSocketGateway({
  path: '/ws/agent',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class AgentWsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(AgentWsGateway.name)
  private readonly connections = new Map<string, Socket>()

  handleConnection(client: Socket) {
    const actorId = client.handshake.query['actorId'] as string
    const tenantId = client.handshake.query['tenantId'] as string

    if (!actorId || !tenantId) {
      this.logger.warn(`WS connection rejected — missing actorId or tenantId`)
      client.disconnect()
      return
    }

    const roomKey = `${tenantId}:${actorId}`
    client.join(roomKey)
    this.connections.set(client.id, client)
    this.logger.log(`WS connected: ${roomKey} (${client.id})`)
  }

  handleDisconnect(client: Socket) {
    this.connections.delete(client.id)
    this.logger.log(`WS disconnected: ${client.id}`)
  }

  @SubscribeMessage('agent:message')
  handleMessage(client: Socket, payload: { sessionId: string; content: string }) {
    // Placeholder: will be wired to Agent Gateway reasoning loop.
    // For now, echo back to confirm transport works.
    client.emit('agent:message', {
      sessionId: payload.sessionId,
      role: 'assistant',
      content: `Echo: ${payload.content}`,
      createdAt: new Date().toISOString(),
    })
  }

  pushInsight(tenantId: string, actorId: string, insight: Record<string, unknown>) {
    const roomKey = `${tenantId}:${actorId}`
    this.server.to(roomKey).emit('agent:insight', insight)
  }

  pushMessageToken(tenantId: string, actorId: string, sessionId: string, token: string) {
    const roomKey = `${tenantId}:${actorId}`
    this.server.to(roomKey).emit('agent:token', { sessionId, token })
  }
}
```

- [ ] **Step 2: Add IoAdapter to main.ts**

Read `apps/api/src/main.ts` and add the Socket.IO adapter. After the `app.enableCors(...)` call, add:

```typescript
import { IoAdapter } from '@nestjs/platform-socket.io'

// Inside bootstrap(), after enableCors:
app.useWebSocketAdapter(new IoAdapter(app))
```

- [ ] **Step 3: Register gateway in AgentsModule**

Add to `agents.module.ts`:

```typescript
import { AgentWsGateway } from './interface/ws/agent-ws.gateway'

// Add to providers array:
AgentWsGateway,

// Add to exports array:
AgentWsGateway,
```

- [ ] **Step 4: Verify typecheck**

```bash
cd apps/api && npx tsc --noEmit --pretty
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agents/interface/ws/ apps/api/src/main.ts apps/api/src/modules/agents/agents.module.ts
git commit -m "feat(agents): add WebSocket gateway for real-time agent communication"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run all agent module tests**

```bash
bun vitest run apps/api/src/modules/agents/
```

Expected: All tests PASS.

- [ ] **Step 2: Verify full API typecheck**

```bash
cd apps/api && npx tsc --noEmit --pretty
```

Expected: No errors.

- [ ] **Step 3: Run full test suite**

```bash
bun run --filter @future/api test:unit
```

Expected: All existing tests still pass, new agent tests pass.

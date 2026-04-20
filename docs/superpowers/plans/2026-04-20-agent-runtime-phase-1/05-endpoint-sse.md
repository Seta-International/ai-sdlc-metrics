# Plan 05 — Endpoint + SSE Refactor + Frontend Mount

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `send-message.command` with `RunTurnCommand`. Add a Fastify SSE controller at `POST /agent/turn` that dispatches the command and pipes broker events to the response. Full refactor of `packages/agent/src/runtime/sse-event-schema.ts` + adapter + store to match spec §15.3 Phase-1 subset. Mount `<AgentPanel>` trigger inside `web-planner`.

**Architecture:** The SSE controller owns: `trace_id` mint, SSE headers, `turn.started` emission, `FastifyStreamBroker` adapter (writes events to the HTTP response), `run-turn.handler` dispatch, client-disconnect → `AbortController`. `FastifyStreamBroker` implements the `StreamBroker` port from Plan 04. Retries remain disabled.

**Tech Stack:** NestJS + Fastify (already in repo), zod, vitest. Frontend: `@assistant-ui/react`, `@microsoft/fetch-event-source`, zustand.

---

## File Map

**Backend — Create:**

- `apps/api/src/modules/agents/application/commands/run-turn.command.ts`
- `apps/api/src/modules/agents/application/commands/run-turn.handler.ts`
- `apps/api/src/modules/agents/application/commands/run-turn.handler.spec.ts`
- `apps/api/src/modules/agents/infrastructure/streaming/fastify-stream-broker.ts`
- `apps/api/src/modules/agents/infrastructure/streaming/fastify-stream-broker.spec.ts`
- `apps/api/src/modules/agents/interface/http/agent-turn.controller.ts`
- `apps/api/src/modules/agents/interface/http/agent-turn.controller.integration.spec.ts`

**Backend — Delete (no back-compat):**

- `apps/api/src/modules/agents/application/commands/send-message.command.ts`
- `apps/api/src/modules/agents/application/commands/send-message.handler.ts`
- `apps/api/src/modules/agents/application/commands/send-message.handler.spec.ts`
- The `sendMessage` field from `apps/api/src/modules/agents/interface/trpc/session.router.ts` (and the setter call in `agents.module.ts`).

**Backend — Modify:**

- `apps/api/src/modules/agents/agents.module.ts` — remove `SendMessageHandler` wiring; add `RunTurnHandler` + controller.
- `apps/api/src/modules/agents/interface/trpc/session.router.ts` — drop `sendMessage`; update setter signature.

**Frontend — Create (full refactor):**

- `packages/agent/src/runtime/sse-event-schema.ts` — rewrite
- `packages/agent/src/runtime/sse-event-schema.spec.ts` — rewrite
- `packages/agent/src/runtime/agent-chat-adapter.ts` — rewrite
- `packages/agent/src/runtime/agent-chat-adapter.spec.ts` — rewrite
- `packages/agent/src/runtime/agent-turn-store.ts` — rewrite
- `packages/agent/src/runtime/agent-turn-store.spec.ts` — rewrite

**Frontend — Modify:**

- `packages/agent/src/index.ts` — update re-exports where names change
- `packages/agent/src/panel/agent-panel.tsx` — consume new store/events if names changed
- `packages/agent/src/panel/agent-panel.spec.tsx` — follow
- `apps/web-planner/src/app/layout-client.tsx` — add `<AgentPanel>` + trigger
- `apps/web-planner/src/navigation.ts` — add agent nav item (if `@future/app-layout` exposes that shape)

---

## Task 1: `RunTurnCommand` + `RunTurnHandler`

**Files:**

- Create: `apps/api/src/modules/agents/application/commands/run-turn.command.ts`
- Create: `apps/api/src/modules/agents/application/commands/run-turn.handler.ts`
- Create: `apps/api/src/modules/agents/application/commands/run-turn.handler.spec.ts`

- [ ] **Step 1: Define the command DTO**

```ts
// apps/api/src/modules/agents/application/commands/run-turn.command.ts
import type { StreamBroker } from '../../domain/ports/stream-broker.port'

export class RunTurnCommand {
  constructor(
    public readonly traceId: string,
    public readonly conversationId: string,
    public readonly actorId: string,
    public readonly tenantId: string,
    public readonly roleId: string,
    public readonly subAgentKey: string,
    public readonly userUtterance: string,
    public readonly broker: StreamBroker,
    public readonly abortSignal: AbortSignal,
  ) {}
}
```

- [ ] **Step 2: Write failing test**

```ts
// apps/api/src/modules/agents/application/commands/run-turn.handler.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RunTurnCommand } from './run-turn.command'
import { RunTurnHandler } from './run-turn.handler'
import { InMemoryStreamBroker } from '../services/in-memory-stream-broker'

describe('RunTurnHandler', () => {
  const tenantA = '00000000-0000-4000-8000-00000000000a'
  const actor = '00000000-0000-4000-8000-000000000aaa'
  const conv = '00000000-0000-4000-8000-000000000ccc'
  const trace = '00000000-0000-4000-8000-000000000ddd'
  const roleAdmin = '00000000-0000-4000-8000-000000000001'

  const registry = { get: vi.fn() }
  const runner = { run: vi.fn() }
  const messages = { create: vi.fn().mockResolvedValue(undefined) }
  let broker: InMemoryStreamBroker
  let h: RunTurnHandler

  beforeEach(() => {
    broker = new InMemoryStreamBroker()
    registry.get.mockReturnValue({ key: 'planner', version: '1.0.0', budgets: {} })
    runner.run.mockResolvedValue({ reason: 'completed', text: 'ok' })
    h = new RunTurnHandler(registry as never, runner as never, messages as never)
  })

  it('emits turn.started first, then dispatches runner, then persists assistant message', async () => {
    const cmd = new RunTurnCommand(
      trace,
      conv,
      actor,
      tenantA,
      roleAdmin,
      'planner',
      'hi',
      broker,
      new AbortController().signal,
    )
    await h.execute(cmd)

    expect(broker.events[0]).toMatchObject({
      type: 'turn.started',
      traceId: trace,
      conversationId: conv,
    })
    expect(runner.run).toHaveBeenCalled()
    expect(messages.create).toHaveBeenCalledTimes(2) // user + assistant
  })

  it('persists the user message before dispatching the runner', async () => {
    const seen: string[] = []
    messages.create.mockImplementation(async (m: { role: string }) => {
      seen.push(`persist:${m.role}`)
    })
    runner.run.mockImplementation(async () => {
      seen.push('run')
      return { reason: 'completed', text: 'ok' }
    })
    await h.execute(
      new RunTurnCommand(
        trace,
        conv,
        actor,
        tenantA,
        roleAdmin,
        'planner',
        'hi',
        broker,
        new AbortController().signal,
      ),
    )
    expect(seen).toEqual(['persist:user', 'run', 'persist:assistant'])
  })

  it('does not persist the assistant message on cancelled turns', async () => {
    runner.run.mockResolvedValue({ reason: 'cancelled', text: '' })
    await h.execute(
      new RunTurnCommand(
        trace,
        conv,
        actor,
        tenantA,
        roleAdmin,
        'planner',
        'hi',
        broker,
        new AbortController().signal,
      ),
    )
    expect(messages.create).toHaveBeenCalledTimes(1) // user only
  })
})
```

- [ ] **Step 3: Run — expect failure**

```bash
bun run --filter @future/api test:unit -- run-turn.handler
```

- [ ] **Step 4: Implement**

```ts
// apps/api/src/modules/agents/application/commands/run-turn.handler.ts
import { Inject, Injectable } from '@nestjs/common'
import { RunTurnCommand } from './run-turn.command'
import { SubAgentRegistry } from '../sub-agents/sub-agent-registry'
import { SubAgentRunnerService } from '../services/sub-agent-runner.service'
import { TurnContext } from '../../domain/value-objects/turn-context'
import { L1Cache } from '../services/l1-cache'
import { CircuitBreaker } from '../services/circuit-breaker'
import { AGENT_MESSAGE_REPOSITORY } from '../../domain/repositories/agent-message.repository'
import type { AgentMessageRepository } from '../../domain/repositories/agent-message.repository'

@Injectable()
export class RunTurnHandler {
  constructor(
    private readonly registry: SubAgentRegistry,
    private readonly runner: SubAgentRunnerService,
    @Inject(AGENT_MESSAGE_REPOSITORY) private readonly messages: AgentMessageRepository,
  ) {}

  async execute(cmd: RunTurnCommand): Promise<void> {
    cmd.broker.emit({
      type: 'turn.started',
      traceId: cmd.traceId,
      conversationId: cmd.conversationId,
    })

    await this.messages.create({
      sessionId: cmd.conversationId,
      tenantId: cmd.tenantId,
      role: 'user',
      content: cmd.userUtterance,
      toolName: null,
      toolArgs: null,
      modelUsed: null,
      tokensUsed: null,
      isError: false,
    })

    const cfg = this.registry.get(cmd.subAgentKey)
    const ctx = TurnContext.create({
      traceId: cmd.traceId,
      actorId: cmd.actorId,
      tenantId: cmd.tenantId,
      subAgentKey: cmd.subAgentKey,
      abortSignal: cmd.abortSignal,
      l1Cache: new L1Cache(),
      circuitBreaker: new CircuitBreaker(),
    })

    const result = await this.runner.run(cfg, ctx, cmd.broker, {
      roleId: cmd.roleId,
      userUtterance: cmd.userUtterance,
    })

    if (
      result.reason === 'completed' ||
      result.reason === 'refused' ||
      result.reason === 'ceiling'
    ) {
      await this.messages.create({
        sessionId: cmd.conversationId,
        tenantId: cmd.tenantId,
        role: 'assistant',
        content: result.text,
        toolName: null,
        toolArgs: null,
        modelUsed: null,
        tokensUsed: result.usage?.totalTokens ?? null,
        isError: result.reason !== 'completed',
      })
    }
    // Cancelled turns: no assistant persistence. Erroring turns have already thrown.
  }
}
```

- [ ] **Step 5: Run + commit**

```bash
bun run --filter @future/api test:unit -- run-turn.handler
git add apps/api/src/modules/agents/application/commands/run-turn.command.ts \
        apps/api/src/modules/agents/application/commands/run-turn.handler.ts \
        apps/api/src/modules/agents/application/commands/run-turn.handler.spec.ts
git commit -m "feat(agents): RunTurnHandler (persist user → run → persist assistant)"
```

---

## Task 2: `FastifyStreamBroker`

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/streaming/fastify-stream-broker.ts`
- Create: `apps/api/src/modules/agents/infrastructure/streaming/fastify-stream-broker.spec.ts`

Adapter: writes SSE frames (`data: <json>\n\n`) to a Fastify reply and handles close cleanly.

- [ ] **Step 1: Write failing test**

```ts
// apps/api/src/modules/agents/infrastructure/streaming/fastify-stream-broker.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { FastifyStreamBroker } from './fastify-stream-broker'

function makeFakeReply() {
  const writes: string[] = []
  return {
    raw: {
      write: vi.fn((chunk: string) => {
        writes.push(chunk)
        return true
      }),
      end: vi.fn(),
    },
    writes,
  }
}

describe('FastifyStreamBroker', () => {
  it('writes SSE-framed JSON for each event', () => {
    const reply = makeFakeReply()
    const b = new FastifyStreamBroker(reply as never)
    b.emit({ type: 'turn.started', traceId: 't', conversationId: 'c' })
    expect(reply.writes[0]).toMatch(/^data: /)
    expect(reply.writes[0]).toMatch(/turn\.started/)
    expect(reply.writes[0].endsWith('\n\n')).toBe(true)
  })

  it('close() ends the response', () => {
    const reply = makeFakeReply()
    const b = new FastifyStreamBroker(reply as never)
    b.close()
    expect(reply.raw.end).toHaveBeenCalled()
  })

  it('emit() after close() is a no-op', () => {
    const reply = makeFakeReply()
    const b = new FastifyStreamBroker(reply as never)
    b.close()
    b.emit({ type: 'answer.token', text: 'x' })
    expect(reply.raw.write).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
bun run --filter @future/api test:unit -- fastify-stream-broker
```

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/agents/infrastructure/streaming/fastify-stream-broker.ts
import type { FastifyReply } from 'fastify'
import type { Phase1StreamEvent, StreamBroker } from '../../domain/ports/stream-broker.port'

export class FastifyStreamBroker implements StreamBroker {
  private closed = false

  constructor(private readonly reply: FastifyReply) {}

  emit(event: Phase1StreamEvent): void {
    if (this.closed) return
    const frame = `data: ${JSON.stringify(event)}\n\n`
    this.reply.raw.write(frame)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.reply.raw.end()
  }
}
```

- [ ] **Step 4: Run + commit**

```bash
bun run --filter @future/api test:unit -- fastify-stream-broker
git add apps/api/src/modules/agents/infrastructure/streaming/fastify-stream-broker.ts \
        apps/api/src/modules/agents/infrastructure/streaming/fastify-stream-broker.spec.ts
git commit -m "feat(agents): FastifyStreamBroker (SSE frames over Fastify reply)"
```

---

## Task 3: `AgentTurnController` — `POST /agent/turn`

**Files:**

- Create: `apps/api/src/modules/agents/interface/http/agent-turn.controller.ts`
- Create: `apps/api/src/modules/agents/interface/http/agent-turn.controller.integration.spec.ts`

- [ ] **Step 1: Write failing integration test**

```ts
// apps/api/src/modules/agents/interface/http/agent-turn.controller.integration.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { makeTestDb, seedUser } from '@future/db/test-helpers'
import { AppModule } from '../../../../app.module'

describe('POST /agent/turn (integration)', () => {
  let app: NestFastifyApplication
  const tenantA = '00000000-0000-4000-8000-00000000000a'
  const actor = '00000000-0000-4000-8000-000000000aaa'

  beforeAll(async () => {
    await makeTestDb({ tenantId: tenantA })
    await seedUser({ tenantId: tenantA, userId: actor })

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = mod.createNestApplication(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns SSE stream terminating with turn.ended', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agent/turn',
      headers: {
        cookie: `future-session=${/* issue a test JWT for actor in tenantA */ ''}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        surface: 'panel',
        userUtterance: 'hello',
        conversationId: '00000000-0000-4000-8000-000000000ccc',
      }),
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toMatch(/text\/event-stream/)
    expect(response.body).toMatch(/turn\.started/)
    expect(response.body).toMatch(/turn\.ended/)
  })
})
```

> The test JWT issuance detail follows existing integration-test helpers — e.g. `issueSessionCookie({ tenantId, actorId })` in the shared test-harness. Reuse whatever helper the other integration specs use (grep for `cookie: future-session` across existing specs).

- [ ] **Step 2: Run — expect failure**

```bash
bun run --filter @future/api test:integration -- agent-turn.controller
```

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/agents/interface/http/agent-turn.controller.ts
import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { RunTurnHandler } from '../../application/commands/run-turn.handler'
import { RunTurnCommand } from '../../application/commands/run-turn.command'
import { FastifyStreamBroker } from '../../infrastructure/streaming/fastify-stream-broker'

const bodySchema = z.object({
  surface: z.enum(['panel', 'inline']),
  userUtterance: z.string().min(1).max(8_000),
  conversationId: z.string().uuid(),
  subAgentKey: z.string().default('planner'),
})

interface AuthedRequest extends FastifyRequest {
  actorId: string
  tenantId: string
  roleId: string
}

@Controller('agent')
export class AgentTurnController {
  constructor(private readonly handler: RunTurnHandler) {}

  @Post('turn')
  async turn(
    @Body() raw: unknown,
    @Req() req: AuthedRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const body = bodySchema.parse(raw)
    const traceId = randomUUID()

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const controller = new AbortController()
    req.raw.on('close', () => controller.abort())

    const broker = new FastifyStreamBroker(reply)

    try {
      await this.handler.execute(
        new RunTurnCommand(
          traceId,
          body.conversationId,
          req.actorId,
          req.tenantId,
          req.roleId,
          body.subAgentKey,
          body.userUtterance,
          broker,
          controller.signal,
        ),
      )
    } catch (err) {
      broker.emit({ type: 'turn.ended', reason: 'error' })
      throw err
    } finally {
      broker.close()
    }
  }
}
```

> **Auth guard caveat:** `actorId`, `tenantId`, `roleId` come from the existing session middleware. If the project does not yet expose a `@UseGuards(SessionGuard)`-style decorator for Fastify controllers, match whatever existing controllers use (grep for `@Controller(` in the repo). If none exist, use the same auth middleware pattern that tRPC uses but adapted for Fastify. This is the one place where you may need to plumb through existing infrastructure; it is NOT a Phase 1 invariant to design a new guard.

- [ ] **Step 4: Run + commit**

```bash
bun run --filter @future/api test:integration -- agent-turn.controller
git add apps/api/src/modules/agents/interface/http/agent-turn.controller.ts \
        apps/api/src/modules/agents/interface/http/agent-turn.controller.integration.spec.ts
git commit -m "feat(agents): POST /agent/turn SSE controller with abort on disconnect"
```

---

## Task 4: Delete `send-message` + rewire module

**Files:**

- Delete:
  - `apps/api/src/modules/agents/application/commands/send-message.command.ts`
  - `apps/api/src/modules/agents/application/commands/send-message.handler.ts`
  - `apps/api/src/modules/agents/application/commands/send-message.handler.spec.ts`
- Modify:
  - `apps/api/src/modules/agents/interface/trpc/session.router.ts` — remove `sendMessage` field; remove `sendMessage` from `setAgentSessionHandlers`
  - `apps/api/src/modules/agents/agents.module.ts` — drop `SendMessageHandler` import + provider; register `RunTurnHandler` and `AgentTurnController`

- [ ] **Step 1: Remove files**

```bash
rm apps/api/src/modules/agents/application/commands/send-message.command.ts \
   apps/api/src/modules/agents/application/commands/send-message.handler.ts \
   apps/api/src/modules/agents/application/commands/send-message.handler.spec.ts
```

- [ ] **Step 2: Update `session.router.ts`**

Delete the `sendMessage` tRPC procedure from the router, and change the setter type. Grep the router for `sendMessage`; remove every occurrence. The setter in the router file:

```ts
// Before:
export function setAgentSessionHandlers(h: {
  createSession: CreateSessionHandler
  listSessions: ListSessionsHandler
  sendMessage: SendMessageHandler
}) { ... }

// After:
export function setAgentSessionHandlers(h: {
  createSession: CreateSessionHandler
  listSessions: ListSessionsHandler
}) { ... }
```

- [ ] **Step 3: Update `agents.module.ts`**

Remove:

```ts
import { SendMessageHandler } from './application/commands/send-message.handler'
// ... SendMessageHandler, in providers
// ... sendMessage: this.sendMessage, in setAgentSessionHandlers({...})
// ... private readonly sendMessage: SendMessageHandler, in constructor
```

Add:

```ts
import { RunTurnHandler } from './application/commands/run-turn.handler'
import { AgentTurnController } from './interface/http/agent-turn.controller'

@Module({
  // ...
  controllers: [AgentTurnController],  // add if not present
  providers: [
    // ...
    RunTurnHandler,
  ],
})
```

- [ ] **Step 4: Typecheck**

```bash
bun run --filter @future/api typecheck
```

Expected: PASS. If anything still references `SendMessageHandler` or `sendMessage`, the typecheck surfaces it.

- [ ] **Step 5: Run all tests**

```bash
bun run --filter @future/api test:unit
bun run --filter @future/api test:integration -- agents
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/agents/application/commands/send-message.command.ts \
        apps/api/src/modules/agents/application/commands/send-message.handler.ts \
        apps/api/src/modules/agents/application/commands/send-message.handler.spec.ts \
        apps/api/src/modules/agents/interface/trpc/session.router.ts \
        apps/api/src/modules/agents/agents.module.ts
git commit -m "refactor(agents): remove send-message; wire RunTurnHandler + AgentTurnController"
```

---

## Task 5: Frontend SSE schema full refactor

**Files:**

- Modify: `packages/agent/src/runtime/sse-event-schema.ts` — full rewrite
- Modify: `packages/agent/src/runtime/sse-event-schema.spec.ts` — full rewrite

- [ ] **Step 1: Rewrite `sse-event-schema.ts`**

Replace the entire file with:

```ts
// packages/agent/src/runtime/sse-event-schema.ts
import { z } from 'zod'

const turnStartedEvent = z.object({
  type: z.literal('turn.started'),
  traceId: z.string(),
  conversationId: z.string(),
})

const answerTokenEvent = z.object({
  type: z.literal('answer.token'),
  text: z.string(),
})

const answerCompleteEvent = z.object({
  type: z.literal('answer.complete'),
  shape: z.literal('narrative'),
  content: z.string(),
  citations: z.array(z.string()),
})

const refusalStartedEvent = z.object({
  type: z.literal('refusal.started'),
  reason: z.string(),
})

const turnEndedEvent = z.object({
  type: z.literal('turn.ended'),
  reason: z.enum(['completed', 'refused', 'error', 'cancelled', 'ceiling']),
})

export const sseEventSchema = z.discriminatedUnion('type', [
  turnStartedEvent,
  answerTokenEvent,
  answerCompleteEvent,
  refusalStartedEvent,
  turnEndedEvent,
])

export type SseEvent = z.infer<typeof sseEventSchema>
export type TurnEndedReason = z.infer<typeof turnEndedEvent>['reason']
```

- [ ] **Step 2: Rewrite `sse-event-schema.spec.ts`**

```ts
// packages/agent/src/runtime/sse-event-schema.spec.ts
import { describe, it, expect } from 'vitest'
import { sseEventSchema } from './sse-event-schema'

describe('sseEventSchema', () => {
  it('parses turn.started', () => {
    const r = sseEventSchema.safeParse({ type: 'turn.started', traceId: 't', conversationId: 'c' })
    expect(r.success).toBe(true)
  })

  it('parses answer.token', () => {
    expect(sseEventSchema.safeParse({ type: 'answer.token', text: 'hi' }).success).toBe(true)
  })

  it('parses answer.complete with narrative shape', () => {
    const r = sseEventSchema.safeParse({
      type: 'answer.complete',
      shape: 'narrative',
      content: 'hi',
      citations: [],
    })
    expect(r.success).toBe(true)
  })

  it('parses refusal.started', () => {
    expect(sseEventSchema.safeParse({ type: 'refusal.started', reason: 'policy' }).success).toBe(
      true,
    )
  })

  it('parses every turn.ended reason', () => {
    for (const reason of ['completed', 'refused', 'error', 'cancelled', 'ceiling'] as const) {
      expect(sseEventSchema.safeParse({ type: 'turn.ended', reason }).success).toBe(true)
    }
  })

  it('rejects removed legacy event types (answer.delta)', () => {
    expect(sseEventSchema.safeParse({ type: 'answer.delta', text: 'x' }).success).toBe(false)
  })
})
```

- [ ] **Step 3: Run**

```bash
bun run --filter @future/agent test:unit -- sse-event-schema
```

Expected: 6 PASS (the last test confirms no legacy shim remains).

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/runtime/sse-event-schema.ts packages/agent/src/runtime/sse-event-schema.spec.ts
git commit -m "refactor(agent): SSE schema aligned with spec §15.3 Phase-1 subset"
```

---

## Task 6: `agent-turn-store` full refactor

**Files:**

- Modify: `packages/agent/src/runtime/agent-turn-store.ts` — rewrite
- Modify: `packages/agent/src/runtime/agent-turn-store.spec.ts` — rewrite

- [ ] **Step 1: Rewrite the store**

```ts
// packages/agent/src/runtime/agent-turn-store.ts
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { SseEvent, TurnEndedReason } from './sse-event-schema'

export interface AgentTurnState {
  traceId: string | null
  conversationId: string | null
  running: boolean
  answerText: string
  refusalReason: string | null
  endedReason: TurnEndedReason | null

  reset: () => void
  dispatch: (event: SseEvent) => void
}

export type AgentTurnStore = UseBoundStore<StoreApi<AgentTurnState>>

export function createAgentTurnStore(): AgentTurnStore {
  return create<AgentTurnState>((set) => ({
    traceId: null,
    conversationId: null,
    running: false,
    answerText: '',
    refusalReason: null,
    endedReason: null,

    reset: () =>
      set({
        traceId: null,
        conversationId: null,
        running: false,
        answerText: '',
        refusalReason: null,
        endedReason: null,
      }),

    dispatch: (event) => {
      if (event.type === 'turn.started') {
        set({
          traceId: event.traceId,
          conversationId: event.conversationId,
          running: true,
          answerText: '',
          refusalReason: null,
          endedReason: null,
        })
      } else if (event.type === 'answer.token') {
        set((s) => ({ answerText: s.answerText + event.text }))
      } else if (event.type === 'answer.complete') {
        set({ answerText: event.content })
      } else if (event.type === 'refusal.started') {
        set({ refusalReason: event.reason })
      } else if (event.type === 'turn.ended') {
        set({ running: false, endedReason: event.reason })
      }
    },
  }))
}
```

- [ ] **Step 2: Rewrite the tests**

```ts
// packages/agent/src/runtime/agent-turn-store.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createAgentTurnStore, type AgentTurnStore } from './agent-turn-store'

describe('AgentTurnStore', () => {
  let store: AgentTurnStore

  beforeEach(() => {
    store = createAgentTurnStore()
  })

  it('starts running on turn.started and resets answer', () => {
    store.getState().dispatch({ type: 'turn.started', traceId: 't', conversationId: 'c' })
    const s = store.getState()
    expect(s.running).toBe(true)
    expect(s.traceId).toBe('t')
    expect(s.conversationId).toBe('c')
    expect(s.answerText).toBe('')
  })

  it('accumulates answer.token events', () => {
    store.getState().dispatch({ type: 'turn.started', traceId: 't', conversationId: 'c' })
    store.getState().dispatch({ type: 'answer.token', text: 'he' })
    store.getState().dispatch({ type: 'answer.token', text: 'llo' })
    expect(store.getState().answerText).toBe('hello')
  })

  it('answer.complete overrides accumulated text with the final value', () => {
    store.getState().dispatch({ type: 'answer.token', text: 'partial' })
    store
      .getState()
      .dispatch({ type: 'answer.complete', shape: 'narrative', content: 'final', citations: [] })
    expect(store.getState().answerText).toBe('final')
  })

  it('refusal.started sets refusalReason and remains running', () => {
    store.getState().dispatch({ type: 'refusal.started', reason: 'policy' })
    expect(store.getState().refusalReason).toBe('policy')
    expect(store.getState().running).toBe(
      false === store.getState().running ? false : store.getState().running,
    )
  })

  it('turn.ended stops running and records the reason', () => {
    store.getState().dispatch({ type: 'turn.started', traceId: 't', conversationId: 'c' })
    store.getState().dispatch({ type: 'turn.ended', reason: 'completed' })
    expect(store.getState().running).toBe(false)
    expect(store.getState().endedReason).toBe('completed')
  })

  it('reset() clears all fields', () => {
    store.getState().dispatch({ type: 'turn.started', traceId: 't', conversationId: 'c' })
    store.getState().dispatch({ type: 'answer.token', text: 'x' })
    store.getState().reset()
    const s = store.getState()
    expect(s).toMatchObject({
      traceId: null,
      conversationId: null,
      running: false,
      answerText: '',
      refusalReason: null,
      endedReason: null,
    })
  })
})
```

- [ ] **Step 3: Run**

```bash
bun run --filter @future/agent test:unit -- agent-turn-store
```

Expected: 6 PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/runtime/agent-turn-store.ts packages/agent/src/runtime/agent-turn-store.spec.ts
git commit -m "refactor(agent): AgentTurnStore for Phase-1 SSE schema"
```

---

## Task 7: `agent-chat-adapter` full refactor

**Files:**

- Modify: `packages/agent/src/runtime/agent-chat-adapter.ts` — rewrite
- Modify: `packages/agent/src/runtime/agent-chat-adapter.spec.ts` — rewrite

- [ ] **Step 1: Rewrite the adapter**

```ts
// packages/agent/src/runtime/agent-chat-adapter.ts
import { fetchEventSource } from '@microsoft/fetch-event-source'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { sseEventSchema } from './sse-event-schema'
import type { AgentTurnStore } from './agent-turn-store'
import type { AgentContext } from '../types'

export interface AgentChatAdapterOptions {
  endpoint: string
  surface: 'panel' | 'inline'
  store: AgentTurnStore
  conversationId: string
  context?: AgentContext
}

export function createAgentChatAdapter(opts: AgentChatAdapterOptions): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      opts.store.getState().reset()

      const chunks: Array<{ content: [{ type: 'text'; text: string }] }> = []
      let resolveChunk: (() => void) | null = null
      let done = false
      let capturedError: unknown = null

      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
      const userUtterance = lastUser
        ? lastUser.content
            .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
            .map((c) => c.text)
            .join('')
        : ''

      const body = JSON.stringify({
        surface: opts.surface,
        userUtterance,
        conversationId: opts.conversationId,
      })

      fetchEventSource(opts.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: abortSignal,
        onmessage(ev) {
          const parsed = sseEventSchema.safeParse(JSON.parse(ev.data))
          if (!parsed.success) return
          const event = parsed.data

          opts.store.getState().dispatch(event)

          if (event.type === 'answer.token') {
            const nextText = opts.store.getState().answerText
            chunks.push({ content: [{ type: 'text', text: nextText }] })
          } else if (event.type === 'answer.complete') {
            chunks.push({ content: [{ type: 'text', text: event.content }] })
          }

          if (event.type === 'turn.ended') {
            done = true
          }

          resolveChunk?.()
          resolveChunk = null
        },
        onerror(err) {
          capturedError = err
          done = true
          resolveChunk?.()
          resolveChunk = null
          throw err
        },
      })
        .then(() => {
          done = true
          resolveChunk?.()
          resolveChunk = null
        })
        .catch(() => {
          // onerror already captured; .catch() silences unhandled rejection
        })

      while (!done || chunks.length > 0) {
        if (chunks.length === 0) {
          await new Promise<void>((resolve) => {
            resolveChunk = resolve
          })
        }
        while (chunks.length > 0) yield chunks.shift()!
      }

      if (capturedError) throw capturedError
    },
  }
}
```

- [ ] **Step 2: Update the adapter's test to the new schema**

```ts
// packages/agent/src/runtime/agent-chat-adapter.spec.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createAgentChatAdapter } from './agent-chat-adapter'
import { createAgentTurnStore } from './agent-turn-store'

vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(),
}))
import { fetchEventSource } from '@microsoft/fetch-event-source'

afterEach(() => vi.clearAllMocks())

describe('createAgentChatAdapter', () => {
  it('posts userUtterance + surface + conversationId', async () => {
    const store = createAgentTurnStore()
    const adapter = createAgentChatAdapter({
      endpoint: '/agent/turn',
      surface: 'panel',
      store,
      conversationId: 'conv-1',
    })
    // Drive run() but intercept fetchEventSource to avoid real IO.
    ;(fetchEventSource as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (_url: string, opts: { body?: string; onmessage?: (ev: { data: string }) => void }) => {
        const body = JSON.parse(opts.body!)
        expect(body).toMatchObject({
          surface: 'panel',
          userUtterance: 'hello',
          conversationId: 'conv-1',
        })
        opts.onmessage?.({
          data: JSON.stringify({ type: 'turn.started', traceId: 't', conversationId: 'conv-1' }),
        })
        opts.onmessage?.({ data: JSON.stringify({ type: 'turn.ended', reason: 'completed' }) })
      },
    )

    const gen = adapter.run({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      abortSignal: new AbortController().signal,
    })
    for await (const _ of gen) {
      /* drain */
    }
  })
})
```

- [ ] **Step 3: Run**

```bash
bun run --filter @future/agent test:unit -- agent-chat-adapter
```

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/runtime/agent-chat-adapter.ts packages/agent/src/runtime/agent-chat-adapter.spec.ts
git commit -m "refactor(agent): chat adapter posts { surface, userUtterance, conversationId }"
```

---

## Task 8: Update `index.ts` exports + panel/inline consumers

**Files:**

- Modify: `packages/agent/src/index.ts` — drop obsolete named exports; add new
- Modify: `packages/agent/src/panel/agent-panel.tsx` — follow new store field names
- Modify: `packages/agent/src/panel/agent-panel.spec.tsx`

- [ ] **Step 1: Update `index.ts`**

Any re-exports referencing old symbols (`answer.delta`, old `dispatch` shape) must update to the new names. Delete dead exports. Grep:

```bash
grep -n "answer\\.delta\\|TurnEndReason" packages/agent/src
```

Rename `TurnEndReason` → `TurnEndedReason` wherever re-exported.

- [ ] **Step 2: Update `agent-panel.tsx`**

If it reads store fields like `endedReason`, `refusalReason`, or `running`, align with the new store. If it consumed `dispatch(event)` directly (other than in the adapter), follow the new `SseEvent` discriminant set.

- [ ] **Step 3: Typecheck package**

```bash
bun run --filter @future/agent typecheck
bun run --filter @future/agent test:unit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/
git commit -m "refactor(agent): align index + panel with new SSE schema + store shape"
```

---

## Task 9: Mount `<AgentPanel>` trigger in `web-planner`

**Files:**

- Modify: `apps/web-planner/src/app/layout-client.tsx`

- [ ] **Step 1: Add the panel + a trigger button**

```tsx
// apps/web-planner/src/app/layout-client.tsx
'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout, type PermissionTrpcClient } from '@future/app-layout'
import {
  AgentProvider,
  AgentPanel,
  createAgentTurnStore,
  createAgentChatAdapter,
  useAgentState,
} from '@future/agent'
import { Button } from '@future/ui'
import { Sparkles } from 'lucide-react'
import { trpc } from '../lib/trpc'
import { plannerNavConfig } from '../navigation'

function AgentTrigger() {
  const { togglePanel } = useAgentState()
  return (
    <Button variant="ghost" size="sm" onClick={togglePanel} aria-label="Open agent panel">
      <Sparkles className="size-4" />
      <span>Agent</span>
    </Button>
  )
}

function PlannerAgentHost({ conversationId }: { conversationId: string }) {
  const [store] = useState(() => createAgentTurnStore())
  const adapter = createAgentChatAdapter({
    endpoint: '/api/agent/turn',
    surface: 'panel',
    store,
    conversationId,
  })
  return <AgentPanel adapter={adapter} store={store} />
}

export function PlannerLayoutClient({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  )
  // Phase 1: single conversation per browser session; UUIDv7 from the server in Phase 2.
  const [conversationId] = useState(() => crypto.randomUUID())

  return (
    <QueryClientProvider client={queryClient}>
      <AgentProvider>
        <AppLayout
          config={plannerNavConfig}
          trpc={trpc as unknown as PermissionTrpcClient}
          toolbarExtras={<AgentTrigger />}
        >
          {children}
        </AppLayout>
        <PlannerAgentHost conversationId={conversationId} />
      </AgentProvider>
    </QueryClientProvider>
  )
}
```

> **Two caveats:**
>
> 1. `AgentPanel`'s actual props may differ from `{ adapter, store }`. Check the current signature (`packages/agent/src/panel/agent-panel.tsx`) and adapt. If props are different, forward as required.
> 2. `AppLayout.toolbarExtras` may not exist under that name. Check `packages/app-layout/src/` for the real slot; pass through whatever accepts a trailing React node in the top toolbar. If the layout has no such slot, add one — but keep the change minimal.

- [ ] **Step 2: Add Next.js API rewrite for `/api/agent/turn` → `apps/api`**

Verify how the other zones proxy tRPC to `apps/api` (typically a `next.config.ts` rewrite). Mirror the pattern for `/api/agent/turn`. The rewrite target is the Fastify `POST /agent/turn` route.

- [ ] **Step 3: Boot planner + verify smoke**

From repo root, start the API and web-planner:

```bash
bun run --filter @future/api dev &
bun run --filter @future/web-planner dev
```

Open the planner in a browser, click the Agent button, verify the panel opens, type "what's overdue on Plan X?", observe tokens streaming.

- [ ] **Step 4: Commit**

```bash
git add apps/web-planner/src/app/layout-client.tsx \
        apps/web-planner/next.config.ts
git commit -m "feat(web-planner): mount AgentPanel trigger + proxy /api/agent/turn"
```

---

## Task 10: Exit-criterion smoke verification

- [ ] **Step 1: Seed a test tenant with a plan containing an overdue task**

Follow the existing planner seed helpers (grep `seedPlan` / `seedTask` in tests).

- [ ] **Step 2: Log in to the planner, open the agent, ask the demo query**

Expected:

- Panel opens; composer focused.
- `turn.started` event fires.
- Streaming tokens appear as they arrive.
- `turn.ended { reason: 'completed' }` closes the stream.
- Langfuse dashboard (local instance at `LANGFUSE_BASE_URL`) shows a trace with six hashes + `cached_tokens`.
- Kernel audit: one `agent.tool_called` per tool call, correlated by `trace_id`.

- [ ] **Step 3: Cross-tenant RLS sanity**

From a second seeded tenant, ask for the same plan id. Expected: tool result empty / denied; narrative answer acknowledges "plan not found".

- [ ] **Step 4: Abort mid-stream**

Close the browser tab while tokens are streaming. Check the Fastify logs / DB audit table: no new audit rows after the abort timestamp.

---

## Self-check before leaving Plan 05

- [ ] All 10 tasks committed.
- [ ] `bun run --filter @future/api test:unit` green.
- [ ] `bun run --filter @future/agent test:unit` green.
- [ ] `bun run --filter @future/api test:integration -- agent-turn` green.
- [ ] `grep -r send-message apps/api/src/modules/agents` returns no matches.
- [ ] `grep -r answer\\.delta packages/agent/src` returns no matches.
- [ ] End-to-end demo query works and shows up in Langfuse + audit logs.

---

Phase 1 is complete after Plan 05. Exit criterion from the Phase 1 design doc satisfied.

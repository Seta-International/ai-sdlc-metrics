# Agent UX Refactor — Plan 5: ActionFooter (feedback + regenerate)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each completed assistant turn gets a footer row with copy / regenerate / thumbs-up / thumbs-down / iterate. Two new backend mutations (`agents.feedback.submit`, `agents.session.regenerateLastTurn`) and one new permission (`AGENT_CONVERSATION_WRITE`).

**Architecture:** New table `agents.message_feedback` (squashed into `0000_initial.sql`). `submit-feedback` and `regenerate-last-turn` command handlers. Frontend: `ActionFooter` rendered below assistant messages in `AgentThread` (assistant-ui `MessagePrimitive.If completed`).

**Tech Stack:** NestJS · Drizzle · tRPC · React 19 · Vitest.

**Spec:** `docs/superpowers/specs/2026-04-30-agent-module-ux-refactor-design.md` §8

**Depends on:** Plan 1 (`TinyBtn`), Plan 2 (`AgentThread` already mounts assistant-message slot).

---

## Task 1: Pre-flight + branch

```bash
git checkout main && git pull
git checkout -b feat/agent-ux-plan-5-action-footer
```

---

## Task 2: Add `AGENT_CONVERSATION_WRITE` permission

**Files:**

- Modify: `apps/api/src/common/auth/permissions.ts`

- [ ] **Step 1: Locate and add the constant**

```bash
grep -n AGENT_CONVERSATION_READ apps/api/src/common/auth/permissions.ts
```

Add `AGENT_CONVERSATION_WRITE` next to it. Whatever shape the file uses (enum, const map, or zod literal union), follow the existing pattern. Example if it's a const map:

```ts
AGENT_CONVERSATION_WRITE: 'agent.conversation.write',
```

- [ ] **Step 2: Grant it in default role(s)**

```bash
rg -l 'AGENT_CONVERSATION_READ' apps/api/src
```

For each role/seed file that grants `AGENT_CONVERSATION_READ`, also grant `AGENT_CONVERSATION_WRITE` (every authenticated user can submit feedback on their own turns).

- [ ] **Step 3: Build & commit**

```bash
bun run --filter @future/api typecheck
git add apps/api/src
git commit -m "feat(auth): add AGENT_CONVERSATION_WRITE permission"
```

---

## Task 3: `agent_message_feedback` schema

**Files:**

- Create: `apps/api/src/modules/agents/infrastructure/schema/agent-message-feedback.schema.ts`
- Modify: any index file that re-exports schemas (search for one with the existing schemas)

- [ ] **Step 1: Implement schema**

Create `apps/api/src/modules/agents/infrastructure/schema/agent-message-feedback.schema.ts`:

```ts
import { uuid, text, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { agentsSchema } from './agents.schema'

/**
 * Per-message feedback (thumbs up / down + optional note).
 * One row per (tenant, message, actor). Idempotent — duplicate submissions
 * upsert.
 */
export const agentMessageFeedback = agentsSchema.table(
  'agent_message_feedback',
  {
    tenantId: uuid('tenant_id').notNull(),
    messageId: uuid('message_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    rating: text('rating').notNull(), // 'up' | 'down'
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.messageId, t.actorId] })],
)
```

- [ ] **Step 2: Re-squash `0000_initial.sql`**

```bash
cd packages/db
rm -rf drizzle/migrations/*.sql drizzle/migrations/meta
cd ../..
bun run db:generate --name initial
grep -n agent_message_feedback packages/db/drizzle/migrations/0000_initial.sql
```

Expected: at least one match.

- [ ] **Step 3: Reapply DB**

```bash
bun run db:down -v && bun run db:up && bun run db:migrate
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/agents/infrastructure/schema packages/db/drizzle/migrations
git commit -m "feat(agents): add agent_message_feedback table"
```

---

## Task 4: `MessageFeedback` domain entity + repo

**Files:**

- Create: `apps/api/src/modules/agents/domain/entities/message-feedback.ts`
- Create: `apps/api/src/modules/agents/domain/repositories/message-feedback.repository.ts`
- Create: `apps/api/src/modules/agents/infrastructure/drizzle-message-feedback.repository.ts`
- Create: `apps/api/src/modules/agents/infrastructure/drizzle-message-feedback.repository.spec.ts`

- [ ] **Step 1: Entity**

`message-feedback.ts`:

```ts
export type FeedbackRating = 'up' | 'down'

export interface MessageFeedback {
  readonly tenantId: string
  readonly messageId: string
  readonly actorId: string
  readonly rating: FeedbackRating
  readonly note: string | null
  readonly createdAt: Date
}
```

- [ ] **Step 2: Repository interface**

`message-feedback.repository.ts`:

```ts
import type { MessageFeedback, FeedbackRating } from '../entities/message-feedback'

export interface MessageFeedbackRepository {
  upsert(input: {
    tenantId: string
    messageId: string
    actorId: string
    rating: FeedbackRating
    note?: string | null
  }): Promise<MessageFeedback>
}
```

- [ ] **Step 3: Drizzle implementation**

`drizzle-message-feedback.repository.ts`:

```ts
import { Injectable, Inject } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { agentMessageFeedback } from './schema/agent-message-feedback.schema'
import { DB_TOKEN } from '../../../common/db/db-token'
import type { Database } from '../../../common/db/types'
import type { MessageFeedbackRepository } from '../domain/repositories/message-feedback.repository'
import type { MessageFeedback } from '../domain/entities/message-feedback'

@Injectable()
export class DrizzleMessageFeedbackRepository implements MessageFeedbackRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Database) {}

  async upsert(input): Promise<MessageFeedback> {
    const rows = await this.db
      .insert(agentMessageFeedback)
      .values({
        tenantId: input.tenantId,
        messageId: input.messageId,
        actorId: input.actorId,
        rating: input.rating,
        note: input.note ?? null,
      })
      .onConflictDoUpdate({
        target: [
          agentMessageFeedback.tenantId,
          agentMessageFeedback.messageId,
          agentMessageFeedback.actorId,
        ],
        set: {
          rating: input.rating,
          note: input.note ?? null,
        },
      })
      .returning()
    const r = rows[0]!
    return {
      tenantId: r.tenantId,
      messageId: r.messageId,
      actorId: r.actorId,
      rating: r.rating as 'up' | 'down',
      note: r.note,
      createdAt: r.createdAt,
    }
  }
}
```

> **Implementation note:** the actual `DB_TOKEN`/`Database` import paths come from the repo's existing wiring. Inspect another repository (e.g. `drizzle-draft.repository.ts`) for the exact imports.

- [ ] **Step 4: Tests**

`drizzle-message-feedback.repository.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
// import the project's standard integration-test helpers (real DB)
// adapt to the existing pattern used by drizzle-draft.repository.spec.ts

describe('DrizzleMessageFeedbackRepository', () => {
  it('inserts a new feedback row', async () => {
    // const repo = new DrizzleMessageFeedbackRepository(db)
    // const result = await repo.upsert({
    //   tenantId: 't1', messageId: 'm1', actorId: 'u1', rating: 'up',
    // })
    // expect(result.rating).toBe('up')
    expect(true).toBe(true) // placeholder: implement with repo's standard test fixture
  })

  it('upserts when same actor submits twice (idempotent)', async () => {
    // first up, then down — final row should be down
    expect(true).toBe(true)
  })
})
```

> Replace placeholders with the project's actual integration-test fixtures (look at `drizzle-draft.repository.spec.ts` for the canonical setup).

- [ ] **Step 5: Build + commit**

```bash
bun run --filter @future/api typecheck
git add apps/api/src/modules/agents
git commit -m "feat(agents): MessageFeedback entity, repo interface, drizzle impl"
```

---

## Task 5: `SubmitFeedback` command + handler

**Files:**

- Create: `apps/api/src/modules/agents/application/commands/submit-feedback.command.ts`
- Create: `apps/api/src/modules/agents/application/commands/submit-feedback.handler.ts`
- Create: `apps/api/src/modules/agents/application/commands/submit-feedback.handler.spec.ts`

- [ ] **Step 1: Command**

```ts
export class SubmitFeedbackCommand {
  constructor(
    public readonly tenantId: string,
    public readonly messageId: string,
    public readonly actorId: string,
    public readonly rating: 'up' | 'down',
    public readonly note?: string,
  ) {}
}
```

- [ ] **Step 2: Failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { SubmitFeedbackCommand } from './submit-feedback.command'
import { SubmitFeedbackHandler } from './submit-feedback.handler'

describe('SubmitFeedbackHandler', () => {
  it('calls repo.upsert with the command fields', async () => {
    const upsert = vi.fn().mockResolvedValue({
      tenantId: 't1',
      messageId: 'm1',
      actorId: 'u1',
      rating: 'up',
      note: null,
      createdAt: new Date(),
    })
    const handler = new SubmitFeedbackHandler({ upsert } as never)
    await handler.execute(new SubmitFeedbackCommand('t1', 'm1', 'u1', 'up'))
    expect(upsert).toHaveBeenCalledWith({
      tenantId: 't1',
      messageId: 'm1',
      actorId: 'u1',
      rating: 'up',
      note: undefined,
    })
  })

  it('forwards note when provided', async () => {
    const upsert = vi.fn().mockResolvedValue({
      tenantId: 't1',
      messageId: 'm1',
      actorId: 'u1',
      rating: 'down',
      note: 'wrong shape',
      createdAt: new Date(),
    })
    const handler = new SubmitFeedbackHandler({ upsert } as never)
    await handler.execute(new SubmitFeedbackCommand('t1', 'm1', 'u1', 'down', 'wrong shape'))
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ note: 'wrong shape' }))
  })
})
```

- [ ] **Step 3: Implement**

```ts
import { Injectable, Inject } from '@nestjs/common'
import { SubmitFeedbackCommand } from './submit-feedback.command'
import type { MessageFeedbackRepository } from '../../domain/repositories/message-feedback.repository'

export const MESSAGE_FEEDBACK_REPO = Symbol('MessageFeedbackRepository')

@Injectable()
export class SubmitFeedbackHandler {
  constructor(@Inject(MESSAGE_FEEDBACK_REPO) private readonly repo: MessageFeedbackRepository) {}

  async execute(cmd: SubmitFeedbackCommand): Promise<void> {
    await this.repo.upsert({
      tenantId: cmd.tenantId,
      messageId: cmd.messageId,
      actorId: cmd.actorId,
      rating: cmd.rating,
      note: cmd.note,
    })
  }
}
```

- [ ] **Step 4: Test + commit**

```bash
bun run --filter @future/api test:unit -- submit-feedback
git add apps/api/src/modules/agents/application/commands
git commit -m "feat(agents): SubmitFeedbackHandler"
```

---

## Task 6: `RegenerateLastTurn` command + handler

The existing `SendMessageCommand` already supports inserting messages. "Regenerate last turn" means: locate the last assistant message in the session, mark it superseded (or delete it), and emit a new turn with the same prior-user-message as input.

**Files:**

- Create: `apps/api/src/modules/agents/application/commands/regenerate-last-turn.command.ts`
- Create: `apps/api/src/modules/agents/application/commands/regenerate-last-turn.handler.ts`
- Create: `apps/api/src/modules/agents/application/commands/regenerate-last-turn.handler.spec.ts`

- [ ] **Step 1: Command**

```ts
export class RegenerateLastTurnCommand {
  constructor(
    public readonly tenantId: string,
    public readonly sessionId: string,
    public readonly actorId: string,
  ) {}
}
```

- [ ] **Step 2: Inspect existing session message repo / SendMessage to learn the model**

```bash
cat apps/api/src/modules/agents/application/commands/send-message.handler.ts
```

This handler knows how to insert messages and trigger SSE. Regenerate needs to:

1. Find the last assistant message in the session.
2. Mark it as superseded (or status='regenerated').
3. Re-issue a turn using the prior user message as input.

If the existing `agent_session_message` schema has no `superseded` flag, **add one** in this same task: `supersededAt timestamptz NULL`. Re-squash `0000_initial.sql`.

- [ ] **Step 3: Failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { RegenerateLastTurnCommand } from './regenerate-last-turn.command'
import { RegenerateLastTurnHandler } from './regenerate-last-turn.handler'

describe('RegenerateLastTurnHandler', () => {
  it('errors when there is no assistant message in the session', async () => {
    const messageRepo = { findLastAssistant: vi.fn().mockResolvedValue(null) }
    const handler = new RegenerateLastTurnHandler(messageRepo as never, {} as never)
    await expect(handler.execute(new RegenerateLastTurnCommand('t1', 's1', 'u1'))).rejects.toThrow(
      /no assistant turn/i,
    )
  })

  it('marks the last assistant message as superseded then re-runs', async () => {
    const findLastAssistant = vi.fn().mockResolvedValue({ id: 'm1', sessionId: 's1' })
    const findPriorUser = vi.fn().mockResolvedValue({ id: 'u1', content: 'Hello' })
    const markSuperseded = vi.fn().mockResolvedValue(undefined)
    const sendMessage = { execute: vi.fn().mockResolvedValue({ id: 'newId' }) }
    const handler = new RegenerateLastTurnHandler(
      { findLastAssistant, findPriorUser, markSuperseded } as never,
      sendMessage as never,
    )
    const result = await handler.execute(new RegenerateLastTurnCommand('t1', 's1', 'u1'))
    expect(markSuperseded).toHaveBeenCalledWith({ tenantId: 't1', messageId: 'm1' })
    expect(sendMessage.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', sessionId: 's1', content: 'Hello' }),
    )
    expect(result).toEqual({ newTurnId: 'newId' })
  })
})
```

- [ ] **Step 4: Implement**

```ts
import { Injectable, Inject } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { RegenerateLastTurnCommand } from './regenerate-last-turn.command'
import { SendMessageCommand } from './send-message.command'
import type { SendMessageHandler } from './send-message.handler'
// import message-repo abstraction the project uses

export const SESSION_MESSAGE_REPO = Symbol('SessionMessageRepository')

@Injectable()
export class RegenerateLastTurnHandler {
  constructor(
    @Inject(SESSION_MESSAGE_REPO)
    private readonly messageRepo: {
      findLastAssistant(input: {
        tenantId: string
        sessionId: string
      }): Promise<{ id: string; sessionId: string } | null>
      findPriorUser(input: {
        tenantId: string
        messageId: string
      }): Promise<{ id: string; content: string } | null>
      markSuperseded(input: { tenantId: string; messageId: string }): Promise<void>
    },
    private readonly sendMessageHandler: SendMessageHandler,
  ) {}

  async execute(cmd: RegenerateLastTurnCommand): Promise<{ newTurnId: string }> {
    const last = await this.messageRepo.findLastAssistant({
      tenantId: cmd.tenantId,
      sessionId: cmd.sessionId,
    })
    if (!last) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'no assistant turn to regenerate' })
    }
    const prior = await this.messageRepo.findPriorUser({
      tenantId: cmd.tenantId,
      messageId: last.id,
    })
    if (!prior) {
      throw new TRPCError({ code: 'CONFLICT', message: 'no prior user message found' })
    }

    await this.messageRepo.markSuperseded({ tenantId: cmd.tenantId, messageId: last.id })

    const result = await this.sendMessageHandler.execute(
      new SendMessageCommand(cmd.tenantId, cmd.sessionId, 'user', prior.content),
    )

    return { newTurnId: result.id }
  }
}
```

> **Implementation note:** if the project's session-message repository doesn't yet expose `findLastAssistant`, `findPriorUser`, `markSuperseded`, add them in this same task following the project's repo pattern. Add a `supersededAt` column to the message schema and re-squash if needed.

- [ ] **Step 5: Test + commit**

```bash
bun run --filter @future/api test:unit -- regenerate-last-turn
git add apps/api/src/modules/agents
git commit -m "feat(agents): RegenerateLastTurnHandler"
```

---

## Task 7: `feedback.router` + extend `session.router`

**Files:**

- Create: `apps/api/src/modules/agents/interface/trpc/feedback.router.ts`
- Modify: `apps/api/src/modules/agents/interface/trpc/session.router.ts`
- Modify: `apps/api/src/modules/agents/interface/trpc/agents.router.ts`
- Modify: `apps/api/src/modules/agents/agents.module.ts`

- [ ] **Step 1: Create `feedback.router.ts`**

```ts
import * as z from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import { SubmitFeedbackCommand } from '../../application/commands/submit-feedback.command'
import type { SubmitFeedbackHandler } from '../../application/commands/submit-feedback.handler'

let submitFeedbackHandler: SubmitFeedbackHandler | undefined
export function setSubmitFeedbackHandler(h: SubmitFeedbackHandler) {
  submitFeedbackHandler = h
}
function handler(): SubmitFeedbackHandler {
  if (!submitFeedbackHandler) throw new Error('submitFeedbackHandler not wired — boot failure')
  return submitFeedbackHandler
}

export const feedbackRouter = router({
  submit: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_CONVERSATION_WRITE })
    .input(
      z.object({
        messageId: z.string().uuid(),
        rating: z.enum(['up', 'down']),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenantId)
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
      if (!ctx.actorId)
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing actor context' })
      if (input.rating === 'up' && input.note?.trim()) {
        // Convention: notes only for thumbs-down. Reject silently rather than persist.
        // Ignore the note for thumbs-up.
      }
      await handler().execute(
        new SubmitFeedbackCommand(
          ctx.tenantId,
          input.messageId,
          ctx.actorId,
          input.rating,
          input.rating === 'down' ? input.note : undefined,
        ),
      )
    }),
})
```

- [ ] **Step 2: Extend `session.router.ts`**

Add a new procedure inside `sessionRouter`:

```ts
regenerateLastTurn: publicProcedure
  .meta({ permission: PERMISSIONS.AGENT_SESSION_SEND })
  .input(z.object({ sessionId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    if (!ctx.tenantId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
    if (!ctx.actorId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing actor context' })
    if (!regenerateLastTurnHandler)
      throw new Error('regenerateLastTurnHandler not wired — boot failure')
    return regenerateLastTurnHandler.execute(
      new RegenerateLastTurnCommand(ctx.tenantId, input.sessionId, ctx.actorId),
    )
  }),
```

Add the matching `let regenerateLastTurnHandler: RegenerateLastTurnHandler | undefined` and a `setAgentSessionHandlers` extension to register it.

- [ ] **Step 3: Mount in `agents.router.ts`**

```ts
import { feedbackRouter } from './feedback.router'
// ...
export const agentsRouter = router({
  // ... existing ...
  feedback: feedbackRouter,
})
```

- [ ] **Step 4: Wire DI in `agents.module.ts`**

Register `SubmitFeedbackHandler`, `RegenerateLastTurnHandler`, the new repo (`DrizzleMessageFeedbackRepository`), and bind them via `setSubmitFeedbackHandler` + the extended `setAgentSessionHandlers` in `onModuleInit`.

- [ ] **Step 5: Build + test + commit**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api test:unit
bun run --filter @future/api-client build
git add apps/api/src/modules/agents
git commit -m "feat(agents): feedback.submit + session.regenerateLastTurn routers"
```

---

## Task 8: `FeedbackNotePopover` component

**Files:**

- Create: `packages/agent/src/thread/footer/feedback-note-popover.tsx`
- Create: `packages/agent/src/thread/footer/feedback-note-popover.spec.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FeedbackNotePopover } from './feedback-note-popover'

describe('FeedbackNotePopover', () => {
  it('submits with empty note when user clicks Send', () => {
    const onSubmit = vi.fn()
    render(<FeedbackNotePopover onSubmit={onSubmit} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
    expect(onSubmit).toHaveBeenCalledWith(undefined)
  })

  it('submits with note text', () => {
    const onSubmit = vi.fn()
    render(<FeedbackNotePopover onSubmit={onSubmit} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'wrong shape' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
    expect(onSubmit).toHaveBeenCalledWith('wrong shape')
  })
})
```

- [ ] **Step 2: Implement**

```tsx
'use client'

import { useState } from 'react'
import { TinyBtn } from '../../primitives/tiny-btn'

export interface FeedbackNotePopoverProps {
  onSubmit: (note?: string) => void
  onCancel: () => void
}

export function FeedbackNotePopover({ onSubmit, onCancel }: FeedbackNotePopoverProps) {
  const [note, setNote] = useState('')
  return (
    <div className="flex flex-col gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] p-2">
      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        <span>Note</span>
        <textarea
          aria-label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="What was off?"
          className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-[12px] text-foreground"
        />
      </label>
      <div className="flex justify-end gap-1.5">
        <TinyBtn onClick={onCancel}>Cancel</TinyBtn>
        <TinyBtn active onClick={() => onSubmit(note.trim() || undefined)}>
          Send feedback
        </TinyBtn>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Test + commit**

```bash
bun run --filter @future/agent test:unit -- feedback-note-popover
git add packages/agent/src/thread/footer
git commit -m "feat(agent): FeedbackNotePopover"
```

---

## Task 9: `ActionFooter` component

**Files:**

- Create: `packages/agent/src/thread/footer/action-footer.tsx`
- Create: `packages/agent/src/thread/footer/action-footer.spec.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSubmit = vi.fn(() => Promise.resolve())
const mockRegen = vi.fn(() => Promise.resolve({ newTurnId: 'n1' }))

vi.mock('@future/api-client', () => ({
  trpc: {
    agents: {
      feedback: { submit: { useMutation: () => ({ mutateAsync: mockSubmit, isPending: false }) } },
      session: {
        regenerateLastTurn: {
          useMutation: () => ({ mutateAsync: mockRegen, isPending: false }),
        },
      },
    },
  },
}))

Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } })

import { ActionFooter } from './action-footer'

describe('ActionFooter', () => {
  beforeEach(() => {
    mockSubmit.mockClear()
    mockRegen.mockClear()
  })

  const baseProps = {
    messageId: 'm1',
    sessionId: 's1',
    text: 'Final answer',
    isLastAssistantTurn: true,
    onIterate: vi.fn(),
  }

  it('copy button writes to clipboard', async () => {
    render(<ActionFooter {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Final answer'))
  })

  it('thumbs-up submits immediately', async () => {
    render(<ActionFooter {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Thumbs up' }))
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith({ messageId: 'm1', rating: 'up' }))
  })

  it('thumbs-down opens popover', () => {
    render(<ActionFooter {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Thumbs down' }))
    expect(screen.getByLabelText('Note')).toBeTruthy()
  })

  it('thumbs-down with note submits with note + rating=down', async () => {
    render(<ActionFooter {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Thumbs down' }))
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        messageId: 'm1',
        rating: 'down',
        note: 'wrong',
      }),
    )
  })

  it('regenerate calls mutation with sessionId', async () => {
    render(<ActionFooter {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(mockRegen).toHaveBeenCalledWith({ sessionId: 's1' }))
  })

  it('regenerate disabled when not last assistant turn', () => {
    render(<ActionFooter {...baseProps} isLastAssistantTurn={false} />)
    expect(screen.getByRole('button', { name: 'Regenerate' }).hasAttribute('disabled')).toBe(true)
  })

  it('iterate calls onIterate prop', () => {
    const onIterate = vi.fn()
    render(<ActionFooter {...baseProps} onIterate={onIterate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Iterate' }))
    expect(onIterate).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Implement**

```tsx
'use client'

import { useState } from 'react'
import { Copy, RotateCw, ThumbsUp, ThumbsDown, Repeat, Check } from 'lucide-react'
import { trpc } from '@future/api-client'
import { TinyBtn } from '../../primitives/tiny-btn'
import { FeedbackNotePopover } from './feedback-note-popover'

export interface ActionFooterProps {
  messageId: string
  sessionId: string
  text: string
  isLastAssistantTurn: boolean
  onIterate: () => void
}

export function ActionFooter({
  messageId,
  sessionId,
  text,
  isLastAssistantTurn,
  onIterate,
}: ActionFooterProps) {
  const [copied, setCopied] = useState(false)
  const [thumb, setThumb] = useState<'up' | 'down' | null>(null)
  const [showNote, setShowNote] = useState(false)

  const submit = trpc.agents.feedback.submit.useMutation()
  const regenerate = trpc.agents.session.regenerateLastTurn.useMutation()

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const handleThumbsUp = async () => {
    setThumb('up')
    await submit.mutateAsync({ messageId, rating: 'up' })
  }

  const handleThumbsDownConfirm = async (note?: string) => {
    setThumb('down')
    setShowNote(false)
    await submit.mutateAsync({ messageId, rating: 'down', ...(note ? { note } : {}) })
  }

  if (showNote) {
    return (
      <FeedbackNotePopover onCancel={() => setShowNote(false)} onSubmit={handleThumbsDownConfirm} />
    )
  }

  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <TinyBtn aria-label="Copy" onClick={handleCopy}>
        {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
        Copy
      </TinyBtn>
      <TinyBtn
        aria-label="Regenerate"
        disabled={!isLastAssistantTurn || regenerate.isPending}
        onClick={() => regenerate.mutateAsync({ sessionId })}
      >
        <RotateCw className="h-2.5 w-2.5" />
        Regenerate
      </TinyBtn>
      <TinyBtn aria-label="Thumbs up" active={thumb === 'up'} onClick={handleThumbsUp}>
        <ThumbsUp className="h-2.5 w-2.5" />
      </TinyBtn>
      <TinyBtn aria-label="Thumbs down" active={thumb === 'down'} onClick={() => setShowNote(true)}>
        <ThumbsDown className="h-2.5 w-2.5" />
      </TinyBtn>
      <div className="flex-1" />
      <TinyBtn aria-label="Iterate" onClick={onIterate}>
        <Repeat className="h-2.5 w-2.5" />
        Iterate
      </TinyBtn>
    </div>
  )
}
```

- [ ] **Step 3: Test + commit**

```bash
bun run --filter @future/agent test:unit -- action-footer
git add packages/agent/src/thread/footer
git commit -m "feat(agent): ActionFooter (copy / regen / thumbs / iterate)"
```

---

## Task 10: Wire `ActionFooter` into `AgentThread` assistant message

**Files:**

- Modify: `packages/agent/src/thread/agent-thread.tsx`

- [ ] **Step 1: Update `AgentAssistantMessage`**

The existing `AgentAssistantMessage` (Plan 2) renders `MessagePrimitive.Content`. Add the footer at the bottom, gated on completion:

```tsx
import { ActionFooter } from './footer/action-footer'
import { useThread, useMessage } from '@assistant-ui/react'

function AgentAssistantMessage() {
  const { messages, threadId } = useThread() // adapt to actual API
  const message = useMessage() // current message in render slot
  const isLast = messages[messages.length - 1]?.id === message.id

  return (
    <MessagePrimitive.Root className="flex flex-col gap-2 px-3 py-1">
      <MessagePrimitive.Content
        components={{
          Text: ({ part }) => <AnswerBubble>{part.text}</AnswerBubble>,
        }}
      />
      <MessagePrimitive.If completed>
        <ActionFooter
          messageId={message.id}
          sessionId={threadId} // or wherever sessionId lives — adapt
          text={extractText(message)}
          isLastAssistantTurn={isLast && message.role === 'assistant'}
          onIterate={() => {
            /* Plan 6 wires iteration metadata */
          }}
        />
      </MessagePrimitive.If>
    </MessagePrimitive.Root>
  )
}

function extractText(message: { content: Array<{ type: string; text?: string }> }): string {
  return message.content
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text!)
    .join('')
}
```

> **Implementation note:** assistant-ui's hook names (`useThread`, `useMessage`, `MessagePrimitive.If completed`) vary across versions. Look up the installed version's API and adapt — the semantic is: render footer only when message is `completed` (not `streaming`/`requires-action`), and know whether this is the last assistant turn so `Regenerate` can be disabled otherwise.

- [ ] **Step 2: Build + test + commit**

```bash
bun run --filter @future/agent test:unit
bun run --filter @future/agent build
git add packages/agent/src/thread/agent-thread.tsx
git commit -m "feat(agent): mount ActionFooter under completed assistant turns"
```

---

## Task 11: Export ActionFooter and PR

**Files:**

- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Export**

```ts
export { ActionFooter } from './thread/footer/action-footer'
export type { ActionFooterProps } from './thread/footer/action-footer'
export { FeedbackNotePopover } from './thread/footer/feedback-note-popover'
```

- [ ] **Step 2: PR**

```bash
git push -u origin feat/agent-ux-plan-5-action-footer
gh pr create --title "feat(agent): UX refactor plan 5 — ActionFooter (feedback + regenerate)" --body "$(cat <<'EOF'
## Summary

- New `agents.feedback.submit` mutation backed by `agent_message_feedback` table (idempotent upsert per actor)
- New `agents.session.regenerateLastTurn` mutation — supersedes last assistant turn, re-runs from prior user message
- New `AGENT_CONVERSATION_WRITE` permission (granted alongside `AGENT_CONVERSATION_READ`)
- `ActionFooter` component: Copy (clipboard) / Regenerate (mutation) / Thumbs up (submit) / Thumbs down (popover + note) / Iterate (callback)
- Mounted under `MessagePrimitive.If completed` in assistant message slot

Plan 5 of 6. Spec §8.

## Test plan

- [ ] CI green
- [ ] Manual: complete a turn, click Copy → text in clipboard
- [ ] Manual: thumbs up → row in `agent_message_feedback` with rating='up'
- [ ] Manual: thumbs down + note → row with rating='down', note populated
- [ ] Manual: regenerate → previous turn marked superseded, new turn streams
- [ ] Manual: regenerate disabled on non-last turn

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

- [ ] `0000_initial.sql` re-squashed with the new table (and `superseded_at` column on session message if added)
- [ ] `AGENT_CONVERSATION_WRITE` granted in seeds for every authenticated role
- [ ] Feedback upsert idempotency tested (same actor twice → final row reflects last)
- [ ] Regenerate disabled prop wires through to button `disabled` attr
- [ ] No notes persisted for thumbs-up (router strips them)

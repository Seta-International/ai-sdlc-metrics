# Agent UX Refactor — Plan 3: DraftCard + approval

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `draft.proposed` SSE events as an inline `DraftCard` in the panel, with permission-gated approve/reject buttons and a rejection note. The card fetches the full draft row via a new `agents.drafts.getById` query because the SSE payload (`{ action_id, summary, tier, requires_approval, provenance }`) lacks `args`/`taintAtDraftTime`.

**Architecture:** Backend extensions (new query, optional `note` on reject, new `executionOutcomeNote` column). Frontend card lives in `packages/agent/src/thread/cards/`. The pre-existing `packages/ui/src/components/agent-draft-card.tsx` is for Plan 08's standalone approval inbox — **delete** it (no backward compat per CLAUDE.md) and replace with a panel-embedded card.

**Tech Stack:** NestJS · tRPC · Drizzle · React 19 · `@assistant-ui/react` · Vitest.

**Spec:** `docs/superpowers/specs/2026-04-30-agent-module-ux-refactor-design.md` §6

**Depends on:** Plan 1 (`Tag`, `Mono`, `TinyBtn`), Plan 2 (`DRAFT_TOOL` constant + `isDraftArgs` guard).

---

## Task 1: Pre-flight + branch

- [ ] **Step 1: Verify Plans 1+2 landed**

```bash
git checkout main && git pull
test -f packages/agent/src/runtime/agent-message-parts.ts || (echo "Plan 2 not landed" && exit 1)
bun run --filter @future/agent test:unit
bun run --filter @future/api test:unit
```

- [ ] **Step 2: Branch**

```bash
git checkout -b feat/agent-ux-plan-3-draft-card
```

---

## Task 2: Add `executionOutcomeNote` column to `agent_draft`

**Files:**

- Modify: `apps/api/src/modules/agents/infrastructure/schema/agent-draft.schema.ts`

- [ ] **Step 1: Add the column**

Locate the column definitions block in `agent-draft.schema.ts` (just after `executionOutcome`). Add:

```ts
/** Free-text rejection note (≤500 chars). Independent of the enum reason. */
executionOutcomeNote: text('execution_outcome_note'),
```

- [ ] **Step 2: Re-squash `0000_initial.sql`**

Per CLAUDE.md dev-phase rule:

```bash
cd packages/db
rm -rf drizzle/migrations/*.sql drizzle/migrations/meta
cd ../..
bun run db:generate --name initial
```

Verify the new column appears:

```bash
grep -n execution_outcome_note packages/db/drizzle/migrations/0000_initial.sql
```

Expected: one match.

- [ ] **Step 3: Reset and reapply DB**

```bash
bun run db:down -v
bun run db:up
bun run db:migrate
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/agents/infrastructure/schema/agent-draft.schema.ts packages/db/drizzle/migrations/
git commit -m "feat(agents): add execution_outcome_note column to agent_draft"
```

---

## Task 3: Extend `rejectDraft` to accept and persist `note`

**Files:**

- Modify: `apps/api/src/modules/agents/application/services/draft-approval.service.ts`
- Modify: `apps/api/src/modules/agents/application/services/draft-approval.service.spec.ts` (or its test sibling)
- Modify: `apps/api/src/modules/agents/domain/repositories/draft.repository.ts`
- Modify: `apps/api/src/modules/agents/infrastructure/drizzle-draft.repository.ts`

- [ ] **Step 1: Locate the existing test for `rejectDraft`**

```bash
rg -l 'rejectDraft' apps/api/src/modules/agents
```

- [ ] **Step 2: Write a failing test**

In whatever spec covers `rejectDraft`, add:

```ts
it('persists the optional note when provided', async () => {
  // Setup: create a pending draft with id 'd1'.
  // ... existing setup ...
  await service.rejectDraft({
    tenantId: 't1',
    draftId: 'd1',
    rejecterId: 'u1',
    reason: 'wrong_value',
    note: 'should target Q2 not Q1',
  })
  const updated = await draftRepo.getById({ tenantId: 't1', draftId: 'd1' })
  expect(updated?.executionOutcomeNote).toBe('should target Q2 not Q1')
})

it('omits the note column when not provided', async () => {
  // ... setup ...
  await service.rejectDraft({
    tenantId: 't1',
    draftId: 'd1',
    rejecterId: 'u1',
    reason: 'not_needed',
  })
  const updated = await draftRepo.getById({ tenantId: 't1', draftId: 'd1' })
  expect(updated?.executionOutcomeNote).toBeNull()
})
```

- [ ] **Step 3: Run the failing test**

```bash
bun run --filter @future/api test:unit -- draft-approval
```

Expected: 2 failures.

- [ ] **Step 4: Update the repository interface**

Modify `apps/api/src/modules/agents/domain/repositories/draft.repository.ts` — find `updateStatus` and add `note` to the `extra` object's typing, OR add a dedicated method. Cleaner to extend `extra`:

```ts
updateStatus(input: {
  tenantId: string
  draftId: string
  status: 'approved' | 'rejected' | 'expired' | 'executed' | 'execution_failed' | 'cancelled'
  extra?: { executionOutcome?: string; executionOutcomeNote?: string | null }
}): Promise<void>
```

- [ ] **Step 5: Update the Drizzle repo implementation**

In `apps/api/src/modules/agents/infrastructure/drizzle-draft.repository.ts`, locate `updateStatus`. Map `extra.executionOutcomeNote` to the new column:

```ts
async updateStatus(input) {
  const set: Record<string, unknown> = { status: input.status }
  if (input.extra?.executionOutcome !== undefined) {
    set.executionOutcome = input.extra.executionOutcome
  }
  if (input.extra?.executionOutcomeNote !== undefined) {
    set.executionOutcomeNote = input.extra.executionOutcomeNote
  }
  await this.db.update(agentDraft).set(set).where(/* ...existing where clause... */)
}
```

- [ ] **Step 6: Update `DraftApprovalService.rejectDraft`**

In `apps/api/src/modules/agents/application/services/draft-approval.service.ts`, change the signature and forward the note:

```ts
async rejectDraft(opts: {
  tenantId: string
  draftId: string
  rejecterId: string
  reason: string
  note?: string
}): Promise<void> {
  // ... existing pre-checks (NOT_FOUND, status != 'pending') unchanged ...

  await this.draftRepo.updateStatus({
    tenantId: opts.tenantId,
    draftId: opts.draftId,
    status: 'rejected',
    extra: {
      executionOutcome: opts.reason,
      executionOutcomeNote: opts.note ?? null,
    },
  })

  await this.kernelAuditFacade.recordEvent({
    // ... existing fields ...
    payload: {
      // ... existing payload fields ...
      reason: opts.reason,
      note: opts.note ?? null,
      // ... rest unchanged ...
    },
  })

  await this.notificationsWriteFacade.sendDraftApprovalNotification({
    // ... existing fields ...
    summary: opts.note
      ? `Draft rejected: ${opts.reason} — ${opts.note}`
      : `Draft rejected: ${opts.reason}`,
    // ... rest unchanged ...
  })
}
```

- [ ] **Step 7: Run tests — verify pass**

```bash
bun run --filter @future/api test:unit -- draft-approval
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/agents
git commit -m "feat(agents): rejectDraft accepts and persists optional note"
```

---

## Task 4: Extend `agents.draftApproval.reject` tRPC input

**Files:**

- Modify: `apps/api/src/modules/agents/interface/trpc/draft-approval.router.ts`

- [ ] **Step 1: Update the input schema**

In `draft-approval.router.ts`, the `reject` procedure currently takes `{ draftId, reason }`. Extend:

```ts
reject: publicProcedure
  .meta({ permission: PERMISSIONS.AGENT_DRAFT_REJECT })
  .input(
    z.object({
      draftId: z.string().uuid(),
      reason: z.enum(['not_needed', 'wrong_entity', 'wrong_value', 'other_with_note']),
      note: z.string().max(500).optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    if (!ctx.tenantId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
    if (!ctx.actorId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing actor context' })

    if (input.reason === 'other_with_note' && !input.note?.trim()) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'note is required when reason is other_with_note',
      })
    }

    await service().rejectDraft({
      tenantId: ctx.tenantId,
      draftId: input.draftId,
      rejecterId: ctx.actorId,
      reason: input.reason,
      note: input.note,
    })
  }),
```

- [ ] **Step 2: Add a router test**

In the existing draft-approval router spec, add:

```ts
it('rejects without note when reason is not other_with_note', async () => {
  await caller().agents.draftApproval.reject({
    draftId: 'd1',
    reason: 'not_needed',
  })
  expect(rejectDraft).toHaveBeenCalledWith(expect.objectContaining({ note: undefined }))
})

it('errors when other_with_note has no note', async () => {
  await expect(
    caller().agents.draftApproval.reject({
      draftId: 'd1',
      reason: 'other_with_note',
    }),
  ).rejects.toThrow(/note is required/)
})

it('persists note when other_with_note has a note', async () => {
  await caller().agents.draftApproval.reject({
    draftId: 'd1',
    reason: 'other_with_note',
    note: 'see ticket FUT-123',
  })
  expect(rejectDraft).toHaveBeenCalledWith(expect.objectContaining({ note: 'see ticket FUT-123' }))
})
```

- [ ] **Step 3: Run tests**

```bash
bun run --filter @future/api test:unit -- draft-approval.router
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/agents/interface/trpc/draft-approval.router.ts apps/api/src/modules/agents/interface/trpc/draft-approval.router.spec.ts
git commit -m "feat(agents): draftApproval.reject accepts optional note"
```

---

## Task 5: Add `agents.drafts.getById` query

**Files:**

- Modify: `apps/api/src/modules/agents/domain/repositories/draft.repository.ts`
- Modify: `apps/api/src/modules/agents/infrastructure/drizzle-draft.repository.ts`
- Modify: `apps/api/src/modules/agents/interface/trpc/draft-audit.router.ts`

- [ ] **Step 1: Add a method to the repository interface**

In `draft.repository.ts`, locate the existing `getById` (it returns minimal fields). Add a richer method or extend the return shape. Add:

```ts
getDetailById(input: {
  tenantId: string
  draftId: string
}): Promise<DraftDetail | null>

export interface DraftDetail {
  id: string
  traceId: string
  flowId: string
  toolName: string
  args: Record<string, unknown>
  tier: 'low_risk_auto' | 'high_risk_approval_required'
  status: string
  taintAtDraftTime: boolean
  draftedAt: Date
  expiresAt: Date
  approvedAt: Date | null
  executedAt: Date | null
  executionOutcome: string | null
  executionOutcomeNote: string | null
  approverUserId: string | null
  initiatorUserId: string
  provenance: Record<string, unknown>
}
```

- [ ] **Step 2: Implement in the Drizzle repo**

In `drizzle-draft.repository.ts`:

```ts
async getDetailById(input: { tenantId: string; draftId: string }): Promise<DraftDetail | null> {
  const rows = await this.db
    .select()
    .from(agentDraft)
    .where(and(eq(agentDraft.tenantId, input.tenantId), eq(agentDraft.id, input.draftId)))
    .limit(1)
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    traceId: r.traceId,
    flowId: r.flowId,
    toolName: r.toolName,
    args: (r.args ?? {}) as Record<string, unknown>,
    tier: r.tier as 'low_risk_auto' | 'high_risk_approval_required',
    status: r.status,
    taintAtDraftTime: r.taintAtDraftTime,
    draftedAt: r.draftedAt,
    expiresAt: r.expiresAt,
    approvedAt: r.approvedAt,
    executedAt: r.executedAt,
    executionOutcome: r.executionOutcome,
    executionOutcomeNote: r.executionOutcomeNote,
    approverUserId: r.approverUserId,
    initiatorUserId: r.initiatorUserId,
    provenance: (r.provenance ?? {}) as Record<string, unknown>,
  }
}
```

- [ ] **Step 3: Expose via tRPC**

In `draft-audit.router.ts`, append a `getById` procedure:

```ts
getById: publicProcedure
  .meta({ permission: PERMISSIONS.AGENT_DRAFT_AUDIT_READ })
  .input(z.object({ draftId: z.string().uuid() }))
  .query(async ({ input, ctx }) => {
    if (!ctx.tenantId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
    return repo().getDetailById({ tenantId: ctx.tenantId, draftId: input.draftId })
  }),
```

- [ ] **Step 4: Tests**

Add a router test that calls `getById` and asserts the row is returned with all fields:

```ts
it('getById returns full draft detail', async () => {
  // seed a draft via repo.create or direct DB
  const result = await caller().agents.drafts.getById({ draftId: 'd1' })
  expect(result?.toolName).toBeDefined()
  expect(result?.args).toBeDefined()
  expect(result?.taintAtDraftTime).toBeDefined()
})

it('getById returns null when missing', async () => {
  const result = await caller().agents.drafts.getById({
    draftId: '00000000-0000-0000-0000-000000000000',
  })
  expect(result).toBeNull()
})
```

```bash
bun run --filter @future/api test:unit -- draft-audit
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agents
git commit -m "feat(agents): add agents.drafts.getById with full row detail"
```

---

## Task 6: `useCanApproveDrafts` hook

**Files:**

- Create: `packages/agent/src/hooks/use-can-approve-drafts.ts`
- Create: `packages/agent/src/hooks/use-can-approve-drafts.spec.tsx`

- [ ] **Step 1: Find the permissions client**

```bash
rg -l 'PermissionContext|usePermissions|useHasPermission' apps/ packages/ | head
```

Note the import path (likely `@future/permissions` or `@future/api-client`). Use the conventional name.

- [ ] **Step 2: Write failing test**

Create `packages/agent/src/hooks/use-can-approve-drafts.spec.tsx`:

```tsx
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@future/permissions', () => ({
  useHasPermission: vi.fn(),
}))

import { useHasPermission } from '@future/permissions'
import { useCanApproveDrafts } from './use-can-approve-drafts'

describe('useCanApproveDrafts', () => {
  it('returns true when AGENT_DRAFT_APPROVE is granted', () => {
    ;(useHasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const { result } = renderHook(() => useCanApproveDrafts())
    expect(result.current).toBe(true)
  })

  it('returns false when AGENT_DRAFT_APPROVE is denied', () => {
    ;(useHasPermission as ReturnType<typeof vi.fn>).mockReturnValue(false)
    const { result } = renderHook(() => useCanApproveDrafts())
    expect(result.current).toBe(false)
  })

  it('queries the AGENT_DRAFT_APPROVE permission key', () => {
    ;(useHasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true)
    renderHook(() => useCanApproveDrafts())
    expect(useHasPermission).toHaveBeenCalledWith('AGENT_DRAFT_APPROVE')
  })
})
```

- [ ] **Step 3: Implement**

Create `packages/agent/src/hooks/use-can-approve-drafts.ts`:

```ts
import { useHasPermission } from '@future/permissions'

export function useCanApproveDrafts(): boolean {
  return useHasPermission('AGENT_DRAFT_APPROVE')
}
```

> **Implementation note:** if the actual permission helper is named differently in this repo (e.g. `usePermission('AGENT_DRAFT_APPROVE')`), substitute. The semantic is "true iff the current actor can approve drafts."

- [ ] **Step 4: Run tests**

```bash
bun run --filter @future/agent test:unit -- use-can-approve-drafts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/hooks/use-can-approve-drafts.ts packages/agent/src/hooks/use-can-approve-drafts.spec.tsx
git commit -m "feat(agent): useCanApproveDrafts hook"
```

---

## Task 7: `useDraftRow` query hook

**Files:**

- Create: `packages/agent/src/hooks/use-draft-row.ts`

- [ ] **Step 1: Implement (no dedicated test — covered by DraftCard integration test)**

```ts
import { trpc } from '@future/api-client'

export function useDraftRow(draftId: string | null) {
  return trpc.agents.drafts.getById.useQuery(
    { draftId: draftId ?? '' },
    { enabled: !!draftId, staleTime: 30_000 },
  )
}
```

> **Implementation note:** if `trpc.agents.drafts` doesn't yet exist on the client (because the API client builds from the router introspection), regenerate the client (`bun run --filter @future/api-client build`) after Task 5 lands.

- [ ] **Step 2: Build & commit**

```bash
bun run --filter @future/api-client build
bun run --filter @future/agent build
git add packages/agent/src/hooks/use-draft-row.ts
git commit -m "feat(agent): useDraftRow query hook"
```

---

## Task 8: `RejectReasonPicker` component

**Files:**

- Create: `packages/agent/src/thread/cards/reject-reason-picker.tsx`
- Create: `packages/agent/src/thread/cards/reject-reason-picker.spec.tsx`

- [ ] **Step 1: Failing tests**

Create `packages/agent/src/thread/cards/reject-reason-picker.spec.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RejectReasonPicker } from './reject-reason-picker'

describe('RejectReasonPicker', () => {
  it('lists all four enum reasons', () => {
    render(<RejectReasonPicker onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByLabelText('not needed')).toBeTruthy()
    expect(screen.getByLabelText('wrong entity')).toBeTruthy()
    expect(screen.getByLabelText('wrong value')).toBeTruthy()
    expect(screen.getByLabelText('other (with note)')).toBeTruthy()
  })

  it('calls onConfirm with the selected enum reason and no note', () => {
    const onConfirm = vi.fn()
    render(<RejectReasonPicker onConfirm={onConfirm} onCancel={() => {}} />)
    fireEvent.click(screen.getByLabelText('wrong value'))
    fireEvent.click(screen.getByRole('button', { name: 'Reject draft' }))
    expect(onConfirm).toHaveBeenCalledWith({ reason: 'wrong_value' })
  })

  it('shows note textarea when other_with_note is selected', () => {
    render(<RejectReasonPicker onConfirm={() => {}} onCancel={() => {}} />)
    fireEvent.click(screen.getByLabelText('other (with note)'))
    expect(screen.getByLabelText('Note')).toBeTruthy()
  })

  it('disables Reject button when other_with_note is selected and note is empty', () => {
    render(<RejectReasonPicker onConfirm={() => {}} onCancel={() => {}} />)
    fireEvent.click(screen.getByLabelText('other (with note)'))
    expect(screen.getByRole('button', { name: 'Reject draft' }).hasAttribute('disabled')).toBe(true)
  })

  it('confirms with note when other_with_note + note text', () => {
    const onConfirm = vi.fn()
    render(<RejectReasonPicker onConfirm={onConfirm} onCancel={() => {}} />)
    fireEvent.click(screen.getByLabelText('other (with note)'))
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'see FUT-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject draft' }))
    expect(onConfirm).toHaveBeenCalledWith({ reason: 'other_with_note', note: 'see FUT-1' })
  })

  it('Cancel calls onCancel', () => {
    const onCancel = vi.fn()
    render(<RejectReasonPicker onConfirm={() => {}} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Implement**

Create `packages/agent/src/thread/cards/reject-reason-picker.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { TinyBtn } from '../../primitives/tiny-btn'

export type RejectReason = 'not_needed' | 'wrong_entity' | 'wrong_value' | 'other_with_note'

const REASON_OPTIONS: Array<{ value: RejectReason; label: string }> = [
  { value: 'not_needed', label: 'not needed' },
  { value: 'wrong_entity', label: 'wrong entity' },
  { value: 'wrong_value', label: 'wrong value' },
  { value: 'other_with_note', label: 'other (with note)' },
]

export interface RejectReasonPickerProps {
  onConfirm: (input: { reason: RejectReason; note?: string }) => void
  onCancel: () => void
}

export function RejectReasonPicker({ onConfirm, onCancel }: RejectReasonPickerProps) {
  const [reason, setReason] = useState<RejectReason>('not_needed')
  const [note, setNote] = useState('')

  const isNoteRequired = reason === 'other_with_note'
  const canSubmit = !isNoteRequired || note.trim().length > 0

  return (
    <div className="flex flex-col gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] p-2">
      <div className="text-[11px] font-semibold text-foreground">Reject draft</div>
      <fieldset className="flex flex-col gap-1">
        {REASON_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-[12px] text-foreground/90">
            <input
              type="radio"
              name="reject-reason"
              value={opt.value}
              checked={reason === opt.value}
              onChange={() => setReason(opt.value)}
              aria-label={opt.label}
            />
            {opt.label}
          </label>
        ))}
      </fieldset>
      {isNoteRequired && (
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground/80">
          <span>Note</span>
          <textarea
            aria-label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-[12px] text-foreground"
          />
        </label>
      )}
      <div className="flex justify-end gap-1.5">
        <TinyBtn onClick={onCancel}>Cancel</TinyBtn>
        <TinyBtn
          danger
          disabled={!canSubmit}
          onClick={() => onConfirm({ reason, note: isNoteRequired ? note : undefined })}
        >
          Reject draft
        </TinyBtn>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run tests + commit**

```bash
bun run --filter @future/agent test:unit -- reject-reason-picker
git add packages/agent/src/thread/cards/reject-reason-picker.tsx packages/agent/src/thread/cards/reject-reason-picker.spec.tsx
git commit -m "feat(agent): RejectReasonPicker"
```

---

## Task 9: `DraftCard` component

**Files:**

- Create: `packages/agent/src/thread/cards/draft-card.tsx`
- Create: `packages/agent/src/thread/cards/draft-card.spec.tsx`

- [ ] **Step 1: Failing test**

Create `packages/agent/src/thread/cards/draft-card.spec.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApprove = vi.fn(() => Promise.resolve())
const mockReject = vi.fn(() => Promise.resolve())
const mockUseQuery = vi.fn()
const mockUseCanApprove = vi.fn(() => true)

vi.mock('@future/api-client', () => ({
  trpc: {
    agents: {
      drafts: { getById: { useQuery: (...a: unknown[]) => mockUseQuery(...a) } },
      draftApproval: {
        approve: { useMutation: () => ({ mutateAsync: mockApprove, isPending: false }) },
        reject: { useMutation: () => ({ mutateAsync: mockReject, isPending: false }) },
      },
    },
  },
}))

vi.mock('../../hooks/use-can-approve-drafts', () => ({
  useCanApproveDrafts: () => mockUseCanApprove(),
}))

import { DraftCard } from './draft-card'
import type { DraftPartArgs } from '../../runtime/agent-message-parts'

const baseArgs: DraftPartArgs = {
  actionId: 'a1',
  summary: 'Approve Jane Doe leave',
  tier: 'high_risk_approval_required',
  requiresApproval: true,
  provenance: { sub_agent_domain: 'people', trace_id: 't1' },
}

const defaultRow = {
  id: 'a1',
  toolName: 'people.approve_leave',
  tier: 'high_risk_approval_required',
  status: 'pending',
  args: { person_id: 'p1', dates: '2026-04-15..2026-04-19' },
  taintAtDraftTime: false,
  executionOutcome: null,
  executionOutcomeNote: null,
  approvedAt: null,
}

describe('DraftCard', () => {
  beforeEach(() => {
    mockApprove.mockClear()
    mockReject.mockClear()
    mockUseQuery.mockReset()
    mockUseCanApprove.mockReturnValue(true)
  })

  it('shows summary + tool name + tier', () => {
    mockUseQuery.mockReturnValue({ data: defaultRow, isLoading: false })
    render(<DraftCard {...baseArgs} />)
    expect(screen.getByText(/Approve Jane Doe leave/)).toBeTruthy()
    expect(screen.getByText('people.approve_leave')).toBeTruthy()
  })

  it('shows approve + reject buttons when actor has permission', () => {
    mockUseQuery.mockReturnValue({ data: defaultRow, isLoading: false })
    render(<DraftCard {...baseArgs} />)
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reject/ })).toBeTruthy()
  })

  it('shows "Sent for approval" pill when actor lacks permission', () => {
    mockUseCanApprove.mockReturnValue(false)
    mockUseQuery.mockReturnValue({ data: defaultRow, isLoading: false })
    render(<DraftCard {...baseArgs} />)
    expect(screen.getByText(/Sent for approval/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('hides buttons when status is approved', () => {
    mockUseQuery.mockReturnValue({
      data: { ...defaultRow, status: 'approved', approvedAt: new Date('2026-04-29') },
      isLoading: false,
    })
    render(<DraftCard {...baseArgs} />)
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.getByText(/approved/i)).toBeTruthy()
  })

  it('renders tainted warning when taintAtDraftTime', () => {
    mockUseQuery.mockReturnValue({
      data: { ...defaultRow, taintAtDraftTime: true },
      isLoading: false,
    })
    render(<DraftCard {...baseArgs} />)
    expect(screen.getByText(/tainted at draft time/i)).toBeTruthy()
  })

  it('approve calls approve mutation with draftId', async () => {
    mockUseQuery.mockReturnValue({ data: defaultRow, isLoading: false })
    render(<DraftCard {...baseArgs} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith({ draftId: 'a1' }))
  })

  it('reject opens picker; selecting reason calls reject mutation', async () => {
    mockUseQuery.mockReturnValue({ data: defaultRow, isLoading: false })
    render(<DraftCard {...baseArgs} />)
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }))
    fireEvent.click(screen.getByLabelText('not needed'))
    fireEvent.click(screen.getByRole('button', { name: 'Reject draft' }))
    await waitFor(() =>
      expect(mockReject).toHaveBeenCalledWith({ draftId: 'a1', reason: 'not_needed' }),
    )
  })

  it('reject other_with_note + note sends note to mutation', async () => {
    mockUseQuery.mockReturnValue({ data: defaultRow, isLoading: false })
    render(<DraftCard {...baseArgs} />)
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }))
    fireEvent.click(screen.getByLabelText('other (with note)'))
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'see ticket' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject draft' }))
    await waitFor(() =>
      expect(mockReject).toHaveBeenCalledWith({
        draftId: 'a1',
        reason: 'other_with_note',
        note: 'see ticket',
      }),
    )
  })
})
```

- [ ] **Step 2: Implement**

Create `packages/agent/src/thread/cards/draft-card.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { trpc } from '@future/api-client'
import { Tag } from '../../primitives/tag'
import { Mono } from '../../primitives/mono'
import { TinyBtn } from '../../primitives/tiny-btn'
import { useCanApproveDrafts } from '../../hooks/use-can-approve-drafts'
import { RejectReasonPicker } from './reject-reason-picker'
import type { DraftPartArgs } from '../../runtime/agent-message-parts'

type Status =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'execution_failed'
  | 'cancelled'

const STATUS_VARIANT: Record<Status, 'warning' | 'success' | 'danger' | 'default'> = {
  pending: 'warning',
  approved: 'success',
  executed: 'success',
  rejected: 'danger',
  execution_failed: 'danger',
  expired: 'default',
  cancelled: 'default',
}

export type DraftCardProps = DraftPartArgs

export function DraftCard({ actionId, summary, tier, provenance }: DraftCardProps) {
  const { data: row, isLoading } = trpc.agents.drafts.getById.useQuery(
    { draftId: actionId },
    { staleTime: 30_000 },
  )
  const canApprove = useCanApproveDrafts()
  const [pickingReject, setPickingReject] = useState(false)

  const approveM = trpc.agents.draftApproval.approve.useMutation()
  const rejectM = trpc.agents.draftApproval.reject.useMutation()

  const status = (row?.status ?? 'pending') as Status
  const isResolved = status !== 'pending'

  return (
    <div className="overflow-hidden rounded-md border border-amber-400/25 bg-gradient-to-b from-amber-400/[0.04] to-amber-400/[0.01]">
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-2 py-1.5">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.13)]"
          aria-hidden
        />
        <span className="text-[11px] font-semibold text-foreground">Draft · awaiting you</span>
        <Tag variant={STATUS_VARIANT[status]}>{status}</Tag>
        <div className="flex-1" />
        <Mono>
          {provenance.sub_agent_domain}
          {row?.toolName ? `.${row.toolName.split('.').slice(-1)[0]}` : ''}
        </Mono>
      </div>
      <div className="flex flex-col gap-2 px-2 py-2">
        <div className="text-[13px] leading-snug text-foreground">{summary}</div>
        {isLoading && <div className="text-[11px] text-muted-foreground">Loading details…</div>}
        {row && (
          <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-0.5 text-[11px]">
            <Mono>tool</Mono>
            <Mono className="text-foreground">{row.toolName}</Mono>
            <Mono>tier</Mono>
            <Mono className="text-foreground">{tier}</Mono>
            <Mono>args</Mono>
            <pre className="m-0 rounded-sm bg-black/30 p-1 font-mono text-[10.5px] text-foreground/80 whitespace-pre-wrap">
              {JSON.stringify(row.args, null, 2)}
            </pre>
          </div>
        )}
        {row?.taintAtDraftTime && (
          <div className="flex items-start gap-1.5 rounded-sm border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1 text-[11px] text-amber-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
            tainted at draft time
          </div>
        )}
        {row?.executionOutcomeNote && status === 'rejected' && (
          <div className="text-[11px] text-muted-foreground/80">
            <span className="font-mono">note:</span> {row.executionOutcomeNote}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-1.5 border-t border-white/[0.06] px-2 py-1.5">
        {isResolved ? null : !canApprove ? (
          <Tag>Sent for approval</Tag>
        ) : pickingReject ? (
          <RejectReasonPicker
            onCancel={() => setPickingReject(false)}
            onConfirm={async ({ reason, note }) => {
              await rejectM.mutateAsync({ draftId: actionId, reason, ...(note ? { note } : {}) })
              setPickingReject(false)
            }}
          />
        ) : (
          <>
            <TinyBtn danger onClick={() => setPickingReject(true)}>
              Reject ▾
            </TinyBtn>
            <TinyBtn
              active
              disabled={approveM.isPending}
              onClick={() => approveM.mutateAsync({ draftId: actionId })}
            >
              {approveM.isPending ? 'Approving…' : 'Approve'}
            </TinyBtn>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run tests + commit**

```bash
bun run --filter @future/agent test:unit -- draft-card
git add packages/agent/src/thread/cards/draft-card.tsx packages/agent/src/thread/cards/draft-card.spec.tsx
git commit -m "feat(agent): DraftCard with permission-gated approve/reject"
```

---

## Task 10: Wire `DRAFT_TOOL` registration into `AgentThread`

**Files:**

- Modify: `packages/agent/src/thread/agent-thread.tsx`

- [ ] **Step 1: Register the draft tool UI**

Inside `AgentThread`, add another `useAssistantToolUI` (alongside the plan + iteration registrations from Plan 2):

```ts
import { DRAFT_TOOL, isDraftArgs } from '../runtime/agent-message-parts'
import { DraftCard } from './cards/draft-card'

// inside AgentThread:
useAssistantToolUI({
  toolName: DRAFT_TOOL,
  render: ({ args }) => {
    if (!isDraftArgs(args)) return null
    return <DraftCard {...args} />
  },
})
```

- [ ] **Step 2: Build & test**

```bash
bun run --filter @future/agent build
bun run --filter @future/agent test:unit
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/thread/agent-thread.tsx
git commit -m "feat(agent): register DraftCard for agent.draft tool UI"
```

---

## Task 11: Delete the obsolete `agent-draft-card` from `@future/ui`

The pre-existing `packages/ui/src/components/agent-draft-card.tsx` was for Plan 08's standalone approval inbox. The new panel-embedded `DraftCard` supersedes it. Per CLAUDE.md "no backward compat".

- [ ] **Step 1: Find consumers**

```bash
rg -l 'AgentDraftCard|agent-draft-card' apps/ packages/
```

- [ ] **Step 2: Delete the files**

```bash
git rm packages/ui/src/components/agent-draft-card.tsx
git rm packages/ui/src/components/agent-draft-card.spec.tsx 2>/dev/null || true
```

- [ ] **Step 3: Update consumers**

For each consumer reported in Step 1: import the panel `DraftCard` from `@future/agent`, OR if the consumer is the standalone approval inbox UI, replace its draft rendering with a query against `agents.drafts.getById` + the new `DraftCard`. (If the inbox is itself slated for deletion as part of this refactor — check the spec — drop the consumer file too.)

- [ ] **Step 4: Remove the export from `@future/ui` index**

```bash
sed -i.bak '/agent-draft-card/d' packages/ui/src/index.ts && rm packages/ui/src/index.ts.bak
```

- [ ] **Step 5: Build everything**

```bash
bun run --filter "@future/*" build
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(ui): drop legacy agent-draft-card; replaced by @future/agent DraftCard"
```

---

## Task 12: Export `DraftCard` from `@future/agent` and PR

- [ ] **Step 1: Add export**

Append to `packages/agent/src/index.ts`:

```ts
export { DraftCard } from './thread/cards/draft-card'
export type { DraftCardProps } from './thread/cards/draft-card'
export { RejectReasonPicker } from './thread/cards/reject-reason-picker'
export type { RejectReasonPickerProps, RejectReason } from './thread/cards/reject-reason-picker'
export { useCanApproveDrafts } from './hooks/use-can-approve-drafts'
export { useDraftRow } from './hooks/use-draft-row'
```

- [ ] **Step 2: Push & PR**

```bash
git push -u origin feat/agent-ux-plan-3-draft-card
gh pr create --title "feat(agent): UX refactor plan 3 — DraftCard + approval" --body "$(cat <<'EOF'
## Summary

- New `DraftCard` in `@future/agent` rendered for `agent.draft` parts
- Inline approve / reject (with 4-enum picker + free-text note for `other_with_note`)
- Permission-gated: shows "Sent for approval" pill when actor lacks `AGENT_DRAFT_APPROVE`
- New `agents.drafts.getById` query (full draft row including args + taintAtDraftTime)
- `agents.draftApproval.reject` accepts optional `note` (max 500); persisted to new `execution_outcome_note` column; surfaced in kernel audit + notification summary
- Deletes legacy `packages/ui/src/components/agent-draft-card.tsx` per "no backward compat"

Plan 3 of 6. Spec §6.

## Test plan

- [ ] CI green (api + agent + ui)
- [ ] Manual: trigger a draft.proposed in `web-planner`, confirm card renders with full args
- [ ] Manual as approver: approve → status flips green
- [ ] Manual as approver: reject `other_with_note` with text → backend persists note
- [ ] Manual as non-approver: see "Sent for approval" pill, no buttons

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

- [ ] `0000_initial.sql` re-squashed; `meta/` regenerated
- [ ] No `note` field smuggled into `executionOutcome` text — separate columns
- [ ] `RejectReasonPicker` enforces note when `other_with_note` (frontend + backend both reject empty)
- [ ] `DraftCard` button row renders correct branch for: pending+canApprove, pending+!canApprove, resolved
- [ ] No imports from `packages/ui/src/components/agent-draft-card` remain

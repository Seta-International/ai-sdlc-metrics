import { beforeEach, describe, expect, it, vi } from 'vitest'
import { draftApprovalRouter, setDraftApprovalService } from './draft-approval.router'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const DRAFT_ID = '01900000-0000-7000-8000-000000000099'

function createCaller(ctx: { tenantId: string | null; actorId: string | null }) {
  return draftApprovalRouter.createCaller({
    req: { headers: {} as Record<string, string | undefined> },
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
  })
}

describe('draftApprovalRouter', () => {
  const approveDraft = vi.fn()
  const rejectDraft = vi.fn()

  beforeEach(() => {
    approveDraft.mockReset().mockResolvedValue(undefined)
    rejectDraft.mockReset().mockResolvedValue(undefined)
    setDraftApprovalService({
      approveDraft,
      rejectDraft,
    } as never)
  })

  it('rejects without note when reason is not other_with_note', async () => {
    const caller = createCaller({ tenantId: TENANT_ID, actorId: ACTOR_ID })

    await caller.reject({
      draftId: DRAFT_ID,
      reason: 'not_needed',
    })

    expect(rejectDraft).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      draftId: DRAFT_ID,
      rejecterId: ACTOR_ID,
      reason: 'not_needed',
      note: undefined,
    })
  })

  it('errors when other_with_note has no note', async () => {
    const caller = createCaller({ tenantId: TENANT_ID, actorId: ACTOR_ID })

    await expect(
      caller.reject({
        draftId: DRAFT_ID,
        reason: 'other_with_note',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'note is required when reason is other_with_note',
    })
  })

  it('errors when other_with_note has only whitespace note', async () => {
    const caller = createCaller({ tenantId: TENANT_ID, actorId: ACTOR_ID })

    await expect(
      caller.reject({
        draftId: DRAFT_ID,
        reason: 'other_with_note',
        note: '   ',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'note is required when reason is other_with_note',
    })
  })

  it('persists note when other_with_note has a note', async () => {
    const caller = createCaller({ tenantId: TENANT_ID, actorId: ACTOR_ID })

    await caller.reject({
      draftId: DRAFT_ID,
      reason: 'other_with_note',
      note: 'see ticket FUT-123',
    })

    expect(rejectDraft).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      draftId: DRAFT_ID,
      rejecterId: ACTOR_ID,
      reason: 'other_with_note',
      note: 'see ticket FUT-123',
    })
  })
})

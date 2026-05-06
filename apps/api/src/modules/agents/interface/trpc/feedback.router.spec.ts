import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedbackRouter, setSubmitFeedbackHandler } from './feedback.router'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const MESSAGE_ID = '01900000-0000-7000-8000-000000000099'

function createCaller(ctx: { tenantId: string | null; actorId: string | null }) {
  return feedbackRouter.createCaller({
    req: { headers: {} as Record<string, string | undefined> },
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
  })
}

describe('feedbackRouter', () => {
  const execute = vi.fn()

  beforeEach(() => {
    execute.mockReset().mockResolvedValue(undefined)
    setSubmitFeedbackHandler({ execute } as never)
  })

  it('submits thumbs-up feedback', async () => {
    const caller = createCaller({ tenantId: TENANT_ID, actorId: ACTOR_ID })
    await caller.submit({ messageId: MESSAGE_ID, rating: 'up' })

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        messageId: MESSAGE_ID,
        rating: 'up',
      }),
    )
  })

  it('submits thumbs-down with note', async () => {
    const caller = createCaller({ tenantId: TENANT_ID, actorId: ACTOR_ID })
    await caller.submit({ messageId: MESSAGE_ID, rating: 'down', note: 'wrong shape' })

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        rating: 'down',
        note: 'wrong shape',
      }),
    )
  })

  it('throws unauthorized when tenant context is missing', async () => {
    const caller = createCaller({ tenantId: null, actorId: ACTOR_ID })
    await expect(caller.submit({ messageId: MESSAGE_ID, rating: 'up' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

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

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 'wrong shape',
      }),
    )
  })
})

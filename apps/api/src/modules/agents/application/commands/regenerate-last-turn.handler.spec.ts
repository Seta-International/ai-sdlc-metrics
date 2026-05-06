import { describe, it, expect, vi } from 'vitest'
import { TRPCError } from '@trpc/server'
import { RegenerateLastTurnCommand } from './regenerate-last-turn.command'
import { RegenerateLastTurnHandler } from './regenerate-last-turn.handler'

describe('RegenerateLastTurnHandler', () => {
  it('errors when there is no assistant message in the session', async () => {
    const messageRepo = {
      findLastAssistant: vi.fn().mockResolvedValue(null),
      findPriorUser: vi.fn(),
      markSuperseded: vi.fn(),
    }
    const sendMessageHandler = { execute: vi.fn() }
    const handler = new RegenerateLastTurnHandler(messageRepo as never, sendMessageHandler as never)

    await expect(handler.execute(new RegenerateLastTurnCommand('t1', 's1', 'u1'))).rejects.toEqual(
      new TRPCError({ code: 'BAD_REQUEST', message: 'no assistant turn to regenerate' }),
    )
  })

  it('marks the last assistant message as superseded then re-runs', async () => {
    const findLastAssistant = vi.fn().mockResolvedValue({ id: 'm1', sessionId: 's1' })
    const findPriorUser = vi.fn().mockResolvedValue({ id: 'u1', content: 'Hello' })
    const markSuperseded = vi.fn().mockResolvedValue(undefined)
    const sendMessageHandler = {
      execute: vi.fn().mockResolvedValue({ id: 'new-id' }),
    }
    const handler = new RegenerateLastTurnHandler(
      { findLastAssistant, findPriorUser, markSuperseded } as never,
      sendMessageHandler as never,
    )

    const result = await handler.execute(new RegenerateLastTurnCommand('t1', 's1', 'u1'))

    expect(markSuperseded).toHaveBeenCalledWith({ tenantId: 't1', messageId: 'm1' })
    expect(sendMessageHandler.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        sessionId: 's1',
        content: 'Hello',
      }),
    )
    expect(result).toEqual({ newTurnId: 'new-id' })
  })
})

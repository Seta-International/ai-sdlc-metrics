import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionRouter, setAgentSessionHandlers } from './session.router'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const SESSION_ID = '01900000-0000-7000-8000-000000000010'

function createCaller(ctx: { tenantId: string | null; actorId: string | null }) {
  return sessionRouter.createCaller({
    req: { headers: {} as Record<string, string | undefined> },
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
  })
}

describe('sessionRouter', () => {
  const createSession = vi.fn()
  const listSessions = vi.fn()
  const sendMessage = vi.fn()
  const regenerateLastTurn = vi.fn()

  beforeEach(() => {
    createSession.mockReset()
    listSessions.mockReset()
    sendMessage.mockReset()
    regenerateLastTurn.mockReset().mockResolvedValue({ newTurnId: 'turn-2' })
    setAgentSessionHandlers({
      createSession: { execute: createSession } as never,
      listSessions: { execute: listSessions } as never,
      sendMessage: { execute: sendMessage } as never,
      regenerateLastTurn: { execute: regenerateLastTurn } as never,
    })
  })

  it('regenerateLastTurn forwards context + session id', async () => {
    const caller = createCaller({ tenantId: TENANT_ID, actorId: ACTOR_ID })
    const result = await caller.regenerateLastTurn({ sessionId: SESSION_ID })

    expect(result).toEqual({ newTurnId: 'turn-2' })
    expect(regenerateLastTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        sessionId: SESSION_ID,
      }),
    )
  })

  it('regenerateLastTurn requires tenant context', async () => {
    const caller = createCaller({ tenantId: null, actorId: ACTOR_ID })
    await expect(caller.regenerateLastTurn({ sessionId: SESSION_ID })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

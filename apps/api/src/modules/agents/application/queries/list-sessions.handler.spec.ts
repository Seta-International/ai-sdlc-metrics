import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListSessionsQuery } from './list-sessions.query'
import { ListSessionsHandler } from './list-sessions.handler'
import type { AgentSessionRepository } from '../../domain/repositories/agent-session.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

const mockSessions = [
  {
    id: '01900000-0000-7000-8000-000000000010',
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    agentId: null,
    channelType: 'web_chat',
    status: 'active' as const,
    contextModule: null,
    contextEntity: null,
    contextEntityId: null,
    contextMetadata: null,
    createdAt: new Date(),
    endedAt: null,
  },
]

describe('ListSessionsHandler', () => {
  let handler: ListSessionsHandler
  let sessionRepo: AgentSessionRepository

  beforeEach(() => {
    sessionRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByActor: vi.fn().mockResolvedValue(mockSessions),
      updateStatus: vi.fn(),
    }
    handler = new ListSessionsHandler(sessionRepo)
  })

  it('returns sessions for the actor', async () => {
    const query = new ListSessionsQuery(ACTOR_ID, TENANT_ID, 10)

    const result = await handler.execute(query)

    expect(sessionRepo.findByActor).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID, 10)
    expect(result).toEqual(mockSessions)
  })

  it('uses default limit of 20', async () => {
    const query = new ListSessionsQuery(ACTOR_ID, TENANT_ID)

    await handler.execute(query)

    expect(sessionRepo.findByActor).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID, 20)
  })
})

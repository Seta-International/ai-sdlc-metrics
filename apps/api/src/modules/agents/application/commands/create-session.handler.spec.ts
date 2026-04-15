import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateSessionCommand } from './create-session.command'
import { CreateSessionHandler } from './create-session.handler'
import type { AgentSessionRepository } from '../../domain/repositories/agent-session.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const SESSION_ID = '01900000-0000-7000-8000-000000000010'

const mockSession = {
  id: SESSION_ID,
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
}

describe('CreateSessionHandler', () => {
  let handler: CreateSessionHandler
  let sessionRepo: AgentSessionRepository

  beforeEach(() => {
    sessionRepo = {
      create: vi.fn().mockResolvedValue(mockSession),
      findById: vi.fn(),
      findByActor: vi.fn(),
      updateStatus: vi.fn(),
    }
    handler = new CreateSessionHandler(sessionRepo)
  })

  it('creates a session and returns it', async () => {
    const command = new CreateSessionCommand(TENANT_ID, ACTOR_ID)

    const result = await handler.execute(command)

    expect(sessionRepo.create).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      agentId: null,
      channelType: 'web_chat',
      status: 'active',
      contextModule: null,
      contextEntity: null,
      contextEntityId: null,
      contextMetadata: null,
    })
    expect(result).toEqual(mockSession)
  })

  it('passes context fields when provided', async () => {
    const metadata = { key: 'value' }
    const command = new CreateSessionCommand(
      TENANT_ID,
      ACTOR_ID,
      'people',
      'profile',
      'prof-123',
      metadata,
    )

    await handler.execute(command)

    expect(sessionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contextModule: 'people',
        contextEntity: 'profile',
        contextEntityId: 'prof-123',
        contextMetadata: metadata,
      }),
    )
  })
})

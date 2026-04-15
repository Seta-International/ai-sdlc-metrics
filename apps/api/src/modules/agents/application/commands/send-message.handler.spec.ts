import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { SendMessageCommand } from './send-message.command'
import { SendMessageHandler } from './send-message.handler'
import type { AgentSessionRepository } from '../../domain/repositories/agent-session.repository'
import type { AgentMessageRepository } from '../../domain/repositories/agent-message.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const SESSION_ID = '01900000-0000-7000-8000-000000000010'
const MESSAGE_ID = '01900000-0000-7000-8000-000000000020'

const mockSession = {
  id: SESSION_ID,
  tenantId: TENANT_ID,
  actorId: '01900000-0000-7000-8000-000000000002',
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

const mockMessage = {
  id: MESSAGE_ID,
  sessionId: SESSION_ID,
  tenantId: TENANT_ID,
  role: 'user' as const,
  content: 'Hello agent',
  toolName: null,
  toolArgs: null,
  modelUsed: null,
  tokensUsed: null,
  isError: false,
  createdAt: new Date(),
}

describe('SendMessageHandler', () => {
  let handler: SendMessageHandler
  let sessionRepo: AgentSessionRepository
  let messageRepo: AgentMessageRepository

  beforeEach(() => {
    sessionRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(mockSession),
      findByActor: vi.fn(),
      updateStatus: vi.fn(),
    }
    messageRepo = {
      create: vi.fn().mockResolvedValue(mockMessage),
      findBySession: vi.fn(),
    }
    handler = new SendMessageHandler(sessionRepo, messageRepo)
  })

  it('creates a message when session exists', async () => {
    const command = new SendMessageCommand(TENANT_ID, SESSION_ID, 'user', 'Hello agent')

    const result = await handler.execute(command)

    expect(sessionRepo.findById).toHaveBeenCalledWith(SESSION_ID, TENANT_ID)
    expect(messageRepo.create).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      tenantId: TENANT_ID,
      role: 'user',
      content: 'Hello agent',
      toolName: null,
      toolArgs: null,
      modelUsed: null,
      tokensUsed: null,
      isError: false,
    })
    expect(result).toEqual(mockMessage)
  })

  it('throws NotFoundException when session does not exist', async () => {
    vi.mocked(sessionRepo.findById).mockResolvedValue(null)

    const command = new SendMessageCommand(TENANT_ID, SESSION_ID, 'user', 'Hello agent')

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException)
  })
})

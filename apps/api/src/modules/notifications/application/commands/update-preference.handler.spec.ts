import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UpdatePreferenceHandler } from './update-preference.handler'
import { UpdatePreferenceCommand } from './update-preference.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'

const mockRepo = {
  upsertPreference: vi.fn().mockResolvedValue({
    id: 'pref-1',
    tenantId: 'tenant-1',
    actorId: 'actor-1',
    category: 'approval',
    inApp: false,
    email: true,
  }),
} as unknown as INotificationRepository

describe('UpdatePreferenceHandler', () => {
  let handler: UpdatePreferenceHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new UpdatePreferenceHandler(mockRepo)
  })

  it('upserts preference and returns it', async () => {
    const result = await handler.execute(
      new UpdatePreferenceCommand('tenant-1', 'actor-1', 'approval', false, true),
    )
    expect(result.email).toBe(true)
    expect(mockRepo.upsertPreference).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      category: 'approval',
      inApp: false,
      email: true,
    })
  })
})

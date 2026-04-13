import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetPreferencesHandler } from './get-preferences.handler'
import { GetPreferencesQuery } from './get-preferences.query'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'

const categories = ['approval', 'mention', 'assignment', 'system'] as const

const mockRepo = {
  getPreferences: vi.fn().mockResolvedValue([
    {
      id: 'p1',
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      category: 'approval',
      inApp: true,
      email: true,
    },
  ]),
} as unknown as INotificationRepository

describe('GetPreferencesHandler', () => {
  let handler: GetPreferencesHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new GetPreferencesHandler(mockRepo)
  })

  it('returns all 4 categories with defaults for missing ones', async () => {
    const result = await handler.execute(new GetPreferencesQuery('tenant-1', 'actor-1'))
    expect(result).toHaveLength(4)
    const cats = result.map((p) => p.category)
    expect(cats).toContain('approval')
    expect(cats).toContain('mention')
    expect(cats).toContain('assignment')
    expect(cats).toContain('system')
    // stored approval pref
    const approval = result.find((p) => p.category === 'approval')
    expect(approval?.inApp).toBe(true)
    // default for missing mention
    const mention = result.find((p) => p.category === 'mention')
    expect(mention?.inApp).toBe(true)
    expect(mention?.email).toBe(true)
  })
})

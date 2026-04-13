import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SendNotificationEmailWorker } from './send-notification-email.worker'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import type { PeopleQueryFacade } from '../../../people/application/facades/people-query.facade'
import type { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'

vi.mock('@future/mail', () => ({
  createMailTransport: vi.fn(() => ({
    send: vi.fn().mockResolvedValue({ messageId: 'msg-1', accepted: [], rejected: [] }),
  })),
  renderMjmlTemplate: vi.fn().mockReturnValue('<html>Test</html>'),
}))

const mockNotifRepo: INotificationRepository = {
  insert: vi.fn(),
  findByRecipient: vi.fn(),
  findById: vi.fn(),
  countUnread: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  archive: vi.fn(),
  getPreference: vi.fn(),
  upsertPreference: vi.fn(),
  getPreferences: vi.fn(),
}

// ProfileResult is { profile: EmploymentProfile, detail: ..., sections: [] } | null
// EmploymentProfile has companyEmail: string | null
const mockPeopleFacade = {
  getProfile: vi.fn().mockResolvedValue({
    profile: { companyEmail: 'employee@company.com', actorId: 'actor-1' },
    detail: null,
    sections: [],
  }),
} as unknown as PeopleQueryFacade

const mockAdminFacade = {
  getEmailConfig: vi.fn().mockResolvedValue(null),
} as unknown as AdminQueryFacade

describe('SendNotificationEmailWorker', () => {
  let worker: SendNotificationEmailWorker

  beforeEach(() => {
    vi.clearAllMocks()
    worker = new SendNotificationEmailWorker(mockNotifRepo, mockPeopleFacade, mockAdminFacade)
  })

  it('loads notification, gets recipient email, and sends email', async () => {
    vi.mocked(mockNotifRepo.findById).mockResolvedValue({
      id: 'n-1',
      tenantId: 'tenant-1',
      recipientId: 'actor-1',
      senderId: null,
      category: 'approval',
      title: 'Leave approved',
      body: 'Your leave was approved',
      resourceType: null,
      resourceId: null,
      resourceUrl: '/time/leave/123',
      readAt: null,
      archivedAt: null,
      createdAt: new Date(),
    })

    await worker.handle({
      data: { notificationId: 'n-1', tenantId: 'tenant-1', recipientId: 'actor-1' },
    } as never)

    const { createMailTransport } = await import('@future/mail')
    expect(createMailTransport).toHaveBeenCalled()
  })

  it('skips gracefully if notification not found', async () => {
    vi.mocked(mockNotifRepo.findById).mockResolvedValue(null)

    // Should not throw
    await worker.handle({
      data: { notificationId: 'missing', tenantId: 'tenant-1', recipientId: 'actor-1' },
    } as never)
  })

  it('skips gracefully if profile has no email', async () => {
    vi.mocked(mockNotifRepo.findById).mockResolvedValue({
      id: 'n-2',
      tenantId: 'tenant-1',
      recipientId: 'actor-1',
      senderId: null,
      category: 'approval',
      title: 'Test',
      body: 'Test body',
      resourceType: null,
      resourceId: null,
      resourceUrl: null,
      readAt: null,
      archivedAt: null,
      createdAt: new Date(),
    })
    vi.mocked(mockPeopleFacade.getProfile).mockResolvedValueOnce({
      profile: { companyEmail: null, actorId: 'actor-1' } as never,
      detail: null,
      sections: [],
    })

    // Should not throw
    await worker.handle({
      data: { notificationId: 'n-2', tenantId: 'tenant-1', recipientId: 'actor-1' },
    } as never)

    const { createMailTransport } = await import('@future/mail')
    expect(createMailTransport).not.toHaveBeenCalled()
  })

  it('skips gracefully if profile not found', async () => {
    vi.mocked(mockNotifRepo.findById).mockResolvedValue({
      id: 'n-3',
      tenantId: 'tenant-1',
      recipientId: 'actor-1',
      senderId: null,
      category: 'approval',
      title: 'Test',
      body: 'Test body',
      resourceType: null,
      resourceId: null,
      resourceUrl: null,
      readAt: null,
      archivedAt: null,
      createdAt: new Date(),
    })
    vi.mocked(mockPeopleFacade.getProfile).mockResolvedValueOnce(null)

    // Should not throw
    await worker.handle({
      data: { notificationId: 'n-3', tenantId: 'tenant-1', recipientId: 'actor-1' },
    } as never)
  })

  it('uses tenant email config when available', async () => {
    vi.mocked(mockNotifRepo.findById).mockResolvedValue({
      id: 'n-4',
      tenantId: 'tenant-1',
      recipientId: 'actor-1',
      senderId: null,
      category: 'approval',
      title: 'Leave approved',
      body: 'Your leave was approved',
      resourceType: null,
      resourceId: null,
      resourceUrl: '/time/leave/456',
      readAt: null,
      archivedAt: null,
      createdAt: new Date(),
    })
    vi.mocked(mockAdminFacade.getEmailConfig).mockResolvedValueOnce({
      id: 'cfg-1',
      tenantId: 'tenant-1',
      provider: 'ses',
      fromAddress: 'tenant@example.com',
      smtpHost: null,
      smtpPort: null,
      credentialRef: 'arn:aws:secretsmanager:...',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await worker.handle({
      data: { notificationId: 'n-4', tenantId: 'tenant-1', recipientId: 'actor-1' },
    } as never)

    const { createMailTransport } = await import('@future/mail')
    expect(createMailTransport).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'ses', fromAddress: 'tenant@example.com' }),
    )
  })

  it('rethrows transport errors so pg-boss can retry', async () => {
    vi.mocked(mockNotifRepo.findById).mockResolvedValue({
      id: 'n-5',
      tenantId: 'tenant-1',
      recipientId: 'actor-1',
      senderId: null,
      category: 'approval',
      title: 'Test',
      body: 'body',
      resourceType: null,
      resourceId: null,
      resourceUrl: null,
      readAt: null,
      archivedAt: null,
      createdAt: new Date(),
    })
    const { createMailTransport } = await import('@future/mail')
    vi.mocked(createMailTransport).mockReturnValueOnce({
      send: vi.fn().mockRejectedValue(new Error('SES error')),
    })

    await expect(
      worker.handle({
        data: { notificationId: 'n-5', tenantId: 'tenant-1', recipientId: 'actor-1' },
      } as never),
    ).rejects.toThrow('SES error')
  })
})

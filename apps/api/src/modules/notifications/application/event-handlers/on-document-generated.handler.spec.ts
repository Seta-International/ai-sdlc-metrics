import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OnDocumentGeneratedHandler } from './on-document-generated.handler'
import { DocumentGeneratedEvent } from '@future/event-contracts'
import type { CommandBus } from '@nestjs/cqrs'
import { SendNotificationCommand } from '../commands/send-notification.command'

const mockCommandBus = { execute: vi.fn().mockResolvedValue('notif-1') } as unknown as CommandBus

describe('OnDocumentGeneratedHandler', () => {
  let handler: OnDocumentGeneratedHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new OnDocumentGeneratedHandler(mockCommandBus)
  })

  it('notifies the requester when document is generated', async () => {
    await handler.handle(
      new DocumentGeneratedEvent('tenant-1', 'job-1', 'payslip', 'pdf', 'key/file.pdf', 'actor-1'),
    )

    expect(mockCommandBus.execute).toHaveBeenCalledWith(expect.any(SendNotificationCommand))
    const cmd = vi.mocked(mockCommandBus.execute).mock.calls[0][0] as SendNotificationCommand
    expect(cmd.recipientId).toBe('actor-1')
    expect(cmd.category).toBe('system')
    expect(cmd.title).toBe('Your document is ready')
  })
})

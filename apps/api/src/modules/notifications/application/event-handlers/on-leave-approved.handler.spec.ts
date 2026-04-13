import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OnLeaveApprovedHandler } from './on-leave-approved.handler'
import { LeaveApprovedEvent } from '@future/event-contracts'
import type { CommandBus } from '@nestjs/cqrs'
import { SendNotificationCommand } from '../commands/send-notification.command'

const mockCommandBus = { execute: vi.fn().mockResolvedValue('notif-1') } as unknown as CommandBus

describe('OnLeaveApprovedHandler', () => {
  let handler: OnLeaveApprovedHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new OnLeaveApprovedHandler(mockCommandBus)
  })

  it('dispatches SendNotificationCommand for the leave requester', async () => {
    await handler.handle(
      new LeaveApprovedEvent('tenant-1', 'actor-1', 'leave-req-1', '2026-04-14', '2026-04-18'),
    )

    expect(mockCommandBus.execute).toHaveBeenCalledWith(expect.any(SendNotificationCommand))
    const cmd = vi.mocked(mockCommandBus.execute).mock.calls[0][0] as SendNotificationCommand
    expect(cmd.recipientId).toBe('actor-1')
    expect(cmd.category).toBe('approval')
    expect(cmd.title).toBe('Leave request approved')
  })
})

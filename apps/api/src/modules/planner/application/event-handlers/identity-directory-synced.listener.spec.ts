import { describe, it, expect, vi } from 'vitest'
import { DirectorySyncCompletedEvent } from '@future/event-contracts'
import { IdentityDirectorySyncedListener } from './identity-directory-synced.listener'
import { ResolvePendingAssignmentsCommand } from '../commands/ms-sync/resolve-pending-assignments.command'

describe('IdentityDirectorySyncedListener', () => {
  it('listener fires on IdentityDirectorySyncedEvent', async () => {
    const commandBus = { execute: vi.fn().mockResolvedValue(undefined) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listener = new IdentityDirectorySyncedListener(commandBus as any)
    const event = new DirectorySyncCompletedEvent(
      'tenant-1',
      'idp-1',
      10,
      5,
      new Date().toISOString(),
    )

    await listener.handle(event)

    expect(commandBus.execute).toHaveBeenCalledWith(
      new ResolvePendingAssignmentsCommand('tenant-1'),
    )
  })
})

import { describe, expect, it, vi } from 'vitest'
import { UnlinkRosterCommand } from './unlink-roster.command'
import { UnlinkRosterHandler } from './unlink-roster.handler'
import { MsLinkedRosterEntity } from '../../../domain/entities/ms-linked-roster.entity'

function makeEntity(): MsLinkedRosterEntity {
  return MsLinkedRosterEntity.create({
    id: 'roster-id-1',
    tenantId: 't1',
    msRosterId: 'r1',
    displayName: 'My Roster',
    linkedByActorId: 'a1',
  })
}

describe('UnlinkRosterHandler', () => {
  it('rejects when roster not linked', async () => {
    const rosterRepo = {
      findByTenantAndRoster: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const handler = new UnlinkRosterHandler(rosterRepo as any)
    /* eslint-enable @typescript-eslint/no-explicit-any */
    await expect(handler.execute(new UnlinkRosterCommand('t1', 'a1', 'r1'))).rejects.toThrow(
      /not linked/i,
    )

    expect(rosterRepo.upsert).not.toHaveBeenCalled()
  })

  it('calls entity.unlink() and upserts', async () => {
    const entity = makeEntity()
    const rosterRepo = {
      findByTenantAndRoster: vi.fn().mockResolvedValue(entity),
      upsert: vi.fn(),
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const handler = new UnlinkRosterHandler(rosterRepo as any)
    /* eslint-enable @typescript-eslint/no-explicit-any */
    await handler.execute(new UnlinkRosterCommand('t1', 'a1', 'r1'))

    expect(rosterRepo.upsert).toHaveBeenCalledOnce()
    const saved = rosterRepo.upsert.mock.calls[0][0] as MsLinkedRosterEntity
    expect(saved.unlinkedAt).toBeInstanceOf(Date)
  })
})

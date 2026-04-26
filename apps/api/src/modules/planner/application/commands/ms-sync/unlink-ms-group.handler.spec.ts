import { describe, expect, it, vi } from 'vitest'
import { UnlinkMsGroupHandler } from './unlink-ms-group.handler'
import { UnlinkMsGroupCommand } from './unlink-ms-group.command'
import { MsLinkedGroupEntity } from '../../../domain/entities/ms-linked-group.entity'

function makeEntity(
  opts: { msGroupId?: string; alreadyUnlinked?: boolean } = {},
): MsLinkedGroupEntity {
  const entity = MsLinkedGroupEntity.create({
    id: 'id-1',
    tenantId: 't1',
    msGroupId: opts.msGroupId ?? 'g1',
    displayName: 'Marketing',
    linkedByActorId: 'a1',
  })
  if (opts.alreadyUnlinked) entity.unlink()
  return entity
}

describe('UnlinkMsGroupHandler', () => {
  it('marks group as unlinked and disables sync', async () => {
    const entity = makeEntity()
    const groupRepo = {
      findByTenantAndGroup: vi.fn().mockResolvedValue(entity),
      upsert: vi.fn(),
    }

    const handler = new UnlinkMsGroupHandler(groupRepo as never)
    await handler.execute(new UnlinkMsGroupCommand('t1', 'a1', 'g1'))

    expect(groupRepo.upsert).toHaveBeenCalledOnce()
    const saved = groupRepo.upsert.mock.calls[0][0] as MsLinkedGroupEntity
    expect(saved.unlinkedAt).not.toBeNull()
    expect(saved.syncEnabled).toBe(false)
  })

  it('throws when linked group is not found', async () => {
    const groupRepo = {
      findByTenantAndGroup: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    }

    const handler = new UnlinkMsGroupHandler(groupRepo as never)
    await expect(handler.execute(new UnlinkMsGroupCommand('t1', 'a1', 'g1'))).rejects.toThrow(
      /not found/i,
    )
    expect(groupRepo.upsert).not.toHaveBeenCalled()
  })

  it('is idempotent when group is already unlinked', async () => {
    const entity = makeEntity({ alreadyUnlinked: true })
    const groupRepo = {
      findByTenantAndGroup: vi.fn().mockResolvedValue(entity),
      upsert: vi.fn(),
    }

    const handler = new UnlinkMsGroupHandler(groupRepo as never)
    await handler.execute(new UnlinkMsGroupCommand('t1', 'a1', 'g1'))

    expect(groupRepo.upsert).toHaveBeenCalledOnce()
    const saved = groupRepo.upsert.mock.calls[0][0] as MsLinkedGroupEntity
    expect(saved.unlinkedAt).not.toBeNull()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { LinkMsGroupCommand } from './link-ms-group.command'
import { LinkMsGroupHandler } from './link-ms-group.handler'

describe('LinkMsGroupHandler', () => {
  it('fetches group displayName, upserts ms_linked_group, enqueues backfill job', async () => {
    const graph = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        body: { id: 'g1', displayName: 'Marketing' },
        etag: null,
      }),
    }
    const groupRepo = { findByTenantAndGroup: vi.fn().mockResolvedValue(null), upsert: vi.fn() }
    const pgBoss = { enqueue: vi.fn().mockResolvedValue('job-123') }
    const eventBus = { publish: vi.fn() }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const handler = new LinkMsGroupHandler(
      graph as any,
      groupRepo as any,
      pgBoss as any,
      eventBus as any,
    )
    /* eslint-enable @typescript-eslint/no-explicit-any */
    await handler.execute(new LinkMsGroupCommand('t1', 'a1', 'g1'))

    expect(graph.get).toHaveBeenCalledWith('t1', '/groups/g1?$select=id,displayName')
    expect(groupRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', msGroupId: 'g1', displayName: 'Marketing' }),
    )
    expect(pgBoss.enqueue).toHaveBeenCalledWith(
      'ms-sync-backfill-group',
      expect.objectContaining({ tenantId: 't1', msGroupId: 'g1' }),
      expect.objectContaining({ singletonKey: expect.stringContaining('g1') }),
    )
  })

  it('rejects when group already linked', async () => {
    const graph = { get: vi.fn() }
    const groupRepo = {
      findByTenantAndGroup: vi.fn().mockResolvedValue({ msGroupId: 'g1' }),
      upsert: vi.fn(),
    }
    const pgBoss = { enqueue: vi.fn() }
    const eventBus = { publish: vi.fn() }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const handler = new LinkMsGroupHandler(
      graph as any,
      groupRepo as any,
      pgBoss as any,
      eventBus as any,
    )
    /* eslint-enable @typescript-eslint/no-explicit-any */
    await expect(handler.execute(new LinkMsGroupCommand('t1', 'a1', 'g1'))).rejects.toThrow(
      /already linked/i,
    )
  })

  it('relinks a previously unlinked group reusing its existing id', async () => {
    const existingId = 'existing-uuid-g1'
    const graph = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        body: { id: 'g1', displayName: 'Marketing' },
        etag: null,
      }),
    }
    const groupRepo = {
      findByTenantAndGroup: vi.fn().mockResolvedValue({
        id: existingId,
        msGroupId: 'g1',
        unlinkedAt: new Date(),
      }),
      upsert: vi.fn(),
    }
    const pgBoss = { enqueue: vi.fn().mockResolvedValue('job-456') }
    const eventBus = { publish: vi.fn() }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const handler = new LinkMsGroupHandler(
      graph as any,
      groupRepo as any,
      pgBoss as any,
      eventBus as any,
    )
    /* eslint-enable @typescript-eslint/no-explicit-any */
    await handler.execute(new LinkMsGroupCommand('t1', 'a1', 'g1'))

    expect(groupRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: existingId, tenantId: 't1', msGroupId: 'g1' }),
    )
  })
})

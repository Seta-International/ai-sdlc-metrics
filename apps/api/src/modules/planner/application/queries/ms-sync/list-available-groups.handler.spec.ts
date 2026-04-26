import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListAvailableGroupsHandler } from './list-available-groups.handler'
import { ListAvailableGroupsQuery } from './list-available-groups.query'
import { MsLinkedGroupEntity } from '../../../domain/entities/ms-linked-group.entity'

const TENANT_ID = '01900000-0000-7fff-8000-000000005001'

function makeLinkedGroup(msGroupId: string, alreadyUnlinked = false): MsLinkedGroupEntity {
  const entity = MsLinkedGroupEntity.create({
    id: `id-${msGroupId}`,
    tenantId: TENANT_ID,
    msGroupId,
    displayName: `Group ${msGroupId}`,
    linkedByActorId: 'actor-1',
  })
  if (alreadyUnlinked) entity.unlink()
  return entity
}

describe('ListAvailableGroupsHandler', () => {
  let identityFacade: { listGroupsFromDirectory: ReturnType<typeof vi.fn> }
  let groupRepo: { listForTenant: ReturnType<typeof vi.fn> }
  let handler: ListAvailableGroupsHandler

  beforeEach(() => {
    identityFacade = { listGroupsFromDirectory: vi.fn() }
    groupRepo = { listForTenant: vi.fn() }
    handler = new ListAvailableGroupsHandler(identityFacade as never, groupRepo as never)
  })

  it('returns all directory groups when none are linked', async () => {
    identityFacade.listGroupsFromDirectory.mockResolvedValue([
      { externalGroupId: 'g1', displayName: 'Marketing', memberExternalIds: ['u1', 'u2'] },
      { externalGroupId: 'g2', displayName: 'Engineering', memberExternalIds: ['u3'] },
    ])
    groupRepo.listForTenant.mockResolvedValue([])

    const result = await handler.execute(new ListAvailableGroupsQuery(TENANT_ID))

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ externalGroupId: 'g1', displayName: 'Marketing', memberCount: 2 })
    expect(result[1]).toEqual({ externalGroupId: 'g2', displayName: 'Engineering', memberCount: 1 })
  })

  it('filters out currently linked groups', async () => {
    identityFacade.listGroupsFromDirectory.mockResolvedValue([
      { externalGroupId: 'g1', displayName: 'Marketing', memberExternalIds: ['u1'] },
      { externalGroupId: 'g2', displayName: 'Engineering', memberExternalIds: ['u2'] },
    ])
    groupRepo.listForTenant.mockResolvedValue([makeLinkedGroup('g1')])

    const result = await handler.execute(new ListAvailableGroupsQuery(TENANT_ID))

    expect(result).toHaveLength(1)
    expect(result[0].externalGroupId).toBe('g2')
  })

  it('includes previously unlinked groups in available list', async () => {
    identityFacade.listGroupsFromDirectory.mockResolvedValue([
      { externalGroupId: 'g1', displayName: 'Marketing', memberExternalIds: [] },
    ])
    groupRepo.listForTenant.mockResolvedValue([makeLinkedGroup('g1', true)])

    const result = await handler.execute(new ListAvailableGroupsQuery(TENANT_ID))

    expect(result).toHaveLength(1)
    expect(result[0].externalGroupId).toBe('g1')
  })

  it('returns empty array when directory has no groups', async () => {
    identityFacade.listGroupsFromDirectory.mockResolvedValue([])
    groupRepo.listForTenant.mockResolvedValue([])

    const result = await handler.execute(new ListAvailableGroupsQuery(TENANT_ID))

    expect(result).toHaveLength(0)
  })
})

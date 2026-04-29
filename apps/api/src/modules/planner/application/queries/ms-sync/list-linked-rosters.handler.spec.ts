import { describe, expect, it, vi } from 'vitest'
import { ListLinkedRostersHandler } from './list-linked-rosters.handler'
import { ListLinkedRostersQuery } from './list-linked-rosters.query'
import { MsLinkedRosterEntity } from '../../../domain/entities/ms-linked-roster.entity'
import { uuidv7 } from 'uuidv7'

const TENANT_ID = '01900000-0000-7fff-8000-000000005001'

function makeRoster(
  msRosterId: string,
  overrides: Partial<Parameters<typeof MsLinkedRosterEntity.reconstitute>[0]> = {},
) {
  return MsLinkedRosterEntity.reconstitute({
    id: uuidv7(),
    tenantId: TENANT_ID,
    msRosterId,
    displayName: 'Test Roster',
    linkedByActorId: uuidv7(),
    linkedAt: new Date('2026-04-25T00:00:00Z'),
    syncEnabled: true,
    mintedByFutureAt: null,
    unlinkedAt: null,
    ...overrides,
  })
}

describe('ListLinkedRostersHandler', () => {
  it('returns mapped DTOs for all tenant rosters', async () => {
    const rosterRepo = {
      listForTenant: vi
        .fn()
        .mockResolvedValue([
          makeRoster('roster-1'),
          makeRoster('roster-2', { mintedByFutureAt: new Date('2026-04-26T00:00:00Z') }),
        ]),
    } as any

    const handler = new ListLinkedRostersHandler(rosterRepo)
    const result = await handler.execute(new ListLinkedRostersQuery(TENANT_ID))

    expect(rosterRepo.listForTenant).toHaveBeenCalledWith(TENANT_ID)
    expect(result).toHaveLength(2)
    expect(result[0].msRosterId).toBe('roster-1')
    expect(result[0].mintedByFutureAt).toBeNull()
    expect(result[1].msRosterId).toBe('roster-2')
    expect(result[1].mintedByFutureAt).toBe('2026-04-26T00:00:00.000Z')
  })

  it('returns empty array when no rosters linked', async () => {
    const rosterRepo = { listForTenant: vi.fn().mockResolvedValue([]) } as any
    const handler = new ListLinkedRostersHandler(rosterRepo)
    const result = await handler.execute(new ListLinkedRostersQuery(TENANT_ID))
    expect(result).toEqual([])
  })
})

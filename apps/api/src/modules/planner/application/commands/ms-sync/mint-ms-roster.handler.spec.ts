import { describe, expect, it, vi } from 'vitest'
import { MintMsRosterCommand } from './mint-ms-roster.command'
import { MintMsRosterHandler } from './mint-ms-roster.handler'
import { MS_ROSTER_MINTED_EVENT } from '@future/event-contracts'

function makeHandler(overrides?: {
  graphPost?: ReturnType<typeof vi.fn>
  ownerAadId?: string | null
  memberAadId?: string | null
}) {
  const msRosterId = 'ms-roster-abc'
  const graphPost =
    overrides?.graphPost ??
    vi
      .fn()
      .mockResolvedValueOnce({ status: 201, body: { id: msRosterId }, etag: null })
      .mockResolvedValue({ status: 201, body: {}, etag: null })

  const graph = { post: graphPost }

  const rosterRepo = { upsert: vi.fn().mockResolvedValue(undefined) }
  const memberRepo = { replaceForRoster: vi.fn().mockResolvedValue(undefined) }

  const ownerAadId = overrides?.ownerAadId !== undefined ? overrides.ownerAadId : 'aad-owner-001'
  const memberAadId =
    overrides?.memberAadId !== undefined ? overrides.memberAadId : 'aad-member-002'

  const identityFacade = {
    getExternalUserId: vi.fn().mockImplementation(async (actorId: string) => {
      if (actorId === 'actor-owner') return ownerAadId
      if (actorId === 'actor-member') return memberAadId
      return null
    }),
  }
  const eventBus = { publish: vi.fn() }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const handler = new MintMsRosterHandler(
    graph as any,
    rosterRepo as any,
    memberRepo as any,
    identityFacade as any,
    eventBus as any,
  )
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { handler, graph, rosterRepo, memberRepo, identityFacade, eventBus, msRosterId }
}

describe('MintMsRosterHandler', () => {
  it('rejects when actor has no AAD OID', async () => {
    const { handler } = makeHandler({ ownerAadId: null })

    await expect(
      handler.execute(new MintMsRosterCommand('t1', 'actor-owner', 'My Roster', [])),
    ).rejects.toThrow(/AAD/i)
  })

  it('POSTs /planner/rosters with useBeta: true', async () => {
    const { handler, graph } = makeHandler()

    await handler.execute(new MintMsRosterCommand('t1', 'actor-owner', 'My Roster', []))

    expect(graph.post).toHaveBeenCalledWith(
      't1',
      '/planner/rosters',
      { '@odata.type': '#microsoft.graph.plannerRoster' },
      expect.objectContaining({ useBeta: true }),
    )
  })

  it('adds resolved initial members to roster', async () => {
    const { handler, graph, msRosterId } = makeHandler()

    await handler.execute(
      new MintMsRosterCommand('t1', 'actor-owner', 'My Roster', ['actor-member']),
    )

    expect(graph.post).toHaveBeenCalledWith(
      't1',
      `/planner/rosters/${encodeURIComponent(msRosterId)}/members`,
      { userId: 'aad-member-002' },
      expect.objectContaining({ useBeta: true }),
    )
  })

  it('upserts ms_linked_roster with mintedByFutureAt set', async () => {
    const { handler, rosterRepo } = makeHandler()

    await handler.execute(new MintMsRosterCommand('t1', 'actor-owner', 'My Roster', []))

    expect(rosterRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ mintedByFutureAt: expect.any(Date) }),
    )
  })

  it('seeds roster_member with owner AAD OID', async () => {
    const { handler, memberRepo, msRosterId } = makeHandler()

    await handler.execute(new MintMsRosterCommand('t1', 'actor-owner', 'My Roster', []))

    expect(memberRepo.replaceForRoster).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        msRosterId,
        ssoSubjects: expect.arrayContaining(['aad-owner-001']),
      }),
    )
  })

  it('publishes MS_ROSTER_MINTED_EVENT', async () => {
    const { handler, eventBus } = makeHandler()

    await handler.execute(new MintMsRosterCommand('t1', 'actor-owner', 'My Roster', []))

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: MS_ROSTER_MINTED_EVENT }),
    )
  })
})

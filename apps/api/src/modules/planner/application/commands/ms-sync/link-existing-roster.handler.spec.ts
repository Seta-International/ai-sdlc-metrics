import { describe, expect, it, vi } from 'vitest'
import { LinkExistingRosterCommand } from './link-existing-roster.command'
import { LinkExistingRosterHandler } from './link-existing-roster.handler'

describe('LinkExistingRosterHandler', () => {
  function makeHandler(
    overrides: {
      graphBody?: unknown
      rosterRepoUpsert?: ReturnType<typeof vi.fn>
      pgBossSend?: ReturnType<typeof vi.fn>
    } = {},
  ) {
    const graph = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        body: overrides.graphBody !== undefined ? overrides.graphBody : { id: 'r1' },
        etag: null,
      }),
    }
    const rosterRepo = { upsert: overrides.rosterRepoUpsert ?? vi.fn() }
    const pgBoss = { enqueue: overrides.pgBossSend ?? vi.fn().mockResolvedValue('job-1') }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const handler = new LinkExistingRosterHandler(graph as any, rosterRepo as any, pgBoss as any)
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return { handler, graph, rosterRepo, pgBoss }
  }

  it('rejects when roster not found in Graph', async () => {
    const { handler } = makeHandler({ graphBody: null })
    await expect(
      handler.execute(new LinkExistingRosterCommand('t1', 'a1', 'r1', 'My Roster')),
    ).rejects.toThrow(/not found/i)
  })

  it('fetches roster, upserts entity, enqueues backfill', async () => {
    const { handler, graph, rosterRepo, pgBoss } = makeHandler()
    await handler.execute(new LinkExistingRosterCommand('t1', 'a1', 'r1', 'My Roster'))

    expect(graph.get).toHaveBeenCalledWith('t1', '/planner/rosters/r1', { useBeta: true })
    expect(rosterRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', msRosterId: 'r1', displayName: 'My Roster' }),
    )
    expect(pgBoss.enqueue).toHaveBeenCalledWith(
      'ms-sync-backfill-roster',
      expect.objectContaining({ tenantId: 't1', msRosterId: 'r1' }),
    )
  })

  it('uses fallback displayName "Roster" when not provided', async () => {
    const { handler, rosterRepo } = makeHandler()
    await handler.execute(new LinkExistingRosterCommand('t1', 'a1', 'r1', null))

    expect(rosterRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Roster' }),
    )
  })
})

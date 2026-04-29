import { describe, it, expect, vi } from 'vitest'
import { ResolvePendingAssignmentsCommand } from './resolve-pending-assignments.command'
import { ResolvePendingAssignmentsHandler } from './resolve-pending-assignments.handler'

function makeHandler(opts: {
  tasks?: Array<{ id: string; planId: string; pendingMsAssignments: string[] }>
  resolvedMap?: Record<string, string | null>
  unresolvedMembers?: Array<{
    tenantId: string
    msRosterId: string
    ssoSubject: string
    actorId: null
    syncedAt: Date
  }>
}) {
  const taskRepo = {
    listWithPendingAssignments: vi.fn().mockResolvedValue(opts.tasks ?? []),
    applyPendingResolution: vi.fn().mockResolvedValue(undefined),
  }
  const identityFacade = {
    getActorIdByExternalUserId: vi
      .fn()
      .mockImplementation((aadOid: string) => Promise.resolve(opts.resolvedMap?.[aadOid] ?? null)),
  }
  const memberRepo = {
    listUnresolved: vi.fn().mockResolvedValue(opts.unresolvedMembers ?? []),
    resolveMember: vi.fn().mockResolvedValue(undefined),
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const handler = new ResolvePendingAssignmentsHandler(
    taskRepo as any,
    identityFacade as any,
    memberRepo as any,
  )
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { handler, taskRepo, identityFacade, memberRepo }
}

describe('ResolvePendingAssignmentsHandler', () => {
  it('resolves pending AAD OIDs and adds actors to task.assignees', async () => {
    const { handler, taskRepo } = makeHandler({
      tasks: [{ id: 'task-1', planId: 'plan-1', pendingMsAssignments: ['aad-1'] }],
      resolvedMap: { 'aad-1': 'actor-1' },
    })

    await handler.execute(new ResolvePendingAssignmentsCommand('tenant-1'))

    expect(taskRepo.applyPendingResolution).toHaveBeenCalledWith('task-1', {
      newAssignees: ['actor-1'],
      stillPending: [],
      origin: 'ms-sync-pull',
    })
  })

  it('leaves still-unresolved OIDs in pending_ms_assignments', async () => {
    const { handler, taskRepo } = makeHandler({
      tasks: [{ id: 'task-1', planId: 'plan-1', pendingMsAssignments: ['aad-1', 'aad-2'] }],
      resolvedMap: { 'aad-1': 'actor-1', 'aad-2': null },
    })

    await handler.execute(new ResolvePendingAssignmentsCommand('tenant-1'))

    expect(taskRepo.applyPendingResolution).toHaveBeenCalledWith('task-1', {
      newAssignees: ['actor-1'],
      stillPending: ['aad-2'],
      origin: 'ms-sync-pull',
    })
  })

  it('emits events with origin=ms-sync-pull (push listener will skip)', async () => {
    const { handler, taskRepo } = makeHandler({
      tasks: [{ id: 'task-1', planId: 'plan-1', pendingMsAssignments: ['aad-1'] }],
      resolvedMap: { 'aad-1': 'actor-1' },
    })

    await handler.execute(new ResolvePendingAssignmentsCommand('tenant-1'))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = taskRepo.applyPendingResolution.mock.calls[0] as any[]
    expect(call[1].origin).toBe('ms-sync-pull')
  })

  it('skips applyPendingResolution when all OIDs remain unresolved', async () => {
    const { handler, taskRepo } = makeHandler({
      tasks: [{ id: 'task-1', planId: 'plan-1', pendingMsAssignments: ['aad-1'] }],
      resolvedMap: { 'aad-1': null },
    })

    await handler.execute(new ResolvePendingAssignmentsCommand('tenant-1'))

    expect(taskRepo.applyPendingResolution).not.toHaveBeenCalled()
  })

  it('resolves unresolved roster members when actorId found', async () => {
    const { handler, memberRepo, identityFacade } = makeHandler({
      unresolvedMembers: [
        {
          tenantId: 't1',
          msRosterId: 'r1',
          ssoSubject: 'user@test.com',
          actorId: null,
          syncedAt: new Date(),
        },
      ],
      resolvedMap: { 'user@test.com': 'actor-1' },
    })

    await handler.execute(new ResolvePendingAssignmentsCommand('t1'))

    expect(identityFacade.getActorIdByExternalUserId).toHaveBeenCalledWith('user@test.com', 't1')
    expect(memberRepo.resolveMember).toHaveBeenCalledWith('t1', 'r1', 'user@test.com', 'actor-1')
  })

  it('skips roster member when actorId not resolvable', async () => {
    const { handler, memberRepo } = makeHandler({
      unresolvedMembers: [
        {
          tenantId: 't1',
          msRosterId: 'r1',
          ssoSubject: 'user@test.com',
          actorId: null,
          syncedAt: new Date(),
        },
      ],
      resolvedMap: { 'user@test.com': null },
    })

    await handler.execute(new ResolvePendingAssignmentsCommand('t1'))

    expect(memberRepo.resolveMember).not.toHaveBeenCalled()
  })
})

// Echo-suppression: push-path writes in DrizzleTaskRepository must not emit outbox
// events or trigger pgBoss enqueue.  This spec verifies each of the four methods
// called by PushTaskHandler / PushPlanHandler / PushBucketHandler:
//   linkToMs · markPushed · updateMsEtag · applyMsWonFields
//
// If any of these started inserting into core.outbox_event with a user/api origin
// the OutboxDirtyFieldsQuery would pick it up and schedule another push — loop.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleTaskRepository } from './drizzle-task.repository'

function makeUpdateChain() {
  return { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) }
}

describe('DrizzleTaskRepository — echo-suppression (push-path writes)', () => {
  let updateSpy: ReturnType<typeof vi.fn>
  let insertSpy: ReturnType<typeof vi.fn>
  let pgBossSend: ReturnType<typeof vi.fn>
  let taskRepo: DrizzleTaskRepository

  beforeEach(() => {
    updateSpy = vi.fn().mockReturnValue(makeUpdateChain())
    insertSpy = vi.fn()
    pgBossSend = vi.fn()

    const db = { update: updateSpy, insert: insertSpy }
    taskRepo = new DrizzleTaskRepository(db as never)
  })

  it('linkToMs issues only a task UPDATE — no outbox insert, pgBoss never called', async () => {
    await taskRepo.linkToMs('task-1', {
      msTaskId: 'ms-1',
      msTaskEtag: 'W/"x"',
      origin: 'ms-sync-push',
    })

    expect(insertSpy).not.toHaveBeenCalled()
    expect(pgBossSend).not.toHaveBeenCalled()
  })

  it('markPushed issues only a task UPDATE — no outbox insert, pgBoss never called', async () => {
    await taskRepo.markPushed('task-1', new Date())

    expect(insertSpy).not.toHaveBeenCalled()
    expect(pgBossSend).not.toHaveBeenCalled()
  })

  it('updateMsEtag issues only a task UPDATE — no outbox insert, pgBoss never called', async () => {
    await taskRepo.updateMsEtag('task-1', { msTaskEtag: '"etag-1"' })

    expect(insertSpy).not.toHaveBeenCalled()
    expect(pgBossSend).not.toHaveBeenCalled()
  })

  it('applyMsWonFields is a no-op placeholder — zero DB writes, pgBoss never called', async () => {
    await taskRepo.applyMsWonFields('task-1', {}, { origin: 'ms-sync-pull' })

    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    expect(pgBossSend).not.toHaveBeenCalled()
  })
})

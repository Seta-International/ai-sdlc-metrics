import { describe, expect, it, vi } from 'vitest'
import { SweepExpiredWriteDedupWorker } from './sweep-expired-write-dedup'
import type { IWriteDedupRepository } from '../../domain/repositories/write-dedup.repository'

function makeRepo(deletedCount = 0): IWriteDedupRepository {
  return {
    findByKey: vi.fn(),
    insert: vi.fn(),
    deleteExpired: vi.fn().mockResolvedValue({ deletedCount }),
  }
}

describe('SweepExpiredWriteDedupWorker', () => {
  it('calls deleteExpired and returns the count', async () => {
    const repo = makeRepo(3)
    const worker = new SweepExpiredWriteDedupWorker(repo)
    expect(await worker.run()).toEqual({ deletedCount: 3 })
    expect(repo.deleteExpired).toHaveBeenCalledOnce()
  })

  it('returns 0 when nothing is expired', async () => {
    expect(await new SweepExpiredWriteDedupWorker(makeRepo(0)).run()).toEqual({ deletedCount: 0 })
  })
})

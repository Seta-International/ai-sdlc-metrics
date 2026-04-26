import { Logger } from '@nestjs/common'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Db } from '@future/db'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { SemanticCacheSweeper, SEMANTIC_CACHE_SWEEPER_JOB_NAME } from './semantic-cache-sweeper'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb(rowCount: number | null = 3): Db {
  return {
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount }),
    }),
  } as unknown as Db
}

function makePgBoss(): {
  schedule: ReturnType<typeof vi.fn>
  registerScheduledWorker: ReturnType<typeof vi.fn>
} {
  return {
    schedule: vi.fn().mockResolvedValue(undefined),
    registerScheduledWorker: vi.fn(),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SemanticCacheSweeper', () => {
  let sweeper: SemanticCacheSweeper
  let db: Db

  beforeEach(() => {
    vi.clearAllMocks()
    db = makeDb(3)
    sweeper = new SemanticCacheSweeper(db)
  })

  describe('handle()', () => {
    it('deletes expired rows and returns the deleted count', async () => {
      db = makeDb(5)
      sweeper = new SemanticCacheSweeper(db)

      const result = await sweeper.handle()

      expect(db.delete).toHaveBeenCalledOnce()
      expect(result).toEqual({ deletedCount: 5 })
    })

    it('returns { deletedCount: 0 } when no rows are expired (rowCount 0)', async () => {
      db = makeDb(0)
      sweeper = new SemanticCacheSweeper(db)

      const result = await sweeper.handle()

      expect(result).toEqual({ deletedCount: 0 })
    })

    it('returns { deletedCount: 0 } on DB error (non-fatal)', async () => {
      db = {
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error('db boom')),
        }),
      } as unknown as Db
      sweeper = new SemanticCacheSweeper(db)

      const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

      const result = await sweeper.handle()

      expect(result).toEqual({ deletedCount: 0 })
      expect(errorSpy).toHaveBeenCalledOnce()

      errorSpy.mockRestore()
    })
  })

  describe('registerJob()', () => {
    it('schedules the job with a 5-minute cron and registers a worker', async () => {
      const pgBoss = makePgBoss()

      await sweeper.registerJob(pgBoss as unknown as PgBossService)

      expect(pgBoss.schedule).toHaveBeenCalledOnce()
      expect(pgBoss.schedule).toHaveBeenCalledWith(SEMANTIC_CACHE_SWEEPER_JOB_NAME, '*/5 * * * *')
      expect(pgBoss.registerScheduledWorker).toHaveBeenCalledOnce()
      expect(pgBoss.registerScheduledWorker).toHaveBeenCalledWith(
        SEMANTIC_CACHE_SWEEPER_JOB_NAME,
        expect.any(Function),
      )
    })
  })
})

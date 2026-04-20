import { describe, expect, it, vi } from 'vitest'
import type { Db } from '@future/db'
import { MyDayOrphanSweepJob } from './my-day-orphan-sweep.job'

function makeMockDb(rows: Array<{ task_id: string }>): {
  db: Db
  execute: ReturnType<typeof vi.fn>
} {
  const execute = vi.fn().mockResolvedValue({ rows, rowCount: rows.length })
  const db = { execute } as unknown as Db
  return { db, execute }
}

describe('MyDayOrphanSweepJob', () => {
  it('issues a DELETE against planner.my_day_entry and does not throw when rows are returned', async () => {
    const { db, execute } = makeMockDb([{ task_id: 'a' }, { task_id: 'b' }])
    const job = new MyDayOrphanSweepJob(db)

    await expect(job.handle()).resolves.toBeUndefined()

    expect(execute).toHaveBeenCalledTimes(1)
    const sqlArg = execute.mock.calls[0][0] as { queryChunks: unknown[] }
    // Drizzle sql tag exposes a queryChunks array; we just need to assert the SQL text is present.
    const rendered = JSON.stringify(sqlArg)
    expect(rendered).toContain('DELETE FROM planner.my_day_entry')
    expect(rendered).toContain('NOT EXISTS')
    expect(rendered).toContain('planner.task')
    expect(rendered).toContain('deleted_at IS NULL')
    expect(rendered).toContain('RETURNING')
  })

  it('does not throw when zero rows are returned', async () => {
    const { db, execute } = makeMockDb([])
    const job = new MyDayOrphanSweepJob(db)

    await expect(job.handle()).resolves.toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(1)
  })
})

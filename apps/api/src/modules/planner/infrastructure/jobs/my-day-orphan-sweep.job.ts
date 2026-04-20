import { Inject, Injectable, Logger } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { BASE_DB_TOKEN } from '../../../../common/db/db.module'

/**
 * Daily orphan sweep for `planner.my_day_entry`.
 *
 * Removes rows whose referenced task no longer exists, OR whose referenced task has been
 * soft-deleted (`deleted_at IS NOT NULL`). Runs outside any HTTP request — uses `BASE_DB_TOKEN`
 * (the unscoped pool) and intentionally does NOT filter on `tenant_id`, because orphan cleanup
 * is global. The underlying RLS policies still treat the pool as a trusted superuser context
 * for this kind of maintenance job.
 */
@Injectable()
export class MyDayOrphanSweepJob {
  private readonly logger = new Logger(MyDayOrphanSweepJob.name)

  constructor(@Inject(BASE_DB_TOKEN) private readonly db: Db) {}

  async handle(): Promise<void> {
    const result = await this.db.execute<{ task_id: string }>(sql`
      DELETE FROM planner.my_day_entry e
      WHERE NOT EXISTS (
        SELECT 1 FROM planner.task t
        WHERE t.id = e.task_id
          AND t.deleted_at IS NULL
      )
      RETURNING e.task_id
    `)
    // drizzle's execute returns { rows, rowCount } but rowCount is not always populated for
    // DELETE ... RETURNING; prefer rows.length.
    const deleted = result.rows.length
    this.logger.log(`Swept ${deleted} orphan my_day_entry row(s)`)
  }
}

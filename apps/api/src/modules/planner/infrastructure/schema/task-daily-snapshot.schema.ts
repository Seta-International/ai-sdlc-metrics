import { date, integer, jsonb, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'
import { plannerSchema } from './planner.schema'

export const plannerTaskDailySnapshot = plannerSchema.table(
  'task_daily_snapshot',
  {
    tenantId: uuid('tenant_id').notNull(),
    planId: uuid('plan_id').notNull(),
    snapshotDate: date('snapshot_date').notNull(),
    totalCount: integer('total_count').notNull(),
    openCount: integer('open_count').notNull(),
    completedCount: integer('completed_count').notNull(),
    byPriority: jsonb('by_priority')
      .$type<Record<'urgent' | 'important' | 'medium' | 'low', number>>()
      .notNull(),
    byBucket: jsonb('by_bucket').$type<Record<string, number>>().notNull(),
    byAssignee: jsonb('by_assignee')
      .$type<Array<{ actorId: string; open: number; completed: number }>>()
      .notNull(),
    completedInDay: integer('completed_in_day').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.planId, table.snapshotDate] })],
)

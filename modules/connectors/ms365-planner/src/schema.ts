import {
  index,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const connectorMs365PlannerSchema = pgSchema('connector_ms365_planner')

export const plannerTasksCache = connectorMs365PlannerSchema.table(
  'planner_tasks_cache',
  {
    tenantId: uuid('tenant_id').notNull(),
    graphTaskId: text('graph_task_id').notNull(),
    planId: text('plan_id'),
    bucketId: text('bucket_id'),
    title: text('title'),
    percentComplete: smallint('percent_complete'),
    priority: smallint('priority'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    assigneeIds: text('assignee_ids').array(),
    createdBy: text('created_by'),
    createdAtGraph: timestamp('created_at_graph', { withTimezone: true }),
    lastModifiedBy: text('last_modified_by'),
    lastModifiedAtGraph: timestamp('last_modified_at_graph', { withTimezone: true }),
    etag: text('etag'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
    softDeletedAt: timestamp('soft_deleted_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.graphTaskId] }),
    index('planner_tasks_by_plan').on(t.tenantId, t.planId),
    index('planner_tasks_by_due').on(t.tenantId, t.dueDate),
    index('planner_tasks_by_assignees').using('gin', t.assigneeIds),
  ],
)

export const plannerTaskDetailsCache = connectorMs365PlannerSchema.table(
  'planner_task_details_cache',
  {
    tenantId: uuid('tenant_id').notNull(),
    graphTaskId: text('graph_task_id').notNull(),
    description: text('description'),
    checklist: jsonb('checklist').$type<Record<string, unknown>>(),
    references: jsonb('references').$type<Record<string, unknown>>(),
    etag: text('etag'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.graphTaskId] })],
)

export const plannerPlansCache = connectorMs365PlannerSchema.table(
  'planner_plans_cache',
  {
    tenantId: uuid('tenant_id').notNull(),
    graphPlanId: text('graph_plan_id').notNull(),
    ownerGroupId: text('owner_group_id'),
    title: text('title'),
    containerUrl: text('container_url'),
    etag: text('etag'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
    softDeletedAt: timestamp('soft_deleted_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.graphPlanId] })],
)

export const plannerBucketsCache = connectorMs365PlannerSchema.table(
  'planner_buckets_cache',
  {
    tenantId: uuid('tenant_id').notNull(),
    graphBucketId: text('graph_bucket_id').notNull(),
    planId: text('plan_id'),
    name: text('name'),
    orderHint: text('order_hint'),
    etag: text('etag'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
    softDeletedAt: timestamp('soft_deleted_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.graphBucketId] }),
    index('planner_buckets_by_plan').on(t.tenantId, t.planId),
  ],
)

export const syncWatermarks = connectorMs365PlannerSchema.table(
  'sync_watermarks',
  {
    tenantId: uuid('tenant_id').notNull(),
    scopeKind: text('scope_kind').notNull(),
    scopeId: text('scope_id').notNull(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    status: text('status'),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.scopeKind, t.scopeId] })],
)

export type PlannerTaskRow = typeof plannerTasksCache.$inferSelect
export type NewPlannerTask = typeof plannerTasksCache.$inferInsert
export type PlannerTaskDetailsRow = typeof plannerTaskDetailsCache.$inferSelect
export type NewPlannerTaskDetails = typeof plannerTaskDetailsCache.$inferInsert
export type PlannerPlanRow = typeof plannerPlansCache.$inferSelect
export type NewPlannerPlan = typeof plannerPlansCache.$inferInsert
export type PlannerBucketRow = typeof plannerBucketsCache.$inferSelect
export type NewPlannerBucket = typeof plannerBucketsCache.$inferInsert
export type SyncWatermarkRow = typeof syncWatermarks.$inferSelect

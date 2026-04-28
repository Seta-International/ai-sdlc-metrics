import {
  pgSchema,
  uuid,
  text,
  timestamp,
  boolean,
  uniqueIndex,
  index,
  smallint,
  date,
  bigint,
  jsonb,
  check,
  primaryKey,
  integer,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'

export const plannerSchema = pgSchema('planner')

export const plannerPlan = plannerSchema.table(
  'plan',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    containerType: text('container_type'),
    containerRef: text('container_ref'),
    msGroupId: text('ms_group_id'),
    msRosterId: text('ms_roster_id'),
    msPlanId: text('ms_plan_id'),
    msPlanEtag: text('ms_plan_etag'),
    isMsArchived: boolean('is_ms_archived').notNull().default(false),
    ownerActorId: uuid('owner_actor_id'), // nullable — null for team plans, set for personal plans
    syncEnabled: boolean('sync_enabled').notNull().default(true), // true for team; handler overrides to false for personal
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    check('chk_plan_description_length', sql`char_length(${table.description}) <= 32000`),
    check(
      'chk_plan_container_xor',
      sql`(${table.containerType} IS NULL AND ${table.containerRef} IS NULL)
        OR (${table.containerType} = 'future_only' AND ${table.containerRef} IS NULL)
        OR (${table.containerType} = 'ms_group' AND ${table.containerRef} IS NOT NULL)
        OR (${table.containerType} = 'ms_roster' AND ${table.containerRef} IS NOT NULL)`,
    ),
    index('idx_plan_tenant_deleted')
      .on(table.tenantId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_plan_tenant_created_by').on(table.tenantId, table.createdBy),
    uniqueIndex('uq_plan_tenant_ms_plan_id')
      .on(table.tenantId, table.msPlanId)
      .where(sql`${table.msPlanId} IS NOT NULL`),
    index('idx_plan_tenant_owner_actor')
      .on(table.tenantId, table.ownerActorId)
      .where(sql`${table.ownerActorId} IS NOT NULL`),
  ],
)

export const plannerPlanLabel = plannerSchema.table(
  'plan_label',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plannerPlan.id, { onDelete: 'cascade' }),
    slot: text('slot').notNull(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    tenantId: uuid('tenant_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.slot] }),
    check('chk_plan_label_slot', sql`${table.slot} ~ '^category([1-9]|1[0-9]|2[0-5])$'`),
  ],
)

export const plannerPlanMember = plannerSchema.table(
  'plan_member',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plannerPlan.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').notNull(),
    role: text('role').notNull(),
    addedBy: uuid('added_by').notNull(),
    addedAt: timestamp('added_at').notNull().defaultNow(),
    tenantId: uuid('tenant_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.actorId] }),
    index('idx_plan_member_tenant_actor').on(table.tenantId, table.actorId),
  ],
)

export const plannerBucket = plannerSchema.table(
  'bucket',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plannerPlan.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    orderHint: text('order_hint').notNull(),
    msBucketId: text('ms_bucket_id'),
    msBucketEtag: text('ms_bucket_etag'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_bucket_plan_deleted_order')
      .on(table.planId, table.deletedAt, table.orderHint)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex('uq_bucket_tenant_ms_bucket_id')
      .on(table.tenantId, table.msBucketId)
      .where(sql`${table.msBucketId} IS NOT NULL`),
  ],
)

export const plannerTask = plannerSchema.table(
  'task',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plannerPlan.id, { onDelete: 'cascade' }),
    bucketId: uuid('bucket_id')
      .notNull()
      .references(() => plannerBucket.id),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    progress: smallint('progress').notNull().default(0),
    priority: smallint('priority').notNull().default(5),
    startDate: date('start_date'),
    dueDate: date('due_date'),
    orderHint: text('order_hint').notNull(),
    coverAttachmentId: uuid('cover_attachment_id'),
    checklistItemCount: smallint('checklist_item_count').notNull().default(0),
    checklistCheckedCount: smallint('checklist_checked_count').notNull().default(0),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    completedBy: uuid('completed_by'),
    completedAt: timestamp('completed_at'),
    deletedAt: timestamp('deleted_at'),
    msTaskId: text('ms_task_id'),
    msTaskEtag: text('ms_task_etag'),
    msTaskDetailsEtag: text('ms_task_details_etag'),
    msSoftDeletedAt: timestamp('ms_soft_deleted_at', { withTimezone: true }),
    msSyncPushedAt: timestamp('ms_sync_pushed_at', { withTimezone: true }),
    pendingMsAssignments: jsonb('pending_ms_assignments')
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (table) => [
    check('chk_task_progress', sql`${table.progress} IN (0, 50, 100)`),
    check('chk_task_priority', sql`${table.priority} IN (1, 3, 5, 9)`),
    check('chk_task_description_length', sql`char_length(${table.description}) <= 32000`),
    check(
      'chk_task_completion_consistency',
      sql`(${table.progress} = 100 AND ${table.completedAt} IS NOT NULL) OR (${table.progress} < 100 AND ${table.completedAt} IS NULL)`,
    ),
    index('idx_task_tenant_plan_bucket_deleted_order')
      .on(table.tenantId, table.planId, table.bucketId, table.deletedAt, table.orderHint)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_task_tenant_due_date')
      .on(table.tenantId, table.dueDate)
      .where(sql`${table.deletedAt} IS NULL AND ${table.progress} < 100`),
    uniqueIndex('uq_task_tenant_ms_task_id')
      .on(table.tenantId, table.msTaskId)
      .where(sql`${table.msTaskId} IS NOT NULL`),
  ],
)

export const plannerTaskAssignee = plannerSchema.table(
  'task_assignee',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => plannerTask.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').notNull(),
    assignedBy: uuid('assigned_by').notNull(),
    assignedAt: timestamp('assigned_at').notNull().defaultNow(),
    tenantId: uuid('tenant_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.actorId] }),
    index('idx_task_assignee_tenant_actor').on(table.tenantId, table.actorId),
  ],
)

export const plannerTaskAppliedLabel = plannerSchema.table(
  'task_applied_label',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => plannerTask.id, { onDelete: 'cascade' }),
    slot: text('slot').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    planId: uuid('plan_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.slot] }),
    index('idx_task_applied_label_tenant_plan_slot').on(table.tenantId, table.planId, table.slot),
  ],
)

export const plannerTaskChecklistItem = plannerSchema.table(
  'task_checklist_item',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => plannerTask.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    isChecked: boolean('is_checked').notNull().default(false),
    orderHint: text('order_hint').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('idx_task_checklist_item_task_order').on(table.taskId, table.orderHint)],
)

export const plannerTaskAttachment = plannerSchema.table(
  'task_attachment',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => plannerTask.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    storageKey: text('storage_key'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    contentType: text('content_type'),
    filename: text('filename'),
    url: text('url'),
    linkTitle: text('link_title'),
    previewType: text('preview_type'),
    tenantId: uuid('tenant_id').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    msReferenceUrl: text('ms_reference_url'),
    msSharepointDriveId: text('ms_sharepoint_drive_id'),
    msSharepointItemId: text('ms_sharepoint_item_id'),
    msSyncState: text('ms_sync_state').notNull().default('synced'),
  },
  (table) => [
    check(
      'chk_task_attachment_kind_xor',
      sql`(${table.kind} = 'file' AND (${table.storageKey} IS NOT NULL OR ${table.msSyncState} = 'pending_download') AND ${table.url} IS NULL)
        OR (${table.kind} = 'link' AND ${table.url} IS NOT NULL AND ${table.storageKey} IS NULL)`,
    ),
    index('idx_task_attachment_task').on(table.taskId),
  ],
)

export const plannerTaskComment = plannerSchema.table(
  'task_comment',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => plannerTask.id, { onDelete: 'cascade' }),
    authorActorId: uuid('author_actor_id').notNull(),
    body: text('body').notNull(),
    postedAt: timestamp('posted_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
    tenantId: uuid('tenant_id').notNull(),
    msThreadId: text('ms_thread_id'),
    msPostId: text('ms_post_id'),
    msPostEtag: text('ms_post_etag'),
  },
  (table) => [
    check('chk_task_comment_body_length', sql`char_length(${table.body}) <= 4000`),
    index('idx_task_comment_task_posted')
      .on(table.taskId, table.postedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

export const plannerTaskEvidence = plannerSchema.table(
  'task_evidence',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => plannerTask.id, { onDelete: 'cascade' }),
    submittedBy: uuid('submitted_by').notNull(),
    submittedAt: timestamp('submitted_at').notNull().defaultNow(),
    kind: text('kind').notNull(),
    storageKey: text('storage_key'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    contentType: text('content_type'),
    filename: text('filename'),
    url: text('url'),
    linkTitle: text('link_title'),
    body: text('body'),
    caption: text('caption').notNull().default(''),
    verifiedBy: uuid('verified_by'),
    verifiedAt: timestamp('verified_at'),
    verificationNote: text('verification_note'),
    tenantId: uuid('tenant_id').notNull(),
  },
  (table) => [
    check(
      'chk_task_evidence_kind_xor',
      sql`(${table.kind} = 'file' AND ${table.storageKey} IS NOT NULL)
        OR (${table.kind} = 'link' AND ${table.url} IS NOT NULL)
        OR (${table.kind} = 'note' AND ${table.body} IS NOT NULL)`,
    ),
    check('chk_task_evidence_caption_length', sql`char_length(${table.caption}) <= 500`),
    check(
      'chk_task_evidence_body_length',
      sql`${table.body} IS NULL OR char_length(${table.body}) <= 4000`,
    ),
    check(
      'chk_task_evidence_verification_consistency',
      sql`(${table.verifiedBy} IS NULL AND ${table.verifiedAt} IS NULL) OR (${table.verifiedBy} IS NOT NULL AND ${table.verifiedAt} IS NOT NULL)`,
    ),
    index('idx_task_evidence_task_submitted').on(table.taskId, table.submittedAt),
    index('idx_task_evidence_tenant_submitted_by').on(table.tenantId, table.submittedBy),
  ],
)

export const msLinkedRoster = plannerSchema.table(
  'ms_linked_roster',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    msRosterId: text('ms_roster_id').notNull(),
    displayName: text('display_name').notNull(),
    linkedByActorId: uuid('linked_by_actor_id').notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
    syncEnabled: boolean('sync_enabled').notNull().default(true),
    mintedByFutureAt: timestamp('minted_by_future_at', { withTimezone: true }),
    unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('uniq_ms_linked_roster_tenant_msroster').on(t.tenantId, t.msRosterId)],
)

export const rosterMember = plannerSchema.table(
  'roster_member',
  {
    tenantId: uuid('tenant_id').notNull(),
    msRosterId: text('ms_roster_id').notNull(),
    actorId: uuid('actor_id'),
    ssoSubject: text('sso_subject').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.msRosterId, t.ssoSubject] }),
    index('idx_roster_member_lookup').on(t.tenantId, t.msRosterId),
  ],
)

export const msLinkedGroup = plannerSchema.table(
  'ms_linked_group',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    msGroupId: text('ms_group_id').notNull(),
    displayName: text('display_name').notNull(),
    linkedByActorId: uuid('linked_by_actor_id').notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
    syncEnabled: boolean('sync_enabled').notNull().default(true),
    backfillingAt: timestamp('backfilling_at', { withTimezone: true }),
    backfillJobId: text('backfill_job_id'),
    unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('uniq_ms_linked_group_tenant_msgroup').on(t.tenantId, t.msGroupId)],
)

export const msPlanSyncState = plannerSchema.table(
  'ms_plan_sync_state',
  {
    planId: uuid('plan_id').primaryKey().notNull(),
    tenantId: uuid('tenant_id').notNull(),
    msPlanId: text('ms_plan_id').notNull(),
    msPlanEtag: text('ms_plan_etag'),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    lastSuccessfulPollAt: timestamp('last_successful_poll_at', { withTimezone: true }),
    consecutiveErrorCount: integer('consecutive_error_count').notNull().default(0),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    pollPausedUntil: timestamp('poll_paused_until', { withTimezone: true }),
  },
  (t) => [uniqueIndex('uniq_ms_plan_sync_state_tenant_msplan').on(t.tenantId, t.msPlanId)],
)

export const plannerMyDayEntry = plannerSchema.table(
  'my_day_entry',
  {
    actorId: uuid('actor_id').notNull(),
    taskId: uuid('task_id').notNull(),
    addedDate: date('added_date').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    tenantId: uuid('tenant_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.actorId, table.taskId, table.addedDate] }),
    index('idx_my_day_entry_today').on(table.tenantId, table.actorId, table.addedDate),
    index('idx_my_day_entry_task').on(table.taskId),
  ],
)

export const msSyncConflict = plannerSchema.table(
  'ms_sync_conflict',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    kind: text('kind').notNull(),
    taskId: uuid('task_id'),
    planId: uuid('plan_id'),
    field: text('field'),
    mineValue: jsonb('mine_value'),
    theirsValue: jsonb('theirs_value'),
    mineChangedAt: timestamp('mine_changed_at', { withTimezone: true }),
    theirsChangedAt: timestamp('theirs_changed_at', { withTimezone: true }),
    resolution: text('resolution'),
    resolvedByActorId: uuid('resolved_by_actor_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    rawError: jsonb('raw_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_ms_sync_conflict_tenant').on(t.tenantId, t.resolvedAt, t.createdAt)],
)

// Outbox safety net: every planner command that emits an event must insert a row into core.outbox_event.
// Not tested (no eventBus.publish): RequestUploadHandler, SetCoverHandler, RequestEvidenceUploadHandler.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
  truncatePlannerSchema,
} from '@future/db/test-helpers'
import type { Db } from '@future/db'
import type { EventBus } from '@nestjs/cqrs'

import { DrizzleOutboxEventRepository } from '../../kernel/infrastructure/repositories/drizzle-outbox-event.repository'
import { DrizzlePlanRepository } from '../infrastructure/repositories/drizzle-plan.repository'
import { DrizzleBucketRepository } from '../infrastructure/repositories/drizzle-bucket.repository'
import { DrizzleTaskRepository } from '../infrastructure/repositories/drizzle-task.repository'
import { DrizzlePlanMemberRepository } from '../infrastructure/repositories/drizzle-plan-member.repository'
import { DrizzlePlanLabelRepository } from '../infrastructure/repositories/drizzle-plan-label.repository'
import { DrizzleChecklistItemRepository } from '../infrastructure/repositories/drizzle-checklist-item.repository'
import { DrizzleTaskAttachmentRepository } from '../infrastructure/repositories/drizzle-task-attachment.repository'
import { DrizzleTaskCommentRepository } from '../infrastructure/repositories/drizzle-task-comment.repository'
import { DrizzleTaskEvidenceRepository } from '../infrastructure/repositories/drizzle-task-evidence.repository'
import { PlanAuthorizationService } from '../application/services/plan-authorization.service'
import { PlanContainer } from '../domain/value-objects/plan-container.vo'
import { LabelSlot } from '../domain/value-objects/label-slot.vo'

// Plans
import { CreatePlanHandler } from '../application/commands/plans/create-plan.handler'
import { CreatePlanCommand } from '../application/commands/plans/create-plan.command'
import { RenamePlanHandler } from '../application/commands/plans/rename-plan.handler'
import { RenamePlanCommand } from '../application/commands/plans/rename-plan.command'
import { DeletePlanHandler } from '../application/commands/plans/delete-plan.handler'
import { DeletePlanCommand } from '../application/commands/plans/delete-plan.command'
import { AddPlanMemberHandler } from '../application/commands/plans/add-plan-member.handler'
import { AddPlanMemberCommand } from '../application/commands/plans/add-plan-member.command'
import { RemovePlanMemberHandler } from '../application/commands/plans/remove-plan-member.handler'
import { RemovePlanMemberCommand } from '../application/commands/plans/remove-plan-member.command'
import { RenamePlanLabelHandler } from '../application/commands/plans/rename-plan-label.handler'
import { RenamePlanLabelCommand } from '../application/commands/plans/rename-plan-label.command'
import { RecolorPlanLabelHandler } from '../application/commands/plans/recolor-plan-label.handler'
import { RecolorPlanLabelCommand } from '../application/commands/plans/recolor-plan-label.command'

// Buckets
import { CreateBucketHandler } from '../application/commands/buckets/create-bucket.handler'
import { CreateBucketCommand } from '../application/commands/buckets/create-bucket.command'
import { RenameBucketHandler } from '../application/commands/buckets/rename-bucket.handler'
import { RenameBucketCommand } from '../application/commands/buckets/rename-bucket.command'
import { ReorderBucketHandler } from '../application/commands/buckets/reorder-bucket.handler'
import { ReorderBucketCommand } from '../application/commands/buckets/reorder-bucket.command'
import { DeleteBucketHandler } from '../application/commands/buckets/delete-bucket.handler'
import { DeleteBucketCommand } from '../application/commands/buckets/delete-bucket.command'

// Tasks
import { CreateTaskHandler } from '../application/commands/tasks/create-task.handler'
import { CreateTaskCommand } from '../application/commands/tasks/create-task.command'
import { UpdateTaskHandler } from '../application/commands/tasks/update-task.handler'
import { UpdateTaskCommand } from '../application/commands/tasks/update-task.command'
import { MoveTaskHandler } from '../application/commands/tasks/move-task.handler'
import { MoveTaskCommand } from '../application/commands/tasks/move-task.command'
import { SetTaskProgressHandler } from '../application/commands/tasks/set-task-progress.handler'
import { SetTaskProgressCommand } from '../application/commands/tasks/set-task-progress.command'
import { SetTaskPriorityHandler } from '../application/commands/tasks/set-task-priority.handler'
import { SetTaskPriorityCommand } from '../application/commands/tasks/set-task-priority.command'
import { SetTaskDatesHandler } from '../application/commands/tasks/set-task-dates.handler'
import { SetTaskDatesCommand } from '../application/commands/tasks/set-task-dates.command'
import { AssignTaskHandler } from '../application/commands/tasks/assign-task.handler'
import { AssignTaskCommand } from '../application/commands/tasks/assign-task.command'
import { UnassignTaskHandler } from '../application/commands/tasks/unassign-task.handler'
import { UnassignTaskCommand } from '../application/commands/tasks/unassign-task.command'
import { ApplyLabelHandler } from '../application/commands/tasks/apply-label.handler'
import { ApplyLabelCommand } from '../application/commands/tasks/apply-label.command'
import { RemoveLabelHandler } from '../application/commands/tasks/remove-label.handler'
import { RemoveLabelCommand } from '../application/commands/tasks/remove-label.command'
import { DeleteTaskHandler } from '../application/commands/tasks/delete-task.handler'
import { DeleteTaskCommand } from '../application/commands/tasks/delete-task.command'

// Checklist
import { AddChecklistItemHandler } from '../application/commands/checklist/add-checklist-item.handler'
import { AddChecklistItemCommand } from '../application/commands/checklist/add-checklist-item.command'
import { ToggleChecklistItemHandler } from '../application/commands/checklist/toggle-checklist-item.handler'
import { ToggleChecklistItemCommand } from '../application/commands/checklist/toggle-checklist-item.command'
import { UpdateChecklistItemHandler } from '../application/commands/checklist/update-checklist-item.handler'
import { UpdateChecklistItemCommand } from '../application/commands/checklist/update-checklist-item.command'
import { RemoveChecklistItemHandler } from '../application/commands/checklist/remove-checklist-item.handler'
import { RemoveChecklistItemCommand } from '../application/commands/checklist/remove-checklist-item.command'
import { ReorderChecklistItemHandler } from '../application/commands/checklist/reorder-checklist-item.handler'
import { ReorderChecklistItemCommand } from '../application/commands/checklist/reorder-checklist-item.command'

// Attachments
import { FinalizeUploadHandler } from '../application/commands/attachments/finalize-upload.handler'
import { FinalizeUploadCommand } from '../application/commands/attachments/finalize-upload.command'
import { AddLinkHandler } from '../application/commands/attachments/add-link.handler'
import { AddLinkCommand } from '../application/commands/attachments/add-link.command'
import { RemoveAttachmentHandler } from '../application/commands/attachments/remove.handler'
import { RemoveAttachmentCommand } from '../application/commands/attachments/remove.command'

// Comments
import { PostCommentHandler } from '../application/commands/comments/post-comment.handler'
import { PostCommentCommand } from '../application/commands/comments/post-comment.command'
import { DeleteCommentHandler } from '../application/commands/comments/delete-comment.handler'
import { DeleteCommentCommand } from '../application/commands/comments/delete-comment.command'

// Evidence
import { FinalizeEvidenceUploadHandler } from '../application/commands/evidence/finalize-upload.handler'
import { FinalizeEvidenceUploadCommand } from '../application/commands/evidence/finalize-upload.command'
import { CreateEvidenceLinkHandler } from '../application/commands/evidence/create-link.handler'
import { CreateEvidenceLinkCommand } from '../application/commands/evidence/create-link.command'
import { CreateEvidenceNoteHandler } from '../application/commands/evidence/create-note.handler'
import { CreateEvidenceNoteCommand } from '../application/commands/evidence/create-note.command'
import { RemoveEvidenceHandler } from '../application/commands/evidence/remove-evidence.handler'
import { RemoveEvidenceCommand } from '../application/commands/evidence/remove-evidence.command'

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7fff-8000-000000099001'
const ACTOR_ID = uuidv7()
const OTHER_ACTOR_ID = uuidv7()
const CONTAINER = PlanContainer.of({ type: 'none' })

// ─── Outbox-capturing EventBus ────────────────────────────────────────────────

function makeOutboxEventBus(outboxRepo: DrizzleOutboxEventRepository): EventBus {
  return {
    publish: vi.fn().mockImplementation(async (event: unknown) => {
      const ctor = (event as object).constructor as { eventName?: string }
      const eventName = ctor.eventName
      if (!eventName) return
      const payload = { ...(event as Record<string, unknown>) }
      await outboxRepo.insert({ tenantId: TENANT_ID, eventName, payload })
    }),
  } as unknown as EventBus
}

function makeAuthSvc(): PlanAuthorizationService {
  return {
    assertCanCreatePlan: vi.fn().mockResolvedValue(undefined),
    assertCanReadPlan: vi.fn().mockResolvedValue(undefined),
    assertCanEditPlan: vi.fn().mockResolvedValue(undefined),
    assertCanAdminPlan: vi.fn().mockResolvedValue(undefined),
    assertCanManageMembers: vi.fn().mockResolvedValue(undefined),
    assertCanUpdateOwnTaskProgress: vi.fn().mockResolvedValue(undefined),
    assertCanDeleteTask: vi.fn().mockResolvedValue(undefined),
    assertIsPlanMember: vi.fn().mockResolvedValue(undefined),
  } as unknown as PlanAuthorizationService
}

function makeStorageClient() {
  return {
    getUploadUrl: vi.fn().mockResolvedValue({
      url: 'https://s3.example.com/upload-url',
      expiresAt: new Date(Date.now() + 900_000),
    }),
    headObject: vi.fn().mockResolvedValue({
      contentType: 'application/octet-stream',
      sizeBytes: 1024,
    }),
    getDownloadUrl: vi.fn().mockResolvedValue('https://s3.example.com/download-url'),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  }
}

// Truncates task.updated_at to ms precision to avoid sub-ms OCC failures in checklist handlers.
async function taskVersion(db: Db, taskId: string): Promise<string> {
  await db.execute(
    sql`UPDATE planner.task
        SET updated_at = date_trunc('milliseconds', updated_at)
        WHERE id = ${taskId}`,
  )
  const result = await db.execute<{ v: string }>(
    sql`SELECT TO_CHAR(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS v
        FROM planner.task WHERE id = ${taskId}`,
  )
  return result.rows[0]!.v
}

// ─── Outbox query helper ──────────────────────────────────────────────────────

async function latestOutboxRow(
  db: Db,
  eventName: string,
): Promise<{ eventName: string; payload: Record<string, unknown> } | null> {
  const result = await db.execute<{ event_name: string; payload: Record<string, unknown> }>(
    sql`SELECT event_name, payload
        FROM core.outbox_event
        WHERE tenant_id = ${TENANT_ID}
          AND event_name = ${eventName}
        ORDER BY created_at DESC
        LIMIT 1`,
  )
  const row = result.rows[0]
  if (!row) return null
  return { eventName: row.event_name, payload: row.payload }
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Planner outbox events — integration', () => {
  const db = createTestDb() as Db

  let planRepo: DrizzlePlanRepository
  let bucketRepo: DrizzleBucketRepository
  let taskRepo: DrizzleTaskRepository
  let memberRepo: DrizzlePlanMemberRepository
  let labelRepo: DrizzlePlanLabelRepository
  let checklistRepo: DrizzleChecklistItemRepository
  let attachmentRepo: DrizzleTaskAttachmentRepository
  let commentRepo: DrizzleTaskCommentRepository
  let evidenceRepo: DrizzleTaskEvidenceRepository
  let outboxRepo: DrizzleOutboxEventRepository

  /** planId shared across most test cases; created once in beforeAll. */
  let planId: string
  /** bucketId for the default "To do" bucket. */
  let bucketId: string

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await db.execute(sql`DELETE FROM core.outbox_event WHERE tenant_id = ${TENANT_ID}`)
    await seedTenant(db, { id: TENANT_ID, slug: 'planner-outbox-int-tenant' })
    await setTenantContext(db, TENANT_ID)

    planRepo = new DrizzlePlanRepository(db as never)
    bucketRepo = new DrizzleBucketRepository(db as never)
    taskRepo = new DrizzleTaskRepository(db as never)
    memberRepo = new DrizzlePlanMemberRepository(db as never)
    labelRepo = new DrizzlePlanLabelRepository(db as never)
    checklistRepo = new DrizzleChecklistItemRepository(db as never)
    attachmentRepo = new DrizzleTaskAttachmentRepository(db as never)
    commentRepo = new DrizzleTaskCommentRepository(db as never)
    evidenceRepo = new DrizzleTaskEvidenceRepository(db as never)
    outboxRepo = new DrizzleOutboxEventRepository(db as never)

    // Seed the shared plan used by most handlers
    planId = uuidv7()
    bucketId = uuidv7()
    const createHandler = new CreatePlanHandler(
      planRepo,
      bucketRepo,
      memberRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await createHandler.execute(
      new CreatePlanCommand(
        TENANT_ID,
        planId,
        'Outbox Test Plan',
        null,
        CONTAINER,
        ACTOR_ID,
        bucketId,
      ),
    )

    // Seed a plan label slot so ApplyLabel / RemoveLabel can work
    await db.execute(
      sql`INSERT INTO planner.plan_label (plan_id, slot, name, color, tenant_id)
          VALUES (${planId}, 'category1', 'Bug', '#EF4444', ${TENANT_ID})
          ON CONFLICT (plan_id, slot) DO NOTHING`,
    )
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await db.execute(sql`DELETE FROM core.outbox_event WHERE tenant_id = ${TENANT_ID}`)
  })

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Creates a fresh task and returns its id and current version string. */
  async function createTask(title: string): Promise<{ taskId: string; version: string }> {
    const taskId = uuidv7()
    const handler = new CreateTaskHandler(taskRepo, makeAuthSvc(), makeOutboxEventBus(outboxRepo))
    await handler.execute(
      new CreateTaskCommand(TENANT_ID, planId, bucketId, taskId, title, ACTOR_ID),
    )
    const saved = await taskRepo.findById(taskId, TENANT_ID)
    return { taskId, version: saved!.updatedAt.toISOString() }
  }

  // ── Plans ─────────────────────────────────────────────────────────────────────

  it('CreatePlanHandler → planner.plan-created', async () => {
    const newPlanId = uuidv7()
    const handler = new CreatePlanHandler(
      planRepo,
      bucketRepo,
      memberRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new CreatePlanCommand(TENANT_ID, newPlanId, 'New Plan', null, CONTAINER, ACTOR_ID, uuidv7()),
    )

    const row = await latestOutboxRow(db, 'planner.plan-created')
    expect(row).not.toBeNull()
    expect(row!.eventName).toBe('planner.plan-created')
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.planId).toBe(newPlanId)
  })

  it('RenamePlanHandler → planner.plan-renamed', async () => {
    const handler = new RenamePlanHandler(planRepo, makeAuthSvc(), makeOutboxEventBus(outboxRepo))
    await handler.execute(new RenamePlanCommand(TENANT_ID, planId, 'Renamed Plan', ACTOR_ID))

    const row = await latestOutboxRow(db, 'planner.plan-renamed')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.planId).toBe(planId)
  })

  it('AddPlanMemberHandler → planner.plan-member-added', async () => {
    const handler = new AddPlanMemberHandler(
      planRepo,
      memberRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new AddPlanMemberCommand(TENANT_ID, planId, ACTOR_ID, OTHER_ACTOR_ID, 'editor'),
    )

    const row = await latestOutboxRow(db, 'planner.plan-member-added')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.planId).toBe(planId)
    expect(row!.payload.targetActorId).toBe(OTHER_ACTOR_ID)
  })

  it('RemovePlanMemberHandler → planner.plan-member-removed', async () => {
    const handler = new RemovePlanMemberHandler(
      planRepo,
      memberRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(new RemovePlanMemberCommand(TENANT_ID, planId, ACTOR_ID, OTHER_ACTOR_ID))

    const row = await latestOutboxRow(db, 'planner.plan-member-removed')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.planId).toBe(planId)
    expect(row!.payload.targetActorId).toBe(OTHER_ACTOR_ID)
  })

  it('RenamePlanLabelHandler → planner.plan-label-updated', async () => {
    const handler = new RenamePlanLabelHandler(
      planRepo,
      labelRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    const slot = LabelSlot.of('category1')
    await handler.execute(
      new RenamePlanLabelCommand(TENANT_ID, planId, ACTOR_ID, slot, 'Critical Bug'),
    )

    const row = await latestOutboxRow(db, 'planner.plan-label-updated')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.planId).toBe(planId)
    expect(row!.payload.slot).toBe('category1')
  })

  it('RecolorPlanLabelHandler → planner.plan-label-updated', async () => {
    const handler = new RecolorPlanLabelHandler(
      planRepo,
      labelRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    const slot = LabelSlot.of('category1')
    await handler.execute(
      new RecolorPlanLabelCommand(TENANT_ID, planId, ACTOR_ID, slot, 'Critical Bug', '#FF0000'),
    )

    const row = await latestOutboxRow(db, 'planner.plan-label-updated')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.planId).toBe(planId)
    expect(row!.payload.slot).toBe('category1')
  })

  // ── Buckets ───────────────────────────────────────────────────────────────────

  it('CreateBucketHandler → planner.bucket-created', async () => {
    const newBucketId = uuidv7()
    const handler = new CreateBucketHandler(
      bucketRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new CreateBucketCommand(TENANT_ID, planId, newBucketId, 'In Progress', ACTOR_ID),
    )

    const row = await latestOutboxRow(db, 'planner.bucket-created')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.planId).toBe(planId)
    expect(row!.payload.bucketId).toBe(newBucketId)
  })

  it('RenameBucketHandler → planner.bucket-renamed', async () => {
    const handler = new RenameBucketHandler(
      bucketRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new RenameBucketCommand(TENANT_ID, planId, bucketId, 'Todo (renamed)', ACTOR_ID),
    )

    const row = await latestOutboxRow(db, 'planner.bucket-renamed')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.bucketId).toBe(bucketId)
  })

  it('ReorderBucketHandler → planner.bucket-reordered', async () => {
    const handler = new ReorderBucketHandler(
      bucketRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new ReorderBucketCommand(TENANT_ID, planId, bucketId, ACTOR_ID, undefined, undefined),
    )

    const row = await latestOutboxRow(db, 'planner.bucket-reordered')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.bucketId).toBe(bucketId)
  })

  it('DeleteBucketHandler → planner.bucket-deleted', async () => {
    // Create a separate bucket to delete so we don't destroy the shared one
    const deletableBucketId = uuidv7()
    const createBucket = new CreateBucketHandler(
      bucketRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await createBucket.execute(
      new CreateBucketCommand(TENANT_ID, planId, deletableBucketId, 'To Delete', ACTOR_ID),
    )

    const handler = new DeleteBucketHandler(
      bucketRepo,
      taskRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(new DeleteBucketCommand(TENANT_ID, planId, deletableBucketId, ACTOR_ID))

    const row = await latestOutboxRow(db, 'planner.bucket-deleted')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.bucketId).toBe(deletableBucketId)
  })

  // ── Tasks ─────────────────────────────────────────────────────────────────────

  it('CreateTaskHandler → planner.task-created', async () => {
    const taskId = uuidv7()
    const handler = new CreateTaskHandler(taskRepo, makeAuthSvc(), makeOutboxEventBus(outboxRepo))
    await handler.execute(
      new CreateTaskCommand(TENANT_ID, planId, bucketId, taskId, 'New Task', ACTOR_ID),
    )

    const row = await latestOutboxRow(db, 'planner.task-created')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
  })

  it('UpdateTaskHandler → planner.task-updated', async () => {
    const { taskId, version } = await createTask('Task for UpdateTask')
    const handler = new UpdateTaskHandler(taskRepo, makeAuthSvc(), makeOutboxEventBus(outboxRepo))
    await handler.execute(
      new UpdateTaskCommand(TENANT_ID, planId, taskId, ACTOR_ID, version, 'Updated Title'),
    )

    const row = await latestOutboxRow(db, 'planner.task-updated')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
  })

  it('MoveTaskHandler → planner.task-moved', async () => {
    // Create a second bucket to move into
    const targetBucketId = uuidv7()
    const createBucket = new CreateBucketHandler(
      bucketRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await createBucket.execute(
      new CreateBucketCommand(TENANT_ID, planId, targetBucketId, 'Target', ACTOR_ID),
    )

    const { taskId, version } = await createTask('Task for MoveTask')
    const handler = new MoveTaskHandler(taskRepo, makeAuthSvc(), makeOutboxEventBus(outboxRepo))
    await handler.execute(
      new MoveTaskCommand(TENANT_ID, planId, taskId, ACTOR_ID, version, targetBucketId),
    )

    const row = await latestOutboxRow(db, 'planner.task-moved')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.toBucketId).toBe(targetBucketId)
  })

  it('SetTaskProgressHandler(50) → planner.task-progress-set', async () => {
    const { taskId, version } = await createTask('Task for SetProgress')
    const handler = new SetTaskProgressHandler(
      taskRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new SetTaskProgressCommand(TENANT_ID, planId, taskId, ACTOR_ID, version, 50),
    )

    const row = await latestOutboxRow(db, 'planner.task-progress-set')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.progress).toBe(50)
  })

  it('SetTaskProgressHandler(100) → planner.task-completed', async () => {
    const { taskId, version } = await createTask('Task for SetProgress(100)')
    const handler = new SetTaskProgressHandler(
      taskRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new SetTaskProgressCommand(TENANT_ID, planId, taskId, ACTOR_ID, version, 100),
    )

    const row = await latestOutboxRow(db, 'planner.task-completed')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
  })

  it('SetTaskProgressHandler(0 after complete) → planner.task-reopened', async () => {
    // Complete the task first
    const { taskId, version } = await createTask('Task for Reopen')
    const progressHandler = new SetTaskProgressHandler(
      taskRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await progressHandler.execute(
      new SetTaskProgressCommand(TENANT_ID, planId, taskId, ACTOR_ID, version, 100),
    )

    // Now reopen it
    const saved = await taskRepo.findById(taskId, TENANT_ID)
    const handler = new SetTaskProgressHandler(
      taskRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new SetTaskProgressCommand(
        TENANT_ID,
        planId,
        taskId,
        ACTOR_ID,
        saved!.updatedAt.toISOString(),
        0,
      ),
    )

    const row = await latestOutboxRow(db, 'planner.task-reopened')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
  })

  it('SetTaskPriorityHandler → planner.task-updated', async () => {
    const { taskId, version } = await createTask('Task for SetPriority')
    const handler = new SetTaskPriorityHandler(
      taskRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new SetTaskPriorityCommand(TENANT_ID, planId, taskId, ACTOR_ID, version, 9),
    )

    const row = await latestOutboxRow(db, 'planner.task-updated')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
  })

  it('SetTaskDatesHandler → planner.task-updated', async () => {
    const { taskId, version } = await createTask('Task for SetDates')
    const handler = new SetTaskDatesHandler(taskRepo, makeAuthSvc(), makeOutboxEventBus(outboxRepo))
    await handler.execute(
      new SetTaskDatesCommand(
        TENANT_ID,
        planId,
        taskId,
        ACTOR_ID,
        version,
        new Date('2026-01-01'),
        new Date('2026-12-31'),
      ),
    )

    const row = await latestOutboxRow(db, 'planner.task-updated')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
  })

  it('AssignTaskHandler → planner.task-assigned', async () => {
    const { taskId, version } = await createTask('Task for Assign')
    const handler = new AssignTaskHandler(taskRepo, makeAuthSvc(), makeOutboxEventBus(outboxRepo))
    await handler.execute(
      new AssignTaskCommand(TENANT_ID, planId, taskId, ACTOR_ID, version, OTHER_ACTOR_ID),
    )

    const row = await latestOutboxRow(db, 'planner.task-assigned')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.assigneeId).toBe(OTHER_ACTOR_ID)
  })

  it('UnassignTaskHandler → planner.task-unassigned', async () => {
    // Assign first, then unassign
    const { taskId, version } = await createTask('Task for Unassign')
    const assignHandler = new AssignTaskHandler(
      taskRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await assignHandler.execute(
      new AssignTaskCommand(TENANT_ID, planId, taskId, ACTOR_ID, version, OTHER_ACTOR_ID),
    )

    const afterAssign = await taskRepo.findById(taskId, TENANT_ID)
    const handler = new UnassignTaskHandler(taskRepo, makeAuthSvc(), makeOutboxEventBus(outboxRepo))
    await handler.execute(
      new UnassignTaskCommand(
        TENANT_ID,
        planId,
        taskId,
        ACTOR_ID,
        afterAssign!.updatedAt.toISOString(),
        OTHER_ACTOR_ID,
      ),
    )

    const row = await latestOutboxRow(db, 'planner.task-unassigned')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.assigneeId).toBe(OTHER_ACTOR_ID)
  })

  it('ApplyLabelHandler → planner.task-label-applied', async () => {
    const { taskId, version } = await createTask('Task for ApplyLabel')
    const handler = new ApplyLabelHandler(
      taskRepo,
      planRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new ApplyLabelCommand(TENANT_ID, planId, taskId, ACTOR_ID, version, 'category1'),
    )

    const row = await latestOutboxRow(db, 'planner.task-label-applied')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.slot).toBe('category1')
  })

  it('RemoveLabelHandler → planner.task-label-removed', async () => {
    // Apply label first, then remove
    const { taskId, version } = await createTask('Task for RemoveLabel')
    const applyHandler = new ApplyLabelHandler(
      taskRepo,
      planRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await applyHandler.execute(
      new ApplyLabelCommand(TENANT_ID, planId, taskId, ACTOR_ID, version, 'category1'),
    )

    const afterApplyVersion = await taskVersion(db, taskId)
    const handler = new RemoveLabelHandler(
      taskRepo,
      planRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new RemoveLabelCommand(TENANT_ID, planId, taskId, ACTOR_ID, afterApplyVersion, 'category1'),
    )

    const row = await latestOutboxRow(db, 'planner.task-label-removed')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.slot).toBe('category1')
  })

  it('DeleteTaskHandler → planner.task-deleted', async () => {
    const { taskId } = await createTask('Task for Delete')
    const handler = new DeleteTaskHandler(taskRepo, makeAuthSvc(), makeOutboxEventBus(outboxRepo))
    await handler.execute(new DeleteTaskCommand(TENANT_ID, planId, taskId, ACTOR_ID))

    const row = await latestOutboxRow(db, 'planner.task-deleted')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
  })

  // ── Checklist ─────────────────────────────────────────────────────────────────

  it('AddChecklistItemHandler → planner.checklist-item-added', async () => {
    const { taskId, version } = await createTask('Task for AddChecklist')
    const itemId = uuidv7()
    const handler = new AddChecklistItemHandler(
      taskRepo,
      checklistRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new AddChecklistItemCommand(TENANT_ID, planId, taskId, itemId, ACTOR_ID, version, 'Step 1'),
    )

    const row = await latestOutboxRow(db, 'planner.checklist-item-added')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.itemId).toBe(itemId)
  })

  it('ToggleChecklistItemHandler → planner.checklist-item-toggled', async () => {
    const { taskId, version } = await createTask('Task for ToggleChecklist')
    const itemId = uuidv7()

    // Add item first
    const addHandler = new AddChecklistItemHandler(
      taskRepo,
      checklistRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await addHandler.execute(
      new AddChecklistItemCommand(TENANT_ID, planId, taskId, itemId, ACTOR_ID, version, 'Step'),
    )

    const afterAddVersion = await taskVersion(db, taskId)
    const handler = new ToggleChecklistItemHandler(
      taskRepo,
      checklistRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new ToggleChecklistItemCommand(
        TENANT_ID,
        planId,
        taskId,
        itemId,
        ACTOR_ID,
        afterAddVersion,
        true,
      ),
    )

    const row = await latestOutboxRow(db, 'planner.checklist-item-toggled')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.itemId).toBe(itemId)
    expect(row!.payload.isChecked).toBe(true)
  })

  it('UpdateChecklistItemHandler → planner.checklist-item-updated', async () => {
    const { taskId, version } = await createTask('Task for UpdateChecklist')
    const itemId = uuidv7()

    const addHandler = new AddChecklistItemHandler(
      taskRepo,
      checklistRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await addHandler.execute(
      new AddChecklistItemCommand(
        TENANT_ID,
        planId,
        taskId,
        itemId,
        ACTOR_ID,
        version,
        'Old title',
      ),
    )

    const afterAddVersion = await taskVersion(db, taskId)
    const handler = new UpdateChecklistItemHandler(
      taskRepo,
      checklistRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new UpdateChecklistItemCommand(
        TENANT_ID,
        planId,
        taskId,
        itemId,
        ACTOR_ID,
        afterAddVersion,
        'New title',
      ),
    )

    const row = await latestOutboxRow(db, 'planner.checklist-item-updated')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.itemId).toBe(itemId)
  })

  it('RemoveChecklistItemHandler → planner.checklist-item-removed', async () => {
    const { taskId, version } = await createTask('Task for RemoveChecklist')
    const itemId = uuidv7()

    const addHandler = new AddChecklistItemHandler(
      taskRepo,
      checklistRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await addHandler.execute(
      new AddChecklistItemCommand(
        TENANT_ID,
        planId,
        taskId,
        itemId,
        ACTOR_ID,
        version,
        'To Remove',
      ),
    )

    const afterAddVersion = await taskVersion(db, taskId)
    const handler = new RemoveChecklistItemHandler(
      taskRepo,
      checklistRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new RemoveChecklistItemCommand(TENANT_ID, planId, taskId, itemId, ACTOR_ID, afterAddVersion),
    )

    const row = await latestOutboxRow(db, 'planner.checklist-item-removed')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.itemId).toBe(itemId)
  })

  it('ReorderChecklistItemHandler → planner.checklist-item-reordered', async () => {
    const { taskId, version } = await createTask('Task for ReorderChecklist')
    const itemId = uuidv7()

    const addHandler = new AddChecklistItemHandler(
      taskRepo,
      checklistRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await addHandler.execute(
      new AddChecklistItemCommand(TENANT_ID, planId, taskId, itemId, ACTOR_ID, version, 'Step'),
    )

    const handler = new ReorderChecklistItemHandler(
      taskRepo,
      checklistRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new ReorderChecklistItemCommand(TENANT_ID, planId, taskId, itemId, ACTOR_ID),
    )

    const row = await latestOutboxRow(db, 'planner.checklist-item-reordered')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.itemId).toBe(itemId)
  })

  // ── Attachments ───────────────────────────────────────────────────────────────

  it('FinalizeUploadHandler → planner.attachment-added', async () => {
    const { taskId } = await createTask('Task for FinalizeUpload')
    const attachmentId = uuidv7()
    const handler = new FinalizeUploadHandler(
      taskRepo,
      attachmentRepo,
      makeStorageClient() as never,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new FinalizeUploadCommand(
        TENANT_ID,
        planId,
        taskId,
        attachmentId,
        ACTOR_ID,
        `${TENANT_ID}/documents/planner/${taskId}/report.pdf`,
        'report.pdf',
        'application/pdf',
        1024,
      ),
    )

    const row = await latestOutboxRow(db, 'planner.attachment-added')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.attachmentId).toBe(attachmentId)
    expect(row!.payload.kind).toBe('file')
  })

  it('AddLinkHandler → planner.attachment-added', async () => {
    const { taskId } = await createTask('Task for AddLink')
    const attachmentId = uuidv7()
    const handler = new AddLinkHandler(
      taskRepo,
      attachmentRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new AddLinkCommand(
        TENANT_ID,
        planId,
        taskId,
        attachmentId,
        ACTOR_ID,
        'https://example.com/doc',
        'Example Doc',
      ),
    )

    const row = await latestOutboxRow(db, 'planner.attachment-added')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.attachmentId).toBe(attachmentId)
    expect(row!.payload.kind).toBe('link')
  })

  it('RemoveAttachmentHandler → planner.attachment-removed', async () => {
    // Seed a link attachment to remove
    const { taskId } = await createTask('Task for RemoveAttachment')
    const attachmentId = uuidv7()
    const addHandler = new AddLinkHandler(
      taskRepo,
      attachmentRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await addHandler.execute(
      new AddLinkCommand(
        TENANT_ID,
        planId,
        taskId,
        attachmentId,
        ACTOR_ID,
        'https://example.com/to-remove',
        'Link to Remove',
      ),
    )

    const afterAdd = await taskRepo.findById(taskId, TENANT_ID)
    const handler = new RemoveAttachmentHandler(
      taskRepo,
      attachmentRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new RemoveAttachmentCommand(
        TENANT_ID,
        planId,
        taskId,
        attachmentId,
        ACTOR_ID,
        afterAdd!.updatedAt.toISOString(),
      ),
    )

    const row = await latestOutboxRow(db, 'planner.attachment-removed')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.attachmentId).toBe(attachmentId)
  })

  // ── Comments ──────────────────────────────────────────────────────────────────

  it('PostCommentHandler → planner.task-comment-posted', async () => {
    const { taskId } = await createTask('Task for PostComment')
    const commentId = uuidv7()
    const handler = new PostCommentHandler(
      commentRepo,
      taskRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new PostCommentCommand(TENANT_ID, planId, taskId, commentId, ACTOR_ID, 'LGTM!'),
    )

    const row = await latestOutboxRow(db, 'planner.task-comment-posted')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.commentId).toBe(commentId)
  })

  it('DeleteCommentHandler → planner.task-comment-deleted', async () => {
    // Post a comment first, then delete it
    const { taskId } = await createTask('Task for DeleteComment')
    const commentId = uuidv7()
    const postHandler = new PostCommentHandler(
      commentRepo,
      taskRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await postHandler.execute(
      new PostCommentCommand(TENANT_ID, planId, taskId, commentId, ACTOR_ID, 'Delete me'),
    )

    const handler = new DeleteCommentHandler(
      commentRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(new DeleteCommentCommand(TENANT_ID, planId, taskId, commentId, ACTOR_ID))

    const row = await latestOutboxRow(db, 'planner.task-comment-deleted')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.commentId).toBe(commentId)
  })

  // ── Evidence ──────────────────────────────────────────────────────────────────

  it('FinalizeEvidenceUploadHandler → planner.evidence-added', async () => {
    const { taskId } = await createTask('Task for EvidenceUpload')
    const evidenceId = uuidv7()
    const handler = new FinalizeEvidenceUploadHandler(
      taskRepo,
      evidenceRepo,
      makeStorageClient() as never,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new FinalizeEvidenceUploadCommand(
        TENANT_ID,
        planId,
        taskId,
        evidenceId,
        ACTOR_ID,
        `${TENANT_ID}/documents/planner-evidence/${taskId}/screenshot.png`,
        'screenshot.png',
        'image/png',
        512,
        'Before state',
      ),
    )

    const row = await latestOutboxRow(db, 'planner.evidence-added')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.evidenceId).toBe(evidenceId)
    expect(row!.payload.kind).toBe('file')
  })

  it('CreateEvidenceLinkHandler → planner.evidence-added', async () => {
    const { taskId } = await createTask('Task for EvidenceLink')
    const evidenceId = uuidv7()
    const handler = new CreateEvidenceLinkHandler(
      taskRepo,
      evidenceRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new CreateEvidenceLinkCommand(
        TENANT_ID,
        planId,
        taskId,
        evidenceId,
        ACTOR_ID,
        'https://example.com/evidence',
        'Evidence caption',
        'Link Title',
      ),
    )

    const row = await latestOutboxRow(db, 'planner.evidence-added')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.evidenceId).toBe(evidenceId)
    expect(row!.payload.kind).toBe('link')
  })

  it('CreateEvidenceNoteHandler → planner.evidence-added', async () => {
    const { taskId } = await createTask('Task for EvidenceNote')
    const evidenceId = uuidv7()
    const handler = new CreateEvidenceNoteHandler(
      taskRepo,
      evidenceRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new CreateEvidenceNoteCommand(
        TENANT_ID,
        planId,
        taskId,
        evidenceId,
        ACTOR_ID,
        'Note caption',
        'The evidence body text',
      ),
    )

    const row = await latestOutboxRow(db, 'planner.evidence-added')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.evidenceId).toBe(evidenceId)
    expect(row!.payload.kind).toBe('note')
  })

  it('RemoveEvidenceHandler → planner.evidence-removed', async () => {
    const { taskId } = await createTask('Task for RemoveEvidence')
    const evidenceId = uuidv7()

    // Seed a link evidence to remove
    const createHandler = new CreateEvidenceLinkHandler(
      taskRepo,
      evidenceRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await createHandler.execute(
      new CreateEvidenceLinkCommand(
        TENANT_ID,
        planId,
        taskId,
        evidenceId,
        ACTOR_ID,
        'https://example.com/to-remove',
        'Caption',
        undefined,
      ),
    )

    const handler = new RemoveEvidenceHandler(
      taskRepo,
      evidenceRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await handler.execute(
      new RemoveEvidenceCommand(TENANT_ID, planId, taskId, evidenceId, ACTOR_ID),
    )

    const row = await latestOutboxRow(db, 'planner.evidence-removed')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.taskId).toBe(taskId)
    expect(row!.payload.evidenceId).toBe(evidenceId)
  })

  // ── DeletePlanHandler (last — deletes shared plan) ────────────────────────────

  it('DeletePlanHandler → planner.plan-deleted', async () => {
    // Create a dedicated plan to delete so we don't break other tests
    const deletablePlanId = uuidv7()
    const create = new CreatePlanHandler(
      planRepo,
      bucketRepo,
      memberRepo,
      makeAuthSvc(),
      makeOutboxEventBus(outboxRepo),
    )
    await create.execute(
      new CreatePlanCommand(
        TENANT_ID,
        deletablePlanId,
        'To Delete',
        null,
        CONTAINER,
        ACTOR_ID,
        uuidv7(),
      ),
    )

    const handler = new DeletePlanHandler(planRepo, makeAuthSvc(), makeOutboxEventBus(outboxRepo))
    await handler.execute(new DeletePlanCommand(TENANT_ID, deletablePlanId, ACTOR_ID))

    const row = await latestOutboxRow(db, 'planner.plan-deleted')
    expect(row).not.toBeNull()
    expect(row!.payload.tenantId).toBe(TENANT_ID)
    expect(row!.payload.actorId).toBe(ACTOR_ID)
    expect(row!.payload.planId).toBe(deletablePlanId)
  })
})

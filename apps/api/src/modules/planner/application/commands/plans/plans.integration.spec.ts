import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
import { EventBus } from '@nestjs/cqrs'
import { PlanContainer } from '../../../domain/value-objects/plan-container.vo'
import { LabelSlot } from '../../../domain/value-objects/label-slot.vo'
import { DrizzlePlanRepository } from '../../../infrastructure/repositories/drizzle-plan.repository'
import { DrizzleBucketRepository } from '../../../infrastructure/repositories/drizzle-bucket.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CreatePlanHandler } from './create-plan.handler'
import { CreatePlanCommand } from './create-plan.command'
import { RenamePlanHandler } from './rename-plan.handler'
import { RenamePlanCommand } from './rename-plan.command'
import { DeletePlanHandler } from './delete-plan.handler'
import { DeletePlanCommand } from './delete-plan.command'
import { AddPlanMemberHandler } from './add-plan-member.handler'
import { AddPlanMemberCommand } from './add-plan-member.command'
import { RemovePlanMemberHandler } from './remove-plan-member.handler'
import { RemovePlanMemberCommand } from './remove-plan-member.command'
import { RenamePlanLabelHandler } from './rename-plan-label.handler'
import { RenamePlanLabelCommand } from './rename-plan-label.command'
import { RecolorPlanLabelHandler } from './recolor-plan-label.handler'
import { RecolorPlanLabelCommand } from './recolor-plan-label.command'

const TENANT_ID = '01900000-0000-7fff-8000-000000001000'
const ACTOR_ID = uuidv7()
const OTHER_ACTOR_ID = uuidv7()
const CONTAINER = PlanContainer.of({ type: 'none' })

function makeEventBus(): EventBus {
  return { publish: vi.fn().mockResolvedValue(undefined) } as unknown as EventBus
}

function makeAuthSvc(): PlanAuthorizationService {
  return {
    assertCanCreatePlan: vi.fn().mockResolvedValue(undefined),
    assertCanEditPlan: vi.fn().mockResolvedValue(undefined),
    assertCanAdminPlan: vi.fn().mockResolvedValue(undefined),
    assertCanManageMembers: vi.fn().mockResolvedValue(undefined),
  } as unknown as PlanAuthorizationService
}

describe('Plan command handlers — integration', () => {
  const db = createTestDb() as Db
  let planRepo: DrizzlePlanRepository
  let bucketRepo: DrizzleBucketRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'plan-cmd-handlers-tenant' })
    planRepo = new DrizzlePlanRepository(db as never)
    bucketRepo = new DrizzleBucketRepository(db as never)
    await setTenantContext(db, TENANT_ID)
  })

  afterAll(async () => {
    await truncatePlannerSchema(db)
    await truncateCoreSchema(db)
  })

  describe('CreatePlanHandler', () => {
    it('persists plan and "To do" bucket in DB', async () => {
      const planId = uuidv7()
      const bucketId = uuidv7()
      const handler = new CreatePlanHandler(planRepo, bucketRepo, makeAuthSvc(), makeEventBus())

      await handler.execute(
        new CreatePlanCommand(
          TENANT_ID,
          planId,
          'Integration Plan',
          null,
          CONTAINER,
          ACTOR_ID,
          bucketId,
        ),
      )

      const saved = await planRepo.findById(planId, TENANT_ID)
      expect(saved).not.toBeNull()
      expect(saved!.name).toBe('Integration Plan')
      expect(saved!.buckets).toHaveLength(1)
      expect(saved!.buckets[0]!.name).toBe('To do')
    })
  })

  describe('RenamePlanHandler', () => {
    it('persists new name in DB', async () => {
      const planId = uuidv7()
      const bucketId = uuidv7()
      const create = new CreatePlanHandler(planRepo, bucketRepo, makeAuthSvc(), makeEventBus())
      await create.execute(
        new CreatePlanCommand(
          TENANT_ID,
          planId,
          'Before Rename',
          null,
          CONTAINER,
          ACTOR_ID,
          bucketId,
        ),
      )

      const handler = new RenamePlanHandler(planRepo, makeAuthSvc(), makeEventBus())
      await handler.execute(new RenamePlanCommand(TENANT_ID, planId, 'After Rename', ACTOR_ID))

      const saved = await planRepo.findById(planId, TENANT_ID)
      expect(saved!.name).toBe('After Rename')
    })
  })

  describe('DeletePlanHandler', () => {
    it('soft deletes plan — findById returns null', async () => {
      const planId = uuidv7()
      const bucketId = uuidv7()
      const create = new CreatePlanHandler(planRepo, bucketRepo, makeAuthSvc(), makeEventBus())
      await create.execute(
        new CreatePlanCommand(TENANT_ID, planId, 'To Delete', null, CONTAINER, ACTOR_ID, bucketId),
      )

      const handler = new DeletePlanHandler(planRepo, makeAuthSvc(), makeEventBus())
      await handler.execute(new DeletePlanCommand(TENANT_ID, planId, ACTOR_ID))

      const saved = await planRepo.findById(planId, TENANT_ID)
      expect(saved).toBeNull()
    })
  })

  describe('AddPlanMemberHandler', () => {
    it('persists new member in DB', async () => {
      const planId = uuidv7()
      const bucketId = uuidv7()
      const create = new CreatePlanHandler(planRepo, bucketRepo, makeAuthSvc(), makeEventBus())
      await create.execute(
        new CreatePlanCommand(
          TENANT_ID,
          planId,
          'Membership Plan',
          null,
          CONTAINER,
          ACTOR_ID,
          bucketId,
        ),
      )

      const handler = new AddPlanMemberHandler(planRepo, makeAuthSvc(), makeEventBus())
      await handler.execute(
        new AddPlanMemberCommand(TENANT_ID, planId, ACTOR_ID, OTHER_ACTOR_ID, 'editor'),
      )

      const saved = await planRepo.findById(planId, TENANT_ID)
      expect(saved!.members.some((m) => m.actorId === OTHER_ACTOR_ID && m.role === 'editor')).toBe(
        true,
      )
    })
  })

  describe('RemovePlanMemberHandler', () => {
    it('removes member from DB', async () => {
      const planId = uuidv7()
      const bucketId = uuidv7()
      const create = new CreatePlanHandler(planRepo, bucketRepo, makeAuthSvc(), makeEventBus())
      await create.execute(
        new CreatePlanCommand(
          TENANT_ID,
          planId,
          'Remove Member Plan',
          null,
          CONTAINER,
          ACTOR_ID,
          bucketId,
        ),
      )

      const addHandler = new AddPlanMemberHandler(planRepo, makeAuthSvc(), makeEventBus())
      await addHandler.execute(
        new AddPlanMemberCommand(TENANT_ID, planId, ACTOR_ID, OTHER_ACTOR_ID, 'editor'),
      )

      const removeHandler = new RemovePlanMemberHandler(planRepo, makeAuthSvc(), makeEventBus())
      await removeHandler.execute(
        new RemovePlanMemberCommand(TENANT_ID, planId, ACTOR_ID, OTHER_ACTOR_ID),
      )

      const saved = await planRepo.findById(planId, TENANT_ID)
      expect(saved!.members.some((m) => m.actorId === OTHER_ACTOR_ID)).toBe(false)
    })
  })

  describe('RenamePlanLabelHandler', () => {
    it('persists label rename in DB', async () => {
      const planId = uuidv7()
      const bucketId = uuidv7()
      const create = new CreatePlanHandler(planRepo, bucketRepo, makeAuthSvc(), makeEventBus())
      await create.execute(
        new CreatePlanCommand(TENANT_ID, planId, 'Label Plan', null, CONTAINER, ACTOR_ID, bucketId),
      )

      const handler = new RenamePlanLabelHandler(planRepo, makeAuthSvc(), makeEventBus())
      const slot = LabelSlot.of('category1')
      await handler.execute(
        new RenamePlanLabelCommand(TENANT_ID, planId, ACTOR_ID, slot, 'High Priority'),
      )

      const saved = await planRepo.findById(planId, TENANT_ID)
      const label = saved!.labels.find((l) => l.slot.value === 'category1')
      expect(label).toBeDefined()
      expect(label!.name).toBe('High Priority')
      expect(label!.color).toBe('#6B7280')
    })
  })

  describe('RecolorPlanLabelHandler', () => {
    it('persists label color change in DB', async () => {
      const planId = uuidv7()
      const bucketId = uuidv7()
      const create = new CreatePlanHandler(planRepo, bucketRepo, makeAuthSvc(), makeEventBus())
      await create.execute(
        new CreatePlanCommand(
          TENANT_ID,
          planId,
          'Recolor Plan',
          null,
          CONTAINER,
          ACTOR_ID,
          bucketId,
        ),
      )

      const handler = new RecolorPlanLabelHandler(planRepo, makeAuthSvc(), makeEventBus())
      const slot = LabelSlot.of('category2')
      await handler.execute(
        new RecolorPlanLabelCommand(TENANT_ID, planId, ACTOR_ID, slot, 'Critical', '#EF4444'),
      )

      const saved = await planRepo.findById(planId, TENANT_ID)
      const label = saved!.labels.find((l) => l.slot.value === 'category2')
      expect(label).toBeDefined()
      expect(label!.name).toBe('Critical')
      expect(label!.color).toBe('#EF4444')
    })
  })
})

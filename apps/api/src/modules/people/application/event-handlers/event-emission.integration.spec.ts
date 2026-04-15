import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import {
  EmploymentActivatedEvent,
  EmploymentTerminatedEvent,
  JobAssignmentChangedEvent,
} from '@future/event-contracts'
import type { IEmploymentRepository } from '../../domain/repositories/employment.repository'
import type { IOffboardingCaseRepository } from '../../domain/repositories/offboarding-case.repository'
import type { IJobProfileRepository } from '../../domain/repositories/job-profile.repository'
import type { IJobAssignmentRepository } from '../../domain/repositories/job-assignment.repository'
import type { OffboardingTemplateSelectorService } from '../services/offboarding-template-selector.service'

/**
 * These tests verify that command handlers correctly emit domain events.
 * They use direct handler construction with mocked repos and a spy EventBus.
 */

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000002'
const ACTOR_ID = '01900000-0000-7000-8000-000000000003'

describe('Event Emission Integration', () => {
  let eventBus: EventBus

  beforeEach(() => {
    eventBus = {
      publish: vi.fn(),
      publishAll: vi.fn(),
    } as unknown as EventBus
  })

  describe('ActivateEmploymentHandler', () => {
    it('emits EmploymentActivatedEvent after successful activation', async () => {
      const { ActivateEmploymentHandler } = await import('../commands/activate-employment.handler')
      const { ActivateEmploymentCommand } = await import('../commands/activate-employment.command')

      const employmentRepo = {
        findById: vi.fn().mockResolvedValue({
          id: EMPLOYMENT_ID,
          tenantId: TENANT_ID,
          personProfileId: 'profile-1',
          employmentStatus: 'pre_hire',
        }),
        updateStatus: vi.fn(),
        findByPersonProfileId: vi.fn(),
        findActiveByActorId: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        listByTenant: vi.fn(),
        countByTenant: vi.fn(),
      }

      // Constructor: employmentRepo, eventBus
      const handler = new ActivateEmploymentHandler(
        employmentRepo as unknown as IEmploymentRepository,
        eventBus,
      )

      await handler.execute(new ActivateEmploymentCommand(TENANT_ID, EMPLOYMENT_ID, ACTOR_ID))

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          employmentId: EMPLOYMENT_ID,
        }),
      )
      const emittedEvent = vi.mocked(eventBus.publish).mock.calls[0][0]
      expect(emittedEvent).toBeInstanceOf(EmploymentActivatedEvent)
    })
  })

  describe('TerminateEmploymentHandler', () => {
    it('emits EmploymentTerminatedEvent after successful termination', async () => {
      const { TerminateEmploymentHandler } =
        await import('../commands/terminate-employment.handler')
      const { TerminateEmploymentCommand } =
        await import('../commands/terminate-employment.command')

      const employmentRepo = {
        findById: vi.fn().mockResolvedValue({
          id: EMPLOYMENT_ID,
          tenantId: TENANT_ID,
          personProfileId: 'profile-1',
          employmentStatus: 'active',
        }),
        updateStatus: vi.fn(),
        findByPersonProfileId: vi.fn(),
        findActiveByActorId: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        listByTenant: vi.fn(),
        countByTenant: vi.fn(),
      }

      const offboardingCaseRepo = { insert: vi.fn() }
      const offboardingTemplateSelector = { selectTemplate: vi.fn().mockResolvedValue(null) }

      // Constructor: employmentRepo, offboardingCaseRepo, offboardingTemplateSelector, eventBus
      const handler = new TerminateEmploymentHandler(
        employmentRepo as unknown as IEmploymentRepository,
        offboardingCaseRepo as unknown as IOffboardingCaseRepository,
        offboardingTemplateSelector as unknown as OffboardingTemplateSelectorService,
        eventBus,
      )

      // Command: tenantId, employmentId, terminationReason, terminationDate, initiatedBy
      await handler.execute(
        new TerminateEmploymentCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          'voluntary_resignation',
          new Date('2026-06-30'),
          ACTOR_ID,
        ),
      )

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          employmentId: EMPLOYMENT_ID,
          terminationReason: 'voluntary_resignation',
        }),
      )
      const emittedEvent = vi.mocked(eventBus.publish).mock.calls[0][0]
      expect(emittedEvent).toBeInstanceOf(EmploymentTerminatedEvent)
    })
  })

  describe('CreateJobAssignmentHandler', () => {
    it('emits JobAssignmentChangedEvent after creating assignment', async () => {
      const { CreateJobAssignmentHandler } =
        await import('../commands/create-job-assignment.handler')
      const { CreateJobAssignmentCommand } =
        await import('../commands/create-job-assignment.command')

      const employmentRepo = {
        findById: vi.fn().mockResolvedValue({
          id: EMPLOYMENT_ID,
          tenantId: TENANT_ID,
        }),
        findByPersonProfileId: vi.fn(),
        findActiveByActorId: vi.fn(),
        insert: vi.fn(),
        updateStatus: vi.fn(),
        update: vi.fn(),
        listByTenant: vi.fn(),
        countByTenant: vi.fn(),
      }
      const jobProfileRepo = {
        findById: vi.fn().mockResolvedValue({ id: 'new-job', title: 'Lead' }),
        listByTenant: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        countByJobFamilyId: vi.fn(),
      }
      const assignmentRepo = {
        findById: vi.fn(),
        findCurrent: vi.fn().mockResolvedValue({
          id: 'old-assign',
          jobProfileId: 'old-job',
          departmentId: 'old-dept',
          managerId: null,
        }),
        findAsOf: vi.fn(),
        findHistory: vi.fn(),
        insert: vi.fn().mockResolvedValue({ id: 'new-assign' }),
        closeAssignment: vi.fn(),
        delete: vi.fn(),
      }

      // Constructor: employmentRepo, jobProfileRepo, jobAssignmentRepo, eventBus
      const handler = new CreateJobAssignmentHandler(
        employmentRepo as unknown as IEmploymentRepository,
        jobProfileRepo as unknown as IJobProfileRepository,
        assignmentRepo as unknown as IJobAssignmentRepository,
        eventBus,
      )

      // Command: tenantId, employmentId, jobProfileId, effectiveFrom, eventType, createdBy, departmentId?
      await handler.execute(
        new CreateJobAssignmentCommand(
          TENANT_ID,
          EMPLOYMENT_ID,
          'new-job',
          new Date('2026-07-01'),
          'promotion',
          ACTOR_ID,
          'new-dept',
        ),
      )

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          employmentId: EMPLOYMENT_ID,
          eventType: 'promotion',
        }),
      )
      const emittedEvent = vi.mocked(eventBus.publish).mock.calls[0][0]
      expect(emittedEvent).toBeInstanceOf(JobAssignmentChangedEvent)
    })
  })
})

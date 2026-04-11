import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { RejectOffboardingCommand } from './reject-offboarding.command'
import { RejectOffboardingHandler } from './reject-offboarding.handler'
import { OffboardingCaseNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IOffboardingCaseRepository } from '../../domain/repositories/offboarding.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const CASE_ID = '01900000-0000-7000-8000-000000000030'
const REJECTOR_ID = '01900000-0000-7000-8000-000000000005'

describe('RejectOffboardingHandler', () => {
  let handler: RejectOffboardingHandler
  let caseRepo: IOffboardingCaseRepository
  let commandBus: CommandBus

  beforeEach(() => {
    caseRepo = {
      insert: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        id: CASE_ID,
        tenantId: TENANT_ID,
        profileId: '01900000-0000-7000-8000-000000000003',
        status: 'pending',
        reason: 'Resignation',
        reasonCategory: 'voluntary',
        templateId: null,
        decisionCaseId: 'dc-1',
        createdAt: new Date(),
      }),
      findActiveByProfileId: vi.fn(),
      updateStatus: vi.fn(),
      insertTask: vi.fn(),
      getRequiredTasks: vi.fn(),
      updateTaskStatus: vi.fn(),
      findTaskById: vi.fn(),
    } as unknown as IOffboardingCaseRepository
    commandBus = { execute: vi.fn() } as unknown as CommandBus
    handler = new RejectOffboardingHandler(caseRepo, commandBus)
  })

  it('sets case status to rejected and resolves decision case', async () => {
    await handler.execute(
      new RejectOffboardingCommand(TENANT_ID, CASE_ID, REJECTOR_ID, 'Employee withdrew'),
    )

    expect(caseRepo.updateStatus).toHaveBeenCalledWith(CASE_ID, TENANT_ID, 'rejected')
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 'dc-1',
        finalAction: 'rejected',
        decidedBy: REJECTOR_ID,
        comment: 'Employee withdrew',
      }),
    )
  })

  it('throws OffboardingCaseNotFoundException when case not found', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new RejectOffboardingCommand(TENANT_ID, CASE_ID, REJECTOR_ID, 'Employee withdrew'),
      ),
    ).rejects.toThrow(OffboardingCaseNotFoundException)
  })

  it('does not call commandBus.execute when decisionCaseId is null', async () => {
    vi.mocked(caseRepo.findById).mockResolvedValue({
      id: CASE_ID,
      tenantId: TENANT_ID,
      profileId: '01900000-0000-7000-8000-000000000003',
      status: 'pending',
      reason: 'Resignation',
      reasonCategory: 'voluntary',
      templateId: null,
      decisionCaseId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await handler.execute(
      new RejectOffboardingCommand(TENANT_ID, CASE_ID, REJECTOR_ID, 'Employee withdrew'),
    )

    expect(caseRepo.updateStatus).toHaveBeenCalledWith(CASE_ID, TENANT_ID, 'rejected')
    expect(commandBus.execute).not.toHaveBeenCalled()
  })
})

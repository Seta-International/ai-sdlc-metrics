import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { RejectProfileChangeCommand } from './reject-profile-change.command'
import { RejectProfileChangeHandler } from './reject-profile-change.handler'
import { ProfileChangeRequestNotFoundException } from '../../domain/exceptions/people.exceptions'
import { ResolveDecisionCaseCommand } from '../../../kernel/application/commands/resolve-decision-case.command'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const REQUEST_ID = '01900000-0000-7000-8000-000000000010'
const PROFILE_ID = '01900000-0000-7000-8000-000000000003'
const REJECTOR_ID = '01900000-0000-7000-8000-000000000005'
const CASE_ID = '01900000-0000-7000-8000-000000000020'
const COMMENT = 'Does not meet policy requirements'

describe('RejectProfileChangeHandler', () => {
  let handler: RejectProfileChangeHandler
  let changeRequestRepo: IProfileChangeRequestRepository
  let auditRepo: IAuditEventRepository
  let commandBus: CommandBus

  beforeEach(() => {
    changeRequestRepo = {
      findById: vi.fn(),
      findPendingByProfileAndField: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
      listByProfile: vi.fn(),
    }
    auditRepo = { insert: vi.fn() }
    commandBus = { execute: vi.fn() } as unknown as CommandBus
    handler = new RejectProfileChangeHandler(changeRequestRepo, auditRepo, commandBus)
  })

  it('rejects the request and resolves the decision case with comment', async () => {
    vi.mocked(changeRequestRepo.findById).mockResolvedValue({
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      fieldPath: 'detail.bankAccountNumber',
      oldValue: '1234',
      newValue: '5678',
      status: 'pending',
      decisionCaseId: CASE_ID,
      requestedBy: 'req-actor',
      reviewedBy: null,
      createdAt: new Date(),
    })

    await handler.execute(
      new RejectProfileChangeCommand(TENANT_ID, REQUEST_ID, REJECTOR_ID, COMMENT),
    )

    expect(changeRequestRepo.updateStatus).toHaveBeenCalledWith(
      REQUEST_ID,
      TENANT_ID,
      'rejected',
      REJECTOR_ID,
    )
    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(ResolveDecisionCaseCommand))
    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'profile_change_rejected',
        module: 'people',
      }),
    )
  })

  it('does not dispatch ResolveDecisionCaseCommand when decisionCaseId is null', async () => {
    vi.mocked(changeRequestRepo.findById).mockResolvedValue({
      id: REQUEST_ID,
      tenantId: TENANT_ID,
      profileId: PROFILE_ID,
      fieldPath: 'detail.bankAccountNumber',
      oldValue: '1234',
      newValue: '5678',
      status: 'pending',
      decisionCaseId: null,
      requestedBy: 'req-actor',
      reviewedBy: null,
      createdAt: new Date(),
    })

    await handler.execute(
      new RejectProfileChangeCommand(TENANT_ID, REQUEST_ID, REJECTOR_ID, COMMENT),
    )

    expect(commandBus.execute).not.toHaveBeenCalled()
  })

  it('throws ProfileChangeRequestNotFoundException when not found', async () => {
    vi.mocked(changeRequestRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new RejectProfileChangeCommand(TENANT_ID, REQUEST_ID, REJECTOR_ID, COMMENT)),
    ).rejects.toThrow(ProfileChangeRequestNotFoundException)
  })
})

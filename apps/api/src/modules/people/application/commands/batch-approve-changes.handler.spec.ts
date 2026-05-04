import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchApproveChangesCommand } from './batch-approve-changes.command'
import { BatchApproveChangesHandler } from './batch-approve-changes.handler'
import type { IProfileChangeRequestRepository } from '../../domain/repositories/profile-change-request.repository'
import type { ProfileChangeRequest } from '../../domain/entities/profile-change-request.entity'
import { ProfileChangeAppliedEvent } from '@future/event-contracts'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const BATCH_ID = '01900000-0000-7000-8000-000000000099'
const EMPLOYMENT_ID = '01900000-0000-7000-8000-000000000020'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

function makePendingChange(overrides: Partial<ProfileChangeRequest> = {}): ProfileChangeRequest {
  return {
    id: '01900000-0000-7000-8000-000000000030',
    tenantId: TENANT_ID,
    employmentId: EMPLOYMENT_ID,
    batchId: BATCH_ID,
    reason: null,
    fieldPath: 'person_profile.preferred_name',
    oldValue: 'Old',
    newValue: 'New',
    effectiveDate: null,
    status: 'pending',
    requestedBy: ACTOR_ID,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    decisionCaseId: null,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('BatchApproveChangesHandler', () => {
  let changeRepo: IProfileChangeRequestRepository
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    changeRepo = {
      findByBatchId: vi.fn().mockResolvedValue([makePendingChange()]),
      updateStatusByBatchId: vi.fn().mockResolvedValue(undefined),
    } as unknown as IProfileChangeRequestRepository
    eventBus = { publish: vi.fn() }
  })

  it('publishes one ProfileChangeAppliedEvent with all applied changes', async () => {
    const handler = new BatchApproveChangesHandler(changeRepo, eventBus as any)
    await handler.execute(new BatchApproveChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID, 'LGTM'))

    expect(eventBus.publish).toHaveBeenCalledOnce()
    const event = eventBus.publish.mock.calls[0]![0] as ProfileChangeAppliedEvent
    expect(event).toBeInstanceOf(ProfileChangeAppliedEvent)
    expect(event.tenantId).toBe(TENANT_ID)
    expect(event.employmentId).toBe(EMPLOYMENT_ID)
    expect(event.appliedChanges).toEqual([
      { fieldPath: 'person_profile.preferred_name', oldValue: 'Old', newValue: 'New' },
    ])
  })

  it('does not publish when all changes have a future effective date', async () => {
    const future = new Date(Date.now() + 86_400_000)
    changeRepo = {
      findByBatchId: vi.fn().mockResolvedValue([makePendingChange({ effectiveDate: future })]),
      updateStatusByBatchId: vi.fn().mockResolvedValue(undefined),
    } as unknown as IProfileChangeRequestRepository

    const handler = new BatchApproveChangesHandler(changeRepo, eventBus as any)
    await handler.execute(new BatchApproveChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID))
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('throws when no pending changes exist', async () => {
    changeRepo = {
      findByBatchId: vi.fn().mockResolvedValue([]),
      updateStatusByBatchId: vi.fn(),
    } as unknown as IProfileChangeRequestRepository

    const handler = new BatchApproveChangesHandler(changeRepo, eventBus as any)
    await expect(
      handler.execute(new BatchApproveChangesCommand(TENANT_ID, BATCH_ID, ACTOR_ID)),
    ).rejects.toThrow(`No pending changes found in batch ${BATCH_ID}`)
  })
})

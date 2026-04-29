import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ResetStagedMsUserHandler } from './reset-staged-ms-user.handler'
import { ResetStagedMsUserCommand } from './reset-staged-ms-user.command'
import { StagedMsUserNotFoundException } from '../../domain/exceptions/people.exceptions'
import type { IMsStagedUserRepository } from '../../domain/repositories/ms-staged-user.repository'
import type { MsStagedUser } from '../../domain/entities/ms-staged-user.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const STAGED_ID = '01900000-0000-7000-8000-000000000010'

function makeStagedUser(status: MsStagedUser['status'] = 'skipped'): MsStagedUser {
  return {
    id: STAGED_ID,
    tenantId: TENANT_ID,
    msExternalId: 'aad-u1',
    displayName: 'Bob',
    email: null,
    jobTitle: null,
    department: null,
    officeLocation: null,
    mobilePhone: null,
    workPhone: null,
    managerMsId: null,
    photoDocumentId: null,
    status,
    importedEmploymentId: null,
    lastSeenAt: new Date(),
    createdAt: new Date(),
  }
}

describe('ResetStagedMsUserHandler', () => {
  let stagedUserRepo: Partial<IMsStagedUserRepository>

  beforeEach(() => {
    stagedUserRepo = {
      findById: vi.fn().mockResolvedValue(makeStagedUser()),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('throws StagedMsUserNotFoundException when not found', async () => {
    vi.mocked(stagedUserRepo.findById!).mockResolvedValue(null)
    const handler = new ResetStagedMsUserHandler(stagedUserRepo as IMsStagedUserRepository)
    await expect(
      handler.execute(new ResetStagedMsUserCommand(TENANT_ID, STAGED_ID)),
    ).rejects.toThrow(StagedMsUserNotFoundException)
  })

  it('resets a skipped user back to pending', async () => {
    const handler = new ResetStagedMsUserHandler(stagedUserRepo as IMsStagedUserRepository)
    await handler.execute(new ResetStagedMsUserCommand(TENANT_ID, STAGED_ID))
    expect(stagedUserRepo.updateStatus).toHaveBeenCalledWith(STAGED_ID, TENANT_ID, 'pending')
  })
})

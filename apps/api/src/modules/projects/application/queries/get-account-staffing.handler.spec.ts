import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetAccountStaffingQuery } from './get-account-staffing.query'
import { GetAccountStaffingHandler } from './get-account-staffing.handler'
import { AccountNotFoundException } from '../../domain/exceptions/projects.exceptions'
import type { IAccountRepository } from '../../domain/repositories/account.repository.port'
import type { IAllocationRepository } from '../../domain/repositories/allocation.repository.port'
import type { Account } from '../../domain/entities/account.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACCOUNT_ID = '01900000-0000-7000-8000-000000000010'

const fakeAccount: Account = {
  id: ACCOUNT_ID,
  tenantId: TENANT_ID,
  name: 'Acme',
  clientCompany: 'Acme',
  description: null,
  domain: null,
  location: null,
  timezone: null,
  billingModel: null,
  status: 'active',
  accountManagerId: null,
  startedAt: null,
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('GetAccountStaffingHandler', () => {
  let handler: GetAccountStaffingHandler
  let accountRepo: IAccountRepository
  let allocRepo: IAllocationRepository

  beforeEach(() => {
    accountRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    }
    allocRepo = {
      findById: vi.fn(),
      findByActorId: vi.fn(),
      findActiveByActorId: vi.fn(),
      findConfirmedByActorId: vi.fn(),
      findByProjectRoleId: vi.fn(),
      findByAccountId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      close: vi.fn(),
      closeAllForActor: vi.fn(),
      flagTentativeForActor: vi.fn(),
      sumConfirmedHoursPerDay: vi.fn(),
    }
    handler = new GetAccountStaffingHandler(accountRepo, allocRepo)
  })

  it('returns account with all allocations', async () => {
    vi.mocked(accountRepo.findById).mockResolvedValue(fakeAccount)
    vi.mocked(allocRepo.findByAccountId).mockResolvedValue([])

    const result = await handler.execute(new GetAccountStaffingQuery(ACCOUNT_ID, TENANT_ID))

    expect(result.account.id).toBe(ACCOUNT_ID)
    expect(result.allocations).toEqual([])
  })

  it('throws AccountNotFoundException when not found', async () => {
    vi.mocked(accountRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new GetAccountStaffingQuery(ACCOUNT_ID, TENANT_ID)),
    ).rejects.toThrow(AccountNotFoundException)
  })
})

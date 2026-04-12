import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateAccountCommand } from './update-account.command'
import { UpdateAccountHandler } from './update-account.handler'
import { AccountNotFoundException } from '../../domain/exceptions/projects.exceptions'
import type { IAccountRepository } from '../../domain/repositories/account.repository.port'
import type { Account } from '../../domain/entities/account.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACCOUNT_ID = '01900000-0000-7000-8000-000000000010'

const fakeAccount: Account = {
  id: ACCOUNT_ID,
  tenantId: TENANT_ID,
  name: 'Old Name',
  clientCompany: null,
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

describe('UpdateAccountHandler', () => {
  let handler: UpdateAccountHandler
  let accountRepo: IAccountRepository

  beforeEach(() => {
    accountRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    }
    handler = new UpdateAccountHandler(accountRepo)
  })

  it('updates an existing account', async () => {
    vi.mocked(accountRepo.findById).mockResolvedValue(fakeAccount)

    await handler.execute(
      new UpdateAccountCommand(TENANT_ID, ACCOUNT_ID, { name: 'New Name', status: 'on_hold' }),
    )

    expect(accountRepo.update).toHaveBeenCalledWith(ACCOUNT_ID, TENANT_ID, {
      name: 'New Name',
      status: 'on_hold',
    })
  })

  it('throws AccountNotFoundException when account does not exist', async () => {
    vi.mocked(accountRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new UpdateAccountCommand(TENANT_ID, ACCOUNT_ID, { name: 'X' })),
    ).rejects.toThrow(AccountNotFoundException)
  })
})

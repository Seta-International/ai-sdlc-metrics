import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateAccountCommand } from './create-account.command'
import { CreateAccountHandler } from './create-account.handler'
import type { IAccountRepository } from '../../domain/repositories/account.repository.port'
import type { Account } from '../../domain/entities/account.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACCOUNT_ID = '01900000-0000-7000-8000-000000000010'

const fakeAccount: Account = {
  id: ACCOUNT_ID,
  tenantId: TENANT_ID,
  name: 'Acme Corp',
  clientCompany: 'Acme',
  description: null,
  domain: 'fintech',
  location: null,
  timezone: null,
  billingModel: 't_and_m',
  status: 'active',
  accountManagerId: null,
  startedAt: null,
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('CreateAccountHandler', () => {
  let handler: CreateAccountHandler
  let accountRepo: IAccountRepository

  beforeEach(() => {
    accountRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    }
    handler = new CreateAccountHandler(accountRepo)
  })

  it('creates an account and returns its id', async () => {
    vi.mocked(accountRepo.insert).mockResolvedValue(fakeAccount)

    const result = await handler.execute(
      new CreateAccountCommand(
        TENANT_ID,
        'Acme Corp',
        'Acme',
        null,
        'fintech',
        null,
        null,
        't_and_m',
        null,
        null,
      ),
    )

    expect(result).toBe(ACCOUNT_ID)
    expect(accountRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      name: 'Acme Corp',
      clientCompany: 'Acme',
      description: null,
      domain: 'fintech',
      location: null,
      timezone: null,
      billingModel: 't_and_m',
      accountManagerId: null,
      startedAt: null,
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetAccountQuery } from './get-account.query'
import { GetAccountHandler } from './get-account.handler'
import { AccountNotFoundException } from '../../domain/exceptions/projects.exceptions'
import type { IAccountRepository } from '../../domain/repositories/account.repository.port'
import type { IProjectRepository } from '../../domain/repositories/project.repository.port'
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

describe('GetAccountHandler', () => {
  let handler: GetAccountHandler
  let accountRepo: IAccountRepository
  let projectRepo: IProjectRepository

  beforeEach(() => {
    accountRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    }
    projectRepo = {
      findById: vi.fn(),
      findByAccountId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    }
    handler = new GetAccountHandler(accountRepo, projectRepo)
  })

  it('returns account with its projects', async () => {
    vi.mocked(accountRepo.findById).mockResolvedValue(fakeAccount)
    vi.mocked(projectRepo.findByAccountId).mockResolvedValue([])

    const result = await handler.execute(new GetAccountQuery(ACCOUNT_ID, TENANT_ID))

    expect(result.account.id).toBe(ACCOUNT_ID)
    expect(result.projects).toEqual([])
  })

  it('throws AccountNotFoundException when not found', async () => {
    vi.mocked(accountRepo.findById).mockResolvedValue(null)

    await expect(handler.execute(new GetAccountQuery(ACCOUNT_ID, TENANT_ID))).rejects.toThrow(
      AccountNotFoundException,
    )
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListAccountsQuery } from './list-accounts.query'
import { ListAccountsHandler } from './list-accounts.handler'
import type { IAccountRepository } from '../../domain/repositories/account.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('ListAccountsHandler', () => {
  let handler: ListAccountsHandler
  let accountRepo: IAccountRepository

  beforeEach(() => {
    accountRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    }
    handler = new ListAccountsHandler(accountRepo)
  })

  it('returns paginated accounts with total count', async () => {
    vi.mocked(accountRepo.list).mockResolvedValue([])
    vi.mocked(accountRepo.count).mockResolvedValue(0)

    const result = await handler.execute(new ListAccountsQuery(TENANT_ID, 20, 0))

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })
})

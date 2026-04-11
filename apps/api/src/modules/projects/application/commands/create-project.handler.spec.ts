import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateProjectCommand } from './create-project.command'
import { CreateProjectHandler } from './create-project.handler'
import { AccountNotFoundException } from '../../domain/exceptions/projects.exceptions'
import type { IAccountRepository } from '../../domain/repositories/account.repository.port'
import type { IProjectRepository } from '../../domain/repositories/project.repository.port'
import type { Account } from '../../domain/entities/account.entity'
import type { Project } from '../../domain/entities/project.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACCOUNT_ID = '01900000-0000-7000-8000-000000000010'
const PROJECT_ID = '01900000-0000-7000-8000-000000000020'

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

const fakeProject: Project = {
  id: PROJECT_ID,
  tenantId: TENANT_ID,
  accountId: ACCOUNT_ID,
  name: 'Project Alpha',
  code: 'PRJ-001',
  description: null,
  deliveryModel: 'scrum',
  status: 'active',
  startedAt: null,
  endedAt: null,
  tags: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('CreateProjectHandler', () => {
  let handler: CreateProjectHandler
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
    handler = new CreateProjectHandler(accountRepo, projectRepo)
  })

  it('creates a project when account exists', async () => {
    vi.mocked(accountRepo.findById).mockResolvedValue(fakeAccount)
    vi.mocked(projectRepo.insert).mockResolvedValue(fakeProject)

    const result = await handler.execute(
      new CreateProjectCommand(
        TENANT_ID,
        ACCOUNT_ID,
        'Project Alpha',
        'PRJ-001',
        null,
        'scrum',
        null,
        null,
      ),
    )

    expect(result).toBe(PROJECT_ID)
    expect(accountRepo.findById).toHaveBeenCalledWith(ACCOUNT_ID, TENANT_ID)
    expect(projectRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      accountId: ACCOUNT_ID,
      name: 'Project Alpha',
      code: 'PRJ-001',
      description: null,
      deliveryModel: 'scrum',
      startedAt: null,
      tags: null,
    })
  })

  it('throws AccountNotFoundException when account does not exist', async () => {
    vi.mocked(accountRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(
        new CreateProjectCommand(
          TENANT_ID,
          ACCOUNT_ID,
          'Project Alpha',
          null,
          null,
          null,
          null,
          null,
        ),
      ),
    ).rejects.toThrow(AccountNotFoundException)

    expect(projectRepo.insert).not.toHaveBeenCalled()
  })
})

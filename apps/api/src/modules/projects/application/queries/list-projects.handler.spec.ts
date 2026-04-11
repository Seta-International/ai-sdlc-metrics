import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListProjectsQuery } from './list-projects.query'
import { ListProjectsHandler } from './list-projects.handler'
import type { IProjectRepository } from '../../domain/repositories/project.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('ListProjectsHandler', () => {
  let handler: ListProjectsHandler
  let projectRepo: IProjectRepository

  beforeEach(() => {
    projectRepo = {
      findById: vi.fn(),
      findByAccountId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    }
    handler = new ListProjectsHandler(projectRepo)
  })

  it('returns paginated projects', async () => {
    vi.mocked(projectRepo.list).mockResolvedValue([])
    vi.mocked(projectRepo.count).mockResolvedValue(0)

    const result = await handler.execute(new ListProjectsQuery(TENANT_ID, 20, 0))

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })

  it('passes accountId filter when provided', async () => {
    vi.mocked(projectRepo.list).mockResolvedValue([])
    vi.mocked(projectRepo.count).mockResolvedValue(0)
    const accountId = '01900000-0000-7000-8000-000000000010'

    await handler.execute(new ListProjectsQuery(TENANT_ID, 20, 0, accountId))

    expect(projectRepo.list).toHaveBeenCalledWith(TENANT_ID, {
      limit: 20,
      offset: 0,
      accountId,
    })
  })
})

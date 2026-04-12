import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GetProjectQuery } from './get-project.query'
import { GetProjectHandler } from './get-project.handler'
import { ProjectNotFoundException } from '../../domain/exceptions/projects.exceptions'
import type { IProjectRepository } from '../../domain/repositories/project.repository.port'
import type { IProjectRoleRepository } from '../../domain/repositories/project-role.repository.port'
import type { Project } from '../../domain/entities/project.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROJECT_ID = '01900000-0000-7000-8000-000000000020'

const fakeProject: Project = {
  id: PROJECT_ID,
  tenantId: TENANT_ID,
  accountId: '01900000-0000-7000-8000-000000000010',
  name: 'Alpha',
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

describe('GetProjectHandler', () => {
  let handler: GetProjectHandler
  let projectRepo: IProjectRepository
  let roleRepo: IProjectRoleRepository

  beforeEach(() => {
    projectRepo = {
      findById: vi.fn(),
      findByAccountId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    }
    roleRepo = {
      findById: vi.fn(),
      findByProjectId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      countActiveAllocations: vi.fn(),
    }
    handler = new GetProjectHandler(projectRepo, roleRepo)
  })

  it('returns project with its roles', async () => {
    vi.mocked(projectRepo.findById).mockResolvedValue(fakeProject)
    vi.mocked(roleRepo.findByProjectId).mockResolvedValue([])

    const result = await handler.execute(new GetProjectQuery(PROJECT_ID, TENANT_ID))

    expect(result.project.id).toBe(PROJECT_ID)
    expect(result.roles).toEqual([])
  })

  it('throws ProjectNotFoundException when not found', async () => {
    vi.mocked(projectRepo.findById).mockResolvedValue(null)

    await expect(handler.execute(new GetProjectQuery(PROJECT_ID, TENANT_ID))).rejects.toThrow(
      ProjectNotFoundException,
    )
  })
})

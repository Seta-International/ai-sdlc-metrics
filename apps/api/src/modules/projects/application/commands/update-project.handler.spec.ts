import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateProjectCommand } from './update-project.command'
import { UpdateProjectHandler } from './update-project.handler'
import { ProjectNotFoundException } from '../../domain/exceptions/projects.exceptions'
import type { IProjectRepository } from '../../domain/repositories/project.repository.port'
import type { Project } from '../../domain/entities/project.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROJECT_ID = '01900000-0000-7000-8000-000000000020'

const fakeProject: Project = {
  id: PROJECT_ID,
  tenantId: TENANT_ID,
  accountId: '01900000-0000-7000-8000-000000000010',
  name: 'Old',
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

describe('UpdateProjectHandler', () => {
  let handler: UpdateProjectHandler
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
    handler = new UpdateProjectHandler(projectRepo)
  })

  it('updates an existing project', async () => {
    vi.mocked(projectRepo.findById).mockResolvedValue(fakeProject)

    await handler.execute(
      new UpdateProjectCommand(TENANT_ID, PROJECT_ID, { name: 'New', status: 'on_hold' }),
    )

    expect(projectRepo.update).toHaveBeenCalledWith(PROJECT_ID, TENANT_ID, {
      name: 'New',
      status: 'on_hold',
    })
  })

  it('throws ProjectNotFoundException when project does not exist', async () => {
    vi.mocked(projectRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new UpdateProjectCommand(TENANT_ID, PROJECT_ID, { name: 'X' })),
    ).rejects.toThrow(ProjectNotFoundException)
  })
})

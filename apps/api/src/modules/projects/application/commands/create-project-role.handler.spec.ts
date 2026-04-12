import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateProjectRoleCommand } from './create-project-role.command'
import { CreateProjectRoleHandler } from './create-project-role.handler'
import { ProjectNotFoundException } from '../../domain/exceptions/projects.exceptions'
import type { IProjectRepository } from '../../domain/repositories/project.repository.port'
import type { IProjectRoleRepository } from '../../domain/repositories/project-role.repository.port'
import type { Project } from '../../domain/entities/project.entity'
import type { ProjectRole } from '../../domain/entities/project-role.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROJECT_ID = '01900000-0000-7000-8000-000000000020'
const ROLE_ID = '01900000-0000-7000-8000-000000000030'

const fakeProject: Project = {
  id: PROJECT_ID,
  tenantId: TENANT_ID,
  accountId: '01900000-0000-7000-8000-000000000010',
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

const fakeRole: ProjectRole = {
  id: ROLE_ID,
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  roleName: 'Senior DevOps',
  skillsRequired: ['k8s', 'terraform'],
  headcount: 2,
  status: 'open',
  createdAt: new Date(),
}

describe('CreateProjectRoleHandler', () => {
  let handler: CreateProjectRoleHandler
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
    handler = new CreateProjectRoleHandler(projectRepo, roleRepo)
  })

  it('creates a project role when project exists', async () => {
    vi.mocked(projectRepo.findById).mockResolvedValue(fakeProject)
    vi.mocked(roleRepo.insert).mockResolvedValue(fakeRole)

    const result = await handler.execute(
      new CreateProjectRoleCommand(TENANT_ID, PROJECT_ID, 'Senior DevOps', ['k8s', 'terraform'], 2),
    )

    expect(result).toBe(ROLE_ID)
    expect(roleRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      roleName: 'Senior DevOps',
      skillsRequired: ['k8s', 'terraform'],
      headcount: 2,
    })
  })

  it('throws ProjectNotFoundException when project does not exist', async () => {
    vi.mocked(projectRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new CreateProjectRoleCommand(TENANT_ID, PROJECT_ID, 'BA', null, 1)),
    ).rejects.toThrow(ProjectNotFoundException)

    expect(roleRepo.insert).not.toHaveBeenCalled()
  })
})

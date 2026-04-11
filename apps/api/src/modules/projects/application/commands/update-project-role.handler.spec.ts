import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateProjectRoleCommand } from './update-project-role.command'
import { UpdateProjectRoleHandler } from './update-project-role.handler'
import { ProjectRoleNotFoundException } from '../../domain/exceptions/projects.exceptions'
import type { IProjectRoleRepository } from '../../domain/repositories/project-role.repository.port'
import type { ProjectRole } from '../../domain/entities/project-role.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ROLE_ID = '01900000-0000-7000-8000-000000000030'

const fakeRole: ProjectRole = {
  id: ROLE_ID,
  tenantId: TENANT_ID,
  projectId: '01900000-0000-7000-8000-000000000020',
  roleName: 'BA',
  skillsRequired: null,
  headcount: 1,
  status: 'open',
  createdAt: new Date(),
}

describe('UpdateProjectRoleHandler', () => {
  let handler: UpdateProjectRoleHandler
  let roleRepo: IProjectRoleRepository

  beforeEach(() => {
    roleRepo = {
      findById: vi.fn(),
      findByProjectId: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      countActiveAllocations: vi.fn(),
    }
    handler = new UpdateProjectRoleHandler(roleRepo)
  })

  it('updates an existing project role', async () => {
    vi.mocked(roleRepo.findById).mockResolvedValue(fakeRole)

    await handler.execute(
      new UpdateProjectRoleCommand(TENANT_ID, ROLE_ID, { roleName: 'Senior BA', headcount: 2 }),
    )

    expect(roleRepo.update).toHaveBeenCalledWith(ROLE_ID, TENANT_ID, {
      roleName: 'Senior BA',
      headcount: 2,
    })
  })

  it('throws ProjectRoleNotFoundException when role does not exist', async () => {
    vi.mocked(roleRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new UpdateProjectRoleCommand(TENANT_ID, ROLE_ID, { roleName: 'X' })),
    ).rejects.toThrow(ProjectRoleNotFoundException)
  })
})

import type { ProjectRole, ProjectRoleStatus } from '../entities/project-role.entity'

export const PROJECT_ROLE_REPOSITORY = Symbol('IProjectRoleRepository')

export interface IProjectRoleRepository {
  findById(id: string, tenantId: string): Promise<ProjectRole | null>
  findByProjectId(projectId: string, tenantId: string): Promise<ProjectRole[]>
  insert(data: {
    tenantId: string
    projectId: string
    roleName: string
    skillsRequired: string[] | null
    headcount: number
  }): Promise<ProjectRole>
  update(
    id: string,
    tenantId: string,
    data: Partial<Pick<ProjectRole, 'roleName' | 'skillsRequired' | 'headcount'>>,
  ): Promise<void>
  updateStatus(id: string, tenantId: string, status: ProjectRoleStatus): Promise<void>
  countActiveAllocations(id: string, tenantId: string): Promise<number>
}

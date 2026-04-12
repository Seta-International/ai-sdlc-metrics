export type ProjectRoleStatus = 'open' | 'filled' | 'cancelled'

export interface ProjectRole {
  id: string
  tenantId: string
  projectId: string
  roleName: string
  skillsRequired: string[] | null
  headcount: number
  status: ProjectRoleStatus
  createdAt: Date
}

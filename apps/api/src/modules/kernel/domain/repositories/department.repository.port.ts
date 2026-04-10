import type { Department } from '../entities/department.entity'

export const DEPARTMENT_REPOSITORY = Symbol('IDepartmentRepository')

export interface IDepartmentRepository {
  findById(id: string, tenantId: string): Promise<Department | null>
  insert(data: {
    tenantId: string
    name: string
    parentId?: string
    costCenterCode?: string
  }): Promise<Department>
}

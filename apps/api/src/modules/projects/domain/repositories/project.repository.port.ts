import type { Project, DeliveryModel } from '../entities/project.entity'

export const PROJECT_REPOSITORY = Symbol('IProjectRepository')

export interface IProjectRepository {
  findById(id: string, tenantId: string): Promise<Project | null>
  findByAccountId(accountId: string, tenantId: string): Promise<Project[]>
  insert(data: {
    tenantId: string
    accountId: string
    name: string
    code: string | null
    description: string | null
    deliveryModel: DeliveryModel | null
    startedAt: Date | null
    tags: unknown
  }): Promise<Project>
  update(id: string, tenantId: string, data: Partial<Project>): Promise<void>
  list(
    tenantId: string,
    options: { limit: number; offset: number; accountId?: string },
  ): Promise<Project[]>
  count(tenantId: string, options?: { accountId?: string }): Promise<number>
}

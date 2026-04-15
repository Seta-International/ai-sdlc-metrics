import type { JobFamily } from '../entities/job-family.entity'

export const JOB_FAMILY_REPOSITORY = Symbol('IJobFamilyRepository')

export interface IJobFamilyRepository {
  findById(id: string, tenantId: string): Promise<JobFamily | null>
  listByTenant(tenantId: string): Promise<JobFamily[]>
  insert(data: Omit<JobFamily, 'id' | 'createdAt'>): Promise<JobFamily>
  update(
    id: string,
    tenantId: string,
    data: Partial<Pick<JobFamily, 'name' | 'description' | 'parentId' | 'isActive'>>,
  ): Promise<JobFamily>
}

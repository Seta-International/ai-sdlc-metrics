import type { JobProfile } from '../entities/job-profile.entity'

export const JOB_PROFILE_REPOSITORY = Symbol('IJobProfileRepository')

export interface IJobProfileRepository {
  findById(id: string, tenantId: string): Promise<JobProfile | null>
  listByTenant(
    tenantId: string,
    filters?: { familyId?: string; isActive?: boolean },
  ): Promise<JobProfile[]>
  insert(data: Omit<JobProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<JobProfile>
  update(
    id: string,
    tenantId: string,
    data: Partial<Pick<JobProfile, 'title' | 'level' | 'description' | 'isActive'>>,
  ): Promise<JobProfile>
  countByJobFamilyId(jobFamilyId: string, tenantId: string): Promise<number>
}

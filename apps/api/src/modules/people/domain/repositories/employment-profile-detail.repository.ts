import { EmploymentProfileDetail } from '../entities/employment-profile-detail.entity'

export const EMPLOYMENT_PROFILE_DETAIL_REPOSITORY = Symbol('IEmploymentProfileDetailRepository')

export interface IEmploymentProfileDetailRepository {
  findByProfileId(profileId: string, tenantId: string): Promise<EmploymentProfileDetail | null>
  upsert(
    profileId: string,
    tenantId: string,
    data: Partial<Omit<EmploymentProfileDetail, 'profileId' | 'tenantId'>>,
  ): Promise<EmploymentProfileDetail>
  updateField(profileId: string, tenantId: string, fieldName: string, value: unknown): Promise<void>
}

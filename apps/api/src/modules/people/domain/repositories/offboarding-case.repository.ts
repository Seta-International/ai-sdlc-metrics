import { OffboardingCase, OffboardingCaseStatus } from '../entities/offboarding-case.entity'

export const OFFBOARDING_CASE_REPOSITORY = Symbol('IOffboardingCaseRepository')

export interface IOffboardingCaseRepository {
  findById(id: string, tenantId: string): Promise<OffboardingCase | null>
  findActiveByProfileId(profileId: string, tenantId: string): Promise<OffboardingCase | null>
  insert(data: Omit<OffboardingCase, 'id' | 'createdAt' | 'updatedAt'>): Promise<OffboardingCase>
  updateStatus(id: string, tenantId: string, status: OffboardingCaseStatus): Promise<void>
  update(
    id: string,
    tenantId: string,
    data: Partial<Pick<OffboardingCase, 'status' | 'decisionCaseId'>>,
  ): Promise<void>
}

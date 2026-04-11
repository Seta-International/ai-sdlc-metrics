import { OnboardingCase, OnboardingCaseStatus } from '../entities/onboarding-case.entity'

export const ONBOARDING_CASE_REPOSITORY = Symbol('IOnboardingCaseRepository')

export interface IOnboardingCaseRepository {
  findById(id: string, tenantId: string): Promise<OnboardingCase | null>
  findByProfileId(profileId: string, tenantId: string): Promise<OnboardingCase | null>
  insert(data: Omit<OnboardingCase, 'id' | 'createdAt' | 'updatedAt'>): Promise<OnboardingCase>
  updateStatus(id: string, tenantId: string, status: OnboardingCaseStatus): Promise<void>
}

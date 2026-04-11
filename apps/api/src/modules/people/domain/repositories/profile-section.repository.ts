import { ProfileSection, SectionType } from '../entities/profile-section.entity'

export const PROFILE_SECTION_REPOSITORY = Symbol('IProfileSectionRepository')

export interface IProfileSectionRepository {
  findById(id: string, tenantId: string): Promise<ProfileSection | null>
  findByProfileId(profileId: string, tenantId: string): Promise<ProfileSection[]>
  findByProfileIdAndType(
    profileId: string,
    sectionType: SectionType,
    tenantId: string,
  ): Promise<ProfileSection[]>
  insert(data: Omit<ProfileSection, 'id'>): Promise<ProfileSection>
  update(
    id: string,
    tenantId: string,
    data: Partial<Pick<ProfileSection, 'payload' | 'displayOrder'>>,
  ): Promise<ProfileSection>
  delete(id: string, tenantId: string): Promise<void>
}

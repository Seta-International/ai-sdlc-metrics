export type SectionType =
  | 'education'
  | 'certification'
  | 'skill'
  | 'language'
  | 'social_link'
  | 'dependent'

export interface ProfileSection {
  id: string
  tenantId: string
  profileId: string
  sectionType: SectionType
  payload: Record<string, unknown>
  displayOrder: number
}

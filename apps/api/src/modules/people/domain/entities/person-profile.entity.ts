import type { NameDisplayOrder } from '../value-objects/name-display-order'

export interface PersonProfile {
  id: string
  tenantId: string
  actorId: string
  familyName: string
  middleName: string | null
  givenName: string
  fullName: string
  fullNameUnaccented: string
  preferredName: string | null
  nameDisplayOrder: NameDisplayOrder
  dateOfBirth: Date | null
  gender: 'male' | 'female' | 'other' | 'undisclosed' | null
  nationality: string | null
  maritalStatus: 'single' | 'married' | 'divorced' | 'widowed' | 'undisclosed' | null
  photoDocumentId: string | null
  createdAt: Date
  updatedAt: Date
}

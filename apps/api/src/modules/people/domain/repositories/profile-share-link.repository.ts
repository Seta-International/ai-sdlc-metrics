import type { ProfileShareLink } from '../entities/profile-share-link.entity'

export const PROFILE_SHARE_LINK_REPOSITORY = Symbol('IProfileShareLinkRepository')

export interface IProfileShareLinkRepository {
  findById(id: string, tenantId: string): Promise<ProfileShareLink | null>
  findByToken(token: string): Promise<ProfileShareLink | null>
  findByEmploymentId(employmentId: string, tenantId: string): Promise<ProfileShareLink[]>
  insert(data: Omit<ProfileShareLink, 'id'>): Promise<ProfileShareLink>
  incrementViewCount(id: string): Promise<void>
  revoke(id: string, tenantId: string): Promise<void>
}

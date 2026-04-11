import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository'
import {
  EMPLOYMENT_PROFILE_DETAIL_REPOSITORY,
  type IEmploymentProfileDetailRepository,
} from '../../domain/repositories/employment-profile-detail.repository'
import {
  PROFILE_SECTION_REPOSITORY,
  type IProfileSectionRepository,
} from '../../domain/repositories/profile-section.repository'
import type { EmploymentProfile } from '../../domain/entities/employment-profile.entity'
import type { EmploymentProfileDetail } from '../../domain/entities/employment-profile-detail.entity'
import type { ProfileSection } from '../../domain/entities/profile-section.entity'
import { GetProfileQuery } from './get-profile.query'

export type ProfileResult = {
  profile: EmploymentProfile
  detail: EmploymentProfileDetail | null
  sections: ProfileSection[]
} | null

@QueryHandler(GetProfileQuery)
export class GetProfileHandler implements IQueryHandler<GetProfileQuery, ProfileResult> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    @Inject(EMPLOYMENT_PROFILE_DETAIL_REPOSITORY)
    private readonly detailRepo: IEmploymentProfileDetailRepository,
    @Inject(PROFILE_SECTION_REPOSITORY)
    private readonly sectionRepo: IProfileSectionRepository,
  ) {}

  async execute(query: GetProfileQuery): Promise<ProfileResult> {
    const profile = await this.profileRepo.findByActorId(query.actorId, query.tenantId)
    if (!profile) {
      return null
    }

    const [detail, sections] = await Promise.all([
      this.detailRepo.findByProfileId(profile.id, query.tenantId),
      this.sectionRepo.findByProfileId(profile.id, query.tenantId),
    ])

    return { profile, detail, sections }
  }
}

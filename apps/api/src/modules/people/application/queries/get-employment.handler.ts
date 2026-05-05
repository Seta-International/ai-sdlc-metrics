import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { Employment } from '../../domain/entities/employment.entity'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import type { JobAssignment } from '../../domain/entities/job-assignment.entity'
import type { EmploymentDetail } from '../../domain/entities/employment-detail.entity'
import type { ProfileSection } from '../../domain/entities/profile-section.entity'
import type { MsStagedUser } from '../../domain/entities/ms-staged-user.entity'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import {
  EMPLOYMENT_DETAIL_REPOSITORY,
  type IEmploymentDetailRepository,
} from '../../domain/repositories/employment-detail.repository'
import {
  PROFILE_SECTION_REPOSITORY,
  type IProfileSectionRepository,
} from '../../domain/repositories/profile-section.repository'
import {
  MS_STAGED_USER_REPOSITORY,
  type IMsStagedUserRepository,
} from '../../domain/repositories/ms-staged-user.repository'
import { GetEmploymentQuery } from './get-employment.query'

export type EmploymentResult = {
  employment: Employment
  personProfile: PersonProfile
  currentAssignment: JobAssignment | null
  detail: EmploymentDetail | null
  sections: ProfileSection[]
  stagedMsUser: MsStagedUser | null
} | null

@QueryHandler(GetEmploymentQuery)
export class GetEmploymentHandler implements IQueryHandler<GetEmploymentQuery, EmploymentResult> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly personProfileRepo: IPersonProfileRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly jobAssignmentRepo: IJobAssignmentRepository,
    @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
    private readonly employmentDetailRepo: IEmploymentDetailRepository,
    @Inject(PROFILE_SECTION_REPOSITORY)
    private readonly profileSectionRepo: IProfileSectionRepository,
    @Inject(MS_STAGED_USER_REPOSITORY)
    private readonly stagedUserRepo: IMsStagedUserRepository,
  ) {}

  async execute(query: GetEmploymentQuery): Promise<EmploymentResult> {
    const employment = await this.employmentRepo.findById(query.employmentId, query.tenantId)

    if (!employment) {
      return null
    }

    const personProfile = await this.personProfileRepo.findById(
      employment.personProfileId,
      query.tenantId,
    )
    const currentAssignment = await this.jobAssignmentRepo.findCurrent(
      employment.id,
      query.tenantId,
    )
    const detail = await this.employmentDetailRepo.findByEmploymentId(employment.id, query.tenantId)
    const sections = await this.profileSectionRepo.findByProfileId(
      employment.personProfileId,
      query.tenantId,
    )
    const stagedMsUser = await this.stagedUserRepo.findByImportedEmploymentId(
      employment.id,
      query.tenantId,
    )

    return {
      employment,
      personProfile: personProfile!,
      currentAssignment,
      detail,
      sections,
      stagedMsUser,
    }
  }
}

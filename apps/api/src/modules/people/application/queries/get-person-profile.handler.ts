import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import type { Employment } from '../../domain/entities/employment.entity'
import type { JobAssignment } from '../../domain/entities/job-assignment.entity'
import type { EmploymentDetail } from '../../domain/entities/employment-detail.entity'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import {
  EMPLOYMENT_DETAIL_REPOSITORY,
  type IEmploymentDetailRepository,
} from '../../domain/repositories/employment-detail.repository'
import { GetPersonProfileQuery } from './get-person-profile.query'

export type PersonProfileResult = {
  profile: PersonProfile
  employments: Array<{
    employment: Employment
    currentAssignment: JobAssignment | null
    detail: EmploymentDetail | null
  }>
} | null

@QueryHandler(GetPersonProfileQuery)
export class GetPersonProfileHandler implements IQueryHandler<
  GetPersonProfileQuery,
  PersonProfileResult
> {
  constructor(
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly personProfileRepo: IPersonProfileRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly jobAssignmentRepo: IJobAssignmentRepository,
    @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
    private readonly employmentDetailRepo: IEmploymentDetailRepository,
  ) {}

  async execute(query: GetPersonProfileQuery): Promise<PersonProfileResult> {
    const profile = await this.personProfileRepo.findByActorId(query.actorId, query.tenantId)

    if (!profile) {
      return null
    }

    const employments = await this.employmentRepo.findByPersonProfileId(profile.id, query.tenantId)

    const employmentResults: Array<{
      employment: Employment
      currentAssignment: JobAssignment | null
      detail: EmploymentDetail | null
    }> = []
    for (const employment of employments) {
      const currentAssignment = await this.jobAssignmentRepo.findCurrent(
        employment.id,
        query.tenantId,
      )
      const detail = await this.employmentDetailRepo.findByEmploymentId(
        employment.id,
        query.tenantId,
      )
      employmentResults.push({ employment, currentAssignment, detail })
    }

    return { profile, employments: employmentResults }
  }
}

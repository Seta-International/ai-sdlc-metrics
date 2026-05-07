import { Inject, Injectable } from '@nestjs/common'
import {
  DIRECTORY_SEARCH_INDEX_REPOSITORY,
  type IDirectorySearchIndexRepository,
} from '../../domain/repositories/directory-search-index.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  EMPLOYMENT_DETAIL_REPOSITORY,
  type IEmploymentDetailRepository,
} from '../../domain/repositories/employment-detail.repository'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import {
  JOB_PROFILE_REPOSITORY,
  type IJobProfileRepository,
} from '../../domain/repositories/job-profile.repository'
import {
  MS_STAGED_USER_REPOSITORY,
  type IMsStagedUserRepository,
} from '../../domain/repositories/ms-staged-user.repository'

@Injectable()
export class SearchIndexRebuildService {
  constructor(
    @Inject(DIRECTORY_SEARCH_INDEX_REPOSITORY)
    private readonly searchIndexRepo: IDirectorySearchIndexRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
    private readonly employmentDetailRepo: IEmploymentDetailRepository,
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly profileRepo: IPersonProfileRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly assignmentRepo: IJobAssignmentRepository,
    @Inject(JOB_PROFILE_REPOSITORY)
    private readonly jobProfileRepo: IJobProfileRepository,
    @Inject(MS_STAGED_USER_REPOSITORY)
    private readonly stagedUserRepo: IMsStagedUserRepository,
  ) {}

  async rebuildForEmployment(employmentId: string, tenantId: string): Promise<void> {
    const employment = await this.employmentRepo.findById(employmentId, tenantId)
    if (!employment) {
      await this.searchIndexRepo.deleteByEmploymentId(employmentId, tenantId)
      return
    }

    const profile = await this.profileRepo.findById(employment.personProfileId, tenantId)
    if (!profile) {
      await this.searchIndexRepo.deleteByEmploymentId(employmentId, tenantId)
      return
    }

    const currentAssignment = await this.assignmentRepo.findCurrent(employmentId, tenantId)
    const detail = await this.employmentDetailRepo.findByEmploymentId(employmentId, tenantId)
    const fallbackStagedMsUser = employment.companyEmail
      ? await this.stagedUserRepo.findLatestImportedByEmail(employment.companyEmail, tenantId)
      : null
    let jobTitle: string | null = detail?.msJobTitle ?? fallbackStagedMsUser?.jobTitle ?? null
    let jobLevel: string | null = null
    const departmentName: string | null =
      detail?.msDepartment ?? fallbackStagedMsUser?.department ?? null

    if (currentAssignment) {
      const jobProfile = await this.jobProfileRepo.findById(
        currentAssignment.jobProfileId,
        tenantId,
      )
      jobTitle = jobProfile?.title ?? jobTitle
      jobLevel = jobProfile?.level ?? null
      // departmentName resolved via kernel facade in real implementation; fall back to MS365 value
    }

    await this.searchIndexRepo.upsert({
      tenantId,
      employmentId,
      fullName: profile.fullName,
      fullNameUnaccented: profile.fullNameUnaccented,
      companyEmail: employment.companyEmail,
      jobTitle,
      jobLevel,
      departmentName,
      locationName: null, // resolved via kernel facade
      managerName: null, // resolved via self-join
      workArrangement: currentAssignment?.workArrangement ?? 'onsite',
      employmentStatus: employment.employmentStatus,
      hireDate: employment.hireDate,
      skills: [], // populated from profile_section type=skill
      countryCode: employment.countryCode,
      updatedAt: new Date(),
    })
  }

  async rebuildAllForTenant(tenantId: string): Promise<void> {
    await this.searchIndexRepo.rebuildAll(tenantId)

    const PAGE_SIZE = 500
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const employments = await this.employmentRepo.listByTenant(tenantId, {
        limit: PAGE_SIZE,
        offset,
      })
      for (const employment of employments) {
        await this.rebuildForEmployment(employment.id, tenantId)
      }
      hasMore = employments.length === PAGE_SIZE
      offset += employments.length
    }
  }
}

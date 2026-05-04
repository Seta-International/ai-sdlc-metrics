import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ONBOARDING_CASE_REPOSITORY,
  type IOnboardingCaseRepository,
} from '../../domain/repositories/onboarding-case.repository'
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
  JOB_PROFILE_REPOSITORY,
  type IJobProfileRepository,
} from '../../domain/repositories/job-profile.repository'
import {
  ListOnboardingCasesQuery,
  type OnboardingCaseListItem,
} from './list-onboarding-cases.query'

@QueryHandler(ListOnboardingCasesQuery)
export class ListOnboardingCasesHandler implements IQueryHandler<
  ListOnboardingCasesQuery,
  OnboardingCaseListItem[]
> {
  constructor(
    @Inject(ONBOARDING_CASE_REPOSITORY)
    private readonly caseRepo: IOnboardingCaseRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly profileRepo: IPersonProfileRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly assignmentRepo: IJobAssignmentRepository,
    @Inject(JOB_PROFILE_REPOSITORY)
    private readonly jobProfileRepo: IJobProfileRepository,
  ) {}

  async execute(query: ListOnboardingCasesQuery): Promise<OnboardingCaseListItem[]> {
    const { tenantId } = query

    const cases = await this.caseRepo.findAllActive(tenantId)
    if (cases.length === 0) return []

    const caseIds = cases.map((c) => c.id)
    const aggregates = await this.caseRepo.getTaskAggregates(caseIds, tenantId)

    const employmentIds = cases.map((c) => c.employmentId)
    const employments = await this.employmentRepo.findManyByIds(employmentIds, tenantId)

    const profileIds = employments.map((e) => e.personProfileId)
    const profiles = await this.profileRepo.findManyByIds(profileIds, tenantId)

    const assignments = await this.assignmentRepo.findCurrentMany(employmentIds, tenantId)
    const jobProfiles = await this.jobProfileRepo.listByTenant(tenantId)

    const empMap = new Map(employments.map((e) => [e.id, e]))
    const profileMap = new Map(profiles.map((p) => [p.id, p]))
    const aggMap = new Map(aggregates.map((a) => [a.caseId, a]))
    const assignmentMap = new Map(assignments.map((a) => [a.employmentId, a]))
    const jobProfileMap = new Map(jobProfiles.map((jp) => [jp.id, jp]))

    return cases.map((c) => {
      const emp = empMap.get(c.employmentId)
      const profile = emp ? profileMap.get(emp.personProfileId) : undefined
      const agg = aggMap.get(c.id)
      const assignment = assignmentMap.get(c.employmentId)
      const jobProfile = assignment ? jobProfileMap.get(assignment.jobProfileId) : undefined

      return {
        id: c.id,
        employmentId: c.employmentId,
        employeeName: profile ? `${profile.givenName} ${profile.familyName}` : '',
        jobTitle: jobProfile?.title ?? '',
        department: '',
        avatarUrl: null,
        startDate: emp ? emp.hireDate.toISOString().slice(0, 10) : '',
        stage: c.stage,
        tasksTotal: agg?.tasksTotal ?? 0,
        tasksCompleted: agg?.tasksCompleted ?? 0,
        blockers: agg?.blockers ?? 0,
      }
    })
  }
}

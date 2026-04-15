import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'
import { PeopleQueryFacade } from './application/facades/people-query.facade'

// ── New repositories ───────────────────────────────────────────────────────
import { DrizzlePersonProfileRepository } from './infrastructure/repositories/drizzle-person-profile.repository'
import { DrizzleEmploymentRepository } from './infrastructure/repositories/drizzle-employment.repository'
import { DrizzleJobAssignmentRepository } from './infrastructure/repositories/drizzle-job-assignment.repository'
import { DrizzleJobFamilyRepository } from './infrastructure/repositories/drizzle-job-family.repository'
import { DrizzleJobProfileRepository } from './infrastructure/repositories/drizzle-job-profile.repository'
import { DrizzleEmploymentDetailRepository } from './infrastructure/repositories/drizzle-employment-detail.repository'
import { PERSON_PROFILE_REPOSITORY } from './domain/repositories/person-profile.repository'
import { EMPLOYMENT_REPOSITORY } from './domain/repositories/employment.repository'
import { JOB_ASSIGNMENT_REPOSITORY } from './domain/repositories/job-assignment.repository'
import { JOB_FAMILY_REPOSITORY } from './domain/repositories/job-family.repository'
import { JOB_PROFILE_REPOSITORY } from './domain/repositories/job-profile.repository'
import { EMPLOYMENT_DETAIL_REPOSITORY } from './domain/repositories/employment-detail.repository'

// ── Legacy repositories (still functional) ────────────────────────────────
import { DrizzleProfileSectionRepository } from './infrastructure/repositories/drizzle-profile-section.repository'
import { DrizzleProfileChangeRequestRepository } from './infrastructure/repositories/drizzle-profile-change-request.repository'
import {
  DrizzleOffboardingCaseRepository,
  DrizzleOffboardingTemplateRepository,
} from './infrastructure/repositories/drizzle-offboarding.repository'
import {
  DrizzleOnboardingCaseRepository,
  DrizzleOnboardingTemplateRepository,
} from './infrastructure/repositories/drizzle-onboarding.repository'
import { PROFILE_SECTION_REPOSITORY } from './domain/repositories/profile-section.repository'
import { PROFILE_CHANGE_REQUEST_REPOSITORY } from './domain/repositories/profile-change-request.repository'
import { OFFBOARDING_CASE_REPOSITORY } from './domain/repositories/offboarding-case.repository'
import { OFFBOARDING_TEMPLATE_REPOSITORY } from './domain/repositories/offboarding-template.repository'
import { ONBOARDING_CASE_REPOSITORY } from './domain/repositories/onboarding-case.repository'
import { ONBOARDING_TEMPLATE_REPOSITORY } from './domain/repositories/onboarding-template.repository'

// ── New command handlers ───────────────────────────────────────────────────
import { CreatePersonProfileHandler } from './application/commands/create-person-profile.handler'
import { CreateEmploymentHandler } from './application/commands/create-employment.handler'
import { CreateJobAssignmentHandler } from './application/commands/create-job-assignment.handler'
import { CreateJobFamilyHandler } from './application/commands/create-job-family.handler'
import { CreateJobProfileHandler } from './application/commands/create-job-profile.handler'
import { UpdateEmploymentDetailHandler } from './application/commands/update-employment-detail.handler'

// ── Legacy command handlers that still compile ─────────────────────────────
// NOTE: Handlers that reference EMPLOYMENT_PROFILE_REPOSITORY (deleted) are
// excluded here and will be re-implemented in Plan 06:
//   - RequestProfileChangeHandler (uses EMPLOYMENT_PROFILE_REPOSITORY)
//   - ApproveProfileChangeHandler (uses EMPLOYMENT_PROFILE_DETAIL_REPOSITORY)
//   - TriggerOffboardingHandler   (uses EMPLOYMENT_PROFILE_REPOSITORY)
//   - ApproveOffboardingHandler   (uses EMPLOYMENT_PROFILE_REPOSITORY)
//   - CompleteOffboardingHandler  (uses EMPLOYMENT_PROFILE_REPOSITORY + ACCOUNT_MEMBERSHIP_REPOSITORY)
//   - CompleteTaskHandler         (uses EMPLOYMENT_PROFILE_REPOSITORY)
import { RejectProfileChangeHandler } from './application/commands/reject-profile-change.handler'
import { RejectOffboardingHandler } from './application/commands/reject-offboarding.handler'

// ── New query handlers ─────────────────────────────────────────────────────
import { GetPersonProfileHandler } from './application/queries/get-person-profile.handler'
import { GetEmploymentHandler } from './application/queries/get-employment.handler'
import { GetCurrentJobAssignmentHandler } from './application/queries/get-current-job-assignment.handler'
import { ListEmploymentsHandler } from './application/queries/list-employments.handler'
import { ListJobProfilesHandler } from './application/queries/list-job-profiles.handler'

// ── Legacy query handlers that still compile ───────────────────────────────
// NOTE: Handlers that reference EMPLOYMENT_PROFILE_REPOSITORY (deleted) are excluded:
//   - ListPeriodicReviewsHandler    (uses EMPLOYMENT_PROFILE_REPOSITORY + PERIODIC_PROFILE_REVIEW_REPOSITORY)
//   - ListProfileChangeRequestsHandler (uses EMPLOYMENT_PROFILE_REPOSITORY)
import { ListOnboardingTasksHandler } from './application/queries/list-onboarding-tasks.handler'
import { ListTemplatesHandler } from './application/queries/list-templates.handler'
import { ListContractVersionsHandler } from './application/queries/list-contract-versions.handler'

// ── Event handlers ─────────────────────────────────────────────────────────
// TODO(Plan 06): OnCandidateHiredHandler references CreateEmploymentProfileCommand (deleted).
// Re-implement to use CreatePersonProfileCommand + CreateEmploymentCommand.
// import { OnCandidateHiredHandler } from './application/event-handlers/on-candidate-hired.handler'

// ── tRPC service ───────────────────────────────────────────────────────────
import { PeopleTrpcService } from './interface/trpc/people-trpc.service'

@Module({
  imports: [CqrsModule, KernelModule],
  providers: [
    // ── New repositories ─────────────────────────────────────────────────
    { provide: PERSON_PROFILE_REPOSITORY, useClass: DrizzlePersonProfileRepository },
    { provide: EMPLOYMENT_REPOSITORY, useClass: DrizzleEmploymentRepository },
    { provide: JOB_ASSIGNMENT_REPOSITORY, useClass: DrizzleJobAssignmentRepository },
    { provide: JOB_FAMILY_REPOSITORY, useClass: DrizzleJobFamilyRepository },
    { provide: JOB_PROFILE_REPOSITORY, useClass: DrizzleJobProfileRepository },
    { provide: EMPLOYMENT_DETAIL_REPOSITORY, useClass: DrizzleEmploymentDetailRepository },

    // ── Legacy repositories (still functional) ───────────────────────────
    { provide: PROFILE_SECTION_REPOSITORY, useClass: DrizzleProfileSectionRepository },
    { provide: PROFILE_CHANGE_REQUEST_REPOSITORY, useClass: DrizzleProfileChangeRequestRepository },
    { provide: OFFBOARDING_CASE_REPOSITORY, useClass: DrizzleOffboardingCaseRepository },
    { provide: OFFBOARDING_TEMPLATE_REPOSITORY, useClass: DrizzleOffboardingTemplateRepository },
    { provide: ONBOARDING_CASE_REPOSITORY, useClass: DrizzleOnboardingCaseRepository },
    { provide: ONBOARDING_TEMPLATE_REPOSITORY, useClass: DrizzleOnboardingTemplateRepository },

    // ── New command handlers ─────────────────────────────────────────────
    CreatePersonProfileHandler,
    CreateEmploymentHandler,
    CreateJobAssignmentHandler,
    CreateJobFamilyHandler,
    CreateJobProfileHandler,
    UpdateEmploymentDetailHandler,

    // ── Legacy command handlers ──────────────────────────────────────────
    RejectProfileChangeHandler,
    RejectOffboardingHandler,

    // ── New query handlers ───────────────────────────────────────────────
    GetPersonProfileHandler,
    GetEmploymentHandler,
    GetCurrentJobAssignmentHandler,
    ListEmploymentsHandler,
    ListJobProfilesHandler,

    // ── Legacy query handlers ────────────────────────────────────────────
    ListOnboardingTasksHandler,
    ListTemplatesHandler,
    ListContractVersionsHandler,

    // ── Facades & services ───────────────────────────────────────────────
    PeopleQueryFacade,
    PeopleTrpcService,
  ],
  exports: [PeopleQueryFacade],
})
export class PeopleModule {}

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
import { DrizzleProbationPolicyRepository } from './infrastructure/repositories/drizzle-probation-policy.repository'
import { DrizzleProbationRecordRepository } from './infrastructure/repositories/drizzle-probation-record.repository'
import { DrizzleContractVersionRepository } from './infrastructure/repositories/drizzle-contract-version.repository'
import { DrizzleContractPolicyRepository } from './infrastructure/repositories/drizzle-contract-policy.repository'
import { DrizzleCountryFieldConfigRepository } from './infrastructure/repositories/drizzle-country-field-config.repository'
import { DrizzleCustomFieldDefinitionRepository } from './infrastructure/repositories/drizzle-custom-field-definition.repository'
import { DrizzleFieldVisibilityConfigRepository } from './infrastructure/repositories/drizzle-field-visibility-config.repository'
import { DrizzleFieldEditPolicyRepository } from './infrastructure/repositories/drizzle-field-edit-policy.repository'
import { PERSON_PROFILE_REPOSITORY } from './domain/repositories/person-profile.repository'
import { EMPLOYMENT_REPOSITORY } from './domain/repositories/employment.repository'
import { JOB_ASSIGNMENT_REPOSITORY } from './domain/repositories/job-assignment.repository'
import { JOB_FAMILY_REPOSITORY } from './domain/repositories/job-family.repository'
import { JOB_PROFILE_REPOSITORY } from './domain/repositories/job-profile.repository'
import { EMPLOYMENT_DETAIL_REPOSITORY } from './domain/repositories/employment-detail.repository'
import { PROBATION_POLICY_REPOSITORY } from './domain/repositories/probation-policy.repository'
import { PROBATION_RECORD_REPOSITORY } from './domain/repositories/probation-record.repository'
import { CONTRACT_VERSION_REPOSITORY } from './domain/repositories/contract-version.repository'
import { CONTRACT_POLICY_REPOSITORY } from './domain/repositories/contract-policy.repository'
import { COUNTRY_FIELD_CONFIG_REPOSITORY } from './domain/repositories/country-field-config.repository'
import { CUSTOM_FIELD_DEFINITION_REPOSITORY } from './domain/repositories/custom-field-definition.repository'
import { FIELD_VISIBILITY_CONFIG_REPOSITORY } from './domain/repositories/field-visibility-config.repository'
import { FIELD_EDIT_POLICY_REPOSITORY } from './domain/repositories/field-edit-policy.repository'

// ── Plan 04 repositories ───────────────────────────────────────────────────
import { DrizzleEmployeeDocumentRepository } from './infrastructure/repositories/drizzle-employee-document.repository'
import { DrizzleDocumentRequirementRepository } from './infrastructure/repositories/drizzle-document-requirement.repository'
import { DrizzleCompletenessRuleRepository } from './infrastructure/repositories/drizzle-completeness-rule.repository'
import { EMPLOYEE_DOCUMENT_REPOSITORY } from './domain/repositories/employee-document.repository'
import { DOCUMENT_REQUIREMENT_REPOSITORY } from './domain/repositories/document-requirement.repository'
import { COMPLETENESS_RULE_REPOSITORY } from './domain/repositories/completeness-rule.repository'

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
import { SetProbationHandler } from './application/commands/set-probation.handler'
import { ConfirmProbationHandler } from './application/commands/confirm-probation.handler'
import { ExtendProbationHandler } from './application/commands/extend-probation.handler'
import { FailProbationHandler } from './application/commands/fail-probation.handler'
import { TerminateEmploymentHandler } from './application/commands/terminate-employment.handler'
import { ActivateEmploymentHandler } from './application/commands/activate-employment.handler'
import { StartLeaveHandler } from './application/commands/start-leave.handler'
import { ReturnFromLeaveHandler } from './application/commands/return-from-leave.handler'
import { SuspendEmploymentHandler } from './application/commands/suspend-employment.handler'
import { ReinstateSuspensionHandler } from './application/commands/reinstate-suspension.handler'
import { GiveNoticeHandler } from './application/commands/give-notice.handler'
import { CompleteTerminationHandler } from './application/commands/complete-termination.handler'
import { CreateContractVersionHandler } from './application/commands/create-contract-version.handler'
import { CreateCustomFieldDefinitionHandler } from './application/commands/create-custom-field-definition.handler'
import { UpdateCustomFieldDefinitionHandler } from './application/commands/update-custom-field-definition.handler'

// ── Plan 04 command handlers ───────────────────────────────────────────────
import { RequestProfileChangesHandler } from './application/commands/request-profile-changes.handler'
import { BatchApproveChangesHandler } from './application/commands/batch-approve-changes.handler'
import { BatchRejectChangesHandler } from './application/commands/batch-reject-changes.handler'
import { UploadEmployeeDocumentHandler } from './application/commands/upload-employee-document.handler'
import { AcknowledgePolicyHandler } from './application/commands/acknowledge-policy.handler'

// ── Plan 04 query handlers ─────────────────────────────────────────────────
import { ListExpiringDocumentsHandler } from './application/queries/list-expiring-documents.handler'
import { GetProfileCompletenessHandler } from './application/queries/get-profile-completeness.handler'
import { ListIncompleteProfilesHandler } from './application/queries/list-incomplete-profiles.handler'

// ── Plan 04 services ───────────────────────────────────────────────────────
import { DuplicateValidationService } from './application/services/duplicate-validation.service'

// ── Plan 04 jobs ───────────────────────────────────────────────────────────
import { ApplyScheduledChangesJob } from './infrastructure/jobs/apply-scheduled-changes.job'
import { CheckDocumentExpiryJob } from './infrastructure/jobs/check-document-expiry.job'
import { CompletenessReminderJob } from './infrastructure/jobs/completeness-reminder.job'

// ── Plan 05 repositories ───────────────────────────────────────────────────
import { DrizzleDirectorySearchIndexRepository } from './infrastructure/repositories/drizzle-directory-search-index.repository'
import { DrizzleEmailGenerationConfigRepository } from './infrastructure/repositories/drizzle-email-generation-config.repository'
import { DrizzleProfileShareLinkRepository } from './infrastructure/repositories/drizzle-profile-share-link.repository'
import { DrizzleBulkOperationRepository } from './infrastructure/repositories/drizzle-bulk-operation.repository'
import { DrizzleImportJobRepository } from './infrastructure/repositories/drizzle-import-job.repository'
import { DIRECTORY_SEARCH_INDEX_REPOSITORY } from './domain/repositories/directory-search-index.repository'
import { EMAIL_GENERATION_CONFIG_REPOSITORY } from './domain/repositories/email-generation-config.repository'
import { PROFILE_SHARE_LINK_REPOSITORY } from './domain/repositories/profile-share-link.repository'
import { BULK_OPERATION_REPOSITORY } from './domain/repositories/bulk-operation.repository'
import { IMPORT_JOB_REPOSITORY } from './domain/repositories/import-job.repository'

// ── Plan 01 repositories ───────────────────────────────────────────────────
import { JobHistoryRepositoryImpl } from './infrastructure/repositories/job-history.repository'
import { JOB_HISTORY_REPOSITORY } from './domain/repositories/job-history.repository'

// ── Plan 02 services ───────────────────────────────────────────────────────
import { JobHistoryRecorderService } from './application/services/job-history-recorder.service'

// ── Plan 05 services ───────────────────────────────────────────────────────
import { SearchIndexRebuildService } from './application/services/search-index-rebuild.service'
import { EmailGenerationService } from './application/services/email-generation.service'

// ── Plan 05 command handlers ───────────────────────────────────────────────
import { GenerateCompanyEmailHandler } from './application/commands/generate-company-email.handler'
import { GenerateShareLinkHandler } from './application/commands/generate-share-link.handler'
import { RevokeShareLinkHandler } from './application/commands/revoke-share-link.handler'
import { BulkUpdateDepartmentHandler } from './application/commands/bulk-update-department.handler'
import { UploadImportFileHandler } from './application/commands/upload-import-file.handler'
import { MapImportColumnsHandler } from './application/commands/map-import-columns.handler'
import { ValidateImportHandler } from './application/commands/validate-import.handler'
import { CommitImportHandler } from './application/commands/commit-import.handler'
import { InitiateLinkedInAuthHandler } from './application/commands/initiate-linkedin-auth.handler'
import { ImportLinkedInProfileHandler } from './application/commands/import-linkedin-profile.handler'
import { ConfirmLinkedInImportHandler } from './application/commands/confirm-linkedin-import.handler'

// ── Plan 05 query handlers ─────────────────────────────────────────────────
import { SearchDirectoryHandler } from './application/queries/search-directory.handler'
import { ListDirectoryHandler } from './application/queries/list-directory.handler'
import { ExportDirectoryHandler } from './application/queries/export-directory.handler'
import { GetSharedProfileHandler } from './application/queries/get-shared-profile.handler'

// ── Plan 05 event handlers ─────────────────────────────────────────────────
import { OnSearchIndexUpdateHandler } from './application/event-handlers/on-search-index-update.handler'

// ── Plan 05 jobs ───────────────────────────────────────────────────────────
import { RebuildSearchIndexJob } from './infrastructure/jobs/rebuild-search-index.job'
import { ProcessBulkOperationJob } from './infrastructure/jobs/process-bulk-operation.job'
import { ProcessImportJob } from './infrastructure/jobs/process-import.job'

// ── Services ───────────────────────────────────────────────────────────────
import { CountryFieldValidationService } from './application/services/country-field-validation.service'
import { CustomFieldValidationService } from './application/services/custom-field-validation.service'
import { FieldVisibilityFilterService } from './application/services/field-visibility-filter.service'
import { EditPolicyService } from './application/services/edit-policy.service'

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
import { GetProbationRecordHandler } from './application/queries/get-probation-record.handler'

// ── Legacy query handlers that still compile ───────────────────────────────
// NOTE: Handlers that reference EMPLOYMENT_PROFILE_REPOSITORY (deleted) are excluded:
//   - ListPeriodicReviewsHandler    (uses EMPLOYMENT_PROFILE_REPOSITORY + PERIODIC_PROFILE_REVIEW_REPOSITORY)
//   - ListProfileChangeRequestsHandler (uses EMPLOYMENT_PROFILE_REPOSITORY)
import { ListOnboardingTasksHandler } from './application/queries/list-onboarding-tasks.handler'
import { ListTemplatesHandler } from './application/queries/list-templates.handler'
import { ListContractVersionsHandler } from './application/queries/list-contract-versions.handler'

// ── Plan 06 services ───────────────────────────────────────────────────────
import { OnboardingTemplateSelectorService } from './application/services/onboarding-template-selector.service'
import { OffboardingTemplateSelectorService } from './application/services/offboarding-template-selector.service'

// ── Event handlers ─────────────────────────────────────────────────────────
import { OnCandidateHiredHandler } from './application/event-handlers/on-candidate-hired.handler'

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
    { provide: PROBATION_POLICY_REPOSITORY, useClass: DrizzleProbationPolicyRepository },
    { provide: PROBATION_RECORD_REPOSITORY, useClass: DrizzleProbationRecordRepository },
    { provide: CONTRACT_VERSION_REPOSITORY, useClass: DrizzleContractVersionRepository },
    { provide: CONTRACT_POLICY_REPOSITORY, useClass: DrizzleContractPolicyRepository },
    { provide: COUNTRY_FIELD_CONFIG_REPOSITORY, useClass: DrizzleCountryFieldConfigRepository },
    {
      provide: CUSTOM_FIELD_DEFINITION_REPOSITORY,
      useClass: DrizzleCustomFieldDefinitionRepository,
    },
    {
      provide: FIELD_VISIBILITY_CONFIG_REPOSITORY,
      useClass: DrizzleFieldVisibilityConfigRepository,
    },
    { provide: FIELD_EDIT_POLICY_REPOSITORY, useClass: DrizzleFieldEditPolicyRepository },

    // ── Legacy repositories (still functional) ───────────────────────────
    { provide: PROFILE_SECTION_REPOSITORY, useClass: DrizzleProfileSectionRepository },
    { provide: PROFILE_CHANGE_REQUEST_REPOSITORY, useClass: DrizzleProfileChangeRequestRepository },
    { provide: OFFBOARDING_CASE_REPOSITORY, useClass: DrizzleOffboardingCaseRepository },
    { provide: OFFBOARDING_TEMPLATE_REPOSITORY, useClass: DrizzleOffboardingTemplateRepository },
    { provide: ONBOARDING_CASE_REPOSITORY, useClass: DrizzleOnboardingCaseRepository },
    { provide: ONBOARDING_TEMPLATE_REPOSITORY, useClass: DrizzleOnboardingTemplateRepository },

    // ── Plan 04 repositories ─────────────────────────────────────────────
    { provide: EMPLOYEE_DOCUMENT_REPOSITORY, useClass: DrizzleEmployeeDocumentRepository },
    { provide: DOCUMENT_REQUIREMENT_REPOSITORY, useClass: DrizzleDocumentRequirementRepository },
    { provide: COMPLETENESS_RULE_REPOSITORY, useClass: DrizzleCompletenessRuleRepository },

    // ── Plan 01 repositories ─────────────────────────────────────────────
    { provide: JOB_HISTORY_REPOSITORY, useClass: JobHistoryRepositoryImpl },

    // ── New command handlers ─────────────────────────────────────────────
    CreatePersonProfileHandler,
    CreateEmploymentHandler,
    CreateJobAssignmentHandler,
    CreateJobFamilyHandler,
    CreateJobProfileHandler,
    UpdateEmploymentDetailHandler,
    TerminateEmploymentHandler,
    SetProbationHandler,
    ConfirmProbationHandler,
    ExtendProbationHandler,
    FailProbationHandler,
    ActivateEmploymentHandler,
    StartLeaveHandler,
    ReturnFromLeaveHandler,
    SuspendEmploymentHandler,
    ReinstateSuspensionHandler,
    GiveNoticeHandler,
    CompleteTerminationHandler,
    CreateContractVersionHandler,
    CreateCustomFieldDefinitionHandler,
    UpdateCustomFieldDefinitionHandler,

    // ── Plan 04 command handlers ─────────────────────────────────────────
    RequestProfileChangesHandler,
    BatchApproveChangesHandler,
    BatchRejectChangesHandler,
    UploadEmployeeDocumentHandler,
    AcknowledgePolicyHandler,

    // ── Plan 02 services ─────────────────────────────────────────────────
    JobHistoryRecorderService,

    // ── Services ─────────────────────────────────────────────────────────
    CountryFieldValidationService,
    CustomFieldValidationService,
    FieldVisibilityFilterService,
    EditPolicyService,
    DuplicateValidationService,

    // ── Plan 04 jobs ─────────────────────────────────────────────────────
    ApplyScheduledChangesJob,
    CheckDocumentExpiryJob,
    CompletenessReminderJob,

    // ── Plan 05 repositories ─────────────────────────────────────────────
    { provide: DIRECTORY_SEARCH_INDEX_REPOSITORY, useClass: DrizzleDirectorySearchIndexRepository },
    {
      provide: EMAIL_GENERATION_CONFIG_REPOSITORY,
      useClass: DrizzleEmailGenerationConfigRepository,
    },
    { provide: PROFILE_SHARE_LINK_REPOSITORY, useClass: DrizzleProfileShareLinkRepository },
    { provide: BULK_OPERATION_REPOSITORY, useClass: DrizzleBulkOperationRepository },
    { provide: IMPORT_JOB_REPOSITORY, useClass: DrizzleImportJobRepository },

    // ── Plan 05 services ─────────────────────────────────────────────────
    SearchIndexRebuildService,
    EmailGenerationService,

    // ── Plan 05 command handlers ─────────────────────────────────────────
    GenerateCompanyEmailHandler,
    GenerateShareLinkHandler,
    RevokeShareLinkHandler,
    BulkUpdateDepartmentHandler,
    UploadImportFileHandler,
    MapImportColumnsHandler,
    ValidateImportHandler,
    CommitImportHandler,
    InitiateLinkedInAuthHandler,
    ImportLinkedInProfileHandler,
    ConfirmLinkedInImportHandler,

    // ── Plan 05 query handlers ───────────────────────────────────────────
    SearchDirectoryHandler,
    ListDirectoryHandler,
    ExportDirectoryHandler,
    GetSharedProfileHandler,

    // ── Plan 05 event handlers ───────────────────────────────────────────
    OnSearchIndexUpdateHandler,

    // ── Plan 05 jobs ─────────────────────────────────────────────────────
    RebuildSearchIndexJob,
    ProcessBulkOperationJob,
    ProcessImportJob,

    // ── Legacy command handlers ──────────────────────────────────────────
    RejectProfileChangeHandler,
    RejectOffboardingHandler,

    // ── New query handlers ───────────────────────────────────────────────
    GetPersonProfileHandler,
    GetEmploymentHandler,
    GetCurrentJobAssignmentHandler,
    ListEmploymentsHandler,
    ListJobProfilesHandler,
    GetProbationRecordHandler,

    // ── Plan 04 query handlers ───────────────────────────────────────────
    ListExpiringDocumentsHandler,
    GetProfileCompletenessHandler,
    ListIncompleteProfilesHandler,

    // ── Legacy query handlers ────────────────────────────────────────────
    ListOnboardingTasksHandler,
    ListTemplatesHandler,
    ListContractVersionsHandler,

    // ── Plan 06 services ─────────────────────────────────────────────────
    OnboardingTemplateSelectorService,
    OffboardingTemplateSelectorService,
    {
      provide: 'ONBOARDING_TEMPLATE_SELECTOR',
      useExisting: OnboardingTemplateSelectorService,
    },

    // ── Event handlers ────────────────────────────────────────────────────
    OnCandidateHiredHandler,

    // ── Facades & services ───────────────────────────────────────────────
    PeopleQueryFacade,
    PeopleTrpcService,
  ],
  exports: [PeopleQueryFacade],
})
export class PeopleModule {}

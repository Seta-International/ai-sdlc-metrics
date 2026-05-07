import { Inject, Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs'
import { CandidateHiredEvent } from '@future/event-contracts'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  EMPLOYMENT_DETAIL_REPOSITORY,
  type IEmploymentDetailRepository,
} from '../../domain/repositories/employment-detail.repository'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import {
  defaultNameDisplayOrder,
  computeFullName,
  computeFullNameUnaccented,
} from '../../domain/value-objects/name-display-order'
import { ONBOARDING_CASE_REPOSITORY } from '../../domain/repositories/onboarding-case.repository'

@EventsHandler(CandidateHiredEvent)
@Injectable()
export class OnCandidateHiredHandler implements IEventHandler<CandidateHiredEvent> {
  constructor(
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly profileRepo: IPersonProfileRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
    private readonly detailRepo: IEmploymentDetailRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly assignmentRepo: IJobAssignmentRepository,
    @Inject('ONBOARDING_TEMPLATE_SELECTOR')
    private readonly templateSelector: {
      selectTemplate: (
        tenantId: string,
        countryCode: string,
        workerType: string,
        employmentType: string,
      ) => Promise<{ id: string; name: string } | null>
    },
    @Inject(ONBOARDING_CASE_REPOSITORY)
    private readonly onboardingCaseRepo: {
      findByEmploymentId: (employmentId: string, tenantId: string) => Promise<unknown>
      insert: (data: unknown) => Promise<unknown>
    },
  ) {}

  async handle(event: CandidateHiredEvent): Promise<void> {
    // 1. Find or create person_profile
    let profile = await this.profileRepo.findByActorId(event.actorId, event.tenantId)
    if (!profile) {
      const displayOrder = defaultNameDisplayOrder(event.countryCode)
      const fullName = computeFullName(
        event.familyName,
        event.givenName,
        event.middleName,
        displayOrder,
      )
      profile = await this.profileRepo.insert({
        tenantId: event.tenantId,
        actorId: event.actorId,
        familyName: event.familyName,
        middleName: event.middleName,
        givenName: event.givenName,
        fullName,
        fullNameUnaccented: computeFullNameUnaccented(fullName),
        preferredName: null,
        nameDisplayOrder: displayOrder,
        dateOfBirth: null,
        gender: null,
        nationality: null,
        maritalStatus: null,
        photoDocumentId: null,
      })
    }

    // 2. Create employment in pre_hire status
    const employment = await this.employmentRepo.insert({
      tenantId: event.tenantId,
      personProfileId: profile.id,
      previousProfileId: null,
      employeeCode: null,
      companyEmail: null,
      workerType: event.workerType as 'employee' | 'contingent',
      employmentType: event.employmentType as 'permanent' | 'fixed_term' | 'intern',
      countryCode: event.countryCode,
      employmentStatus: 'pre_hire',
      terminationDate: null,
      terminationReason: null,
      hireDate: event.hireDate,
      originalHireDate: null,
    })

    // 3. Create empty employment detail
    await this.detailRepo.insert({
      tenantId: event.tenantId,
      employmentId: employment.id,
      nationalId: null,
      nationalIdType: null,
      nationalIdIssuedDate: null,
      nationalIdExpiryDate: null,
      taxId: null,
      socialInsuranceId: null,
      passportNumber: null,
      passportExpiryDate: null,
      bankAccountNumber: null,
      bankName: null,
      bankBranch: null,
      bankAccountHolder: null,
      bankSwiftCode: null,
      personalEmail: null,
      personalPhone: null,
      permanentAddress: null,
      currentAddress: null,
      emergencyContacts: null,
      countryData: null,
      customFields: null,
      officeLocation: null,
      workPhone: null,
      msJobTitle: null,
      msDepartment: null,
    })

    // 4. Create initial job assignment
    await this.assignmentRepo.insert({
      tenantId: event.tenantId,
      employmentId: employment.id,
      effectiveFrom: event.hireDate,
      effectiveTo: null,
      jobProfileId: event.jobProfileId,
      departmentId: event.departmentId ?? null,
      locationId: null,
      costCenterId: null,
      workArrangement: 'onsite',
      managerId: null,
      eventType: 'hire',
      reason: 'Initial hire from recruitment',
      createdBy: event.actorId,
    })

    // 5. Auto-select onboarding template and create case
    const template = await this.templateSelector.selectTemplate(
      event.tenantId,
      event.countryCode,
      event.workerType,
      event.employmentType,
    )

    if (template) {
      await this.onboardingCaseRepo.insert({
        tenantId: event.tenantId,
        employmentId: employment.id,
        templateId: template.id,
        status: 'in_progress',
      })
    }
  }
}

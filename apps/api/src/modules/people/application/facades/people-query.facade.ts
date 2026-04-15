import { Inject, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { GetPersonProfileQuery } from '../queries/get-person-profile.query'
import { GetEmploymentQuery } from '../queries/get-employment.query'
import { GetCurrentJobAssignmentQuery } from '../queries/get-current-job-assignment.query'
import { ListEmploymentsQuery } from '../queries/list-employments.query'
import { ListJobProfilesQuery } from '../queries/list-job-profiles.query'
import type { PersonProfileResult } from '../queries/get-person-profile.handler'
import type { EmploymentResult } from '../queries/get-employment.handler'
import type { JobAssignment } from '../../domain/entities/job-assignment.entity'
import type { ListEmploymentsResult } from '../queries/list-employments.handler'
import type { JobProfile } from '../../domain/entities/job-profile.entity'
import type { EmploymentStatus } from '../../domain/value-objects/employment-status'
import {
  COUNTRY_FIELD_CONFIG_REPOSITORY,
  type ICountryFieldConfigRepository,
} from '../../domain/repositories/country-field-config.repository'
import {
  CUSTOM_FIELD_DEFINITION_REPOSITORY,
  type ICustomFieldDefinitionRepository,
} from '../../domain/repositories/custom-field-definition.repository'
import {
  FIELD_VISIBILITY_CONFIG_REPOSITORY,
  type IFieldVisibilityConfigRepository,
} from '../../domain/repositories/field-visibility-config.repository'
import {
  FIELD_EDIT_POLICY_REPOSITORY,
  type IFieldEditPolicyRepository,
} from '../../domain/repositories/field-edit-policy.repository'
import type { CountryFieldConfig } from '../../domain/entities/country-field-config.entity'
import type { CustomFieldDefinition } from '../../domain/entities/custom-field-definition.entity'
import type { FieldVisibilityConfig } from '../../domain/entities/field-visibility-config.entity'
import type { FieldEditPolicy } from '../../domain/entities/field-edit-policy.entity'

@Injectable()
export class PeopleQueryFacade {
  constructor(
    private readonly queryBus: QueryBus,
    @Inject(COUNTRY_FIELD_CONFIG_REPOSITORY)
    private readonly countryFieldConfigRepo: ICountryFieldConfigRepository,
    @Inject(CUSTOM_FIELD_DEFINITION_REPOSITORY)
    private readonly customFieldDefRepo: ICustomFieldDefinitionRepository,
    @Inject(FIELD_VISIBILITY_CONFIG_REPOSITORY)
    private readonly fieldVisibilityConfigRepo: IFieldVisibilityConfigRepository,
    @Inject(FIELD_EDIT_POLICY_REPOSITORY)
    private readonly fieldEditPolicyRepo: IFieldEditPolicyRepository,
  ) {}

  getPersonProfile(actorId: string, tenantId: string): Promise<PersonProfileResult> {
    return this.queryBus.execute(new GetPersonProfileQuery(actorId, tenantId))
  }

  getEmployment(tenantId: string, employmentId: string): Promise<EmploymentResult> {
    return this.queryBus.execute(new GetEmploymentQuery(employmentId, tenantId))
  }

  getCurrentJobAssignment(tenantId: string, employmentId: string): Promise<JobAssignment | null> {
    return this.queryBus.execute(new GetCurrentJobAssignmentQuery(employmentId, tenantId))
  }

  listEmployments(
    tenantId: string,
    limit: number,
    offset: number,
    status?: EmploymentStatus,
    countryCode?: string,
  ): Promise<ListEmploymentsResult> {
    return this.queryBus.execute(
      new ListEmploymentsQuery(tenantId, limit, offset, status, countryCode),
    )
  }

  listJobProfiles(tenantId: string, familyId?: string, isActive?: boolean): Promise<JobProfile[]> {
    return this.queryBus.execute(new ListJobProfilesQuery(tenantId, familyId, isActive))
  }

  async isActiveEmployee(tenantId: string, actorId: string): Promise<boolean> {
    const result = await this.getPersonProfile(actorId, tenantId)
    if (!result) return false
    return result.employments.some((e) => e.employment.employmentStatus === 'active')
  }

  getCountryFieldConfigs(countryCode: string): Promise<CountryFieldConfig[]> {
    return this.countryFieldConfigRepo.findByCountryCode(countryCode)
  }

  listCustomFieldDefinitions(tenantId: string): Promise<CustomFieldDefinition[]> {
    return this.customFieldDefRepo.findByTenant(tenantId)
  }

  listFieldVisibilityConfigs(tenantId: string): Promise<FieldVisibilityConfig[]> {
    return this.fieldVisibilityConfigRepo.findByTenant(tenantId)
  }

  listFieldEditPolicies(tenantId: string): Promise<FieldEditPolicy[]> {
    return this.fieldEditPolicyRepo.findByTenant(tenantId)
  }
}

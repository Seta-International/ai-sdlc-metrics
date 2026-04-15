import type { FieldEditPolicy } from '../../domain/entities/field-edit-policy.entity'

/** Default field edit policies. Tenant can customize. */
export const DEFAULT_FIELD_EDIT_POLICIES: Omit<FieldEditPolicy, 'id' | 'tenantId'>[] = [
  // Self-service — employee changes directly
  { fieldPath: 'person_profile.preferred_name', editMode: 'self_service' },
  { fieldPath: 'employment_detail.current_address', editMode: 'self_service' },
  { fieldPath: 'employment_detail.emergency_contacts', editMode: 'self_service' },
  { fieldPath: 'employment_detail.personal_email', editMode: 'self_service' },
  { fieldPath: 'employment_detail.personal_phone', editMode: 'self_service' },

  // HR approval — creates change request
  { fieldPath: 'person_profile.family_name', editMode: 'hr_approval' },
  { fieldPath: 'person_profile.given_name', editMode: 'hr_approval' },
  { fieldPath: 'person_profile.middle_name', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.bank_account_number', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.bank_name', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.bank_branch', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.bank_account_holder', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.bank_swift_code', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.national_id', editMode: 'hr_approval' },
  { fieldPath: 'employment_detail.tax_id', editMode: 'hr_approval' },

  // HR only — only HR can modify
  { fieldPath: 'employment.employment_type', editMode: 'hr_only' },
  { fieldPath: 'employment.worker_type', editMode: 'hr_only' },
  { fieldPath: 'employment.employment_status', editMode: 'hr_only' },
  { fieldPath: 'employment.employee_code', editMode: 'hr_only' },
  { fieldPath: 'employment.company_email', editMode: 'hr_only' },
  { fieldPath: 'job_assignment.job_profile_id', editMode: 'hr_only' },
  { fieldPath: 'job_assignment.department_id', editMode: 'hr_only' },
  { fieldPath: 'job_assignment.manager_id', editMode: 'hr_only' },
  { fieldPath: 'contract_version.base_salary', editMode: 'hr_only' },
]

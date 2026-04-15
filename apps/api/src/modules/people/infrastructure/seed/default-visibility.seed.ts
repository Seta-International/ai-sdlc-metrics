import type { FieldVisibilityConfig } from '../../domain/entities/field-visibility-config.entity'

/** Default field visibility tiers. Tenant can customize. */
export const DEFAULT_FIELD_VISIBILITY: Omit<FieldVisibilityConfig, 'id' | 'tenantId'>[] = [
  // Public tier — visible to all authenticated employees
  { fieldPath: 'person_profile.full_name', visibilityTier: 'public' },
  { fieldPath: 'person_profile.preferred_name', visibilityTier: 'public' },
  { fieldPath: 'person_profile.photo_document_id', visibilityTier: 'public' },
  { fieldPath: 'employment.company_email', visibilityTier: 'public' },
  { fieldPath: 'job_assignment.job_profile_id', visibilityTier: 'public' },
  { fieldPath: 'job_assignment.department_id', visibilityTier: 'public' },
  { fieldPath: 'job_assignment.location_id', visibilityTier: 'public' },
  { fieldPath: 'job_assignment.work_arrangement', visibilityTier: 'public' },

  // Restricted tier — self + direct manager + HR
  { fieldPath: 'person_profile.date_of_birth', visibilityTier: 'restricted' },
  { fieldPath: 'person_profile.gender', visibilityTier: 'restricted' },
  { fieldPath: 'person_profile.nationality', visibilityTier: 'restricted' },
  { fieldPath: 'person_profile.marital_status', visibilityTier: 'restricted' },
  { fieldPath: 'employment_detail.personal_email', visibilityTier: 'restricted' },
  { fieldPath: 'employment_detail.personal_phone', visibilityTier: 'restricted' },
  { fieldPath: 'employment_detail.current_address', visibilityTier: 'restricted' },
  { fieldPath: 'employment_detail.permanent_address', visibilityTier: 'restricted' },
  { fieldPath: 'employment_detail.emergency_contacts', visibilityTier: 'restricted' },

  // Confidential tier — self + HR only
  { fieldPath: 'employment_detail.national_id', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.tax_id', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.social_insurance_id', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.passport_number', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.bank_account_number', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.bank_name', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.bank_branch', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.bank_account_holder', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.bank_swift_code', visibilityTier: 'confidential' },
  { fieldPath: 'employment_detail.country_data', visibilityTier: 'confidential' },
  { fieldPath: 'contract_version.base_salary', visibilityTier: 'confidential' },
  { fieldPath: 'contract_version.salary_currency', visibilityTier: 'confidential' },
]

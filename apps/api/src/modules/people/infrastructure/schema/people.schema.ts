import {
  pgSchema,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  date,
  uniqueIndex,
  numeric,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const peopleSchema = pgSchema('people')

// ─── New Core Tables ───────────────────────────────────────────────────────────

export const personProfile = peopleSchema.table(
  'person_profile',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    familyName: text('family_name'),
    middleName: text('middle_name'),
    givenName: text('given_name'),
    fullName: text('full_name'),
    fullNameUnaccented: text('full_name_unaccented'),
    preferredName: text('preferred_name'),
    nameDisplayOrder: text('name_display_order', {
      enum: ['family_first', 'given_first'],
    })
      .notNull()
      .default('given_first'),
    dateOfBirth: date('date_of_birth', { mode: 'date' }),
    gender: text('gender', {
      enum: ['male', 'female', 'non_binary', 'prefer_not_to_say'],
    }),
    nationality: text('nationality'),
    maritalStatus: text('marital_status', {
      enum: ['single', 'married', 'divorced', 'widowed', 'separated'],
    }),
    photoDocumentId: uuid('photo_document_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('person_profile_tenant_actor_uidx').on(table.tenantId, table.actorId)],
)

export const employment = peopleSchema.table('employment', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  personProfileId: uuid('person_profile_id').notNull(),
  employeeCode: text('employee_code'),
  companyEmail: text('company_email'),
  workerType: text('worker_type', {
    enum: ['employee', 'contingent'],
  }).notNull(),
  employmentType: text('employment_type', {
    enum: ['permanent', 'fixed_term', 'intern'],
  }).notNull(),
  countryCode: text('country_code'),
  employmentStatus: text('employment_status', {
    enum: ['pre_hire', 'active', 'on_leave', 'suspended', 'notice_period', 'terminated'],
  })
    .notNull()
    .default('pre_hire'),
  terminationDate: date('termination_date', { mode: 'date' }),
  terminationReason: text('termination_reason', {
    enum: [
      'resignation',
      'dismissal',
      'redundancy',
      'end_of_contract',
      'retirement',
      'death',
      'abandonment',
      'mutual_agreement',
      'transfer',
      'probation_failure',
      'other',
    ],
  }),
  hireDate: date('hire_date', { mode: 'date' }).notNull(),
  originalHireDate: date('original_hire_date', { mode: 'date' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const jobAssignment = peopleSchema.table('job_assignment', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(),
  effectiveFrom: date('effective_from', { mode: 'date' }).notNull(),
  effectiveTo: date('effective_to', { mode: 'date' }),
  jobProfileId: uuid('job_profile_id'),
  departmentId: uuid('department_id'),
  locationId: uuid('location_id'),
  costCenterId: uuid('cost_center_id'),
  workArrangement: text('work_arrangement', {
    enum: ['onsite', 'hybrid', 'remote'],
  })
    .notNull()
    .default('onsite'),
  managerId: uuid('manager_id'),
  eventType: text('event_type', {
    enum: [
      'hire',
      'promotion',
      'lateral_transfer',
      'demotion',
      'reorg',
      'location_change',
      'correction',
    ],
  }).notNull(),
  reason: text('reason'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const employmentDetail = peopleSchema.table(
  'employment_detail',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    employmentId: uuid('employment_id').notNull(),
    nationalId: text('national_id'),
    nationalIdType: text('national_id_type'),
    nationalIdIssuedDate: date('national_id_issued_date', { mode: 'date' }),
    nationalIdExpiryDate: date('national_id_expiry_date', { mode: 'date' }),
    taxId: text('tax_id'),
    socialInsuranceId: text('social_insurance_id'),
    passportNumber: text('passport_number'),
    passportExpiryDate: date('passport_expiry_date', { mode: 'date' }),
    bankAccountNumber: text('bank_account_number'),
    bankName: text('bank_name'),
    bankBranch: text('bank_branch'),
    bankAccountHolder: text('bank_account_holder'),
    bankSwiftCode: text('bank_swift_code'),
    personalEmail: text('personal_email'),
    personalPhone: text('personal_phone'),
    permanentAddress: jsonb('permanent_address'),
    currentAddress: jsonb('current_address'),
    emergencyContacts: jsonb('emergency_contacts'),
    countryData: jsonb('country_data'),
    customFields: jsonb('custom_fields'),
  },
  (table) => [
    uniqueIndex('employment_detail_tenant_employment_uidx').on(table.tenantId, table.employmentId),
  ],
)

export const jobFamily = peopleSchema.table('job_family', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  parentId: uuid('parent_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const jobProfile = peopleSchema.table('job_profile', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  jobFamilyId: uuid('job_family_id'),
  title: text('title').notNull(),
  level: text('level'),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── Probation Tables ─────────────────────────────────────────────────────────

export const probationPolicy = peopleSchema.table('probation_policy', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  countryCode: text('country_code').notNull(),
  jobLevelCategory: text('job_level_category', {
    enum: ['executive', 'professional', 'technical', 'general'],
  }).notNull(),
  defaultDurationDays: integer('default_duration_days').notNull(),
  maxDurationDays: integer('max_duration_days').notNull(),
  allowExtension: boolean('allow_extension').notNull(),
  maxExtensions: integer('max_extensions').notNull().default(0),
  extensionDays: integer('extension_days'),
  minSalaryPercentage: numeric('min_salary_percentage').notNull().default('100'),
  autoConfirm: boolean('auto_confirm').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const probationRecord = peopleSchema.table('probation_record', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(),
  startDate: date('start_date', { mode: 'date' }).notNull(),
  originalEndDate: date('original_end_date', { mode: 'date' }).notNull(),
  currentEndDate: date('current_end_date', { mode: 'date' }).notNull(),
  extensionCount: integer('extension_count').notNull().default(0),
  status: text('status', {
    enum: ['active', 'passed', 'failed', 'extended', 'not_applicable'],
  }).notNull(),
  outcomeDate: date('outcome_date', { mode: 'date' }),
  outcomeBy: uuid('outcome_by'),
  outcomeNote: text('outcome_note'),
  probationPolicyId: uuid('probation_policy_id').notNull(),
  salaryPercentage: numeric('salary_percentage').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── Retained Tables ───────────────────────────────────────────────────────────

export const profileSection = peopleSchema.table('profile_section', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  sectionType: text('section_type', {
    enum: ['education', 'certification', 'skill', 'language', 'social_link', 'dependent'],
  }).notNull(),
  payload: jsonb('payload').notNull().default({}),
  displayOrder: integer('display_order').notNull().default(0),
})

export const onboardingTemplate = peopleSchema.table('onboarding_template', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  employmentType: text('employment_type', {
    enum: ['permanent', 'fixed_term', 'contractor', 'intern'],
  }),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
})

export const onboardingTaskTemplate = peopleSchema.table('onboarding_task_template', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  templateId: uuid('template_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  assigneeRole: text('assignee_role', {
    enum: ['hr', 'it', 'project_manager', 'employee'],
  }).notNull(),
  dueDaysAfterHire: integer('due_days_after_hire').notNull().default(0),
  isRequired: boolean('is_required').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
})

export const onboardingCase = peopleSchema.table('onboarding_case', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  templateId: uuid('template_id'),
  status: text('status', {
    enum: ['in_progress', 'completed'],
  })
    .notNull()
    .default('in_progress'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const onboardingTask = peopleSchema.table('onboarding_task', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  caseId: uuid('case_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  assigneeRole: text('assignee_role', {
    enum: ['hr', 'it', 'project_manager', 'employee'],
  }).notNull(),
  assigneeActorId: uuid('assignee_actor_id'),
  dueDate: timestamp('due_date'),
  isRequired: boolean('is_required').notNull().default(true),
  status: text('status', {
    enum: ['pending', 'completed', 'skipped'],
  })
    .notNull()
    .default('pending'),
  completedAt: timestamp('completed_at'),
  evidenceUrl: text('evidence_url'),
})

export const offboardingTemplate = peopleSchema.table('offboarding_template', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  employmentType: text('employment_type', {
    enum: ['permanent', 'fixed_term', 'contractor', 'intern'],
  }),
  reasonCategory: text('reason_category', {
    enum: ['voluntary', 'involuntary', 'redundancy', 'end_of_contract'],
  }),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
})

export const offboardingTaskTemplate = peopleSchema.table('offboarding_task_template', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  templateId: uuid('template_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  assigneeRole: text('assignee_role', {
    enum: ['hr', 'it', 'project_manager', 'employee', 'account_manager'],
  }).notNull(),
  dueDaysBeforeLastDay: integer('due_days_before_last_day').notNull().default(0),
  isRequired: boolean('is_required').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
})

export const offboardingCase = peopleSchema.table('offboarding_case', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  templateId: uuid('template_id'),
  reason: text('reason').notNull(),
  reasonCategory: text('reason_category', {
    enum: ['voluntary', 'involuntary', 'redundancy', 'end_of_contract'],
  }),
  decisionCaseId: uuid('decision_case_id'),
  status: text('status', {
    enum: ['pending', 'approved', 'processing', 'completed', 'rejected'],
  })
    .notNull()
    .default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const offboardingTask = peopleSchema.table('offboarding_task', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  caseId: uuid('case_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  assigneeRole: text('assignee_role', {
    enum: ['hr', 'it', 'project_manager', 'employee', 'account_manager'],
  }).notNull(),
  assigneeActorId: uuid('assignee_actor_id'),
  dueDate: timestamp('due_date'),
  isRequired: boolean('is_required').notNull().default(true),
  status: text('status', {
    enum: ['pending', 'completed', 'skipped'],
  })
    .notNull()
    .default('pending'),
  completedAt: timestamp('completed_at'),
  evidenceUrl: text('evidence_url'),
})

export const contractVersion = peopleSchema.table('contract_version', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(),
  contractType: text('contract_type', {
    enum: ['indefinite', 'fixed_term', 'seasonal', 'probation', 'internship', 'consultancy'],
  }).notNull(),
  startDate: date('start_date', { mode: 'date' }).notNull(),
  endDate: date('end_date', { mode: 'date' }),
  status: text('status', {
    enum: ['draft', 'active', 'expired', 'terminated', 'superseded'],
  })
    .notNull()
    .default('draft'),
  probationEndDate: date('probation_end_date', { mode: 'date' }),
  noticePeriodDays: integer('notice_period_days'),
  workHoursPerWeek: numeric('work_hours_per_week'),
  baseSalary: numeric('base_salary'),
  salaryCurrency: text('salary_currency'),
  salaryFrequency: text('salary_frequency', {
    enum: ['monthly', 'biweekly', 'weekly', 'annual'],
  }),
  documentId: uuid('document_id'),
  note: text('note'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  signedAt: timestamp('signed_at'),
  signedBy: uuid('signed_by'),
})

export const contractPolicy = peopleSchema.table('contract_policy', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  countryCode: text('country_code').notNull(),
  maxFixedTermMonths: integer('max_fixed_term_months'),
  maxFixedTermRenewals: integer('max_fixed_term_renewals'),
  forceIndefiniteAfter: boolean('force_indefinite_after').notNull().default(false),
  probationRequiresContract: boolean('probation_requires_contract').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── Directory Search Index ────────────────────────────────────────────────────

export const directorySearchIndex = peopleSchema.table(
  'directory_search_index',
  {
    id: uuid('id')
      .$defaultFn(() => uuidv7())
      .primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    employmentId: uuid('employment_id').notNull(),
    fullName: text('full_name').notNull(),
    fullNameUnaccented: text('full_name_unaccented').notNull(),
    companyEmail: text('company_email'),
    jobTitle: text('job_title'),
    jobLevel: text('job_level'),
    departmentName: text('department_name'),
    locationName: text('location_name'),
    managerName: text('manager_name'),
    workArrangement: text('work_arrangement').notNull(),
    employmentStatus: text('employment_status').notNull(),
    hireDate: date('hire_date', { mode: 'date' }),
    skills: text('skills').array(),
    countryCode: text('country_code').notNull(),
    searchVector: text('search_vector'), // tsvector managed via raw SQL trigger
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_directory_search_index_employment').on(table.tenantId, table.employmentId),
  ],
)

// ─── Email Generation Config ───────────────────────────────────────────────────

export const emailGenerationConfig = peopleSchema.table('email_generation_config', {
  tenantId: uuid('tenant_id').primaryKey(),
  domain: text('domain').notNull(),
  pattern: text('pattern').notNull(),
  transliteration: text('transliteration', {
    enum: ['strip_diacritics', 'custom_map'],
  }).notNull(),
})

// ─── Profile Share Link ────────────────────────────────────────────────────────

export const profileShareLink = peopleSchema.table('profile_share_link', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employmentId: uuid('employment_id').notNull(),
  token: text('token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  maxViews: integer('max_views'),
  viewCount: integer('view_count').notNull().default(0),
  status: text('status', { enum: ['active', 'revoked'] })
    .notNull()
    .default('active'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
})

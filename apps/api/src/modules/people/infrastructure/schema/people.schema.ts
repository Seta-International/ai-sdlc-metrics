import { pgSchema, uuid, text, timestamp, boolean, integer, jsonb, date } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const peopleSchema = pgSchema('people')

export const employmentProfile = peopleSchema.table('employment_profile', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  employeeCode: text('employee_code').notNull(),
  companyEmail: text('company_email').notNull(),
  employmentType: text('employment_type', {
    enum: ['permanent', 'fixed_term', 'contractor', 'intern'],
  }).notNull(),
  employmentStatus: text('employment_status', {
    enum: ['pre_hire', 'active', 'on_leave', 'offboarding', 'terminated'],
  })
    .notNull()
    .default('pre_hire'),
  workArrangement: text('work_arrangement', {
    enum: ['onsite', 'hybrid', 'remote'],
  })
    .notNull()
    .default('onsite'),
  hireDate: timestamp('hire_date').notNull(),
  terminationDate: timestamp('termination_date'),
  jobTitle: text('job_title').notNull(),
  jobLevel: text('job_level'),
  costCenter: text('cost_center'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const employmentProfileDetail = peopleSchema.table('employment_profile_detail', {
  profileId: uuid('profile_id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  nationalId: text('national_id'),
  nationalIdIssuedDate: date('national_id_issued_date'),
  nationalIdIssuedPlace: text('national_id_issued_place'),
  oldNationalId: text('old_national_id'),
  oldNationalIdIssuedDate: date('old_national_id_issued_date'),
  oldNationalIdIssuedPlace: text('old_national_id_issued_place'),
  taxId: text('tax_id'),
  socialInsuranceNumber: text('social_insurance_number'),
  bankAccountNumber: text('bank_account_number'),
  bankName: text('bank_name'),
  bankBranch: text('bank_branch'),
  dob: date('dob'),
  gender: text('gender'),
  maritalStatus: text('marital_status'),
  permanentAddress: text('permanent_address'),
  currentAddress: text('current_address'),
  personalPhone: text('personal_phone'),
  personalEmail: text('personal_email'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  motorbikePlate: text('motorbike_plate'),
})

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

export const profileChangeRequest = peopleSchema.table('profile_change_request', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  fieldPath: text('field_path').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value').notNull(),
  status: text('status', {
    enum: ['pending', 'approved', 'rejected', 'superseded'],
  })
    .notNull()
    .default('pending'),
  decisionCaseId: uuid('decision_case_id'),
  requestedBy: uuid('requested_by').notNull(),
  reviewedBy: uuid('reviewed_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const periodicProfileReview = peopleSchema.table('periodic_profile_review', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  dueDate: timestamp('due_date').notNull(),
  status: text('status', {
    enum: ['pending', 'completed', 'skipped'],
  })
    .notNull()
    .default('pending'),
  completedAt: timestamp('completed_at'),
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
  assigneeRole: text('assignee_role', {
    enum: ['hr', 'it', 'project_manager', 'employee'],
  }).notNull(),
  assigneeActorId: uuid('assignee_actor_id'),
  dueDate: timestamp('due_date'),
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
  assigneeRole: text('assignee_role', {
    enum: ['hr', 'it', 'project_manager', 'employee', 'account_manager'],
  }).notNull(),
  assigneeActorId: uuid('assignee_actor_id'),
  dueDate: timestamp('due_date'),
  status: text('status', {
    enum: ['pending', 'completed', 'skipped'],
  })
    .notNull()
    .default('pending'),
  completedAt: timestamp('completed_at'),
  evidenceUrl: text('evidence_url'),
})

export const accountMembership = peopleSchema.table('account_membership', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  accountId: uuid('account_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  roleKey: text('role_key', {
    enum: ['account_manager', 'staffing_owner', 'member'],
  }).notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  leftAt: timestamp('left_at'),
})

export const contractVersion = peopleSchema.table('contract_version', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  profileId: uuid('profile_id').notNull(),
  contractType: text('contract_type').notNull(),
  status: text('status', {
    enum: ['draft', 'active', 'expired', 'terminated'],
  })
    .notNull()
    .default('draft'),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  probationEndDate: timestamp('probation_end_date'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

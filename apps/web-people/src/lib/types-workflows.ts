// apps/web-people/src/lib/types-workflows.ts

// --- Onboarding / Offboarding ---
export type OnboardingCase = {
  id: string
  employmentId: string
  employeeName: string
  avatarUrl: string | null
  templateName: string
  startDate: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  tasksTotal: number
  tasksCompleted: number
  department: string
}

export type OffboardingCase = {
  id: string
  employmentId: string
  employeeName: string
  avatarUrl: string | null
  reasonCategory: string
  terminationReason: string | null
  lastWorkingDay: string
  status: 'pending_approval' | 'in_progress' | 'completed' | 'cancelled'
  tasksTotal: number
  tasksCompleted: number
}

export type WorkflowTask = {
  id: string
  caseId: string
  employeeName: string
  title: string
  description: string | null
  assigneeRole: string
  assigneeId: string | null
  assigneeName: string | null
  dueDate: string | null
  isOverdue: boolean
  isRequired: boolean
  status: 'pending' | 'completed' | 'skipped'
  evidenceDocumentId: string | null
  linkedDocumentRequirement: string | null
}

// --- Change Requests (P7) ---
export type ChangeRequestRow = {
  id: string
  employmentId: string
  employeeName: string
  avatarUrl: string | null
  fieldPath: string
  fieldLabel: string
  oldValue: string
  newValue: string
  requestedBy: string
  requestedByName: string
  requestedAt: string
  effectiveDate: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  reviewNote: string | null
  editPolicyLabel: string
}

// --- Reports ---
export type HeadcountSummary = {
  totalActive: number
  newHiresThisMonth: number
  terminationsThisMonth: number
  netChange: number
  trend: Array<{ month: string; count: number }>
  byDepartment: Array<{ name: string; count: number }>
  byCountry: Array<{ code: string; name: string; count: number }>
  byType: Array<{ type: string; count: number }>
}

export type CompletenessRow = {
  employmentId: string
  employeeName: string
  department: string
  score: number
  missingCount: number
  daysSinceHire: number
}

export type ExpiringDocumentRow = {
  employmentId: string
  employeeName: string
  documentTitle: string
  category: string
  expiryDate: string
  daysRemaining: number
}

export type ProbationRow = {
  employmentId: string
  employeeName: string
  startDate: string
  endDate: string
  daysRemaining: number
  status: 'in_progress' | 'extended' | 'overdue'
}

export type ExpiringContractRow = {
  employmentId: string
  employeeName: string
  contractType: string
  endDate: string
  daysRemaining: number
  country: string
}

// --- Settings ---
export type JobFamily = {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  isActive: boolean
  profileCount: number
  children?: JobFamily[]
}

export type JobProfileRow = {
  id: string
  title: string
  level: string | null
  familyId: string
  isActive: boolean
  assignmentCount: number
}

export type OnboardingTemplate = {
  id: string
  name: string
  countryScope: string | null
  employmentTypeScope: string | null
  isDefault: boolean
  taskCount: number
  tasks: TemplateTask[]
}

export type TemplateTask = {
  id: string
  title: string
  description: string | null
  assigneeRole: string
  dueDays: number
  isRequired: boolean
  linkedDocumentRequirement: string | null
  sortOrder: number
}

export type CountryConfig = {
  code: string
  name: string
  fieldCount: number
  probationPolicyCount: number
  documentRequirementCount: number
}

export type CustomFieldDefinition = {
  id: string
  fieldKey: string
  label: string
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select'
  group: string
  isRequired: boolean
  isSearchable: boolean
  isFilterable: boolean
  visibilityTier: 'public' | 'restricted' | 'confidential'
  isActive: boolean
  options: string[] | null
  validationRules: Record<string, unknown> | null
}

export type FieldPolicyEntry = {
  fieldPath: string
  fieldLabel: string
  section: string
  editMode: 'self_service' | 'manager_approval' | 'hr_approval' | 'hr_only'
}

export type FieldVisibilityEntry = {
  fieldPath: string
  fieldLabel: string
  section: string
  tier: 'public' | 'restricted' | 'confidential'
}

export type EmailConfig = {
  domain: string
  pattern: 'given_family' | 'given_initial_family' | 'family_given' | 'given_dot_family'
  transliterationMode: 'ascii' | 'vietnamese_ascii'
}

export type CompletenessRule = {
  id: string
  fieldPath: string
  label: string
  section: string
  weight: number
  isRequired: boolean
  countryScope: string | null
  deadlineDays: number | null
}

export type ImportJob = {
  id: string
  filename: string
  status: 'processing' | 'completed' | 'failed'
  createdCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  uploadedBy: string
  uploadedAt: string
}

// --- Bulk Operations ---
export type BulkOperationType = 'change_department' | 'change_manager' | 'change_status'

export type BulkPreviewRow = {
  employmentId: string
  employeeName: string
  currentValue: string
  newValue: string
  isValid: boolean
  validationError: string | null
}

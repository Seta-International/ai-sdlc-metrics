// apps/web-people/src/lib/types.ts

// --- Directory row (P1) ---
export type DirectoryRow = {
  id: string // employment.id
  personProfileId: string
  avatarUrl: string | null
  fullName: string
  preferredName: string | null
  jobTitle: string // from job_profile via job_assignment
  jobLevel: string | null
  department: string
  departmentId: string
  location: string | null
  countryCode: string
  companyEmail: string | null
  employmentStatus: EmploymentStatus
  employmentType: EmploymentType
  workerType: WorkerType
  workArrangement: WorkArrangement | null
  managerId: string | null
  managerName: string | null
  hireDate: string
}

export type EmploymentStatus =
  | 'pre_hire'
  | 'active'
  | 'on_leave'
  | 'suspended'
  | 'notice_period'
  | 'terminated'

export type EmploymentType = 'permanent' | 'fixed_term' | 'intern'

export type WorkerType = 'employee' | 'contingent'

export type WorkArrangement = 'on_site' | 'remote' | 'hybrid'

// --- Profile (P3/P4) ---
export type EmployeeProfile = {
  personProfile: PersonProfile
  employment: Employment
  currentJob: CurrentJobAssignment | null
  emergencyContacts: EmergencyContact[]
  addresses: Address[]
  countryFields: CountryFieldValue[]
  customFields: CustomFieldValue[]
  bankDetails: BankDetails | null
  probation: ProbationRecord | null
  completenessScore: number
  completenessMissing: string[]
}

export type PersonProfile = {
  id: string
  actorId: string
  familyName: string
  givenName: string
  middleName: string | null
  fullName: string
  preferredName: string | null
  nameDisplayOrder: 'family_first' | 'given_first'
  dateOfBirth: string | null
  gender: string | null
  nationality: string | null
  maritalStatus: string | null
  photoUrl: string | null
}

export type Employment = {
  id: string
  employeeCode: string | null
  companyEmail: string | null
  workerType: WorkerType
  employmentType: EmploymentType
  countryCode: string
  employmentStatus: EmploymentStatus
  hireDate: string
  terminationDate: string | null
  terminationReason: string | null
  workArrangement: WorkArrangement | null
}

export type CurrentJobAssignment = {
  id: string
  jobProfileId: string
  jobTitle: string
  jobLevel: string | null
  jobFamilyName: string
  departmentId: string
  departmentName: string
  locationId: string | null
  locationName: string | null
  costCenter: string | null
  managerId: string | null
  managerName: string | null
  effectiveDate: string
}

export type EmergencyContact = {
  id: string
  name: string
  relationship: string
  phone: string
  email: string | null
}

export type Address = {
  id: string
  type: 'permanent' | 'current'
  line1: string
  line2: string | null
  city: string
  state: string | null
  postalCode: string | null
  country: string
}

export type CountryFieldValue = {
  fieldKey: string
  label: string
  group: string
  type: string
  value: unknown
}

export type CustomFieldValue = {
  fieldKey: string
  label: string
  group: string
  type: string
  value: unknown
}

export type BankDetails = {
  accountNumber: string // masked unless revealed
  bankName: string | null
  branchName: string | null
  holderName: string | null
  swiftCode: string | null
}

export type ProbationRecord = {
  id: string
  status: 'in_progress' | 'passed' | 'failed' | 'extended'
  startDate: string
  endDate: string
  originalEndDate: string
  extensions: ProbationExtension[]
  salaryPercentage: number | null
  outcome: string | null
  outcomeDate: string | null
}

export type ProbationExtension = {
  extendedDate: string
  reason: string
  extendedBy: string
}

// --- Job History (Tab 2) ---
export type JobHistoryEntry = {
  id: string
  eventType: 'hire' | 'promotion' | 'lateral' | 'demotion' | 'reorg' | 'termination'
  effectiveDate: string
  jobTitle: string
  department: string
  manager: string | null
  reason: string | null
  isCurrent: boolean
  isFuture: boolean
  before: Record<string, string> | null
  after: Record<string, string> | null
}

// --- Documents (Tab 3) ---
export type EmployeeDocument = {
  id: string
  title: string
  category: string
  uploadDate: string
  expiryDate: string | null
  status: 'valid' | 'expiring_soon' | 'expired' | 'pending_review'
  isConfidential: boolean
  documentId: string // reference to documents module
}

export type DocumentRequirement = {
  category: string
  title: string
  required: boolean
  deadlineDays: number | null
  submitted: boolean
  documentId: string | null
}

// --- Contracts (Tab 4) ---
export type ContractVersion = {
  id: string
  contractType: 'indefinite' | 'fixed_term' | 'probation'
  status: 'active' | 'expired' | 'superseded' | 'draft'
  startDate: string
  endDate: string | null
  baseSalary: number | null // confidential
  currency: string | null
  signedDate: string | null
  documentId: string | null
}

// --- Profile Sections (Tab 5) ---
export type ProfileSection = {
  id: string
  sectionType:
    | 'education'
    | 'work_experience'
    | 'certification'
    | 'skill'
    | 'language'
    | 'social_link'
    | 'dependent'
  data: Record<string, unknown>
  sortOrder: number
}

// --- Change Requests (Tab 6) ---
export type ChangeRequest = {
  id: string
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
  reviewedAt: string | null
  reviewNote: string | null
}

// --- Org Chart (P2) ---
export type OrgChartNode = {
  employmentId: string
  personProfileId: string
  fullName: string
  avatarUrl: string | null
  jobTitle: string
  department: string
  directReportCount: number
  managerId: string | null
  children?: OrgChartNode[]
}

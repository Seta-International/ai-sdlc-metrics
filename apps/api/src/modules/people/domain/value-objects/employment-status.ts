export type EmploymentStatus =
  | 'pre_hire'
  | 'active'
  | 'on_leave'
  | 'suspended'
  | 'notice_period'
  | 'terminated'

export type TerminationReason =
  | 'voluntary_resignation'
  | 'involuntary_performance'
  | 'involuntary_misconduct'
  | 'redundancy'
  | 'end_of_contract'
  | 'mutual_agreement'
  | 'retirement'
  | 'deceased'
  | 'failed_probation'
  | 'no_show'
  | 'company_closure'

export type WorkerType = 'employee' | 'contingent'

export type EmploymentType = 'permanent' | 'fixed_term' | 'intern'

export type WorkArrangement = 'onsite' | 'hybrid' | 'remote'

export type JobAssignmentEventType =
  | 'hire'
  | 'promotion'
  | 'lateral_transfer'
  | 'demotion'
  | 'reorg'
  | 'location_change'
  | 'correction'

export const EMPLOYMENT_STATUS_VALUES: EmploymentStatus[] = [
  'pre_hire',
  'active',
  'on_leave',
  'suspended',
  'notice_period',
  'terminated',
]

export const TERMINATION_REASON_VALUES: TerminationReason[] = [
  'voluntary_resignation',
  'involuntary_performance',
  'involuntary_misconduct',
  'redundancy',
  'end_of_contract',
  'mutual_agreement',
  'retirement',
  'deceased',
  'failed_probation',
  'no_show',
  'company_closure',
]

export const WORKER_TYPE_VALUES: WorkerType[] = ['employee', 'contingent']
export const EMPLOYMENT_TYPE_VALUES: EmploymentType[] = ['permanent', 'fixed_term', 'intern']
export const WORK_ARRANGEMENT_VALUES: WorkArrangement[] = ['onsite', 'hybrid', 'remote']
export const JOB_ASSIGNMENT_EVENT_TYPE_VALUES: JobAssignmentEventType[] = [
  'hire',
  'promotion',
  'lateral_transfer',
  'demotion',
  'reorg',
  'location_change',
  'correction',
]

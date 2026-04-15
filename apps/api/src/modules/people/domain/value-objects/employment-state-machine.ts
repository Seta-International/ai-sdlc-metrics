import { InvalidEmploymentStatusTransitionException } from '../exceptions/people.exceptions'
import type { EmploymentStatus } from './employment-status'

export interface TransitionDefinition {
  from: EmploymentStatus
  to: EmploymentStatus
  guard?: string
}

const VALID_TRANSITIONS: TransitionDefinition[] = [
  { from: 'pre_hire', to: 'active', guard: 'Start date reached, onboarding complete' },
  { from: 'pre_hire', to: 'terminated', guard: 'Reason: no_show' },
  { from: 'active', to: 'on_leave', guard: 'Leave type and expected return date required' },
  { from: 'active', to: 'suspended', guard: 'Reason and review date required' },
  { from: 'active', to: 'notice_period', guard: 'Last working day required' },
  {
    from: 'active',
    to: 'terminated',
    guard: 'Direct termination: deceased, failed_probation, gross_misconduct',
  },
  { from: 'on_leave', to: 'active', guard: 'Return date provided' },
  { from: 'on_leave', to: 'terminated', guard: 'Rare: company closure' },
  { from: 'suspended', to: 'active', guard: 'Reinstatement reason provided' },
  { from: 'suspended', to: 'terminated', guard: 'Investigation concluded' },
  { from: 'notice_period', to: 'terminated', guard: 'Last working day reached' },
]

export function canTransition(from: EmploymentStatus, to: EmploymentStatus): boolean {
  return VALID_TRANSITIONS.some((t) => t.from === from && t.to === to)
}

export function getValidTargetStates(from: EmploymentStatus): EmploymentStatus[] {
  return VALID_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to)
}

export function assertValidTransition(from: EmploymentStatus, to: EmploymentStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidEmploymentStatusTransitionException(from, to)
  }
}

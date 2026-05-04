import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TabOverview } from './TabOverview'
import type { EmployeeProfile } from '../../../lib/types'

vi.mock('../../../lib/trpc', () => ({ trpc: {} }))
vi.mock('../../../lib/hooks/use-change-requests', () => ({
  usePendingFieldPaths: () => new Set(),
}))

vi.mock('../cards/ProfileCard', () => ({
  ProfileCard: ({
    title,
    locked,
    children,
    action,
  }: {
    title: string
    locked?: boolean
    children: React.ReactNode
    action?: { label: string; onClick: () => void }
  }) => (
    <div data-testid={`profile-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      {action && <button>{action.label}</button>}
      {locked && <span data-testid="locked-indicator" />}
      {children}
    </div>
  ),
  KVRow: ({ label, value }: { label: string; value: string | null }) => (
    <div>
      <span>{label}</span>
      <span>{value ?? '—'}</span>
    </div>
  ),
}))

vi.mock('../rail/SideRail', () => ({
  SideRail: ({ employmentId }: { employmentId: string }) => (
    <div data-testid={`side-rail-${employmentId}`} />
  ),
}))

vi.mock('@future/ui', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Input: ({ ...props }: any) => <input {...props} />,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Spinner: ({ className }: any) => <div data-testid="spinner" className={className} />,
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

function makeProfile(): EmployeeProfile {
  return {
    personProfile: {
      id: 'pp-1',
      actorId: 'actor-1',
      familyName: 'Nguyen',
      givenName: 'An',
      middleName: null,
      fullName: 'Nguyen An',
      preferredName: null,
      nameDisplayOrder: 'given_first',
      dateOfBirth: null,
      gender: null,
      nationality: null,
      maritalStatus: null,
      photoUrl: null,
    },
    employment: {
      id: 'emp-1',
      employeeCode: 'EMP001',
      companyEmail: 'an@seta.vn',
      workerType: 'employee',
      employmentType: 'permanent',
      countryCode: 'VN',
      employmentStatus: 'active',
      hireDate: '2025-01-01',
      terminationDate: null,
      terminationReason: null,
      workArrangement: null,
    },
    currentJob: null,
    emergencyContacts: [],
    addresses: [],
    countryFields: [],
    customFields: [],
    bankDetails: null,
    probation: null,
    completenessScore: 0,
    completenessMissing: [],
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TabOverview — edit mode', () => {
  it('does not render preferred-name input when not editing', () => {
    render(
      <TabOverview
        profile={makeProfile()}
        employmentId="emp-1"
        canEditPersonal={true}
        canEditBank={false}
        canViewSalary={false}
        isEditing={false}
        dirtyFields={new Map()}
        onFieldChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(screen.queryByRole('textbox', { name: /preferred name/i })).toBeNull()
  })

  it('renders preferred-name as an input when editing', () => {
    render(
      <TabOverview
        profile={makeProfile()}
        employmentId="emp-1"
        canEditPersonal={true}
        canEditBank={false}
        canViewSalary={false}
        isEditing={true}
        dirtyFields={new Map()}
        onFieldChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    expect(screen.getByRole('textbox', { name: /preferred name/i })).toBeTruthy()
  })

  it('calls onFieldChange when a field is modified', () => {
    const onFieldChange = vi.fn()
    render(
      <TabOverview
        profile={makeProfile()}
        employmentId="emp-1"
        canEditPersonal={true}
        canEditBank={false}
        canViewSalary={false}
        isEditing={true}
        dirtyFields={new Map()}
        onFieldChange={onFieldChange}
        onSaved={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: /preferred name/i }), {
      target: { value: 'An Nguyen' },
    })
    expect(onFieldChange).toHaveBeenCalledWith('person_profile.preferred_name', null, 'An Nguyen')
  })
})

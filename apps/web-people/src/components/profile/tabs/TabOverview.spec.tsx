import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TabOverview } from './TabOverview'
import type { EmployeeProfile } from '../../../lib/types'

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

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    people: {
      getDirectReports: { query: vi.fn().mockResolvedValue([]) },
      getActivityFeed: { query: vi.fn().mockResolvedValue({ events: [], nextCursor: null }) },
    },
  },
}))

vi.mock('../../../lib/hooks/use-change-requests', () => ({
  usePendingFieldPaths: () => new Set(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const baseProfile: EmployeeProfile = {
  personProfile: {
    id: 'pp-1',
    actorId: 'actor-1',
    familyName: 'Johnson',
    givenName: 'Alice',
    middleName: null,
    fullName: 'Alice Johnson',
    preferredName: 'Ali',
    nameDisplayOrder: 'given_first',
    dateOfBirth: '1990-01-15',
    gender: 'female',
    nationality: 'SG',
    maritalStatus: 'single',
    photoUrl: null,
  },
  employment: {
    id: 'emp-1',
    employeeCode: 'E-001',
    companyEmail: 'alice@co.com',
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'SG',
    employmentStatus: 'active',
    hireDate: '2023-01-15',
    terminationDate: null,
    terminationReason: null,
    workArrangement: 'hybrid',
  },
  currentJob: {
    id: 'job-1',
    jobProfileId: 'jp-1',
    jobTitle: 'Senior Engineer',
    jobLevel: 'L5',
    jobFamilyName: 'Engineering',
    departmentId: 'dept-1',
    departmentName: 'Engineering',
    locationId: null,
    locationName: null,
    costCenter: null,
    managerId: null,
    managerName: null,
    effectiveDate: '2023-01-15',
  },
  personalEmail: null,
  personalPhone: null,
  officeLocation: null,
  workPhone: null,
  emergencyContacts: [
    {
      id: 'ec-1',
      name: 'Bob Johnson',
      relationship: 'Spouse',
      phone: '+65 9999 0000',
      email: null,
    },
  ],
  addresses: [],
  countryFields: [],
  customFields: [],
  bankDetails: null,
  probation: null,
  completenessScore: 82,
  completenessMissing: ['dateOfBirth'],
}

describe('TabOverview', () => {
  it('renders the About card', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={false}
        canEditBank={false}
        canViewSalary={false}
        isEditing={false}
        dirtyFields={new Map()}
        onFieldChange={vi.fn()}
        onSaved={() => {}}
      />,
    )
    expect(screen.getByTestId('profile-card-about')).toBeTruthy()
  })

  it('renders the Job card', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={false}
        canEditBank={false}
        canViewSalary={false}
        isEditing={false}
        dirtyFields={new Map()}
        onFieldChange={vi.fn()}
        onSaved={() => {}}
      />,
    )
    expect(screen.getByTestId('profile-card-job')).toBeTruthy()
  })

  it('renders the Compensation card locked when canViewSalary is false', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={false}
        canEditBank={false}
        canViewSalary={false}
        isEditing={false}
        dirtyFields={new Map()}
        onFieldChange={vi.fn()}
        onSaved={() => {}}
      />,
    )
    expect(screen.getByTestId('profile-card-compensation')).toBeTruthy()
    expect(screen.getByTestId('locked-indicator')).toBeTruthy()
  })

  it('renders the Compensation card unlocked when canViewSalary is true', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={false}
        canEditBank={false}
        canViewSalary={true}
        isEditing={false}
        dirtyFields={new Map()}
        onFieldChange={vi.fn()}
        onSaved={() => {}}
      />,
    )
    expect(screen.queryByTestId('locked-indicator')).toBeNull()
  })

  it('renders emergency contact names', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={false}
        canEditBank={false}
        canViewSalary={false}
        isEditing={false}
        dirtyFields={new Map()}
        onFieldChange={vi.fn()}
        onSaved={() => {}}
      />,
    )
    expect(screen.getByText('Bob Johnson')).toBeTruthy()
  })

  it('renders the SideRail with correct employmentId', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={false}
        canEditBank={false}
        canViewSalary={false}
        isEditing={false}
        dirtyFields={new Map()}
        onFieldChange={vi.fn()}
        onSaved={() => {}}
      />,
    )
    expect(screen.getByTestId('side-rail-emp-1')).toBeTruthy()
  })
})

describe('TabOverview — view mode', () => {
  it('does not show Save/Cancel buttons when isEditing is false', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={true}
        canEditBank={false}
        canViewSalary={false}
        isEditing={false}
        dirtyFields={new Map()}
        onFieldChange={vi.fn()}
        onSaved={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull()
  })

  it('renders imported Microsoft contact details when they are present on the profile model', () => {
    render(
      <TabOverview
        profile={
          {
            ...baseProfile,
            personalPhone: '0901',
            officeLocation: 'HCM',
            workPhone: '0902',
          } as EmployeeProfile
        }
        employmentId="emp-1"
        canEditPersonal={false}
        canEditBank={false}
        canViewSalary={false}
        isEditing={false}
        dirtyFields={new Map()}
        onFieldChange={vi.fn()}
        onSaved={() => {}}
      />,
    )

    expect(screen.getByText('0901')).toBeTruthy()
    expect(screen.getByText('HCM')).toBeTruthy()
    expect(screen.getByText('0902')).toBeTruthy()
  })
})

describe('TabOverview — edit mode', () => {
  it('shows inline input fields when isEditing is true', () => {
    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={true}
        canEditBank={false}
        canViewSalary={false}
        isEditing={true}
        dirtyFields={new Map()}
        onFieldChange={vi.fn()}
        onSaved={() => {}}
      />,
    )
    expect(screen.getByRole('textbox', { name: /preferred name/i })).toBeTruthy()
  })
})

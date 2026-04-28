import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
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
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: ({ ...props }: any) => <input {...props} />,
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
      updatePersonalProfile: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
          isPending: false,
        })),
      },
    },
  },
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
        onSaved={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull()
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
        onSaved={() => {}}
      />,
    )
    const preferredNameInput = screen.getByPlaceholderText(/preferred name/i)
    expect(preferredNameInput).toBeDefined()
  })

  it('calls updatePersonalProfile mutation on Save', async () => {
    const { trpc } = await import('../../../lib/trpc')
    const mutateMock = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(trpc as any).people.updatePersonalProfile.useMutation.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    })

    render(
      <TabOverview
        profile={baseProfile}
        employmentId="emp-1"
        canEditPersonal={true}
        canEditBank={false}
        canViewSalary={false}
        isEditing={true}
        onSaved={() => {}}
      />,
    )

    const preferredNameInput = screen.getByPlaceholderText(/preferred name/i)
    fireEvent.change(preferredNameInput, { target: { value: 'An Nguyen' } })

    const aboutSaveButton = screen.getAllByRole('button', { name: /save/i })[0]
    fireEvent.click(aboutSaveButton!)

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith(
        expect.objectContaining({ employmentId: 'emp-1', preferredName: 'An Nguyen' }),
        expect.anything(),
      )
    })
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileHero } from './ProfileHero'
import type { EmployeeProfile } from '../../../lib/types'
import type { ProfilePermissions } from '../ProfilePage'

vi.mock('../../../components/StatusBadge', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}))

vi.mock('@future/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/ui')>()
  return {
    ...actual,
    TabsList: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="tabs-list">{children}</div>
    ),
    TabsTrigger: ({ value, children }: { value: string; children: React.ReactNode }) => (
      <button data-value={value}>{children}</button>
    ),
  }
})

vi.mock('./RehireDialog', () => ({
  RehireDialog: () => <div data-testid="rehire-dialog" />,
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
    employeeCode: 'E-001',
    companyEmail: 'alice@co.com',
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'SG',
    employmentStatus: 'active',
    hireDate: '2023-01-15',
    terminationDate: null,
    terminationReason: null,
    workArrangement: null,
  },
  currentJob: {
    id: 'job-1',
    jobProfileId: 'jp-1',
    jobTitle: 'Senior Engineer',
    jobLevel: 'L5',
    jobFamilyName: 'Engineering',
    departmentId: 'dept-1',
    departmentName: 'Engineering',
    locationId: 'loc-1',
    locationName: 'Singapore',
    costCenter: null,
    managerId: null,
    managerName: null,
    effectiveDate: '2023-01-15',
  },
  personalEmail: null,
  personalPhone: null,
  officeLocation: null,
  workPhone: null,
  emergencyContacts: [],
  addresses: [],
  countryFields: [],
  customFields: [],
  bankDetails: null,
  probation: null,
  completenessScore: 0,
  completenessMissing: [],
}

const noPerms: ProfilePermissions = {
  canEdit: false,
  canManage: false,
  isSelf: false,
  canEditPersonal: false,
  canEditEmployment: false,
  canEditBank: false,
  canUploadDocuments: false,
  canCreateContract: false,
  canViewSalary: false,
  canApproveChanges: false,
}

describe('ProfileHero', () => {
  it('renders full name', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        isEditing={false}
        onEdit={vi.fn()}
        onDoneEditing={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('Alice Johnson')).toBeTruthy()
  })

  it('renders status badge from employment status', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        isEditing={false}
        onEdit={vi.fn()}
        onDoneEditing={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('active')).toBeTruthy()
  })

  it('renders job title and department from currentJob', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        isEditing={false}
        onEdit={vi.fn()}
        onDoneEditing={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('Senior Engineer')).toBeTruthy()
    expect(screen.getByText('Engineering')).toBeTruthy()
  })

  it('renders company email in contact row', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        isEditing={false}
        onEdit={vi.fn()}
        onDoneEditing={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('alice@co.com')).toBeTruthy()
  })

  it('renders 6 tab triggers', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        isEditing={false}
        onEdit={vi.fn()}
        onDoneEditing={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    const tabList = screen.getByTestId('tabs-list')
    expect(tabList.querySelectorAll('button').length).toBe(6)
  })

  it('hides Edit profile button when canEdit is false', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        isEditing={false}
        onEdit={vi.fn()}
        onDoneEditing={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.queryByText('Edit profile')).toBeNull()
  })

  it('shows Edit profile button when canEdit is true', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={{ ...noPerms, canEdit: true }}
        isEditing={false}
        onEdit={vi.fn()}
        onDoneEditing={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText('Edit profile')).toBeTruthy()
  })

  it('shows terminated banner when employmentStatus is terminated', () => {
    const terminated: EmployeeProfile = {
      ...baseProfile,
      employment: {
        ...baseProfile.employment,
        employmentStatus: 'terminated',
        terminationDate: '2026-03-12',
        terminationReason: 'Resignation',
      },
    }
    render(
      <ProfileHero
        profile={terminated}
        permissions={noPerms}
        isEditing={false}
        onEdit={vi.fn()}
        onDoneEditing={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByText(/Employment ended/)).toBeTruthy()
    expect(screen.getByText('Rehire')).toBeTruthy()
  })

  it('does not show terminated banner for active employees', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        isEditing={false}
        onEdit={vi.fn()}
        onDoneEditing={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Employment ended/)).toBeNull()
  })

  it('opens RehireDialog when Rehire is clicked', async () => {
    const terminated: EmployeeProfile = {
      ...baseProfile,
      employment: {
        ...baseProfile.employment,
        employmentStatus: 'terminated',
        terminationDate: '2026-03-12',
        terminationReason: 'Resignation',
      },
    }
    render(
      <ProfileHero
        profile={terminated}
        permissions={noPerms}
        isEditing={false}
        onEdit={vi.fn()}
        onDoneEditing={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByText('Rehire'))
    expect(screen.getByTestId('rehire-dialog')).toBeTruthy()
  })

  it('does not render Sync from Microsoft button', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={noPerms}
        isEditing={false}
        onEdit={vi.fn()}
        onDoneEditing={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.queryByText('Sync from Microsoft')).toBeNull()
  })
})

describe('ProfileHero — editing mode', () => {
  it('shows "Done editing" button when isEditing is true', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={{ ...noPerms, canEdit: true }}
        isEditing={true}
        onEdit={vi.fn()}
        onDoneEditing={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /done editing/i })).toBeDefined()
  })

  it('shows "Edit profile" button when isEditing is false', () => {
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={{ ...noPerms, canEdit: true }}
        isEditing={false}
        onEdit={vi.fn()}
        onDoneEditing={vi.fn()}
        onShare={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /edit profile/i })).toBeDefined()
    expect(screen.queryByRole('button', { name: /done editing/i })).toBeNull()
  })

  it('calls onDoneEditing when Done editing is clicked', async () => {
    const onDoneEditing = vi.fn()
    render(
      <ProfileHero
        profile={baseProfile}
        permissions={{ ...noPerms, canEdit: true }}
        isEditing={true}
        onEdit={vi.fn()}
        onDoneEditing={onDoneEditing}
        onShare={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /done editing/i }))
    expect(onDoneEditing).toHaveBeenCalledOnce()
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TabOverview } from './TabOverview'
import type { EmployeeProfile } from '../../../lib/types'

vi.mock('../cards/ProfileCard', () => ({
  ProfileCard: ({
    title,
    locked,
    children,
  }: {
    title: string
    locked?: boolean
    children: React.ReactNode
  }) => (
    <div data-testid={`profile-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
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

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    people: {
      getDirectReports: { query: vi.fn().mockResolvedValue([]) },
      getActivityFeed: { query: vi.fn().mockResolvedValue({ events: [], nextCursor: null }) },
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
        canViewSalary={false}
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
        canViewSalary={false}
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
        canViewSalary={false}
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
        canViewSalary={true}
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
        canViewSalary={false}
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
        canViewSalary={false}
      />,
    )
    expect(screen.getByTestId('side-rail-emp-1')).toBeTruthy()
  })
})

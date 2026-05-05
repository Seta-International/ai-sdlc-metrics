import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { SideRail } from './SideRail'
import type { EmployeeProfile } from '../../../lib/types'

const { mockGetDirectReports, mockGetActivityFeed } = vi.hoisted(() => ({
  mockGetDirectReports: vi.fn().mockResolvedValue([]),
  mockGetActivityFeed: vi.fn().mockResolvedValue({ events: [], nextCursor: null }),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    people: {
      getDirectReports: { query: mockGetDirectReports },
      getActivityFeed: { query: mockGetActivityFeed },
    },
  },
}))

vi.mock('../cards/SideCard', () => ({
  SideCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid={`side-card-${title.toLowerCase().replace(' ', '-')}`}>{children}</div>
  ),
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
    locationId: null,
    locationName: null,
    costCenter: null,
    managerId: 'mgr-1',
    managerName: 'Bob Smith',
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
  completenessScore: 82,
  completenessMissing: ['dateOfBirth', 'address'],
}

describe('SideRail', () => {
  it('renders Completeness widget with score', () => {
    render(<SideRail profile={baseProfile} employmentId="emp-1" onViewAll={() => {}} />)
    expect(screen.getByText('82')).toBeTruthy()
  })

  it('renders Reports to widget with manager name', () => {
    render(<SideRail profile={baseProfile} employmentId="emp-1" onViewAll={() => {}} />)
    expect(screen.getByText('Bob Smith')).toBeTruthy()
  })

  it('calls getDirectReports with employmentId', async () => {
    render(<SideRail profile={baseProfile} employmentId="emp-1" onViewAll={() => {}} />)
    await waitFor(() =>
      expect(mockGetDirectReports).toHaveBeenCalledWith({ employmentId: 'emp-1' }),
    )
  })

  it('calls getActivityFeed with employmentId and limit 3', async () => {
    render(<SideRail profile={baseProfile} employmentId="emp-1" onViewAll={() => {}} />)
    await waitFor(() =>
      expect(mockGetActivityFeed).toHaveBeenCalledWith({
        employmentId: 'emp-1',
        limit: 3,
      }),
    )
  })

  it('shows direct reports when loaded', async () => {
    mockGetDirectReports.mockResolvedValueOnce([
      { employmentId: 'emp-2', fullName: 'Jane Doe', jobTitle: 'Engineer', avatarUrl: null },
    ])
    render(<SideRail profile={baseProfile} employmentId="emp-1" onViewAll={() => {}} />)
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy())
  })
})

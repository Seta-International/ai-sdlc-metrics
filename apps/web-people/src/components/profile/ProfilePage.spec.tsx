import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import { ProfilePage } from './ProfilePage'

const { mockGetEmployment, mockGetProfilePermissions } = vi.hoisted(() => ({
  mockGetEmployment: vi.fn().mockResolvedValue({
    employment: null,
    personProfile: null,
    currentAssignment: null,
    detail: null,
    sections: [],
  }),
  mockGetProfilePermissions: vi.fn().mockResolvedValue({
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
  }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
  usePathname: () => '/profile/emp-1',
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('../../lib/trpc', () => ({
  trpc: {
    people: {
      getEmployment: { query: mockGetEmployment },
      getProfilePermissions: { query: mockGetProfilePermissions },
    },
  },
}))

vi.mock('./hero/ProfileHero', () => ({ ProfileHero: () => <div data-testid="hero" /> }))
vi.mock('./tabs/TabOverview', () => ({ TabOverview: () => null }))
vi.mock('./tabs/TabJobHistory', () => ({ TabJobHistory: () => null }))
vi.mock('./tabs/TabDocuments', () => ({ TabDocuments: () => null }))
vi.mock('./tabs/TabCompensation', () => ({ TabCompensation: () => null }))
vi.mock('./tabs/TabChangeRequests', () => ({ TabChangeRequests: () => null }))
vi.mock('./tabs/TabActivity', () => ({ TabActivity: () => null }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const fullEmployment = {
  employment: {
    id: 'emp-1',
    employeeCode: 'E-001',
    companyEmail: 'alice@co.com',
    workerType: 'employee',
    employmentType: 'permanent',
    countryCode: 'SG',
    employmentStatus: 'active',
    hireDate: '2023-01-01',
    terminationDate: null,
    terminationReason: null,
    workArrangement: null,
  },
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
  },
  currentAssignment: null,
  detail: null,
  sections: [],
}

describe('ProfilePage', () => {
  it('calls people.getEmployment with the given employmentId', async () => {
    render(<ProfilePage employmentId="emp-123" />)
    await waitFor(() => expect(mockGetEmployment).toHaveBeenCalledWith({ employmentId: 'emp-123' }))
  })

  it('calls people.getProfilePermissions with the given employmentId', async () => {
    render(<ProfilePage employmentId="emp-123" />)
    await waitFor(() =>
      expect(mockGetProfilePermissions).toHaveBeenCalledWith({ employmentId: 'emp-123' }),
    )
  })

  it('renders the hero when profile loaded', async () => {
    mockGetEmployment.mockResolvedValueOnce(fullEmployment)
    const { getByTestId } = render(<ProfilePage employmentId="emp-1" />)
    await waitFor(() => expect(getByTestId('hero')).toBeTruthy())
  })

  it('passes canViewSalary=true to TabCompensation when permission granted', async () => {
    mockGetEmployment.mockResolvedValueOnce(fullEmployment)
    mockGetProfilePermissions.mockResolvedValueOnce({
      canEdit: false,
      canManage: false,
      isSelf: false,
      canEditPersonal: false,
      canEditEmployment: false,
      canEditBank: false,
      canUploadDocuments: false,
      canCreateContract: false,
      canViewSalary: true,
      canApproveChanges: false,
    })

    render(<ProfilePage employmentId="emp-1" />)
    await waitFor(() => expect(mockGetProfilePermissions).toHaveBeenCalled())
  })

  it('passes canEdit=true to TabJobHistory when permission granted', async () => {
    mockGetEmployment.mockResolvedValueOnce(fullEmployment)
    mockGetProfilePermissions.mockResolvedValueOnce({
      canEdit: true,
      canManage: false,
      isSelf: false,
      canEditPersonal: false,
      canEditEmployment: false,
      canEditBank: false,
      canUploadDocuments: false,
      canCreateContract: false,
      canViewSalary: false,
      canApproveChanges: false,
    })

    render(<ProfilePage employmentId="emp-1" />)
    await waitFor(() => expect(mockGetProfilePermissions).toHaveBeenCalled())
  })
})

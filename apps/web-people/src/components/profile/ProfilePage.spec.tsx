import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import { ProfilePage } from './ProfilePage'

const { mockGetEmployment } = vi.hoisted(() => ({
  mockGetEmployment: vi.fn().mockResolvedValue({
    employment: null,
    personProfile: null,
    currentAssignment: null,
    detail: null,
    sections: [],
  }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
  usePathname: () => '/profile/emp-1',
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('../../lib/trpc', () => ({
  trpc: { people: { getEmployment: { query: mockGetEmployment } } },
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

describe('ProfilePage', () => {
  it('calls people.getEmployment with the given employmentId', async () => {
    render(<ProfilePage employmentId="emp-123" />)
    await waitFor(() => expect(mockGetEmployment).toHaveBeenCalledWith({ employmentId: 'emp-123' }))
  })

  it('renders the hero when profile loaded', async () => {
    mockGetEmployment.mockResolvedValueOnce({
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
    })
    const { getByTestId } = render(<ProfilePage employmentId="emp-1" />)
    await waitFor(() => expect(getByTestId('hero')).toBeTruthy())
  })
})

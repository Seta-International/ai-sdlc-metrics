import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import EmployeeProfilePage from './page'

const { mockGetEmploymentQuery, mockLegacyProfileGetQuery } = vi.hoisted(() => ({
  mockGetEmploymentQuery: vi.fn().mockResolvedValue({
    employment: null,
    personProfile: null,
    currentAssignment: null,
    detail: null,
    sections: [],
  }),
  mockLegacyProfileGetQuery: vi.fn().mockResolvedValue({
    profile: null,
    permissions: {},
  }),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ employmentId: '01900000-0000-7000-8000-000000000010' }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
  usePathname: () => '/profile/01900000-0000-7000-8000-000000000010',
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    people: {
      getEmployment: { query: mockGetEmploymentQuery },
      profile: { get: { query: mockLegacyProfileGetQuery } },
    },
  },
}))

vi.mock('../../../components/profile/ProfileHeader', () => ({
  ProfileHeader: () => null,
}))

vi.mock('../../../components/profile/ProfileTabs', () => ({
  ProfileTabs: () => null,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('EmployeeProfilePage', () => {
  it('loads employee data via people.getEmployment', async () => {
    render(<EmployeeProfilePage />)

    await waitFor(() =>
      expect(mockGetEmploymentQuery).toHaveBeenCalledWith({
        employmentId: '01900000-0000-7000-8000-000000000010',
      }),
    )
    expect(mockLegacyProfileGetQuery).not.toHaveBeenCalled()
  })
})

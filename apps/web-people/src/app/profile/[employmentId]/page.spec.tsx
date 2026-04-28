import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import EmployeeProfilePage from './page'

vi.mock('next/navigation', () => ({
  useParams: () => ({ employmentId: 'emp-abc' }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
  usePathname: () => '/profile/emp-abc',
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('../../../lib/trpc', () => ({
  trpc: {
    people: { getEmployment: { query: vi.fn().mockResolvedValue(null) } },
  },
}))

vi.mock('../../../components/profile', () => ({
  ProfilePage: ({ employmentId }: { employmentId: string }) => (
    <div data-testid="profile-page">{employmentId}</div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('EmployeeProfilePage', () => {
  it('renders ProfilePage with the employmentId from route params', () => {
    const { getByTestId } = render(<EmployeeProfilePage />)
    expect(getByTestId('profile-page').textContent).toBe('emp-abc')
  })
})

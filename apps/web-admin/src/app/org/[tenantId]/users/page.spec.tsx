import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UsersPage from './page'

vi.mock('@/components/admin-page-header', () => ({
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

describe('<UsersPage />', () => {
  it('shows coming soon placeholder', () => {
    render(<UsersPage params={{ tenantId: 'test-tenant' }} />)
    expect(screen.getByText(/coming/i)).toBeInTheDocument()
  })
})

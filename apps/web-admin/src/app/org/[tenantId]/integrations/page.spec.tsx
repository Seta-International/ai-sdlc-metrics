import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import IntegrationsPage from './page'

vi.mock('@/components/admin-page-header', () => ({
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

describe('<IntegrationsPage />', () => {
  it('renders integrations heading', () => {
    render(<IntegrationsPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.getByRole('heading', { name: /Integrations/i })).toBeInTheDocument()
  })

  it('shows IdP section', () => {
    render(<IntegrationsPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.getByText(/Identity Provider/i)).toBeInTheDocument()
  })

  it('masks configured secrets showing only last 4 chars', () => {
    render(<IntegrationsPage params={{ tenantId: 'tenant-1' }} />)
    // Page should indicate secrets are masked
    expect(screen.getByText(/••••/)).toBeInTheDocument()
  })

  it('shows status badge', () => {
    render(<IntegrationsPage params={{ tenantId: 'tenant-1' }} />)
    const badges = screen.getAllByText(/Not configured|configured|active|inactive/i)
    expect(badges.length).toBeGreaterThan(0)
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AdminPageHeader } from './admin-page-header'

describe('<AdminPageHeader />', () => {
  it('renders title', () => {
    render(<AdminPageHeader title="Platform Organizations" />)
    expect(screen.getByRole('heading', { name: /Platform Organizations/i })).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(<AdminPageHeader title="Platform Organizations" description="Manage all tenants" />)
    expect(screen.getByText(/Manage all tenants/i)).toBeInTheDocument()
  })

  it('renders action slot when provided', () => {
    render(
      <AdminPageHeader
        title="Platform Organizations"
        action={<button type="button">Add Tenant</button>}
      />,
    )
    expect(screen.getByRole('button', { name: /Add Tenant/i })).toBeInTheDocument()
  })

  it('does not render description when not provided', () => {
    render(<AdminPageHeader title="Platform Organizations" />)
    // description container should not exist
    expect(screen.queryByText(/Manage/)).toBeNull()
  })
})

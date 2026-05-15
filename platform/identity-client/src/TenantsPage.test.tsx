import type { TenantSummary } from '@seta/agent-sdk'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TenantsPage } from './TenantsPage'

const t1: TenantSummary = { id: 't1', name: 'Acme Inc', role: 'admin' }
const t2: TenantSummary = { id: 't2', name: 'Beta Co', role: 'member' }

describe('TenantsPage', () => {
  it('renders a row per tenant using renderTenantLink', () => {
    render(
      <TenantsPage
        tenants={[t1, t2]}
        renderTenantLink={(t) => <a href={`/x/${t.id}`}>{t.name}</a>}
      />,
    )
    expect(screen.getByRole('link', { name: 'Acme Inc' })).toHaveAttribute('href', '/x/t1')
    expect(screen.getByRole('link', { name: 'Beta Co' })).toHaveAttribute('href', '/x/t2')
  })

  it('renders the EmptyState when tenants is empty', () => {
    render(<TenantsPage tenants={[]} renderTenantLink={() => null} />)
    expect(screen.getByText(/no tenants yet/i)).toBeInTheDocument()
  })
})

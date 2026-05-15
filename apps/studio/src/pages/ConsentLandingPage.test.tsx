import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConsentLandingPage } from './ConsentLandingPage'

describe('ConsentLandingPage', () => {
  it('renders the success badge with the connector id', () => {
    render(
      <ConsentLandingPage
        tenantId="t1"
        connectorId="ms365-planner"
        ok
        renderBackLink={({ tenantId }) => <a href={`/tenants/${tenantId}/connectors`}>Back</a>}
      />,
    )
    expect(screen.getByText('consented')).toBeInTheDocument()
    expect(screen.getByText('ms365-planner')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/tenants/t1/connectors',
    )
  })

  it('renders the failure badge with the error text', () => {
    render(
      <ConsentLandingPage
        tenantId="t1"
        connectorId="ms365-planner"
        ok={false}
        error="admin declined"
        renderBackLink={() => null}
      />,
    )
    expect(screen.getByText('failed')).toBeInTheDocument()
    expect(screen.getByText('admin declined')).toBeInTheDocument()
  })
})

import type { ConnectorSummary } from '@seta/agent-sdk'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConnectorsPage } from './ConnectorsPage'

const planner: ConnectorSummary = {
  id: 'ms365-planner',
  providerId: 'entra',
  displayName: 'Microsoft Planner',
  description: 'Sync Planner tasks.',
  customerFacingRationale: 'Required so the agent can read tasks.',
  requiredScopes: { delegated: ['Tasks.Read'], application: ['Tasks.Read.All'] },
  capabilities: { syncable: true, writes: false },
  status: 'pending',
  lastConsentedAt: null,
}

const directory: ConnectorSummary = {
  ...planner,
  id: 'ms365-directory',
  displayName: 'Microsoft Directory',
  status: 'consented',
  lastConsentedAt: '2026-05-15T10:00:00Z',
}

describe('ConnectorsPage', () => {
  it('renders a row per connector with the correct StatusBadge', () => {
    render(<ConnectorsPage connectors={[planner, directory]} onGrantConsent={() => {}} />)
    expect(screen.getByText('Microsoft Planner')).toBeInTheDocument()
    expect(screen.getByText('Microsoft Directory')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(screen.getByText('consented')).toBeInTheDocument()
  })

  it('invokes onGrantConsent with the row when the button is clicked', async () => {
    const onGrantConsent = vi.fn()
    render(<ConnectorsPage connectors={[planner]} onGrantConsent={onGrantConsent} />)
    const btn = screen.getByRole('button', { name: /grant consent/i })
    await userEvent.click(btn)
    expect(onGrantConsent).toHaveBeenCalledWith(planner)
  })

  it('shows EmptyState when no connectors', () => {
    render(<ConnectorsPage connectors={[]} onGrantConsent={() => {}} />)
    expect(screen.getByRole('heading', { name: /no connectors/i })).toBeInTheDocument()
  })
})

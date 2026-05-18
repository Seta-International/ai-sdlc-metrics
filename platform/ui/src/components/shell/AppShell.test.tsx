import { render, screen } from '@testing-library/react'
import { Play } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '../feedback/Tooltip'
import { AppShell } from './AppShell'

const nav = [{ id: 'r', label: 'Runs', icon: Play, to: '/runs' }]

describe('AppShell — with agent panel', () => {
  it('renders sidebar, topbar, main, and Bot toggle', () => {
    render(
      <TooltipProvider>
        <AppShell
          nav={nav}
          currentPath="/runs"
          agentContext={{ page: 'runs' }}
          tenants={[{ id: 't', name: 'Acme', role: 'admin' }]}
          currentTenantId="t"
          onTenantSelect={() => {}}
          appTiles={[{ id: 'studio', name: 'Studio', shortcut: 'S', available: true }]}
          activeAppId="studio"
          agentMessages={[]}
          onAgentSubmit={() => {}}
        >
          <main data-testid="main">page</main>
        </AppShell>
      </TooltipProvider>,
    )
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByTestId('main')).toHaveTextContent('page')
    expect(screen.getByRole('button', { name: /agent panel/i })).toBeInTheDocument()
  })
})

describe('AppShell — admin mode (no agentContext)', () => {
  it('omits AgentPanel column and Bot toggle when agentContext is not provided', () => {
    render(
      <TooltipProvider>
        <AppShell nav={nav} currentPath="/tenants">
          <main data-testid="main">page</main>
        </AppShell>
      </TooltipProvider>,
    )
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByTestId('main')).toHaveTextContent('page')
    expect(screen.queryByRole('region', { name: /agent panel/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /agent panel/i })).not.toBeInTheDocument()
  })

  it('omits TenantSwitcher when tenants are not provided', () => {
    render(
      <TooltipProvider>
        <AppShell nav={nav} currentPath="/tenants">
          <main>page</main>
        </AppShell>
      </TooltipProvider>,
    )
    expect(screen.queryByRole('button', { name: /switch tenant/i })).not.toBeInTheDocument()
  })

  it('omits AppSwitcher when appTiles are not provided', () => {
    render(
      <TooltipProvider>
        <AppShell nav={nav} currentPath="/tenants">
          <main>page</main>
        </AppShell>
      </TooltipProvider>,
    )
    expect(screen.queryByRole('button', { name: /switch app/i })).not.toBeInTheDocument()
  })
})

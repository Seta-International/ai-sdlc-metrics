import { render, screen } from '@testing-library/react'
import { Play } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '../feedback/Tooltip'
import { AppShell } from './AppShell'

const nav = [{ id: 'r', label: 'Runs', icon: Play, to: '/runs' }]

describe('AppShell', () => {
  it('renders sidebar, topbar, and main content', () => {
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
  })
})

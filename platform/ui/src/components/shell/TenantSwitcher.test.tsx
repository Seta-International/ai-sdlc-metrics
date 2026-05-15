import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../feedback/Tooltip'
import { TenantSwitcher } from './TenantSwitcher'

const tenants = [
  { id: 't1', name: 'Acme', role: 'admin' as const },
  { id: 't2', name: 'Globex', role: 'member' as const },
]

describe('TenantSwitcher', () => {
  it('shows current tenant name when expanded', () => {
    render(
      <TooltipProvider>
        <TenantSwitcher tenants={tenants} currentId="t1" onSelect={() => {}} collapsed={false} />
      </TooltipProvider>,
    )
    expect(screen.getByText('Acme')).toBeInTheDocument()
  })

  it('shows initials when collapsed', () => {
    render(
      <TooltipProvider>
        <TenantSwitcher tenants={tenants} currentId="t1" onSelect={() => {}} collapsed />
      </TooltipProvider>,
    )
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('emits onSelect when picking another tenant', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onSelect = vi.fn()
    render(
      <TooltipProvider>
        <TenantSwitcher tenants={tenants} currentId="t1" onSelect={onSelect} collapsed={false} />
      </TooltipProvider>,
    )
    await user.click(screen.getByText('Acme'))
    await user.click(await screen.findByText('Globex'))
    expect(onSelect).toHaveBeenCalledWith('t2')
  })
})

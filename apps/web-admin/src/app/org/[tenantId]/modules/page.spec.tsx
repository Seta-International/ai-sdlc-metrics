import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ModulesPage from './page'

vi.mock('@/components/admin-page-header', () => ({
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('@future/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/ui')>()
  return {
    ...actual,
    Switch: ({
      checked,
      onCheckedChange,
      'aria-label': ariaLabel,
    }: {
      checked: boolean
      onCheckedChange: (v: boolean) => void
      'aria-label'?: string
    }) => (
      <button
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        onClick={() => onCheckedChange(!checked)}
        data-testid="switch"
      />
    ),
  }
})

describe('<ModulesPage />', () => {
  it('renders modules heading', () => {
    render(<ModulesPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.getByRole('heading', { name: /Module Toggles/i })).toBeInTheDocument()
  })

  it('renders Switch components for each module', () => {
    render(<ModulesPage params={{ tenantId: 'tenant-1' }} />)
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBeGreaterThan(0)
  })

  it('lists known modules', () => {
    render(<ModulesPage params={{ tenantId: 'tenant-1' }} />)
    expect(screen.getByText(/People/i)).toBeInTheDocument()
    expect(screen.getByText(/Hiring/i)).toBeInTheDocument()
  })
})

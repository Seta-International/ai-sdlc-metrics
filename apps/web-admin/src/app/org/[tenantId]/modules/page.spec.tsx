import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ModulesPage from './page'
import { trpc } from '@/lib/trpc'

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

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      updateModuleToggles: {
        mutate: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}))

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

  it('calls updateModuleToggles mutation when a switch is toggled', async () => {
    const mutateMock = vi.fn().mockResolvedValue(undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(trpc.admin as any).updateModuleToggles.mutate = mutateMock

    render(<ModulesPage params={{ tenantId: 'tenant-1' }} />)

    const peopleSwitch = screen.getByRole('switch', { name: /Toggle People/i })
    await userEvent.click(peopleSwitch)

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        toggles: expect.arrayContaining([expect.objectContaining({ moduleKey: 'people' })]),
      }),
    )
  })
})

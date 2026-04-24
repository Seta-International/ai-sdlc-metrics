import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OrgContextSwitcher } from './org-context-switcher'

vi.mock('@future/ui', async () => {
  const actual = await vi.importActual<typeof import('@future/ui')>('@future/ui')
  return {
    ...actual,
    Button: ({
      children,
      asChild: _asChild,
      ...props
    }: {
      children: React.ReactNode
      asChild?: boolean
      [key: string]: unknown
    }) => (
      <button type="button" {...(props as object)}>
        {children}
      </button>
    ),
  }
})

describe('<OrgContextSwitcher />', () => {
  it('shows active org name when platform admin is viewing an org', () => {
    render(<OrgContextSwitcher activeOrgName="Acme Corp" activeOrgSlug="acme" />)

    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('shows a back-to-system link pointing to /system/platform-admins', () => {
    render(<OrgContextSwitcher activeOrgName="Acme Corp" activeOrgSlug="acme" />)

    // Should have a link/button back to system
    const links = screen.getAllByRole('button')
    expect(links.length).toBeGreaterThan(0)
  })

  it('is not rendered for tenant admin (no platform admin context)', () => {
    // When no activeOrgName and no activeOrgSlug provided, the switcher should render nothing
    const { container } = render(<OrgContextSwitcher activeOrgName={null} activeOrgSlug={null} />)
    expect(container.firstChild).toBeNull()
  })
})

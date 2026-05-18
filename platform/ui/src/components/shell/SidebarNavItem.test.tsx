import { render, screen } from '@testing-library/react'
import { Play } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '../feedback/Tooltip'
import { SidebarNavItem } from './SidebarNavItem'

describe('SidebarNavItem', () => {
  it('renders label and icon when expanded', () => {
    render(
      <TooltipProvider>
        <SidebarNavItem icon={Play} label="Runs" to="/runs" active={false} collapsed={false} />
      </TooltipProvider>,
    )
    expect(screen.getByText('Runs')).toBeInTheDocument()
  })

  it('applies active classes when active=true', () => {
    render(
      <TooltipProvider>
        <SidebarNavItem icon={Play} label="Runs" to="/runs" active collapsed={false} />
      </TooltipProvider>,
    )
    expect(screen.getByRole('link')).toHaveClass('bg-sidebar-surface-2')
    expect(screen.getByRole('link')).toHaveClass('text-primary-hover')
  })

  it('hides label when collapsed', () => {
    render(
      <TooltipProvider>
        <SidebarNavItem icon={Play} label="Runs" to="/runs" active={false} collapsed />
      </TooltipProvider>,
    )
    expect(screen.queryByText('Runs')).not.toBeInTheDocument()
  })
})

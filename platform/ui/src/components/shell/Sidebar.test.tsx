import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Play } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../feedback/Tooltip'
import { Sidebar } from './Sidebar'

const nav = [{ id: 'r', label: 'Runs', icon: Play, to: '/runs' }]

describe('Sidebar', () => {
  it('renders width 240 when expanded', () => {
    render(
      <TooltipProvider>
        <Sidebar nav={nav} currentPath="/runs" collapsed={false} onToggleCollapse={() => {}} />
      </TooltipProvider>,
    )
    expect(screen.getByRole('complementary')).toHaveClass('w-60')
  })

  it('renders width 56 when collapsed', () => {
    render(
      <TooltipProvider>
        <Sidebar nav={nav} currentPath="/runs" collapsed onToggleCollapse={() => {}} />
      </TooltipProvider>,
    )
    expect(screen.getByRole('complementary')).toHaveClass('w-14')
  })

  it('fires onToggleCollapse', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onToggle = vi.fn()
    render(
      <TooltipProvider>
        <Sidebar nav={nav} currentPath="/runs" collapsed={false} onToggleCollapse={onToggle} />
      </TooltipProvider>,
    )
    await user.click(screen.getByLabelText(/collapse/i))
    expect(onToggle).toHaveBeenCalled()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '../feedback/Tooltip'
import { AppSwitcher, type AppTile } from './AppSwitcher'

const tiles: AppTile[] = [
  { id: 'studio', name: 'Studio', shortcut: 'S', available: true, href: '/' },
  { id: 'timesheet', name: 'Timesheet', shortcut: 'T', available: false },
]

describe('AppSwitcher', () => {
  it('opens the tile grid', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(
      <TooltipProvider>
        <AppSwitcher tiles={tiles} activeId="studio" collapsed={false} />
      </TooltipProvider>,
    )
    await user.click(screen.getByLabelText('Apps'))
    expect(await screen.findByText('Studio')).toBeInTheDocument()
    expect(screen.getByText('Timesheet')).toBeInTheDocument()
  })

  it('marks inactive tiles as not interactive', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(
      <TooltipProvider>
        <AppSwitcher tiles={tiles} activeId="studio" collapsed={false} />
      </TooltipProvider>,
    )
    await user.click(screen.getByLabelText('Apps'))
    const tile = (await screen.findByText('Timesheet')).closest('div')
    expect(tile?.className).toMatch(/pointer-events-none/)
  })
})

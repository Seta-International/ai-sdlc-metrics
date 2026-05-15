import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Tooltip, TooltipProvider } from './Tooltip'

describe('Tooltip', () => {
  it('appears on hover', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Help" side="right">
          <button type="button">Trigger</button>
        </Tooltip>
      </TooltipProvider>,
    )
    await user.hover(screen.getByText('Trigger'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Help')
  })
})

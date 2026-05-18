import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('opens on trigger, closes on Escape', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(
      <Dialog.Root>
        <Dialog.Trigger>Open</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Title>Hello</Dialog.Title>
        </Dialog.Content>
      </Dialog.Root>,
    )
    await user.click(screen.getByText('Open'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

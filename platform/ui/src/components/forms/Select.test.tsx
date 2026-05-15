import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Select } from './Select'

// jsdom stubs required by Radix UI Select
beforeAll(() => {
  if (!window.HTMLElement.prototype.hasPointerCapture) {
    window.HTMLElement.prototype.hasPointerCapture = () => false
    window.HTMLElement.prototype.setPointerCapture = () => undefined
    window.HTMLElement.prototype.releasePointerCapture = () => undefined
  }
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => undefined
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

describe('Select', () => {
  it('opens, picks an item, calls onValueChange', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onChange = vi.fn()
    render(
      <Select.Root onValueChange={onChange}>
        <Select.Trigger aria-label="Tenant" placeholder="Pick" />
        <Select.Content>
          <Select.Item value="t1">Acme</Select.Item>
          <Select.Item value="t2">Globex</Select.Item>
        </Select.Content>
      </Select.Root>,
    )
    await user.click(screen.getByLabelText('Tenant'))
    await user.click(await screen.findByText('Globex'))
    expect(onChange).toHaveBeenCalledWith('t2')
  })
})
